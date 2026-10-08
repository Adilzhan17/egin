import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { startAuthentication } from '@simplewebauthn/browser';
import { api, humanError, login, recover, register, remember } from '../../entities/workspace/api';
import { syncNow, useMeta } from '../../entities/workspace/hooks';
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
    } catch (e) { setError(humanError(e)); } finally { setBusy(false); }
  }
  if (recovery) return <RecoveryCode code={recovery} onDismiss={() => { setRecovery(''); void onComplete(); }} />;
  return <><div className="auth-modes" role="group" aria-label="Вход или регистрация"><button aria-pressed={mode === 'login'} disabled={busy} onClick={() => setMode('login')}>Войти</button><button aria-pressed={mode === 'register'} disabled={busy} onClick={() => setMode('register')}>Создать профиль</button></div>
    <form className="workspace-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      {mode === 'register' && <label>Ваше имя<input autoComplete="name" maxLength={80} required value={name} onChange={e => setName(e.target.value)} placeholder="Как к вам обращаться" /></label>}
      {mode === 'recover' ? <label>Код восстановления<input value={code} onChange={e => setCode(e.target.value)} required autoComplete="off" spellCheck={false} /></label> : <p className="auth-description">Face ID, отпечаток пальца или код блокировки устройства. EGIN не получает ваши биометрические данные.</p>}
      <button className="primary-button auth-primary" disabled={busy || (mode !== 'recover' && !supported) || (mode === 'register' && !name.trim()) || (mode === 'recover' && !code.trim())}><Icon name="lock" size={20}/>{busy ? 'Подтвердите на устройстве…' : mode === 'register' ? 'Создать passkey' : mode === 'recover' ? 'Восстановить доступ' : 'Войти с passkey'}</button>
      {!supported && mode !== 'recover' && <Notice>Passkey недоступен в этом браузере. Откройте сайт в современном браузере или используйте QR и код восстановления.</Notice>}
    </form><Notice error>{error}</Notice><button className="text-button" disabled={busy} onClick={() => setMode(mode === 'recover' ? 'login' : 'recover')}>{mode === 'recover' ? 'Вернуться ко входу' : 'Потеряли доступ? Войти по коду'}</button>
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
  return <section className="auth-qr"><h2>Войти с телефона</h2><p>Откройте камеру телефона или сканер EGIN. Отсканируйте QR и подтвердите вход своим passkey.</p>
    <div className={`auth-qr-image ${seconds === 0 || status === 'denied' ? 'expired' : ''}`}>{image && seconds > 0 && status !== 'denied' ? <img src={image} width="280" height="280" alt="QR для входа в EGIN" /> : <span>{seconds === 0 ? 'Срок действия QR истёк' : status === 'denied' ? 'Вход отклонён' : status === 'error' ? 'QR недоступен' : 'Создаём QR…'}</span>}</div>
    {request && seconds > 0 && status !== 'denied' && <><span className="auth-code-label">Сверьте код на обоих экранах</span><strong className="auth-code">{request.code}</strong><small>Действует ещё {seconds} сек.</small></>}
    <Notice error>{error}</Notice>{(seconds === 0 || status === 'denied' || status === 'error') && <button className="secondary-button" onClick={() => setRevision(value => value + 1)}>Создать новый QR</button>}
  </section>;
}

export default function AuthPage() {
  const [qr, setQR] = useState(false);
  return <Page title="Вход в EGIN" back="/"><div className="auth-intro"><span className="auth-mark"><Icon name="leaf" size={30}/></span><h2>Ваш участок.<br/>На любом устройстве.</h2><p>Сохраняйте наблюдения, фотографии и данные участков в своём профиле.</p></div>{qr ? <><QRLogin/><button className="text-button" onClick={() => setQR(false)}>Вернуться к passkey</button></> : <><LoginForm/><div className="auth-divider">или</div><button className="secondary-button auth-primary" onClick={() => setQR(true)}><Icon name="qr" size={20}/>Войти по QR с телефона</button></>}<a href="#/" className="auth-guest">Продолжить без входа</a><div className="auth-egov"><Icon name="lock" size={19}/><span><strong>Вход через eGov</strong><small>В разработке · пока недоступен</small></span></div></Page>;
}

export function QRConfirmPage({ id }: { id: string }) {
  const user = useMeta<SessionUser|null>('user', null);
  const [needsLogin, setNeedsLogin] = useState(false), [revision, setRevision] = useState(0);
  const [details, setDetails] = useState<QRDetails|null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [matched, setMatched] = useState(false), [done, setDone] = useState('');
  useEffect(() => { if (!user) return; let alive = true; void api<QRDetails>('/auth/qr/' + id).then(value => { if (alive) setDetails(value); }).catch(e => { if (alive) { if (e.status === 401) setNeedsLogin(true); else setError(humanError(e)); } }); return () => { alive = false; }; }, [id, user?.id, revision]);
  async function approve() {
    setBusy(true); setError('');
    try { const flow = await api('/auth/qr/' + id + '/options', {}); const response = await startAuthentication({ optionsJSON: flow.options }); await api('/auth/qr/' + id + '/verify', { flow: flow.flow, response }); setDone('Вход подтверждён. Вернитесь на устройство, где показан QR.'); }
    catch (e) { setError(humanError(e)); } finally { setBusy(false); }
  }
  async function reject() { setBusy(true); try { await api('/auth/qr/' + id + '/reject', {}); setDone('Вход отклонён.'); } catch (e) { setError(humanError(e)); } finally { setBusy(false); } }
  return <Page title="Подтвердить вход" back="/settings/security">{done ? <div className="workspace-card" role="status"><Icon name="check" size={30}/><h2>{done}</h2><a href="#/" className="primary-button">На главную</a></div> : <><p className="page-description">Подтверждайте только вход, который вы сами начали на другом устройстве. Сверьте адрес сайта и код.</p><div className="auth-domain">{location.host}</div>{!user || needsLogin ? <><Notice>Войдите в свой профиль на этом телефоне, затем подтвердите QR.</Notice><LoginForm onComplete={async () => { setNeedsLogin(false); setError(''); setRevision(value => value + 1); await syncNow(); }}/></> : details && details.status === 'pending' ? <section className="workspace-card auth-confirm"><h2>{details.audience === 'developer' ? 'Вход в EGIN API' : details.device}</h2>{details.audience === 'developer' && <><p>Кабинет разработчика: создание и отзыв ключей доступа к вашим данным.</p><strong className="auth-domain">{details.target_origin}</strong><p>{details.device}</p></>}<p>Войти как {user.name}</p><span className="auth-code-label">Код на другом экране</span><strong className="auth-code">{details.code}</strong><label className="auth-match"><input type="checkbox" checked={matched} onChange={e => setMatched(e.target.checked)}/><span>Я начал этот вход, коды совпадают</span></label><button className="primary-button" disabled={!matched || busy} onClick={() => void approve()}>{busy ? 'Подтвердите на устройстве…' : 'Подтвердить с passkey'}</button><button className="text-button" disabled={busy} onClick={() => void reject()}>Отклонить вход</button></section> : details && <Notice>Этот запрос уже обработан. Создайте новый QR на устройстве входа.</Notice>}<Notice error>{error}</Notice>{error && <LinkRow href="/auth/scan" title="Сканировать новый QR" description="Откройте новый код на другом устройстве" icon="qr"/>}</>}</Page>;
}

export function QRScanPage() {
  const [error, setError] = useState('');
  return <Page title="Сканер входа" back="/settings/security"><p className="page-description">Откройте EGIN на другом устройстве, выберите «Войти по QR с телефона» и отсканируйте код.</p><QRScanner onResult={value => { try { const url = new URL(value); if (url.origin !== location.origin || !/^#\/auth\/confirm\/[A-Za-z0-9_-]{43}$/.test(url.hash)) throw new Error('Это не QR входа в EGIN на этом сайте.'); setError(''); location.hash = url.hash; } catch (e) { setError(humanError(e)); } }}/><Notice error>{error}</Notice></Page>;
}
