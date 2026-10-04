"use client";
export { api, ApiError } from "./transport";
export { useQuery as useApi } from "./query-store";
export const fmt = (n: number | undefined, decimals = 1) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        maximumFractionDigits: decimals,
      }).format(n);
export const date = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
export const cropNames: Record<string, string> = {
  wheat: "Пшеница",
  barley: "Ячмень",
  sunflower: "Подсолнечник",
  maize: "Кукуруза",
  lentil: "Чечевица",
  flax: "Лён",
};

// Same-origin bridge used by the retained original GIS modules.
export const apiUrl = (path: string) => "/api" + path;
