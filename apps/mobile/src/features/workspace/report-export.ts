import type { CadastralDetails, Entry, Field } from '../../entities/workspace/types.ts';

export type ReportField = Field & { id: string };
export type ReportEntry = Entry & { id: string };
export type ReportData = {
  fields: ReportField[]; entries: ReportEntry[]; exportedAt: string;
  from?: string; to?: string; attachments?: Record<string, string>;
};
export type ReportFormat = 'html' | 'json' | 'csv-fields' | 'csv';
export const escapeHTML = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
// Spreadsheet applications may trim whitespace before interpreting a formula.
export const csvCell = (s: string) => '"' + (/^\s*[=+@-]|^[\t\r\n]/u.test(s) ? "'" + s : s).replaceAll('"', '""') + '"';
const number = (n: number, digits = 4) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
const cropNames = { wheat: 'Пшеница', tomato: 'Томаты', apple: 'Яблоня', sunflower: 'Подсолнечник', unknown: 'Не указана' };
const sourceNames = { user: 'Введено пользователем', geojson: 'Импорт GeoJSON', demo: 'Демонстрационный участок', 'public-map': 'Публичная карта ЕГКН' };
const sourceUrl = 'https://map.gov4c.kz/egkn/';
const date = (s: string) => Number.isFinite(Date.parse(s)) ? new Date(s).toLocaleString('ru-RU') : s;

/** Export only the public passport contract, never arbitrary upstream metadata or personal owner names. */
export function publicDetails(d?: CadastralDetails): CadastralDetails | undefined {
  if (!d) return;
  return {
    sourceUrl, fetchedAt: d.fetchedAt, cadastralNumber: d.cadastralNumber,
    region: d.region, district: d.district, address: d.address, addressKz: d.addressKz, addressCode: d.addressCode,
    category: d.category, purpose: d.purpose, purposeKz: d.purposeKz, rightType: d.rightType,
    registeredAreaHa: d.registeredAreaHa, perimeterM: d.perimeterM, costKzt: d.costKzt,
    status: d.status, statusLabel: d.statusLabel,
    owners: { availability: d.owners.availability, items: d.owners.items.map(item => ({ type: item.type, ...(item.type === 'individual' ? { name: 'Физическое лицо' } : item.type === 'organization' && item.name ? { name: item.name } : {}) })) },
    encumbrances: { availability: d.encumbrances.availability, items: d.encumbrances.items.map(item => ({ kind: item.kind, type: item.type, registeredAt: item.registeredAt, closedAt: item.closedAt })) },
  };
}
function cleanField(f: ReportField): ReportField {
  return { id: f.id, name: f.name, latitude: f.latitude, longitude: f.longitude, area: f.area, crop: f.crop,
    ...(f.boundary ? { boundary: { type: 'Polygon', coordinates: f.boundary.coordinates.map(r => r.map(p => [p[0], p[1]])) } as const } : {}),
    ...(f.cadastre ? { cadastre: { number: f.cadastre.number, source: f.cadastre.source, importedAt: f.cadastre.importedAt, details: publicDetails(f.cadastre.details) } } : {}) };
}
function ownerText(d: CadastralDetails) {
  return d.owners.availability === 'not_provided' || !d.owners.items.length ? 'Не указан в публичном ответе' : d.owners.items.map(item => item.type === 'individual' ? 'Физическое лицо · персональные данные не отображаются' : item.name || 'Не раскрыто источником').join('; ');
}
function restrictionsText(d: CadastralDetails) {
  return d.encumbrances.availability === 'not_provided' || !d.encumbrances.items.length ? 'Сведения не переданы; это не означает отсутствие ограничений' : d.encumbrances.items.map(item => [item.type || (item.kind === 'arrest' ? 'Арест' : 'Обременение'), item.registeredAt && `Регистрация: ${date(item.registeredAt)}`, item.closedAt && `Закрыто: ${date(item.closedAt)}`].filter(Boolean).join(' · ')).join('; ');
}

/** Small offline diagram; evenodd preserves all internal exclusions without fetching external tiles. */
export function boundaryDiagram(boundary?: Field['boundary']) {
  if (!boundary) return '';
  const points = boundary.coordinates.flat();
  if (!points.length || points.some(p => p.length !== 2 || !p.every(Number.isFinite))) return '';
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const factor = Math.cos(lat * Math.PI / 180);
  const xs = points.map(p => p[0] * factor), ys = points.map(p => p[1]);
  const left = Math.min(...xs), right = Math.max(...xs), bottom = Math.min(...ys), top = Math.max(...ys);
  const width = right - left, height = top - bottom, scale = 192 / Math.max(width, height);
  if (!Number.isFinite(scale) || scale <= 0) return '';
  const path = boundary.coordinates.map(ring => ring.map((p, i) => `${i ? 'L' : 'M'}${(24 + (192 - width * scale) / 2 + (p[0] * factor - left) * scale).toFixed(2)},${(24 + (192 - height * scale) / 2 + (top - p[1]) * scale).toFixed(2)}`).join(' ') + ' Z').join(' ');
  return `<svg viewBox="0 0 240 240" role="img" aria-label="Схема границ участка, север сверху"><path d="${path}" fill="#e8f0eb" stroke="#214d36" stroke-width="2" fill-rule="evenodd"/><text x="224" y="18" text-anchor="middle" fill="#214d36" font-size="12">С ↑</text></svg>`;
}
function passport(f: ReportField) {
  const d = f.cadastre?.details;
  const fact = (label: string, value: string | undefined) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(value ?? 'Не передано источником')}</dd></div>`;
  const facts = [
    fact('Кадастровый номер', f.cadastre?.number || 'Не указан'),
    fact(f.boundary ? 'Площадь по контуру' : 'Площадь, введённая пользователем', `${number(f.area)} га`),
    ...(d ? [fact('Площадь ЕГКН', d.registeredAreaHa === undefined ? undefined : `${number(d.registeredAreaHa)} га · ${number(d.registeredAreaHa * 10000, 2)} м²`), fact('Адрес', d.address || d.addressKz), fact('Регион / район', [d.region, d.district].filter(Boolean).join(' · ') || undefined), fact('Назначение', d.purpose || d.purposeKz), fact('Категория земель', d.category), fact('Вид права', d.rightType), fact('Правообладатель', ownerText(d)), fact('Ограничения и обременения', restrictionsText(d)), fact('Кадастровая стоимость', d.costKzt === undefined ? undefined : `${number(d.costKzt, 2)} ₸`), fact('Периметр ЕГКН', d.perimeterM === undefined ? undefined : `${number(d.perimeterM, 2)} м`), fact('РКА', d.addressCode)] : []),
    fact('Культура', cropNames[f.crop]), fact('Координаты точки · WGS84', `${f.latitude}, ${f.longitude}`),
    fact('Границы', f.boundary ? `Внешний контур: 1 · внутренних вырезов: ${Math.max(0, f.boundary.coordinates.length - 1)}` : 'Не загружены'),
    fact('Источник участка', f.cadastre ? sourceNames[f.cadastre.source] : 'Введено пользователем'),
  ].join('');
  return `<article class="passport"><header><h2>${escapeHTML(f.name)}</h2>${f.cadastre?.source === 'demo' ? '<p class="demo">Демонстрационные данные</p>' : ''}${d?.status === 'archived' ? '<p>Архивная запись ЕГКН</p>' : ''}</header>${f.boundary ? `<figure>${boundaryDiagram(f.boundary)}<figcaption>Схема контура · не межевой план</figcaption></figure>` : ''}<dl>${facts}</dl>${d ? `<p class="source">Сведения ЕГКН получены ${escapeHTML(date(d.fetchedAt))}. <a href="${sourceUrl}">Публичная кадастровая карта</a>.<br>Сохранённая копия публичных сведений, не выписка о правах. Кадастровая стоимость не является рыночной оценкой. Площадь по контуру рассчитана отдельно.</p>` : '<p class="source">Публичные сведения ЕГКН для этого участка не загружены.</p>'}</article>`;
}
function safeAttachments(data: ReportData) {
  const ids = new Set(data.entries.flatMap(e => e.assets));
  return Object.fromEntries(Object.entries(data.attachments || {}).filter(([id, value]) => ids.has(id) && /^data:(?:image\/(?:png|jpeg|webp|gif|avif)|audio\/(?:mpeg|mp4|webm|ogg|wav|aac|x-m4a|x-wav))(?:;codecs=[a-z0-9.-]+)?;base64,[a-z0-9+/=]*$/i.test(value)));
}
export function createReport(input: ReportData, format: ReportFormat) {
  const data = { ...input, fields: input.fields.map(cleanField), entries: input.entries.map(e => ({ id: e.id, title: e.title, text: e.text, date: e.date, fieldId: e.fieldId, assets: [...e.assets] })) };
  const attachments = safeAttachments(data);
  if (format === 'json') return { extension: 'json', mime: 'application/json', content: JSON.stringify({ format: 'egin-journal', version: 1, exportedAt: data.exportedAt, period: { from: data.from || null, to: data.to || null }, fields: data.fields, entries: data.entries, attachments }, null, 2) };
  if (format === 'csv-fields' || format === 'csv') {
    const lines = format === 'csv-fields' ? [
      ['Участок', 'Кадастровый номер', 'Площадь EGIN, га', 'Основание площади EGIN', 'Площадь ЕГКН, га', 'Адрес', 'Регион', 'Район', 'Назначение', 'Категория земель', 'Вид права', 'Правообладатель', 'Ограничения', 'Кадастровая стоимость, ₸', 'Периметр ЕГКН, м', 'Внутренних вырезов', 'Культура', 'Источник', 'Сведения получены'],
      ...data.fields.map(f => { const d = f.cadastre?.details; return [f.name, f.cadastre?.number ? "'" + f.cadastre.number : '', number(f.area), f.boundary ? 'По контуру' : 'Введено пользователем', d?.registeredAreaHa === undefined ? '' : number(d.registeredAreaHa), d?.address || d?.addressKz || '', d?.region || '', d?.district || '', d?.purpose || d?.purposeKz || '', d?.category || '', d?.rightType || '', d ? ownerText(d) : 'Сведения не загружены', d ? restrictionsText(d) : 'Сведения не загружены', d?.costKzt === undefined ? '' : number(d.costKzt, 2), d?.perimeterM === undefined ? '' : number(d.perimeterM, 2), f.boundary ? String(f.boundary.coordinates.length - 1) : '', cropNames[f.crop], f.cadastre ? sourceNames[f.cadastre.source] : 'Введено пользователем', d?.fetchedAt || '']; }),
    ] : [
      ['Дата', 'Участок', 'Заголовок', 'Наблюдения', 'Вложений'],
      ...data.entries.map(e => [e.date, data.fields.find(f => f.id === e.fieldId)?.name || 'Без участка', e.title, e.text, String(e.assets.length)]),
    ];
    return { extension: 'csv', mime: 'text/csv;charset=utf-8', content: '\uFEFF' + lines.map(line => line.map(csvCell).join(';')).join('\r\n') };
  }
  const entries = data.entries.map(e => `<article class="entry"><small>${escapeHTML(e.date)} · ${escapeHTML(data.fields.find(f => f.id === e.fieldId)?.name || 'Без участка')}</small><h3>${escapeHTML(e.title)}</h3><p>${escapeHTML(e.text)}</p>${e.assets.map(id => attachments[id]?.startsWith('data:image/') ? `<img src="${attachments[id]}" alt="Фото из истории участка" loading="lazy">` : attachments[id] ? `<audio controls src="${attachments[id]}"></audio>` : '').join('')}</article>`).join('');
  const content = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EGIN · Отчёт по участкам</title><style>body{font:15px/1.6 system-ui;color:#214d36;max-width:820px;margin:32px auto;padding:0 20px}h1{font-size:30px;line-height:1.2}h2{font-size:23px;line-height:1.3;margin:0 0 18px}h3{font-size:19px}p,dd{overflow-wrap:anywhere}article{border-top:1px solid #d8e2da;padding:24px 0}.passport{display:flow-root}.entry{break-inside:avoid}dl{margin:0}dl>div{padding:9px 0;break-inside:avoid}dt,small,figcaption,.source{font-size:12px;color:#53695b}dd{margin:2px 0 0}figure{float:right;width:190px;margin:0 0 20px 24px}svg{width:100%;height:auto}figcaption{text-align:center}img{max-width:100%;max-height:500px}audio{display:block;max-width:100%}.entry p{white-space:pre-wrap}.source{clear:both;background:#f4f7f4;padding:12px}.demo{font-weight:700}a{color:inherit}section>h2{margin-top:32px}@media(max-width:480px){figure{float:none;width:160px;margin:0 auto 16px}body{padding:0 16px}}@media print{body{margin:0;max-width:none}audio{display:none}a{text-decoration:none}h2,h3{break-after:avoid}figure{break-inside:avoid}}</style></head><body><h1>egin. / Отчёт по участкам</h1><p>Сформирован ${escapeHTML(date(data.exportedAt))}<br>Участков: ${data.fields.length} · Записей истории: ${data.entries.length}</p><section><h2>Паспорта участков</h2>${data.fields.length ? data.fields.map(passport).join('') : '<p>Участки не сохранены.</p>'}</section><section><h2>История</h2><p class="source">${data.from || data.to ? `Период: ${escapeHTML(data.from || 'с начала')} — ${escapeHTML(data.to || 'по текущую дату')}. ` : ''}Сохранённые и импортированные записи. Текущие погодные события и состояние подключений не являются архивом и не входят в отчёт.</p>${entries || '<p>В выбранном периоде записей нет.</p>'}</section></body></html>`;
  return { content, extension: 'html', mime: 'text/html;charset=utf-8' };
}
