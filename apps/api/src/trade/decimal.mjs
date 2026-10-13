/** Decimal financial arithmetic: integers only; round half away from zero. */
export const fail = (status, message) => Object.assign(new Error(message), { status });
export function scaled(value, scale = 2, { positive = false, optional = false, maxWholeDigits = 22 } = {}) { if (optional && (value === null || value === undefined || value === ''))
    return null; const s = String(value ?? ''); if (!/^\d{1,22}(\.\d+)?$/.test(s) || s.split('.')[0].length > maxWholeDigits || ((s.split('.')[1] || '').length > scale))
    throw fail(422, `Укажите неотрицательное число, не более ${scale} знаков после запятой`); const [a, b = ''] = s.split('.'), n = BigInt(a) * 10n ** BigInt(scale) + BigInt(b.padEnd(scale, '0')); if (positive && n === 0n)
    throw fail(422, 'Значение должно быть больше нуля'); return n; }
export function format(n, scale = 2) { const sign = n < 0n ? '-' : ''; n = n < 0n ? -n : n; const p = 10n ** BigInt(scale); return sign + (n / p) + '.' + String(n % p).padStart(scale, '0'); }
export function divide(n, d) { if (d === 0n)
    throw fail(422, 'Нельзя делить на ноль'); const sign = (n < 0n) !== (d < 0n) ? -1n : 1n; n = n < 0n ? -n : n; d = d < 0n ? -d : d; return sign * ((n + d / 2n) / d); }
export const decimal = (value, scale = 2, opts) => format(scaled(value, scale, {maxWholeDigits:15,...opts}), scale);
export function calculate(terms, costs = [], costBasisPerTon) {
    const p = scaled(terms.pricePerTon, 2, { positive: true }), q = scaled(terms.quantityTon, 3, { positive: true }), gross = divide(p * q, 1000n);
    if (gross === 0n)
        throw fail(422, 'Сумма после округления должна быть больше нуля');
    if (gross > 999999999999999999999999n)
        throw fail(422, 'Общая стоимость превышает допустимый предел');
    let total = 0n;
    const warnings = [], breakdown = [], seen = new Set();
    if (!['KZT', 'USD', 'EUR'].includes(terms.currency))
        throw fail(422, 'Неподдерживаемая валюта');
    if (!Array.isArray(costs) || costs.length > 50)
        throw fail(422, 'Слишком много расходов');
    for (const c of costs) {
        if (typeof c.id !== 'string' || !c.id || seen.has(c.id))
            throw fail(422, 'Расходы должны иметь уникальные идентификаторы');
        seen.add(c.id);
        if (!['logistics', 'loading', 'unloading', 'storage', 'drying', 'cleaning', 'laboratory', 'commission', 'quality_discount', 'other', 'tax'].includes(c.category) || !['fixed', 'per_ton', 'percent_gross'].includes(c.method) || !['seller', 'buyer'].includes(c.payer) || typeof c.confirmed !== 'boolean' || typeof c.incurred !== 'boolean' || typeof c.source !== 'string' || !c.source.trim() || !Number.isFinite(Date.parse(c.asOf)))
            throw fail(422, 'Укажите способ расчёта, плательщика, источник и дату расхода');
        if (c.currency !== terms.currency)
            throw fail(422, 'Расходы и предложение должны иметь одну валюту');
        if (c.category === 'tax' && c.taxModel !== 'manual_explicit')
            throw fail(422, 'Для налога требуется явно выбранная модель manual_explicit');
        let amount = scaled(c.amount, 2, { optional: true });
        if (amount !== null) {
            if (c.method === 'per_ton')
                amount = divide(amount * q, 1000n);
            if (c.method === 'percent_gross') {
                if (amount > 10000n)
                    throw fail(422, 'Процент не может быть больше 100');
                amount = divide(gross * amount, 10000n);
            }
        }
        const included = c.payer === 'seller' && !c.incurred;
        if (included) {
            if (amount === null)
                warnings.push(`Не указано: ${c.category}`);
            else
                total += amount;
            if (!c.confirmed)
                warnings.push(`Оценочный расход: ${c.category}`);
        }
        breakdown.push({ ...c, total: amount === null ? null : format(amount), included });
    }
    for (const [category, key] of [['logistics', 'logisticsPayer'], ['loading', 'loadingPayer']])
        if (terms[key] === 'seller' && !costs.some(c => c.category === category && c.payer === 'seller'))
            warnings.push(`Не указано: ${category}`);
    const net = gross - total, result = { currency: terms.currency, gross: format(gross), sellerCosts: format(total), net: format(net), netPerTon: format(divide(net * 1000n, q)), preliminary: warnings.length > 0, warnings: [...new Set(warnings)], breakdown };
    if (costBasisPerTon !== undefined && costBasisPerTon !== null) {
        const basis = divide(scaled(costBasisPerTon) * q, 1000n);
        result.margin = { costBasis: format(basis), result: format(net - basis), percent: net === 0n ? null : format(divide((net - basis) * 10000n, net)) };
    }
    return result;
}
