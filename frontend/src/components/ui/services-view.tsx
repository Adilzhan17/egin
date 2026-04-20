"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Clock3,
  ExternalLink,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Star,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { PlatformLanguage } from "@/lib/i18n";

type ServiceCategoryKey =
  | "machinery_rental"
  | "plowing"
  | "sowing"
  | "fertilizer"
  | "delivery"
  | "storage"
  | "agronomist"
  | "labor"
  | "irrigation"
  | "repair";

type ServiceItem = {
  id: string;
  category: ServiceCategoryKey;
  categoryLabel: string;
  title: string;
  description: string;
  priceFrom: number;
  currency: string;
  urgentAvailable: boolean;
  availability: string;
  serviceArea: string | null;
  responseSlaHours: number;
  isActive?: boolean;
  country: string;
  region: string;
  district: string;
  locality: string;
  rating: number;
  reviewsCount: number;
  completedJobs: number;
  imageUrl: string | null;
  provider: {
    id: string;
    fullName: string;
    region: string;
    district: string;
    stats?: {
      activeServices: number;
      totalReviews: number;
      totalCompletedJobs: number;
      averageRating: number;
    };
  };
};

type ServiceCategory = {
  key: ServiceCategoryKey;
  label: string;
};

export default function ServicesView({
  language,
}: {
  language: PlatformLanguage;
}) {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [selectedDistrict, setSelectedDistrict] = useState<string>("all");
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isStartingChat, setIsStartingChat] = useState(false);

  const copy =
    language === "kk"
      ? {
          eyebrow: "Қызметтер",
          title: "Фермерге арналған қызметтер",
          subtitle:
            "Техника, полив, агроном, жеткізу және далалық көмек бойынша маман табыңыз.",
          all: "Барлығы",
          urgent: "Шұғыл",
          refresh: "Жаңарту",
          loading: "Қызметтер жүктелуде...",
          error: "Қызметтерді жүктеу мүмкін болмады.",
          empty: "Сүзгі бойынша қызмет табылмады.",
          region: "Облыс",
          district: "Аудан",
          priceFrom: "Баға",
          urgentAvailable: "Шұғыл шығады",
          availability: "Қолжетімділік",
          serviceArea: "Қызмет аймағы",
          sla: "Жауап SLA",
          completed: "Жұмыс",
          reviews: "Пікір",
          provider: "Орындаушы",
          open: "Толығырақ",
          chat: "Чат ашу",
          source: "Сыртқы сілтеме",
          allRegions: "Барлық облыс",
          allDistricts: "Барлық аудан",
        }
      : {
          eyebrow: "Услуги",
          title: "Сервисы для фермера",
          subtitle:
            "Найдите технику, полив, агронома, доставку и полевые услуги внутри платформы.",
          all: "Все",
          urgent: "Срочно",
          refresh: "Обновить",
          loading: "Загружаем услуги...",
          error: "Не удалось загрузить услуги.",
          empty: "По текущим фильтрам услуги не найдены.",
          region: "Область",
          district: "Район",
          priceFrom: "Цена",
          urgentAvailable: "Срочный выезд",
          availability: "Доступность",
          serviceArea: "Зона работы",
          sla: "SLA ответа",
          completed: "Сделок",
          reviews: "Отзывов",
          provider: "Исполнитель",
          open: "Подробнее",
          chat: "Открыть чат",
          source: "Внешняя ссылка",
          allRegions: "Все области",
          allDistricts: "Все районы",
        };

  const regionOptions = useMemo(
    () => Array.from(new Set(services.map((service) => service.region))),
    [services],
  );

  const districtOptions = useMemo(() => {
    const base = selectedRegion === "all"
      ? services
      : services.filter((service) => service.region === selectedRegion);
    return Array.from(new Set(base.map((service) => service.district)));
  }, [services, selectedRegion]);

  const fetchServices = async (forceRefresh = false) => {
    setErrorMessage(null);
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const params = new URLSearchParams();
      if (selectedCategory !== "all") {
        params.set("category", selectedCategory);
      }
      if (selectedRegion !== "all") {
        params.set("region", selectedRegion);
      }
      if (selectedDistrict !== "all") {
        params.set("district", selectedDistrict);
      }
      if (urgentOnly) {
        params.set("urgent", "true");
      }

      const [categoriesRes, servicesRes] = await Promise.all([
        fetch(apiUrl("/services/categories")),
        fetch(apiUrl(`/services${params.toString() ? `?${params.toString()}` : ""}`)),
      ]);

      const [categoriesJson, servicesJson] = await Promise.all([
        categoriesRes.json(),
        servicesRes.json(),
      ]);

      if (categoriesJson.success) {
        setCategories(categoriesJson.data);
      }
      if (servicesJson.success) {
        setServices(servicesJson.data);
      } else {
        setServices([]);
        setErrorMessage(copy.error);
      }
    } catch {
      setServices([]);
      setErrorMessage(copy.error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [selectedCategory, selectedRegion, selectedDistrict, urgentOnly]);

  const startDirectChat = async (service: ServiceItem) => {
    const token = localStorage.getItem("agro_token");
    if (!token) {
      setErrorMessage(
        language === "kk"
          ? "Чат үшін жүйеге кіру керек."
          : "Для чата нужно войти в аккаунт.",
      );
      return;
    }

    setIsStartingChat(true);
    try {
      const res = await fetch(apiUrl("/chats/direct"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          participantUserId: service.provider.id,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        throw new Error("chat");
      }

      setSelectedService(null);
      alert(
        language === "kk"
          ? "Чат ашылды. Маркет бөліміндегі чаттар тізімінен көре аласыз."
          : "Чат открыт. Его можно увидеть в списке чатов в разделе Маркет.",
      );
    } catch {
      setErrorMessage(
        language === "kk"
          ? "Чатты ашу мүмкін болмады."
          : "Не удалось открыть чат.",
      );
    } finally {
      setIsStartingChat(false);
    }
  };

  return (
    <div className="absolute inset-0 z-10 overflow-y-auto bg-[#EEF3EA] dark:bg-[#002115] dark:text-white transition-colors pb-28">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 pt-5 pb-6 lg:px-6">
        <Card className="rounded-[2rem] border-[#DCE8D7] bg-[#17381C] p-5 text-white shadow-[0_24px_80px_rgba(10,26,14,0.18)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/50">
                {copy.eyebrow}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight">
                {copy.title}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/72">
                {copy.subtitle}
              </p>
            </div>
            <Button
              onClick={() => fetchServices(true)}
              className="h-10 rounded-full bg-white/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-white hover:bg-white/15"
            >
              <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {copy.refresh}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-4 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="h-12 rounded-[1rem] bg-[#F5F8F1] px-4 text-sm font-black text-[#17381C] outline-none"
            >
              <option value="all">{copy.all}</option>
              {categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
            <select
              value={selectedRegion}
              onChange={(e) => {
                setSelectedRegion(e.target.value);
                setSelectedDistrict("all");
              }}
              className="h-12 rounded-[1rem] bg-[#F5F8F1] px-4 text-sm font-black text-[#17381C] outline-none"
            >
              <option value="all">{copy.allRegions}</option>
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="h-12 rounded-[1rem] bg-[#F5F8F1] px-4 text-sm font-black text-[#17381C] outline-none"
            >
              <option value="all">{copy.allDistricts}</option>
              {districtOptions.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setUrgentOnly((current) => !current)}
              className={`h-12 rounded-[1rem] px-4 text-sm font-black transition-colors ${
                urgentOnly
                  ? "bg-[#17381C] text-white"
                  : "bg-[#F5F8F1] text-[#17381C]"
              }`}
            >
              <Clock3 className="mr-2 inline size-4" />
              {copy.urgent}
            </button>
          </div>
        </Card>

        {isLoading ? (
          <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-6 text-sm text-[#2F6B3D]/72">
            {copy.loading}
          </Card>
        ) : errorMessage ? (
          <Card className="rounded-[2rem] border-[#F2D4D4] bg-[#FFF5F5] p-6 text-sm text-[#8C2E2E]">
            {errorMessage}
          </Card>
        ) : services.length === 0 ? (
          <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-6 text-sm text-[#2F6B3D]/72">
            {copy.empty}
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {services.map((service) => (
              <Card
                key={service.id}
                className="overflow-hidden rounded-[2rem] border-[#DCE8D7] bg-white p-0 shadow-[0_20px_70px_rgba(17,45,22,0.08)]"
              >
                <div
                  className="min-h-[12rem] bg-[#17381C]"
                  style={{
                    backgroundImage: service.imageUrl
                      ? `linear-gradient(180deg, rgba(15,31,19,0.08) 0%, rgba(15,31,19,0.82) 100%), url(${service.imageUrl})`
                      : "linear-gradient(135deg, #17381C 0%, #2F6B3D 55%, #7DA65A 100%)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div className="flex min-h-[12rem] flex-col justify-end px-5 py-5 text-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/92 backdrop-blur-md">
                        <BriefcaseBusiness className="size-3.5" />
                        {service.categoryLabel}
                      </div>
                      {service.urgentAvailable ? (
                        <div className="rounded-full bg-[#F3EFE2] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#7D692F]">
                          {copy.urgent}
                        </div>
                      ) : null}
                    </div>
                    <h2 className="mt-4 text-2xl font-black leading-tight">
                      {service.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/80">
                      {service.description}
                    </p>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[1.2rem] bg-[#F5F8F1] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                        {copy.priceFrom}
                      </p>
                      <p className="mt-2 text-base font-black text-[#17381C]">
                        {Math.round(service.priceFrom).toLocaleString("ru-RU")} ₸
                      </p>
                    </div>
                    <div className="rounded-[1.2rem] bg-[#F5F8F1] px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                        {copy.provider}
                      </p>
                      <p className="mt-2 text-base font-black text-[#17381C]">
                        {service.provider.fullName}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      <MapPin className="mr-1 inline size-3.5" />
                      {service.region}
                    </div>
                    <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      {copy.sla}: {service.responseSlaHours}ч
                    </div>
                    <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      <Star className="mr-1 inline size-3.5" />
                      {service.rating.toFixed(1)}
                    </div>
                    <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      {copy.reviews}: {service.reviewsCount}
                    </div>
                    <div className="rounded-full bg-[#F5F8F1] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                      {copy.completed}: {service.completedJobs}
                    </div>
                  </div>

                  <div className="mt-5 flex gap-2">
                    <Button
                      onClick={() => setSelectedService(service)}
                      className="h-11 rounded-full bg-[#2F6B3D] px-4 text-sm font-black text-white hover:bg-[#285b34]"
                    >
                      {copy.open}
                    </Button>
                    <Button
                      onClick={() => startDirectChat(service)}
                      className="h-11 rounded-full bg-[#E9F1E5] px-4 text-sm font-black text-[#17381C] hover:bg-[#dbe7d5]"
                    >
                      <MessageCircle className="size-4" />
                      {copy.chat}
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {selectedService ? (
          <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/40 p-3 backdrop-blur-sm sm:items-center">
            <div className="absolute inset-0" onClick={() => setSelectedService(null)} />
            <div className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[2rem] bg-[#F4EFE6] shadow-[0_30px_100px_rgba(13,30,17,0.3)]">
              <div className="flex items-start justify-between gap-4 border-b border-white/45 bg-white/60 px-5 py-5 backdrop-blur-xl">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
                    {selectedService.categoryLabel}
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-[#17381C]">
                    {selectedService.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedService(null)}
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
                    backgroundImage: selectedService.imageUrl
                      ? `linear-gradient(180deg, rgba(15,31,19,0.08) 0%, rgba(15,31,19,0.82) 100%), url(${selectedService.imageUrl})`
                      : "linear-gradient(135deg, #17381C 0%, #2F6B3D 55%, #7DA65A 100%)",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />

                <div className="mt-4 flex flex-wrap gap-2">
                  <div className="rounded-full bg-[#17381C] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                    {selectedService.categoryLabel}
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                    <ShieldCheck className="mr-1 inline size-3.5" />
                    {selectedService.provider.fullName}
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                    <MapPin className="mr-1 inline size-3.5" />
                    {selectedService.region}, {selectedService.district}
                  </div>
                  <div className="rounded-full bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]">
                    {copy.sla}: {selectedService.responseSlaHours}ч
                  </div>
                </div>

                <p className="mt-5 text-base font-black leading-relaxed text-[#17381C]">
                  {selectedService.description}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {copy.priceFrom}
                    </p>
                    <p className="mt-2 text-base font-black text-[#17381C]">
                      {Math.round(selectedService.priceFrom).toLocaleString("ru-RU")} ₸
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {copy.reviews}
                    </p>
                    <p className="mt-2 text-base font-black text-[#17381C]">
                      {selectedService.reviewsCount} • {selectedService.rating.toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {copy.completed}
                    </p>
                    <p className="mt-2 text-base font-black text-[#17381C]">
                      {selectedService.completedJobs}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {copy.urgentAvailable}
                    </p>
                    <p className="mt-2 text-base font-black text-[#17381C]">
                      {selectedService.urgentAvailable
                        ? language === "kk"
                          ? "Иә"
                          : "Да"
                        : language === "kk"
                          ? "Жоқ"
                          : "Нет"}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {copy.availability}
                    </p>
                    <p className="mt-2 text-base font-black text-[#17381C]">
                      {selectedService.availability}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-[1.4rem] bg-white px-4 py-4 shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                    {copy.serviceArea}
                  </p>
                  <p className="mt-2 text-sm font-medium leading-relaxed text-[#17381C]">
                    {selectedService.serviceArea || `${selectedService.region}, ${selectedService.district}`}
                  </p>
                </div>
              </div>

              <div className="border-t border-white/45 bg-white/60 px-5 py-4 backdrop-blur-xl">
                <div className="flex gap-2">
                  <Button
                    onClick={() => startDirectChat(selectedService)}
                    disabled={isStartingChat}
                    className="h-12 flex-1 rounded-[1rem] bg-[#2F6B3D] text-sm font-black text-white hover:bg-[#285b34]"
                  >
                    <MessageCircle className="size-4" />
                    {copy.chat}
                  </Button>
                  <Button
                    onClick={() => setSelectedService(null)}
                    className="h-12 rounded-[1rem] bg-[#E9F1E5] px-4 text-sm font-black text-[#17381C] hover:bg-[#dbe7d5]"
                  >
                    <ExternalLink className="size-4 opacity-0" />
                    {copy.open}
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
