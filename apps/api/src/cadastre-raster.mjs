import { inflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import proj4 from 'proj4';

const SIZE = 256;
const MAX_BYTES = 1024 * 1024;
const RAW_BYTES = SIZE * (SIZE * 4 + 1);
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const fail = message => Object.assign(new Error(message), { status: 502 });

function transform(srid) {
  if (!Number.isInteger(srid) || srid < 32639 || srid > 32645) throw fail('Система координат кадастрового слоя не поддерживается.');
  return proj4('EPSG:3857', `+proj=utm +zone=${srid - 32600} +datum=WGS84 +units=m +no_defs`);
}
function checkBbox(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite) || bbox[0] >= bbox[2] || bbox[1] >= bbox[3] || bbox.some(v => Math.abs(v) > 30_000_000)) throw fail('Некорректные границы кадастрового слоя.');
}

// The public u_view layer stores district coordinates in an unspecified CRS.
// Request an ordinary UTM raster, then align every output pixel with Leaflet's
// Web Mercator grid. Simply labelling the UTM image EPSG:3857 produces empty maps.
export function projectedTileBbox(bbox, srid) {
  checkBbox(bbox);
  const projection = transform(srid), points = [];
  for (let i = 0; i <= 8; i++) {
    const x = bbox[0] + (bbox[2] - bbox[0]) * i / 8;
    const y = bbox[1] + (bbox[3] - bbox[1]) * i / 8;
    points.push(projection.forward([x, bbox[1]]), projection.forward([x, bbox[3]]), projection.forward([bbox[0], y]), projection.forward([bbox[2], y]));
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const result = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  checkBbox(result);
  // A one-pixel gutter makes bilinear samples along tile edges well defined.
  const gutter = Math.max(result[2] - result[0], result[3] - result[1]) / SIZE;
  return [result[0] - gutter, result[1] - gutter, result[2] + gutter, result[3] + gutter];
}

function decodeRaster(image) {
  if (!Buffer.isBuffer(image) || image.length < 45 || image.length > MAX_BYTES || !image.subarray(0, 8).equals(SIGNATURE)) throw fail('Кадастровая карта вернула неподдерживаемое изображение.');
  if (image.readUInt32BE(8) !== 13 || image.toString('ascii', 12, 16) !== 'IHDR' || image.readUInt32BE(16) !== SIZE || image.readUInt32BE(20) !== SIZE || image[24] !== 8 || image[25] !== 6 || image[26] !== 0 || image[27] !== 0 || image[28] !== 0) throw fail('Неподдерживаемый размер или формат кадастровой карты.');
  let offset = 8, ended = false; const idat = [];
  while (offset < image.length) {
    if (offset + 12 > image.length) throw fail('Изображение кадастровой карты повреждено.');
    const length = image.readUInt32BE(offset), type = image.toString('ascii', offset + 4, offset + 8);
    if (length > MAX_BYTES || offset + length + 12 > image.length || (type === 'IHDR' && offset !== 8)) throw fail('Изображение кадастровой карты повреждено.');
    if (type === 'IDAT') idat.push(image.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === 'IEND') {
      if (length !== 0 || offset !== image.length) throw fail('Изображение кадастровой карты повреждено.');
      ended = true; break;
    }
  }
  if (!ended || !idat.length) throw fail('Изображение кадастровой карты повреждено.');
  try {
    // Validate the expanded size before asking any image library to allocate.
    // Non-interlaced RGBA8 always has exactly 256 scanlines of 1025 bytes.
    const raw = inflateSync(Buffer.concat(idat), { maxOutputLength: RAW_BYTES });
    if (raw.length !== RAW_BYTES) throw new Error('bad raster size');
    const decoded = PNG.sync.read(image, { checkCRC: true });
    if (decoded.data.length !== SIZE * SIZE * 4) throw new Error('bad decoded size');
    return decoded.data;
  } catch { throw fail('Не удалось прочитать изображение кадастровой карты.'); }
}

export function warpCadastreTile(image, { bbox, sourceBbox, srid }) {
  checkBbox(bbox); checkBbox(sourceBbox);
  const projection = transform(srid), source = decodeRaster(image), output = Buffer.alloc(SIZE * SIZE * 4);
  const sourceWidth = sourceBbox[2] - sourceBbox[0], sourceHeight = sourceBbox[3] - sourceBbox[1];
  for (let y = 0; y < SIZE; y++) {
    const north = bbox[3] - (y + .5) / SIZE * (bbox[3] - bbox[1]);
    for (let x = 0; x < SIZE; x++) {
      const east = bbox[0] + (x + .5) / SIZE * (bbox[2] - bbox[0]);
      const [sx, sy] = projection.forward([east, north]);
      const u = (sx - sourceBbox[0]) / sourceWidth * SIZE - .5;
      const v = (sourceBbox[3] - sy) / sourceHeight * SIZE - .5;
      if (!Number.isFinite(u) || !Number.isFinite(v) || u < -.5 || u > SIZE - .5 || v < -.5 || v > SIZE - .5) continue;
      const x0 = Math.floor(u), y0 = Math.floor(v), dx = u - x0, dy = v - y0;
      let alpha = 0, red = 0, green = 0, blue = 0;
      for (let iy = 0; iy < 2; iy++) for (let ix = 0; ix < 2; ix++) {
        const px = Math.max(0, Math.min(SIZE - 1, x0 + ix)), py = Math.max(0, Math.min(SIZE - 1, y0 + iy));
        const at = (py * SIZE + px) * 4, weight = (ix ? dx : 1 - dx) * (iy ? dy : 1 - dy);
        const a = source[at + 3] * weight;
        alpha += a; red += source[at] * a; green += source[at + 1] * a; blue += source[at + 2] * a;
      }
      if (alpha > 0) {
        const at = (y * SIZE + x) * 4;
        output[at] = Math.round(red / alpha); output[at + 1] = Math.round(green / alpha); output[at + 2] = Math.round(blue / alpha); output[at + 3] = Math.round(alpha);
      }
    }
  }
  return PNG.sync.write({ width: SIZE, height: SIZE, data: output }, { colorType: 6, inputColorType: 6, bitDepth: 8, deflateLevel: 6 });
}

// Official aerial coverage is patchy. Keep detailed pixels and fill transparent
// areas with the public national satellite mosaic on the same Mercator grid.
export function rasterNeedsBackground(image) {
  const data = decodeRaster(image);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}
export function compositeBasemap(foreground, background) {
  const top = decodeRaster(foreground), bottom = decodeRaster(background), data = Buffer.alloc(top.length);
  for (let i = 0; i < data.length; i += 4) {
    const a = top[i + 3] / 255, b = bottom[i + 3] / 255, alpha = a + b * (1 - a);
    for (let c = 0; c < 3; c++) data[i + c] = alpha ? Math.round((top[i + c] * a + bottom[i + c] * b * (1 - a)) / alpha) : 0;
    data[i + 3] = Math.round(alpha * 255);
  }
  return PNG.sync.write({width: SIZE, height: SIZE, data}, {colorType: 6, inputColorType: 6, bitDepth: 8, deflateLevel: 6});
}
