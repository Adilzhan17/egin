import { fail, decimal, scaled } from './decimal.mjs';
export { fail, decimal, scaled };
export const id = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const text = (v, max = 500, required = false) => { if (v === undefined || v === null) {
    if (required)
        throw fail(422, 'Заполните обязательное поле');
    return '';
} if (typeof v !== 'string' || v.length > max || /[\u0000-\u0008]/.test(v))
    throw fail(422, 'Некорректный текст'); v = v.trim(); if (required && !v)
    throw fail(422, 'Заполните обязательное поле'); return v; };
export const date = (v, required = false) => { if (!v && !required)
    return null; if (typeof v !== 'string' || !Number.isFinite(Date.parse(v)))
    throw fail(422, 'Некорректная дата'); return new Date(v).toISOString(); };
export const version = (row, v) => { if (!Number.isSafeInteger(v) || v !== Number(row.version))
    throw fail(409, 'Данные изменились. Обновите страницу и повторите действие.'); };
export const clientId = b => { if (!id(b.clientId))
    throw fail(422, 'Нужен clientId UUID для защиты от повторной отправки'); return b.clientId; };
export const currency = v => { if (!['KZT', 'USD', 'EUR'].includes(v))
    throw fail(422, 'Выберите валюту KZT, USD или EUR'); return v; };
export const point = v => { if (!v)
    return null; if (typeof v !== 'object' || Array.isArray(v))
    throw fail(422, 'Некорректное местоположение'); const result = { label: text(v.label, 300, true) }; if (v.latitude !== undefined || v.longitude !== undefined) {
    if (typeof v.latitude !== 'number' || typeof v.longitude !== 'number' || !Number.isFinite(v.latitude) || !Number.isFinite(v.longitude) || Math.abs(v.latitude) > 90 || Math.abs(v.longitude) > 180)
        throw fail(422, 'Некорректные координаты');
    Object.assign(result, { latitude: v.latitude, longitude: v.longitude });
} if (v.road !== undefined)
    result.road = !!v.road; if (v.rail !== undefined)
    result.rail = !!v.rail; return result; };
const base = [{ key: 'moisture', label: 'Влажность', unit: '%', min: 0, max: 100 }, { key: 'impurity', label: 'Сорная примесь', unit: '%', min: 0, max: 100 }];
export const crops = [{ id: 'wheat', name: 'Пшеница', quality: [...base, { key: 'protein', label: 'Белок', unit: '%', min: 0, max: 100 }, { key: 'gluten', label: 'Клейковина', unit: '%', min: 0, max: 100 }, { key: 'testWeight', label: 'Натура', unit: 'г/л', min: 0, max: 1500 }, { key: 'fallingNumber', label: 'Число падения', unit: 'с', min: 0, max: 1000 }] }, { id: 'barley', name: 'Ячмень', quality: [...base, { key: 'protein', label: 'Белок', unit: '%', min: 0, max: 100 }, { key: 'testWeight', label: 'Натура', unit: 'г/л', min: 0, max: 1500 }] }, { id: 'corn', name: 'Кукуруза', quality: base }, { id: 'sunflower', name: 'Подсолнечник', quality: [...base, { key: 'oilContent', label: 'Масличность', unit: '%', min: 0, max: 100 }] }, { id: 'rapeseed', name: 'Рапс', quality: [...base, { key: 'oilContent', label: 'Масличность', unit: '%', min: 0, max: 100 }] }, { id: 'soy', name: 'Соя', quality: [...base, { key: 'protein', label: 'Белок', unit: '%', min: 0, max: 100 }] }, { id: 'potato', name: 'Картофель', quality: [{ key: 'starch', label: 'Крахмал', unit: '%', min: 0, max: 100 }] }, { id: 'other', name: 'Другая культура', quality: [] }];
export function quality(crop, v = {}) { const schema = crops.find(c => c.id === crop); if (!schema)
    throw fail(422, 'Выберите культуру'); if (!v || typeof v !== 'object' || Array.isArray(v))
    throw fail(422, 'Некорректные показатели качества'); for (const [k, n] of Object.entries(v)) {
    const field = schema.quality.find(f => f.key === k);
    if (!field || typeof n !== 'number' || !Number.isFinite(n) || n < field.min || n > field.max)
        throw fail(422, 'Показатель качества не подходит для выбранной культуры');
} return v; }
export const fileIds = v => { if (v === undefined)
    return []; if (!Array.isArray(v) || v.length > 20 || v.some(x => !id(x)) || new Set(v).size !== v.length)
    throw fail(422, 'Некорректный список файлов'); return v; };
export function terms(b) { if (!b || typeof b !== 'object')
    throw fail(422, 'Укажите условия предложения'); const result = { pricePerTon: decimal(b.pricePerTon, 2, { positive: true }), quantityTon: decimal(b.quantityTon, 3, { positive: true }), currency: currency(b.currency), deliveryTerms: text(b.deliveryTerms, 100, true), handover: point(b.handover), destination: point(b.destination), logisticsPayer: b.logisticsPayer, loadingPayer: b.loadingPayer, qualityRequirements: b.qualityRequirements || {}, expiresAt: date(b.expiresAt, true), paymentTerms: text(b.paymentTerms, 2000, true), prepaymentPercent: decimal(b.prepaymentPercent ?? '0'), finalPaymentDueAt: date(b.finalPaymentDueAt), notes: text(b.notes, 4000) }; if (!['seller', 'buyer'].includes(result.logisticsPayer) || !['seller', 'buyer'].includes(result.loadingPayer) || scaled(result.prepaymentPercent) > 10000n || !result.handover)
    throw fail(422, 'Укажите место передачи и плательщиков расходов'); if (JSON.stringify(result.qualityRequirements).length > 5000)
    throw fail(422, 'Слишком много требований к качеству'); return result; }
export const iso = v => v ? new Date(v).toISOString() : null;
export function page(req) { const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30)); const before = req.query.before; if (before && !id(before))
    throw fail(422, 'Некорректный курсор'); return { limit, before: before || null }; }
