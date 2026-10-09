import { useEffect, useState } from 'react';
import { Icon } from '../shared/ui/Icon';
import { Sheet } from '../shared/ui/Sheet';
import { UPDATE_EVENT, applyWaitingUpdate, waitingUpdate } from './app-updates';

export function UpdateNotice() {
  const [available, setAvailable] = useState(!!waitingUpdate()), [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const update = () => setAvailable(!!waitingUpdate()); window.addEventListener(UPDATE_EVENT, update); return () => window.removeEventListener(UPDATE_EVENT, update); }, []);
  if (!available) return null;
  return <><div className="app-update" role="status"><Icon name="rotate" size={18}/><span>Доступна новая версия EGIN</span><button onClick={() => setOpen(true)}>Обновить</button></div>{open && <Sheet title="Обновление EGIN" onClose={() => setOpen(false)}><p>Откроется новая версия приложения. Сначала сохраните изменения в открытых формах.</p><p className="form-help">Участки, записи и очередь синхронизации останутся на телефоне.</p><button className="primary-button" disabled={busy} onClick={() => { setBusy(true); setError(''); void applyWaitingUpdate().catch(e => { setError(e.message); setBusy(false); }); }}>{busy ? 'Обновляем…' : 'Обновить сейчас'}</button><button className="text-button" disabled={busy} onClick={() => setOpen(false)}>Позже</button>{error && <p role="alert">{error}</p>}</Sheet>}</>;
}
