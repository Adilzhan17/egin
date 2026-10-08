import {
  lineString,
  length as turfLength,
  midpoint as turfMidpoint,
} from "@turf/turf";
import type MapboxDraw from "@mapbox/mapbox-gl-draw";

/** Format km → readable string */
export const formatDistance = (kilometers: number): string => {
  if (kilometers >= 1) return `${kilometers.toFixed(2)} км`;
  return `${Math.round(kilometers * 1000)} м`;
};

/**
 * Build measurement label features from the latest draw feature edges.
 * Places a distance label at the midpoint of each segment.
 */
export const buildMeasurementLabels = (
  draw: MapboxDraw,
): GeoJSON.Feature<GeoJSON.Point>[] => {
  const data = draw.getAll();
  const feature = data.features[data.features.length - 1];
  const labels: GeoJSON.Feature<GeoJSON.Point>[] = [];

  if (
    !feature ||
    (feature.geometry.type !== "Polygon" &&
      feature.geometry.type !== "LineString")
  ) {
    return labels;
  }

  const coords = (feature.geometry as any).coordinates;
  const ring =
    feature.geometry.type === "Polygon" ? coords[0] : coords;

  if (!Array.isArray(ring)) return labels;

  for (let i = 0; i < ring.length - 1; i++) {
    const start = ring[i];
    const end = ring[i + 1];
    if (!Array.isArray(start) || !Array.isArray(end)) continue;

    const segment = lineString([start, end]);
    const mid = turfMidpoint(start, end);
    const km = turfLength(segment, { units: "kilometers" });

    labels.push({
      type: "Feature",
      geometry: mid.geometry,
      properties: { label: formatDistance(km) },
    });
  }

  return labels;
};

/**
 * Compute area/length/coordinates measurement string for the first selected feature.
 */
export const computeMeasurement = (
  draw: MapboxDraw,
  turf: typeof import("@turf/turf"),
): string | null => {
  const data = draw.getSelected();
  if (data.features.length === 0) return null;

  const feature = data.features[0];

  if (feature.geometry.type === "Polygon") {
    const area = turf.area(feature);
    return `${(area / 10_000).toFixed(2)} га`;
  }
  if (feature.geometry.type === "LineString") {
    const len = turf.length(feature, { units: "kilometers" });
    return `${len.toFixed(2)} км`;
  }
  if (feature.geometry.type === "Point") {
    const c = feature.geometry.coordinates as number[];
    return `[${c[0].toFixed(4)}, ${c[1].toFixed(4)}]`;
  }

  return null;
};
