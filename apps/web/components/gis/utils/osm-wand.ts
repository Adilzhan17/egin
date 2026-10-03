import * as turf from "@turf/turf";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";
import type maplibregl from "maplibre-gl";

interface NotificationFn {
  (msg: string, type: "error" | "success" | "warning"): void;
}

/**
 * Handle a "magic wand" click: query Overpass API for farmland polygons near the point,
 * find the polygon containing or nearest to the click, add it to Draw, and flash-highlight.
 */
export const handleOsmWandClick = async (
  lngLat: { lng: number; lat: number },
  draw: MapboxDraw,
  map: maplibregl.Map,
  opts: {
    onProcessing?: (v: boolean) => void;
    onNotification?: NotificationFn;
  },
): Promise<void> => {
  const { onProcessing, onNotification } = opts;
  onProcessing?.(true);
  onNotification?.("Поиск поля в OSM...", "warning");

  try {
    const point = turf.point([lngLat.lng, lngLat.lat]);
    const buffered = turf.buffer(point, 0.5, { units: "kilometers" });
    const bbox = turf.bbox(buffered!);
    const [w, s, eB, n] = bbox;

    const query = `[out:json][timeout:30];(
      way["landuse"~"farmland|meadow|orchard|vineyard|allotments|grass"](${s},${w},${n},${eB});
      relation["landuse"~"farmland|meadow|orchard|vineyard|allotments|grass"](${s},${w},${n},${eB});
      way["natural"~"grassland|scrub"](${s},${w},${n},${eB});
      way["crop"](${s},${w},${n},${eB});
    );out geom;`;

    let res: Response | null = null;
    for (let i = 0; i < 3; i++) {
      try {
        res = await fetch(
          `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`,
        );
        if (res.ok) break;
        res = null;
      } catch {
        /* retry */
      }
      if (!res && i < 2) await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
    if (!res) throw new Error("Overpass API unavailable");

    const data = await res.json();
    let targetFeature: any = null;
    let smallestArea = Infinity;

    if (data?.elements?.length > 0) {
      // Process ways
      for (const el of data.elements) {
        if (el.type !== "way" || !el.geometry) continue;
        const coords = el.geometry.map((p: any) => [p.lon, p.lat]);
        if (coords.length < 3) continue;
        if (
          coords[0][0] !== coords[coords.length - 1][0] ||
          coords[0][1] !== coords[coords.length - 1][1]
        )
          coords.push([...coords[0]]);
        try {
          const poly = turf.polygon([coords]);
          if (turf.booleanPointInPolygon(point, poly)) {
            const a = turf.area(poly);
            if (a < smallestArea) {
              smallestArea = a;
              targetFeature = poly;
            }
          }
        } catch {}
      }

      // Process relations (multipolygons)
      if (!targetFeature) {
        for (const el of data.elements) {
          if (el.type !== "relation" || !el.members) continue;
          for (const m of el.members) {
            if (m.role !== "outer" || !m.geometry) continue;
            const coords = m.geometry.map((p: any) => [p.lon, p.lat]);
            if (coords.length < 3) continue;
            if (
              coords[0][0] !== coords[coords.length - 1][0] ||
              coords[0][1] !== coords[coords.length - 1][1]
            )
              coords.push([...coords[0]]);
            try {
              const poly = turf.polygon([coords]);
              if (turf.booleanPointInPolygon(point, poly)) {
                const a = turf.area(poly);
                if (a < smallestArea) {
                  smallestArea = a;
                  targetFeature = poly;
                }
              }
            } catch {}
          }
        }
      }

      // Fallback: nearest field
      if (!targetFeature) {
        let nearestDist = Infinity;
        for (const el of data.elements) {
          if (el.type !== "way" || !el.geometry) continue;
          const coords = el.geometry.map((p: any) => [p.lon, p.lat]);
          if (coords.length < 3) continue;
          if (
            coords[0][0] !== coords[coords.length - 1][0] ||
            coords[0][1] !== coords[coords.length - 1][1]
          )
            coords.push([...coords[0]]);
          try {
            const poly = turf.polygon([coords]);
            const d = turf.distance(point, turf.centroid(poly));
            if (d < nearestDist) {
              nearestDist = d;
              targetFeature = poly;
            }
          } catch {}
        }
      }

      if (targetFeature) {
        draw.add(targetFeature);
        flashHighlight(map, targetFeature);
      }
    }

    if (targetFeature) {
      onNotification?.(
        `Поле определено! (${(smallestArea / 10_000).toFixed(1)} га)`,
        "success",
      );
    } else {
      onNotification?.(
        "Полей в базе OSM в радиусе 500м не найдено.",
        "warning",
      );
    }
  } catch (err) {
    console.error(err);
    onNotification?.("Сбой Overpass API. Попробуйте снова.", "error");
  } finally {
    onProcessing?.(false);
  }
};

/**
 * Flash-highlight a feature on the map (pulse 3x then remove).
 */
export const flashHighlight = (map: maplibregl.Map, feature: any): void => {
  const sourceId = "__wand_highlight__";
  const layerId = "__wand_highlight_fill__";
  const outlineId = "__wand_highlight_outline__";

  if (map.getLayer(layerId)) map.removeLayer(layerId);
  if (map.getLayer(outlineId)) map.removeLayer(outlineId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  map.addSource(sourceId, { type: "geojson", data: feature });
  map.addLayer({
    id: layerId,
    type: "fill",
    source: sourceId,
    paint: { "fill-color": "#22c55e", "fill-opacity": 0.45 },
  });
  map.addLayer({
    id: outlineId,
    type: "line",
    source: sourceId,
    paint: { "line-color": "#16a34a", "line-width": 3, "line-opacity": 1 },
  });

  let count = 0;
  const interval = setInterval(() => {
    count++;
    const opacity = count % 2 === 0 ? 0.45 : 0.1;
    try {
      map.setPaintProperty(layerId, "fill-opacity", opacity);
    } catch {}
    if (count >= 6) {
      clearInterval(interval);
      setTimeout(() => {
        try {
          if (map.getLayer(layerId)) map.removeLayer(layerId);
          if (map.getLayer(outlineId)) map.removeLayer(outlineId);
          if (map.getSource(sourceId)) map.removeSource(sourceId);
        } catch {}
      }, 500);
    }
  }, 300);
};
