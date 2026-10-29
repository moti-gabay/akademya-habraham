import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// Runs on the dev server, where MOCK_ROLE=admin makes the sample visitor an admin.
const ORIGIN = "http://localhost:3101";
const own = { origin: ORIGIN };

test("the catalog API takes changes only from our own pages, and validates them", async ({ request }) => {
  const teacher = { translations: { he: { name: "הרב בדיקה" } } };
  expect((await request.post("/api/admin/catalog/teachers", { data: teacher })).status()).toBe(403);
  expect((await request.post("/api/admin/catalog/teachers", { headers: own, data: {} })).status()).toBe(400);
  expect((await request.post("/api/admin/catalog/nothing", { headers: own, data: teacher })).status()).toBe(404);
  expect((await request.post("/api/admin/catalog/teachers/x/publish", { headers: own })).status()).toBe(404);

  const created = await request.post("/api/admin/catalog/teachers", { headers: own, data: teacher });
  expect(created.status()).toBe(200);
  const { id } = await created.json();
  expect((await request.delete(`/api/admin/catalog/teachers/${id}`, { headers: own })).status()).toBe(200);
  expect((await request.delete(`/api/admin/catalog/teachers/${id}`, { headers: own })).status()).toBe(404);
});

// Gives a lesson a finished video through the fake provider: start, send a few bytes,
// wait for the fake "encoding".
async function uploadVideo(request: APIRequestContext, lessonId: string) {
  const media = `/api/admin/media/lessons/${lessonId}/video`;
  const { upload } = await (await request.post(media, { headers: own })).json();
  expect((await request.put(upload.url, { headers: own, data: Buffer.from("not really a video") })).status()).toBe(204);
  await expect.poll(async () => (await (await request.get(media)).json()).media.video.status, { timeout: 15_000 }).toBe("ready");
}

async function withPrefs(page: Page) {
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
}

test("the media API uploads a video and a thumbnail through the fake services", async ({ request }) => {
  const lesson = {
    categoryId: null,
    teacherId: null,
    durationSec: null,
    access: "members",
    translations: { he: { title: "שיעור מדיה", description: null, keyPoints: [], slug: `media-${Date.now()}` } },
  };
  const { id } = await (await request.post("/api/admin/catalog/lessons", { headers: own, data: lesson })).json();
  const media = `/api/admin/media/lessons/${id}`;

  // Writes need our own origin, like every other API.
  expect((await request.post(`${media}/video`)).status()).toBe(403);
  expect((await request.post(`/api/admin/catalog/lessons/${id}/publish`, { headers: own })).status()).toBe(409);
  // A draft cannot be played, whoever asks.
  const play = () => request.post("/api/play", { headers: own, data: { lessonId: id } });
  expect((await play()).status()).toBe(404);
  await uploadVideo(request, id);
  expect((await play()).status()).toBe(404);
  const { media: state } = await (await request.get(`${media}/video`)).json();
  expect(state.video.videoId).toMatch(/^fake-/);
  expect(state.video.durationSec).toBe(634);

  // Thumbnail: ask where to send it, send it, confirm.
  expect((await request.post(`${media}/thumbnail`, { headers: own, data: { contentType: "text/html" } })).status()).toBe(400);
  const started = await (await request.post(`${media}/thumbnail`, { headers: own, data: { contentType: "image/png" } })).json();
  expect((await request.put(`${media}/thumbnail`, { headers: own, data: { key: started.key } })).status()).toBe(400);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  expect((await request.put(started.upload.url, { headers: { ...own, "content-type": "image/png" }, data: png })).status()).toBe(204);
  expect((await request.put(`${media}/thumbnail`, { headers: own, data: { key: started.key } })).status()).toBe(200);
  const served = await request.get(started.upload.url);
  expect([served.status(), served.headers()["content-type"], served.headers()["x-content-type-options"]]).toEqual([200, "image/png", "nosniff"]);

  // The stand-in bucket holds thumbnails only: nothing else can be put there or read from it.
  expect((await request.put(`/api/dev/media/files/captions/${id}/he.vtt`, { headers: own, data: "WEBVTT" })).status()).toBe(404);
  expect((await request.put("/api/dev/media/video/fake-unknown", { headers: own, data: "x" })).status()).toBe(404);

  // Captions are served by the app, with the right type, and only for a published lesson.
  const vtt = "WEBVTT\n\n00:00.000 --> 00:02.000\nשלום\n";
  expect((await request.put(`${media}/captions/he`, { headers: own, data: "1\n00:00 --> 00:02\nnot vtt" })).status()).toBe(400);
  const saved = await request.put(`${media}/captions/he`, { headers: own, data: vtt });
  expect([saved.status(), (await saved.json()).synced]).toEqual([200, true]);
  expect((await request.get(`/api/captions/${id}/he`)).status()).toBe(404);
  expect((await request.post(`/api/admin/catalog/lessons/${id}/publish`, { headers: own })).status()).toBe(200);
  expect((await play()).status()).toBe(200);
  const caption = await request.get(`/api/captions/${id}/he`);
  expect([caption.status(), await caption.text()]).toEqual([200, vtt]);
  expect(caption.headers()).toMatchObject({
    "content-type": "text/vtt; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "private, no-store",
  });
  expect((await request.get(`/api/captions/${id}/en`)).status()).toBe(404);
  expect((await request.get(`/api/captions/${id}/xx`)).status()).toBe(404);
  expect((await request.get("/api/captions/shabbat-6/he")).status()).toBe(404);
  expect((await request.post(`/api/admin/catalog/lessons/${id}/unpublish`, { headers: own })).status()).toBe(200);
  expect((await play()).status()).toBe(404);

  // Deleting the lesson takes its media with it.
  expect((await request.delete(`/api/admin/catalog/lessons/${id}`, { headers: own })).status()).toBe(200);
  expect((await request.get(started.upload.url)).status()).toBe(404);
  expect((await request.get(`${media}/video`)).status()).toBe(404);
});

test("an admin uploads a video, captions and an image, and viewers get them", async ({ page }) => {
  await withPrefs(page);
  const slug = `media-ui-${Date.now()}`;
  await page.goto("/en/admin/lessons/new");
  await page.getByLabel("Title").fill(`Media lesson ${slug}`);
  await page.getByLabel("Address name").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/lessons\/[0-9a-f-]{36}$/);
  const id = page.url().split("/").pop()!;
  const media = page.getByRole("region", { name: "Video, captions and image" });

  // It is plain to see that nothing real is connected.
  await expect(page.getByRole("note")).toContainText("Fake media");
  await expect(media.getByText("No video yet.")).toBeVisible();

  // Without a finished video the lesson cannot be published, and the reason is given.
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Upload a video and wait until it is ready");

  await media.getByLabel("Upload a video").setInputFiles({ name: "lesson.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(2048, 1) });
  await expect(media.getByText("Processing. This can take a few minutes.")).toBeVisible();
  await expect(media.getByText("Ready · 11 min")).toBeVisible({ timeout: 10_000 });
  await expect(media.getByText("Image from the video")).toBeVisible();

  // Captions: a file that is not WebVTT is refused; a real one reaches the video.
  const hebrew = media.getByRole("listitem").filter({ hasText: "עברית" });
  await hebrew.getByLabel("Upload: עברית").setInputFiles({ name: "he.vtt", mimeType: "text/vtt", buffer: Buffer.from("1\n00:00 --> 00:02\nsrt") });
  await expect(media.getByRole("alert")).toContainText("not a valid WebVTT file");
  await hebrew.getByLabel("Upload: עברית").setInputFiles({
    name: "he.vtt",
    mimeType: "text/vtt",
    buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:05.000\nשלום וברכה\n"),
  });
  await expect(hebrew.getByText("Sent to the video")).toBeVisible();
  await expect(media.getByRole("listitem").filter({ hasText: "English" }).getByText("No captions")).toBeVisible();

  // The image: an upload replaces the video's own, and can be taken back.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await media.getByLabel("Upload an image").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
  await expect(media.getByText("Uploaded image")).toBeVisible();

  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Status: Published")).toBeVisible();

  // The player offers the uploaded caption, served by the app, instead of the samples.
  await page.goto(`/he/lessons/${id}`);
  await expect(page.getByLabel("כתוביות").getByRole("option")).toHaveText(["עברית", "בלי כתוביות"]);
  await expect(page.locator("track")).toHaveAttribute("src", `/api/captions/${id}/he`);
  await page.goto(`/en/lessons/${id}`);
  await expect(page.getByLabel("Subtitles")).toHaveValue("off");

  // Once it is the lesson being watched, the home card shows its image.
  await page.request.post("/api/telemetry/heartbeat", { headers: own, data: { lessonId: id, positionSec: 5 } });
  await page.goto("/en");
  const cardImage = page.locator(`a[href="/en/lessons/${id}"][aria-hidden]`);
  await expect(cardImage).toHaveCSS("background-image", new RegExp(`/api/dev/media/files/thumbnails/${id}/`));

  await page.goto(`/en/admin/lessons/${id}`);
  await media.getByRole("button", { name: "Use the video's image" }).click();
  await expect(media.getByText("Image from the video")).toBeVisible();
  await page.goto("/en");
  await expect(cardImage).toHaveCSS("background-image", /samples\/thumbnail\.svg/);

  // Tidy up: the sample lesson is the one being watched again, and this one is gone.
  await page.request.post("/api/telemetry/heartbeat", { headers: own, data: { lessonId: "shabbat-6", positionSec: 760 } });
  await page.request.post(`/api/admin/catalog/lessons/${id}/unpublish`, { headers: own });
});

test("a teacher is created in Hebrew, translated, and deleted", async ({ page }) => {
  await withPrefs(page);
  const name = `הרב בדיקה ${Date.now()}`;
  await page.goto("/en/admin/teachers");
  await page.getByRole("link", { name: "New teacher" }).click();

  // Hebrew is required.
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Not saved. Check the marked fields.");
  await expect(page.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/teachers\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // The tabs follow the keyboard, and a language without a translation says so.
  await page.getByRole("tab", { name: /עברית/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "English: not translated" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Readers of this language see the Hebrew text.")).toBeVisible();
  await page.getByRole("button", { name: "Add a translation" }).click();
  await page.getByLabel("Name").fill("Rav Test");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rav Test");

  await page.goto("/en/admin/teachers");
  const row = page.getByRole("listitem").filter({ hasText: "Rav Test" });
  await expect(row.getByText("English: translated")).toBeAttached();
  await expect(row.getByText("Русский: not translated")).toBeAttached();

  await row.getByRole("link", { name: "Rav Test" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/en\/admin\/teachers$/);
  await expect(page.getByText("Rav Test")).toHaveCount(0);
});

test("deleting a teacher who still has lessons is refused with an explanation", async ({ page }) => {
  await withPrefs(page);
  await page.goto("/en/admin/teachers");
  await page.getByRole("link", { name: "Rav Avraham" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("Move or unpublish them first.");
});

test("a lesson appears on the public holiday page when published and leaves it when unpublished", async ({ page }) => {
  await withPrefs(page);
  const slug = `megillah-reading-${Date.now()}`;
  const title = `קריאת המגילה ${slug}`;
  const listed = async () => {
    await page.goto("/he/holidays/purim");
    return page.getByRole("link", { name: title }).count();
  };

  await page.goto("/he/admin/lessons/new");
  await page.getByLabel("קטגוריה").selectOption({ label: "פורים" });
  await page.getByLabel("מי יכול לצפות").selectOption("free");
  await page.getByLabel("כותרת").fill(title);
  await page.getByLabel("תיאור קצר").fill("מתי קוראים ואיך מקשיבים");
  await page.getByLabel("נקודות עיקריות").fill("קוראים פעמיים\nבלילה וביום");
  await page.getByLabel("שם בכתובת").fill(slug);
  await page.getByRole("button", { name: "יצירה" }).click();
  await expect(page).toHaveURL(/\/he\/admin\/lessons\/[0-9a-f-]{36}$/);
  const editUrl = page.url();
  await expect(page.getByText("מצב: טיוטה")).toBeVisible();

  // A draft is not public.
  expect(await listed()).toBe(0);

  // Publishing needs a finished video.
  await page.goto(editUrl);
  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toBeVisible();
  await expect(page.getByText("מצב: טיוטה")).toBeVisible();
  await uploadVideo(page.request, editUrl.split("/").pop()!);

  await page.getByRole("button", { name: "פרסום", exact: true }).click();
  await expect(page.getByText("מצב: מפורסם")).toBeVisible();
  // The cached page is refreshed in the background, so the first visit may still be the old one.
  await expect.poll(listed).toBe(1);

  // Only Hebrew exists, so the English preview shows the Hebrew text.
  await page.goto(`/en/holidays/purim/${slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByText("Free lesson")).toBeVisible();
  await expect(page.getByRole("main").getByRole("listitem")).toHaveText(["קוראים פעמיים", "בלילה וביום"]);

  // A published lesson cannot be deleted; unpublished, it leaves the public page and can be.
  await page.goto(editUrl);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("אפשר למחוק רק טיוטות");
  await page.getByRole("button", { name: "ביטול פרסום" }).click();
  await expect(page.getByText("מצב: טיוטה")).toBeVisible();
  await expect.poll(listed).toBe(0);

  await page.goto(editUrl);
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page).toHaveURL(/\/he\/admin\/lessons$/);
});

for (const locale of ["he", "en"] as const) {
  for (const [name, path] of [
    ["overview", ""],
    ["lessons", "/lessons"],
    ["lesson", "/lessons/hanukkah-intro"],
    ["path", "/tracks/learning-path"],
    ["step", "/tracks/learning-path/steps/shabbat"],
    ["new category", "/categories/new"],
  ] as const) {
    test(`admin ${name} (${locale}): accessible, and fits a phone at the largest text size`, async ({ page }) => {
      await withPrefs(page);
      await page.goto(`/${locale}/admin${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(axe.violations.map((violation) => `${violation.id}: ${violation.nodes[0]?.html}`)).toEqual([]);

      await page.setViewportSize({ width: 375, height: 812 });
      await page.evaluate(() => (document.documentElement.dataset.textSize = "l"));
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}
