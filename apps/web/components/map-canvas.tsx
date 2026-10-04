"use client";
// Product adapter around the ORIGINAL Egin-KZ MapLibre/Mapbox Draw engine.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import {
  Search,
  Undo2,
  Trash2,
  PenTool,
  MousePointer2,
  Layers,
  Maximize,
} from "lucide-react";
import OriginalMap from "./gis/Map";
import type { MapRef } from "./gis/types";
import type { Field, Geometry } from "@/lib/types";
import { api } from "@/lib/api";
import { readOffline, writeOffline } from "@/lib/offline";
import { Button } from "./ui";

type Props = {
  fields: Field[];
  selected?: string;
  onSelect?: (id: string) => void;
  onPoint?: (lat: number, lon: number) => void;
  editing?: boolean;
  initialGeometry?: Geometry | null;
  onGeometry?: (geometry: Geometry | null) => void;
  compact?: boolean;
  onStartDrawing?: () => void;
};
export default function MapCanvas({
  fields,
  selected,
  onSelect,
  onPoint,
  editing = false,
  initialGeometry,
  onGeometry,
  compact = false,
  onStartDrawing,
}: Props) {
  const engine = useRef<MapRef>(null),
    history = useRef<FeatureCollection[]>([]),
    restoring = useRef(false);
  const fitted = useRef<string | null>(null);
  const [ready, setReady] = useState(false),
    [search, setSearch] = useState(""),
    [error, setError] = useState(""),
    [results, setResults] = useState<
      { name: string; lat: number; lon: number }[]
    >([]),
    [admin, setAdmin] = useState(false),
    [mode, setMode] = useState("simple_select");
  const callbacks = useRef({ editing, onSelect, onPoint, onGeometry });
  useEffect(() => {
    callbacks.current = { editing, onSelect, onPoint, onGeometry };
  }, [editing, onSelect, onPoint, onGeometry]);
  const fit = useCallback(
    (all = false) => {
      const map = engine.current?.getMap();
      if (!map || !fields.length) return;
      map.resize();
      const chosen =
          fields.find((f) => f.id === selected) ||
          fields.find(
            (f) => f.id === localStorage.getItem("egin-current-field"),
          ) ||
          fields[0],
        target = all ? fields : [chosen];
      const coords = target.flatMap((f) =>
        f.geometry.type === "Polygon"
          ? f.geometry.coordinates.flat()
          : f.geometry.coordinates.flat(2),
      );
      const xs = coords.map((c) => c[0]),
        ys = coords.map((c) => c[1]);
      map.fitBounds(
        [
          [Math.min(...xs), Math.min(...ys)],
          [Math.max(...xs), Math.max(...ys)],
        ],
        {
          padding: compact ? 35 : 80,
          maxZoom: 14,
          duration: compact ? 0 : 500,
        },
      );
    },
    [fields, selected, compact],
  );
  useEffect(() => {
    if (ready) {
      engine.current?.refreshPlots();
      if (fitted.current !== (selected || "initial")) {
        fit();
        fitted.current = selected || "initial";
      }
    }
  }, [ready, fields, fit, selected]);
  useEffect(() => {
    const map = engine.current?.getMap();
    if (!ready || !map || compact) return;
    let active = true;
    void readOffline<{ lng: number; lat: number; zoom: number }>(
      "map-view",
    ).then((view) => {
      if (view && active && !selected)
        map.jumpTo({ center: [view.lng, view.lat], zoom: view.zoom });
    });
    const saveView = () => {
      const center = map.getCenter();
      void writeOffline("map-view", {
        lng: center.lng,
        lat: center.lat,
        zoom: map.getZoom(),
      });
    };
    map.on("moveend", saveView);
    return () => {
      active = false;
      map.off("moveend", saveView);
    };
  }, [ready, compact, selected]);
  useEffect(() => {
    const map = engine.current?.getMap();
    if (!ready || !map?.getLayer("farm-plots-outline")) return;
    map.setPaintProperty("farm-plots-outline", "line-color", [
      "case",
      ["==", ["get", "id"], selected || ""],
      "#e2f69d",
      "#406344",
    ]);
    map.setPaintProperty("farm-plots-outline", "line-width", [
      "case",
      ["==", ["get", "id"], selected || ""],
      3,
      1.5,
    ]);
  }, [ready, selected, fields]);
  useEffect(() => {
    if (!ready) return;
    const draw = engine.current?.getDraw();
    if (!draw) return;
    restoring.current = true;
    draw.deleteAll();
    if (editing && initialGeometry) {
      const polygons =
        initialGeometry.type === "Polygon"
          ? [initialGeometry.coordinates]
          : initialGeometry.coordinates;
      const ids = polygons.flatMap((coordinates) =>
        draw.add({
          type: "Feature",
          properties: {},
          geometry: { type: "Polygon", coordinates },
        }),
      );
      draw.changeMode("direct_select", { featureId: ids[0] });
      callbacks.current.onGeometry?.(initialGeometry);
    } else {
      if (editing) draw.changeMode("draw_polygon");
      else draw.changeMode("simple_select");
      callbacks.current.onGeometry?.(null);
    }
    history.current = [structuredClone(draw.getAll())];
    restoring.current = false;
  }, [ready, editing, initialGeometry]);
  useEffect(() => {
    const map = engine.current?.getMap();
    if (!ready || !map) return;
    const click = (e: import("maplibre-gl").MapMouseEvent) => {
      if (callbacks.current.editing) return;
      const layers = ["farm-plots-layer"].filter((id) => map.getLayer(id));
      if (
        !layers.length ||
        !map.queryRenderedFeatures(e.point, { layers }).length
      )
        callbacks.current.onPoint?.(e.lngLat.lat, e.lngLat.lng);
    };
    map.on("click", click);
    return () => {
      map.off("click", click);
    };
  }, [ready]);
  useEffect(() => {
    const map = engine.current?.getMap();
    if (!ready || !map) return;
    let gone = false;
    const load = async () => {
      if (!admin) {
        if (map.getLayer("egin-admin"))
          map.setLayoutProperty("egin-admin", "visibility", "none");
        return;
      }
      const b = map.getBounds();
      try {
        const fc = await api<FeatureCollection>(
          `/admin/boundaries?level=${map.getZoom() > 7 ? 2 : 1}&west=${b.getWest()}&east=${b.getEast()}&south=${b.getSouth()}&north=${b.getNorth()}`,
        );
        if (gone) return;
        if (!map.getSource("egin-admin")) {
          map.addSource("egin-admin", { type: "geojson", data: fc });
          map.addLayer({
            id: "egin-admin",
            type: "line",
            source: "egin-admin",
            paint: {
              "line-color": "#735a99",
              "line-width": 2,
              "line-dasharray": [3, 2],
            },
          });
        } else
          (
            map.getSource("egin-admin") as import("maplibre-gl").GeoJSONSource
          ).setData(fc);
        map.setLayoutProperty("egin-admin", "visibility", "visible");
      } catch (e) {
        if (!gone) setError((e as Error).message);
      }
    };
    void load();
    map.on("moveend", load);
    return () => {
      gone = true;
      map.off("moveend", load);
    };
  }, [admin, ready]);
  function geometryChanged(g: unknown) {
    callbacks.current.onGeometry?.(g as Geometry | null);
    const draw = engine.current?.getDraw();
    if (draw && !restoring.current) {
      history.current.push(structuredClone(draw.getAll()));
      if (history.current.length > 50) history.current.shift();
    }
  }
  function sync() {
    const fs =
      engine.current
        ?.getDraw()
        ?.getAll()
        .features.filter((f) => f.geometry.type === "Polygon") || [];
    geometryChanged(
      fs.length > 1
        ? {
            type: "MultiPolygon",
            coordinates: fs.map((f) => (f.geometry as Polygon).coordinates),
          }
        : fs[0]?.geometry || null,
    );
  }
  function undo() {
    const draw = engine.current?.getDraw();
    if (!draw || history.current.length < 2) return;
    history.current.pop();
    restoring.current = true;
    draw.set(history.current.at(-1)!);
    sync();
    restoring.current = false;
  }
  async function find(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const r = await api<{ results?: typeof results; message?: string }>(
        "/geocode?q=" + encodeURIComponent(search),
      );
      setResults(r.results || []);
      if (!r.results?.length) setError(r.message || "Место не найдено");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className={`map-wrap ${compact ? "compact" : ""}`}>
      <OriginalMap
        ref={engine}
        plots={fields}
        language="ru"
        showMeasurements={!compact}
        compact={compact || editing}
        drawModeActive={editing}
        drawMode={mode}
        onModeChange={(m) => {
          setMode(m);
          if (m === "draw_polygon" && !editing) onStartDrawing?.();
        }}
        onReady={() => setReady(true)}
        onGeometrySelected={geometryChanged}
        onPlotClick={(p) => {
          if (!callbacks.current.editing) callbacks.current.onSelect?.(p.id);
        }}
        onNotification={(m) => setError(m)}
      />
      {!compact && (
        <>
          <form className="map-search" onSubmit={find}>
            <Search size={18} />
            <input
              aria-label="Поиск места"
              placeholder="Найти населённый пункт"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              minLength={3}
            />
            <button aria-label="Найти место">Найти</button>
            {results.length > 0 && (
              <div className="map-results">
                {results.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      engine.current?.flyToRegion([r.lon, r.lat], 13);
                      setResults([]);
                    }}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}
          </form>
          <div className="rescue-map-actions">
            <button aria-label="Показать все поля" onClick={() => fit(true)}>
              <Maximize size={19} />
            </button>
            <button
              aria-label="Административные границы"
              aria-pressed={admin}
              onClick={() => setAdmin(!admin)}
            >
              <Layers size={19} />
            </button>
          </div>
          {editing && (
            <div className="drawing-bar">
              <Button
                type="button"
                onClick={() => engine.current?.changeDrawMode("draw_polygon")}
              >
                <PenTool size={17} />
                Рисовать
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const draw = engine.current?.getDraw();
                  const id = draw?.getAll().features[0]?.id;
                  if (id)
                    draw?.changeMode("direct_select", {
                      featureId: String(id),
                    });
                }}
              >
                <MousePointer2 size={17} />
                Вершины
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-label="Отменить действие"
                onClick={undo}
              >
                <Undo2 size={17} />
              </Button>
              <Button
                type="button"
                variant="secondary"
                aria-label="Очистить контур"
                onClick={() => {
                  engine.current?.getDraw()?.deleteAll();
                  sync();
                }}
              >
                <Trash2 size={17} />
              </Button>
            </div>
          )}
        </>
      )}
      {!ready && <div className="map-loading">Загрузка карты…</div>}
      {error && !compact && (
        <button className="map-error" onClick={() => setError("")}>
          {error} ×
        </button>
      )}
    </div>
  );
}
