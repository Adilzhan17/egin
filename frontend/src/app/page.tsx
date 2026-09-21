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
import GoogleMap from "@/components/map/GoogleMap";
import MapLibreMap from "@/components/map/Map";
import type { MapRef } from "@/components/map/types";

const Map = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? GoogleMap : MapLibreMap;
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ActionModal from "@/components/ui/action-modal";
import MarketView from "@/components/ui/market-view";
import ProfileView from "@/components/ui/profile-view";
import ServicesView from "@/components/ui/services-view";
import InfoCenterView from "@/components/ui/info-center-view";
import AdminView from "@/components/ui/admin-view";
import HomeView from "@/components/ui/home-view";
import MapOverlay from "@/components/ui/map-overlay";
import WorkspaceSheet from "@/components/ui/workspace-sheet";
import PlotModals from "@/components/ui/plot-modals";
import Sidebar from "@/components/ui/sidebar";
import GuideView from "@/components/ui/guide-view";
import CropDetailSheet from "@/components/ui/crop-detail-sheet";
import { useRouter } from "next/navigation";
import type {
  DashboardCrop,
  DashboardResponse,
  FarmActivity,
  FarmActivityType,
  PlotAiAdvice,
  PlotSeasonSummary,
  SavedPlotResult,
} from "@/lib/dashboard";
import { cropLabels, cropList, ui } from "@/lib/i18n";
import type { PlatformLanguage } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type ActiveTab = "home" | "map" | "market" | "profile" | "admin" | "info" | "services";



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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const { isLoggedIn, logout } = useAuth();
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
  
  // Auth security check
  useEffect(() => {
    if (isLoggedIn === false) {
      router.push("/login");
    }
  }, [isLoggedIn, router]);

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
        credentials: "include",
      });
      if (res.status === 401) {
        logout();
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
    if (isLoggedIn === true) {
      setCurrentUserRole(localStorage.getItem("agro_user_role") || "farmer");
      fetchDashboard();
    }
    setSelectedCrop(cropLabels[language].watermelon);
    setEditCrop(cropLabels[language].watermelon);
  }, [language, isLoggedIn]);

  const handlePlotClick = (plot: any) => {
    setSavedPlotResult(null);
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
    logout();
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
        credentials: "include",
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

  const fetchPlotAiAdviceById = async (plotId: string) => {
    if (!plotId || isAiAdviceLoading) return;

    setIsAiAdviceLoading(true);
    try {
      const token = localStorage.getItem("agro_token");
      if (!token) {
        handleUnauthorized();
        return;
      }

      const res = await fetch(apiUrl(`/farm-plots/${plotId}/ai-advice`), {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
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

  const openSavedPlotWorkspace = async (options?: { loadAiAdvice?: boolean }) => {
    const plot = savedPlotResult?.plot;
    if (!plot) return;

    setSavedPlotResult(null);
    setEditPlotData(plot);
    setEditTitle(plot.title || "");
    setEditCrop(plot.cropType || (cropLabels[language] as any).watermelon);
    setFillColor(plot.fillColor || "#D9B44A");
    setIsEditModalOpen(true);
    setPlotAiAdvice(null);
    setSeasonSummary(null);

    await Promise.all([
      fetchPlotActivities(plot.id),
      fetchSeasonSummary(plot.id),
      options?.loadAiAdvice ? fetchPlotAiAdviceById(plot.id) : Promise.resolve(),
    ]);
  };

  const fetchSeasonSummary = async (plotId: string) => {
    const token = localStorage.getItem("agro_token");
    if (!token) return;

    setIsSeasonSummaryLoading(true);
    try {
      const res = await fetch(apiUrl(`/farm-plots/${plotId}/season-summary`), {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
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
        credentials: "include",
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
        credentials: "include",
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
    await fetchPlotAiAdviceById(editPlotData.id);
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
        credentials: "include",
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
        credentials: "include",
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
        credentials: "include",
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

  if (isLoggedIn !== true) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#EAF3E7] dark:bg-[#002115]">
        <Loader2 className="size-10 animate-spin text-[#2F6B3D]" />
      </div>
    );
  }

  return (
    <main className="relative flex h-screen w-screen flex-row overflow-hidden bg-[#EAF3E7] dark:bg-[#002115] transition-colors font-sans">
      
      {isLoggedIn && (
        <Sidebar 
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          language={language}
          currentUserRole={currentUserRole}
          logout={logout}
          t={t}
        />
      )}

      <div className="relative flex-1 h-full overflow-hidden flex flex-col">

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
        <HomeView
          language={language}
          setLanguage={setLanguage}
          userName={userName}
          weatherSummary={weatherSummary}
          weatherSourceLabel={weatherSourceLabel}
          regionName={regionName}
          districtName={districtName}
          dashboard={dashboard}
          statsCards={statsCards}
          cropRecommendationSummary={cropRecommendationSummary}
          insightConfidence={insightConfidence}
          localizedCompetition={localizedCompetition}
          weatherPreview={weatherPreview}
          featuredNews={featuredNews}
          utilityInfoCards={utilityInfoCards}
          forecastCards={forecastCards}
          cropList={cropList}
          setActiveTab={setActiveTab}
          setDrawMode={setDrawMode}
          setSelectedCropCard={setSelectedCropCard}
          mapRef={mapRef}
        />
      )}

      {activeTab === "market" && <MarketView {...({ language } as any)} />}
      {activeTab === "services" && <ServicesView language={language} />}
      {activeTab === "info" && (
        <InfoCenterView
          language={language}
          onBack={() => setActiveTab("home")}
        />
      )}
      {activeTab === "profile" && <ProfileView language={language} onLogout={logout} />}
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
        <MapOverlay
          language={language}
          setLanguage={setLanguage}
          regionName={regionName}
          weatherSummary={weatherSummary}
          measurement={measurement}
          drawMode={drawMode}
          savedPlotResult={savedPlotResult}
          setSavedPlotResult={setSavedPlotResult}
          handleSaveNewPlot={handleSaveNewPlot}
          openSavedPlotWorkspace={openSavedPlotWorkspace}
          localizedCompetition={localizedCompetition}
          localizedVisibility={localizedVisibility}
          competitionTone={competitionTone}
        />
      )}

      <PlotModals
        language={language}
        isPoleOpen={isPoleOpen}
        setIsPoleOpen={setIsPoleOpen}
        isEditModalOpen={isEditModalOpen}
        setIsEditModalOpen={setIsEditModalOpen}
        isSubmitting={isSubmitting}
        fieldName={fieldName}
        setFieldName={setFieldName}
        selectedCrop={selectedCrop}
        setSelectedCrop={setSelectedCrop}
        fillColor={fillColor}
        setFillColor={setFillColor}
        areaSizeHectares={areaSizeHectares}
        submitPlot={submitPlot}
        updatePlot={updatePlot}
      >
        <WorkspaceSheet
          language={language}
          editPlotData={editPlotData}
          editTitle={editTitle}
          editCrop={editCrop}
          fillColor={fillColor}
          isSubmitting={isSubmitting}
          isSeasonSummaryLoading={isSeasonSummaryLoading}
          seasonSummary={seasonSummary}
          isAiAdviceLoading={isAiAdviceLoading}
          plotAiAdvice={plotAiAdvice}
          isActivitiesLoading={isActivitiesLoading}
          activityForm={activityForm}
          isActivitySubmitting={isActivitySubmitting}
          plotActivities={plotActivities}
          activityTypeLabels={activityTypeLabels}
          activityTypeOptions={activityTypeOptions}
          setEditTitle={setEditTitle}
          setEditCrop={setEditCrop}
          setFillColor={setFillColor}
          setActivityForm={setActivityForm}
          deletePlot={deletePlot}
          fetchPlotAiAdvice={fetchPlotAiAdvice}
          submitActivity={submitActivity}
          deleteActivity={deleteActivity}
        />
      </PlotModals>





      {activeTab === "map" && (
        <button
          onClick={() => setIsGuideOpen(true)}
          className="lg:hidden fixed bottom-28 right-4 z-[61] flex h-12 w-12 items-center justify-center rounded-full bg-[#2F6B3D] text-white shadow-xl shadow-[#2F6B3D]/30 backdrop-blur-sm transition-all duration-200 active:scale-90"
          aria-label={language === "kk" ? "Нұсқаулық" : "Руководство"}
        >
          <BookOpen className="size-5" />
        </button>
      )}

      {isLoggedIn && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 pointer-events-auto">
          <div className="mx-3 mb-2 pb-[env(safe-area-inset-bottom)] flex h-20 items-center justify-around rounded-3xl border border-gray-200 bg-white px-2 shadow-[0_-4px_30px_rgba(0,0,0,0.08)]">
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
              {
                key: "info" as const,
                icon: Newspaper,
                label: language === "kk" ? "Ақпарат" : "Инфо",
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
                className={`relative flex h-full min-w-[48px] min-h-[48px] flex-1 flex-col items-center justify-center gap-1 transition-all duration-300 active:scale-90 ${
                  activeTab === key ? "text-[#2F6B3D]" : "text-[#9CA3AF]"
                }`}
              >
                {activeTab === key && (
                  <div className="absolute -top-1 h-1 w-8 rounded-full bg-[#2F6B3D]" />
                )}
                <Icon
                  className="size-6"
                  strokeWidth={activeTab === key ? 2.5 : 1.8}
                />
                <span className="text-xs font-bold leading-none">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      
      </div>
    </main>
  );
}
