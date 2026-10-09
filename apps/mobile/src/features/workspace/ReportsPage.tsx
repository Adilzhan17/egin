import { Capacitor } from '@capacitor/core';
import { useEffect, useRef, useState } from 'react';
import { download, nativeShare } from '../../shared/lib/files';
import { useMeta, useRows } from '../../entities/workspace/hooks';
import { localAsset, owner } from '../../entities/workspace/db';
import type { Entry, Field } from '../../entities/workspace/types';
import { humanError } from '../../entities/workspace/api';
import { Page, Notice } from './ui';
import { Icon } from '../../shared/ui/Icon';
import { createReport, type ReportFormat } from './report-export';
import './reports.css';
export { escapeHTML, csvCell } from './report-export';

const dataURL = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export default function ReportsPage() {
  const workspaceOwner = useMeta('owner', 'guest');
  return <ReportsContent key={workspaceOwner} workspaceOwner={workspaceOwner}/>;
}
function ReportsContent({ workspaceOwner }: { workspaceOwner: string }) {
  const { rows, error: historyError } = useRows<Entry>('entry'), { rows: fields, error: fieldsError } = useRows<Field>('field');
  const [field, setField] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [format, setFormat] = useState<ReportFormat>('html'), [media, setMedia] = useState(true), [history, setHistory] = useState(true);
  const [file, setFile] = useState<File>(), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const generation = useRef(0), mounted = useRef(true);
  const selectedFields = fields.filter(f => !field || f.id === field);
  const selected = rows.filter(r => (!field || r.data.fieldId === field) && (!from || r.data.date >= from) && (!to || r.data.date <= to)).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const includesHistory = format === 'csv' || (format !== 'csv-fields' && history);
  const historyCount = includesHistory ? selected.length : 0;
  const fieldCount = format === 'csv' ? 0 : selectedFields.length;
  const signature = [...rows, ...fields].map(r => `${r.id}:${r.localRevision}:${r.version}:${r.updated}`).sort().join('|');
  function invalidate() { generation.current++; setFile(undefined); setMessage(''); setError(''); }
  useEffect(() => { invalidate(); }, [signature]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
  async function assertOwner() { if (!mounted.current || await owner() !== workspaceOwner) throw new Error('Профиль изменился. Сформируйте отчёт заново.'); }

  async function build() {
    if (busy) return;
    setError(''); setMessage(''); setFile(undefined); setBusy(true);
    const request = generation.current;
    try {
      await assertOwner();
      if (includesHistory && from && to && from > to) throw new Error('Дата начала должна быть раньше окончания');
      if (!fieldCount && !historyCount) throw new Error('Нет данных для выбранного отчёта');
      const assets: Record<string, string> = {};
      let totalBytes = 0;
      if (media && includesHistory && !format.startsWith('csv')) {
        for (const id of new Set(selected.flatMap(r => r.data.assets))) {
          await assertOwner();
          const asset = await localAsset(id);
          if (!asset) throw new Error('Некоторые вложения ещё не загружены. Синхронизируйте или выключите вложения.');
          totalBytes += asset.blob.size;
          if (totalBytes > 20 * 1024 * 1024) throw new Error('Вложения отчёта превышают 20 МБ. Сузьте период или отключите вложения.');
          assets[id] = await dataURL(asset.blob);
        }
      }
      await assertOwner();
      if (request !== generation.current) throw new Error('Данные обновились во время подготовки. Сформируйте отчёт ещё раз.');
      const result = createReport({ fields: selectedFields.map(f => ({ id: f.id, ...f.data })), entries: includesHistory ? selected.map(r => ({ id: r.id, ...r.data })) : [], exportedAt: new Date().toISOString(), from: includesHistory ? from : '', to: includesHistory ? to : '', attachments: assets }, format);
      const report = new File([result.content], `EGIN-${format === 'csv' ? 'история' : 'участки'}-${new Date().toISOString().slice(0, 10)}.${result.extension}`, { type: result.mime });
      setFile(report); setMessage(`Отчёт готов · ${Math.round(report.size / 1024) || 1} КБ`);
    } catch (e) { if (mounted.current) setError(humanError(e)); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function deliver(share: boolean) {
    if (!file) return;
    setError('');
    try {
      await assertOwner();
      if (!share) await download(file, file.name);
      else if (Capacitor.isNativePlatform()) { await nativeShare(file, file.name); setMessage('Открыто меню отправки'); }
      else if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Отчёт EGIN' }); setMessage('Отчёт передан в меню «Поделиться»'); }
      else { await download(file, file.name); setMessage('Отправка файлов недоступна в этом браузере. Файл скачан — отправьте его из папки загрузок.'); }
    } catch (e) { if (mounted.current && (e as Error).name !== 'AbortError') setError(humanError(e)); }
  }
  const unsynced = [...(format === 'csv' ? [] : selectedFields), ...(includesHistory ? selected : [])].filter(r => r.dirty || r.conflict).length;
  return <Page title="Отчёты и экспорт">
    <p className="page-description">Паспорта участков, границы и сохранённая история в одном файле. Можно подготовить без интернета и отправить коллеге.</p>
    <section className="report-overview" aria-label="Состав отчёта"><Icon name="journal" size={25}/><div><h2>{format === 'csv' ? 'История участков' : 'Отчёт по участкам'}</h2><p>{fieldCount} участков · {historyCount} записей</p><small>{format.startsWith('csv') ? 'Таблица для Excel' : 'Сведения ЕГКН и схема границ — если они сохранены'}</small></div></section>
    <div className="workspace-form">
      <fieldset className="report-options" disabled={busy}>
        <label>Участок<select aria-label="Участок" value={field} onChange={e => { setField(e.target.value); invalidate(); }}><option value="">Все участки</option>{fields.map(f => <option key={f.id} value={f.id}>{f.data.name}{f.data.cadastre?.source === 'demo' ? ' · демо' : ''}</option>)}</select></label>
        <label>Формат<select aria-label="Формат" value={format} onChange={e => { setFormat(e.target.value as ReportFormat); invalidate(); }}><option value="html">HTML — наглядный отчёт и печать</option><option value="csv-fields">CSV — таблица участков</option><option value="csv">CSV — таблица истории</option><option value="json">JSON — данные, границы и вложения</option></select></label>
        {!format.startsWith('csv') && <label className="checkbox-row"><input type="checkbox" checked={history} onChange={e => { setHistory(e.target.checked); invalidate(); }}/>Добавить сохранённую историю</label>}
        {includesHistory && <><p className="form-help">Период применяется к записям истории. Паспорта содержат последние сохранённые сведения.</p><div className="form-columns"><label>С даты<input type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); invalidate(); }}/></label><label>По дату<input type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); invalidate(); }}/></label></div></>}
        {includesHistory && !format.startsWith('csv') && <label className="checkbox-row"><input type="checkbox" checked={media} onChange={e => { setMedia(e.target.checked); invalidate(); }}/>Включить фото и аудио · до 20 МБ</label>}
      </fieldset>
      {format === 'html' && <p className="form-help">Для PDF откройте скачанный HTML и выберите «Печать → Сохранить как PDF».</p>}
      {includesHistory && <p className="form-help">Погодные события и состояние подключений не входят в архивный отчёт.</p>}
      {unsynced > 0 && <Notice>Есть несинхронизированные данные ({unsynced}). В отчёт попадёт версия с этого устройства.</Notice>}
      {fieldCount > 0 && selectedFields.some(f => f.data.cadastre?.source === 'demo') && <Notice>Демонстрационные участки будут явно помечены в отчёте.</Notice>}
      {!fieldCount && !historyCount && <div className="report-empty"><p>{format === 'csv' ? 'В выбранном периоде нет сохранённых записей. Выберите таблицу участков, чтобы выгрузить паспорта.' : 'Добавьте участок на карте, чтобы подготовить его паспорт.'}</p>{format !== 'csv' && <a className="secondary-button" href="#/fields"><Icon name="map" size={18}/>К участкам</a>}</div>}
      <button className="primary-button" disabled={busy || (!fieldCount && !historyCount) || !!historyError || !!fieldsError} onClick={() => void build()}>{busy ? 'Формируем отчёт…' : 'Сформировать отчёт'}</button>
      <Notice error>{error || historyError || fieldsError}</Notice><Notice>{message}</Notice>
      {file && <div className="report-actions"><button className="secondary-button" onClick={() => void deliver(false)}><Icon name="down" size={18}/>{Capacitor.isNativePlatform() ? 'Сохранить файл' : 'Скачать файл'}</button><button className="secondary-button" onClick={() => void deliver(true)}><Icon name="share" size={18}/>Поделиться</button><small className="form-help">Файл содержит адреса, границы и выбранные записи. Отправляйте его тем, кому нужен доступ к этим сведениям.</small></div>}
    </div>
  </Page>;
}
