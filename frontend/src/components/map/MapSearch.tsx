"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Search, X, MapPin } from "lucide-react";
import { apiUrl } from "@/lib/api";
import type { PlatformLanguage } from "@/lib/i18n";

type Place = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  zoom: number;
};

export default function MapSearch({
  language,
  onSelect,
}: {
  language: PlatformLanguage;
  onSelect: (center: [number, number], zoom: number) => void;
}) {
  const kk = language === "kk";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  const cancel = () => {
    pending.current?.abort();
    pending.current = null;
    setLoading(false);
  };
  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    cancel();
    setResults(null);
    setError(null);
    if (query.trim().length < 3) {
      setError(
        kk ? "Кемінде 3 таңба енгізіңіз." : "Введите не меньше 3 символов.",
      );
      return;
    }
    event.currentTarget.querySelector("input")?.blur();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: query.trim(), language });
      const response = await fetch(apiUrl(`/places/search?${params}`), {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("agro_token") || ""}`,
        },
        credentials: "include",
        signal: controller.signal,
      });
      if (response.status === 429) throw new Error("limit");
      if (!response.ok) throw new Error("search");
      const json = await response.json();
      if (!Array.isArray(json.data)) throw new Error("search");
      if (!controller.signal.aborted) setResults(json.data);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error && reason.message === "limit"
            ? kk
              ? "Бірнеше секундтан кейін қайталаңыз."
              : "Попробуйте ещё раз через несколько секунд."
            : kk
              ? "Іздеу уақытша қолжетімсіз. Қайталап көріңіз."
              : "Поиск временно недоступен. Попробуйте снова.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        pending.current = null;
      }
    }
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) cancel();
      }}
    >
      <Dialog.Trigger asChild>
        <button type="button" className="secondary-action shrink-0 gap-2 px-3">
          <Search className="size-5" aria-hidden="true" />
          {kk ? "Іздеу" : "Поиск"}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40" />
        <Dialog.Content className="fixed inset-x-3 top-[max(12px,env(safe-area-inset-top))] z-[71] mx-auto max-h-[calc(100dvh-24px)] max-w-lg overflow-y-auto rounded-2xl bg-background p-5 text-foreground shadow-xl sm:top-12">
          <div className="flex items-start justify-between gap-2">
            <Dialog.Title className="section-title pt-2">
              {kk ? "Мекенжайды табу" : "Найти город или адрес"}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                className="secondary-action size-12 shrink-0 p-0"
                aria-label={kk ? "Жабу" : "Закрыть поиск"}
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-2 leading-relaxed text-muted-foreground">
            {kk
              ? "Қазақстандағы қала, аудан немесе көше атауын жазыңыз."
              : "Введите город, район или улицу в Казахстане."}
          </Dialog.Description>
          <form onSubmit={(event) => void search(event)} className="mt-5">
            <label htmlFor="map-address" className="mb-2 block font-medium">
              {kk ? "Қала, аудан, мекенжай" : "Город, район, адрес"}
            </label>
            <input
              id="map-address"
              type="search"
              value={query}
              maxLength={200}
              autoComplete="off"
              enterKeyHint="search"
              placeholder={
                kk ? "Мысалы: Алматы, Абай 10" : "Например: Алматы, Абая 10"
              }
              onChange={(event) => {
                cancel();
                setQuery(event.target.value);
                setResults(null);
                setError(null);
              }}
              className="min-h-12 w-full rounded-xl border border-border bg-card px-3 text-base"
            />
            <button
              type="submit"
              disabled={loading}
              className="primary-action mt-3 w-full disabled:opacity-60"
            >
              {loading
                ? kk
                  ? "Іздеуде…"
                  : "Ищем…"
                : kk
                  ? "Картадан табу"
                  : "Найти на карте"}
            </button>
          </form>
          {error && (
            <p role="alert" className="mt-4">
              {error}
            </p>
          )}
          <div role="status" className="mt-4">
            {results?.length === 0
              ? kk
                ? "Ештеңе табылмады. Қала атауын қосыңыз немесе мекенжайды қысқартыңыз."
                : "Ничего не найдено. Добавьте название города или сократите адрес."
              : results
                ? kk
                  ? "Керек орынды таңдаңыз:"
                  : "Выберите нужное место:"
                : null}
          </div>
          {!!results?.length && (
            <ul className="mt-2 divide-y divide-border">
              {results.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect([place.lng, place.lat], place.zoom);
                      setOpen(false);
                      cancel();
                    }}
                    className="flex min-h-14 w-full items-start gap-3 rounded-lg py-4 text-left leading-relaxed hover:bg-muted"
                  >
                    <MapPin
                      className="mt-1 size-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{place.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex min-h-12 items-center text-sm text-muted-foreground underline"
          >
            © OpenStreetMap contributors
          </a>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
