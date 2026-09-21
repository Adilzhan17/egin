"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BadgeAlert,
  ExternalLink,
  FileText,
  Globe2,
  Landmark,
  Newspaper,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { PlatformLanguage } from "@/lib/i18n";

type InfoCenterCategoryKey =
  | "all"
  | "news"
  | "subsidies"
  | "export"
  | "import"
  | "prices";

type InfoCenterItem = {
  id: string;
  category: Exclude<InfoCenterCategoryKey, "all">;
  categoryLabel: string;
  title: string;
  summary: string;
  content: string;
  status: "new" | "important" | "update";
  region: string | null;
  sourceLabel: string | null;
  actionLabel: string;
  actionUrl: string | null;
  imageUrl: string | null;
  publishedAt: string;
  isFeatured: boolean;
};

type Category = {
  key: Exclude<InfoCenterCategoryKey, "all">;
  label: string;
};

const categoryIcons = {
  news: Newspaper,
  subsidies: Landmark,
  export: Globe2,
  import: FileText,
  prices: TrendingUp,
} as const;

const buildTeaser = (text: string, maxLength = 120) => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const firstSentence = normalized.match(/^.*?[.!?](\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= maxLength) {
    return firstSentence;
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
};

export default function InfoCenterView({
  language,
  onBack,
}: {
  language: PlatformLanguage;
  onBack: () => void;
}) {
  const [items, setItems] = useState<InfoCenterItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [activeCategory, setActiveCategory] = useState<InfoCenterCategoryKey>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<InfoCenterItem | null>(null);

  const copy =
    language === "kk"
      ? {
          eyebrow: "Инфоорталық",
          title: "Жаңалықтар мен пайдалы ақпарат",
          subtitle:
            "Қысқа шолу, сосын қажет болса дереккөзге өтіңіз.",
          all: "Барлығы",
          back: "Артқа",
          open: "Толығырақ",
          sourceFirst: "Толық материал дереккөзде ашылады.",
          sourceOpen: "Дереккөз",
          refresh: "Жаңарту",
          loading: "Ресми материалдар жүктелуде...",
          empty: "Бұл санатта материал әзірге жоқ.",
          error: "Ресми инфоорталықты жүктеу мүмкін болмады.",
          featured: "Негізгі",
          source: "Дереккөз",
          region: "Өңір",
          statuses: {
            new: "Жаңа",
            important: "Маңызды",
            update: "Жаңарту",
          },
        }
      : {
          eyebrow: "Инфоцентр",
          title: "Новости и полезная информация",
          subtitle:
            "Короткая сводка, дальше только переход к источнику.",
          all: "Все",
          back: "Назад",
          open: "Подробнее",
          sourceFirst: "Полный материал открывается у источника.",
          sourceOpen: "Источник",
          refresh: "Обновить",
          loading: "Загружаем официальные материалы...",
          empty: "В этой категории материалов пока нет.",
          error: "Не удалось загрузить официальный инфоцентр.",
          featured: "Важное",
          source: "Источник",
          region: "Регион",
          statuses: {
            new: "Новое",
            important: "Важно",
            update: "Обновление",
          },
        };

  const openSource = (url: string | null) => {
    if (!url || typeof window === "undefined") {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  const fetchData = async (forceRefresh = false) => {
    const token = localStorage.getItem("agro_token");
    if (!token) {
      setItems([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }

    setErrorMessage(null);
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (activeCategory !== "all") {
        params.set("category", activeCategory);
      }
      if (forceRefresh) {
        params.set("refresh", "true");
      }

      const [categoriesRes, feedRes] = await Promise.all([
        fetch(apiUrl("/info-center/categories"), {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(apiUrl(`/info-center/feed${params.toString() ? `?${params.toString()}` : ""}`), {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const [categoriesJson, feedJson] = await Promise.all([
        categoriesRes.json(),
        feedRes.json(),
      ]);

      if (categoriesJson.success) {
        setCategories(categoriesJson.data);
      }
      if (feedJson.success) {
        setItems(feedJson.data);
      } else {
        setItems([]);
        setErrorMessage(copy.error);
      }
    } catch {
      setItems([]);
      setErrorMessage(copy.error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeCategory]);

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-[#EEF3EA] dark:bg-[#002115] dark:text-white transition-colors pb-28">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 pt-5 pb-6 lg:px-6">
        <Card className="rounded-[2rem] border-[#DCE8D7] bg-[#17381C] p-5 text-white shadow-[0_24px_80px_rgba(10,26,14,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-white/70">
                {copy.eyebrow}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">
                {copy.title}
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/72">
                {copy.subtitle}
              </p>
            </div>
            <Button
              onClick={onBack}
              className="h-11 rounded-full bg-white/10 px-4 text-sm font-black text-white hover:bg-white/15"
            >
              <ArrowLeft className="size-4" />
              {copy.back}
            </Button>
          </div>
          <div className="mt-4">
            <Button
              onClick={() => fetchData(true)}
              className="h-10 rounded-full bg-white/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-white hover:bg-white/15"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {copy.refresh}
            </Button>
          </div>
        </Card>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${
              activeCategory === "all"
                ? "border-[#17381C] bg-[#17381C] text-white"
                : "border-[#DCE8D7] bg-white text-[#17381C]"
            }`}
          >
            {copy.all}
          </button>
          {categories.map((category) => {
            const Icon = categoryIcons[category.key];
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.16em] ${
                  activeCategory === category.key
                    ? "border-[#17381C] bg-[#17381C] text-white"
                    : "border-[#DCE8D7] bg-white text-[#17381C]"
                }`}
              >
                <Icon className="size-3.5" />
                {category.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-6 text-sm text-[#2F6B3D]/72">
            {copy.loading}
          </Card>
        ) : errorMessage ? (
          <Card className="rounded-[2rem] border-[#F2D4D4] bg-[#FFF5F5] p-6 text-sm text-[#8C2E2E]">
            {errorMessage}
          </Card>
        ) : items.length === 0 ? (
          <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-6 text-sm text-[#2F6B3D]/72">
            {copy.empty}
          </Card>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => {
              const Icon = categoryIcons[item.category];
              const isNews = item.category === "news";
              return (
                <Card
                  key={item.id}
                  className={`overflow-hidden rounded-[2rem] border-[#DCE8D7] bg-white shadow-[0_20px_70px_rgba(17,45,22,0.08)] ${isNews ? "p-0" : "p-5"}`}
                >
                  {isNews ? (
                    <>
                      <div
                        className="min-h-[16rem] bg-[#17381C]"
                        style={{
                          backgroundImage: item.imageUrl
                            ? `linear-gradient(180deg, rgba(15,31,19,0.08) 0%, rgba(15,31,19,0.82) 100%), url(${item.imageUrl})`
                            : "linear-gradient(135deg, #17381C 0%, #2F6B3D 55%, #7DA65A 100%)",
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                      >
                        <div className="flex min-h-[16rem] flex-col justify-end px-5 py-5 text-white">
                          <div className="flex items-center justify-between gap-3">
                            <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white/92 backdrop-blur-md">
                              <Newspaper className="size-3.5" />
                              {item.categoryLabel}
                            </div>
                            <div className="rounded-full bg-[#F3EFE2] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#7D692F]">
                              {copy.statuses[item.status]}
                            </div>
                          </div>
                          <h2 className="mt-4 max-w-xl text-2xl font-black leading-tight">
                            {item.title}
                          </h2>
                          <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80">
                            {buildTeaser(item.summary, 110)}
                          </p>
                        </div>
                      </div>
                      <div className="p-5">
                        <p className="text-sm text-[#2F6B3D]/72">
                          {copy.sourceFirst}
                        </p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {item.isFeatured ? (
                            <div className="inline-flex items-center gap-2 rounded-full bg-[#17381C] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                              <BadgeAlert className="size-3.5" />
                              {copy.featured}
                            </div>
                          ) : null}
                          {item.sourceLabel ? (
                            <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                              {copy.source}: {item.sourceLabel}
                            </div>
                          ) : null}
                          {item.publishedAt ? (
                            <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                              {new Date(item.publishedAt).toLocaleDateString(
                                language === "kk" ? "kk-KZ" : "ru-RU",
                              )}
                            </div>
                          ) : null}
                        </div>
                        <div className="mt-5 flex gap-2">
                          <Button
                            onClick={() => setSelectedItem(item)}
                            className="h-11 rounded-full bg-[#2F6B3D] px-4 text-sm font-black text-white hover:bg-[#285b34]"
                          >
                            {copy.open}
                          </Button>
                          <Button
                            onClick={() => openSource(item.actionUrl)}
                            className="h-11 rounded-full bg-[#E9F1E5] px-4 text-sm font-black text-[#17381C] hover:bg-[#dbe7d5]"
                          >
                            <ExternalLink className="size-4" />
                            {copy.sourceOpen}
                          </Button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-11 items-center justify-center rounded-full bg-[#F5F8F1] text-[#2F6B3D]">
                            <Icon className="size-5" />
                          </div>
                          <div>
                            <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2F6B3D]/65">
                              {item.categoryLabel}
                            </p>
                            <h2 className="mt-1 text-lg font-black text-[#18351D]">
                              {item.title}
                            </h2>
                          </div>
                        </div>
                        <div className="rounded-full bg-[#F3EFE2] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#7D692F]">
                          {copy.statuses[item.status]}
                        </div>
                      </div>

                      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#2F6B3D]/76">
                        {buildTeaser(item.summary, 118)}
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.isFeatured ? (
                          <div className="inline-flex items-center gap-2 rounded-full bg-[#17381C] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                            <BadgeAlert className="size-3.5" />
                            {copy.featured}
                          </div>
                        ) : null}
                        {item.sourceLabel ? (
                          <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                            {copy.source}: {item.sourceLabel}
                          </div>
                        ) : null}
                        {item.region ? (
                          <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                            {copy.region}: {item.region}
                          </div>
                        ) : null}
                        {item.publishedAt ? (
                          <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                            {new Date(item.publishedAt).toLocaleDateString(
                              language === "kk" ? "kk-KZ" : "ru-RU",
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-5 flex gap-2">
                        <Button
                          onClick={() => setSelectedItem(item)}
                          className="h-11 rounded-full bg-[#2F6B3D] px-4 text-sm font-black text-white hover:bg-[#285b34]"
                        >
                          {copy.open}
                        </Button>
                        <Button
                          onClick={() => openSource(item.actionUrl)}
                          className="h-11 rounded-full bg-[#E9F1E5] px-4 text-sm font-black text-[#17381C] hover:bg-[#dbe7d5]"
                        >
                          <ExternalLink className="size-4" />
                          {copy.sourceOpen}
                        </Button>
                      </div>
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {selectedItem ? (
          <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
            <div className="absolute inset-0" onClick={() => setSelectedItem(null)} />
            <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-[#F4EFE6] shadow-[0_30px_100px_rgba(13,30,17,0.3)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/45 bg-white/60 px-5 py-5 backdrop-blur-xl">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
                    {selectedItem.categoryLabel}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-[#17381C]">
                    {selectedItem.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="flex size-11 items-center justify-center rounded-full bg-white text-[#17381C] shadow-sm transition-colors hover:bg-[#efe7d6]"
                >
                  <X className="size-5" />
                </button>
              </div>

              <div className="overflow-y-auto px-5 py-5">
                <div
                  className="rounded-[1.6rem] bg-[#17381C]"
                  style={{
                    minHeight: "14rem",
                    backgroundImage: selectedItem.imageUrl
                      ? `linear-gradient(180deg, rgba(15,31,19,0.08) 0%, rgba(15,31,19,0.82) 100%), url(${selectedItem.imageUrl})`
                      : "linear-gradient(135deg, #17381C 0%, #2F6B3D 55%, #7DA65A 100%)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="rounded-full bg-[#17381C] px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-white">
                    {copy.statuses[selectedItem.status]}
                  </div>
                  {selectedItem.sourceLabel ? (
                    <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      {copy.source}: {selectedItem.sourceLabel}
                    </div>
                  ) : null}
                  {selectedItem.publishedAt ? (
                    <div className="rounded-full bg-white px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      {new Date(selectedItem.publishedAt).toLocaleDateString(
                        language === "kk" ? "kk-KZ" : "ru-RU",
                      )}
                    </div>
                  ) : null}
                </div>

                <p className="mt-5 text-base font-black leading-relaxed text-[#17381C]">
                  {buildTeaser(selectedItem.summary, 160)}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[#2F6B3D]/72">
                  {copy.sourceFirst}
                </p>
              </div>

              <div className="border-t border-white/45 bg-white/60 px-5 py-4 backdrop-blur-xl">
                <div className="flex gap-2">
                  <Button
                    onClick={() => openSource(selectedItem.actionUrl)}
                    className="h-12 flex-1 rounded-[1rem] bg-[#2F6B3D] text-sm font-black text-white hover:bg-[#285b34]"
                  >
                    <ExternalLink className="size-4" />
                    {copy.sourceOpen}
                  </Button>
                  <Button
                    onClick={() => setSelectedItem(null)}
                    className="h-12 rounded-[1rem] bg-[#E9F1E5] px-4 text-sm font-black text-[#17381C] hover:bg-[#dbe7d5]"
                  >
                    {copy.back}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
