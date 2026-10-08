"use client";
import { CloudSun, Leaf, Satellite, Waves } from "lucide-react";
import { useApi } from "@/lib/api";
import { Button, ErrorBox, Loading } from "./ui";

type Capability = {
  enabled: boolean;
  configured: boolean;
  status?: string;
  source_url: string;
};
type GoogleStatusResponse = {
  live_access_verified: boolean;
  weather: Capability;
  weathernext: Capability;
  agriculture: Capability;
  earth_engine: Capability;
};

export function GoogleStatus() {
  const result = useApi<GoogleStatusResponse>("/integrations/google");
  const rows = [
    { key: "weather" as const, title: "Погода Google", icon: CloudSun, fallback: "Сейчас доступен прогноз Open-Meteo.", description: "Текущие условия, прогноз и последние 24 часа." },
    { key: "weathernext" as const, title: "WeatherNext 3", icon: Waves, fallback: "Нужен доступ Google к прогнозам WeatherNext.", description: "Прогноз с диапазоном возможных значений для поля." },
    { key: "earth_engine" as const, title: "Спутниковые наблюдения", icon: Satellite, fallback: "Нужно подключение Earth Engine на сервере.", description: "Индексы растительности по снимкам Sentinel-2." },
    { key: "agriculture" as const, title: "Google ALU / AMED", icon: Leaf, fallback: "Казахстан пока не поддерживается. Ваши контуры полей доступны.", description: "Распознавание контуров и сезонов выращивания." },
  ];
  return (
    <section className="panel settings-panel" aria-labelledby="google-sources-heading">
      <div className="section-heading"><h2 id="google-sources-heading">Источники данных</h2></div>
      <p>Доступность дополнительных источников. Ключи подключаются на сервере.</p>
      {result.loading && !result.data && <Loading />}
      {result.error && <ErrorBox message={result.error} onRetry={result.reload} />}
      {result.data && rows.map(({ key, title, icon: Icon, description, fallback }) => {
        const item = result.data![key];
        return (
          <article className="field-note" key={key}>
            <h3><Icon size={19} aria-hidden="true" /> {title}</h3>
            <p>{description}</p>
            <p className="note">
              {item.status === "unsupported_region" ? fallback
                : item.configured ? "Настройки заданы. Доступ к данным ещё не подтверждён живым запросом."
                  : fallback}
            </p>
            <a className="text-link" href={item.source_url} target="_blank" rel="noreferrer">Условия доступа</a>
          </article>
        );
      })}
      <Button variant="secondary" onClick={result.reload}>Обновить статус источников</Button>
    </section>
  );
}
