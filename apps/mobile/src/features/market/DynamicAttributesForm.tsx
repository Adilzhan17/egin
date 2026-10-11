import { useId } from 'react';
import type { AttributeValue, MarketAttributeField } from './types';

export function visibleAttribute(field: MarketAttributeField, value: Record<string, unknown>, dealType?: string) {
  if (field.dealTypes && dealType && !field.dealTypes.some(deal => deal === dealType)) return false;
  const rule = field.showWhen;
  if (!rule) return true;
  const actual = rule.key === 'dealType' ? dealType : value[rule.key];
  return Array.isArray(rule.value) ? rule.value.some(item => item === actual) : actual === rule.value;
}

export function DynamicAttributesForm({ fields, value, onChange, errors = {}, filters = false, dealType }: {
  fields: MarketAttributeField[]; value: Record<string, AttributeValue>; onChange: (value: Record<string, AttributeValue>) => void;
  errors?: Record<string, string>; filters?: boolean; dealType?: string;
}) {
  const prefix = useId();
  return <div className="market-attributes-form">{fields.filter(field => visibleAttribute(field, value, dealType)).map(field => {
    const id = `${prefix}-${field.key}`, help = `${id}-help`, error = errors[field.key];
    const set = (next: AttributeValue) => onChange({ ...value, [field.key]: next });
    const common = { id, 'aria-invalid': !!error, 'aria-describedby': error || field.helpText ? help : undefined };
    const label = `${field.label}${field.unit ? `, ${field.unit}` : ''}${field.required && !filters ? ' *' : ''}`;
    return <div className="market-attribute" key={field.key}>
      {field.type === 'multiselect' ? <fieldset aria-describedby={common['aria-describedby']}><legend>{label}</legend><div className="market-check-options">{field.options?.map(option => <label key={option.value}><input type="checkbox" checked={Array.isArray(value[field.key]) && (value[field.key] as string[]).includes(option.value)} onChange={e => { const current = Array.isArray(value[field.key]) ? value[field.key] as string[] : []; set(e.target.checked ? [...current, option.value] : current.filter(item => item !== option.value)); }} />{option.label}</label>)}</div></fieldset>
        : field.type === 'boolean' ? <label className="market-checkbox" htmlFor={id}><input {...common} type="checkbox" checked={value[field.key] === true} onChange={e => set(e.target.checked)} />{label}</label>
          : <><label htmlFor={id}>{label}</label>{field.type === 'select' ? <select {...common} value={String(value[field.key] ?? '')} onChange={e => set(e.target.value)}><option value="">{filters ? 'Любое значение' : 'Выберите значение'}</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
            : <input {...common} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={String(value[field.key] ?? '')} min={field.type === 'number' ? field.min : undefined} max={field.type === 'number' ? field.max : undefined} step={field.type === 'number' ? 'any' : undefined} maxLength={field.type === 'text' ? field.maxLength || 500 : undefined} pattern={field.validation?.pattern} placeholder={field.placeholder} onChange={e => set(field.type === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value)} />}</>}
      {(error || field.helpText) && <small id={help} className={error ? 'market-field-error' : ''}>{error || field.helpText}</small>}
    </div>;
  })}</div>;
}
