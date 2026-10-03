"use client";
import { useCallback, useEffect, useState } from "react";
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    credentials: "same-origin",
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(90000),
  });
  if (!response.ok) {
    const e = await response
      .json()
      .catch(() => ({ detail: "Сервис временно недоступен" }));
    throw new ApiError(
      typeof e.detail === "string"
        ? e.detail
        : Array.isArray(e.detail)
          ? e.detail.map((x: { msg: string }) => x.msg).join("; ")
          : "Ошибка запроса",
      response.status,
    );
  }
  return response.json();
}
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((x) => x + 1), []);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    api<T>(path, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  return { data, error, loading, reload, setData };
}
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
