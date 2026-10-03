"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlatformLanguage } from "@/lib/i18n";
import { DashboardCrop } from "@/lib/dashboard";

type Props = {
  crop: DashboardCrop;
  language: PlatformLanguage;
  competitionLabels: Record<"low" | "medium" | "high", string>;
  onClose: () => void;
};

export default function CropDetailSheet({
  crop,
  language,
  competitionLabels,
  onClose,
}: Props) {
  const copy =
    language === "kk"
      ? {
          title: "Дақыл картасы",
          growthCycle: "Өсу циклі",
          planted: "Отырғызылған күні",
          passed: "Өткен уақыт",
          left: "Қалғаны",
          harvest: "Жинау күні",
          shelfLife: "Сақтау мерзімі",
          storage: "Сақтау шарты",
          advice: "Кеңестер",
          risks: "Тәуекелдер",
          lifehack: "Лайфхак",
          mistake: "Жиі қате",
          area: "Ауданы",
          plots: "Алаңдар",
          competition: "Бәсеке",
          close: "Жабу",
          sell: "Сату кеңесі",
          noDate: "Отырғызу күні әлі жоқ",
          planning: "Деректер толық болса, мерзім мен жинау дәлірек көрінеді.",
        }
      : {
          title: "Карточка культуры",
          growthCycle: "Цикл роста",
          planted: "Дата посадки",
          passed: "Прошло",
          left: "Осталось",
          harvest: "Дата сбора",
          shelfLife: "Срок хранения",
          storage: "Условия хранения",
          advice: "Советы",
          risks: "Риски",
          lifehack: "Лайфхак",
          mistake: "Типичная ошибка",
          area: "Площадь",
          plots: "Участки",
          competition: "Конкуренция",
          close: "Закрыть",
          sell: "Совет по продаже",
          noDate: "Дата посадки пока не указана",
          planning: "Чем полнее данные по культуре, тем точнее срок и сбор.",
        };

  const stage =
    crop.daysPassed === 0
      ? language === "kk"
        ? "Жоспарлау"
        : "Планирование"
      : crop.daysRemaining <= 14
        ? language === "kk"
          ? "Жинауға жақын"
          : "Почти готово к сбору"
        : crop.daysPassed <= 30
          ? language === "kk"
            ? "Ерте өсу"
            : "Ранний рост"
          : language === "kk"
            ? "Белсенді өсу"
            : "Активный рост";

  const sellAdvice =
    crop.competitionLevel === "high"
      ? language === "kk"
        ? "Нарық тығыз: көлемді бөліп шығарып, баға мен сапаны бақылау керек."
        : "Рынок плотный: лучше продавать частями и внимательно следить за ценой."
      : crop.competitionLevel === "medium"
        ? language === "kk"
          ? "Сатуды бастауға болады, бірақ жақын нарық пен көрші ұсыныстарды бақылаңыз."
          : "Можно готовить продажу, но стоит контролировать локальный спрос и соседние предложения."
        : language === "kk"
          ? "Бәсеке төмен: жергілікті сатылым мен жылдам логистикаға басымдық беріңіз."
          : "Конкуренция низкая: ставка на локальную продажу и быструю логистику даст лучший результат.";

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-[#F4EFE6] shadow-[0_30px_100px_rgba(13,30,17,0.3)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/45 bg-white/60 px-5 py-5 backdrop-blur-xl">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.24em] text-[#2F6B3D]/65">
              {copy.title}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: crop.fillColor || "#D9B44A" }}
              />
              <h2 className="truncate text-2xl font-black text-[#17381C]">
                {crop.cropType}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full bg-white text-[#17381C] shadow-sm transition-colors hover:bg-[#efe7d6]"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.6rem] bg-[#17381C] px-4 py-4 text-white">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-white/55">
                {copy.growthCycle}
              </p>
              <p className="mt-2 text-lg font-black">
                {crop.growthDaysMin} - {crop.growthDaysMax}{" "}
                {language === "kk" ? "күн" : "дней"}
              </p>
              <p className="mt-2 text-sm text-white/80">
                {stage || copy.planning}
              </p>
            </div>
            <div className="rounded-[1.6rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.sell}
              </p>
              <p className="mt-2 text-sm font-medium leading-relaxed text-[#2F6B3D]/78">
                {sellAdvice}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/65">
                {copy.area}
              </p>
              <p className="mt-2 text-base font-black text-[#17381C]">
                {crop.areaHectares} га
              </p>
            </div>
            <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/65">
                {copy.plots}
              </p>
              <p className="mt-2 text-base font-black text-[#17381C]">
                {crop.plotsCount}
              </p>
            </div>
            <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/65">
                {copy.passed}
              </p>
              <p className="mt-2 text-base font-black text-[#17381C]">
                {crop.daysPassed} {language === "kk" ? "күн" : "дн"}
              </p>
            </div>
            <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/65">
                {copy.left}
              </p>
              <p className="mt-2 text-base font-black text-[#17381C]">
                {crop.daysRemaining} {language === "kk" ? "күн" : "дн"}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.6rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.planted}
              </p>
              <p className="mt-2 text-sm font-black text-[#17381C]">
                {crop.plantingDate || copy.noDate}
              </p>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.harvest}
              </p>
              <p className="mt-2 text-sm font-black text-[#17381C]">
                {crop.harvestDateEstimate || copy.planning}
              </p>
            </div>
            <div className="rounded-[1.6rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.competition}
              </p>
              <p className="mt-2 text-sm font-black text-[#17381C]">
                {competitionLabels[crop.competitionLevel]}
              </p>
              <p className="mt-3 text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.shelfLife}
              </p>
              <p className="mt-2 text-sm font-black text-[#17381C]">
                {crop.shelfLifeDays} {language === "kk" ? "күн" : "дней"}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-[1.6rem] bg-white px-4 py-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
              {copy.storage}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#2F6B3D]/78">
              {crop.storage}
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.6rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.advice}
              </p>
              <div className="mt-3 grid gap-2 text-sm text-[#2F6B3D]/78">
                <p>
                  <span className="font-black text-[#17381C]">
                    {language === "kk" ? "Суару:" : "Полив:"}
                  </span>{" "}
                  {crop.tips.watering}
                </p>
                <p>
                  <span className="font-black text-[#17381C]">
                    {language === "kk" ? "Топырақ:" : "Почва:"}
                  </span>{" "}
                  {crop.tips.soil}
                </p>
                <p>
                  <span className="font-black text-[#17381C]">
                    {language === "kk" ? "Температура:" : "Температура:"}
                  </span>{" "}
                  {crop.tips.temperature}
                </p>
              </div>
            </div>
            <div className="rounded-[1.6rem] bg-white px-4 py-4 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {copy.risks}
              </p>
              <div className="mt-3 grid gap-3 text-sm text-[#2F6B3D]/78">
                <p>
                  <span className="font-black text-[#17381C]">
                    {language === "kk" ? "Тәуекел:" : "Риск:"}
                  </span>{" "}
                  {crop.tips.disease}
                </p>
                <p>
                  <span className="font-black text-[#17381C]">
                    {copy.lifehack}:
                  </span>{" "}
                  {crop.tips.lifehack}
                </p>
                <p>
                  <span className="font-black text-[#17381C]">
                    {copy.mistake}:
                  </span>{" "}
                  {crop.tips.commonMistake}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-white/45 bg-white/60 px-5 py-4 backdrop-blur-xl">
          <Button
            onClick={onClose}
            className="h-12 w-full rounded-[1rem] bg-[#2F6B3D] text-sm font-black text-white hover:bg-[#285b34]"
          >
            {copy.close}
          </Button>
        </div>
      </div>
    </div>
  );
}
