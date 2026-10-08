import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api, authenticate, humanError, login, recover, register, remember } from '../../entities/workspace/api';
import { parseLoginQR } from '../../entities/workspace/auth-qr';
import { syncNow } from '../../entities/workspace/hooks';
import type { SessionUser } from '../../entities/workspace/types';
import { Icon } from '../../shared/ui/Icon';
import { Page, Notice, LinkRow } from '../workspace/ui';
import { QRScanner } from '../workspace/QRScanner';
import { RecoveryCode } from '../settings/ProfilePage';
import './auth.css';

type QRRequest = { id: string; url: string; code: string; device: string; expires: number };
type QRDetails = { code: string; device: string; expires: number; status: string; audience?: string; target_origin?: string };
const finish = async () => { await syncNow(); location.hash = '/'; };

function LoginForm({ onComplete = finish }: { onComplete?: () => Promise<void> }) {
  const [mode, setMode] = useState<'login'|'register'|'recover'>('login');
  const [name, setName] = useState(''), [code, setCode] = useState(''), [recovery, setRecovery] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const supported = !!window.PublicKeyCredential && window.isSecureContext;
  async function submit() {
    setError(''); setBusy(true);
    try { const result = mode === 'register' ? await register(name.trim()) : mode === 'recover' ? await recover(code.trim()) : await login();
      if (result.recovery) { setRecovery(result.recovery); await syncNow(); } else await onComplete();
    } catch (e) { setError((e as Error).name === 'NotAllowedError' ? 'Ключ не выбран. Если iPhone предлагает QR или NFC, ключ может быть на другом устройстве. Используйте код восстановления или сохранённый ключ из приложения «Пароли».' : humanError(e)); } finally { setBusy(false); }
  }
  if (recovery) return <RecoveryCode code={recovery} onDismiss={() => { setRecovery(''); void onComplete(); }} />;
  return <><div className="auth-modes" role="group" aria-label="Вход или регистрация"><button aria-pressed={mode === 'login'} disabled={busy} onClick={() => setMode('login')}>Войти</button><button aria-pressed={mode === 'register'} disabled={busy} onClick={() => setMode('register')}>Создать профиль</button></div>
    <form className="workspace-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {mode === 'register' && <label>Ваше имя<input autoComplete="name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="Как к вам обращаться" /></label>}
      {mode === 'recover' ? <label>Код восстановления<input value={code} onChange={e => setCode(e.target.value)} required autoComplete="off" spellCheck={false} /></label> : <p className="auth-description">{mode === 'register' ? 'Создадим ключ доступа на этом устройстве. Подтвердите Face ID, отпечатком или кодом блокировки.' : 'Выберите сохранённый ключ EGIN. Если ключа на телефоне нет, войдите по коду восстановления или создайте новый профиль.'}</p>}
      <button className="primary-button auth-primary" disabled={busy || (mode !== 'recover' && !supported) || (mode === 'register' && !name.trim()) || (mode === 'recover' && !code.trim())}><Icon name="lock" size={20}/>{busy ? 'Подтвердите на устройстве…' : mode === 'register' ? 'Создать passkey' : mode === 'recover' ? 'Восстановить доступ' : 'Войти с ключом'}</button>
      {!supported && mode !== 'recover' && <Notice>Passkey недоступен в этом браузере. Откройте сайт по HTTPS в Safari или Chrome, либо используйте код восстановления.</Notice>}
    </form><Notice error>{error}</Notice><button className="text-button" disabled={busy} onClick={() => setMode(mode === 'recover' ? 'login' : 'recover')}>{mode === 'recover' ? 'Вернуться ко входу' : 'Войти по коду восстановления'}</button>
  </>;
}

function QRLogin() {
  const [request, setRequest] = useState<QRRequest|null>(null), [image, setImage] = useState(''), [error, setError] = useState('');
  const [revision, setRevision] = useState(0), [seconds, setSeconds] = useState(120), [status, setStatus] = useState('loading');
  useEffect(() => {
    let alive = true, id = '', polling = false, expires = 0;
    setRequest(null); setImage(''); setError(''); setStatus('loading'); setSeconds(120);
    void api<QRRequest>('/auth/qr/start', {}).then(async value => {
      id = value.id; expires = value.expires;
      if (!alive) { await api('/auth/qr/cancel', { id }).catch(() => {}); return; }
      setRequest(value); setStatus('pending');
      const data = await QRCode.toDataURL(value.url, { width: 280, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#214d36', light: '#ffffff' } });
      if (alive) setImage(data);
    }).catch(e => { if (alive) { setError(humanError(e)); setStatus('error'); } });
    const interval = setInterval(async () => {
      if (!id || polling || !alive) return;
      if (Date.now() >= expires) { clearInterval(interval); setStatus('expired'); return; }
      polling = true;
      try { const result = await api<QRDetails & { user?: SessionUser }>('/auth/qr/poll', { id });
        if (!alive) return;
        setError(''); setStatus(result.status);
        if (result.status === 'complete' && result.user) { id = ''; clearInterval(interval); await remember(result.user); await finish(); }
        else if (result.status === 'denied') { clearInterval(interval); setError('Вход отклонён на телефоне.'); }
      } catch (e) { if (alive) setError(humanError(e)); } finally { polling = false; }
    }, 5000);
    return () => { alive = false; clearInterval(interval); if (id) void api('/auth/qr/cancel', { id }).catch(() => {}); };
  }, [revision]);
  useEffect(() => {
    if (!request) return;
    const update = () => setSeconds(Math.max(0, Math.ceil((request.expires - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [request]);
  return <section className="auth-qr"><h2>Войти с телефона</h2><p>Отсканируйте обычной камерой телефона и откройте ссылку. Если на телефоне уже есть вход в EGIN, сразу появится подтверждение. Также можно использовать сканер внутри EGIN.</p>
    <div className={`auth-qr-image ${seconds === 0 || status === 'denied' ? 'expired' : ''}`}>{image && seconds > 0 && status !== 'denied' ? <img src={image} width="280" height="280" alt="QR для входа в EGIN" /> : <span>{seconds === 0 ? 'Срок действия QR истёк' : status === 'denied' ? 'Вход отклонён' : status === 'error' ? 'QR недоступен' : 'Создаём QR…'}</span>}</div>
    {request && seconds > 0 && status !== 'denied' && <><span className="auth-code-label">Сверьте код на обоих экранах</span><strong className="auth-code">{request.code}</strong><small>Действует ещё {seconds} сек.</small></>}
    <Notice error>{error}</Notice>{(seconds === 0 || status === 'denied' || status === 'error') && <button className="secondary-button" onClick={() => setRevision(value => value + 1)}>Создать новый QR</button>}
  </section>;
}

export default function AuthPage() {
  const [qr, setQR] = useState(false);
  return <Page title="Вход в EGIN" back="/"><div className="auth-intro"><span className="auth-mark"><Icon name="leaf" size={30}/></span><h2>Ваш участок.<br/>На любом устройстве.</h2><p>Сохраняйте наблюдения, фотографии и данные участков в своём профиле.</p></div>{qr ? <><QRLogin/><button className="text-button" onClick={() => setQR(false)}>Вернуться к passkey</button></> : <><LoginForm/><div className="auth-divider">или</div><button className="secondary-button auth-primary" onClick={() => setQR(true)}><Icon name="qr" size={20}/>Войти по QR с телефона</button></>}<a href="#/auth/scan" className="auth-guest">Сканировать QR с компьютера</a><a href="#/" className="auth-guest">Продолжить без входа</a><div className="auth-egov"><Icon name="lock" size={19}/><span><strong>Вход через eGov</strong><small>В разработке · пока недоступен</small></span></div></Page>;
}

export function QRConfirmPage({ id }: { id: string }) {
  const [user, setUser] = useState<SessionUser|null>(null), [checking, setChecking] = useState(true);
  const [revision, setRevision] = useState(0), [details, setDetails] = useState<QRDetails|null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [matched, setMatched] = useState(false), [done, setDone] = useState(''), [keyCreated, setKeyCreated] = useState(false);
  useEffect(() => {
    let alive = true; setChecking(true); setError('');
    void api<{user:SessionUser|null}>('/session').then(async result => {
      if (!alive) return;
      setUser(result.user);
      if (result.user) await remember(result.user);
    }).catch(e => { if (alive) setError(humanError(e)); }).finally(() => { if (alive) setChecking(false); });
    return () => { alive = false; };
  }, [revision]);
  useEffect(() => {
    if (!user || checking) return; let alive = true;
    void api<QRDetails>('/auth/qr/' + id).then(value => { if (alive) setDetails(value); }).catch(e => { if (alive) { if (e.status === 401) setUser(null); setError(humanError(e)); } });
    return () => { alive = false; };
  }, [id, user?.id, checking, revision]);
  async function approve() {
    setBusy(true); setError('');
    try { const flow = await api('/auth/qr/' + id + '/options', {}); const response = await authenticate(flow.options); await api('/auth/qr/' + id + '/verify', { flow: flow.flow, response }); setDone('Вход подтверждён. Вернитесь на устройство, где показан QR.'); }
    catch (e) { setError((e as Error).name === 'NotAllowedError' ? 'Ключ не выбран. Если он сохранён только на другом устройстве, создайте ключ на этом телефоне кнопкой ниже, затем подтвердите вход.' : humanError(e)); } finally { setBusy(false); }
  }
  async function addPhoneKey() {
    if (!user) return; setBusy(true); setError('');
    try { await register(user.name); setKeyCreated(true); } catch (e) { setError(humanError(e)); } finally { setBusy(false); }
  }
  async function reject() { setBusy(true); try { await api('/auth/qr/' + id + '/reject', {}); setDone('Вход отклонён.'); } catch (e) { setError(humanError(e)); } finally { setBusy(false); } }
  return <Page title="Подтвердить вход" back="/settings/security">
    {done ? <div className="workspace-card" role="status"><Icon name="check" size={30}/><h2>{done}</h2><a href="#/" className="primary-button">На главную</a></div> : <>
      <p className="page-description">Сверьте адрес сайта и код с экраном, на котором вы начали вход.</p><div className="auth-domain">{location.host}</div>
      {checking ? <p role="status">Проверяем вход на этом телефоне…</p> : !user ? <><Notice>В этом браузере ещё нет входа в EGIN. Войдите с ключом доступа или по коду восстановления — затем вернёмся к подтверждению QR.</Notice><LoginForm onComplete={async () => { setRevision(value => value + 1); }}/></> : details && details.status === 'pending' ? <section className="workspace-card auth-confirm">
        <h2>{details.audience === 'developer' ? 'Вход в EGIN API' : details.device}</h2>
        {details.audience === 'developer' && <><p>Кабинет разработчика: создание и отзыв ключей доступа к вашим данным.</p><strong className="auth-domain">{details.target_origin}</strong><p>{details.device}</p></>}
        <p>Войти как {user.name}</p><span className="auth-code-label">Код на другом экране</span><strong className="auth-code">{details.code}</strong>
        <label className="auth-match"><input type="checkbox" checked={matched} onChange={e => setMatched(e.target.checked)}/><span>Я начал этот вход, коды совпадают</span></label>
        <button className="primary-button" disabled={!matched || busy} onClick={() => void approve()}>{busy ? 'Подтвердите на устройстве…' : 'Подтвердить с passkey'}</button>
        <button className="text-button" disabled={busy} onClick={() => void reject()}>Отклонить вход</button>
        <div className="auth-phone-key"><h3>Ключ остался на другом устройстве?</h3><p>Сохраните новый ключ в текущий профиль. На iPhone выберите сохранение в «Пароли», затем подтвердите вход выше.</p>{keyCreated ? <Notice>Ключ добавлен. Теперь можно подтвердить вход.</Notice> : <button className="secondary-button" disabled={busy} onClick={() => void addPhoneKey()}>Создать ключ на этом телефоне</button>}</div>
      </section> : details ? <Notice>Этот запрос уже обработан. Создайте новый QR на устройстве входа.</Notice> : !error && <p role="status">Открываем запрос входа…</p>}
      <Notice error>{error}</Notice>{error && <LinkRow href="/auth/scan" title="Сканировать новый QR" description="Откройте новый код на другом устройстве" icon="qr"/>}
    </>}
  </Page>;
}

export function QRScanPage() {
  const [error, setError] = useState(''), [raw, setRaw] = useState(''), [destination, setDestination] = useState<URL|null>(null);
  function scan(value:string) {
    setDestination(null);
    try {
      const url = parseLoginQR(value, location.origin);
      if (!url) throw new Error('Это не QR входа. На сайте выберите «Войти по QR с телефона» или QR кабинета EGIN API.');
      setError('');
      if (url.origin === location.origin) location.hash = url.hash;
      else setDestination(url);
    } catch (e) { setError(humanError(e)); }
  }
  return <Page title="Сканер входа" back="/settings/security"><p className="page-description">Сканируйте QR входа с сайта EGIN или кабинета API. Также подойдёт обычная камера телефона.</p><QRScanner onResult={scan}/>
    {destination && <div className="workspace-card"><h2>QR другого сайта EGIN</h2><p>Вход нужно подтвердить на <strong>{destination.host}</strong>. У тестовой и основной версии разные профили.</p><a className="primary-button" href={destination.href}>Открыть подтверждение</a></div>}
    <details className="auth-manual"><summary>Вставить ссылку из QR</summary><form className="workspace-form" onSubmit={event=>{event.preventDefault();scan(raw);}}><label>Ссылка входа<input type="url" required value={raw} onChange={event=>setRaw(event.target.value)} autoComplete="off" placeholder="https://egin.perricheno.com/#/auth/confirm/…"/></label><button className="secondary-button">Открыть ссылку</button></form></details><Notice error>{error}</Notice></Page>;
}
