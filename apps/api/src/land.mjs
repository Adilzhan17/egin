// Optional land geometry extends existing field records without migrating data.
const fail = message => Object.assign(new Error(message), { status: 400 });
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const on = (a, b, p) => Math.abs(cross(a, b, p)) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-12 && p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;
const intersects = (a, b, c, d) => {
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  return ((x > 0 && y < 0 || x < 0 && y > 0) && (z > 0 && w < 0 || z < 0 && w > 0)) || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
};
export function validateLand(data) {
  if (data.boundary !== undefined) {
    const b = data.boundary;
    if (!b || b.type !== 'Polygon' || !Array.isArray(b.coordinates) || b.coordinates.length !== 1 || Object.keys(b).some(k => !['type', 'coordinates'].includes(k))) throw fail('Границы: нужен GeoJSON Polygon с одним внешним контуром');
    const ring = b.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 4 || ring.length > 2000 || ring.some(p => !Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90)) throw fail('Границы: от 4 до 2000 точек в координатах WGS84 [долгота, широта]');
    if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw fail('Контур участка должен быть замкнут');
    const vertices = ring.slice(0, -1);
    if (new Set(vertices.map(p => p.join(','))).size !== vertices.length) throw fail('В контуре есть повторяющиеся вершины');
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[(i + vertices.length - 1) % vertices.length], b = vertices[i], c = vertices[(i + 1) % vertices.length];
      if (Math.abs(cross(a, b, c)) < 1e-12 && (a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1]) > 0) throw fail('В контуре есть наложенные рёбра');
    }
    let area = 0;
    const rad = Math.PI / 180;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i], b = ring[i + 1];
      if (a[0] === b[0] && a[1] === b[1]) throw fail('Соседние точки границы совпадают');
      if (Math.abs(a[0] - b[0]) > 180) throw fail('Контуры через линию перемены дат пока не поддерживаются');
      area += (b[0] - a[0]) * rad * (2 + Math.sin(a[1] * rad) + Math.sin(b[1] * rad));
      for (let j = i + 2; j < ring.length - 1; j++) {
        if (i === 0 && j === ring.length - 2) continue;
        if (intersects(a, b, ring[j], ring[j + 1])) throw fail('Граница участка пересекает сама себя');
      }
    }
    const hectares = Math.abs(area * 6371008.8 ** 2 / 2) / 10000;
    if (hectares < 0.0001 || hectares > 1000000) throw fail('Площадь контура должна быть от 1 м² до 1 000 000 га');
  }
  if (data.cadastre !== undefined) {
    const c = data.cadastre;
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some(k => !['number', 'source', 'importedAt'].includes(k)) || !['user', 'geojson', 'demo', 'public-map'].includes(c.source) || typeof c.importedAt !== 'string' || c.importedAt.length > 30 || !/^\d{4}-\d{2}-\d{2}T/.test(c.importedAt) || !Number.isFinite(Date.parse(c.importedAt))) throw fail('Проверьте источник данных участка');
    if (c.number !== undefined && (typeof c.number !== 'string' || c.number.length > 80 || /[\x00-\x1f\x7f]/.test(c.number))) throw fail('Некорректный кадастровый номер');
    if (c.source === 'demo' && c.number) throw fail('Учебному участку нельзя присвоить кадастровый номер');
  }
}
