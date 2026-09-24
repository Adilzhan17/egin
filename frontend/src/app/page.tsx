"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { area as turfArea } from "@turf/turf";
import { Loader2 } from "lucide-react";
import GoogleMap from "@/components/map/GoogleMap";
import MapLibreMap from "@/components/map/Map";
import type { Geometry } from "geojson";
import type { GeoJSONGeometry, PlotProperties, MapRef } from "@/components/map/types";

const Map = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? GoogleMap : MapLibreMap;
import MarketView from "@/components/ui/market-view";
import ProfileView from "@/components/ui/profile-view";
import ServicesView from "@/components/ui/services-view";
import InfoCenterView from "@/components/ui/info-center-view";
import AdminView from "@/components/ui/admin-view";
import { MobileNavigation, MenuView, type AppTab } from "@/components/ui/app-navigation";
import { ChatOverlay } from "@/components/ui/chat-overlay";
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
import { cropLabels, ui } from "@/lib/i18n";
import type { PlatformLanguage } from "@/lib/i18n";
import { apiUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type ActiveTab = AppTab;
type EditablePlot = Omit<PlotProperties, "fillColor"> & { fillColor?: string | null; geometry?: string | GeoJSONGeometry };



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

export default function Home() {
  const mapRef = useRef<MapRef>(null);

  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const router = useRouter();
  const [activeTab, setActiveTabState] = useState<ActiveTab>("home");
  const setActiveTab = useCallback((tab: ActiveTab) => {
    if (window.location.hash !== `#${tab}`) window.history.pushState(null, "", `#${tab}`);
    setActiveTabState(tab);
  }, []);
  useEffect(() => {
    const restoreTab = () => {
      const tab = window.location.hash.slice(1);
      const valid = ["home", "map", "market", "chat", "menu", "profile", "services", "info"];
      if (localStorage.getItem("agro_user_role") === "admin") valid.push("admin");
      setActiveTabState(valid.includes(tab) ? tab as ActiveTab : "home");
    };
    restoreTab();
    window.addEventListener("popstate", restoreTab);
    window.addEventListener("hashchange", restoreTab);
    return () => {
      window.removeEventListener("popstate", restoreTab);
      window.removeEventListener("hashchange", restoreTab);
    };
  }, []);
  const { isLoggedIn, logout } = useAuth();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
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
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("agro_language");
    if (saved === "ru" || saved === "kk") setLanguage(saved);
    setLanguageReady(true);
  }, []);

  useEffect(() => {
    if (!languageReady) return;
    localStorage.setItem("agro_language", language);
    document.documentElement.lang = language;
  }, [language, languageReady]);
  
  // Auth security check
  useEffect(() => {
    if (isLoggedIn === false) {
      router.push("/login");
    }
  }, [isLoggedIn, router]);

  const [savedPlotResult, setSavedPlotResult] = useState<SavedPlotResult | null>(null);
  const [selectedCropCard, setSelectedCropCard] = useState<DashboardCrop | null>(null);

  const [isPoleOpen, setIsPoleOpen] = useState(false);
  const [drawnGeometry, setDrawnGeometry] = useState<GeoJSONGeometry | null>(null);
  const [fieldName, setFieldName] = useState("Орёл 22");
  const [selectedCrop, setSelectedCrop] = useState<string>("");
  const [fillColor, setFillColor] = useState<string>("#D9B44A");

  const [editPlotData, setEditPlotData] = useState<EditablePlot | null>(null);
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
    ? turfArea({ type: "Feature", geometry: drawnGeometry as Geometry, properties: {} }) / 10000
    : 0;

  const fetchDashboard = useCallback(async () => {
    const token = localStorage.getItem("agro_token");
    if (!token) return;

    setIsDashboardLoading(true);
    setDashboardError(false);
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
      if (res.ok && json.success && json.data) {
        setDashboard(json.data);
      } else {
        setDashboardError(true);
      }
    } catch {
      setDashboardError(true);
    } finally {
      setIsDashboardLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    if (isLoggedIn === true) {
      setCurrentUserRole(localStorage.getItem("agro_user_role") || "farmer");
      setCurrentUserId(localStorage.getItem("agro_user_id"));
      fetchDashboard();
    }
    setSelectedCrop(cropLabels[language].watermelon);
    setEditCrop(cropLabels[language].watermelon);
  }, [language, isLoggedIn, fetchDashboard]);

  const handlePlotClick = (plot: EditablePlot) => {
    setSavedPlotResult(null);
    setEditPlotData(plot);
    setEditTitle(plot.title || "");
    setEditCrop(plot.cropType || cropLabels[language].watermelon);
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
    setEditCrop(plot.cropType || cropLabels[language].watermelon);
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
  }, [activeTab, currentUserRole, setActiveTab]);

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
        language === "kk" ? "Осы егістікті жойғыңыз келе ме?" : "Вы уверены, что хотите удалить этот участок?",
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


  const regionName = dashboard?.profile.region || "";
  const districtName = dashboard?.profile.district || "";
  const userName = dashboard?.profile.fullName || (language === "kk" ? "фермер" : "фермер");
  const weatherSummary = dashboard?.weather.summary?.trim() ||
    (language === "kk" ? "Ауа райы деректері әзірге жоқ" : "Данные о погоде пока недоступны");
  const localizedVisibility = {
    hidden: language === "kk" ? "Жасырын" : "Скрыто",
    visible: language === "kk" ? "Көрінеді" : "Видно",
  } as const;
  if (isLoggedIn !== true) {
    return (
      <div className="flex h-dvh w-screen items-center justify-center bg-[#EAF3E7] dark:bg-[#002115]">
        <Loader2 className="size-10 animate-spin text-[#2F6B3D]" />
      </div>
    );
  }

  return (
    // h-dvh (not h-screen/100vh): 100vh is measured against the browser's largest possible
    // viewport, which is taller than what's actually visible while the mobile address bar is
    // shown. That made the whole app taller than the screen and scrollable, so the top region
    // card scrolled up under the browser chrome while the absolutely-positioned draw toolbar
    // (sized off this same container) stretched down over the bottom nav bar.
    <main className="relative flex h-dvh w-screen flex-row overflow-hidden bg-[#EAF3E7] dark:bg-[#002115] transition-colors font-sans">
      
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
          role="status"
          className={`fixed top-8 left-1/2 max-w-[calc(100%-2rem)] z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full px-6 py-3 text-sm font-black shadow-2xl ${
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
        inert={activeTab !== "map"}
        aria-hidden={activeTab !== "map"}
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
          userName={userName}
          regionName={regionName}
          districtName={districtName}
          dashboard={dashboard}
          isLoading={isDashboardLoading}
          error={dashboardError}
          onRetry={fetchDashboard}
          onHelp={() => setIsGuideOpen(true)}
          onAddPlot={() => {
            setActiveTab("map");
            setDrawMode("draw_polygon");
            mapRef.current?.changeDrawMode("draw_polygon");
          }}
          setActiveTab={setActiveTab}
          setSelectedCropCard={setSelectedCropCard}
        />
      )}

      {activeTab === "menu" && <MenuView language={language} setLanguage={setLanguage} onNavigate={setActiveTab} onHelp={() => setIsGuideOpen(true)} isAdmin={currentUserRole === "admin"} />}
      <ChatOverlay isOpen={activeTab === "chat"} onClose={() => setActiveTab("home")} language={language} currentUserId={currentUserId} onOpenMarket={() => setActiveTab("market")} />

      {activeTab === "market" && <MarketView language={language} />}
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





      {isLoggedIn && <MobileNavigation activeTab={activeTab} onNavigate={setActiveTab} language={language} />}
      
      </div>
    </main>
  );
}
