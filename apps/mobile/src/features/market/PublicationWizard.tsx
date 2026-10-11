import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../entities/workspace/api';
import { Icon } from '../../shared/ui/Icon';
import { dealLabels, formatPrice, MarketApiError, marketError, marketRequest, unitLabels } from './api';
import { ListingGallery, RegionFields } from './components';
import { DynamicAttributesForm, visibleAttribute } from './DynamicAttributesForm';
import type { MarketCategory, MarketListing } from './types';
import './wizard.css';

type Issue = { step: number; key: string; text: string };
const stepNames = ['Категория и сделка', 'Описание и характеристики', 'Цена и условия', 'Фото и местоположение', 'Проверка объявления'];
const editableKeys = ['categoryId', 'dealType', 'title', 'description', 'attributes', 'attributesSchemaVersion', 'priceMode', 'priceAmount', 'currencyCode', 'priceUnit', 'quantity', 'quantityUnit', 'countryCode', 'regionCode', 'districtCode', 'localityCode', 'localityName', 'currentStep', 'contactPhone', 'allowPhone', 'delivery'] as const;
function editable(listing: MarketListing) { return Object.fromEntries(editableKeys.filter(key => !['categoryId', 'dealType'].includes(key) || !!listing[key]).map(key => [key, listing[key]])); }
function issuesFor(listing: MarketListing, category?: MarketCategory): Issue[] {
  const issues: Issue[] = [], add = (step: number, key: string, text: string) => issues.push({ step, key, text });
  if (!category?.parentId) add(1, 'categoryId', 'Выберите подкатегорию');
  if (!category?.dealTypes.includes(listing.dealType)) add(1, 'dealType', 'Выберите подходящий тип сделки');
  if (listing.title.trim().length < 5) add(2, 'title', 'Название: не менее 5 символов');
  if (listing.description.trim().length < 20) add(2, 'description', 'Описание: не менее 20 символов');
  for (const field of category?.attributeSchema.fields || []) {
    if (!visibleAttribute(field, listing.attributes, listing.dealType)) continue;
    const value = listing.attributes[field.key], empty = value == null || value === '' || (Array.isArray(value) && !value.length);
    if (field.required && empty) add(2, field.key, `Заполните «${field.label}»`);
    if (!empty && field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value) || (field.min != null && value < field.min) || (field.max != null && value > field.max))) add(2, field.key, `${field.label}: проверьте допустимый диапазон${field.min != null ? ` от ${field.min}` : ''}${field.max != null ? ` до ${field.max}` : ''}`);
    if (!empty && field.validation?.pattern && typeof value === 'string') { try { if (!new RegExp(field.validation.pattern).test(value)) add(2, field.key, field.validation.message || `Проверьте «${field.label}»`); } catch { /* An invalid remote pattern must not crash the editor. */ } }
  }
  if (listing.priceMode !== 'negotiable' && (listing.priceAmount == null || !Number.isFinite(listing.priceAmount) || listing.priceAmount <= 0)) add(3, 'priceAmount', 'Укажите цену больше нуля');
  if (listing.priceMode !== 'negotiable' && !category?.priceUnits.includes(listing.priceUnit)) add(3, 'priceUnit', 'Выберите единицу цены');
  if (listing.allowPhone && !/^\+?[\d\s()-]{10,20}$/.test(listing.contactPhone || '')) add(3, 'contactPhone', 'Проверьте номер телефона');
  if (category?.requiresPhoto && ['sell', 'rent_out'].includes(listing.dealType) && !listing.images.length) add(4, 'images', 'Добавьте хотя бы одну фотографию');
  if (!listing.regionCode) add(4, 'regionCode', 'Выберите область или город');
  if (!listing.districtCode) add(4, 'districtCode', 'Выберите район');
  if (!listing.localityCode && !listing.localityName?.trim()) add(4, 'localityCode', 'Укажите населённый пункт');
  return issues;
}

function uploadPhoto(id: string, version: number, file: File, onProgress: (percent: number) => void) {
  return new Promise<{ listing: MarketListing }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${API_BASE}/api/market/listings/${encodeURIComponent(id)}/images`);
    request.withCredentials = true; request.timeout = 90000;
    request.setRequestHeader('X-EGIN', '1'); request.setRequestHeader('Content-Type', file.type); request.setRequestHeader('If-Match', String(version));
    request.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onerror = () => reject(new Error('Не удалось загрузить фото. Проверьте подключение.'));
    request.ontimeout = () => reject(new Error('Загрузка фото заняла слишком много времени. Повторите.'));
    request.onload = () => { let data; try { data = JSON.parse(request.responseText); } catch { reject(new Error('Сервер не ответил. Повторите загрузку.')); return; } if (request.status < 200 || request.status >= 300) reject(new MarketApiError(data.error || 'Не удалось загрузить фото', request.status, data)); else resolve(data); };
    request.send(file);
  });
}

export default function PublicationWizard({ id, onClose, onPublished }: { id?: string; onClose: () => void; onPublished: (id: string) => void }) {
  const [listing, setListing] = useState<MarketListing | null>(null), [categories, setCategories] = useState<MarketCategory[]>([]);
  const [status, setStatus] = useState<'loading' | 'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('loading');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [upload, setUpload] = useState<{ name: string; percent: number } | null>(null), [showIssues, setShowIssues] = useState(false), [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const current = useRef<MarketListing | null>(null), revision = useRef(0), savedRevision = useRef(0), queue = useRef(Promise.resolve()), timer = useRef<ReturnType<typeof setTimeout> | null>(null), mounted = useRef(true), conflict = useRef(false);
  const catalog = useRef<MarketCategory[]>([]);
  const clientId = useRef(crypto.randomUUID()), initial = useRef<Promise<[{ categories: MarketCategory[] }, { listing: MarketListing }]> | null>(null);
  function show(next: MarketListing) { current.current = next; if (mounted.current) setListing(next); }
  function fail(reason: unknown) { if (!mounted.current) return; const stale = reason instanceof MarketApiError && reason.status === 409; conflict.current = stale; setStatus(stale ? 'conflict' : 'error'); setError(stale ? 'Объявление изменилось в другой вкладке. Ваши изменения не перезаписали новую версию.' : marketError(reason)); }
  function serial<T>(action: () => Promise<T>): Promise<T> { const run = queue.current.then(action); queue.current = run.then(() => undefined, () => undefined); return run; }
  async function saveCurrent() {
    if (conflict.current) throw new Error('Сначала разрешите конфликт версий.');
    const snapshot = current.current; if (!snapshot || revision.current === savedRevision.current) return;
    if (snapshot.status === 'published') {
      const missing = issuesFor(snapshot, catalog.current.find(item => item.id === snapshot.categoryId));
      if (missing.length) {
        const reason = new Error(`Опубликованное объявление пока не изменено. ${missing[0].text}.`);
        if (mounted.current) setShowIssues(true);
        fail(reason); throw reason;
      }
    }
    const sentRevision = revision.current;
    if (mounted.current) { setStatus('saving'); setError(''); }
    try {
      const result = await marketRequest<{ listing: MarketListing }>(`/listings/${snapshot.id}`, { ...editable(snapshot), version: snapshot.version }, 'PATCH');
      savedRevision.current = sentRevision;
      show(revision.current === sentRevision ? result.listing : { ...result.listing, ...current.current!, version: result.listing.version, images: result.listing.images });
      if (mounted.current) setStatus(revision.current === savedRevision.current ? 'saved' : 'dirty');
    } catch (reason) { fail(reason); throw reason; }
  }
  function flush() { if (timer.current) clearTimeout(timer.current); return serial(saveCurrent); }
  function change(patch: Partial<MarketListing>) {
    if (!current.current || conflict.current) return;
    show({ ...current.current, ...patch }); revision.current++; setStatus('dirty'); setServerIssues([]);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 1200);
  }
  useEffect(() => {
    mounted.current = true;
    if (!initial.current) {
      const draft = id ? marketRequest<{ listing: MarketListing }>(`/listings/${encodeURIComponent(id)}`) : marketRequest<{ listing: MarketListing }>('/listings', { clientId: clientId.current, currentStep: 1 }).then(result => {
        // Persist the server ID immediately, even if the independent category request fails.
        if (mounted.current) history.replaceState(null, '', `#/market?view=edit&id=${encodeURIComponent(result.listing.id)}`);
        return result;
      });
      initial.current = Promise.all([marketRequest<{ categories: MarketCategory[] }>('/categories'), draft]);
    }
    let active = true;
    void initial.current.then(([data, result]) => { if (!active) return; catalog.current = data.categories; setCategories(data.categories); if (!result.listing.isOwner) throw new Error('Это объявление принадлежит другому пользователю.'); show(result.listing); setStatus('saved'); if (!id) history.replaceState(null, '', `#/market?view=edit&id=${encodeURIComponent(result.listing.id)}`); }).catch(reason => { if (active) fail(reason); });
    const online = () => { if (current.current && !conflict.current) void flush().catch(() => {}); };
    const leaving = (event: BeforeUnloadEvent) => { if (revision.current !== savedRevision.current) { event.preventDefault(); event.returnValue = ''; } };
    const visibility = () => { if (document.visibilityState === 'hidden' && current.current && !conflict.current) void flush().catch(() => {}); };
    window.addEventListener('online', online); window.addEventListener('beforeunload', leaving); document.addEventListener('visibilitychange', visibility);
    return () => { active = false; mounted.current = false; if (timer.current) { clearTimeout(timer.current); void serial(saveCurrent).catch(() => {}); } window.removeEventListener('online', online); window.removeEventListener('beforeunload', leaving); document.removeEventListener('visibilitychange', visibility); };
  }, []);

  const category = categories.find(item => item.id === listing?.categoryId), parentId = category?.parentId || category?.id || '', roots = categories.filter(item => !item.parentId);
  const step = Math.max(1, Math.min(5, listing?.currentStep || 1));
  const issues = listing ? [...issuesFor(listing, category), ...serverIssues] : [];
  const errors = Object.fromEntries((showIssues || step === 5 ? issues : []).map(issue => [issue.key, issue.text]));
  function chooseCategory(categoryId: string) { const next = categories.find(item => item.id === categoryId); if (!next) return; change({ categoryId, attributes: {}, attributesSchemaVersion: next.attributeSchema.version, dealType: next.dealTypes.includes(current.current!.dealType) ? current.current!.dealType : next.dealTypes[0], priceUnit: next.priceUnits[0] || 'all' }); }
  function go(next: number) { change({ currentStep: next }); setShowIssues(false); window.scrollTo({ top: 0, behavior: 'instant' }); }
  async function leave() { setBusy(true); try { await flush(); onClose(); } catch { /* Keep unsaved work visible. */ } finally { if (mounted.current) setBusy(false); } }
  async function mutateImages(action: (draft: MarketListing) => Promise<{ listing: MarketListing }>) {
    await serial(async () => { await saveCurrent(); const result = await action(current.current!); show({ ...current.current!, version: result.listing.version, images: result.listing.images }); });
  }
  async function addPhotos(files: File[]) {
    if (!files.length) return;
    if (files.length + (current.current?.images.length || 0) > 8) { setError('Можно добавить до 8 фотографий.'); return; }
    const invalid = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024);
    if (invalid) { setError(`${invalid.name}: нужен JPEG, PNG или WebP до 10 МБ.`); return; }
    setBusy(true); setError('');
    try { for (const file of files) { setUpload({ name: file.name, percent: 0 }); await mutateImages(draft => uploadPhoto(draft.id, draft.version, file, percent => { if (mounted.current) setUpload({ name: file.name, percent }); })); } }
    catch (reason) { fail(reason); } finally { if (mounted.current) { setBusy(false); setUpload(null); } }
  }
  async function imageAction(action: 'remove' | 'cover' | 'earlier' | 'later', imageId: string) {
    setBusy(true); setError('');
    try { await mutateImages(draft => { if (action === 'remove') return marketRequest(`/listings/${draft.id}/images/${imageId}?version=${draft.version}`, undefined, 'DELETE'); const imageIds = draft.images.map(image => image.id), index = imageIds.indexOf(imageId), target = action === 'cover' ? 0 : action === 'earlier' ? index - 1 : index + 1; imageIds.splice(index, 1); imageIds.splice(target, 0, imageId); return marketRequest(`/listings/${draft.id}/images/order`, { version: draft.version, imageIds }, 'PATCH'); }); }
    catch (reason) { fail(reason); } finally { if (mounted.current) setBusy(false); }
  }
  async function publish() {
    setShowIssues(true); if (issues.length) return; setBusy(true); setError('');
    try { await serial(async () => { await saveCurrent(); const draft = current.current!; const result = await marketRequest<{ listing: MarketListing }>(`/listings/${draft.id}/publish`, { version: draft.version }); show(result.listing); onPublished(result.listing.id); }); }
    catch (reason) { fail(reason); if (reason instanceof MarketApiError) { const mapped = Object.entries(reason.fields).map(([key, text]) => ({ key: key.replace(/^attributes\./, ''), text, step: /category|dealType/.test(key) ? 1 : /price|phone|Phone/.test(key) ? 3 : /region|district|locality|image/.test(key) ? 4 : 2 })); setServerIssues(mapped); } }
    finally { if (mounted.current) setBusy(false); }
  }
  async function reload() { setBusy(true); try { await queue.current; const result = await marketRequest<{ listing: MarketListing }>(`/listings/${current.current!.id}`); show(result.listing); savedRevision.current = revision.current; conflict.current = false; setStatus('saved'); setError(''); } catch (reason) { fail(reason); } finally { setBusy(false); } }
  if (!listing) return <section className="market-wizard"><button className="market-wizard-back" onClick={onClose}><Icon name="back" />В рынок</button>{error ? <div role="alert"><p>{error}</p><button onClick={() => location.reload()}>Повторить</button></div> : <p role="status">Готовим ваш черновик…</p>}</section>;
  return <section className="market-wizard" aria-label="Создать объявление">
    <header className="market-wizard-head"><div><button className="market-wizard-back" disabled={busy} onClick={() => void leave()}><Icon name="back" size={20} />В рынок</button><span className="market-wizard-draft">{listing.status === 'draft' ? 'Черновик' : 'Редактирование'}</span></div><h1>{listing.status === 'draft' ? 'Создать объявление' : 'Изменить объявление'}</h1><div className="market-wizard-steps" role="progressbar" aria-label="Шаг публикации" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step}>{stepNames.map((name, index) => <span key={name} className={index < step ? 'done' : ''} />)}</div><div className="market-wizard-meta"><span>Шаг {step} из 5</span><span role="status">{status === 'saved' ? 'Сохранено ✓' : status === 'saving' ? 'Сохранение…' : status === 'dirty' ? 'Есть изменения' : 'Не сохранено'}</span></div></header>
    {error && <div className="market-wizard-error" role="alert"><p>{error}</p>{status === 'conflict' ? <><p>Можно скопировать введённый текст перед загрузкой. Изменения этой вкладки будут заменены.</p><button disabled={busy} onClick={() => void reload()}>Загрузить версию сервера</button></> : <button disabled={busy} onClick={() => { setError(''); void flush().catch(() => {}); }}>Повторить сохранение</button>}</div>}
    <fieldset className="market-wizard-body" disabled={busy || status === 'conflict'}><legend className="sr-only">{stepNames[step - 1]}</legend><h2>{stepNames[step - 1]}</h2>
      {step === 1 && <><p className="market-wizard-help">Подберём нужные характеристики для вашего объявления.</p><label>Категория<select aria-label="Категория" value={parentId} onChange={event => chooseCategory(event.target.value)}><option value="">Выберите категорию</option>{roots.map(item => <option key={item.id} value={item.id}>{item.nameRu}</option>)}</select></label><label>Подкатегория<select aria-label="Подкатегория" value={category?.parentId ? category.id : ''} disabled={!parentId} onChange={event => chooseCategory(event.target.value)}><option value="">Что вы хотите разместить?</option>{categories.filter(item => item.parentId === parentId).map(item => <option key={item.id} value={item.id}>{item.nameRu}</option>)}</select></label><fieldset className="market-wizard-choice"><legend>Тип сделки</legend>{category?.dealTypes.map(deal => <button type="button" key={deal} aria-pressed={listing.dealType === deal} onClick={() => change({ dealType: deal })}>{dealLabels[deal] || deal}</button>)}</fieldset></>}
      {step === 2 && <><label>Название<input value={listing.title} maxLength={120} placeholder="Например, пшеница 3 класса" onChange={event => change({ title: event.target.value })} aria-invalid={!!errors.title} /></label><small className="market-input-count">{listing.title.length} / 120</small><label>Описание<textarea value={listing.description} maxLength={5000} rows={5} placeholder="Расскажите о качестве, состоянии и условиях сделки" onChange={event => change({ description: event.target.value })} aria-invalid={!!errors.description} /></label><small className="market-input-count">{listing.description.length} / 5000</small><h3>Характеристики</h3><DynamicAttributesForm fields={category?.attributeSchema.fields || []} value={listing.attributes} onChange={attributes => change({ attributes })} errors={errors} dealType={listing.dealType} /></>}
      {step === 3 && <><fieldset className="market-wizard-choice"><legend>Цена</legend>{([['fixed', 'Фиксированная'], ['from', 'От указанной'], ['negotiable', 'Договорная']] as const).map(([mode, label]) => <button type="button" key={mode} aria-pressed={listing.priceMode === mode} onClick={() => change({ priceMode: mode, ...(mode === 'negotiable' ? { priceAmount: null } : {}) })}>{label}</button>)}</fieldset>{listing.priceMode !== 'negotiable' && <div className="market-price-inputs"><label>{listing.dealType === 'buy' ? 'Бюджет, ₸' : listing.dealType === 'vacancy' ? 'Зарплата, ₸' : 'Сумма, ₸'}<input type="number" inputMode="decimal" min="0.01" step="0.01" value={listing.priceAmount ?? ''} onChange={event => change({ priceAmount: event.target.value === '' ? null : Number(event.target.value) })} /></label><label>За единицу<select aria-label="За единицу" value={listing.priceUnit} onChange={event => change({ priceUnit: event.target.value })}>{category?.priceUnits.map(unit => <option key={unit} value={unit}>{unitLabels[unit] || unit}</option>)}</select></label></div>}<label>Условия доставки<textarea rows={2} maxLength={500} value={listing.delivery || ''} onChange={event => change({ delivery: event.target.value })} placeholder="Самовывоз, доставка по области…" /></label><h3>Связь с вами</h3><label className="market-checkbox"><input type="checkbox" checked={!!listing.allowPhone} onChange={event => change({ allowPhone: event.target.checked })} />Показывать мой номер телефона</label>{listing.allowPhone && <label>Телефон<input type="tel" autoComplete="tel" maxLength={20} placeholder="+7 …" value={listing.contactPhone || ''} onChange={event => change({ contactPhone: event.target.value })} /></label>}<p className="market-wizard-help">Номер публикуется только с вашего разрешения.</p></>}
      {step === 4 && <><p className="market-wizard-help">До 8 фотографий · JPEG, PNG, WebP · до 10 МБ каждая. Первое фото будет обложкой.</p><div className="market-photo-grid">{listing.images.map((image, index) => <div className="market-photo" key={image.id}><img src={image.url} alt={`Фото ${index + 1}`} /><span>{index === 0 ? 'Главное фото' : `Фото ${index + 1}`}</span><div><button aria-label={`Удалить фото ${index + 1}`} onClick={() => void imageAction('remove', image.id)}><Icon name="close" size={16} /></button><button disabled={index === 0} aria-label={`Сделать фото ${index + 1} главным`} onClick={() => void imageAction('cover', image.id)}><Icon name="check" size={16} /></button><button disabled={index === 0} aria-label={`Фото ${index + 1} раньше`} onClick={() => void imageAction('earlier', image.id)}><Icon name="back" size={16} /></button><button disabled={index === listing.images.length - 1} aria-label={`Фото ${index + 1} позже`} onClick={() => void imageAction('later', image.id)}><Icon name="right" size={16} /></button></div></div>)}</div>{listing.images.length < 8 && <label className="market-photo-add"><Icon name="camera" /><strong>Добавить фотографии</strong><input aria-label="Добавить фотографии" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const files = [...(event.target.files || [])]; event.target.value = ''; void addPhotos(files); }} /></label>}<h3>Местоположение</h3><RegionFields value={listing} onChange={value => change(value)} /><p className="market-wizard-help">Публикуем населённый пункт. Точный домашний адрес не нужен.</p></>}
      {step === 5 && <><p className="market-wizard-help">Так покупатели увидят ваше объявление. Проверьте данные перед публикацией.</p><ListingGallery images={listing.images} title={listing.title} /><span className="market-wizard-deal">{dealLabels[listing.dealType]}</span><h2>{listing.title || 'Название не заполнено'}</h2><strong className="market-preview-price">{formatPrice(listing)}</strong><p className="market-wizard-location"><Icon name="location" size={16} />{[listing.regionName, listing.districtName, listing.localityName].filter(Boolean).join(' · ') || 'Место не выбрано'}</p><dl className="market-preview-attributes">{(category?.attributeSchema.fields || []).filter(field => visibleAttribute(field, listing.attributes, listing.dealType) && listing.attributes[field.key] != null && listing.attributes[field.key] !== '').map(field => { const value = listing.attributes[field.key]; const readable = typeof value === 'boolean' ? value ? 'Да' : 'Нет' : Array.isArray(value) ? value.map(item => field.options?.find(option => option.value === item)?.label || item).join(', ') : field.options?.find(option => option.value === value)?.label || String(value); return <div key={field.key}><dt>{field.label}</dt><dd>{readable}{field.unit ? ` ${field.unit}` : ''}</dd></div>; })}</dl><p className="market-preview-description">{listing.description || 'Описание не заполнено'}</p>{listing.delivery && <p>Доставка: {listing.delivery}</p>}<div className="market-preview-seller"><Icon name="user" /><span>{listing.seller?.name || 'Ваш профиль'}{listing.allowPhone && <small>{listing.contactPhone}</small>}</span></div></>}
      {(showIssues || step === 5) && issues.filter(issue => step === 5 || issue.step === step).length > 0 && <div className="market-wizard-validation" role="alert"><strong>Что нужно заполнить</strong>{issues.filter(issue => step === 5 || issue.step === step).map((issue, index) => <button key={`${issue.key}-${index}`} type="button" onClick={() => { go(issue.step); setShowIssues(true); }}>{issue.text}<Icon name="right" size={16} /></button>)}</div>}
    </fieldset>
    {upload && <div className="market-upload-progress" role="status"><span>Загрузка: {upload.name}</span><progress max={100} value={upload.percent} /><small>{upload.percent === 100 ? 'Обрабатываем фотографию…' : `${upload.percent} %`}</small></div>}
    <footer className="market-wizard-footer">{step > 1 && <button className="secondary-button" disabled={busy || status === 'conflict'} onClick={() => go(step - 1)}>Назад</button>}<button className="primary-button" disabled={busy || status === 'conflict'} onClick={() => { if (step === 5) void publish(); else if (issues.some(issue => issue.step === step)) setShowIssues(true); else go(step + 1); }}>{busy ? upload ? 'Загрузка…' : 'Подождите…' : step === 5 ? 'Опубликовать' : 'Продолжить'}{!busy && step < 5 && <Icon name="right" size={18} />}</button></footer>
  </section>;
}
