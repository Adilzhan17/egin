'use client';

import React from 'react';
import { Save, X, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformLanguage } from "@/lib/i18n";
import { SavedPlotResult } from "@/lib/dashboard";

interface MapOverlayProps {
  language: PlatformLanguage;
  setLanguage: (lang: PlatformLanguage) => void;
  regionName: string;
  weatherSummary: string;
  measurement: string | null;
  drawMode: string;
  savedPlotResult: SavedPlotResult | null;
  setSavedPlotResult: (res: SavedPlotResult | null) => void;
  handleSaveNewPlot: () => void;
  openSavedPlotWorkspace: (opts?: { loadAiAdvice?: boolean }) => Promise<void>;
  localizedCompetition: Record<string, string>;
  localizedVisibility: Record<string, string>;
  competitionTone: Record<string, { badge: string }>;
}

export default function MapOverlay({
  language,
  regionName,
  measurement,
  drawMode,
  savedPlotResult,
  setSavedPlotResult,
  handleSaveNewPlot,
  openSavedPlotWorkspace,
  localizedCompetition,
  localizedVisibility,
  competitionTone
}: MapOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="absolute inset-x-4 top-[max(16px,env(safe-area-inset-top))] lg:inset-x-6">
        <header className="pointer-events-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 text-card-foreground">
          <h1 className="text-xl font-bold">{language === "kk" ? "Менің егістіктерім" : "Мои поля"}</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{regionName || (language === "kk" ? "Картадан егістігіңізді табыңыз" : "Найдите своё поле на карте")}</p>
        </header>
        {drawMode === "draw_polygon" && !measurement && <p className="mt-[76px] max-w-md rounded-xl border border-border bg-card p-3 text-sm leading-relaxed text-card-foreground lg:mt-3">{language === "kk" ? "Егістік шекарасының бұрыштарын кезекпен басыңыз. Аяқтау үшін бірінші нүктені қайта басыңыз." : "Нажимайте по углам вашего поля. Чтобы замкнуть границу, нажмите на первую точку."}</p>}
      </div>

      {/* Measurement Tooltip */}
      {measurement && (
        <div className="pointer-events-auto absolute bottom-[calc(var(--app-nav-height)+16px)] left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0">
          <div className="rounded-2xl border border-white/16 bg-[#17381C] px-5 py-4 text-white shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-white/70">
                {language === "kk" ? "Ағымдағы таңдау" : "Текущее выделение"}
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                {language === "kk" ? "Егістік шекарасы" : "Граница поля"}
              </span>
            </div>
            <div className="text-xl font-black tracking-tight">{measurement}</div>
            <p className="mt-2 text-sm text-white/70">
              {language === "kk"
                ? "Шекараны сақтап, егістікте не өсетінін көрсетіңіз."
                : "Сохраните границы и укажите, что растёт на поле."}
            </p>
          </div>
          <Button
            onClick={handleSaveNewPlot}
            className="h-14 rounded-[1.8rem] bg-[#D9B44A] text-[#17381C] font-black shadow-[0_18px_50px_rgba(217,180,74,0.42)] hover:bg-[#e5c15b]"
          >
            <Save className="mr-2 size-5" />
            {language === "kk" ? "Егістікті сақтау" : "Сохранить поле"}
          </Button>
        </div>
      )}

      {/* Saved Plot Result Card */}
      {savedPlotResult && (
        <div className="pointer-events-auto absolute bottom-[calc(var(--app-nav-height)+16px)] left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 max-h-[calc(100dvh-220px)] overflow-y-auto flex-col gap-3 lg:bottom-8 lg:left-8 lg:translate-x-0">
          <Card className="rounded-[2rem] border-white/16 bg-white/88 p-5 shadow-[0_24px_80px_rgba(9,28,14,0.18)] backdrop-blur-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-[#2F6B3D]/70">
                {language === "kk" ? "Алаң сақталды" : "Поле сохранено"}
                </p>
                <h2 className="mt-1 text-xl font-black text-[#18351D]">
                  {savedPlotResult.plot.title}
                </h2>
                <p className="mt-1 text-sm font-medium text-[#2F6B3D]/70">
                  {savedPlotResult.plot.cropType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSavedPlotResult(null)}
                aria-label={language === "kk" ? "Жабу" : "Закрыть результат"}
                className="flex size-12 items-center justify-center rounded-2xl bg-[#F5F1E8] text-[#2F6B3D] transition-all hover:bg-[#ece4d2]"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div className="rounded-[1.4rem] bg-[#F5F1E8] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/70">
                  {language === "kk" ? "Табыс" : "Доход"}
                </p>
                <p className="mt-2 text-lg font-black text-[#18351D]">
                  {Math.round(savedPlotResult.projectedIncomeKzt / 1000)}k ₸
                </p>
              </div>
              <div className="rounded-[1.4rem] bg-[#F5F1E8] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/70">
                  {language === "kk" ? "Сенім" : "Уверенность"}
                </p>
                <p className="mt-2 text-lg font-black text-[#18351D]">
                  {Math.round(savedPlotResult.competition.confidence * 100)}%
                </p>
              </div>
            </div>

            <div className="mb-4 flex items-center justify-between rounded-[1.4rem] bg-[#F5F1E8] px-4 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/70">
                  {language === "kk" ? "Бәсеке" : "Конкуренция"}
                </p>
                <p className="mt-1 text-base font-black text-[#18351D]">
                  {localizedCompetition[savedPlotResult.competition.level]}
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${competitionTone[savedPlotResult.competition.level].badge}`}
              >
                {localizedVisibility[savedPlotResult.competition.marketplaceVisibility]}
              </span>
            </div>

            <div className="mb-4 rounded-[1.4rem] bg-[#17381C] px-4 py-4 text-white">
              <div className="mb-2 flex items-center gap-2">
                <ReceiptText className="size-5 text-[#D9B44A]" />
                <span className="text-base font-bold text-white/90">
                  {language === "kk" ? "AI түсіндірме" : "AI объяснение"}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-white/80">
                {savedPlotResult.competition.explanation}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/70">
                  {language === "kk" ? "Жақын аумақ" : "Площадь рядом"}
                </p>
                <p className="mt-1 font-black text-[#18351D]">
                  {savedPlotResult.competition.nearbyAreaHectares} ha
                </p>
              </div>
              <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/70">
                  {language === "kk" ? "Жақын алаңдар" : "Участки рядом"}
                </p>
                <p className="mt-1 font-black text-[#18351D]">
                  {savedPlotResult.competition.nearbyPlotCount}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void openSavedPlotWorkspace()}
                className="flex h-12 items-center justify-center rounded-xl bg-[#17381C] text-xs font-black uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#214927]"
              >
                {language === "kk" ? "Алаңды ашу" : "Открыть участок"}
              </button>
              <button
                type="button"
                onClick={() => void openSavedPlotWorkspace({ loadAiAdvice: true })}
                className="flex h-12 items-center justify-center rounded-xl bg-[#D9B44A] text-xs font-black uppercase tracking-[0.14em] text-[#17381C] transition-colors hover:bg-[#e5c15b]"
              >
                {language === "kk" ? "Журнал + AI" : "Журнал + AI"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
