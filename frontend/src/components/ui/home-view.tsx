"use client";

import {
  ArrowRight,
  CloudSun,
  MapPin,
  Plus,
  MessageCircle,
  ShoppingBasket,
  Map,
  CircleHelp,
  ChevronRight,
  Sprout,
  RefreshCw,
} from "lucide-react";
import type { PlatformLanguage } from "@/lib/i18n";
import type { DashboardResponse, DashboardCrop } from "@/lib/dashboard";
import type { AppTab } from "./app-navigation";

interface HomeViewProps {
  language: PlatformLanguage;
  userName: string;
  regionName: string;
  districtName: string;
  dashboard: DashboardResponse | null;
  isLoading: boolean;
  error: boolean;
  onRetry: () => void;
  onAddPlot: () => void;
  onHelp: () => void;
  setActiveTab: (tab: AppTab) => void;
  setSelectedCropCard: (crop: DashboardCrop | null) => void;
}

export default function HomeView({
  language,
  userName,
  regionName,
  districtName,
  dashboard,
  isLoading,
  error,
  onRetry,
  onAddPlot,
  onHelp,
  setActiveTab,
  setSelectedCropCard,
}: HomeViewProps) {
  const kk = language === "kk";
  const number = (value: number) =>
    value.toLocaleString(kk ? "kk-KZ" : "ru-RU", { maximumFractionDigits: 1 });
  const hasPlots = (dashboard?.stats.totalPlots ?? 0) > 0;
  const weather = dashboard?.weather;
  const news = dashboard?.infoCenter.find((item) => item.category === "news");
  const actions = [
    {
      tab: "map",
      icon: Map,
      title: kk ? "Менің егістіктерім" : "Мои поля",
      hint: kk ? "Карта және егістікке күтім" : "Карта и уход за посевами",
    },
    {
      tab: "market",
      icon: ShoppingBasket,
      title: kk ? "Сатып алу және сату" : "Купить или продать",
      hint: kk ? "Өнімдер мен хабарландырулар" : "Урожай и объявления",
    },
    {
      tab: "chat",
      icon: MessageCircle,
      title: kk ? "Хабарлама жазу" : "Написать сообщение",
      hint: kk
        ? "Фермерлермен және сатып алушылармен байланыс"
        : "Фермерам и покупателям",
    },
  ] as const;

  return (
    <section
      className="app-scroll-page"
      aria-label={kk ? "Басты бет" : "Главная"}
    >
      <div className="app-page-content">
        <header className="mb-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-xl font-bold text-primary">
              <Sprout className="size-7" aria-hidden="true" />
              Egin-KZ
            </span>
            <button onClick={onHelp} className="secondary-action gap-2">
              <CircleHelp className="size-5" aria-hidden="true" />
              {kk ? "Көмек" : "Помощь"}
            </button>
          </div>
          <h1 className="page-title">
            {kk ? `Сәлеметсіз бе, ${userName}` : `Здравствуйте, ${userName}`}
          </h1>
          {(regionName || districtName) && (
            <p className="mt-2 flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              {[regionName, districtName].filter(Boolean).join(", ")}
            </p>
          )}
        </header>

        <section aria-labelledby="home-actions">
          <h2 id="home-actions" className="section-title mb-3">
            {kk ? "Не істегіңіз келеді?" : "Что хотите сделать?"}
          </h2>
          <div className="surface divide-y divide-border">
            {actions.map(({ tab, icon: Icon, title, hint }) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="navigation-row"
              >
                <Icon
                  className="size-7 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-semibold">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">
                    {hint}
                  </span>
                </span>
                <ChevronRight
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>

        {isLoading && !dashboard ? (
          <div className="surface mt-6 p-5" role="status">
            <p>{kk ? "Деректер жүктелуде…" : "Загружаем данные хозяйства…"}</p>
            <div className="mt-4 h-20 animate-pulse rounded-xl bg-muted" />
          </div>
        ) : error ? (
          <div className="surface mt-6 p-5" role="alert">
            <h2 className="section-title">
              {kk ? "Деректер жүктелмеді" : "Не удалось загрузить данные"}
            </h2>
            <p className="my-3 text-muted-foreground">
              {kk
                ? "Интернет байланысын тексеріп, қайталап көріңіз."
                : "Проверьте интернет и попробуйте ещё раз."}
            </p>
            <button onClick={onRetry} className="secondary-action">
              <RefreshCw className="size-5" aria-hidden="true" />
              {kk ? "Қайталау" : "Попробовать снова"}
            </button>
          </div>
        ) : dashboard && !hasPlots ? (
          <section className="mt-6 rounded-2xl bg-primary p-5 text-primary-foreground">
            <h2 className="section-title">
              {kk
                ? "Алғашқы егістігіңізді қосыңыз"
                : "Добавьте своё первое поле"}
            </h2>
            <p className="mt-2 leading-relaxed">
              {kk
                ? "Картада шекарасын белгілеңіз. Егістік пен дақыл туралы ақпарат осында пайда болады."
                : "Отметьте его границы на карте. Здесь появятся сведения о поле и вашей культуре."}
            </p>
            <button
              onClick={onAddPlot}
              className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-[#245631]"
            >
              <Plus className="size-5" aria-hidden="true" />
              {kk ? "Егістік қосу" : "Добавить поле"}
            </button>
          </section>
        ) : null}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
          <section className="surface p-5" aria-labelledby="home-weather">
            <div className="flex items-center gap-3">
              <CloudSun className="size-7 text-primary" aria-hidden="true" />
              <h2 id="home-weather" className="section-title">
                {kk ? "Бүгінгі ауа райы" : "Погода сегодня"}
              </h2>
            </div>
            {weather?.today?.temperature != null && (
              <p className="mt-3 text-3xl font-semibold tabular-nums">
                {Math.round(weather.today.temperature)}°
              </p>
            )}
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {weather?.summary ||
                (kk
                  ? "Ауа райы деректері әзірге жоқ."
                  : "Данные о погоде пока недоступны.")}
            </p>
            {weather?.source === "plot" && weather.plotTitle && (
              <p className="mt-2 text-sm text-muted-foreground">
                {weather.plotTitle}
              </p>
            )}
            {weather?.forecast.length ? (
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                {weather.forecast.slice(0, 3).map((day) => (
                  <div key={day.day} className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                      {new Date(day.day).toLocaleDateString(
                        kk ? "kk-KZ" : "ru-RU",
                        { day: "numeric", month: "short" },
                      )}
                    </p>
                    <p className="mt-1 text-xl font-semibold">
                      {day.tempMax == null
                        ? "—"
                        : `${Math.round(day.tempMax)}°`}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {day.summary}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          {dashboard && hasPlots && (
            <section className="surface p-5" aria-labelledby="home-farm">
              <h2 id="home-farm" className="section-title">
                {kk ? "Менің шаруашылығым" : "Моё хозяйство"}
              </h2>
              <dl className="mt-4 space-y-3">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {kk ? "Егістіктер" : "Полей"}
                  </dt>
                  <dd className="font-semibold">
                    {number(dashboard.stats.totalPlots)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">
                    {kk ? "Жалпы аумағы" : "Общая площадь"}
                  </dt>
                  <dd className="font-semibold">
                    {number(dashboard.stats.totalAreaHectares)}{" "}
                    {kk ? "га" : "га"}
                  </dd>
                </div>
              </dl>
              <button
                onClick={onAddPlot}
                className="secondary-action mt-5 w-full"
              >
                <Plus className="size-5" aria-hidden="true" />
                {kk ? "Егістік қосу" : "Добавить поле"}
              </button>
            </section>
          )}
        </div>

        {!!dashboard?.crops.length && (
          <section className="mt-8" aria-labelledby="home-crops">
            <h2 id="home-crops" className="section-title mb-3">
              {kk ? "Менің дақылдарым" : "Что растёт на моих полях"}
            </h2>
            <div className="surface divide-y divide-border">
              {dashboard.crops.map((crop) => (
                <button
                  key={crop.cropType}
                  className="navigation-row"
                  onClick={() => setSelectedCropCard(crop)}
                >
                  <Sprout
                    className="size-6 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                  <span className="flex-1">
                    <span className="block text-lg font-semibold">
                      {crop.cropType}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {number(crop.areaHectares)} га ·{" "}
                      {kk ? "Күтім және жинау мерзімі" : "Уход и сроки сбора"}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-5 shrink-0"
                    aria-hidden="true"
                  />
                </button>
              ))}
            </div>
          </section>
        )}

        {dashboard && hasPlots && (
          <details className="surface mt-6 p-5">
            <summary className="cursor-pointer text-lg font-semibold">
              {kk ? "Маусым және болжамдар" : "Сезон и прогнозы"}
            </summary>
            <div className="mt-4 space-y-5 leading-relaxed">
              <p>{dashboard.season.summary}</p>
              {dashboard.cropAnalysis && (
                <div>
                  <h3 className="font-semibold">
                    {dashboard.cropAnalysis.cropType}
                  </h3>
                  <p className="mt-2 text-muted-foreground">
                    {dashboard.cropAnalysis.recommendation}
                  </p>
                  <p className="mt-2">
                    {kk ? "Болжамды табыс" : "Ожидаемый доход"}:{" "}
                    {number(dashboard.cropAnalysis.projectedIncomeKzt)} ₸
                  </p>
                </div>
              )}
              {dashboard.forecasts &&
                Object.entries(dashboard.forecasts)
                  .filter(([key]) => key !== "harvest")
                  .map(
                    ([key, forecast]) =>
                      "summary" in forecast && (
                        <p key={key} className="text-muted-foreground">
                          {forecast.summary}
                        </p>
                      ),
                  )}
              <button
                onClick={() => setActiveTab("map")}
                className="secondary-action"
              >
                {kk ? "Картаны ашу" : "Открыть карту"}
                <ArrowRight className="size-5" aria-hidden="true" />
              </button>
            </div>
          </details>
        )}

        <section className="mt-8 border-t border-border pt-6">
          <h2 className="section-title">
            {kk ? "Фермерге пайдалы" : "Полезное для фермера"}
          </h2>
          {news && <p className="mt-3 leading-relaxed">{news.title}</p>}
          <button
            onClick={() => setActiveTab("info")}
            className="secondary-action mt-4"
          >
            {kk ? "Жаңалықтар мен қолдау" : "Новости и поддержка"}
            <ArrowRight className="size-5" aria-hidden="true" />
          </button>
        </section>
      </div>
    </section>
  );
}
