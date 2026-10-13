import { expect, test } from "@playwright/test";

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
