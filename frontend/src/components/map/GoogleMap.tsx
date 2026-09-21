/// <reference types="@types/google.maps" />
"use client";

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback, useMemo } from "react";
import { area as turfArea, length as turfLength } from "@turf/turf";
import { APIProvider, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { HelpCircle } from "lucide-react";
import { ui } from "@/lib/i18n";
import { KZ_CENTER, KZ_ZOOM } from "@/lib/kz-regions";
import { apiUrl } from "@/lib/api";
import { applyAutoTool } from "@/lib/turf-tools";
import { EGIN_GOOGLE_MAP_STYLE, EGIN_GOOGLE_MAP_DARK_STYLE } from "./styles/egin-map-style";
import type { MapRef, MapProps, GeoJSONGeometry, PlotProperties } from "./types";
import s from "./styles/egin-map.module.css";
import EginToolbar from "./controls/EginToolbar";
import type { ToolDef } from "./controls/EginToolbar";
import EginQuotaWidget from "./controls/EginQuotaWidget";
import { handleOsmWandClickGoogle } from "./utils/osm-wand-google";
import BrushTool from "./BrushTool";


// ─── Inline SVG icons (no external deps) ──────────────
const IconPlus = () => (
  <svg viewBox="0 0 18 18"><line x1="9" y1="3" x2="9" y2="15" /><line x1="3" y1="9" x2="15" y2="9" /></svg>
);
const IconMinus = () => (
  <svg viewBox="0 0 18 18"><line x1="3" y1="9" x2="15" y2="9" /></svg>
);

type DraftOverlayKind = "polygon" | "polyline" | "marker";

type DraftOverlayHandle = {
  kind: DraftOverlayKind;
  overlay: google.maps.Polygon | google.maps.Polyline | google.maps.Marker;
};

const geometryToMeasurement = (geometry: GeoJSONGeometry | null): string | null => {
  if (!geometry) return null;

  if (geometry.type === "Polygon" || geometry.type === "MultiPolygon") {
    const area = turfArea({
      type: "Feature",
      geometry: geometry as GeoJSONGeometry & GeoJSON.Polygon,
      properties: {},
    });
    return `${(area / 10_000).toFixed(2)} га`;
  }

  if (geometry.type === "LineString") {
    const length = turfLength(
      {
        type: "Feature",
        geometry: geometry as GeoJSONGeometry & GeoJSON.LineString,
        properties: {},
      },
      { units: "kilometers" },
    );
    return `${length.toFixed(2)} км`;
  }

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const [lng, lat] = geometry.coordinates as number[];
    return `[${lng.toFixed(4)}, ${lat.toFixed(4)}]`;
  }

  return null;
};

const polygonToGeometry = (polygon: google.maps.Polygon): GeoJSONGeometry => {
  const paths = polygon.getPaths();
  const coordinates: number[][][] = [];

  for (let pathIndex = 0; pathIndex < paths.getLength(); pathIndex++) {
    const path = paths.getAt(pathIndex);
    const ring: number[][] = [];

    for (let i = 0; i < path.getLength(); i++) {
      const point = path.getAt(i);
      ring.push([point.lng(), point.lat()]);
    }

    if (ring.length > 0) {
      const [firstLng, firstLat] = ring[0];
      const [lastLng, lastLat] = ring[ring.length - 1];
      if (firstLng !== lastLng || firstLat !== lastLat) {
        ring.push([firstLng, firstLat]);
      }
    }

    if (ring.length > 0) {
      coordinates.push(ring);
    }
  }

  return { type: "Polygon", coordinates };
};

const polylineToGeometry = (polyline: google.maps.Polyline): GeoJSONGeometry => {
  const path = polyline.getPath();
  const coordinates: number[][] = [];

  for (let i = 0; i < path.getLength(); i++) {
    const point = path.getAt(i);
    coordinates.push([point.lng(), point.lat()]);
  }

  return { type: "LineString", coordinates };
};

const markerToGeometry = (marker: google.maps.Marker): GeoJSONGeometry | null => {
  const position = marker.getPosition();
  if (!position) return null;
  return { type: "Point", coordinates: [position.lng(), position.lat()] };
};

const draftOverlayToGeometry = (handle: DraftOverlayHandle | null): GeoJSONGeometry | null => {
  if (!handle) return null;

  if (handle.kind === "polygon") {
    return polygonToGeometry(handle.overlay as google.maps.Polygon);
  }

  if (handle.kind === "polyline") {
    return polylineToGeometry(handle.overlay as google.maps.Polyline);
  }

  return markerToGeometry(handle.overlay as google.maps.Marker);
};

const setDraftOverlayEditable = (
  handle: DraftOverlayHandle | null,
  editable: boolean,
) => {
  if (!handle) return;

  if (handle.kind === "polygon") {
    (handle.overlay as google.maps.Polygon).setEditable(editable);
    return;
  }

  if (handle.kind === "polyline") {
    (handle.overlay as google.maps.Polyline).setEditable(editable);
    return;
  }

  (handle.overlay as google.maps.Marker).setDraggable(editable);
};

const polygonCoordinatesToPaths = (coordinates: number[][][]) =>
  coordinates.map((ring) =>
    ring.map(([lng, lat]) => ({
      lat,
      lng,
    })),
  );

const createDraftOverlayHandles = (
  geometry: GeoJSONGeometry,
  map: google.maps.Map,
): DraftOverlayHandle[] => {
  if (geometry.type === "Polygon") {
    return [
      {
        kind: "polygon",
        overlay: new google.maps.Polygon({
          paths: polygonCoordinatesToPaths(geometry.coordinates),
          fillColor: "#4ADE80",
          fillOpacity: 0.3,
          strokeColor: "#4ADE80",
          strokeWeight: 2,
          clickable: true,
          editable: false,
          map,
          zIndex: 10,
        }),
      },
    ];
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon: number[][][]) => ({
      kind: "polygon" as const,
      overlay: new google.maps.Polygon({
        paths: polygonCoordinatesToPaths(polygon),
        fillColor: "#4ADE80",
        fillOpacity: 0.3,
        strokeColor: "#4ADE80",
        strokeWeight: 2,
        clickable: true,
        editable: false,
        map,
        zIndex: 10,
      }),
    }));
  }

  if (geometry.type === "LineString") {
    return [
      {
        kind: "polyline",
        overlay: new google.maps.Polyline({
          path: geometry.coordinates.map(([lng, lat]: number[]) => ({ lat, lng })),
          clickable: true,
          editable: false,
          map,
          strokeColor: "#4ADE80",
          strokeOpacity: 1,
          strokeWeight: 3,
          zIndex: 10,
        }),
      },
    ];
  }

  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates as number[];
    return [
      {
        kind: "marker",
        overlay: new google.maps.Marker({
          draggable: false,
          map,
          position: { lat, lng },
          zIndex: 10,
        }),
      },
    ];
  }

  return [];
};

const overlayToGeometry = (
  overlay: google.maps.Polygon | google.maps.Polyline | google.maps.Marker | null,
  type: string,
): GeoJSONGeometry | null => {
  if (!overlay) return null;
  if (type === "polygon") {
    return polygonToGeometry(overlay as google.maps.Polygon);
  }
  if (type === "polyline") {
    return polylineToGeometry(overlay as google.maps.Polyline);
  }
  if (type === "marker") {
    return markerToGeometry(overlay as google.maps.Marker);
  }
  return null;
};

const SavedPlotsLayer = ({
  plots,
  onPlotClick,
}: {
  plots: (PlotProperties & { geometry?: string | GeoJSONGeometry })[];
  onPlotClick?: (plot: PlotProperties & { geometry?: string | GeoJSONGeometry }) => void;
}) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const plotById = new globalThis.Map(plots.map((plot) => [plot.id, plot]));
    const dataLayer = map.data;

    dataLayer.forEach((feature) => dataLayer.remove(feature));

    dataLayer.setStyle((feature) => ({
      clickable: true,
      fillColor: String(feature.getProperty("fillColor") || "#4ADE80"),
      fillOpacity: 0.3,
      strokeColor: "#ffffff",
      strokeOpacity: 0.6,
      strokeWeight: 1.5,
    }));

    dataLayer.addGeoJson({
      type: "FeatureCollection",
      features: plots
        .map((plot) => {
          const geometry =
            typeof plot.geometry === "string" ? JSON.parse(plot.geometry) : plot.geometry;

          if (!geometry) return null;

          return {
            type: "Feature",
            geometry,
            properties: {
              id: plot.id,
              title: plot.title,
              cropType: plot.cropType,
              fillColor: plot.fillColor || "#4ADE80",
            },
          };
        })
        .filter(Boolean) as GeoJSON.Feature[],
    } as GeoJSON.FeatureCollection);

    const clickListener = dataLayer.addListener("click", (event: google.maps.Data.MouseEvent) => {
      const plotId = String(event.feature.getProperty("id") || "");
      const plot = plotById.get(plotId);
      if (plot) {
        onPlotClick?.(plot);
      }
    });

    return () => {
      google.maps.event.removeListener(clickListener);
      dataLayer.forEach((feature) => dataLayer.remove(feature));
    };
  }, [map, onPlotClick, plots]);

  return null;
};

// ─── Manual Drawing Manager (Future-proof) ───────────
const ManualDrawingManager = ({
  mode,
  onGeometrySelected,
  onOverlayCreated,
}: {
  mode: string;
  onGeometrySelected: (geom: GeoJSONGeometry | null) => void;
  onOverlayCreated?: (
    overlay: google.maps.Polygon | google.maps.Polyline | google.maps.Marker | null,
    type: string,
  ) => void;
}) => {
  const map = useMap();
  const [points, setPoints] = useState<google.maps.LatLngLiteral[]>([]);
  const tempOverlayRef = useRef<google.maps.Polygon | google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map || !mode || mode === "none") {
      setPoints([]);
      if (tempOverlayRef.current) {
        tempOverlayRef.current.setMap(null);
        tempOverlayRef.current = null;
      }
      return;
    }

    const clickListener = map.addListener("click", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const newPoint = e.latLng.toJSON();
      
      if (mode === "draw_point") {
        const marker = new google.maps.Marker({
          position: newPoint,
          map,
          draggable: true,
        });
        onOverlayCreated?.(marker, "marker");
        onGeometrySelected({ type: "Point", coordinates: [newPoint.lng, newPoint.lat] });
        return;
      }

      setPoints((prev) => {
        const next = [...prev, newPoint];
        updatePreview(next);
        return next;
      });
    });

    const dblClickListener = map.addListener("dblclick", (e: google.maps.MapMouseEvent) => {
      if (mode === "draw_point") return;
      e.stop(); // Prevent zooming
      finishDrawing();
    });

    const updatePreview = (currentPoints: google.maps.LatLngLiteral[]) => {
      if (tempOverlayRef.current) tempOverlayRef.current.setMap(null);
      if (currentPoints.length < 2) return;

      if (mode === "draw_polygon") {
        tempOverlayRef.current = new google.maps.Polygon({
          paths: currentPoints,
          map,
          strokeColor: "#4ADE80",
          strokeWeight: 2,
          fillColor: "#4ADE80",
          fillOpacity: 0.3,
          clickable: false,
        });
      } else if (mode === "draw_line_string") {
        tempOverlayRef.current = new google.maps.Polyline({
          path: currentPoints,
          map,
          strokeColor: "#4ADE80",
          strokeWeight: 3,
          clickable: false,
        });
      }
    };

    const finishDrawing = () => {
      setPoints((currentPoints) => {
        if (currentPoints.length < 2) return [];

        if (mode === "draw_polygon" && currentPoints.length >= 3) {
          const polygon = new google.maps.Polygon({
            paths: currentPoints,
            map,
            strokeColor: "#4ADE80",
            strokeWeight: 2,
            fillColor: "#4ADE80",
            fillOpacity: 0.3,
            editable: true,
          });
          onOverlayCreated?.(polygon, "polygon");
          onGeometrySelected(polygonToGeometry(polygon));
        } else if (mode === "draw_line_string") {
          const polyline = new google.maps.Polyline({
            path: currentPoints,
            map,
            strokeColor: "#4ADE80",
            strokeWeight: 3,
            editable: true,
          });
          onOverlayCreated?.(polyline, "polyline");
          onGeometrySelected(polylineToGeometry(polyline));
        }

        if (tempOverlayRef.current) {
          tempOverlayRef.current.setMap(null);
          tempOverlayRef.current = null;
        }
        return [];
      });
    };

    return () => {
      google.maps.event.removeListener(clickListener);
      google.maps.event.removeListener(dblClickListener);
      if (tempOverlayRef.current) tempOverlayRef.current.setMap(null);
    };
  }, [map, mode]);

  return null;
};

// ─── Main Component ───────────────────────────────────
const GoogleMapComponent = forwardRef<MapRef, MapProps>(
  (
    {
      language,
      onPlotClick,
      onGeometrySelected,
      onModeChange,
      onMeasurement,
      massWandActive,
      onProcessingStateChange,
      onNotification,
      drawMode: drawModeProp,
      currentUserRole,
      isProcessingWand,
      measurement,
      onSavePlot,
      onOpenGuide,
    },
    ref,
  ) => {
    const [plots, setPlots] = useState<(PlotProperties & { geometry?: string | GeoJSONGeometry })[]>([]);
    const [drawMode, setDrawMode] = useState<string>("");
    const [isLayersOpen, setIsLayersOpen] = useState(false);
    const [isQuotaOpen, setIsQuotaOpen] = useState(false);
    const [mapType, setMapType] = useState<"roadmap" | "satellite">("satellite");
    const [mapReady, setMapReady] = useState(false);
    const mapRef = useRef<google.maps.Map | null>(null);
    const draftOverlaysRef = useRef<DraftOverlayHandle[]>([]);
    const wandClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
    const selectedOverlayRef = useRef<DraftOverlayHandle | null>(null);
    const selectedOverlayListenersRef = useRef<google.maps.MapsEventListener[]>([]);
    const selectedGeometryRef = useRef<GeoJSONGeometry | null>(null);
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [snapGridEnabled, setSnapGridEnabled] = useState(false);
    
    // Load snap grid preference
    useEffect(() => {
      const saved = localStorage.getItem("snapGridEnabled");
      if (saved !== null) {
        setSnapGridEnabled(JSON.parse(saved));
      }
    }, []);

    const t = ui[language] || ui.ru;

    useEffect(() => {
      const checkTheme = () => {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      };
      checkTheme();
      const observer = new MutationObserver(checkTheme);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }, []);

    useEffect(() => {
      if (mapRef.current && mapType === "roadmap") {
        mapRef.current.setOptions({ styles: isDarkMode ? EGIN_GOOGLE_MAP_DARK_STYLE : EGIN_GOOGLE_MAP_STYLE });
      }
    }, [isDarkMode, mapType, mapReady]);

    const clearSelectedOverlayListeners = useCallback(() => {
      selectedOverlayListenersRef.current.forEach((listener) =>
        google.maps.event.removeListener(listener),
      );
      selectedOverlayListenersRef.current = [];
    }, []);

    const clearDraftOverlays = useCallback(
      (resetGeometry = true) => {
        clearSelectedOverlayListeners();
        draftOverlaysRef.current.forEach(({ overlay }) => {
          google.maps.event.clearInstanceListeners(overlay);
          overlay.setMap(null);
        });
        draftOverlaysRef.current = [];
        selectedOverlayRef.current = null;

        if (resetGeometry) {
          selectedGeometryRef.current = null;
          onGeometrySelected?.(null);
          onMeasurement?.(null);
        }
      },
      [clearSelectedOverlayListeners, onGeometrySelected, onMeasurement],
    );

    const syncSelectedGeometry = useCallback(
      (geometry: GeoJSONGeometry | null, openSave = false) => {
        selectedGeometryRef.current = geometry;
        onGeometrySelected?.(geometry);
        onMeasurement?.(geometryToMeasurement(geometry));

        if (
          openSave &&
          geometry &&
          (geometry.type === "Polygon" || geometry.type === "MultiPolygon")
        ) {
          setDrawMode("simple_select");
          onModeChange?.("simple_select");
          onSavePlot?.();
        }
      },
      [onGeometrySelected, onMeasurement, onModeChange, onSavePlot],
    );

    const selectDraftOverlay = useCallback(
      (handle: DraftOverlayHandle | null, options?: { openSave?: boolean }) => {
        if (!handle) {
          syncSelectedGeometry(null);
          return;
        }

        clearSelectedOverlayListeners();
        selectedOverlayRef.current = handle;
        setDraftOverlayEditable(handle, drawMode === "direct_select");

        const listeners: google.maps.MapsEventListener[] = [];
        const sync = () => syncSelectedGeometry(draftOverlayToGeometry(handle), false);

        if (handle.kind === "polygon") {
          const paths = (handle.overlay as google.maps.Polygon).getPaths();
          for (let pathIndex = 0; pathIndex < paths.getLength(); pathIndex++) {
            const path = paths.getAt(pathIndex);
            listeners.push(path.addListener("set_at", sync));
            listeners.push(path.addListener("insert_at", sync));
            listeners.push(path.addListener("remove_at", sync));
          }
        } else if (handle.kind === "polyline") {
          const path = (handle.overlay as google.maps.Polyline).getPath();
          listeners.push(path.addListener("set_at", sync));
          listeners.push(path.addListener("insert_at", sync));
          listeners.push(path.addListener("remove_at", sync));
        } else {
          listeners.push(
            (handle.overlay as google.maps.Marker).addListener("dragend", sync),
          );
        }

        selectedOverlayListenersRef.current = listeners;
        syncSelectedGeometry(draftOverlayToGeometry(handle), options?.openSave ?? false);
      },
      [clearSelectedOverlayListeners, drawMode, syncSelectedGeometry],
    );

    const registerDraftOverlay = useCallback(
      (handle: DraftOverlayHandle) => {
        handle.overlay.addListener("click", () => selectDraftOverlay(handle));
        return handle;
      },
      [selectDraftOverlay],
    );

    const replaceDraftOverlays = useCallback(
      (handles: DraftOverlayHandle[], options?: { openSave?: boolean }) => {
        clearDraftOverlays(false);
        const registered = handles.map(registerDraftOverlay);
        draftOverlaysRef.current = registered;

        if (registered[0]) {
          selectDraftOverlay(registered[0], { openSave: options?.openSave });
        } else {
          syncSelectedGeometry(null);
        }
      },
      [clearDraftOverlays, registerDraftOverlay, selectDraftOverlay, syncSelectedGeometry],
    );

    // Stable callback refs
    const onProcessingRef = useRef(onProcessingStateChange);
    const onNotificationRef = useRef(onNotification);
    useEffect(() => { onProcessingRef.current = onProcessingStateChange; }, [onProcessingStateChange]);
    useEffect(() => { onNotificationRef.current = onNotification; }, [onNotification]);

    // Sync external drawMode prop
    useEffect(() => {
      if (drawModeProp !== undefined && drawModeProp !== drawMode) {
        setDrawMode(drawModeProp);
      }
    }, [drawModeProp, drawMode]);

    const fetchPlots = useCallback(async () => {
      try {
        const token = localStorage.getItem("agro_token");
        const res = await fetch(apiUrl("/farm-plots"), { headers: { Authorization: `Bearer ${token}` } });
        const json = await res.json();
        if (json.success) setPlots(json.data);
      } catch (err) {
        console.error(err);
      }
    }, []);

    useEffect(() => {
      fetch(apiUrl("/api-usage/increment/google_maps"), {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("agro_token")}` },
        credentials: "include",
      }).catch(() => {});
      fetchPlots();
    }, [fetchPlots]);

    const handleZoomIn = useCallback(() => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) + 1), []);
    const handleZoomOut = useCallback(() => mapRef.current?.setZoom((mapRef.current?.getZoom() || 10) - 1), []);

    const switchMapType = useCallback((type: "roadmap" | "satellite") => {
      mapRef.current?.setMapTypeId(type);
      setMapType(type);
      setIsLayersOpen(false);
    }, []);

    useEffect(() => {
      setDraftOverlayEditable(selectedOverlayRef.current, drawMode === "direct_select");
    }, [drawMode]);

    const activateMode = useCallback(
      (mode: string) => {
        setDrawMode(mode);
        onModeChange?.(mode);
      },
      [onModeChange],
    );

    const activateDirectSelect = useCallback(() => {
      if (!selectedOverlayRef.current) {
        onNotificationRef.current?.(
          language === "kk"
            ? "Алдымен нысанды таңдаңыз"
            : "Сначала выберите объект",
          "warning",
        );
        return;
      }

      activateMode("direct_select");
    }, [activateMode, language]);

    // ── Wand: attach/detach native Google Maps click listener ──
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Remove previous listener
      if (wandClickListenerRef.current) {
        google.maps.event.removeListener(wandClickListenerRef.current);
        wandClickListenerRef.current = null;
      }

      if (massWandActive) {
        // Change cursor to crosshair
        map.setOptions({ draggableCursor: "crosshair" });

        wandClickListenerRef.current = map.addListener("click", async (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const lat = e.latLng.lat();
          const lng = e.latLng.lng();

          const overlay = await handleOsmWandClickGoogle(
            { lng, lat },
            map,
            {
              onProcessing: onProcessingRef.current ?? undefined,
              onNotification: onNotificationRef.current ?? undefined,
              onGeometrySelected: (geometry) =>
                syncSelectedGeometry(geometry, false),
              existingOverlays: [],
            },
          );

          if (overlay) {
            replaceDraftOverlays(
              [{ kind: "polygon", overlay }],
              { openSave: true },
            );
          }
        });
      } else {
        map.setOptions({ draggableCursor: null });
      }

      return () => {
        if (wandClickListenerRef.current) {
          google.maps.event.removeListener(wandClickListenerRef.current);
          wandClickListenerRef.current = null;
        }
        map?.setOptions({ draggableCursor: null });
      };
    }, [massWandActive, mapReady, replaceDraftOverlays, syncSelectedGeometry]);

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
        if (mode === "direct_select") {
          activateDirectSelect();
          return;
        }

        activateMode(mode);
      },
      deleteSelectedDraw: () => {
        clearDraftOverlays();
        setDrawMode("");
        onModeChange?.("");
      },
      getSelectedGeometry: () => selectedGeometryRef.current,
      executeAutoTool: (tool) => {
        const map = mapRef.current;
        const geometry = selectedGeometryRef.current;

        if (!map || !geometry) {
          onNotificationRef.current?.(
            language === "kk"
              ? "Алдымен нысанды таңдаңыз"
              : "Сначала выделите объект",
            "warning",
          );
          return;
        }

        const result = applyAutoTool(tool, [
          {
            type: "Feature",
            geometry,
            properties: {},
          } as GeoJSON.Feature,
        ]);

        if (!result?.length) {
          return;
        }

        replaceDraftOverlays(
          result.flatMap((feature) =>
            createDraftOverlayHandles(feature.geometry as GeoJSONGeometry, map),
          ),
        );
      },
    }), [
      activateDirectSelect,
      activateMode,
      clearDraftOverlays,
      fetchPlots,
      language,
      onModeChange,
      replaceDraftOverlays,
    ]);

    const isKk = language === "kk";
    const drawModeValue = drawMode || "";
    const isAdmin = currentUserRole === "admin";

const toolDefs: ToolDef[] = useMemo(() => [
  { id: "location", label: isKk ? "Менің орным" : "Моя точка",
    icon: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="3" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="9" y1="14" x2="9" y2="17" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="14" y1="9" x2="17" y2="9" /></svg>,
    onClick: () => {
      navigator.geolocation.getCurrentPosition((pos) => {
        mapRef.current?.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        mapRef.current?.setZoom(15);
      });
    } },
  { id: "brush_tool", label: isKk ? "Қылқалам" : "Кисточка",
    icon: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="3" fill="currentColor"/><circle cx="6" cy="6" r="1.5"/><circle cx="12" cy="12" r="1.5"/><path d="M3 15Q6 12 9 9t6-6"/></svg>,
    onClick: () => activateMode("brush_tool"),
    active: drawModeValue === "brush_tool" },
  { id: "snap_grid", label: isKk ? "Тор" : "Сетка",
    icon: <svg viewBox="0 0 18 18"><g stroke="currentColor" strokeWidth="0.5"><path d="M1 1h16M1 5h16M1 9h16M1 13h16M1 17h16M5 1v16M9 1v16M13 1v16M17 1v16"/></g></svg>,
    onClick: () => {
      // Toggle snap-to-grid
      const snapEnabled = !snapGridEnabled;
      localStorage.setItem("snapGridEnabled", snapEnabled.toString());
      setSnapGridEnabled(snapEnabled);
    },
    active: snapGridEnabled },
      { id: "simple_select", label: isKk ? "Таңдау" : "Выбор",
        icon: <svg viewBox="0 0 18 18"><path d="M4 2L4 14L7.5 10.5L11 14L13 12L9.5 8.5L14 5Z" /></svg>,
        onClick: () => activateMode("simple_select"),
        active: drawModeValue === "simple_select" },
      { id: "direct_select", label: isKk ? "Түзету" : "Правка",
        icon: <svg viewBox="0 0 18 18"><rect x="3" y="3" width="12" height="12" rx="1" /><circle cx="3" cy="3" r="1.5" fill="currentColor" /><circle cx="15" cy="3" r="1.5" fill="currentColor" /><circle cx="3" cy="15" r="1.5" fill="currentColor" /><circle cx="15" cy="15" r="1.5" fill="currentColor" /></svg>,
        onClick: activateDirectSelect,
        active: drawModeValue === "direct_select", divider: true },
      { id: "draw_polygon", label: isKk ? "Алаң сызу" : "Нарисовать поле",
        icon: <svg viewBox="0 0 18 18"><polygon points="9,2 16,7 14,15 4,15 2,7" /></svg>,
        onClick: () => activateMode("draw_polygon"),
        active: drawModeValue === "draw_polygon" },
      { id: "draw_line_string", label: isKk ? "Сызық" : "Линия",
        icon: <svg viewBox="0 0 18 18"><path d="M3 15L8 6L12 10L15 3" /></svg>,
        onClick: () => activateMode("draw_line_string"),
        active: drawModeValue === "draw_line_string" },
      { id: "draw_point", label: isKk ? "Белгі" : "Метка",
        icon: <svg viewBox="0 0 18 18"><path d="M9 2C6.24 2 4 4.24 4 7C4 11 9 16 9 16C9 16 14 11 14 7C14 4.24 11.76 2 9 2Z" /><circle cx="9" cy="7" r="2" /></svg>,
        onClick: () => activateMode("draw_point"),
        active: drawModeValue === "draw_point" },
      { id: "mass_magic_wand", label: isKk ? "Автоанықтау" : "Автоопред",
        icon: isProcessingWand
          ? <svg viewBox="0 0 18 18" className="animate-spin"><circle cx="9" cy="9" r="7" strokeDasharray="14 28" /></svg>
          : <svg viewBox="0 0 18 18"><path d="M3 3L5 8L3 13L8 11L13 13L11 8L13 3L8 5Z" /><line x1="13" y1="3" x2="16" y2="1" /><line x1="15" y1="7" x2="17" y2="7" /><line x1="13" y1="13" x2="16" y2="16" /></svg>,
        onClick: () => activateMode("mass_magic_wand"),
        active: drawModeValue === "mass_magic_wand", divider: true },
      { id: "hexGrid", label: isKk ? "Гекс тор" : "Гекс-сетка",
        icon: <svg viewBox="0 0 18 18"><polygon points="9,1 15,4.5 15,11.5 9,15 3,11.5 3,4.5" /><line x1="9" y1="1" x2="9" y2="15" /><line x1="3" y1="4.5" x2="15" y2="4.5" /><line x1="3" y1="11.5" x2="15" y2="11.5" /></svg>,
        onClick: () => {
          const map = mapRef.current;
          const geometry = selectedGeometryRef.current;

          if (!map || !geometry) {
            onNotificationRef.current?.(
              isKk ? "Алдымен нысанды таңдаңыз" : "Сначала выделите объект",
              "warning",
            );
            return;
          }

          const result = applyAutoTool("hexGrid_1ha", [
            {
              type: "Feature",
              geometry,
              properties: {},
            } as GeoJSON.Feature,
          ]);

          if (!result?.length) return;

          replaceDraftOverlays(
            result.flatMap((feature) =>
              createDraftOverlayHandles(feature.geometry as GeoJSONGeometry, map),
            ),
          );
        } },
      { id: "delete", label: isKk ? "Жою" : "Удалить",
        icon: <svg viewBox="0 0 18 18"><path d="M3 5H15" /><path d="M6 5V3H12V5" /><path d="M5 5L6 15H12L13 5" /><line x1="8" y1="8" x2="8" y2="12" /><line x1="10" y1="8" x2="10" y2="12" /></svg>,
        onClick: () => {
          clearDraftOverlays();
          setDrawMode("");
          onModeChange?.("");
        },
        danger: true, divider: true },
      { id: "help", label: isKk ? "Нұсқаулық" : "Гайд",
        icon: <svg viewBox="0 0 18 18"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.5"/><path d="M7 6c0-1.1.9-2 2-2s2 .9 2 2c0 2-2 2-2 3" stroke="currentColor" fill="none" strokeLinecap="round" strokeWidth="1.5"/><circle cx="9" cy="13" r="1" fill="currentColor"/></svg>,
        onClick: () => onOpenGuide?.(),
        divider: true },
    ], [activateDirectSelect, activateMode, clearDraftOverlays, drawModeValue, isKk, isProcessingWand, onModeChange, onOpenGuide, replaceDraftOverlays]);

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
                setMapReady(true);
                if (mapType === "roadmap") {
                  ev.map.setOptions({ styles: EGIN_GOOGLE_MAP_STYLE });
                }
              }
            }}
            mapTypeId={mapType}
          >
          <ManualDrawingManager
              mode={drawMode === "brush_tool" ? "" : drawMode}
              onGeometrySelected={(geometry) => syncSelectedGeometry(geometry, false)}
              onOverlayCreated={(overlay, type) => {
                if (!overlay) return;

                const kind =
                  type === "polygon"
                    ? "polygon"
                    : type === "polyline"
                      ? "polyline"
                      : "marker";

                replaceDraftOverlays(
                  [
                    {
                      kind,
                      overlay,
                    },
                  ],
                  { openSave: true },
                );
              }}
            />
            {drawMode === "brush_tool" && mapRef.current && (
              <BrushTool
                map={mapRef.current}
                isActive={true}
                snapGridEnabled={snapGridEnabled}
                onGeometrySelected={(geometry) => syncSelectedGeometry(geometry, true)}
              />
            )}

            <SavedPlotsLayer plots={plots} onPlotClick={onPlotClick} />
          </Map>

          <EginToolbar tools={toolDefs} />

          {/* Measurement */}
          {measurement && (
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

          {/* ── Zoom Controls ──────────────────────── */}
          <div className={s.zoomGroup}>
            <button type="button" onClick={onOpenGuide} className={s.zoomBtn} aria-label="Help/Guide">
              <HelpCircle className="size-[18px]" />
            </button>
            <div className={s.zoomDivider} />
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
