import { expect, test, type APIRequestContext, type Page, type Request } from "@playwright/test";

// Saving the learner's place: on pause, at the end of the video, and when leaving the
// lesson. These tests finish lessons, which cannot be undone, so they run on the dev
// server (port 3101), whose in-memory store is not the one the screenshots are taken on.
const ORIGIN = "http://localhost:3101";
const HEARTBEAT = "/api/telemetry/heartbeat";

type Beacon = { url: string; body: string; queued: boolean };
declare global {
  interface Window {
    beacons: Beacon[];
  }
}

// Every heartbeat request the page makes, beacons included.
function recordHeartbeats(page: Page) {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === HEARTBEAT) requests.push(request);
  });
  return requests;
}

// Each test starts from the beginning of its lesson, also when it is repeated or retried.
async function resetStopPoint(request: APIRequestContext, lessonId: string) {
  const reset = await request.post(HEARTBEAT, { headers: { origin: ORIGIN }, data: { lessonId, positionSec: 0 } });
  expect(reset.status()).toBe(204);
}

async function openLesson(page: Page, lessonId: string) {
  await resetStopPoint(page.request, lessonId);
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
  // Records each beacon and whether the browser queued it.
  await page.addInitScript(() => {
    const send = navigator.sendBeacon.bind(navigator);
    window.beacons = [];
    navigator.sendBeacon = (url, data) => {
      const queued = send(url, data);
      window.beacons.push({ url: String(url), body: String(data), queued });
      return queued;
    };
  });
  await page.goto(`/en/lessons/${lessonId}`);
  await expect(timeline(page)).not.toHaveAttribute("max", "0", { timeout: 60_000 });
}

const timeline = (page: Page) => page.getByRole("slider", { name: "Position in the lesson" });
const forward = (page: Page) => page.getByRole("button", { name: "10 seconds forward" });
const beacons = (page: Page) => page.evaluate(() => window.beacons.map((beacon) => ({ ...beacon, body: JSON.parse(beacon.body) })));
const heartbeatDone = (page: Page) => page.waitForResponse((response) => new URL(response.url()).pathname === HEARTBEAT);

// What a phone does when the learner switches apps or locks the screen.
const hidePage = (page: Page) =>
  page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });

// The stop point the server has, as the player shows it when the lesson is opened again.
async function storedStopPoint(page: Page, lessonId: string) {
  await page.goto(`/en/lessons/${lessonId}`);
  await expect(timeline(page)).not.toHaveAttribute("max", "0", { timeout: 60_000 });
  return timeline(page).inputValue();
}

test("pause saves once, and hiding the page right after sends nothing more", async ({ page }) => {
  const sent = recordHeartbeats(page);
  await openLesson(page, "prayer-1");
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(2);

  const saved = heartbeatDone(page);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  expect((await saved).status()).toBe(204);
  await hidePage(page);

  expect(sent).toHaveLength(1);
  const body = JSON.parse(sent[0].postData() ?? "{}");
  expect(body).toEqual({ lessonId: "prayer-1", positionSec: expect.any(Number) });
  expect(body.positionSec).toBeGreaterThanOrEqual(2);
  expect(await beacons(page)).toEqual([]);
});

test("hiding the page sends a beacon that passes the same-origin check and is stored", async ({ page }) => {
  await openLesson(page, "prayer-2");
  await forward(page).click();
  await forward(page).click();
  await expect(timeline(page)).toHaveValue("20");

  const saved = heartbeatDone(page);
  await hidePage(page);
  const response = await saved;
  expect(await beacons(page)).toEqual([
    { url: HEARTBEAT, body: { lessonId: "prayer-2", positionSec: 20 }, queued: true },
  ]);
  // The proxy answers 403 to a request it does not take as same-origin.
  expect((await response.request().allHeaders())["sec-fetch-site"]).toBe("same-origin");
  expect(response.status()).toBe(204);

  expect(await storedStopPoint(page, "prayer-2")).toBe("20");
});

test("leaving through a link inside the app saves the place", async ({ page }) => {
  await openLesson(page, "prayer-4");
  for (let i = 0; i < 3; i++) await forward(page).click();
  await expect(timeline(page)).toHaveValue("30");

  const saved = heartbeatDone(page);
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Home" }).click();
  await expect(page).toHaveURL(/\/en$/);
  expect((await saved).status()).toBe(204);
  expect((await beacons(page)).map((beacon) => [beacon.body.positionSec, beacon.queued])).toEqual([[30, true]]);

  expect(await storedStopPoint(page, "prayer-4")).toBe("30");
});

test("the end of the video finishes the lesson, even though the stored length is longer", async ({ page }) => {
  const sent = recordHeartbeats(page);
  await openLesson(page, "prayer-3");
  // The fake clip is 60 s; the lesson says 30 minutes, so only "ended" can finish it.
  await page.locator("video").evaluate((video: HTMLVideoElement) => (video.currentTime = video.duration - 2));
  const ended = page.waitForResponse(
    (response) => new URL(response.url()).pathname === HEARTBEAT && response.request().postDataJSON()?.ended === true,
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  expect((await ended).status()).toBe(204);
  expect(sent.map((request) => request.postDataJSON().ended ?? false)).toContain(true);

  // On a wide screen the path list shows the short form of "In progress · 1 of 10 lessons".
  await page.goto("/en/path");
  const prayer = page.getByRole("listitem").filter({ hasText: "Prayer and blessings" });
  await expect(prayer.getByText("1 of 10 lessons", { exact: true })).toBeVisible();
});

test("Back waits at most a moment for the save, then goes to the lesson's step anyway", async ({ page }) => {
  await openLesson(page, "prayer-5");
  await forward(page).click();
  await expect(timeline(page)).toHaveValue("10");
  // A save that takes far longer than Back is willing to wait.
  await page.route(`**${HEARTBEAT}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.continue().catch(() => {});
  });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/path\/prayer$/, { timeout: 4000 });
});
