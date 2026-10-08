import { useEffect, useRef, useState } from 'react';
import { api, humanError } from '../../entities/workspace/api';
import { syncNow, useMeta } from '../../entities/workspace/hooks';
import type { SessionUser } from '../../entities/workspace/types';
import { Page, Notice, LinkRow } from '../workspace/ui';
import './services.css';
import './one-c.css';

type Crop = 'wheat'|'tomato'|'apple'|'sunflower';
type Mapping = {kind:'field'|'entry';collection:string;id:string;fields:Record<string,string>;cropDefault?:Crop;areaUnit?:'ha'|'m2'};
type Run = {id:string;created:string|number;status:string;createdCount:number;updatedCount:number;unchangedCount:number;skippedCount:number;error?:string;issues:{sourceId?:string;message:string}[]};
export type OneCState = {connection:null|{endpoint:string;username:string;version:number;status:'connected'|'error';checkedAt:string|number;lastError?:string;collections:{name:string;title?:string}[];mapping:Mapping|null;scheduleMinutes:number;lastRunAt?:string|number};runs:Run[]};
type Schema = {properties:{name:string;type:string}[];sample:Record<string,unknown>[]};
type Preview = {previewId:string;expiresAt:string|number;summary:{created:number;updated:number;unchanged:number;skipped:number};rows:{sourceId:string;action:'create'|'update'|'unchanged'|'skip';data?:Record<string,unknown>;reason?:string}[];total:number};
const crops:{id:Crop;name:string}[]=[{id:'wheat',name:'Пшеница'},{id:'tomato',name:'Томаты'},{id:'apple',name:'Яблоня'},{id:'sunflower',name:'Подсолнечник'}];
const fieldColumns = [{id:'name',title:'Название участка',required:true},{id:'area',title:'Площадь',required:true},{id:'latitude',title:'Широта',required:true},{id:'longitude',title:'Долгота',required:true},{id:'crop',title:'Культура',required:false}];
const entryColumns = [{id:'title',title:'Заголовок записи',required:true},{id:'date',title:'Дата',required:true},{id:'text',title:'Текст записи',required:false},{id:'fieldId',title:'ID участка или ссылка 1С',required:false}];
const date = (value:string|number|undefined)=>value?new Date(value).toLocaleString('ru-RU'):'Ещё не было';
const stable = (value:unknown):string => JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const actionNames = {create:'Добавить',update:'Обновить',unchanged:'Без изменений',skip:'Пропустить'};

export default function OneCPage(){
  const user=useMeta<SessionUser|null>('user',null);
  return <OneCContent key={user?.id||'guest'} user={user}/>;
}
function OneCContent({user}:{user:SessionUser|null}){
  const [state,setState]=useState<OneCState>({connection:null,runs:[]}),[loading,setLoading]=useState(!!user),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(''),[authRequired,setAuthRequired]=useState(false),[online,setOnline]=useState(navigator.onLine);
  const [endpoint,setEndpoint]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [collection,setCollection]=useState(''),[kind,setKind]=useState<'field'|'entry'>('field'),[id,setId]=useState(''),[fields,setFields]=useState<Record<string,string>>({}),[cropDefault,setCropDefault]=useState<Crop|''>(''),[areaUnit,setAreaUnit]=useState<'ha'|'m2'>('ha'),[schedule,setSchedule]=useState(0);
  const [schema,setSchema]=useState<Schema|null>(null),[schemaLoading,setSchemaLoading]=useState(false),[schemaError,setSchemaError]=useState(''),[schemaRetry,setSchemaRetry]=useState(0),[preview,setPreview]=useState<Preview|null>(null),[confirmDisconnect,setConfirmDisconnect]=useState(false);
  const alive=useRef(true),connection=state.connection;
  function apply(data:OneCState,reset=false){
    if(!alive.current)return;
    setState(data);
    if(reset){const c=data.connection,m=c?.mapping;setEndpoint(c?.endpoint||'');setUsername(c?.username||'');setCollection(m?.collection||'');setKind(m?.kind||'field');setId(m?.id||'');setFields(m?.fields||{});setCropDefault(m?.cropDefault||'');setAreaUnit(m?.areaUnit||'ha');setSchedule(c?.scheduleMinutes||0);setPreview(null);}
  }
  async function refresh(reset=false){const data=await api<OneCState>('/one-c');apply(data,reset);}
  function failure(e:unknown){if(!alive.current)return;setError(humanError(e));if((e as {status?:number})?.status===401)setAuthRequired(true);}
  async function act(name:string,fn:()=>Promise<void>){setBusy(name);setError('');setMessage('');try{await fn();}catch(e){failure(e);if(name==='sync'||name==='import'||name==='preview'||name==='connect')await refresh().catch(()=>{});}finally{if(alive.current)setBusy('');}}
  useEffect(()=>{
    alive.current=true;
    const visibility=()=>{if(document.hidden)setPassword('');},network=()=>setOnline(navigator.onLine);
    document.addEventListener('visibilitychange',visibility);window.addEventListener('online',network);window.addEventListener('offline',network);
    if(user)void refresh(true).catch(failure).finally(()=>{if(alive.current)setLoading(false);});
    return()=>{alive.current=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',network);window.removeEventListener('offline',network);};
  },[]);
  useEffect(()=>{
    let active=true;setSchema(null);setSchemaError('');
    if(!collection||!connection){setSchemaLoading(false);return;}
    setSchemaLoading(true);
    api<Schema>('/one-c/schema?collection='+encodeURIComponent(collection),undefined,'GET',120000).then(data=>{if(active){setSchema(data);setId(current=>current||(data.properties.some(p=>p.name==='Ref_Key')?'Ref_Key':''));}}).catch(e=>{if(active){setSchemaError(humanError(e));if((e as {status?:number})?.status===401)setAuthRequired(true);}}).finally(()=>{if(active)setSchemaLoading(false);});
    return()=>{active=false;};
  },[collection,connection?.endpoint,connection?.username,schemaRetry]);
  const mapping:Mapping={kind,collection,id,fields:Object.fromEntries(Object.entries(fields).filter(([,value])=>value)),...(kind==='field'?{areaUnit,...(cropDefault?{cropDefault}:{})}:{})};
  const mappingDirty=stable(mapping)!==stable(connection?.mapping)||schedule!==(connection?.scheduleMinutes||0);
  const columns=kind==='field'?fieldColumns:entryColumns;
  const mappingValid=collection&&id&&schema&&!schemaLoading&&columns.filter(c=>c.required).every(c=>fields[c.id])&&(kind!=='field'||fields.crop||cropDefault);
  const disabled=!!busy||!online||authRequired;
  function changeMapping(){setPreview(null);setMessage('');}
  async function afterImport(run:Run){
    setPreview(null);
    if(run.status==='error'){setError(run.error||'Обмен не выполнен. Подробности в истории ниже.');}else{setMessage(`Обмен ${run.status==='partial'?'завершён с замечаниями':'завершён'}: добавлено ${run.createdCount}, обновлено ${run.updatedCount}, без изменений ${run.unchangedCount}, пропущено ${run.skippedCount}.`);}
    await refresh();await syncNow();
  }
  if(!user)return <Page title="1С:ERP АПК" back="/settings/services"><p className="page-description">Подключите свою базу 1С и перенесите участки или записи в EGIN.</p><LinkRow href="/auth" title="Войти для подключения" description="Данные и доступ к 1С будут привязаны к вашему профилю" icon="lock"/></Page>;
  return <Page title="1С:ERP АПК" back="/settings/services">
    <div className="one-c-intro"><span className="service-mark" aria-hidden="true">1С</span><div><h2>Ваши данные из 1С</h2><p>Участки и журнал · OData</p></div></div>
    <p className="page-description">Подключите HTTPS-публикацию своей базы, выберите данные и проверьте результат перед импортом. EGIN читает 1С, не изменяя её записи.</p>
    {!online&&<Notice>Для подключения и обмена нужна сеть.</Notice>}
    <div role="status" aria-live="polite"><Notice error>{error}</Notice><Notice>{message}</Notice></div>
    {authRequired&&<LinkRow href="/auth" title="Войти заново" description="Сессия завершилась. Подключение остаётся в вашем профиле." icon="lock"/>}
    {loading?<Notice>Загружаем подключение…</Notice>:<>
      {error&&!connection&&<button className="text-button" disabled={disabled} onClick={()=>void act('refresh',()=>refresh(true))}>Повторить загрузку настроек</button>}
      {connection&&<section className="workspace-card one-c-status"><span className="one-c-eyebrow">Подключение</span><h2>{connection.status==='connected'?'Доступ к базе настроен':'Подключение требует внимания'}</h2><p className="one-c-address">{connection.endpoint}</p><dl className="settings-facts"><div><dt>Пользователь</dt><dd>{connection.username}</dd></div><div><dt>Проверка доступа</dt><dd>{date(connection.checkedAt)}</dd></div><div><dt>Последний обмен</dt><dd>{date(connection.lastRunAt)}</dd></div></dl>{connection.lastError&&<Notice error>{connection.lastError}</Notice>}</section>}
      <details className="workspace-card one-c-connect" open={!connection}>
        <summary>{connection?'Изменить доступ к базе':'1. Подключить базу'}</summary>
        <form className="workspace-form" onSubmit={e=>{e.preventDefault();void act('connect',async()=>{try{const next=await api<OneCState>('/one-c/connect',{endpoint: endpoint.trim(),username:username.trim(),...(password?{password}:{}),version:connection?.version||0},'POST',120000);apply(next,true);setSchemaRetry(n=>n+1);setMessage('Доступ проверен и сохранён. Выберите справочник или документ для импорта.');}finally{setPassword('');}});}}>
          <fieldset disabled={disabled}>
            <label>Адрес OData<input type="url" required value={endpoint} onChange={e=>{setEndpoint(e.target.value);setPassword('');}} placeholder="https://1c.example.kz/base/odata/standard.odata/" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={1024}/></label>
            <label>Пользователь 1С<input required value={username} onChange={e=>{setUsername(e.target.value);setPassword('');}} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={200}/></label>
            <label>Пароль<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required={!connection||endpoint.trim()!==connection.endpoint||username.trim()!==connection.username} placeholder={connection?'Оставьте пустым, чтобы сохранить текущий':''} autoComplete="off" maxLength={1024}/></label>
            <p className="form-help">Используйте отдельного пользователя 1С с доступом только на чтение. Пароль хранится на сервере в зашифрованном виде для повторного обмена. На телефоне он не сохраняется.</p>
            <button className="primary-button">{busy==='connect'?'Проверяем публикацию…':connection?'Проверить и сохранить':'Подключить 1С'}</button>
          </fieldset>
        </form>
      </details>
      {!connection&&<section className="workspace-card"><h2>Где взять адрес</h2><p>Нужна публикация именно вашей базы 1С. Попросите администратора включить стандартный OData-интерфейс по HTTPS и предоставить пользователя только для чтения.</p><a className="text-button" href="https://kb.1ci.com/1C_Enterprise_Platform/FAQ/Development/Integration/Publishing_standard_REST_API_for_your_infobase/" target="_blank" rel="noopener noreferrer">Документация 1С</a></section>}
      {connection&&<>
        <section className="workspace-card"><h2>2. Выбрать данные</h2><p>Настраивается один поток: участки или журнал. Смена настройки не удаляет ранее импортированные записи.</p>
          <div className="workspace-form"><fieldset disabled={disabled}>
            <label>Справочник или документ<select value={collection} onChange={e=>{setCollection(e.target.value);setFields({});setId('');setCropDefault('');changeMapping();}}><option value="">Выберите из базы 1С</option>{connection.collections.map(c=><option value={c.name} key={c.name}>{c.title||c.name}</option>)}</select></label>
            <label>Куда импортировать<select value={kind} onChange={e=>{setKind(e.target.value as 'field'|'entry');setFields({});setCropDefault('');changeMapping();}}><option value="field">Участки EGIN</option><option value="entry">История участка EGIN</option></select></label>
          </fieldset></div>
          {schemaLoading&&<Notice>Читаем структуру и пример данных…</Notice>}
          {schemaError&&<><Notice error>{schemaError}</Notice><button className="text-button" disabled={disabled} onClick={()=>setSchemaRetry(n=>n+1)}>Повторить чтение</button></>}
          {schema&&<details className="one-c-sample"><summary>Пример из 1С · {schema.sample.length} записей</summary>{schema.sample.length?<div className="one-c-sample-list">{schema.sample.map((row,index)=><pre key={index}>{JSON.stringify(row,null,2)}</pre>)}</div>:<p>В выбранном объекте пока нет записей. Структура доступна для настройки.</p>}</details>}
        </section>
        {schema&&<form className="workspace-card workspace-form" onSubmit={e=>{e.preventDefault();void act('mapping',async()=>{apply(await api<OneCState>('/one-c/mapping',{version:connection.version,mapping,scheduleMinutes:schedule},'PUT'),true);setMessage('Соответствия сохранены. Проверьте данные перед первым импортом.');});}}>
          <h2>3. Сопоставить реквизиты</h2><p>Слева — данные EGIN. В каждом списке выберите соответствующий реквизит вашей 1С.</p><fieldset disabled={disabled}>
            <label>Постоянный ID записи · обязательно<select required value={id} onChange={e=>{setId(e.target.value);changeMapping();}}><option value="">Выберите реквизит</option>{schema.properties.map(p=><option key={p.name} value={p.name}>{p.name} · {p.type}</option>)}</select><span className="form-help">Обычно Ref_Key. Он позволяет обновлять записи без создания дубликатов.</span></label>
            {columns.map(column=><label key={column.id}>{column.title}{column.required?' · обязательно':' · необязательно'}<select required={column.required} value={fields[column.id]||''} onChange={e=>{setFields(current=>({...current,[column.id]:e.target.value}));if(column.id==='crop'&&e.target.value)setCropDefault('');changeMapping();}}><option value="">{column.required?'Выберите реквизит':'Не переносить'}</option>{schema.properties.map(p=><option key={p.name} value={p.name}>{p.name} · {p.type}</option>)}</select></label>)}
            {kind==='field'&&<><label>Единица площади<select value={areaUnit} onChange={e=>{setAreaUnit(e.target.value as 'ha'|'m2');changeMapping();}}><option value="ha">Гектары</option><option value="m2">Квадратные метры → в гектары</option></select></label>{!fields.crop&&<label>Культура для всех импортируемых участков<select required value={cropDefault} onChange={e=>{setCropDefault(e.target.value as Crop|'');changeMapping();}}><option value="">Выберите культуру</option>{crops.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>}<p className="form-help">Координаты должны быть в десятичных градусах. Для культуры поддерживаются пшеница, томаты, яблоня и подсолнечник. Неподдерживаемые или неполные записи будут показаны как пропущенные.</p></>}
            {kind==='entry'&&<p className="form-help">Ссылка на участок необязательна. Подойдёт ID участка EGIN или постоянный ID участка 1С, уже импортированного из этой же публикации.</p>}
            <label>Повторный обмен<select value={schedule} onChange={e=>{setSchedule(Number(e.target.value));changeMapping();}}><option value={0}>Только вручную</option><option value={60}>Каждый час</option><option value={360}>Каждые 6 часов</option><option value={1440}>Раз в сутки</option></select></label>
            {schedule>0&&<Notice>После сохранения EGIN будет автоматически читать выбранные данные и применять изменения, даже когда приложение закрыто.</Notice>}
            <button className="secondary-button" disabled={!mappingValid||disabled}>{busy==='mapping'?'Сохраняем…':'Сохранить соответствия'}</button>
          </fieldset>
        </form>}
        {connection.mapping&&<section className="workspace-card"><h2>4. Проверить и импортировать</h2><p>Сначала покажем новые, изменённые и пропущенные записи. Импорт обновляет только ранее связанные с 1С данные; проверьте изменения перед подтверждением.</p>
          {mappingDirty&&<Notice>Сохраните текущие соответствия перед просмотром и обменом.</Notice>}
          <div className="one-c-actions"><button className="primary-button" disabled={disabled||mappingDirty||schemaLoading} onClick={()=>void act('preview',async()=>{setPreview(null);setPreview(await api<Preview>('/one-c/preview',{version:connection.version},'POST',120000));})}>{busy==='preview'?'Читаем и сравниваем…':'Проверить данные'}</button>
          <button className="secondary-button" disabled={disabled||mappingDirty||!state.runs.some(run=>run.status==='success'||run.status==='partial')} onClick={()=>void act('sync',async()=>{const result=await api<{run:Run}>('/one-c/sync',{version:connection.version},'POST',120000);await afterImport(result.run);})}>{busy==='sync'?'Выполняем обмен…':'Повторить обмен сейчас'}</button></div>
          <p className="form-help">Повторный обмен сразу применяет изменения по сохранённой настройке. Для проверки перед применением используйте «Проверить данные».</p>
          {preview&&<div className="one-c-preview"><h3>Результат проверки · {preview.total} записей</h3><div className="one-c-counts"><span><strong>{preview.summary.created}</strong>Новых</span><span><strong>{preview.summary.updated}</strong>Изменённых</span><span><strong>{preview.summary.unchanged}</strong>Без изменений</span><span><strong>{preview.summary.skipped}</strong>Пропущено</span></div><p className="form-help">Проверка действует до {date(preview.expiresAt)}. Ниже первые {preview.rows.length} записей.</p><div className="one-c-preview-rows">{preview.rows.map((row,index)=><details key={row.sourceId+':'+index}><summary><span className="one-c-row-action">{actionNames[row.action]}</span><span>{String(row.data?.name||row.data?.title||row.sourceId||'Без ID')}</span></summary>{row.reason&&<p>{row.reason}</p>}{row.data&&<pre>{JSON.stringify(row.data,null,2)}</pre>}</details>)}</div><button className="primary-button" disabled={disabled||mappingDirty||preview.summary.created+preview.summary.updated===0} onClick={()=>void act('import',async()=>{const result=await api<{run:Run}>('/one-c/import',{previewId:preview.previewId},'POST',120000);await afterImport(result.run);})}>{busy==='import'?'Импортируем…':`Импортировать ${preview.summary.created+preview.summary.updated} записей`}</button></div>}
        </section>}
        <section className="workspace-card"><h2>История обмена</h2>{state.runs.length?state.runs.map(run=><details className="one-c-run" key={run.id}><summary><span>{date(run.created)}</span><strong>{run.status==='success'?'Завершён':run.status==='error'?'Ошибка':'Завершён с замечаниями'}</strong></summary><p>Добавлено {run.createdCount} · обновлено {run.updatedCount} · без изменений {run.unchangedCount} · пропущено {run.skippedCount}</p>{run.error&&<Notice error>{run.error}</Notice>}{!!run.issues?.length&&<ul>{run.issues.map((issue,index)=><li key={index}>{issue.sourceId&&<code>{issue.sourceId}: </code>}{issue.message}</li>)}</ul>}</details>):<p>Обмена ещё не было. Начните с проверки данных.</p>}</section>
        <LinkRow href="/settings/sync" title="Данные на этом телефоне" description="Синхронизация и разрешение конфликтов локальных записей" icon="cloud"/>
        {confirmDisconnect?<section className="delete-confirm"><p>Отключить 1С? Сохранённый доступ и расписание будут удалены. Импортированные участки и записи останутся в EGIN.</p><button className="secondary-button" disabled={disabled} onClick={()=>void act('disconnect',async()=>{await api('/one-c',{version:connection.version},'DELETE');apply({connection:null,runs:[]},true);setPassword('');setConfirmDisconnect(false);setMessage('1С отключена. Импортированные данные сохранены.');})}>Отключить и удалить доступ</button><button className="text-button" disabled={!!busy} onClick={()=>setConfirmDisconnect(false)}>Отмена</button></section>:<button className="text-button" disabled={disabled} onClick={()=>setConfirmDisconnect(true)}>Отключить 1С</button>}
      </>}
    </>}
  </Page>;
}
