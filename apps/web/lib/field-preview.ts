import type { Geometry } from "./types";
const RADIUS = 6371008.8;
const radians = (degrees: number) => (degrees * Math.PI) / 180;
// Instant spherical preview only. Saving always revalidates the original geometry
// in PostGIS and replaces this estimate with the authoritative geodesic area.
export function previewField(geometry: Geometry) {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let area = 0,
    perimeter = 0,
    west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity,
    vertices = 0;
  for (const rings of polygons)
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      const ring = rings[ringIndex];
      let signed = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x, y] = ring[i],
          [nx, ny] = ring[i + 1];
        west = Math.min(west, x);
        east = Math.max(east, x);
        south = Math.min(south, y);
        north = Math.max(north, y);
        vertices++;
        signed +=
          radians(nx - x) * (2 + Math.sin(radians(y)) + Math.sin(radians(ny)));
        const a =
          Math.sin(radians(ny - y) / 2) ** 2 +
          Math.cos(radians(y)) *
            Math.cos(radians(ny)) *
            Math.sin(radians(nx - x) / 2) ** 2;
        perimeter +=
          2 * RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
      }
      area +=
        Math.abs((signed * RADIUS * RADIUS) / 2) * (ringIndex === 0 ? 1 : -1);
    }
  return {
    areaHa: Math.max(0, area / 10000),
    perimeterM: perimeter,
    bbox: [west, south, east, north],
    vertices,
  };
}
