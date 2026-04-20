/// <reference types="@types/google.maps" />
"use client";

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { ui } from "@/lib/i18n";
import type { PlatformLanguage } from "@/lib/i18n";
import { KZ_CENTER, KZ_ZOOM } from "@/lib/kz-regions";
import { apiUrl } from "@/lib/api";
import { EGIN_GOOGLE_MAP_STYLE } from "./styles/egin-map-style";
import type { MapRef, MapProps, GeoJSONGeometry, PlotProperties } from "./types";
import s from "./styles/egin-map.module.css";
import EginToolbar from "./controls/EginToolbar";
import type { ToolDef } from "./controls/EginToolbar";
import EginMobileTools from "./controls/EginMobileTools";

// ─── Inline SVG icons (no external deps) ──────────────
const IconPlus = () => (
  <svg viewBox="0 0 18 18"><line x1="9" y1="3" x2="9" y2="15" /><line x1="3" y1="9" x2="15" y2="9" /></svg>
);
const IconMinus = () => (
  <svg viewBox="0 0 18 18"><line x1="3" y1="9" x2="15" y2="9" /></svg>
);
const IconLayers = () => (
  <svg viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 2L1.5 6.5L9 11L16.5 6.5L9 2Z" />
    <path d="M1.5 11L9 15.5L16.5 11" />
  </svg>
);

// ─── Polygon helper (unchanged logic) ─────────────────
const Polygon = ({ paths, options, onClick }: { paths: google.maps.LatLngLiteral[]; options: google.maps.PolygonOptions; onClick?: () => void }) => {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const polygon = new google.maps.Polygon({ ...options, paths, map });
    if (onClick) polygon.addListener("click", onClick);
    return () => {
      polygon.setMap(null);
      google.maps.event.clearInstanceListeners(polygon);
    };
  }, [map, paths, options, onClick]);
  return null;
};

// ─── Drawing Manager (unchanged logic) ────────────────
const DrawingManager = ({ mode, onGeometrySelected }: { mode: string; onGeometrySelected: (geom: GeoJSONGeometry) => void }) => {
  const map = useMap();
  const drawingLib = useMapsLibrary("drawing");
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const currentShapeRef = useRef<google.maps.Polygon | google.maps.Polyline | google.maps.Marker | null>(null);

  useEffect(() => {
    if (!map || !drawingLib) return;

    const dm = new drawingLib.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        fillColor: "#4ADE80",
        fillOpacity: 0.3,
        strokeColor: "#4ADE80",
        strokeWeight: 2,
        clickable: true,
        editable: true,
        zIndex: 1,
      },
    });

    dm.setMap(map);
    drawingManagerRef.current = dm;

    google.maps.event.addListener(dm, "overlaycomplete", (event: google.maps.drawing.OverlayCompleteEvent) => {
      if (currentShapeRef.current) currentShapeRef.current.setMap(null);
      currentShapeRef.current = event.overlay as google.maps.Polygon | google.maps.Polyline | google.maps.Marker | null;
      dm.setDrawingMode(null);

      if (event.type === google.maps.drawing.OverlayType.POLYGON) {
        const polygon = event.overlay as google.maps.Polygon;
        const paths = polygon.getPath();
        const coords: number[][] = [];
        for (let i = 0; i < paths.getLength(); i++) {
          const xy = paths.getAt(i);
          coords.push([xy.lng(), xy.lat()]);
        }
        coords.push(coords[0]);
        onGeometrySelected({ type: "Polygon", coordinates: [coords] });
      }
    });

    return () => {
      dm.setMap(null);
      if (currentShapeRef.current) currentShapeRef.current.setMap(null);
    };
  }, [map, drawingLib]);

  useEffect(() => {
    if (!drawingManagerRef.current) return;

    let googleMode: google.maps.drawing.OverlayType | null = null;
    if (mode === "draw_polygon") googleMode = google.maps.drawing.OverlayType.POLYGON;
    else if (mode === "draw_line_string") googleMode = google.maps.drawing.OverlayType.POLYLINE;
    else if (mode === "draw_point") googleMode = google.maps.drawing.OverlayType.MARKER;

    drawingManagerRef.current.setDrawingMode(googleMode);
  }, [mode]);

  return null;
};

// ─── Main Component ───────────────────────────────────
const GoogleMapComponent = forwardRef<MapRef, MapProps>(
  ({ language, onPlotClick, onGeometrySelected, onModeChange }, ref) => {
    const [plots, setPlots] = useState<(PlotProperties & { geometry?: string | GeoJSONGeometry })[]>([]);
    const [drawMode, setDrawMode] = useState<string>("");
    const [isLayersOpen, setIsLayersOpen] = useState(false);
    const [mapType, setMapType] = useState<"roadmap" | "satellite">("satellite");
    const mapRef = useRef<google.maps.Map | null>(null);
    const t = ui[language] || ui.ru;

    useEffect(() => {
      fetch(apiUrl("/api-usage/increment/google_maps"), { method: "POST" }).catch(() => {});
      fetchPlots();
    }, []);

    const fetchPlots = async () => {
      try {
        const token = localStorage.getItem("agro_token");
        const res = await fetch(apiUrl("/farm-plots"), { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.success) setPlots(json.data);
      } catch (err) {
        console.error(err);
      }
    };

    const handleZoomIn = () => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) + 1);
    const handleZoomOut = () => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) - 1);

    const switchMapType = (type: "roadmap" | "satellite") => {
      mapRef.current?.setMapTypeId(type);
      setMapType(type);
      setIsLayersOpen(false);
    };

    useImperativeHandle(ref, () => ({
      refreshPlots: fetchPlots,
      focusCurrentLocation: () => {
        navigator.geolocation.getCurrentPosition((pos) => {
          mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          mapRef.current?.setZoom(15);
        });
      },
      flyToRegion: (center, zoom) => {
        mapRef.current?.panTo({ lat: center[1], lng: center[0] });
        mapRef.current?.setZoom(zoom);
      },
      changeDrawMode: (mode) => {
        setDrawMode(mode);
        onModeChange?.(mode);
      },
      deleteSelectedDraw: () => {
        setDrawMode("");
        onGeometrySelected?.(null);
      },
      getSelectedGeometry: () => null,
      executeAutoTool: () => {},
    }));

    const isKk = language === "kk";
    const drawModeValue = drawMode || "";

    const toolDefs: ToolDef[] = React.useMemo(() => [
      { id: "location", label: isKk ? "Менің орным" : "Моя точка",
        icon: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="3" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="9" y1="14" x2="9" y2="17" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="14" y1="9" x2="17" y2="9" /></svg>,
        onClick: () => {
          navigator.geolocation.getCurrentPosition((pos) => {
            mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            mapRef.current?.setZoom(15);
          });
        } },
      { id: "simple_select", label: isKk ? "Таңдау" : "Выбор",
        icon: <svg viewBox="0 0 18 18"><path d="M4 2L4 14L7.5 10.5L11 14L13 12L9.5 8.5L14 5Z" /></svg>,
        onClick: () => { setDrawMode("simple_select"); onModeChange?.("simple_select"); },
        active: drawModeValue === "simple_select", divider: true },
      { id: "draw_polygon", label: isKk ? "Алаң сызу" : "Нарисовать поле",
        icon: <svg viewBox="0 0 18 18"><polygon points="9,2 16,7 14,15 4,15 2,7" /></svg>,
        onClick: () => { setDrawMode("draw_polygon"); onModeChange?.("draw_polygon"); },
        active: drawModeValue === "draw_polygon" },
      { id: "draw_line_string", label: isKk ? "Сызық" : "Линия",
        icon: <svg viewBox="0 0 18 18"><path d="M3 15L8 6L12 10L15 3" /></svg>,
        onClick: () => { setDrawMode("draw_line_string"); onModeChange?.("draw_line_string"); },
        active: drawModeValue === "draw_line_string" },
      { id: "draw_point", label: isKk ? "Белгі" : "Метка",
        icon: <svg viewBox="0 0 18 18"><path d="M9 2C6.24 2 4 4.24 4 7C4 11 9 16 9 16C9 16 14 11 14 7C14 4.24 11.76 2 9 2Z" /><circle cx="9" cy="7" r="2" /></svg>,
        onClick: () => { setDrawMode("draw_point"); onModeChange?.("draw_point"); },
        active: drawModeValue === "draw_point", divider: true },
      { id: "delete", label: isKk ? "Жою" : "Удалить",
        icon: <svg viewBox="0 0 18 18"><path d="M3 5H15" /><path d="M6 5V3H12V5" /><path d="M5 5L6 15H12L13 5" /><line x1="8" y1="8" x2="8" y2="12" /><line x1="10" y1="8" x2="10" y2="12" /></svg>,
        onClick: () => { setDrawMode(""); onGeometrySelected?.(null); },
        danger: true }
    ], [drawModeValue, isKk, onModeChange, onGeometrySelected]);

    return (
      <APIProvider apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ""}>
        <div className={s.wrapper}>
          <Map
            defaultCenter={{ lat: KZ_CENTER[1], lng: KZ_CENTER[0] }}
            defaultZoom={KZ_ZOOM}
            mapId={"bf19558667822d69"}
            disableDefaultUI={true}
            clickableIcons={false}
            gestureHandling={"greedy"}
            backgroundColor={"#1a1a1a"}
            onTilesLoaded={(ev) => {
              if (!mapRef.current) {
                mapRef.current = ev.map;
                if (mapType === "roadmap") {
                  ev.map.setOptions({ styles: EGIN_GOOGLE_MAP_STYLE });
                }
              }
            }}
            mapTypeId={mapType}
          >
            <DrawingManager
              mode={drawMode}
              onGeometrySelected={(geom) => onGeometrySelected?.(geom)}
            />
            {plots.map((plot) => {
              const geom = typeof plot.geometry === "string" ? JSON.parse(plot.geometry) : plot.geometry;
              if (!geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) return null;
              const paths =
                geom.type === "Polygon"
                  ? geom.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }))
                  : geom.coordinates[0][0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));

              return (
                <Polygon
                  key={plot.id}
                  paths={paths}
                  options={{
                    fillColor: plot.fillColor || "#4ADE80",
                    fillOpacity: 0.3,
                    strokeColor: "#fff",
                    strokeWeight: 1.5,
                    strokeOpacity: 0.6,
                  }}
                  onClick={() => onPlotClick?.(plot)}
                />
              );
            })}
          </Map>

          <div className="hidden lg:block"><EginToolbar tools={toolDefs} /></div>
          <div className="lg:hidden"><EginMobileTools tools={toolDefs} /></div>

          {/* ── Zoom Controls ──────────────────────── */}
          <div className={s.zoomGroup}>
            <button type="button" onClick={handleZoomIn} className={s.zoomBtn} aria-label="Zoom in">
              <IconPlus />
            </button>
            <div className={s.zoomDivider} />
            <button type="button" onClick={handleZoomOut} className={s.zoomBtn} aria-label="Zoom out">
              <IconMinus />
            </button>
          </div>

          {/* ── Layer Switcher ─────────────────────── */}
          <div className={s.layerControl}>
            <button
              type="button"
              onClick={() => setIsLayersOpen((o) => !o)}
              className={s.layerTrigger}
            >
              <div className={mapType === "satellite" ? s.layerPreviewSatellite : s.layerPreviewSimple} />
              <div className={s.layerMeta}>
                <div className={s.layerLabel}>{t?.layers || "Слои"}</div>
                <div className={s.layerTitle}>
                  {mapType === "roadmap" ? (t?.simple || "Схема") : (t?.satellite || "Спутник")}
                </div>
              </div>
            </button>
            {isLayersOpen && (
              <div className={s.layerDropdown}>
                <button
                  type="button"
                  onClick={() => switchMapType("roadmap")}
                  className={mapType === "roadmap" ? s.layerOptionActive : s.layerOptionInactive}
                >
                  {t?.simpleMap || "Обычная карта"}
                </button>
                <button
                  type="button"
                  onClick={() => switchMapType("satellite")}
                  className={mapType === "satellite" ? s.layerOptionActive : s.layerOptionInactive}
                >
                  {t?.satelliteMap || "Спутник"}
                </button>
              </div>
            )}
          </div>
        </div>
      </APIProvider>
    );
  }
);

GoogleMapComponent.displayName = "GoogleMapComponent";
export default GoogleMapComponent;
