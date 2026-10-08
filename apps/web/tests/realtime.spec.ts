import { test, expect } from "@playwright/test";

test("shared SSE delivers a durable message between independent signed-in browsers", async ({
  browser,
}) => {
  const sender = await browser.newContext();
  const receiver = await browser.newContext();
  for (const [context, email] of [
    [sender, "demo@egin.local"],
    [receiver, "aliya@egin.local"],
  ] as const) {
    const r = await context.request.post("/api/auth/login", {
      data: { email, password: "EginDemo2026!" },
    });
    expect(r.ok()).toBeTruthy();
  }
  const a = await sender.newPage(),
    b = await receiver.newPage();
  const rooms = await (await sender.request.get("/api/conversations")).json();
  const group = rooms.find((r: { kind: string }) => r.kind === "group");
  expect(group).toBeTruthy();
  await Promise.all([
    a.goto("/community?chat=" + group.id),
    b.goto("/community?chat=" + group.id),
  ]);
  await expect(b.getByLabel("Сообщение", { exact: true })).toBeVisible();
  await expect(b.locator(".chat-room-head small")).not.toContainText(
    "Восстанавливаем",
  );
  const body = "E2E realtime " + Date.now();
  await a.getByLabel("Сообщение", { exact: true }).fill(body);
  await a.getByRole("button", { name: "Отправить сообщение" }).click();
  await expect(b.locator(".message").filter({ hasText: body })).toBeVisible();
  await b.reload();
  await expect(b.locator(".message").filter({ hasText: body })).toBeVisible();
  await sender.close();
  await receiver.close();
});
