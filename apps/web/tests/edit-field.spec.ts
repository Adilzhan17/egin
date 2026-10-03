import { test, expect } from "@playwright/test";

test("edit a saved polygon vertex, undo, persist revision and inspect history", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.request.post("/api/auth/login", {
    data: { email: "demo@egin.local", password: "EginDemo2026!" },
  });
  const farms = await (await page.request.get("/api/farms")).json();
  const ring = [
    [69.405, 52.405],
    [69.413, 52.405],
    [69.413, 52.411],
    [69.405, 52.411],
    [69.405, 52.405],
  ];
  const created = await page.request.post("/api/fields", {
    data: {
      name: "E2E vertex edit",
      farm_id: farms[0].id,
      geometry: { type: "Polygon", coordinates: [ring] },
    },
  });
  expect(created.ok()).toBeTruthy();
  const field = await created.json();
  try {
    await page.goto("/map");
    await page
      .locator(".field-list-item")
      .filter({ hasText: "E2E vertex edit" })
      .click();
    await page.getByRole("button", { name: "Редактировать контур" }).click();
    await expect(
      page.getByRole("button", { name: "Сохранить поле" }),
    ).toBeEnabled();
    await expect(page.locator(".map-loading")).toHaveCount(0);
    const canvas = page.locator(".maplibregl-canvas");
    await canvas.scrollIntoViewIfNeeded();
    await page.waitForTimeout(900);
    const box = (await canvas.boundingBox())!;
    const merc = (p: number[]) => [
      (p[0] + 180) / 360,
      (1 - Math.log(Math.tan(Math.PI / 4 + (p[1] * Math.PI) / 360)) / Math.PI) /
        2,
    ];
    const points = ring.map(merc),
      xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    const left = Math.min(...xs),
      right = Math.max(...xs),
      top = Math.min(...ys),
      bottom = Math.max(...ys);
    const scale = Math.min(
      (box.width - 160) / (right - left),
      (box.height - 160) / (bottom - top),
      512 * 2 ** 14,
    );
    const x = box.x + box.width / 2 + (left - (left + right) / 2) * scale,
      y = box.y + box.height / 2 + (top - (top + bottom) / 2) * scale;
    await page.getByRole("button", { name: "Вершины", exact: true }).click();
    await page.screenshot({path:"../../.runtime/edit-before.png"});
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 30, y + 20, { steps: 10 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Отменить действие" }).click();
    await page.getByRole("button", { name: "Вершины", exact: true }).click();
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 45, y + 25, { steps: 10 });
    await page.mouse.up();
    await page.getByRole("button", { name: "Сохранить поле" }).click();
    await expect(page.getByRole("status")).toContainText("сохранено");
    const updated = await (
      await page.request.get("/api/fields/" + field.id)
    ).json();
    expect(updated.revision).toBe(2);
    expect(updated.geometry).not.toEqual(field.geometry);
    await page.getByRole("link", { name: "Открыть профиль поля" }).click();
    await page.getByRole("button", { name: /Версия 1/ }).click();
    await expect(page.getByText(/Контур версии 1/)).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await page.request.delete("/api/fields/" + field.id);
  }
});
