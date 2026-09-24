"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets, Sprout } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { PlatformLanguage } from "@/lib/i18n";
import type { PlotAiAdvice } from "@/lib/dashboard";

type Conditions = {
  calculatedAt: string | null;
  soilMoisturePercent: number | null;
  soilTemperatureC: number | null;
  airHumidityPercent: number | null;
};

export function GardenPlotPanel({
  plotId,
  language,
  withAdvice = true,
}: {
  plotId: string;
  language: PlatformLanguage;
  withAdvice?: boolean;
}) {
  const kk = language === "kk";
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [advice, setAdvice] = useState<PlotAiAdvice | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState(false);
  const adviceRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setConditions(null);
    void fetch(apiUrl(`/farm-plots/${encodeURIComponent(plotId)}/conditions`), {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("agro_token") || ""}`,
      },
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("conditions");
        const json = await response.json();
        if (!controller.signal.aborted) {
          setConditions(json.data?.conditions ?? null);
          setError(json.data?.status !== "ready");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [plotId, retry]);

  useEffect(() => () => adviceRequest.current?.abort(), []);

  const askAdvice = async () => {
    if (adviceRequest.current) return;
    const controller = new AbortController();
    adviceRequest.current = controller;
    setAdviceLoading(true);
    setAdviceError(false);
    try {
      const response = await fetch(
        apiUrl(
          `/farm-plots/${encodeURIComponent(plotId)}/ai-advice?language=${language}`,
        ),
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("agro_token") || ""}`,
          },
          credentials: "include",
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error("advice");
      const json = await response.json();
      if (!json.success || !json.data) throw new Error("advice");
      if (!controller.signal.aborted) setAdvice(json.data);
    } catch {
      if (!controller.signal.aborted) setAdviceError(true);
    } finally {
      adviceRequest.current = null;
      if (!controller.signal.aborted) setAdviceLoading(false);
    }
  };

  const value = (n: number | null | undefined, unit: string) =>
    n == null
      ? "—"
      : `${n.toLocaleString(kk ? "kk-KZ" : "ru-RU", { maximumFractionDigits: 1 })}${unit}`;
  return (
    <div>
      {loading ? (
        <p role="status" className="py-4 text-muted-foreground">
          {kk ? "Топырақ деректері жүктелуде…" : "Загружаем данные о почве…"}
        </p>
      ) : (
        <>
          <dl className="mt-4 divide-y divide-border">
            {[
              [
                kk ? "Топырақ ылғалдылығы" : "Влажность почвы",
                value(conditions?.soilMoisturePercent, "%"),
                kk
                  ? "3–9 см тереңдікте · есептік"
                  : "На глубине 3–9 см · расчётная",
              ],
              [
                kk ? "Топырақ температурасы" : "Температура почвы",
                value(conditions?.soilTemperatureC, "°C"),
                kk ? "6 см тереңдікте" : "На глубине 6 см",
              ],
              [
                kk ? "Ауа ылғалдылығы" : "Влажность воздуха",
                value(conditions?.airHumidityPercent, "%"),
                kk ? "Жерден 2 м биіктікте" : "На высоте 2 м",
              ],
            ].map(([label, metric, hint]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-3 py-3"
              >
                <dt className="min-w-0">
                  <span className="block font-medium">{label}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {hint}
                  </span>
                </dt>
                <dd className="shrink-0 text-2xl font-semibold tabular-nums">
                  {metric}
                </dd>
              </div>
            ))}
          </dl>
          {error && (
            <div role="status" className="mt-3">
              <p>
                {kk
                  ? "Деректер әзірге қолжетімсіз. Учаскенің картадағы шекарасы сақталғанын тексеріңіз."
                  : "Данные пока недоступны. Проверьте, что границы участка сохранены на карте."}
              </p>
              <button
                type="button"
                className="secondary-action mt-3"
                onClick={() => setRetry((n) => n + 1)}
              >
                {kk ? "Қайталау" : "Повторить загрузку"}
              </button>
            </div>
          )}
          {conditions?.calculatedAt && (
            <p className="mt-2 text-sm text-muted-foreground">
              {kk ? "Есеп уақыты: " : "Расчёт на "}
              {new Date(conditions.calculatedAt).toLocaleString(
                kk ? "kk-KZ" : "ru-RU",
                {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                },
              )}
            </p>
          )}
        </>
      )}
      <details className="mt-4 text-sm text-muted-foreground">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-medium underline underline-offset-4">
          <Droplets className="size-4 shrink-0" aria-hidden="true" />
          {kk
            ? "Бұл көрсеткіштер нені білдіреді?"
            : "Что означают эти показатели?"}
        </summary>
        <p className="mt-2 leading-relaxed">
          {kk
            ? "Open-Meteo ауа райы моделі бойынша есеп. Топырақ пайызы — оның көлеміндегі су үлесі. Бұл датчик өлшемі емес: нақты жүйектегі ылғал өзгеше болуы мүмкін. Суармас бұрын тамыр маңындағы жерді тексеріңіз. Қышқылдық пен қоректік құрам үшін топырақ талдауы қажет."
            : "Расчёт погодной модели Open-Meteo. Процент почвы — доля воды в её объёме. Это не показания датчика: на вашей грядке влажность может отличаться. Перед поливом проверьте землю у корней. Кислотность и питательные вещества определяют анализом почвы."}
        </p>
        <a
          href="https://open-meteo.com/"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex min-h-12 items-center underline"
        >
          {kk ? "Дереккөз: Open-Meteo" : "Источник: Open-Meteo"}
        </a>
      </details>
      {withAdvice && (
        <div className="mt-4 border-t border-border pt-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Sprout className="size-5 text-primary" aria-hidden="true" />
            {kk ? "Бақша көмекшісі" : "Помощник по огороду"}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {kk
              ? "ЖИ дақылды, ауа райын және жұмыс журналын ескереді."
              : "ИИ учтёт культуру, погоду и ваш журнал работ."}
          </p>
          <button
            type="button"
            disabled={adviceLoading}
            onClick={() => void askAdvice()}
            className="primary-action mt-4 w-full disabled:opacity-60"
          >
            {adviceLoading
              ? kk
                ? "Кеңес дайындауда…"
                : "Готовим совет…"
              : kk
                ? "Бүгін қалай күтім жасау керек?"
                : "Как ухаживать сегодня?"}
          </button>
          {adviceLoading && (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {kk
                ? "Бұл шамамен жарты минут алады."
                : "Это может занять около половины минуты."}
            </p>
          )}
          {adviceError && (
            <p role="alert" className="mt-3">
              {kk
                ? "Кеңес алынбады. Сәл кейінірек қайталаңыз."
                : "Не удалось получить совет. Попробуйте чуть позже."}
            </p>
          )}
          {advice && (
            <div className="mt-4 space-y-3 leading-relaxed" aria-live="polite">
              <p className="text-sm font-medium text-primary">
                {advice.source === "openai"
                  ? kk
                    ? "ЖИ кеңесі"
                    : "Совет ИИ"
                  : kk
                    ? "Жалпы ұсыныстар"
                    : "Общие рекомендации"}
              </p>
              <h4 className="font-semibold">{advice.title}</h4>
              <p>{advice.summary}</p>
              <ol className="list-decimal space-y-2 pl-5">
                {advice.actions.map((action, i) => (
                  <li key={i}>{action}</li>
                ))}
              </ol>
              {!!advice.risks.length && (
                <div>
                  <h4 className="font-semibold">
                    {kk ? "Нені ескеру керек" : "На что обратить внимание"}
                  </h4>
                  <ul className="mt-2 list-disc space-y-2 pl-5">
                    {advice.risks.map((risk, i) => (
                      <li key={i}>{risk}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {advice.confidenceNote}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function GardenPanel({
  plots,
  language,
  onAddPlot,
}: {
  plots: Array<{ id: string; title: string; cropType?: string | null }>;
  language: PlatformLanguage;
  onAddPlot: () => void;
}) {
  const kk = language === "kk";
  const [selectedId, setSelectedId] = useState("");
  const plot = plots.find((item) => item.id === selectedId) ?? plots[0];
  return (
    <section className="surface mt-6 p-5" aria-labelledby="garden-title">
      <h2 id="garden-title" className="section-title">
        {kk ? "Менің бақшам" : "Мой огород"}
      </h2>
      <p className="mt-2 text-muted-foreground">
        {kk
          ? "Топырақ, ылғал және бүгінгі күтім"
          : "Почва, влажность и уход на сегодня"}
      </p>
      {plot ? (
        <>
          <label htmlFor="garden-plot" className="mb-2 mt-4 block font-medium">
            {kk ? "Учаскені таңдаңыз" : "Выберите участок"}
          </label>
          <select
            id="garden-plot"
            value={plot.id}
            onChange={(event) => setSelectedId(event.target.value)}
            className="min-h-12 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-base"
          >
            {plots.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.cropType ? ` · ${item.cropType}` : ""}
              </option>
            ))}
          </select>
          <GardenPlotPanel
            key={`${plot.id}:${language}`}
            plotId={plot.id}
            language={language}
          />
        </>
      ) : (
        <>
          <p className="mt-4 leading-relaxed">
            {kk
              ? "Бақшаңыздың шекарасын картада белгілеңіз. Ылғал мен температура есебі және күтім кеңестері осында пайда болады."
              : "Отметьте границы огорода на карте. Здесь появятся расчёт влажности, температура почвы и советы по уходу."}
          </p>
          <button
            type="button"
            className="primary-action mt-4 w-full"
            onClick={onAddPlot}
          >
            {kk ? "Бақша қосу" : "Добавить огород"}
          </button>
        </>
      )}
    </section>
  );
}
