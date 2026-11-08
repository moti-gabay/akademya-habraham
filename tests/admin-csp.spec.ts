import { expect, test } from "@playwright/test";
import { watchCsp } from "./cspViolations";

// The admin screens under the report-only policy, on the dev server (port 3101, with
// MOCK_ROLE=admin): the video goes up over tus and the image by a presigned PUT, both to
// the fake services. Nothing may violate the policy.
const ORIGIN = "http://localhost:3101";

test("admin screens and media uploads run with no policy violation", async ({ page }) => {
  const csp = await watchCsp(page);
  await page.context().addCookies([{ name: "ah_text_size", value: "m", url: ORIGIN }]);
  for (const path of ["/en/admin", "/en/admin/lessons", "/en/admin/teachers", "/he/admin/tracks/learning-path"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await csp.flush();
  }

  const slug = `csp-${Date.now()}`;
  await page.goto("/en/admin/lessons/new");
  await page.getByLabel("Title").fill(`Policy check ${slug}`);
  await page.getByLabel("Address name").fill(slug);
  await page.getByRole("button", { name: "Create" }).click();
  // The dev server compiles the create route on its first use, from cold.
  await expect(page).toHaveURL(/\/en\/admin\/lessons\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  const id = page.url().split("/").pop()!;
  try {
    const media = page.getByRole("region", { name: "Video, captions and image" });
    await media.getByLabel("Upload a video").setInputFiles({ name: "lesson.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(2048, 1) });
    await expect(media.getByText(/^Ready · /)).toBeVisible({ timeout: 60_000 });
    await media.getByRole("listitem").filter({ hasText: "עברית" }).getByLabel("Upload: עברית").setInputFiles({
      name: "he.vtt",
      mimeType: "text/vtt",
      buffer: Buffer.from("WEBVTT\n\n00:00.000 --> 00:05.000\nשלום\n"),
    });
    await expect(media.getByText("Sent to the video")).toBeVisible({ timeout: 60_000 });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await media.getByLabel("Upload an image").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: png });
    await expect(media.getByText("Uploaded image")).toBeVisible({ timeout: 60_000 });
    expect(await csp.flush()).toEqual([]);
  } finally {
    // The lesson was never published; remove the draft.
    await page.request.delete(`/api/admin/catalog/lessons/${id}`, { headers: { origin: ORIGIN } });
  }
});
