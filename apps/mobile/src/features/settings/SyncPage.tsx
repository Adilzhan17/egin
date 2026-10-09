import { useEffect, useRef, useState } from 'react';
import { useRows, useMeta, syncNow } from '../../entities/workspace/hooks';
import { all, owner, meta, importGuest, resolveConflict, setMeta } from '../../entities/workspace/db';
import type { Row, SessionUser } from '../../entities/workspace/types';
import { humanError } from '../../entities/workspace/api';
import { Icon } from '../../shared/ui/Icon';
import { Page, Notice, Toggle, LinkRow } from '../workspace/ui';
import { changedRecordFields, conflictFacts, kindLabel, recordTitle } from './conflict-summary';
import './sync.css';

export default function SyncPage() {
  const who = useMeta('owner', 'guest');
  return <SyncContent key={who} expectedOwner={who}/>;
}
function SyncContent({ expectedOwner }: { expectedOwner: string }) {
  const user = useMeta<SessionUser | null>('user', null), auto = useMeta('autoSync', true);
  const status = useMeta('syncStatus', { state: 'guest', message: 'Записи хранятся на телефоне' });
  const { rows, error: rowsError } = useRows();
  const [allRows, setRows] = useState<Row[]>([]), [guest, setGuest] = useState(0), [last, setLast] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [online, setOnline] = useState(navigator.onLine);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const who = await owner(), r = await all<Row>('records'), last = await meta(`lastSync:${who}`, '');
      if (alive && who === expectedOwner) { setRows(r.filter(x => x.owner === who)); setGuest(r.filter(x => x.owner === 'guest' && !x.deleted).length); setLast(last); }
    })().catch(e => { if (alive) setError(humanError(e)); });
    return () => { alive = false; };
  }, [rows, user, expectedOwner, status.state]);
  useEffect(() => { const update = () => setOnline(navigator.onLine); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
  async function act(fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { if (await owner() !== expectedOwner) throw new Error('Профиль изменился. Откройте синхронизацию заново.'); await fn(); }
    catch (e) { if (active.current) setError(humanError(e)); }
    finally { if (active.current) setBusy(false); }
  }
  const pending = allRows.filter(r => r.dirty && !r.conflict), conflicts = allRows.filter(r => r.conflict);
  const disabled = busy || status.state === 'syncing';
  return <Page title="Синхронизация">
    <div className="workspace-card sync-overview"><div className="sync-heading"><Icon name={status.state === 'ok' ? 'check' : online ? 'cloud' : 'storage'} size={24}/><h2>{user ? 'Облако EGIN' : 'Локальный режим'}</h2></div><p role="status">{status.message}</p>
      <div className="sync-counts"><div><strong>{pending.length}</strong><span>Ожидают отправки</span></div><div><strong>{conflicts.length}</strong><span>Нужно сравнить</span></div></div>
      <dl className="settings-facts"><div><dt>Последняя синхронизация</dt><dd>{last ? new Date(last).toLocaleString('ru-RU') : 'Ещё не было'}</dd></div><div><dt>Соединение</dt><dd>{online ? 'Есть сеть' : 'Без сети'}</dd></div></dl>
      <button className="primary-button" disabled={disabled || !user || !online} onClick={() => void act(syncNow)}>{status.state === 'syncing' ? 'Синхронизируем…' : 'Синхронизировать сейчас'}</button>
      {!online && <p className="form-help">Изменения сохранены на телефоне. Отправка станет доступна после подключения к сети.</p>}
    </div>
    {(!user || status.state === 'auth') && <LinkRow href="/auth" title="Войти для синхронизации" description="Локальные записи остаются на телефоне" icon="user"/>}
    <Toggle title="Автоматическая отправка" description="При появлении сети и открытии приложения. Фоновая отправка зависит от браузера." on={auto} onChange={() => void act(() => setMeta('autoSync', !auto))}/>
    {pending.length > 0 && <section className="workspace-card sync-queue"><h2>Очередь изменений</h2>{(['field', 'sensor', 'entry', 'profile'] as const).map(kind => { const group = pending.filter(r => r.kind === kind); return group.length ? <div key={kind}><span>{({ field: 'Участки', sensor: 'Датчики', entry: 'Записи', profile: 'Профиль' })[kind]}</span><strong>{group.length}</strong><small>{group.filter(r => r.deleted).length > 0 ? `В том числе удалений: ${group.filter(r => r.deleted).length}` : 'Создание или изменение'}</small></div> : null; })}</section>}
    {user && guest > 0 && <div className="workspace-card"><h2>Записи без профиля: {guest}</h2><p>На этом телефоне есть локальные записи. Перенесите их в текущий профиль, если они ваши.</p><button className="secondary-button" disabled={disabled} onClick={() => void act(async () => { await importGuest(); if (online) await syncNow(); })}>Перенести в мой профиль</button></div>}
    {conflicts.map(r => <ConflictCard key={`${r.id}:${r.localRevision}:${r.conflict!.version}`} row={r} disabled={disabled} onChoose={choice => void act(async () => { await resolveConflict(r, choice); if (online) await syncNow(); })}/>)}
    <Notice error>{error || rowsError}</Notice>
    <p className="page-description">Фото и аудио загружаются вместе с записями. Если браузер закрыт и не поддерживает фоновую отправку, синхронизация продолжится при следующем открытии.</p>
  </Page>;
}
function ConflictCard({ row, disabled, onChoose }: { row: Row; disabled: boolean; onChoose: (choice: 'local' | 'remote') => void }) {
  const remote = row.conflict!;
  const differences = changedRecordFields(row.data, remote.data, row.deleted, remote.deleted);
  function download() {
    const file = new Blob([JSON.stringify({ kind: row.kind, local: { data: row.data, deleted: row.deleted }, server: { data: remote.data, deleted: remote.deleted } }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file), a = document.createElement('a'); a.href = url; a.download = 'egin-conflict-versions.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  return <section className="workspace-card conflict-card"><span className="sync-kind">{kindLabel[row.kind]} · {recordTitle(row.kind, row.data)}</span><h2>Разные версии записи</h2><p>Сравните обе версии. Выбранная сохранится в профиле. Обе копии можно скачать перед выбором.</p>
    {differences.length > 0 && <p className="sync-differences">Отличаются: {differences.join(', ')}.</p>}
    <div className="sync-versions">{[{ title: 'На телефоне', data: row.data, deleted: row.deleted }, { title: 'На сервере', data: remote.data, deleted: remote.deleted }].map((version, i) => {
      const other = conflictFacts(row.kind, i === 0 ? remote.data : row.data, i === 0 ? remote.deleted : row.deleted);
      return <section key={version.title} className="sync-version"><h3><Icon name={i === 0 ? 'phone' : 'cloud'} size={17}/>{version.title}</h3><dl>{conflictFacts(row.kind, version.data, version.deleted).map(fact => <div key={fact.label} className={other.find(f => f.label === fact.label)?.value !== fact.value ? 'is-different' : ''}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></section>;
    })}</div>
    <button className="text-button" onClick={download}><Icon name="share" size={16}/>Скачать обе версии</button>
    <button className="secondary-button" disabled={disabled} onClick={() => onChoose('local')}>Оставить версию телефона</button><button className="secondary-button" disabled={disabled} onClick={() => onChoose('remote')}>Принять версию сервера</button>
  </section>;
}
