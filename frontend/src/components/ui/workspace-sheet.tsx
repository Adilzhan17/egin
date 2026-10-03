"use client";

import React from "react";
import { GardenPlotPanel } from "./garden-panel";
import { Loader2, Trash2 } from "lucide-react";
import {
  FarmActivity,
  PlotSeasonSummary,
  PlotAiAdvice,
  FarmActivityType,
} from "@/lib/dashboard";
import { PlatformLanguage, cropList, cropLabels } from "@/lib/i18n";

interface ActivityForm {
  type: FarmActivityType;
  activityDate: string;
  description: string;
  costKzt: string;
  materials: string;
  photoUrl: string;
}

interface WorkspaceSheetProps {
  language: PlatformLanguage;
  editPlotData: { id: string } | null;
  editTitle: string;
  editCrop: string;
  fillColor: string;
  isSubmitting: boolean;
  isSeasonSummaryLoading: boolean;
  seasonSummary: PlotSeasonSummary | null;
  isAiAdviceLoading: boolean;
  plotAiAdvice: PlotAiAdvice | null;
  isActivitiesLoading: boolean;
  activityForm: ActivityForm;
  isActivitySubmitting: boolean;
  plotActivities: FarmActivity[];
  activityTypeLabels: Record<string, string>;
  activityTypeOptions: string[];
  setEditTitle: (v: string) => void;
  setEditCrop: (v: string) => void;
  setFillColor: (v: string) => void;
  setActivityForm: React.Dispatch<React.SetStateAction<ActivityForm>>;
  deletePlot: () => Promise<void>;
  fetchPlotAiAdvice: () => Promise<void>;
  submitActivity: () => Promise<void>;
  deleteActivity: (id: string) => Promise<void>;
}

export default function WorkspaceSheet({
  language,
  editPlotData,
  editTitle,
  editCrop,
  fillColor,
  isSubmitting,
  isSeasonSummaryLoading,
  seasonSummary,
  isAiAdviceLoading,
  plotAiAdvice,
  isActivitiesLoading,
  activityForm,
  isActivitySubmitting,
  plotActivities,
  activityTypeLabels,
  activityTypeOptions,
  setEditTitle,
  setEditCrop,
  setFillColor,
  setActivityForm,
  deletePlot,
  fetchPlotAiAdvice,
  submitActivity,
  deleteActivity,
}: WorkspaceSheetProps) {
  if (!editPlotData) return null;

  return (
    <div className="mb-2 flex flex-col gap-3">
      <input
        type="text"
        value={editTitle}
        onChange={(e) => setEditTitle(e.target.value)}
        className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
      />
      <select
        className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
        value={editCrop}
        onChange={(e) => setEditCrop(e.target.value)}
      >
        {cropList.map((crop) => (
          <option
            key={crop.key}
            value={(cropLabels[language] as Record<string, string>)[crop.key]}
          >
            {crop.emoji}{" "}
            {(cropLabels[language] as Record<string, string>)[crop.key]}
          </option>
        ))}
      </select>
      <div className="flex h-14 items-center justify-between rounded-2xl border-none bg-[#F5F9F4] px-2 outline-none">
        <label className="ml-2 text-xs font-black uppercase text-[#2F6B3D]/50">
          Цвет заливки
        </label>
        <input
          type="color"
          className="mr-2 h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none"
          value={fillColor}
          onChange={(e) => setFillColor(e.target.value)}
        />
      </div>
      <button
        onClick={deletePlot}
        disabled={isSubmitting}
        className="mt-2 flex h-14 w-full items-center justify-center rounded-2xl border border-red-100 bg-red-50 font-bold text-red-600 transition-colors hover:bg-red-100"
      >
        Удалить участок
      </button>

      <section className="surface mt-5 p-4">
        <h2 className="section-title">
          {language === "kk" ? "Бақшадағы топырақ" : "Почва на участке"}
        </h2>
        <GardenPlotPanel
          key={`${editPlotData.id}:${language}`}
          plotId={editPlotData.id}
          language={language}
          withAdvice={false}
        />
      </section>

      {/* Finance Section */}
      <div className="mt-5 rounded-2xl bg-[#F5F9F4] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/50">
              {language === "kk" ? "Маусым қаржысы" : "Финансы сезона"}
            </p>
            <p className="mt-1 text-xs font-bold text-[#2F6B3D]/70">
              {language === "kk"
                ? "Журналдағы шығындар мен болжамды пайда"
                : "Расходы из журнала и прогноз прибыли"}
            </p>
          </div>
          {isSeasonSummaryLoading && (
            <Loader2 className="size-4 animate-spin text-[#2F6B3D]/50" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-white px-3 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
              {language === "kk" ? "Шығын" : "Расходы"}
            </p>
            <p className="mt-1 text-base font-black text-[#17381C]">
              {Math.round(seasonSummary?.totalExpensesKzt ?? 0).toLocaleString(
                "ru-RU",
              )}{" "}
              ₸
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
              {language === "kk" ? "Табыс" : "Доход"}
            </p>
            <p className="mt-1 text-base font-black text-[#17381C]">
              {Math.round(
                seasonSummary?.projectedIncomeKzt ?? 0,
              ).toLocaleString("ru-RU")}{" "}
              ₸
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
              {language === "kk" ? "Пайда" : "Прибыль"}
            </p>
            <p
              className={`mt-1 text-base font-black ${
                (seasonSummary?.projectedProfitKzt ?? 0) < 0
                  ? "text-red-600"
                  : "text-[#17381C]"
              }`}
            >
              {Math.round(
                seasonSummary?.projectedProfitKzt ?? 0,
              ).toLocaleString("ru-RU")}{" "}
              ₸
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-3">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
              {language === "kk" ? "Жазба" : "Записей"}
            </p>
            <p className="mt-1 text-base font-black text-[#17381C]">
              {seasonSummary?.activityCount ?? 0}
            </p>
          </div>
        </div>

        <div className="mt-3 rounded-xl bg-white px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
                {language === "kk" ? "Соңғы жұмыс" : "Последняя работа"}
              </p>
              <p className="mt-1 text-xs font-black text-[#17381C]">
                {seasonSummary?.latestActivity
                  ? `${activityTypeLabels[seasonSummary.latestActivity.type]} · ${String(
                      seasonSummary.latestActivity.activityDate,
                    ).slice(0, 10)}`
                  : language === "kk"
                    ? "Әзірге жоқ"
                    : "Пока нет"}
              </p>
            </div>
            <div className="rounded-full bg-[#F5F9F4] px-3 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-[#2F6B3D]/60">
              {Math.round(seasonSummary?.costPerHectareKzt ?? 0).toLocaleString(
                "ru-RU",
              )}{" "}
              ₸/га
            </div>
          </div>
          <p className="mt-2 text-[11px] font-semibold leading-relaxed text-[#2F6B3D]/58">
            {seasonSummary?.note ||
              (language === "kk"
                ? "Журналға жазба қоссаңыз, есеп нақтырақ болады."
                : "Добавьте записи в журнал, чтобы расчет стал точнее.")}
          </p>
        </div>
      </div>

      {/* AI Advice Section */}
      <div className="mt-5 rounded-2xl bg-[#17381C] p-4 text-white">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-white/70">
              {language === "kk" ? "AI кеңес" : "AI совет"}
            </p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-white/70">
              {language === "kk"
                ? "Дақыл, ауа райы және журнал бойынша қысқа ұсыныс."
                : "Совет по культуре, влажности почвы, погоде и журналу работ."}
            </p>
          </div>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-black uppercase tracking-[0.16em] text-white/60">
            {plotAiAdvice?.source === "openai"
              ? language === "kk"
                ? "ЖИ кеңесі"
                : "Совет ИИ"
              : language === "kk"
                ? "Күтім"
                : "Уход"}
          </span>
        </div>

        <button
          type="button"
          onClick={fetchPlotAiAdvice}
          disabled={isAiAdviceLoading}
          className="flex h-11 w-full items-center justify-center rounded-xl bg-[#D9B44A] text-xs font-black text-[#17381C] transition-colors hover:bg-[#e3bf52] disabled:opacity-60"
        >
          {isAiAdviceLoading
            ? language === "kk"
              ? "Талдауда..."
              : "Анализируем..."
            : language === "kk"
              ? "AI кеңес алу"
              : "Как ухаживать сегодня?"}
        </button>

        {plotAiAdvice && (
          <div className="mt-4 rounded-xl bg-white/10 p-3">
            <p className="font-black text-white">{plotAiAdvice.title}</p>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-white/80">
              {plotAiAdvice.summary}
            </p>
            <div className="mt-3 grid gap-2">
              {plotAiAdvice.actions.map((action) => (
                <div
                  key={action}
                  className="rounded-lg bg-white/12 px-3 py-2 text-xs font-semibold leading-relaxed text-white/78"
                >
                  {action}
                </div>
              ))}
            </div>
            {plotAiAdvice.risks.length > 0 && (
              <div className="mt-3 rounded-lg border border-white/10 px-3 py-2">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">
                  {language === "kk" ? "Тәуекелдер" : "Риски"}
                </p>
                <ul className="mt-2 grid gap-1 text-xs font-semibold leading-relaxed text-white/80">
                  {plotAiAdvice.risks.map((risk) => (
                    <li key={risk}>• {risk}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-3 text-xs font-semibold leading-relaxed text-white/45">
              {plotAiAdvice.confidenceNote}
            </p>
          </div>
        )}
      </div>

      {/* Activity Journal Section */}
      <div className="mt-5 rounded-2xl bg-[#F5F9F4] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/50">
              {language === "kk" ? "Журнал" : "Журнал работ"}
            </p>
            <p className="mt-1 text-xs font-bold text-[#2F6B3D]/70">
              {language === "kk"
                ? "Алаң бойынша қысқа жазбалар"
                : "Короткие записи по участку"}
            </p>
          </div>
          {isActivitiesLoading && (
            <Loader2 className="size-4 animate-spin text-[#2F6B3D]/50" />
          )}
        </div>

        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={activityForm.type}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  type: e.target.value as FarmActivityType,
                }))
              }
              className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
            >
              {activityTypeOptions.map((type) => (
                <option key={type} value={type}>
                  {activityTypeLabels[type]}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={activityForm.activityDate}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  activityDate: e.target.value,
                }))
              }
              className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
            />
          </div>
          <textarea
            rows={3}
            value={activityForm.description}
            onChange={(e) =>
              setActivityForm((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            placeholder={
              language === "kk"
                ? "Мысалы: Арбузды суардым, топырақ жақсы."
                : "Например: полил арбуз, почва в норме."
            }
            className="w-full resize-none rounded-xl bg-white p-3 text-xs font-semibold text-[#2F6B3D] outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              value={activityForm.costKzt}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  costKzt: e.target.value,
                }))
              }
              placeholder={language === "kk" ? "Шығын, ₸" : "Расход, ₸"}
              className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
            />
            <input
              value={activityForm.materials}
              onChange={(e) =>
                setActivityForm((prev) => ({
                  ...prev,
                  materials: e.target.value,
                }))
              }
              placeholder={
                language === "kk" ? "Материалдар" : "Материалы через запятую"
              }
              className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
            />
          </div>
          <input
            value={activityForm.photoUrl}
            onChange={(e) =>
              setActivityForm((prev) => ({
                ...prev,
                photoUrl: e.target.value,
              }))
            }
            placeholder="Фото URL"
            className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
          />
          <button
            type="button"
            onClick={submitActivity}
            disabled={isActivitySubmitting}
            className="flex h-11 items-center justify-center rounded-xl bg-[#2F6B3D] text-xs font-black text-white transition-colors hover:bg-[#285b34] disabled:opacity-60"
          >
            {isActivitySubmitting
              ? language === "kk"
                ? "Сақталуда..."
                : "Сохраняем..."
              : language === "kk"
                ? "Жазба қосу"
                : "Добавить запись"}
          </button>
        </div>

        <div className="mt-4 grid gap-2">
          {plotActivities.map((act) => (
            <div key={act.id} className="rounded-xl bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
                    {String(act.activityDate).slice(0, 10)} ·{" "}
                    {activityTypeLabels[act.type]}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#17381C]">
                    {act.description}
                  </p>
                  {act.costKzt > 0 && (
                    <p className="mt-1 text-xs font-bold text-[#7D692F]">
                      -{Math.round(act.costKzt).toLocaleString("ru-RU")} ₸
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteActivity(act.id)}
                  className="p-1 text-red-400 hover:text-red-600"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
