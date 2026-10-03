"use client";

import s from "./styles/egin-map.module.css";
import React, {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
  forwardRef,
  useCallback,
} from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { mapboxGlDrawTheme } from "./styles/draw-theme";
import { ui } from "@/lib/i18n";
import * as turf from "@turf/turf";
// @ts-ignore
import { SnapPolygonMode, SnapLineMode, SnapPointMode, SnapDirectSelect } from "mapbox-gl-draw-snap-mode";
import { KZ_BOUNDS, KZ_CENTER, KZ_ZOOM } from "@/lib/kz-regions";
import { applyAutoTool } from "@/lib/turf-tools";
import type { AutoToolType } from "@/lib/turf-tools";

import type { MapProps, MapRef, BaseMapMode } from "./types";
import { GOOGLE_MAP_STYLE, SATELLITE_SOURCE } from "./styles/tile-sources";
import { buildMeasurementLabels, computeMeasurement } from "./utils/geo-helpers";
import { handleOsmWandClick } from "./utils/osm-wand";
import { fetchAndRenderPlots, CLICKABLE_PLOT_LAYERS } from "./utils/plot-fetcher";
import EginMobileTools from "./controls/EginMobileTools";
import EginToolbar from "./controls/EginToolbar";
import type { ToolDef } from "./controls/EginToolbar";
import EginQuotaWidget from "./controls/EginQuotaWidget";

// ────────────────────────────────────────────────────────
// Map Component (orchestrator)
// ────────────────────────────────────────────────────────

const Map = forwardRef<MapRef, MapProps>(
  (
    {
      onGeometrySelected,
      drawModeActive,
      language,
      showMeasurements,
      onPlotClick,
      onModeChange,
      onMeasurement,
      massWandActive,
      onProcessingStateChange,
      onNotification,
      drawMode,
      currentUserRole,
      isProcessingWand,
      measurement,
      onSavePlot,
      onOpenGuide,
    },
    ref,
  ) => {
    // ── Refs ──────────────────────────────────────────
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const drawRef = useRef<MapboxDraw | null>(null);
    const savedPlotFeaturesRef = useRef<any[]>([]);
    const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
    const lastPlotOpenAtRef = useRef(0);

    // Stable callback refs
    const onGeometrySelectedRef = useRef(onGeometrySelected);
    const languageRef = useRef(language);
    const massWandActiveRef = useRef(massWandActive);
    const onProcessingRef = useRef(onProcessingStateChange);
    const onNotificationRef = useRef(onNotification);
    const onModeChangeRef = useRef(onModeChange);
    const onPlotClickRef = useRef(onPlotClick);

    useEffect(() => { onGeometrySelectedRef.current = onGeometrySelected; }, [onGeometrySelected]);
    useEffect(() => { languageRef.current = language; }, [language]);
    useEffect(() => { massWandActiveRef.current = massWandActive; }, [massWandActive]);
    useEffect(() => { onProcessingRef.current = onProcessingStateChange; }, [onProcessingStateChange]);
    useEffect(() => { onNotificationRef.current = onNotification; }, [onNotification]);
    useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
    useEffect(() => { onPlotClickRef.current = onPlotClick; }, [onPlotClick]);

    // ── State ────────────────────────────────────────
    const [baseMapMode, setBaseMapMode] = useState<BaseMapMode>("simple");
    const [isLayersOpen, setIsLayersOpen] = useState(false);
    const [isQuotaOpen, setIsQuotaOpen] = useState(false);
    const t = ui[language] || ui.ru;
    const isKk = language === "kk";

    // ── Map helpers (no hooks — just plain fns) ──────

    const applyBaseMapMode = useCallback((mode: BaseMapMode) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      if (map.getLayer("satellite-tiles"))
        map.setLayoutProperty("satellite-tiles", "visibility", mode === "satellite" ? "visible" : "none");
      if (map.getLayer("google-standard-layer"))
        map.setLayoutProperty("google-standard-layer", "visibility", mode === "simple" ? "visible" : "none");
    }, []);

    const applyMeasurementVisibility = useCallback(() => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      if (!map.getLayer("measurement-labels-layer")) return;
      map.setLayoutProperty("measurement-labels-layer", "visibility", showMeasurements ? "visible" : "none");
    }, [showMeasurements]);

    const updateMeasurementLabels = useCallback(() => {
      const map = mapRef.current;
      const draw = drawRef.current;
      if (!map || !draw) return;
      const source = map.getSource("measurement-labels") as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData({ type: "FeatureCollection", features: buildMeasurementLabels(draw) });
    }, []);

    const executeGlobalMeasurements = useCallback(() => {
      if (!onMeasurement || !drawRef.current) return;
      onMeasurement(computeMeasurement(drawRef.current, turf));
    }, [onMeasurement]);

    const focusCurrentLocation = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;
      if (!navigator.geolocation) {
        onNotificationRef.current?.(t.browseNoGeo || "No geoloc", "error");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => map.flyTo({ center: [coords.longitude, coords.latitude], zoom: 15, essential: true }),
        () => onNotificationRef.current?.(t.noLocation || "No loc", "error"),
        { enableHighAccuracy: true, timeout: 10000 },
      );
    }, [t]);

    const handleZoomIn = useCallback(() => mapRef.current?.zoomIn(), []);
    const handleZoomOut = useCallback(() => mapRef.current?.zoomOut(), []);

    // ── Imperative handle ────────────────────────────

    useImperativeHandle(ref, () => ({
      refreshPlots: () => {
        if (mapRef.current)
          fetchAndRenderPlots(mapRef.current, t?.culture || "Культура", onPlotClickRef.current).then(
            (f) => { savedPlotFeaturesRef.current = f; },
          );
      },
      focusCurrentLocation,
      flyToRegion: (center, zoom) => mapRef.current?.flyTo({ center, zoom, essential: true, duration: 1500 }),
      changeDrawMode: (mode) => {
        if (!drawRef.current) return;
        if (mode === "direct_select") {
          const ids = drawRef.current.getSelectedIds();
          if (ids.length > 0) drawRef.current.changeMode(mode, { featureId: ids[0] });
          else onNotificationRef.current?.("Сначала выберите объект стрелкой", "warning");
        } else {
          drawRef.current.changeMode(mode);
        }
      },
      deleteSelectedDraw: () => { drawRef.current?.trash(); onMeasurement?.(null); },
      getSelectedGeometry: () => {
        const data = drawRef.current?.getSelected();
        return (data?.features?.[0]?.geometry as unknown as import("./types").GeoJSONGeometry) ?? null;
      },
      executeAutoTool: (tool) => {
        if (!drawRef.current) return;
        const selected = drawRef.current.getSelected();
        if (selected.features.length === 0) {
          onNotificationRef.current?.("Сначала выделите объекты", "warning");
          return;
        }
        const result = applyAutoTool(tool, selected.features);
        if (result?.length) {
          drawRef.current.trash();
          result.forEach((f) => drawRef.current?.add(f));
        }
      },
    }));

    // ── Map initialization ───────────────────────────

    useEffect(() => {
      if (!mapContainer.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: GOOGLE_MAP_STYLE(languageRef.current),
        center: KZ_CENTER,
        zoom: KZ_ZOOM,
        maxBounds: KZ_BOUNDS,
        preserveDrawingBuffer: true,
      } as any);

      mapRef.current = map;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        modes: {
          ...MapboxDraw.modes,
          draw_polygon: SnapPolygonMode,
          draw_line_string: SnapLineMode,
          draw_point: SnapPointMode,
          direct_select: SnapDirectSelect,
        },
        userProperties: true,
        // @ts-ignore
        snap: true,
        snapOptions: { snapPx: 15, snapToMidPoints: true },
        styles: mapboxGlDrawTheme as any,
      });

      drawRef.current = draw;
      map.addControl(draw as any, "bottom-right");

      map.on("draw.modechange", (e) => onModeChangeRef.current?.(e.mode));

      map.on("load", () => {
        // Satellite source
        if (!map.getSource("satellite")) map.addSource("satellite", SATELLITE_SOURCE as any);
        const firstLayer = map.getStyle().layers?.[0]?.id;
        if (!map.getLayer("satellite-tiles")) {
          map.addLayer({
            id: "satellite-tiles", type: "raster", source: "satellite",
            minzoom: 0, maxzoom: 20, layout: { visibility: "none" },
            paint: { "raster-saturation": 0.1, "raster-contrast": 0.15 },
          }, firstLayer);
        }

        // Measurement labels source
        if (!map.getSource("measurement-labels"))
          map.addSource("measurement-labels", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        if (!map.getLayer("measurement-labels-layer")) {
          map.addLayer({
            id: "measurement-labels-layer", type: "symbol", source: "measurement-labels",
            layout: {
              "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, -0.6],
              "text-allow-overlap": true, "text-ignore-placement": true,
              visibility: showMeasurements ? "visible" : "none",
            },
            paint: { "text-color": "#FFFFFF", "text-halo-color": "#17311F", "text-halo-width": 2 },
          });
        }

        applyBaseMapMode(baseMapMode);
        applyMeasurementVisibility();
        fetchAndRenderPlots(map, t?.culture || "Культура", onPlotClickRef.current)
          .then((f) => { savedPlotFeaturesRef.current = f; })
          .catch(() => console.warn("Farm plots temporarily unavailable"));
      });

      const onDrawChange = () => { updateMeasurementLabels(); executeGlobalMeasurements(); };
      map.on("draw.create", onDrawChange);
      map.on("draw.update", onDrawChange);
      map.on("draw.render", updateMeasurementLabels);
      map.on("draw.selectionchange", executeGlobalMeasurements);
      map.on("draw.delete", onDrawChange);

      return () => { map.remove(); mapRef.current = null; };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Side-effects ─────────────────────────────────

    useEffect(() => { applyBaseMapMode(baseMapMode); }, [baseMapMode, applyBaseMapMode]);
    useEffect(() => { applyMeasurementVisibility(); }, [showMeasurements, applyMeasurementVisibility]);

    useEffect(() => {
      const map = mapRef.current;
      const canvas = map?.getCanvas();
      if (!map || !canvas) return;
      if (massWandActive) {
        map.dragPan.disable(); map.scrollZoom.disable(); map.doubleClickZoom.disable();
        canvas.style.cursor = "crosshair";
      } else {
        map.dragPan.enable(); map.scrollZoom.enable(); map.doubleClickZoom.enable();
        canvas.style.cursor = drawModeActive ? "crosshair" : "";
      }
    }, [drawModeActive, massWandActive]);

    // ── Wand click handler ───────────────────────────

    const handleWandClick = useCallback(async (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const map = mapRef.current;
      const draw = drawRef.current;
      const rect = mapContainer.current?.getBoundingClientRect();
      if (!rect || !map || !draw) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lngLat = map.unproject([x, y]);

      await handleOsmWandClick(lngLat, draw, map, {
        onProcessing: onProcessingRef.current ?? undefined,
        onNotification: onNotificationRef.current ?? undefined,
      });
    }, []);

    // ── Plot-click pointer handlers ──────────────────

    const openSavedPlotAtPoint = useCallback((clientX: number, clientY: number, event?: { preventDefault: () => void; stopPropagation: () => void }) => {
      if (massWandActiveRef.current) return;
      const map = mapRef.current;
      const rect = mapContainer.current?.getBoundingClientRect();
      if (!map || !rect) return;

      const point: [number, number] = [clientX - rect.left, clientY - rect.top];
      const layers = CLICKABLE_PLOT_LAYERS.filter((id) => map.getLayer(id));
      if (layers.length === 0) return;

      const rendered = map.queryRenderedFeatures(point, { layers });
      let plot = rendered[0]?.properties;

      if (!plot) {
        const lngLat = map.unproject(point);
        const clicked = turf.point([lngLat.lng, lngLat.lat]);
        const found = savedPlotFeaturesRef.current.find((f) => {
          try { return turf.booleanPointInPolygon(clicked, f as any); } catch { return false; }
        });
        plot = found?.properties;
      }

      if (!plot) return;
      const now = Date.now();
      if (now - lastPlotOpenAtRef.current < 350) return;
      lastPlotOpenAtRef.current = now;
      event?.preventDefault();
      event?.stopPropagation();
      onPlotClickRef.current?.(plot as import("./types").PlotProperties & { geometry?: string | import("./types").GeoJSONGeometry });
    }, []);

    const isTap = (cx: number, cy: number, requireStart = true) => {
      const s = pointerStartRef.current;
      if (!s) return !requireStart;
      return Math.hypot(cx - s.x, cy - s.y) <= 8 && Date.now() - s.time <= 800;
    };

    const rememberStart = (cx: number, cy: number) => {
      pointerStartRef.current = { x: cx, y: cy, time: Date.now() };
    };

    const clearStart = () => { pointerStartRef.current = null; };

    const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isTap(e.clientX, e.clientY, false)) return;
      openSavedPlotAtPoint(e.clientX, e.clientY, e);
      clearStart();
    };
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => rememberStart(e.clientX, e.clientY);
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isTap(e.clientX, e.clientY, true)) { clearStart(); return; }
      openSavedPlotAtPoint(e.clientX, e.clientY, e);
      clearStart();
    };
    const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0]; if (t) rememberStart(t.clientX, t.clientY);
    };
    const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
      const t = e.changedTouches[0]; if (!t) return;
      if (!isTap(t.clientX, t.clientY, true)) { clearStart(); return; }
      openSavedPlotAtPoint(t.clientX, t.clientY, e as any);
      clearStart();
    };

    // ── Toolbar tool definitions ─────────────────────

    const drawModeValue = drawMode || "";

    const toolDefs: ToolDef[] = useMemo(() => [
      { id: "location", label: isKk ? "Менің орным" : "Где я нахожусь",
        icon: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="3" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="9" y1="14" x2="9" y2="17" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="14" y1="9" x2="17" y2="9" /></svg>,
        onClick: focusCurrentLocation },
      { id: "draw_line_string_ruler", label: isKk ? "Сызғыш" : "Линейка",
        icon: <svg viewBox="0 0 18 18"><path d="M2 16L16 2" /><line x1="5" y1="13" x2="7" y2="11" /><line x1="8" y1="10" x2="10" y2="8" /><line x1="11" y1="7" x2="13" y2="5" /></svg>,
        onClick: () => { drawRef.current?.changeMode("draw_line_string"); onModeChange?.("draw_line_string"); },
        active: drawModeValue === "draw_line_string" },
      { id: "simple_select", label: isKk ? "Таңдау" : "Выбор",
        icon: <svg viewBox="0 0 18 18"><path d="M4 2L4 14L7.5 10.5L11 14L13 12L9.5 8.5L14 5Z" /></svg>,
        onClick: () => { drawRef.current?.changeMode("simple_select"); onModeChange?.("simple_select"); },
        active: drawModeValue === "simple_select" },
      { id: "direct_select", label: isKk ? "Түзету" : "Правка",
        icon: <svg viewBox="0 0 18 18"><rect x="3" y="3" width="12" height="12" rx="1" /><circle cx="3" cy="3" r="1.5" fill="currentColor" /><circle cx="15" cy="3" r="1.5" fill="currentColor" /><circle cx="3" cy="15" r="1.5" fill="currentColor" /><circle cx="15" cy="15" r="1.5" fill="currentColor" /></svg>,
        onClick: () => {
          const ids = drawRef.current?.getSelectedIds();
          if (ids?.length) drawRef.current?.changeMode("direct_select", { featureId: ids[0] });
          else onNotification?.(isKk ? "Алдымен нысанды таңдаңыз" : "Сначала выберите объект", "warning");
        },
        active: drawModeValue === "direct_select", divider: true },
      { id: "draw_polygon", label: isKk ? "Алаң сызу" : "Нарисовать поле",
        icon: <svg viewBox="0 0 18 18"><polygon points="9,2 16,7 14,15 4,15 2,7" /></svg>,
        onClick: () => { drawRef.current?.changeMode("draw_polygon"); onModeChange?.("draw_polygon"); },
        active: drawModeValue === "draw_polygon" },
      { id: "draw_line_string", label: isKk ? "Сызық" : "Линия",
        icon: <svg viewBox="0 0 18 18"><path d="M3 15L8 6L12 10L15 3" /></svg>,
        onClick: () => { drawRef.current?.changeMode("draw_line_string"); onModeChange?.("draw_line_string"); },
        active: drawModeValue === "draw_line_string" },
      { id: "draw_point", label: isKk ? "Белгі" : "Метка",
        icon: <svg viewBox="0 0 18 18"><path d="M9 2C6.24 2 4 4.24 4 7C4 11 9 16 9 16C9 16 14 11 14 7C14 4.24 11.76 2 9 2Z" /><circle cx="9" cy="7" r="2" /></svg>,
        onClick: () => { drawRef.current?.changeMode("draw_point"); onModeChange?.("draw_point"); },
        active: drawModeValue === "draw_point" },
      { id: "mass_magic_wand", label: isKk ? "Автоанықтау" : "Найти границы автоматически",
        icon: isProcessingWand
          ? <svg viewBox="0 0 18 18" className="animate-spin"><circle cx="9" cy="9" r="7" strokeDasharray="14 28" /></svg>
          : <svg viewBox="0 0 18 18"><path d="M3 3L5 8L3 13L8 11L13 13L11 8L13 3L8 5Z" /><line x1="13" y1="3" x2="16" y2="1" /><line x1="15" y1="7" x2="17" y2="7" /><line x1="13" y1="13" x2="16" y2="16" /></svg>,
        onClick: () => onModeChange?.("mass_magic_wand"),
        active: drawModeValue === "mass_magic_wand", divider: true },
      { id: "hexGrid", label: isKk ? "Гекс тор" : "Разделить на участки по 1 га",
        icon: <svg viewBox="0 0 18 18"><polygon points="9,1 15,4.5 15,11.5 9,15 3,11.5 3,4.5" /><line x1="9" y1="1" x2="9" y2="15" /><line x1="3" y1="4.5" x2="15" y2="4.5" /><line x1="3" y1="11.5" x2="15" y2="11.5" /></svg>,
        onClick: () => {
          if (!drawRef.current) return;
          const sel = drawRef.current.getSelected();
          if (!sel.features.length) { onNotification?.(isKk ? "Алдымен нысандарды таңдаңыз" : "Сначала выделите объекты", "warning"); return; }
          const res = applyAutoTool("hexGrid_1ha", sel.features);
          if (res?.length) { drawRef.current.trash(); res.forEach(f => drawRef.current?.add(f)); }
        }},
      { id: "delete", label: isKk ? "Жою" : "Удалить",
        icon: <svg viewBox="0 0 18 18"><path d="M3 5H15" /><path d="M6 5V3H12V5" /><path d="M5 5L6 15H12L13 5" /><line x1="8" y1="8" x2="8" y2="12" /><line x1="10" y1="8" x2="10" y2="12" /></svg>,
        onClick: () => { drawRef.current?.trash(); onMeasurement?.(null); },
        danger: true, divider: true },
      { id: "help", label: isKk ? "Нұсқаулық" : "Как пользоваться",
        icon: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M7 6c0-1.1.9-2 2-2s2 .9 2 2c0 2-2 2-2 3" stroke="currentColor" fill="none" strokeLinecap="round" strokeWidth="1.5"/><circle cx="9" cy="13" r="1" fill="currentColor"/></svg>,
        onClick: () => onOpenGuide?.(),
        divider: true },
    ], [drawModeValue, isKk, isProcessingWand, focusCurrentLocation, onModeChange, onMeasurement, onNotification, onOpenGuide]);

    const isAdmin = currentUserRole === "admin";

    // ── Render ───────────────────────────────────────

    return (
      <div className={s.wrapper}>
        {massWandActive && <div className={s.wandOverlay} onClick={handleWandClick} />}

        <div
          ref={mapContainer}
          className={s.canvas}
          onClickCapture={onClickCapture}
          onPointerDownCapture={onPointerDown}
          onPointerUpCapture={onPointerUp}
          onPointerCancelCapture={clearStart}
          onTouchStartCapture={onTouchStart}
          onTouchEndCapture={onTouchEnd}
          onTouchCancelCapture={clearStart}
        />

        <EginToolbar tools={toolDefs} />
        <EginMobileTools tools={toolDefs} language={language || "ru"} />

        {/* Measurement */}
        {measurement && showMeasurements && (
          <div className={s.measureBar}>
            <span className={s.measureLabel}>{isKk ? "Өлшем" : "Измерение"}</span>
            <span className={s.measureValue}>{measurement}</span>
            <span className={s.measureMode}>{drawModeValue.replace(/_/g, " ")}</span>
          </div>
        )}

        {/* Admin quota */}
        {isAdmin && !isQuotaOpen && (
          <button type="button" onClick={() => setIsQuotaOpen(true)} className={s.quotaToggle} aria-label="API Quotas">
            <svg viewBox="0 0 18 18"><rect x="2" y="10" width="3" height="6" rx="0.5" /><rect x="7.5" y="6" width="3" height="10" rx="0.5" /><rect x="13" y="2" width="3" height="14" rx="0.5" /></svg>
          </button>
        )}
        <EginQuotaWidget visible={isAdmin && isQuotaOpen} onClose={() => setIsQuotaOpen(false)} />

        {/* Layer switcher */}
        <div className={s.layerControl}>
          <button type="button" onClick={() => setIsLayersOpen((o) => !o)} className={s.layerTrigger}>
            <div className={baseMapMode === "satellite" ? s.layerPreviewSatellite : s.layerPreviewSimple} />
            <div className={s.layerMeta}>
              <div className={s.layerLabel}>{t?.layers || "Слои"}</div>
              <div className={s.layerTitle}>{baseMapMode === "simple" ? (t?.simple || "Схема") : (t?.satellite || "Спутник")}</div>
            </div>
          </button>
          {isLayersOpen && (
            <div className={s.layerDropdown}>
              <button type="button" onClick={() => { setBaseMapMode("simple"); setIsLayersOpen(false); }} className={baseMapMode === "simple" ? s.layerOptionActive : s.layerOptionInactive}>
                {t?.simpleMap || "Обычная карта"}
              </button>
              <button type="button" onClick={() => { setBaseMapMode("satellite"); setIsLayersOpen(false); }} className={baseMapMode === "satellite" ? s.layerOptionActive : s.layerOptionInactive}>
                {t?.satelliteMap || "Спутник"}
              </button>
            </div>
          )}
        </div>

        {/* Zoom */}
        <div className={s.zoomGroup}>
          <button type="button" onClick={handleZoomIn} className={s.zoomBtn} aria-label={isKk ? "Жақындату" : "Приблизить карту"}>
            <svg viewBox="0 0 18 18"><line x1="9" y1="3" x2="9" y2="15" /><line x1="3" y1="9" x2="15" y2="9" /></svg>
          </button>
          <div className={s.zoomDivider} />
          <button type="button" onClick={handleZoomOut} className={s.zoomBtn} aria-label={isKk ? "Алыстату" : "Отдалить карту"}>
            <svg viewBox="0 0 18 18"><line x1="3" y1="9" x2="15" y2="9" /></svg>
          </button>
        </div>
      </div>
    );
  },
);

Map.displayName = "Map";
export default Map;
export type { MapRef, MapProps };
