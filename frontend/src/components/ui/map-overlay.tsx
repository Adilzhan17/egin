'use client';

import React from 'react';
import { CloudSun, Save, X, ReceiptText } from "lucide-react";
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
  openSavedPlotWorkspace: (opts?: any) => Promise<void>;
  localizedCompetition: Record<string, string>;
  localizedVisibility: Record<string, string>;
  competitionTone: Record<string, any>;
}

export default function MapOverlay({
  language,
  setLanguage,
  regionName,
  weatherSummary,
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
      {/* Top Header. Region info and the RU/KK switch live in one solid card so the live map
          underneath (road labels, etc.) never shows through the gap between them. */}
      <div className="absolute inset-x-0 top-0 px-4 pt-4 lg:px-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="pointer-events-auto max-w-[20rem] overflow-hidden rounded-[1.45rem] border border-white/18 bg-[#16321C]/85 text-white shadow-[0_20px_60px_rgba(7,19,10,0.35)] backdrop-blur-xl md:max-w-md">
            <div className="px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">
                    Регион
                  </p>
                  <h1 className="mt-1 truncate text-base font-black tracking-tight lg:text-lg">
                    {regionName}
                  </h1>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/70">
                    <CloudSun className="size-4 shrink-0 text-[#F3D38D]" />
                    <span className="truncate">{weatherSummary}</span>
                  </div>
                </div>

                <div className="hidden shrink-0 items-start gap-2 md:flex">
                  <div className="rounded-full border border-white/16 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-white/80">
                    Карта
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-1.5 overflow-x-auto border-t border-white/12 px-3 py-2 md:hidden no-scrollbar">
              {(["ru", "kk"] as PlatformLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  className={`flex min-h-11 min-w-12 items-center justify-center rounded-full border px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] transition-colors ${
                    language === lang
                      ? "border-white bg-white text-[#1F4D2C]"
                      : "border-white/16 bg-white/8 text-white/75"
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Measurement Tooltip */}
      {measurement && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0">
          <div className="rounded-[1.8rem] border border-white/16 bg-black/30 px-5 py-4 text-white shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-[0.24em] text-white/70">
                {language === "kk" ? "Ағымдағы таңдау" : "Текущее выделение"}
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                {drawMode.replaceAll("_", " ")}
              </span>
            </div>
            <div className="text-xl font-black tracking-tight">{measurement}</div>
            <p className="mt-2 text-sm text-white/70">
              {language === "kk"
                ? "Бәсеке, табыс және маркеттегі көрінуін есептеу үшін полигонды сақтаңыз."
                : "Сохраните полигон, чтобы посчитать конкуренцию, доход и видимость в маркете."}
            </p>
          </div>
          <Button
            onClick={handleSaveNewPlot}
            className="h-14 rounded-[1.8rem] bg-[#D9B44A] text-[#17381C] font-black shadow-[0_18px_50px_rgba(217,180,74,0.42)] hover:bg-[#e5c15b]"
          >
            <Save className="mr-2 size-5" />
            Добавить поле
          </Button>
        </div>
      )}

      {/* Saved Plot Result Card */}
      {savedPlotResult && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 lg:bottom-8 lg:left-8 lg:translate-x-0">
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
