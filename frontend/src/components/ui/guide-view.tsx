"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { PlatformLanguage } from "@/lib/i18n";

export default function GuideView({
  language,
  onClose,
}: {
  language: PlatformLanguage;
  onClose: () => void;
}) {
  const kk = language === "kk";
  const steps = kk
    ? [
        {
          title: "Егістігіңізді табыңыз",
          text: "Төмендегі «Егістік» бөлімін ашыңыз. Картаны саусақпен жылжытыңыз. Жақындату үшін + батырмасын басыңыз.",
        },
        {
          title: "Шекарасын белгілеңіз",
          text: "«Егістік қосу» батырмасын басыңыз. Егістіктің бұрыштарын кезекпен басып, соңында бірінші нүктеге оралыңыз.",
        },
        {
          title: "Егістікті сақтаңыз",
          text: "«Егістікті сақтау» батырмасын басыңыз. Атауын жазып, дақылды таңдаңыз. Сақталған егістікті картадан ашып, мәліметтерін өзгертуге болады.",
        },
        {
          title: "Сатушымен байланысыңыз",
          text: "«Базар» бөлімінде хабарландыруды ашып, сатушыға жазыңыз. Барлық хат алмасу төмендегі «Чат» бөлімінде болады.",
        },
      ]
    : [
        {
          title: "Найдите своё поле",
          text: "Откройте «Поля» внизу экрана. Двигайте карту пальцем. Нажимайте +, чтобы приблизить нужное место.",
        },
        {
          title: "Отметьте границы",
          text: "Нажмите «Добавить поле». По очереди нажмите на углы поля, а в конце — ещё раз на первую точку.",
        },
        {
          title: "Сохраните поле",
          text: "Нажмите «Сохранить поле», введите название и выберите культуру. Сохранённое поле можно открыть на карте и изменить его данные.",
        },
        {
          title: "Напишите продавцу",
          text: "В разделе «Рынок» откройте объявление и начните переписку с продавцом. Все ваши беседы доступны по кнопке «Чат» внизу экрана.",
        },
      ];
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[#102b1b]/45" />
        <Dialog.Content className="fixed inset-0 z-[71] flex flex-col bg-background text-foreground sm:inset-6 sm:mx-auto sm:max-w-2xl sm:rounded-2xl">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 pb-4 pt-[max(16px,env(safe-area-inset-top))]">
            <Dialog.Title className="text-xl font-semibold">
              {kk ? "Қалай қолдануға болады?" : "Как пользоваться?"}
            </Dialog.Title>
            <Dialog.Close
              className="secondary-action px-3"
              aria-label={kk ? "Жабу" : "Закрыть помощь"}
            >
              <X className="size-5" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 overflow-y-auto px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-5">
            <Dialog.Description className="mb-6 leading-relaxed text-muted-foreground">
              {kk
                ? "Алғашқы егістікті қосудан бастаңыз. Бұл нұсқаулықты мәзірден қайта ашуға болады."
                : "Начните с добавления первого поля. Эту инструкцию всегда можно открыть в меню."}
            </Dialog.Description>
            <ol className="space-y-6">
              {steps.map((step, index) => (
                <li key={step.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">{step.title}</h2>
                    <p className="mt-2 leading-relaxed text-muted-foreground">
                      {step.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <Dialog.Close className="primary-action mt-8 w-full">
              {kk ? "Түсінікті" : "Понятно"}
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
