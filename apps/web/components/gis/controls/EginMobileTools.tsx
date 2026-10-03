"use client";

import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Plus, SlidersHorizontal, X } from "lucide-react";
import type { ToolDef } from "./EginToolbar";
import type { PlatformLanguage } from "@/lib/i18n";

export default function EginMobileTools({
  tools,
  language,
}: {
  tools: ToolDef[];
  language: PlatformLanguage;
}) {
  const [open, setOpen] = useState(false);
  const add = tools.find((tool) => tool.id === "draw_polygon");
  const select = tools.find((tool) => tool.id === "simple_select");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const kk = language === "kk";
  return (
    <div className="absolute left-3 right-[70px] top-[74px] z-30 grid grid-cols-2 gap-2 lg:hidden">
      <button
        onClick={() => (add?.active ? select?.onClick() : add?.onClick())}
        className="button primary min-h-12 min-w-0 flex-col gap-1 px-2 py-2 text-sm shadow-sm"
      >
        {add?.active ? (
          <X className="size-5" aria-hidden="true" />
        ) : (
          <Plus className="size-5" aria-hidden="true" />
        )}
        {add?.active
          ? kk
            ? "Сызуды тоқтату"
            : "Выйти из рисования"
          : kk
            ? "Егістік қосу"
            : "Нарисовать контур"}
      </button>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          ref={triggerRef}
          className="button secondary min-h-12 min-w-0 flex-col gap-1 px-2 py-2 text-sm"
        >
          <SlidersHorizontal className="size-5" aria-hidden="true" />
          <span>{kk ? "Құралдар" : "Инструменты"}</span>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[100] bg-[#102b1b]/45" />
          <Dialog.Content
            className="fixed inset-x-0 bottom-0 z-[101] mx-auto flex max-h-[85dvh] max-w-lg flex-col rounded-t-2xl bg-white text-[#24372c]"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              triggerRef.current?.focus();
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-border p-4">
              <Dialog.Title className="text-xl font-semibold">
                {kk ? "Карта құралдары" : "Инструменты карты"}
              </Dialog.Title>
              <Dialog.Close
                className="secondary-action px-3"
                aria-label={kk ? "Жабу" : "Закрыть"}
              >
                <X className="size-5" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="px-4 pt-3 text-muted-foreground">
              {kk
                ? "Қажетті әрекетті таңдаңыз."
                : "Выберите, что нужно сделать."}
            </Dialog.Description>
            <div className="overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  onClick={() => {
                    tool.onClick();
                    setOpen(false);
                  }}
                  aria-pressed={tool.active}
                  className={`flex min-h-14 w-full items-center gap-4 rounded-xl px-3 py-3 text-left text-base [&_svg]:size-6 [&_svg]:shrink-0 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-[1.8] ${tool.danger ? "text-red-700 hover:bg-red-50" : tool.active ? "bg-muted font-semibold text-primary" : "hover:bg-muted"}`}
                >
                  {tool.icon}
                  <span>{tool.label}</span>
                </button>
              ))}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
