import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { CadastralDetails, Field, Row } from '../../entities/workspace/types';
import { api, humanError } from '../../entities/workspace/api';
import { get, owner, save } from '../../entities/workspace/db';
import { Icon, type IconName } from '../../shared/ui/Icon';
import './parcel-passport.css';

const format = (n: number, digits = 2) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
const date = (value: string) => new Date(value).toLocaleDateString('ru-RU');
function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return <section className="parcel-section"><h3><Icon name={icon} size={18}/>{title}</h3>{children}</section>;
}
function Fact({ label, value }: { label: string; value?: ReactNode }) {
  return <div><dt>{label}</dt><dd>{value ?? <span className="parcel-missing">Не передано источником</span>}</dd></div>;
}

export function ParcelPassport({ details: d, area }: { details: CadastralDetails; area: number }) {
  const [copyStatus, setCopyStatus] = useState('');
  async function copy() {
    try { await navigator.clipboard.writeText(d.cadastralNumber); setCopyStatus('Номер скопирован'); }
    catch { setCopyStatus('Не удалось скопировать. Выделите номер и скопируйте вручную.'); }
  }
  return <div className="parcel-passport">
    <div className="parcel-registry-heading"><div><span className="land-eyebrow">Паспорт участка · ЕГКН</span><strong>{d.cadastralNumber}</strong></div><button className="icon-button" type="button" aria-label="Скопировать кадастровый номер" onClick={() => void copy()}><Icon name="copy" size={19}/></button></div>
    {copyStatus && <p className="parcel-caption" role="status">{copyStatus}</p>}
    {d.status !== 'unknown' && <span className={`parcel-status ${d.status}`}>{d.status === 'archived' ? 'Архивная запись' : 'Действующая запись'}</span>}
    <div className="parcel-areas">
      <div><span>Площадь ЕГКН</span><strong>{d.registeredAreaHa === undefined ? '—' : format(d.registeredAreaHa, 4)} <small>га</small></strong><small>{d.registeredAreaHa === undefined ? 'Не передана источником' : `${format(d.registeredAreaHa * 10000)} м²`}</small></div>
      <div><span>По контуру</span><strong>{format(area, 4)} <small>га</small></strong><small>Расчёт EGIN</small></div>
    </div>
    <Section icon="location" title="Расположение"><p className="parcel-address">{d.address || d.addressKz || 'Адрес не передан источником'}</p><p className="parcel-caption">{[d.region, d.district].filter(Boolean).join(' · ') || 'Регион не указан'}</p></Section>
    <Section icon="leaf" title="Земля и назначение"><dl className="parcel-facts"><Fact label="Целевое назначение" value={d.purpose || d.purposeKz}/><Fact label="Категория земель" value={d.category}/></dl></Section>
    <Section icon="user" title="Права и правообладатели"><dl className="parcel-facts"><Fact label="Вид права" value={d.rightType}/><Fact label="Правообладатель" value={d.owners.availability === 'not_provided' ? <span className="parcel-missing">Не указан в публичном ответе</span> : <ul className="parcel-list">{d.owners.items.map((item, i) => <li key={i}>{item.type === 'individual' ? 'Физическое лицо · персональные данные не отображаются' : item.name || 'Сведения о правообладателе не раскрыты'}</li>)}</ul>}/></dl></Section>
    <Section icon="lock" title="Ограничения и обременения">{d.encumbrances.availability === 'not_provided' ? <><p className="parcel-missing">Сведения не переданы</p><p className="parcel-caption">Пустой ответ карты не означает отсутствие ограничений.</p></> : <ul className="parcel-list">{d.encumbrances.items.map((item, i) => <li key={i}><strong>{item.type || (item.kind === 'arrest' ? 'Арест' : 'Обременение')}</strong>{item.registeredAt && <span>Регистрация: {date(item.registeredAt)}</span>}{item.closedAt && <span>Закрыто: {date(item.closedAt)}</span>}</li>)}</ul>}</Section>
    <Section icon="journal" title="Кадастровая оценка"><p className="parcel-value">{d.costKzt === undefined ? <span className="parcel-missing">Не передана источником</span> : <>{format(d.costKzt)} <span>₸</span></>}</p><p className="parcel-caption">Кадастровая стоимость из ЕГКН. Это не рыночная оценка.</p></Section>
    <details className="parcel-technical"><summary>Реквизиты и измерения</summary><dl className="parcel-facts"><Fact label="РКА · регистрационный код адреса" value={d.addressCode}/><Fact label="Периметр ЕГКН" value={d.perimeterM === undefined ? undefined : `${format(d.perimeterM)} м`}/><Fact label="Статус в источнике" value={d.statusLabel || (d.status === 'unknown' ? 'Не передан' : d.status === 'archived' ? 'Архивная запись' : 'Действующая запись')}/>{d.addressKz && d.addressKz !== d.address && <Fact label="Мекенжай" value={d.addressKz}/>}{d.purposeKz && d.purposeKz !== d.purpose && <Fact label="Нысаналы мақсаты" value={d.purposeKz}/>}</dl></details>
    <footer className="parcel-provenance"><Icon name="clock" size={15}/><div>Получено {new Date(d.fetchedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}<span>Сохранённая копия публичных сведений. Не выписка о правах.</span></div><a href="https://map.gov4c.kz/egkn/" target="_blank" rel="noopener noreferrer" aria-label="Открыть источник ЕГКН"><Icon name="arrow" size={19}/></a></footer>
  </div>;
}

export function SavedCadastre({ row }: { row: Row<Field> }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function refresh() {
    if (busy || !row.data.cadastre?.number) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const number = row.data.cadastre.number, normalizedNumber = number.replace(/[\s:-]/g, '');
      const result = await api<{ candidates: { cadastralNumber: string; details?: CadastralDetails }[] }>(`/cadastre/search?number=${encodeURIComponent(number)}`, undefined, 'GET', 45000);
      const details = result.candidates.find(item => item.cadastralNumber === normalizedNumber)?.details;
      if (!details || details.cadastralNumber !== normalizedNumber) throw new Error('Свежие сведения не получены. Сохранённые данные остаются доступны.');
      const latest = await get<Row<Field>>('records', row.key);
      if (!active.current || await owner() !== row.owner) return;
      if (!latest || latest.deleted || latest.owner !== row.owner || latest.data.cadastre?.number !== number || latest.data.cadastre.source !== 'public-map') throw new Error('Участок изменился. Откройте его заново.');
      // Refresh descriptive information only; retain the latest user edits and geometry.
      await save('field', { ...latest.data, cadastre: { ...latest.data.cadastre, details } }, latest);
      if (active.current) setMessage('Сведения ЕГКН обновлены');
    } catch (error) { if (active.current) { setFailed(true); setMessage(humanError(error)); } }
    finally { if (active.current) setBusy(false); }
  }
  return <div className="saved-cadastre">
    {row.data.cadastre?.details ? <ParcelPassport details={row.data.cadastre.details} area={row.data.area}/> : <p className="parcel-caption">Контур сохранён. Загрузите сведения ЕГКН: назначение, адрес, права и кадастровую стоимость.</p>}
    <button className="secondary-button" type="button" disabled={busy} onClick={() => void refresh()}><Icon name="rotate" size={17}/>{busy ? 'Получаем сведения…' : row.data.cadastre?.details ? 'Обновить сведения ЕГКН' : 'Загрузить сведения ЕГКН'}</button>
    {message && <p className={`parcel-caption ${failed ? 'parcel-error' : ''}`} role={failed ? 'alert' : 'status'}>{message}</p>}
  </div>;
}
