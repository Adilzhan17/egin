import * as turf from "@turf/turf";

interface NotificationFn {
  (msg: string, type: "error" | "success" | "warning"): void;
}

/**
 * Handle a "magic wand" click on Google Maps: query Overpass API for farmland
 * polygons near the click point, find the polygon containing or nearest to
 * the click, add it as a Google Maps Polygon overlay, and notify.
 *
 * Returns the added polygon (so the caller can track/remove it) or null.
 */
export const handleOsmWandClickGoogle = async (
  lngLat: { lng: number; lat: number },
  map: google.maps.Map,
  opts: {
    onProcessing?: (v: boolean) => void;
    onNotification?: NotificationFn;
    onGeometrySelected?: (geom: { type: string; coordinates: any } | null) => void;
    existingOverlays: google.maps.Polygon[];
  },
): Promise<google.maps.Polygon | null> => {
  const { onProcessing, onNotification, onGeometrySelected, existingOverlays } = opts;
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
        // Add as Google Maps Polygon overlay
        const coords: number[][] = targetFeature.geometry.coordinates[0];
        const paths = coords.map((c: number[]) => ({ lat: c[1], lng: c[0] }));

        const gmPolygon = new google.maps.Polygon({
          paths,
          fillColor: "#22c55e",
          fillOpacity: 0.4,
          strokeColor: "#16a34a",
          strokeWeight: 3,
          strokeOpacity: 1,
          editable: true,
          clickable: true,
          zIndex: 10,
          map,
        });

        existingOverlays.push(gmPolygon);

        // Flash animation
        let count = 0;
        const interval = setInterval(() => {
          count++;
          gmPolygon.setOptions({ fillOpacity: count % 2 === 0 ? 0.4 : 0.1 });
          if (count >= 6) {
            clearInterval(interval);
            gmPolygon.setOptions({ fillOpacity: 0.3 });
          }
        }, 300);

        // Emit geometry to parent
        onGeometrySelected?.({
          type: "Polygon",
          coordinates: targetFeature.geometry.coordinates,
        });

        return gmPolygon;
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

  return null;
};
