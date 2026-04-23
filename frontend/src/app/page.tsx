"use client";

import { useEffect, useRef, useState } from "react";
import { area as turfArea } from "@turf/turf";
import {
  BookOpen,
  BriefcaseBusiness,
  CircleGauge,
  CloudSun,
  House,
  Loader2,
  Map as MapIcon,
  MapPin,
  Newspaper,
  Plus,
  ReceiptText,
  Save,
  Shield,
  ShoppingBasket,
  Sprout,
  TrendingUp,
  User,
  X,
} from "lucide-react";
import Map from "@/components/map/GoogleMap";
import type { MapRef } from "@/components/map/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ActionModal from "@/components/ui/action-modal";
import MarketView from "@/components/ui/market-view";
import ProfileView from "@/components/ui/profile-view";
import AdminView from "@/components/ui/admin-view";
import AuthView from "@/components/ui/auth-view";
import InfoCenterView from "@/components/ui/info-center-view";
import ServicesView from "@/components/ui/services-view";
import GuideView from "@/components/ui/guide-view";
import CropDetailSheet from "@/components/ui/crop-detail-sheet";
import type {
  DashboardCrop,
  DashboardResponse,
  SavedPlotResult,
} from "@/lib/dashboard";
import { cropLabels, cropList, ui } from "@/lib/i18n";
import type { PlatformLanguage } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";

type ActiveTab = "home" | "map" | "market" | "profile" | "admin" | "info" | "services";

type FarmActivityType =
  | "watering"
  | "fertilizer"
  | "pesticide"
  | "planting"
  | "harvest"
  | "inspection"
  | "expense";

type FarmActivity = {
  id: string;
  type: FarmActivityType;
  activityDate: string;
  description?: string | null;
  photoUrl?: string | null;
  costKzt: number;
  materials?: string[] | null;
};

type PlotAiAdvice = {
  source: "openai" | "fallback";
  title: string;
  summary: string;
  actions: string[];
  risks: string[];
  confidenceNote: string;
};

type PlotSeasonSummary = {
  plotId: string;
  title: string;
  cropType?: string | null;
  seasonYear: number;
  areaSizeHectares: number;
  activityCount: number;
  totalExpensesKzt: number;
  projectedIncomeKzt: number;
  projectedProfitKzt: number;
  costPerHectareKzt: number;
  competitionLevel: "low" | "medium" | "high";
  latestActivity: {
    id: string;
    type: FarmActivityType;
    activityDate: string;
    description?: string | null;
    costKzt: number;
  } | null;
  note: string;
};

const activityTypeOptions: FarmActivityType[] = [
  "watering",
  "fertilizer",
  "pesticide",
  "planting",
  "harvest",
  "inspection",
  "expense",
];

const competitionTone = {
  low: {
    badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  medium: {
    badge: "bg-amber-100 text-amber-700 border-amber-200",
  },
  high: {
    badge: "bg-red-100 text-red-700 border-red-200",
  },
} as const;

const buildTeaser = (text: string, maxLength = 110) => {
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

export default function Home() {
  const mapRef = useRef<MapRef>(null);

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<string>("farmer");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [language, setLanguage] = useState<PlatformLanguage>("ru");
  const [drawMode, setDrawMode] = useState<string>("simple_select");
  const [measurement, setMeasurement] = useState<string | null>(null);
  const [isProcessingWand, setIsProcessingWand] = useState(false);
  const [notification, setNotification] = useState<{
    msg: string;
    type: "error" | "warning" | "success";
  } | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [savedPlotResult, setSavedPlotResult] = useState<SavedPlotResult | null>(null);
  const [selectedCropCard, setSelectedCropCard] = useState<DashboardCrop | null>(null);

  const [isPoleOpen, setIsPoleOpen] = useState(false);
  const [drawnGeometry, setDrawnGeometry] = useState<any>(null);
  const [fieldName, setFieldName] = useState("Орёл 22");
  const [selectedCrop, setSelectedCrop] = useState<string>("");
  const [fillColor, setFillColor] = useState<string>("#D9B44A");

  const [editPlotData, setEditPlotData] = useState<any>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editCrop, setEditCrop] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [plotActivities, setPlotActivities] = useState<FarmActivity[]>([]);
  const [isActivitiesLoading, setIsActivitiesLoading] = useState(false);
  const [isActivitySubmitting, setIsActivitySubmitting] = useState(false);
  const [plotAiAdvice, setPlotAiAdvice] = useState<PlotAiAdvice | null>(null);
  const [isAiAdviceLoading, setIsAiAdviceLoading] = useState(false);
  const [seasonSummary, setSeasonSummary] = useState<PlotSeasonSummary | null>(null);
  const [isSeasonSummaryLoading, setIsSeasonSummaryLoading] = useState(false);
  const [activityForm, setActivityForm] = useState({
    type: "watering" as FarmActivityType,
    activityDate: new Date().toISOString().slice(0, 10),
    description: "",
    costKzt: "",
    materials: "",
    photoUrl: "",
  });

  const t = ui[language] || ui.ru;
  const activityTypeLabels: Record<FarmActivityType, string> =
    language === "kk"
      ? {
          watering: "Суару",
          fertilizer: "Тыңайтқыш",
          pesticide: "Өңдеу",
          planting: "Отырғызу",
          harvest: "Жинау",
          inspection: "Тексеру",
          expense: "Шығын",
        }
      : {
          watering: "Полив",
          fertilizer: "Удобрение",
          pesticide: "Обработка",
          planting: "Посадка",
          harvest: "Сбор",
          inspection: "Осмотр",
          expense: "Расход",
        };
  const localizedCompetition = {
    low: language === "kk" ? "Төмен" : "Низкая",
    medium: language === "kk" ? "Орташа" : "Средняя",
    high: language === "kk" ? "Жоғары" : "Высокая",
  } as const;
  const areaSizeHectares = drawnGeometry
    ? turfArea({ type: "Feature", geometry: drawnGeometry, properties: {} }) / 10000
    : 0;

  const fetchDashboard = async () => {
    const token = localStorage.getItem("agro_token");
    if (!token) return;

    setIsDashboardLoading(true);
    try {
      const res = await fetch(apiUrl("/dashboard/home"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        localStorage.removeItem("agro_token");
        setIsLoggedIn(false);
        setCurrentUserRole("farmer");
        setDashboard(null);
        return;
      }
      const json = await res.json();
      if (json.success && json.data) {
        setDashboard(json.data);
      }
    } catch {
      setDashboard(null);
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("agro_token");
    if (token) {
      setIsLoggedIn(true);
      setCurrentUserRole(localStorage.getItem("agro_user_role") || "farmer");
      fetchDashboard();
    }
    setSelectedCrop(cropLabels[language].watermelon);
    setEditCrop(cropLabels[language].watermelon);
  }, [language]);

  const handleAuthSuccess = (authData: any) => {
    localStorage.setItem("agro_token", authData.access_token);
    if (authData?.user?.id) {
      localStorage.setItem("agro_user_id", authData.user.id);
    }
    if (authData?.user?.role) {
      localStorage.setItem("agro_user_role", authData.user.role);
      setCurrentUserRole(authData.user.role);
    }
    setIsLoggedIn(true);
    fetchDashboard();
  };

  const handlePlotClick = (plot: any) => {
    setEditPlotData(plot);
    setEditTitle(plot.title || "");
    setEditCrop(plot.cropType || (cropLabels[language] as any).watermelon);
    setFillColor(plot.fillColor || "#D9B44A");
    setIsEditModalOpen(true);
    setPlotAiAdvice(null);
    setSeasonSummary(null);
    fetchPlotActivities(plot.id);
    fetchSeasonSummary(plot.id);
  };

  const showNotification = (
    msg: string,
    type: "error" | "warning" | "success",
  ) => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleUnauthorized = () => {
    localStorage.removeItem("agro_token");
    localStorage.removeItem("agro_user_id");
    localStorage.removeItem("agro_user_role");
    setIsLoggedIn(false);
    setCurrentUserRole("farmer");
    setDashboard(null);
    alert(
      language === "kk"
        ? "Сессия аяқталды. Қайта кіріңіз."
        : "Сессия истекла. Войдите заново.",
    );
  };

  const fetchPlotActivities = async (plotId: string) => {
    const token = localStorage.getItem("agro_token");
    if (!token) return;

    setIsActivitiesLoading(true);
    try {
      const res = await fetch(apiUrl(`/farm-plots/${plotId}/activities`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const json = await res.json();
      setPlotActivities(Array.isArray(json.data) ? json.data : []);
    } catch {
      setPlotActivities([]);
    } finally {
      setIsActivitiesLoading(false);
    }
  };

  const fetchSeasonSummary = async (plotId: string) => {
    const token = localStorage.getItem("agro_token");
    if (!token) return;

    setIsSeasonSummaryLoading(true);
    try {
      const res = await fetch(apiUrl(`/farm-plots/${plotId}/season-summary`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const json = await res.json();
      setSeasonSummary(json.success && json.data ? json.data : null);
    } catch {
      setSeasonSummary(null);
    } finally {
      setIsSeasonSummaryLoading(false);
    }
  };

  const submitActivity = async () => {
    if (!editPlotData?.id || isActivitySubmitting) return;

    if (!activityForm.activityDate) {
      showNotification(
        language === "kk" ? "Күнді таңдаңыз" : "Выберите дату работы",
        "warning",
      );
      return;
    }

    setIsActivitySubmitting(true);
    try {
      const token = localStorage.getItem("agro_token");
      if (!token) {
        handleUnauthorized();
        return;
      }

      const materials = activityForm.materials
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

      const res = await fetch(apiUrl(`/farm-plots/${editPlotData.id}/activities`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: activityForm.type,
          activityDate: activityForm.activityDate,
          description: activityForm.description,
          costKzt: activityForm.costKzt ? Number(activityForm.costKzt) : 0,
          materials: materials.length ? materials : undefined,
          photoUrl: activityForm.photoUrl,
        }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        throw new Error("activity");
      }

      await Promise.all([
        fetchPlotActivities(editPlotData.id),
        fetchSeasonSummary(editPlotData.id),
      ]);
      setActivityForm({
        type: "watering",
        activityDate: new Date().toISOString().slice(0, 10),
        description: "",
        costKzt: "",
        materials: "",
        photoUrl: "",
      });
      showNotification(
        language === "kk" ? "Жазба қосылды" : "Запись добавлена",
        "success",
      );
    } catch {
      showNotification(
        language === "kk"
          ? "Жазбаны сақтау мүмкін болмады"
          : "Не удалось сохранить запись",
        "error",
      );
    } finally {
      setIsActivitySubmitting(false);
    }
  };

  const deleteActivity = async (activityId: string) => {
    if (!editPlotData?.id) return;
    if (
      !confirm(
        language === "kk"
          ? "Журнал жазбасын өшіру керек пе?"
          : "Удалить запись из журнала?",
      )
    ) {
      return;
    }

    try {
      const token = localStorage.getItem("agro_token");
      const res = await fetch(apiUrl(`/farm-activities/${activityId}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        await Promise.all([
          fetchPlotActivities(editPlotData.id),
          fetchSeasonSummary(editPlotData.id),
        ]);
      }
    } catch {
      showNotification(
        language === "kk"
          ? "Жазбаны өшіру мүмкін болмады"
          : "Не удалось удалить запись",
        "error",
      );
    }
  };

  const fetchPlotAiAdvice = async () => {
    if (!editPlotData?.id || isAiAdviceLoading) return;

    setIsAiAdviceLoading(true);
    try {
      const token = localStorage.getItem("agro_token");
      if (!token) {
        handleUnauthorized();
        return;
      }

      const res = await fetch(apiUrl(`/farm-plots/${editPlotData.id}/ai-advice`), {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!res.ok) {
        throw new Error("ai");
      }

      const json = await res.json();
      if (json.success && json.data) {
        setPlotAiAdvice(json.data);
      }
    } catch {
      showNotification(
        language === "kk"
          ? "AI кеңесті алу мүмкін болмады"
          : "Не удалось получить AI совет",
        "error",
      );
    } finally {
      setIsAiAdviceLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "admin" && currentUserRole !== "admin") {
      setActiveTab("home");
    }
  }, [activeTab, currentUserRole]);

  const updatePlot = async () => {
    if (!editPlotData) return;
    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("agro_token");
      const res = await fetch(apiUrl(`/farm-plots/${editPlotData.id}`), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle,
          cropType: editCrop,
          fillColor,
        }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      if (res.ok) {
        setIsEditModalOpen(false);
        mapRef.current?.refreshPlots();
        fetchDashboard();
      } else {
        alert("Failed to update field");
      }
    } catch {
      alert("Error updating field");
    } finally {
      setIsSubmitting(false);
    }
  };

  const deletePlot = async () => {
    if (!editPlotData) return;
    if (
      !confirm(
        (t as any).deletePlotConfirm ||
          "Вы уверены, что хотите удалить этот участок?",
      )
    )
      return;

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("agro_token");
      const res = await fetch(apiUrl(`/farm-plots/${editPlotData.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        handleUnauthorized();
        return;
      }
      if (res.ok) {
        setIsEditModalOpen(false);
        mapRef.current?.refreshPlots();
        fetchDashboard();
      }
    } catch {
      alert("Error deleting field");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveNewPlot = () => {
    const geom = mapRef.current?.getSelectedGeometry() ?? drawnGeometry;
    if (!geom) {
      alert(
        t.drawFieldFirst ||
          "Сначала выделите нарисованный объект на карте (стрелкой)!",
      );
      return;
    }
    setSavedPlotResult(null);
    setDrawnGeometry(geom);
    setIsPoleOpen(true);
  };

  const submitPlot = async () => {
    if (!drawnGeometry) {
      alert(t.drawFieldFirst);
      return;
    }
    if (!fieldName.trim()) {
      alert(`${t.fieldName}: ${t.fieldNamePlaceholder}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("agro_token");
      if (!token) {
        handleUnauthorized();
        return;
      }
      const res = await fetch(apiUrl("/farm-plots"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: fieldName.trim(),
          region: "Алматинская",
          district: "Талгарский",
          areaSizeHectares: Number(areaSizeHectares.toFixed(2)),
          geometry: drawnGeometry,
          cropType: selectedCrop,
          fillColor,
          seasonYear: new Date().getFullYear(),
          plantingDate: new Date().toISOString().slice(0, 10),
        }),
      });

      if (res.status === 401) {
        handleUnauthorized();
        return;
      }

      const json = await res.json();
      if (json.success) {
        setSavedPlotResult(json.data as SavedPlotResult);
        mapRef.current?.refreshPlots();
        fetchDashboard();
      } else {
        alert("Ошибка: " + json.message);
      }
    } catch {
      alert(t.saveError || "Error saving");
    } finally {
      setIsSubmitting(false);
      setIsPoleOpen(false);
      mapRef.current?.deleteSelectedDraw();
      mapRef.current?.changeDrawMode("simple_select");
    }
  };


  const statsCards = [
    {
      label: "Поля",
      value: String(dashboard?.stats.totalPlots ?? 0),
      icon: Sprout,
    },
    {
      label: "Доход",
      value: `${Math.round((dashboard?.stats.projectedIncomeKzt ?? 0) / 1000)}k`,
      icon: TrendingUp,
    },
    {
      label: "Бәсеке",
      value: dashboard?.stats.averageCompetitionLevel
        ? localizedCompetition[dashboard.stats.averageCompetitionLevel]
        : localizedCompetition.low,
      icon: CircleGauge,
    },
  ];

  const regionName =
    dashboard?.profile.region ||
    (language === "kk" ? "Алматы облысы" : "Алматинская область");
  const districtName = dashboard?.profile.district || "Талгар";
  const userName = dashboard?.profile.fullName || (language === "kk" ? "Фермер" : "Фермер");
  const weatherSummary =
    dashboard?.weather.summary?.trim() ||
    (language === "kk"
      ? "Ауа райы сервисі келесі кезеңде қосылады"
      : "Погодный сервис подключим на следующем этапе");
  const weatherSourceLabel =
    dashboard?.weather.source === "plot"
      ? language === "kk"
        ? dashboard.weather.plotTitle
          ? `Алаң бойынша: ${dashboard.weather.plotTitle}`
          : "Алаң бойынша"
        : dashboard.weather.plotTitle
          ? `По полю: ${dashboard.weather.plotTitle}`
          : "По полю"
      : dashboard?.weather.source === "region"
        ? language === "kk"
          ? "Аймақ бойынша"
          : "По региону"
        : language === "kk"
          ? "Дерек көзі жоқ"
          : "Источник не определен";
  const cropRecommendationSummary = buildTeaser(
    dashboard?.cropAnalysis?.recommendation ||
      (language === "kk"
        ? "Алаңдар қосылғаннан кейін мұнда бәсеке болжамы, ауа райы белгілері және әрекет ұсыныстары шығады."
        : "После добавления полей здесь появятся прогноз по конкуренции, погодные сигналы и рекомендации по действиям."),
    118,
  );
  const insightConfidence = Math.round(
    (dashboard?.insight.confidence ?? 0.25) * 100,
  );
  const localizedVisibility = {
    hidden: language === "kk" ? "Жасырын" : "Скрыто",
    visible: language === "kk" ? "Көрінеді" : "Видно",
  } as const;
  const forecastCards = dashboard?.forecasts
    ? [
        {
          label: language === "kk" ? "Өнім" : "Урожайность",
          value:
            dashboard.forecasts.yield.trend === "upside"
              ? language === "kk"
                ? "Өсу әлеуеті"
                : "Потенциал роста"
              : language === "kk"
                ? "Тұрақты"
                : "Стабильно",
          summary: dashboard.forecasts.yield.summary,
        },
        {
          label: language === "kk" ? "Баға" : "Цена",
          value:
            dashboard.forecasts.price.trend === "pressure"
              ? language === "kk"
                ? "Қысым бар"
                : "Под давлением"
              : language === "kk"
                ? "Тұрақты"
                : "Стабильнее",
          summary: dashboard.forecasts.price.summary,
        },
        {
          label: language === "kk" ? "Сұраныс" : "Спрос",
          value: dashboard.cropAnalysis?.demandLevel || (language === "kk" ? "Орташа" : "Средний"),
          summary: dashboard.forecasts.demand.summary,
        },
        {
          label: language === "kk" ? "Жинау" : "Сбор",
          value: dashboard.forecasts.harvest.daysRemaining
            ? `${dashboard.forecasts.harvest.daysRemaining} ${language === "kk" ? "күн" : "дн"}`
            : language === "kk"
              ? "Есептелуде"
              : "Расчет",
          summary: dashboard.forecasts.harvest.summary,
        },
      ]
    : [];
  const weatherPreview = dashboard?.weather?.forecast?.slice(0, 3) || [];
  const featuredNews =
    dashboard?.infoCenter?.find((item) => item.category === "news") || null;
  const utilityInfoCards =
    dashboard?.infoCenter?.filter((item) => item.category !== "news").slice(0, 4) || [];
  const openExternal = (url?: string | null) => {
    if (!url || typeof window === "undefined") {
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="relative flex h-screen w-screen flex-col overflow-hidden bg-[#EAF3E7] dark:bg-[#002115] transition-colors font-sans">
      {!isLoggedIn && <AuthView onSuccess={handleAuthSuccess} {...({ language } as any)} />}

      {notification && (
        <div
          className={`fixed top-8 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full px-6 py-3 text-sm font-black shadow-2xl ${
            notification.type === "error"
              ? "bg-red-500 text-white"
              : notification.type === "warning"
                ? "bg-yellow-500 text-white"
                : "bg-[#2F6B3D] text-white"
          }`}
        >
          {notification.msg}
        </div>
      )}

      <div
        className={`absolute inset-0 z-0 transition-opacity duration-300 ${
          activeTab === "map" ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <Map
          ref={mapRef}
          onPlotClick={handlePlotClick}
          onGeometrySelected={setDrawnGeometry}
          onModeChange={setDrawMode}
          onMeasurement={setMeasurement}
          language={language}
          showMeasurements={false}
          massWandActive={drawMode === "mass_magic_wand"}
          onProcessingStateChange={setIsProcessingWand}
          onNotification={showNotification}
          drawMode={drawMode}
          currentUserRole={currentUserRole}
          isProcessingWand={isProcessingWand}
          measurement={measurement}
          onSavePlot={handleSaveNewPlot}
          onOpenGuide={() => setIsGuideOpen(true)}
        />
      </div>

      {isGuideOpen && (
        <GuideView 
          language={language} 
          onClose={() => setIsGuideOpen(false)} 
        />
      )}

      {activeTab === "home" && (
        <div className="absolute inset-0 z-10 overflow-y-auto bg-[#EEF3EA] dark:bg-[#002115] transition-colors pb-28">
          <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 px-4 pt-5 pb-6 lg:px-6">
            <div className="rounded-[2rem] bg-[#17381C] px-4 py-4 text-white shadow-[0_24px_80px_rgba(10,26,14,0.18)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/50">
                    {language === "kk" ? "Фермер экожүйесі" : "Фермерская экосистема"}
                  </p>
                  <h1 className="mt-1 text-2xl font-black tracking-tight">
                    {language === "kk" ? `Сәлем, ${userName}` : `Здравствуйте, ${userName}`}
                  </h1>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/72">
                    <CloudSun className="size-4 text-[#D9B44A]" />
                    <span>{weatherSummary}</span>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/70">
                    <MapPin className="size-3" />
                    <span>{weatherSourceLabel}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-white/60">
                    <MapPin className="size-3.5" />
                    <span>{regionName}</span>
                    <span>•</span>
                    <span>{districtName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="hidden items-center gap-1 rounded-full border border-white/12 bg-white/8 p-1 sm:flex">
                    {(["ru", "kk"] as PlatformLanguage[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => setLanguage(lang)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                          language === lang
                            ? "bg-white text-[#17381C]"
                            : "text-white/72 hover:bg-white/10"
                        }`}
                      >
                        {lang}
                      </button>
                    ))}
                  </div>
                  <div className="rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/72">
                    {dashboard?.season.title ||
                      (language === "kk" ? "Маусым" : "Сезон")}
                  </div>
                  <div className="flex size-11 items-center justify-center rounded-full border border-white/12 bg-white/10">
                    <User className="size-4 text-white/85" />
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {statsCards.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-[1.4rem] border border-white/10 bg-white/8 px-3 py-3"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                        {label}
                      </span>
                      <Icon className="size-3.5 text-white/68" />
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
                    className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                      language === lang
                        ? "border-white bg-white text-[#17381C]"
                        : "border-white/16 bg-white/8 text-white/72"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/40">
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
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Саты" : "Стадия"}
                    </p>
                    <p className="mt-2 text-sm font-black text-[#18351D]">
                      {dashboard?.cropAnalysis?.growthStage ||
                        (language === "kk" ? "Жоспарлау" : "Планирование")}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Сұраныс" : "Спрос"}
                    </p>
                    <p className="mt-2 text-sm font-black text-[#18351D]">
                      {dashboard?.cropAnalysis?.demandLevel ||
                        (language === "kk" ? "Орташа" : "Средний")}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Бәсеке" : "Конкуренция"}
                    </p>
                    <p className="mt-2 text-sm font-black text-[#18351D]">
                      {dashboard?.cropAnalysis?.competitionLevel
                        ? localizedCompetition[dashboard.cropAnalysis.competitionLevel]
                        : localizedCompetition.low}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-[#F5F8F1] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
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
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/40">
                    {language === "kk" ? "Маусым күйі" : "Статус сезона"}
                  </p>
                  <div className="mt-3 rounded-[1.4rem] bg-[#17381C] px-4 py-4 text-white">
                    <p className="text-sm font-black">
                      {dashboard?.season.title ||
                        (language === "kk" ? "Маусым" : "Сезон")}
                    </p>
                    <p className="mt-2 text-sm text-white/72">
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
                      <div className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/65">
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
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
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
                      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/40">
                        {language === "kk" ? "Жаңалықтар" : "Новости"}
                      </p>
                      <h2 className="mt-1 text-lg font-black text-[#18351D]">
                        {language === "kk" ? "Фермерге қызық" : "Что важно фермеру"}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("info")}
                      className="mr-5 mt-5 rounded-full bg-[#17381C] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white"
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
                          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white/88 backdrop-blur-md">
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
                              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/40">
                                {item.categoryLabel}
                              </p>
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#7D692F]">
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

            <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/40">
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
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
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

            <Card className="rounded-[2rem] border-[#DCE8D7] bg-white p-5 shadow-[0_20px_70px_rgba(17,45,22,0.08)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/40">
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
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                          {language === "kk" ? "Күтім" : "Уход"}
                        </p>
                        <p className="mt-1 text-sm text-[#2F6B3D]/72">
                          {buildTeaser(crop.tips.watering, 70)}
                        </p>
                      </div>
                      <div className="rounded-[1rem] bg-white px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#2F6B3D]/45">
                          {language === "kk" ? "Тәуекел" : "Риск"}
                        </p>
                        <p className="mt-1 text-sm text-[#2F6B3D]/72">
                          {buildTeaser(crop.tips.disease, 70)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Толық карта ашылады" : "Полная карточка откроется по нажатию"}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === "market" && <MarketView {...({ language } as any)} />}
      {activeTab === "services" && <ServicesView language={language} />}
      {activeTab === "info" && (
        <InfoCenterView
          language={language}
          onBack={() => setActiveTab("home")}
        />
      )}
      {activeTab === "profile" && <ProfileView {...({ language } as any)} />}
      {activeTab === "admin" && currentUserRole === "admin" && <AdminView />}

      {selectedCropCard && (
        <CropDetailSheet
          crop={selectedCropCard}
          language={language}
          competitionLabels={localizedCompetition}
          onClose={() => setSelectedCropCard(null)}
        />
      )}

      {activeTab === "map" && (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div className="absolute inset-x-0 top-0 px-4 pt-4 lg:px-6">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
              <div className="pointer-events-auto max-w-[20rem] rounded-[1.45rem] border border-white/18 bg-[#16321C]/52 px-3 py-3 text-white shadow-[0_20px_60px_rgba(7,19,10,0.2)] backdrop-blur-xl md:max-w-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/55">
                      Регион
                    </p>
                    <h1 className="mt-1 truncate text-[0.95rem] font-black tracking-tight lg:text-lg">
                      {regionName}
                    </h1>
                    <div className="mt-2 flex items-center gap-2 text-xs text-white/72">
                      <CloudSun className="size-3.5 shrink-0 text-[#F3D38D]" />
                      <span className="truncate">{weatherSummary}</span>
                    </div>
                  </div>

                  <div className="hidden shrink-0 items-start gap-2 md:flex">
                    <div className="rounded-full border border-white/16 bg-white/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/80">
                      Карта
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-auto flex gap-1.5 overflow-x-auto pb-1 md:hidden">
                {(["ru", "kk"] as PlatformLanguage[]).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] transition-colors ${
                      language === lang
                        ? "border-white bg-white text-[#1F4D2C]"
                        : "border-white/16 bg-[#16321C]/45 text-white/75"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>

            </div>
          </div>

          {measurement && (
            <div className="pointer-events-auto absolute bottom-28 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 lg:bottom-8 lg:left-auto lg:right-8 lg:translate-x-0">
              <div className="rounded-[1.8rem] border border-white/16 bg-black/30 px-5 py-4 text-white shadow-[0_20px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-[0.24em] text-white/55">
                    {language === "kk" ? "Ағымдағы таңдау" : "Текущее выделение"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">
                    {drawMode.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="text-xl font-black tracking-tight">{measurement}</div>
                <p className="mt-2 text-sm text-white/65">
                  {language === "kk"
                    ? "Бәсеке, табыс және маркеттегі көрінуін есептеу үшін полигонды сақтаңыз."
                    : "Сохраните полигон, чтобы посчитать конкуренцию, доход и видимость в маркете."}
                </p>
              </div>
              <Button
                onClick={handleSaveNewPlot}
                className="h-14 rounded-[1.8rem] bg-[#D9B44A] text-[#17381C] font-black shadow-[0_18px_50px_rgba(217,180,74,0.42)] hover:bg-[#e5c15b]"
              >
                <Save className="mr-2 size-5" />
                Добавить поле
              </Button>
            </div>
          )}

          {savedPlotResult && (
            <div className="pointer-events-auto absolute bottom-28 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 flex-col gap-3 lg:bottom-8 lg:left-8 lg:translate-x-0">
              <Card className="rounded-[2rem] border-white/16 bg-white/88 p-5 shadow-[0_24px_80px_rgba(9,28,14,0.18)] backdrop-blur-2xl">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#2F6B3D]/45">
                    {language === "kk" ? "Алаң сақталды" : "Поле сохранено"}
                    </p>
                    <h2 className="mt-1 text-xl font-black text-[#18351D]">
                      {savedPlotResult.plot.title}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-[#2F6B3D]/70">
                      {savedPlotResult.plot.cropType}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSavedPlotResult(null)}
                    className="flex size-10 items-center justify-center rounded-2xl bg-[#F5F1E8] text-[#2F6B3D] transition-all hover:bg-[#ece4d2]"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div className="rounded-[1.4rem] bg-[#F5F1E8] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Табыс" : "Доход"}
                    </p>
                    <p className="mt-2 text-lg font-black text-[#18351D]">
                      {Math.round(savedPlotResult.projectedIncomeKzt / 1000)}k ₸
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] bg-[#F5F1E8] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Сенім" : "Уверенность"}
                    </p>
                    <p className="mt-2 text-lg font-black text-[#18351D]">
                      {Math.round(savedPlotResult.competition.confidence * 100)}%
                    </p>
                  </div>
                </div>

                <div className="mb-4 flex items-center justify-between rounded-[1.4rem] bg-[#F5F1E8] px-4 py-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Бәсеке" : "Конкуренция"}
                    </p>
                    <p className="mt-1 text-base font-black text-[#18351D]">
                      {localizedCompetition[savedPlotResult.competition.level]}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-black uppercase ${competitionTone[savedPlotResult.competition.level].badge}`}
                  >
                    {localizedVisibility[savedPlotResult.competition.marketplaceVisibility]}
                  </span>
                </div>

                <div className="mb-4 rounded-[1.4rem] bg-[#17381C] px-4 py-4 text-white">
                  <div className="mb-2 flex items-center gap-2">
                    <ReceiptText className="size-4 text-[#D9B44A]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.22em] text-white/60">
                      {language === "kk" ? "AI түсіндірме" : "AI объяснение"}
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-white/78">
                    {savedPlotResult.competition.explanation}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Жақын аумақ" : "Площадь рядом"}
                    </p>
                    <p className="mt-1 font-black text-[#18351D]">
                      {savedPlotResult.competition.nearbyAreaHectares} ha
                    </p>
                  </div>
                  <div className="rounded-[1.2rem] bg-[#F5F1E8] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/45">
                      {language === "kk" ? "Жақын алаңдар" : "Участки рядом"}
                    </p>
                    <p className="mt-1 font-black text-[#18351D]">
                      {savedPlotResult.competition.nearbyPlotCount}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

        </div>
      )}

      <ActionModal
        isOpen={isPoleOpen}
        onClose={() => setIsPoleOpen(false)}
        title={t.newField || "Новый участок"}
        primaryActionText={isSubmitting ? t.saving || "Сохранение..." : t.save || "Сохранить"}
        onPrimaryAction={submitPlot}
        language={language}
      >
        <p className="mb-4 text-[#2F6B3D] font-bold opacity-70">
          {t.chooseCrop || "Конфигурация"}
        </p>
        <div className="mb-2 flex flex-col gap-3">
          <div>
            <label className="ml-1 text-[10px] font-black uppercase text-[#2F6B3D]/50">
              {t.fieldName || "Название"}
            </label>
            <input
              type="text"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
            />
          </div>
          <div>
            <label className="ml-1 text-[10px] font-black uppercase text-[#2F6B3D]/50">
              Культура
            </label>
            <select
              className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
              value={selectedCrop}
              onChange={(e) => setSelectedCrop(e.target.value)}
            >
              {cropList.map((crop) => (
                <option key={crop.key} value={(cropLabels[language] as any)[crop.key]}>
                  {crop.emoji} {(cropLabels[language] as any)[crop.key]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="ml-1 text-[10px] font-black uppercase text-[#2F6B3D]/50">
              Цвет культуры
            </label>
            <input
              type="color"
              className="h-10 w-full cursor-pointer appearance-none rounded-xl border-none bg-transparent p-0"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </div>
          <div className="rounded-2xl bg-[#F5F9F4] px-4 py-3 text-sm font-bold text-[#2F6B3D] shadow-inner">
            {t.area || "Площадь"}: {areaSizeHectares.toFixed(2)} {t.hectares || "га"}
          </div>
        </div>
      </ActionModal>

      <ActionModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Редактирование участка"
        primaryActionText={isSubmitting ? "Сохранение..." : "Сохранить"}
        onPrimaryAction={updatePlot}
        language={language}
      >
        <p className="mb-4 text-[#2F6B3D] font-bold opacity-70">
          Измените данные выделенного участка:
        </p>
        <div className="mb-2 flex flex-col gap-3">
          <input
            type="text"
            className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
            placeholder="Название участка"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <select
            className="h-14 w-full rounded-2xl bg-[#F5F9F4] px-4 font-bold text-[#2F6B3D] shadow-inner focus:outline-none"
            value={editCrop}
            onChange={(e) => setEditCrop(e.target.value)}
          >
            {cropList.map((crop) => (
              <option key={crop.key} value={(cropLabels[language] as any)[crop.key]}>
                {crop.emoji} {(cropLabels[language] as any)[crop.key]}
              </option>
            ))}
          </select>
          <div className="flex h-14 items-center justify-between rounded-2xl border-none bg-[#F5F9F4] px-2 outline-none">
            <label className="ml-2 text-xs font-black uppercase text-[#2F6B3D]/50">
              Цвет заливки
            </label>
            <input
              type="color"
              className="mr-2 h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0 outline-none"
              value={fillColor}
              onChange={(e) => setFillColor(e.target.value)}
            />
          </div>
          <button
            onClick={deletePlot}
            disabled={isSubmitting}
            className="mt-2 flex h-14 w-full items-center justify-center rounded-2xl border border-red-100 bg-red-50 font-bold text-red-600 transition-colors hover:bg-red-100"
          >
            Удалить участок
          </button>

          <div className="mt-5 rounded-2xl bg-[#F5F9F4] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/50">
                  {language === "kk" ? "Маусым қаржысы" : "Финансы сезона"}
                </p>
                <p className="mt-1 text-xs font-bold text-[#2F6B3D]/70">
                  {language === "kk"
                    ? "Журналдағы шығындар мен болжамды пайда"
                    : "Расходы из журнала и прогноз прибыли"}
                </p>
              </div>
              {isSeasonSummaryLoading && (
                <Loader2 className="size-4 animate-spin text-[#2F6B3D]/50" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                  {language === "kk" ? "Шығын" : "Расходы"}
                </p>
                <p className="mt-1 text-base font-black text-[#17381C]">
                  {Math.round(seasonSummary?.totalExpensesKzt ?? 0).toLocaleString("ru-RU")} ₸
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                  {language === "kk" ? "Табыс" : "Доход"}
                </p>
                <p className="mt-1 text-base font-black text-[#17381C]">
                  {Math.round(seasonSummary?.projectedIncomeKzt ?? 0).toLocaleString("ru-RU")} ₸
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                  {language === "kk" ? "Пайда" : "Прибыль"}
                </p>
                <p
                  className={`mt-1 text-base font-black ${
                    (seasonSummary?.projectedProfitKzt ?? 0) < 0
                      ? "text-red-600"
                      : "text-[#17381C]"
                  }`}
                >
                  {Math.round(seasonSummary?.projectedProfitKzt ?? 0).toLocaleString("ru-RU")} ₸
                </p>
              </div>
              <div className="rounded-xl bg-white px-3 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                  {language === "kk" ? "Жазба" : "Записей"}
                </p>
                <p className="mt-1 text-base font-black text-[#17381C]">
                  {seasonSummary?.activityCount ?? 0}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-white px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#2F6B3D]/45">
                    {language === "kk" ? "Соңғы жұмыс" : "Последняя работа"}
                  </p>
                  <p className="mt-1 text-xs font-black text-[#17381C]">
                    {seasonSummary?.latestActivity
                      ? `${activityTypeLabels[seasonSummary.latestActivity.type]} · ${String(
                          seasonSummary.latestActivity.activityDate,
                        ).slice(0, 10)}`
                      : language === "kk"
                        ? "Әзірге жоқ"
                        : "Пока нет"}
                  </p>
                </div>
                <div className="rounded-full bg-[#F5F9F4] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-[#2F6B3D]/60">
                  {Math.round(seasonSummary?.costPerHectareKzt ?? 0).toLocaleString("ru-RU")} ₸/га
                </div>
              </div>
              <p className="mt-2 text-[11px] font-semibold leading-relaxed text-[#2F6B3D]/58">
                {seasonSummary?.note ||
                  (language === "kk"
                    ? "Журналға жазба қоссаңыз, есеп нақтырақ болады."
                    : "Добавьте записи в журнал, чтобы расчет стал точнее.")}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-[#17381C] p-4 text-white">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                  {language === "kk" ? "AI кеңес" : "AI совет"}
                </p>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-white/70">
                  {language === "kk"
                    ? "Дақыл, ауа райы және журнал бойынша қысқа ұсыныс."
                    : "Короткая рекомендация по культуре, погоде и журналу."}
                </p>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white/60">
                {plotAiAdvice?.source === "openai" ? "OpenAI" : "Fallback"}
              </span>
            </div>

            <button
              type="button"
              onClick={fetchPlotAiAdvice}
              disabled={isAiAdviceLoading}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-[#D9B44A] text-xs font-black text-[#17381C] transition-colors hover:bg-[#e3bf52] disabled:opacity-60"
            >
              {isAiAdviceLoading
                ? language === "kk"
                  ? "Талдауда..."
                  : "Анализируем..."
                : language === "kk"
                  ? "AI кеңес алу"
                  : "Получить AI совет"}
            </button>

            {plotAiAdvice && (
              <div className="mt-4 rounded-xl bg-white/10 p-3">
                <p className="font-black text-white">{plotAiAdvice.title}</p>
                <p className="mt-2 text-xs font-semibold leading-relaxed text-white/72">
                  {plotAiAdvice.summary}
                </p>
                <div className="mt-3 grid gap-2">
                  {plotAiAdvice.actions.map((action) => (
                    <div
                      key={action}
                      className="rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold leading-relaxed text-white/78"
                    >
                      {action}
                    </div>
                  ))}
                </div>
                {plotAiAdvice.risks.length > 0 && (
                  <div className="mt-3 rounded-lg border border-white/10 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">
                      {language === "kk" ? "Тәуекелдер" : "Риски"}
                    </p>
                    <ul className="mt-2 grid gap-1 text-xs font-semibold leading-relaxed text-white/68">
                      {plotAiAdvice.risks.map((risk) => (
                        <li key={risk}>• {risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-[10px] font-semibold leading-relaxed text-white/45">
                  {plotAiAdvice.confidenceNote}
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 rounded-2xl bg-[#F5F9F4] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2F6B3D]/50">
                  {language === "kk" ? "Журнал" : "Журнал работ"}
                </p>
                <p className="mt-1 text-xs font-bold text-[#2F6B3D]/70">
                  {language === "kk"
                    ? "Алаң бойынша қысқа жазбалар"
                    : "Короткие записи по участку"}
                </p>
              </div>
              {isActivitiesLoading && (
                <Loader2 className="size-4 animate-spin text-[#2F6B3D]/50" />
              )}
            </div>

            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={activityForm.type}
                  onChange={(e) =>
                    setActivityForm((prev) => ({
                      ...prev,
                      type: e.target.value as FarmActivityType,
                    }))
                  }
                  className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
                >
                  {activityTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {activityTypeLabels[type]}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={activityForm.activityDate}
                  onChange={(e) =>
                    setActivityForm((prev) => ({
                      ...prev,
                      activityDate: e.target.value,
                    }))
                  }
                  className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
                />
              </div>
              <textarea
                rows={3}
                value={activityForm.description}
                onChange={(e) =>
                  setActivityForm((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder={
                  language === "kk"
                    ? "Мысалы: Арбузды суардым, топырақ жақсы."
                    : "Например: полил арбуз, почва в норме."
                }
                className="w-full resize-none rounded-xl bg-white p-3 text-xs font-semibold text-[#2F6B3D] outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="0"
                  value={activityForm.costKzt}
                  onChange={(e) =>
                    setActivityForm((prev) => ({
                      ...prev,
                      costKzt: e.target.value,
                    }))
                  }
                  placeholder={language === "kk" ? "Шығын, ₸" : "Расход, ₸"}
                  className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
                />
                <input
                  value={activityForm.materials}
                  onChange={(e) =>
                    setActivityForm((prev) => ({
                      ...prev,
                      materials: e.target.value,
                    }))
                  }
                  placeholder={
                    language === "kk"
                      ? "Материалдар"
                      : "Материалы через запятую"
                  }
                  className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
                />
              </div>
              <input
                value={activityForm.photoUrl}
                onChange={(e) =>
                  setActivityForm((prev) => ({
                    ...prev,
                    photoUrl: e.target.value,
                  }))
                }
                placeholder="Фото URL"
                className="h-11 rounded-xl bg-white px-3 text-xs font-bold text-[#2F6B3D] outline-none"
              />
              <button
                type="button"
                onClick={submitActivity}
                disabled={isActivitySubmitting}
                className="flex h-11 items-center justify-center rounded-xl bg-[#2F6B3D] text-xs font-black text-white transition-colors hover:bg-[#285b34] disabled:opacity-60"
              >
                {isActivitySubmitting
                  ? language === "kk"
                    ? "Сақталуда..."
                    : "Сохраняем..."
                  : language === "kk"
                    ? "Жазба қосу"
                    : "Добавить запись"}
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              {plotActivities.length === 0 && !isActivitiesLoading ? (
                <div className="rounded-xl bg-white px-3 py-3 text-xs font-bold text-[#2F6B3D]/55">
                  {language === "kk"
                    ? "Әзірге жазба жоқ."
                    : "Пока записей нет."}
                </div>
              ) : (
                plotActivities.slice(0, 5).map((activity) => (
                  <div
                    key={activity.id}
                    className="rounded-xl bg-white px-3 py-3 text-xs text-[#2F6B3D]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-black text-[#17381C]">
                          {activityTypeLabels[activity.type]} ·{" "}
                          {String(activity.activityDate).slice(0, 10)}
                        </p>
                        {activity.description && (
                          <p className="mt-1 font-semibold leading-relaxed text-[#2F6B3D]/75">
                            {activity.description}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteActivity(activity.id)}
                        className="rounded-lg bg-red-50 px-2 py-1 font-black text-red-500"
                      >
                        ×
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-[#2F6B3D]/50">
                      {Number(activity.costKzt || 0) > 0 && (
                        <span>{Number(activity.costKzt).toLocaleString("ru-RU")} ₸</span>
                      )}
                      {activity.materials?.map((material) => (
                        <span key={material}>{material}</span>
                      ))}
                      {activity.photoUrl && <span>Фото</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ActionModal>

      {activeTab === "map" && (
        <button
          onClick={() => setIsGuideOpen(true)}
          className="lg:hidden fixed bottom-[100px] right-4 z-[61] flex h-12 w-12 items-center justify-center rounded-full bg-[#2F6B3D] text-white shadow-xl shadow-[#2F6B3D]/30 backdrop-blur-sm transition-all duration-200 active:scale-90"
          aria-label={language === "kk" ? "Нұсқаулық" : "Руководство"}
        >
          <BookOpen className="size-5" />
        </button>
      )}

      {isLoggedIn && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-auto">
          <div className="mx-4 mb-3 flex h-[78px] items-center justify-around rounded-[2rem] border border-white/50 bg-white/86 px-2 shadow-[0_-4px_30px_rgba(0,0,0,0.08)] backdrop-blur-2xl">
            {[
              {
                key: "home" as const,
                icon: House,
                label: language === "kk" ? "Басты бет" : "Главная",
              },
              { key: "map" as const, icon: MapIcon, label: t.map || "Карта" },
              { key: "market" as const, icon: ShoppingBasket, label: t.market || "Маркет" },
              {
                key: "services" as const,
                icon: BriefcaseBusiness,
                label: language === "kk" ? "Қызметтер" : "Услуги",
              },
              ...(currentUserRole === "admin"
                ? [{
                    key: "admin" as const,
                    icon: Shield,
                    label: language === "kk" ? "Әкімші" : "Админ",
                  }]
                : []),
              { key: "profile" as const, icon: User, label: t.profile || "Профиль" },
            ].map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className={`relative flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-all duration-300 active:scale-90 ${
                  activeTab === key ? "text-[#2F6B3D]" : "text-[#9CA3AF]"
                }`}
              >
                {activeTab === key && (
                  <div className="absolute -top-0.5 h-[3px] w-5 rounded-full bg-[#2F6B3D]" />
                )}
                <Icon
                  className="size-[21px]"
                  strokeWidth={activeTab === key ? 2.5 : 1.8}
                />
                <span className="mt-0.5 text-[9px] font-semibold leading-none">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
