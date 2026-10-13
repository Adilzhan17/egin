export type ChatLocation = { latitude: number; longitude: number; accuracy?: number; label?: string };

export function validLocation(location: ChatLocation): boolean {
  return Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90 && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
}

/** Web Mercator thumbnail using the same OSM tile source as the field map. */
export function locationTiles(location: ChatLocation, width = 320, height = 160, zoom = 15) {
  if (!validLocation(location)) return [];
  const latitude = Math.max(-85.05112878, Math.min(85.05112878, location.latitude));
  const count = 2 ** zoom;
  const centerX = (location.longitude + 180) / 360 * count * 256;
  const sin = Math.sin(latitude * Math.PI / 180);
  const centerY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * count * 256;
  const left = centerX - width / 2, top = centerY - height / 2;
  const tiles: { key: string; url: string; left: number; top: number }[] = [];
  for (let x = Math.floor(left / 256); x <= Math.floor((left + width) / 256); x++) {
    for (let y = Math.floor(top / 256); y <= Math.floor((top + height) / 256); y++) {
      if (y < 0 || y >= count) continue;
      const wrappedX = ((x % count) + count) % count;
      tiles.push({ key: `${zoom}/${x}/${y}`, url: `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`, left: x * 256 - left, top: y * 256 - top });
    }
  }
  return tiles;
}

export function locationLinks(location: ChatLocation) {
  const coords = `${location.latitude},${location.longitude}`;
  return {
    map: `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=16/${location.latitude}/${location.longitude}`,
    directions: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords)}`,
  };
}

export function messageLinks(text: string) {
  const unique = new Map<string, { url: string; domain: string }>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>]+/giu)) {
    const raw = match[0].replace(/[.,;!?\])}]+$/u, '');
    try {
      const parsed = new URL(raw);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) continue;
      unique.set(parsed.href, { url: parsed.href, domain: parsed.hostname });
    } catch { /* A malformed URL stays plain text. */ }
  }
  return [...unique.values()];
}
