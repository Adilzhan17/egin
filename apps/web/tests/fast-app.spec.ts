import { test, expect } from "@playwright/test";

test("compact home, one SSE across navigation, offline reload and idempotent notes", async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(new URL(request.url()).pathname);
  });
  expect(
    (
      await context.request.post("/api/auth/login", {
        data: { email: "demo@egin.local", password: "EginDemo2026!" },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Сәлем/ })).toBeVisible();
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(0);
  await expect
    .poll(() => requests.filter((path) => path === "/api/events").length)
    .toBe(1);
  expect(requests).not.toContain("/api/dashboard");
  expect(requests).not.toContain("/api/fields");
  expect(requests).not.toContain("/api/auth/me");
  const fieldLink = page.locator(".field-card").first();
  const fieldPath = await fieldLink.getAttribute("href");
  expect(fieldPath).toBeTruthy();
  await fieldLink.click();
  await expect(
    page.getByRole("heading", { name: "Заметки поля" }),
  ).toBeVisible();
  await expect(page.getByLabel("Заметка поля")).toBeVisible();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.waitForFunction(async () =>
    (await caches.keys()).some((name) => name.startsWith("egin-shell-")),
  );
  await context.setOffline(true);
  const note = "Офлайн наблюдение " + Date.now();
  await page.getByLabel("Заметка поля").fill(note);
  await page
    .getByRole("button", { name: "Добавить заметку", exact: true })
    .click();
  await expect(
    page.locator(".pending-note").filter({ hasText: note }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator(".connection-banner")).toContainText("Нет сети");
  await expect(
    page.locator(".pending-note").filter({ hasText: note }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(
    page.locator(".field-note").filter({ hasText: note }),
  ).toBeVisible();
  await expect(
    page.locator(".pending-note").filter({ hasText: note }),
  ).toHaveCount(0);
  const notes = await (
    await context.request.get("/api" + fieldPath + "/notes")
  ).json();
  expect(
    notes.filter((item: { body: string }) => item.body === note),
  ).toHaveLength(1);
  const beforeNavigation = requests.filter(
    (path) => path === "/api/events",
  ).length;
  await page
    .locator(".sidebar")
    .getByRole("link", { name: "Агрорынок" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Рынок для своих" }),
  ).toBeVisible();
  await page
    .locator(".sidebar")
    .getByRole("link", { name: /Обзор хозяйства/ })
    .click();
  await expect(page.getByRole("heading", { name: /Сәлем/ })).toBeVisible();
  expect(requests.filter((path) => path === "/api/events").length).toBe(
    beforeNavigation,
  );
  expect(errors).toEqual([]);
});

test("mobile layouts 360/375/390/430 and offline listing draft", async ({
  page,
  context,
}) => {
  test.setTimeout(180000);
  expect(
    (
      await context.request.post("/api/auth/login", {
        data: { email: "demo@egin.local", password: "EginDemo2026!" },
      })
    ).ok(),
  ).toBeTruthy();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [360, 375, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of [
      "/",
      "/assistant",
      "/community",
      "/market",
      "/settings",
    ]) {
      await page.goto(route);
      await expect(page.locator(".app-shell")).toBeVisible();
      await expect(page.locator(".main-content h1").first()).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBeTruthy();
      await page.screenshot({
        path: `../../.runtime/fast-${width}-${route.replaceAll("/", "") || "home"}.png`,
        fullPage: false,
      });
    }
  }
  await page.goto("/market/new");
  const title = "Черновик " + Date.now();
  await page.getByLabel("Название", { exact: true }).fill(title);
  await expect(page.getByRole("status")).toContainText("черновика сохранён");
  await page.reload();
  await expect(page.getByLabel("Название", { exact: true })).toHaveValue(title);
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "С возвращением" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("egin-offline-account")),
  ).toBeNull();
  expect(errors).toEqual([]);
});
