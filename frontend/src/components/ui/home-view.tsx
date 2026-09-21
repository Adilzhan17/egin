'use client';

import React from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  CloudSun, 
  MapPin, 
  User, 
  Plus, 
  Newspaper 
} from "lucide-react";
import { PlatformLanguage, cropLabels, ui } from "@/lib/i18n";
import { DashboardResponse, DashboardCrop } from "@/lib/dashboard";

interface HomeViewProps {
  language: PlatformLanguage;
  setLanguage: (lang: PlatformLanguage) => void;
  userName: string;
  weatherSummary: string;
  weatherSourceLabel: string;
  regionName: string;
  districtName: string;
  dashboard: DashboardResponse | null;
  insightConfidence: number;
  cropRecommendationSummary: string;
  localizedCompetition: Record<string, string>;
  statsCards: any[];
  weatherPreview: any[];
  featuredNews: any;
  utilityInfoCards: any[];
  forecastCards: any[];
  cropList: ReadonlyArray<any>;
  setActiveTab: (tab: "home" | "map" | "market" | "services" | "profile" | "info" | "admin") => void;
  setDrawMode: (mode: string) => void;
  setSelectedCropCard: (crop: DashboardCrop | null) => void;
  mapRef: any;
}

export default function HomeView({
  language,
  setLanguage,
  userName,
  weatherSummary,
  weatherSourceLabel,
  regionName,
  districtName,
  dashboard,
  insightConfidence,
  cropRecommendationSummary,
  localizedCompetition,
  statsCards,
  weatherPreview,
  featuredNews,
  utilityInfoCards,
  forecastCards,
  cropList,
  setActiveTab,
  setDrawMode,
  setSelectedCropCard,
  mapRef
}: HomeViewProps) {
  
  const localizedCompetitionMap = {
    low: language === "kk" ? "Төмен" : "Низкая",
    medium: language === "kk" ? "Орташа" : "Средняя",
    high: language === "kk" ? "Жоғары" : "Высокая",
  } as const;

  const buildTeaser = (text: string | null, limit: number) => {
    if (!text) return "";
    if (text.length <= limit) return text;
    return text.substring(0, limit) + "...";
  };

  const openExternal = (url: string | null) => {
    if (url) window.open(url, "_blank");
  };

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-[#EEF3EA] dark:bg-[#002115] transition-colors pb-28 no-scrollbar">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 pt-5 pb-6 lg:px-6">
        {/* Welcome Header */}
        <div className="rounded-[2rem] bg-[#17381C] px-4 py-4 text-white shadow-[0_24px_80px_rgba(10,26,14,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">
                {language === "kk" ? "Қош келдіңіз" : "Добро пожаловать"}
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight">
                {language === "kk" ? `Сәлем, ${userName}` : `Здравствуйте, ${userName}`}
              </h1>
              <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
                <CloudSun className="size-4 text-[#D9B44A]" />
                <span>{weatherSummary}</span>
              </div>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/12 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-white/70">
                <MapPin className="size-3" />
                <span>{weatherSourceLabel}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-white/75">
                <MapPin className="size-3.5" />
                <span>{regionName}</span>
                <span>•</span>
                <span>{districtName}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-full border border-white/20 bg-white/12 p-1 sm:flex">
                {(["ru", "kk"] as PlatformLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-[0.18em] transition-colors ${
                      language === lang
                        ? "bg-white text-[#17381C]"
                        : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
              <div className="rounded-full border border-white/20 bg-white/12 px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-white/80">
                {dashboard?.season.title ||
                  (language === "kk" ? "Маусым" : "Сезон")}
              </div>
              <div className="flex size-11 items-center justify-center rounded-full border border-white/20 bg-white/10">
                <User className="size-4 text-white/85" />
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {statsCards.map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-[1.4rem] border border-white/10 bg-white/12 px-3 py-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-white/70">
                    {label}
                  </span>
                  <Icon className="size-3.5 text-white/80" />
                </div>
                <div className="text-lg font-black tracking-tight">{value}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:hidden">
            {(["ru", "kk"] as PlatformLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.18em] transition-colors ${
                  language === lang
                    ? "border-white bg-white text-[#17381C]"
                    : "border-white/25 bg-white/12 text-white/80"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                  {language === "kk" ? "Менің өнімім" : "Анализ моего урожая"}
                </p>
                <h2 className="mt-1 text-xl font-black text-[#18351D]">
                  {dashboard?.cropAnalysis?.cropType ||
                    (language === "kk"
                      ? "Әзірге дерек аз"
                      : "Пока мало данных")}
                </h2>
              </div>
              <div className="rounded-full bg-[#F3EFE2] px-3 py-1.5 text-xs font-black text-[#7D692F]">
                {dashboard?.cropAnalysis
                  ? `${dashboard.cropAnalysis.daysUntilHarvest} ${language === "kk" ? "күн" : "дн"}`
                  : `${insightConfidence}%`}
              </div>
            </div>

            <p className="mt-3 text-sm leading-relaxed text-[#2F6B3D]/74">
              {cropRecommendationSummary}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                  {language === "kk" ? "Саты" : "Стадия"}
                </p>
                <p className="mt-2 text-sm font-black text-[#18351D]">
                  {dashboard?.cropAnalysis?.growthStage ||
                    (language === "kk" ? "Жоспарлау" : "Планирование")}
                </p>
              </div>
              <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                  {language === "kk" ? "Сұраныс" : "Спрос"}
                </p>
                <p className="mt-2 text-sm font-black text-[#18351D]">
                  {dashboard?.cropAnalysis?.demandLevel ||
                    (language === "kk" ? "Орташа" : "Средний")}
                </p>
              </div>
              <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                  {language === "kk" ? "Бәсеке" : "Конкуренция"}
                </p>
                <p className="mt-2 text-sm font-black text-[#18351D]">
                  {dashboard?.cropAnalysis?.competitionLevel
                    ? localizedCompetitionMap[dashboard.cropAnalysis.competitionLevel]
                    : localizedCompetitionMap.low}
                </p>
              </div>
              <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                  {language === "kk" ? "Түсім" : "Доход"}
                </p>
                <p className="mt-2 text-sm font-black text-[#18351D]">
                  {dashboard?.cropAnalysis
                    ? `${Math.round(
                        dashboard.cropAnalysis.projectedIncomeKzt / 1000,
                      )}k ₸`
                    : "0 ₸"}
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                onClick={() => setActiveTab("map")}
                className="h-11 rounded-full bg-[#2F6B3D] px-4 text-sm font-black text-white hover:bg-[#285b34]"
              >
                {language === "kk" ? "Картаны ашу" : "Открыть карту"}
              </Button>
              <Button
                onClick={() => {
                  setActiveTab("map");
                  setDrawMode("draw_polygon");
                  mapRef.current?.changeDrawMode("draw_polygon");
                }}
                className="h-11 rounded-full bg-[#D9B44A] px-4 text-sm font-black text-[#17381C] hover:bg-[#e5c15b]"
              >
                <Plus className="size-4" />
                {language === "kk" ? "Алаң қосу" : "Добавить поле"}
              </Button>
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {language === "kk" ? "Маусым күйі" : "Статус сезона"}
              </p>
              <div className="mt-3 rounded-[1.4rem] bg-[#17381C] px-4 py-4 text-white">
                <p className="text-sm font-black">
                  {dashboard?.season.title ||
                    (language === "kk" ? "Маусым" : "Сезон")}
                </p>
                <p className="mt-2 text-sm text-white/80">
                  {dashboard?.season.summary ||
                    (language === "kk"
                      ? "Маусымдық деректер осы жерде шығады."
                      : "Здесь появится сезонная сводка.")}
                </p>
              </div>
              <div className="mt-3 rounded-[1.4rem] bg-[#F5F8F1] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-black text-[#18351D]">
                    {language === "kk" ? "Ауа райы" : "Погода"}
                  </p>
                  <div className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
                    {weatherSourceLabel}
                  </div>
                </div>
                <p className="mt-2 text-sm text-[#2F6B3D]/72">
                  {weatherSummary}
                </p>
                {weatherPreview.length > 0 ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {weatherPreview.map((item) => (
                      <div
                        key={item.day}
                        className="rounded-[1rem] bg-white px-3 py-3"
                      >
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                          {item.day.slice(5)}
                        </p>
                        <p className="mt-1 text-sm font-black text-[#17381C]">
                          {item.tempMax !== null
                            ? `${Math.round(item.tempMax)}°`
                            : "n/a"}
                        </p>
                        <p className="mt-1 text-[11px] leading-snug text-[#2F6B3D]/68">
                          {item.summary}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="overflow-hidden rounded-[2rem] border-[#DCE8D7] bg-white p-0 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div className="px-5 pt-5">
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                    {language === "kk" ? "Жаңалықтар" : "Новости"}
                  </p>
                  <h2 className="mt-1 text-lg font-black text-[#18351D]">
                    {language === "kk" ? "Фермерге қызық" : "Что важно фермеру"}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("info")}
                  className="mr-5 mt-5 rounded-full bg-[#17381C] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white"
                >
                  {language === "kk" ? "Ашу" : "Открыть"}
                </button>
              </div>
              {featuredNews ? (
                <div className="mt-4">
                  <div
                    className="mx-5 overflow-hidden rounded-[1.6rem] bg-[#17381C]"
                    style={{
                      backgroundImage: featuredNews.imageUrl
                        ? `linear-gradient(180deg, rgba(14,31,18,0.06) 0%, rgba(14,31,18,0.78) 100%), url(${featuredNews.imageUrl})`
                        : "linear-gradient(135deg, #17381C 0%, #2F6B3D 55%, #7DA65A 100%)",
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                  >
                    <div className="flex min-h-[14rem] flex-col justify-end px-4 py-4 text-white">
                      <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white/88 backdrop-blur-md">
                        <Newspaper className="size-3.5" />
                        {language === "kk" ? "Агро жаңалық" : "Агро новость"}
                      </div>
                      <h3 className="max-w-sm text-xl font-black leading-tight">
                        {featuredNews.title}
                      </h3>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/78">
                        {buildTeaser(featuredNews.summary, 104)}
                      </p>
                      {featuredNews.publishedAt ? (
                        <p className="mt-3 text-[11px] text-white/62">
                          {new Date(featuredNews.publishedAt).toLocaleDateString(
                            language === "kk" ? "kk-KZ" : "ru-RU",
                          )}
                        </p>
                      ) : null}
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => openExternal(featuredNews.actionUrl)}
                          className="rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#17381C]"
                        >
                          {language === "kk" ? "Дереккөзге өту" : "Перейти к источнику"}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 px-5 py-5">
                    {utilityInfoCards.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-[1.35rem] bg-[#F5F8F1] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                            {item.categoryLabel}
                          </p>
                          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#7D692F]">
                            {item.status}
                          </p>
                        </div>
                        <p className="mt-1 text-sm font-black text-[#18351D]">
                          {item.title}
                        </p>
                        <p className="mt-1 text-sm text-[#2F6B3D]/72">
                          {buildTeaser(item.summary, 88)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="px-5 py-5 text-sm text-[#2F6B3D]/72">
                  {language === "kk"
                    ? "Жаңалықтар блогы жақында толығады."
                    : "Новостной блок скоро будет заполнен."}
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Forecast Card */}
        <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {language === "kk" ? "Болжам" : "Прогноз"}
              </p>
              <h2 className="mt-1 text-xl font-black text-[#18351D]">
                {language === "kk" ? "Келесі қадамдар" : "Следующие ориентиры"}
              </h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {forecastCards.length > 0 ? (
              forecastCards.map((card) => (
                <div
                  key={card.label}
                  className="rounded-[1.5rem] bg-[#F5F8F1] px-4 py-4"
                >
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2F6B3D]/65">
                    {card.label}
                  </p>
                  <p className="mt-2 text-base font-black text-[#18351D]">
                    {card.value}
                  </p>
                  <p className="mt-2 text-sm text-[#2F6B3D]/72">
                    {buildTeaser(card.summary, 82)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-[1.5rem] bg-[#F5F8F1] px-4 py-4 text-sm text-[#2F6B3D]/72 md:col-span-2 xl:col-span-4">
                {language === "kk"
                  ? "Болжам үшін кемінде бір дақыл мен егіс дерегі қажет."
                  : "Для прогноза нужна хотя бы одна культура и данные по полю."}
              </div>
            )}
          </div>
        </Card>

        {/* Crop Cards */}
        <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                {language === "kk" ? "Дақыл карталары" : "Карточки культур"}
              </p>
              <h2 className="mt-1 text-xl font-black text-[#18351D]">
                {language === "kk" ? "Өсу мен сақтау" : "Рост и хранение"}
              </h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {(dashboard?.crops.length
              ? dashboard.crops
              : cropList.slice(0, 2).map((crop) => ({
                  cropType: (cropLabels[language] as any)[crop.key],
                  fillColor: "#D9B44A",
                  growthDaysMin: 90,
                  growthDaysMax: 120,
                  shelfLifeDays: 30,
                  plantingDate: null,
                  daysRemaining: 0,
                  harvestDateEstimate: null,
                  tips: {
                    watering:
                      language === "kk"
                        ? "Суару ұсыныстары кейін қосылады."
                        : "Рекомендации по поливу появятся позже.",
                    soil:
                      language === "kk"
                        ? "Топырақ ұсыныстары кейін қосылады."
                        : "Рекомендации по почве появятся позже.",
                    disease:
                      language === "kk"
                        ? "Тәуекелдер кейін қосылады."
                        : "Риски появятся позже.",
                    temperature:
                      language === "kk"
                        ? "Температура кеңестері кейін қосылады."
                        : "Советы по температуре появятся позже.",
                    lifehack:
                      language === "kk"
                        ? "Лайфхактар кейін қосылады."
                        : "Лайфхаки появятся позже.",
                    commonMistake:
                      language === "kk"
                        ? "Қателіктер кейін қосылады."
                        : "Типичные ошибки появятся позже.",
                  },
                }))
            ).map((crop: any) => (
              <div
                key={crop.cropType}
                className="cursor-pointer rounded-[1.6rem] bg-[#F5F8F1] px-4 py-4 transition-all hover:bg-[#EEF4E8] active:scale-[0.99]"
                onClick={() => setSelectedCropCard(crop)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: crop.fillColor || "#D9B44A" }}
                      />
                      <h3 className="text-lg font-black text-[#18351D]">
                        {crop.cropType}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm text-[#2F6B3D]/72">
                      {crop.growthDaysMin} - {crop.growthDaysMax} {language === "kk" ? "күн" : "дней"} • {language === "kk" ? "сақтау" : "хранение"} {crop.shelfLifeDays} {language === "kk" ? "күн" : "дней"}
                    </p>
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-[#7D692F]">
                    {crop.daysRemaining
                      ? `${crop.daysRemaining} ${language === "kk" ? "күн қалды" : "дней до сбора"}`
                      : language === "kk"
                        ? "Өсу циклі"
                        : "Цикл роста"}
                  </div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[1rem] bg-white px-3 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                      {language === "kk" ? "Күтім" : "Уход"}
                    </p>
                    <p className="mt-1 text-sm text-[#2F6B3D]/72">
                      {buildTeaser(crop.tips.watering, 70)}
                    </p>
                  </div>
                  <div className="rounded-[1rem] bg-white px-3 py-3">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2F6B3D]/65">
                      {language === "kk" ? "Тәуекел" : "Риск"}
                    </p>
                    <p className="mt-1 text-sm text-[#2F6B3D]/72">
                      {buildTeaser(crop.tips.disease, 70)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
                  {language === "kk" ? "Толық карта ашылады" : "Полная карточка откроется по нажатию"}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
