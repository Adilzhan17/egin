"use client";
import {
  Sun,
  Moon,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Droplets,
  Wind,
  MapPin,
} from "lucide-react";
import type { Weather } from "@/lib/types";
import { fmt } from "@/lib/api";
import { SourceLabel } from "./ui";
export function WeatherIcon({
  code,
  night = false,
  size = 24,
}: {
  code?: number;
  night?: boolean;
  size?: number;
}) {
  const Icon =
    code == null
      ? Cloud
      : code === 0
        ? night
          ? Moon
          : Sun
        : code <= 2
          ? CloudSun
          : code === 3
            ? Cloud
            : code <= 48
              ? CloudFog
              : code >= 95
                ? CloudLightning
                : [71, 73, 75, 77, 85, 86].includes(code)
                  ? CloudSnow
                  : CloudRain;
  return <Icon size={size} />;
}
export function WeatherCard({
  value,
  fieldName,
  compact = false,
}: {
  value: Weather;
  fieldName?: string;
  compact?: boolean;
}) {
  const today = value.timezone
    ? new Intl.DateTimeFormat("en-CA", {
        timeZone: value.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date())
    : "";
  return (
    <section
      className={"panel weather-panel " + (compact ? "weather-home" : "")}
    >
      <div className="section-heading">
        <h2>
          <MapPin size={17} />
          {fieldName || "Погода поля"}
        </h2>
        <WeatherIcon
          code={value.current?.weather_code}
          night={value.current?.is_day === 0}
          size={38}
        />
      </div>
      {value.current && (
        <div className="weather-now">
          <strong>{fmt(value.current.temperature_2m, 0)}°</strong>
          <div>
            <span>
              Ощущается как {fmt(value.current.apparent_temperature, 0)}°
            </span>
            <small>
              {value.current.time?.replace("T", " · ")} · {value.timezone}
            </small>
          </div>
        </div>
      )}
      <div className="weather-metrics">
        <span>
          <Droplets size={16} />
          Влажность
          <strong>{fmt(value.current?.relative_humidity_2m, 0)}%</strong>
        </span>
        <span>
          <CloudRain size={16} />
          Осадки<strong>{fmt(value.current?.precipitation)} мм</strong>
        </span>
        <span>
          <Wind size={16} />
          Ветер<strong>{fmt(value.current?.wind_speed_10m)} км/ч</strong>
        </span>
      </div>
      {!compact && value.days && (
        <div className="weather-week">
          {value.days.map((d) => (
            <div className="weather-day" key={d.date}>
              <span>
                {d.date === today
                  ? "Сегодня"
                  : new Date(d.date + "T12:00:00Z").toLocaleDateString(
                      "ru-RU",
                      { timeZone: "UTC", weekday: "short", day: "numeric" },
                    )}
              </span>
              <WeatherIcon code={d.weather_code} />
              <strong>
                {fmt(d.temperature_2m_max, 0)}°{" "}
                <small>{fmt(d.temperature_2m_min, 0)}°</small>
              </strong>
              <span className="rain">{fmt(d.precipitation_sum)} мм</span>
              <small>{d.precipitation_probability_max}%</small>
              <span className="wind">{fmt(d.wind_speed_10m_max, 0)} км/ч</span>
            </div>
          ))}
        </div>
      )}
      {!value.current && <p>{value.message || "Погода временно недоступна"}</p>}
      <SourceLabel value={value} />
      {!compact && value.requested_coordinates && (
        <p className="footnote">
          Центроид поля: {value.requested_coordinates.lat.toFixed(5)},{" "}
          {value.requested_coordinates.lon.toFixed(5)}. Прогноз рассчитан для
          ближайшей ячейки погодной модели.
        </p>
      )}
    </section>
  );
}
