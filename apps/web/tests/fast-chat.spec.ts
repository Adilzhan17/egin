import { test, expect, type Page } from "@playwright/test";
import { writeFile, rename } from "node:fs/promises";

type ChatMessage = {
  id: number;
  client_id: string;
  body: string;
  version: number;
};
const bubble = (page: Page, id: number) =>
  page.locator(`.message[data-message-id="${id}"]`);
async function send(page: Page, room: string, body: string) {
  await page.getByLabel("Сообщение", { exact: true }).fill(body);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/conversations/${room}/messages`) &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Отправить сообщение", exact: true })
    .click();
  const sent = await response;
  expect(sent.ok(), await sent.text()).toBeTruthy();
  return (await sent.json()) as ChatMessage;
}
async function menu(page: Page, message: ChatMessage) {
  await bubble(page, message.id)
    .getByRole("button", { name: `Действия с сообщением ${message.id}` })
    .click();
}

test("shared SSE chat: delivery, typing, read, reply, edit, reaction, media, fields, forward and replay", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const sender = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const receiver = await browser.newContext({
    viewport: { width: 430, height: 932 },
  });
  try {
    for (const [context, email] of [
      [sender, "demo@egin.local"],
      [receiver, "aliya@egin.local"],
    ] as const) {
      const response = await context.request.post("/api/auth/login", {
        data: { email, password: "EginDemo2026!" },
      });
      expect(response.ok()).toBeTruthy();
    }
    const a = await sender.newPage(),
      b = await receiver.newPage();
    const errors: string[] = [];
    for (const page of [a, b]) {
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        const observed = window as typeof window & {
          chatEvents: {
            id: string;
            type: string;
            timestamp: string;
            receivedAt: number;
            payload: Record<string, unknown>;
          }[];
          chatSources: EventSource[];
        };
        observed.chatEvents = [];
        observed.chatSources = [];
        const NativeEventSource = window.EventSource;
        window.EventSource = class extends NativeEventSource {
          constructor(url: string | URL, options?: EventSourceInit) {
            super(url, options);
            observed.chatSources.push(this);
            this.addEventListener("message", (event) => {
              try {
                observed.chatEvents.push({
                  ...JSON.parse(event.data),
                  receivedAt: Date.now(),
                });
              } catch {
                /* SSE heartbeat */
              }
            });
          }
        };
      });
    }
    const rooms = (await (
      await sender.request.get("/api/conversations")
    ).json()) as { id: string; title: string; kind: string }[];
    const receivers = (await (
      await receiver.request.get("/api/conversations")
    ).json()) as { id: string }[];
    const room = rooms.find(
      (r) => r.kind === "group" && receivers.some((c) => c.id === r.id),
    )!;
    expect(room).toBeTruthy();
    await Promise.all([
      a.goto("/community?chat=" + room.id),
      b.goto("/community?chat=" + room.id),
    ]);
    for (const page of [a, b]) {
      await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
      await expect(page.locator(".chat-room-head small")).not.toContainText(
        "Восстанавливаем",
      );
      await expect
        .poll(() =>
          page.evaluate(() => {
            const observed = window as typeof window & {
              chatSources: EventSource[];
            };
            return observed.chatSources.filter(
              (source) => source.readyState === EventSource.OPEN,
            ).length;
          }),
        )
        .toBe(1);
    }
    const prefix = "FAST " + Date.now();
    await a.getByLabel("Сообщение", { exact: true }).fill(prefix + " typing");
    await expect(b.locator(".chat-room-head small")).toContainText("печатает");
    const first = await send(a, room.id, prefix + " original");
    await expect(bubble(b, first.id)).toContainText(first.body);
    await expect(
      bubble(a, first.id).getByLabel("Прочитано", { exact: true }),
    ).toBeVisible();

    await menu(b, first);
    await b.getByRole("menuitem", { name: "Ответить", exact: true }).click();
    const reply = await send(b, room.id, prefix + " reply");
    await expect(bubble(a, reply.id).locator(".chat-quote")).toContainText(
      first.body,
    );

    await menu(a, first);
    await a.getByRole("menuitem", { name: "Изменить", exact: true }).click();
    await a.getByLabel("Сообщение", { exact: true }).fill(prefix + " edited");
    await a
      .getByRole("button", { name: "Сохранить изменение", exact: true })
      .click();
    await expect(bubble(b, first.id).locator("p")).toHaveText(
      prefix + " edited",
    );
    await expect(bubble(b, first.id)).toContainText("изменено");

    await menu(b, first);
    await b
      .getByRole("button", { name: "Добавить реакцию 👍", exact: true })
      .click();
    await expect(
      bubble(a, first.id).getByRole("button", {
        name: "Реакция 👍: 1",
        exact: true,
      }),
    ).toBeVisible();

    const png = await a.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 32;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#5d8b35";
      context.fillRect(0, 0, 32, 32);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    const uploaded = a.waitForResponse(
      (r) =>
        r.url().endsWith(`/api/conversations/${room.id}/attachments`) &&
        r.request().method() === "POST",
    );
    await a.getByLabel("Прикрепить файл", { exact: true }).setInputFiles({
      name: "field-photo.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    expect((await uploaded).ok()).toBeTruthy();
    await expect(a.locator(".chat-compose-context")).toContainText(
      "field-photo",
    );
    const photo = await send(a, room.id, prefix + " photo");
    await expect(bubble(b, photo.id).locator("img")).toBeVisible();
    await expect
      .poll(() =>
        bubble(b, photo.id)
          .locator("img")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);

    await a
      .getByRole("button", { name: "Поделиться полем", exact: true })
      .click();
    await a
      .getByRole("dialog", { name: "Поделиться полем", exact: true })
      .locator(".chat-picker-row")
      .first()
      .click();
    const field = await send(a, room.id, prefix + " field");
    await expect(bubble(b, field.id).locator(".chat-field-card")).toBeVisible();

    await menu(b, first);
    await b.getByRole("menuitem", { name: "Переслать", exact: true }).click();
    const forwardResponse = b.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/conversations/${room.id}/messages`) &&
        response.request().method() === "POST",
    );
    await b
      .getByRole("dialog", { name: "Переслать сообщение", exact: true })
      .getByRole("button", { name: room.title, exact: true })
      .click();
    const forwardedResult = await forwardResponse;
    expect(forwardedResult.ok()).toBeTruthy();
    const forwarded = (await forwardedResult.json()) as ChatMessage;
    await expect(
      bubble(a, forwarded.id).locator(".chat-forwarded"),
    ).toBeVisible();
    await expect(bubble(a, forwarded.id).locator("p")).toHaveText(
      prefix + " edited",
    );

    // Idempotency is verified against real HTTP; SSE + HTTP confirmation must not duplicate the optimistic bubble.
    const duplicate = await sender.request.post(
      `/api/conversations/${room.id}/messages`,
      { data: { body: first.body, client_id: first.client_id } },
    );
    expect(duplicate.ok()).toBeTruthy();
    expect((await duplicate.json()).id).toBe(first.id);
    await expect(bubble(a, first.id)).toHaveCount(1);
    await expect(bubble(b, first.id)).toHaveCount(1);

    await receiver.setOffline(true);
    const missed = await send(a, room.id, prefix + " while offline");
    await receiver.setOffline(false);
    await expect(bubble(b, missed.id)).toContainText(missed.body);
    await expect(bubble(b, missed.id)).toHaveCount(1);

    // Deliberate duplicate replay fault injection after receiving the real event.
    await b.evaluate((id) => {
      const observed = window as typeof window & {
        chatEvents: { id: string; payload: { message?: { id: number } } }[];
        chatSources: EventSource[];
      };
      const event = observed.chatEvents.find(
        (e) => e.payload?.message?.id === id,
      );
      if (!event) throw new Error("No real received event to replay");
      observed.chatSources.at(-1)!.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify(event),
          lastEventId: event.id,
        }),
      );
    }, missed.id);
    await expect(bubble(b, missed.id)).toHaveCount(1);

    const measurementsBeforeReload = await b.evaluate(() => {
      const observed = window as typeof window & {
        chatEvents: {
          id: string;
          type: string;
          timestamp: string;
          receivedAt: number;
        }[];
      };
      const seen = new Set<string>();
      return {
        network: observed.chatEvents
          .filter((event) => {
            if (seen.has(event.id)) return false;
            seen.add(event.id);
            return true;
          })
          .map((event) => ({
            id: event.id,
            type: event.type,
            serverTimestamp: event.timestamp,
            receivedAt: event.receivedAt,
            serverToBrowserMs: event.receivedAt - Date.parse(event.timestamp),
          })),
        render: performance
          .getEntriesByName("egin:event:rendered")
          .map((mark) => (mark as PerformanceMark).detail),
        processing: performance
          .getEntriesByName("egin:event:processed")
          .map((mark) => (mark as PerformanceMark).detail),
      };
    });
    const draft = prefix + " draft persists";
    await a.getByLabel("Сообщение", { exact: true }).fill(draft);
    await a.waitForTimeout(400);
    await a.reload();
    await expect(a.getByLabel("Сообщение", { exact: true })).toHaveValue(draft);
    await a.getByLabel("Сообщение", { exact: true }).fill("");
    await expect(bubble(a, missed.id)).toContainText(missed.body);

    await menu(a, first);
    await a.getByRole("menuitem", { name: "Удалить", exact: true }).click();
    await expect(bubble(b, first.id)).toContainText("Сообщение удалено");
    await b.reload();
    await expect(bubble(b, first.id)).toContainText("Сообщение удалено");
    await expect(bubble(b, photo.id).locator("img")).toBeVisible();

    for (const page of [a, b]) {
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBeTruthy();
      await expect(page.getByLabel("Сообщение", { exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
    // Short visual viewport checks composition space; this does not emulate a native OS keyboard.
    await a.setViewportSize({ width: 390, height: 460 });
    await a.getByLabel("Сообщение", { exact: true }).focus();
    await expect(a.locator(".bottom-nav")).toBeHidden();
    const sendBox = await a
      .getByRole("button", { name: "Отправить сообщение", exact: true })
      .boundingBox();
    expect(sendBox).toBeTruthy();
    expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(460);
    await a.screenshot({
      path: "../../artifacts/chat-mobile-short-viewport.png",
      fullPage: false,
    });
    await a.setViewportSize({ width: 390, height: 844 });
    const observed = await a.evaluate(() =>
      performance
        .getEntriesByName("egin:event:rendered")
        .map((mark) => (mark as PerformanceMark).detail),
    );
    await writeFile(
      "../../artifacts/chat-browser-verification.json.tmp",
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          transport: "one application SSE channel",
          scenarios: [
            "two independent accounts",
            "typing",
            "read",
            "reply",
            "edit",
            "delete",
            "reaction",
            "photo",
            "field share",
            "forward",
            "offline replay",
            "HTTP idempotency",
            "duplicate event injection",
            "durable reload",
            "draft reload",
            "short-viewport composition (not native keyboard)",
          ],
          networkTimingNote:
            "Local server and browser share the host clock. Timestamps include commit and transport delay; not pure network RTT.",
          serverToBrowserMeasurements: measurementsBeforeReload.network,
          renderMeasurements: [...measurementsBeforeReload.render, ...observed],
          processingMeasurements: measurementsBeforeReload.processing,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    await rename(
      "../../artifacts/chat-browser-verification.json.tmp",
      "../../artifacts/chat-browser-verification.json",
    );
    await a.screenshot({
      path: "../../artifacts/chat-mobile-390.png",
      fullPage: false,
    });
    await b.screenshot({
      path: "../../artifacts/chat-mobile-430.png",
      fullPage: false,
    });
  } finally {
    await sender.close();
    await receiver.close();
  }
});
