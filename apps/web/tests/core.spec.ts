import { test, expect } from "@playwright/test";
const email = "demo@egin.local",
  password = "EginDemo2026!";
async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email или телефон", { exact: true }).fill(email);
  await page.getByLabel("Пароль", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Войти в EGIN" }).click();
  await expect(page.getByRole("heading", { name: /Сәлем/ })).toBeVisible();
}
test("desktop: login, real map, field analysis, assistant, market, chat persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  await page.screenshot({
    path: "../../.runtime/dashboard-desktop.png",
    fullPage: true,
  });
  await page.goto("/map");
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Мои поля", exact: true }),
  ).toBeVisible();
  await page.locator(".field-list-item").first().click();
  await page.getByRole("link", { name: "Открыть профиль поля" }).click();
  await expect(page.getByText("ПЛОЩАДЬ ПО POSTGIS")).toBeVisible();
  await page
    .getByRole("button", { name: "Проанализировать поле", exact: true })
    .click();
  await expect(
    page.getByText("Демонстрационная ML-модель", { exact: true }),
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator(".recommendations")).toBeVisible();
  await page.screenshot({
    path: "../../.runtime/field-desktop.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Обсудить поле с помощником" }).click();
  await page.getByRole("button", { name: "Погода на неделю", exact: true }).click();
  await expect(page.locator(".assistant-response").last()).toContainText("Погода поля", {
    timeout: 60000,
  });
  await page.goto("/market/new");
  await page
    .getByRole("combobox", { name: "Регион", exact: true })
    .selectOption({ index: 1 });
  const title = "E2E объявление " + Date.now();
  await page.getByLabel("Название", { exact: true }).fill(title);
  await page
    .getByLabel("Описание", { exact: true })
    .fill("Тестовое объявление для проверки локального CRUD.");
  await page.getByLabel("Стоимость", { exact: true }).fill("12000");
  await page.getByRole("button", { name: "Опубликовать объявление" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const listingId = page.url().split("/").at(-1);
  await page.request.delete("/api/listings/" + listingId);
  await page.goto("/community");
  await page.locator(".conversation").first().click();
  await expect(
    page.getByText("Подключено · сообщения сохраняются"),
  ).toBeVisible();
  const message = "E2E сообщение " + Date.now();
  await page.getByLabel("Сообщение", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(
    page.locator(".message").filter({ hasText: message }),
  ).toBeVisible();
  await page.reload();
  await page.locator(".conversation").first().click();
  await expect(
    page.locator(".message").filter({ hasText: message }),
  ).toBeVisible();
  await page.goto("/news");
  await expect(
    page.getByRole("heading", { name: "Лента хозяйства", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile: registration, onboarding, draw and persist polygon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/register");
  const id = Date.now();
  await page.getByLabel("Ваше имя", { exact: true }).fill("Фермер E2E");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`e2e-${id}@example.test`);
  await page.getByLabel("Пароль", { exact: true }).fill("E2EPassword2026!");
  await page
    .getByRole("button", { name: "Создать аккаунт", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Дайте земле имя" }),
  ).toBeVisible();
  await page
    .getByLabel("Название хозяйства", { exact: true })
    .fill("Хозяйство E2E");
  await page
    .getByRole("combobox", { name: "Область", exact: true })
    .selectOption({ label: "Акмолинская область" });
  await page.getByRole("button", { name: "Далее — нарисовать поле" }).click();
  await expect(
    page.getByRole("heading", { name: "Карта полей" }),
  ).toBeVisible();
  // Jump to a known farming location through the actual Nominatim-backed search.
  await page.getByLabel("Поиск места").fill("Шортанды");
  await page.getByRole("button", { name: "Найти место" }).click();
  await expect(page.locator(".map-results button").first()).toBeVisible({
    timeout: 30000,
  });
  await page.locator(".map-results button").first().click();
  await page
    .getByRole("button", { name: "Добавить поле", exact: true })
    .first().click();
  await expect(page.locator(".map-loading")).toHaveCount(0);
  const canvas = page.locator(".maplibregl-canvas");
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(2000); // Geocoder fly-to and smooth page scroll must finish before pointer coordinates.
  const b = await canvas.boundingBox();
  if (!b) throw Error("Map missing");
  for (const [x, y] of [
    [0.28, 0.33],
    [0.63, 0.34],
    [0.62, 0.6],
    [0.28, 0.6],
    [0.28, 0.33],
  ]) {
    await page.mouse.click(b.x + b.width * x, b.y + b.height * y);
    await page.waitForTimeout(160);
  }
  await page.getByLabel("Название поля", { exact: true }).fill("Поле E2E");
  await expect(
    page.getByRole("button", { name: "Сохранить поле", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Сохранить поле", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("сохранено");
  await page.getByRole("link", { name: "Открыть профиль поля" }).click();
  await expect(
    page.getByText("Версия 1", { exact: true }).first(),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Поле E2E", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../.runtime/field-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});
