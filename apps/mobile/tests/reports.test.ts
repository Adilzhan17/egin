import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundaryDiagram, createReport, csvCell, type ReportData, type ReportField } from '../src/features/workspace/report-export.ts';
import type { CadastralDetails } from '../src/entities/workspace/types.ts';

const details: CadastralDetails = { sourceUrl: 'https://map.gov4c.kz/egkn/', fetchedAt: '2026-10-09T10:00:00Z', cadastralNumber: '010170041505', registeredAreaHa: 6.7218110469, costKzt: 2459064, perimeterM: 1779.7426, category: 'Земли промышленности', purpose: 'Для размещения зданий', rightType: 'Частная собственность', address: 'Макинск', status: 'unknown', owners: { availability: 'not_provided', items: [] }, encumbrances: { availability: 'not_provided', items: [] } };
const field: ReportField = { id: 'parcel', name: 'Мой участок', latitude: 52, longitude: 70, area: 6.6989, crop: 'unknown', boundary: { type: 'Polygon', coordinates: [[[70, 52], [70.01, 52], [70.01, 52.01], [70, 52.01], [70, 52]], [[70.002, 52.002], [70.003, 52.002], [70.003, 52.003], [70.002, 52.003], [70.002, 52.002]]] }, cadastre: { source: 'public-map', number: '010170041505', importedAt: details.fetchedAt, details } };
const report: ReportData = { fields: [field], entries: [], exportedAt: '2026-10-09T11:00:00Z' };

test('parcel report works without diary entries and separates registered and computed area', () => {
  const html = createReport(report, 'html').content;
  for (const expected of ['010170041505', '6,7218', '6,6989', 'Площадь ЕГКН', 'Площадь по контуру', 'Кадастровая стоимость', 'Не указан в публичном ответе', 'не означает отсутствие ограничений']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.ok(html.includes('внутренних вырезов: 1'));
  assert.ok(html.includes('В выбранном периоде записей нет'));
  assert.ok(html.includes('не выписка о правах'));
});

test('offline diagram retains inner rings, uses evenodd and contains no network resources', () => {
  const svg = boundaryDiagram(field.boundary);
  assert.equal((svg.match(/M/g) || []).length, 2);
  assert.ok(svg.includes('fill-rule="evenodd"'));
  assert.ok(!svg.includes('http'));
  assert.equal(boundaryDiagram({ type: 'Polygon', coordinates: [[[NaN, 0]]] }), '');
});

test('CSV protects formulas including whitespace-prefixed payloads and keeps quoted text and leading-zero cadastral identifiers', () => {
  for (const dangerous of ['=HYPERLINK("x")', '+SUM(1)', '-2+3', '@SUM(1)', '\t=1', '\r=1', '\n=1', '   =1', '\ufeff=1']) assert.ok(csvCell(dangerous).startsWith('"\''), JSON.stringify(dangerous));
  assert.equal(csvCell('Поле "А"; север'), '"Поле ""А""; север"');
  const csv = createReport(report, 'csv-fields').content;
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'010170041505"'));
  assert.ok(csv.includes('6,7218'));
});

test('JSON keeps the legacy report contract and all rings but omits unknown metadata and individual names', () => {
  const raw = structuredClone(report);
  Object.assign(raw.fields[0], { owner: 'private-user', secret: 'credential' });
  Object.assign(raw.fields[0].cadastre!.details!, { iin: 'private-taxpayer-id', cuser: 'operator' });
  raw.fields[0].cadastre!.details!.owners = { availability: 'available', items: [{ type: 'individual', name: 'PRIVATE PERSON' }, { type: 'organization', name: 'ТОО Поле' }, { type: 'unknown', name: 'UNKNOWN PERSON' }] };
  const result = JSON.parse(createReport(raw, 'json').content);
  assert.equal(result.format, 'egin-journal'); assert.equal(result.version, 1);
  assert.deepEqual(result.fields[0].boundary, field.boundary);
  assert.deepEqual(result.fields[0].cadastre.details.owners.items, [{ type: 'individual', name: 'Физическое лицо' }, { type: 'organization', name: 'ТОО Поле' }, { type: 'unknown' }]);
  for (const forbidden of ['PRIVATE PERSON', 'UNKNOWN PERSON', 'private-taxpayer-id', 'credential', 'private-user', 'operator']) assert.ok(!JSON.stringify(result).includes(forbidden));
});

test('HTML escapes fields/history and accepts only referenced safe image/audio data URLs', () => {
  const data = { ...report, fields: [{ ...field, name: '<script>alert(1)</script>' }], entries: [{ id: 'e', title: '<img onerror=x>', text: 'a & b', fieldId: field.id, date: '2026-10-08', assets: ['photo', 'audio', 'evil'] }], attachments: { photo: 'data:image/jpeg;base64,YQ==', audio: 'data:audio/webm;codecs=opus;base64,Yg==', evil: 'data:image/svg+xml;base64,PHN2Zz4=', unused: 'data:image/png;base64,Yw==' } };
  const html = createReport(data, 'html').content;
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('a &amp; b'));
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('onerror=x>'));
  assert.ok(html.includes('data:image/jpeg')); assert.ok(html.includes('data:audio/webm'));
  assert.ok(!html.includes('data:image/svg')); assert.ok(!html.includes('data:image/png'));
  assert.equal(Object.keys(JSON.parse(createReport(data, 'json').content).attachments).length, 2);
});

test('legacy entries without surviving fields still export in HTML and CSV', () => {
  const data: ReportData = { fields: [], exportedAt: report.exportedAt, entries: [{ id: 'old', date: '2024-01-01', fieldId: 'deleted', title: 'Старая запись', text: 'Наблюдение', assets: [] }] };
  for (const format of ['html', 'csv'] as const) { const text = createReport(data, format).content; assert.ok(text.includes('Старая запись')); assert.ok(text.includes('Без участка')); }
});

test('user-entered area and demonstration source never present themselves as verified cadastral data', () => {
  const html = createReport({ ...report, fields: [{ ...field, boundary: undefined, cadastre: { source: 'demo', importedAt: report.exportedAt } }] }, 'html').content;
  assert.ok(html.includes('Площадь, введённая пользователем'));
  assert.ok(html.includes('Демонстрационные данные'));
  assert.ok(html.includes('Публичные сведения ЕГКН для этого участка не загружены'));
  assert.ok(!html.includes('Площадь ЕГКН'));
});
