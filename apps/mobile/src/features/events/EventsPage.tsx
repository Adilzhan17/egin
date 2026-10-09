import { useEffect, useState } from 'react';
import type { WeatherState } from '../../entities/weather/use-weather';
import { useMeta, useRows } from '../../entities/workspace/hooks';
import { all, owner } from '../../entities/workspace/db';
import { api, humanError } from '../../entities/workspace/api';
import type { Data, Field, Row, SessionUser } from '../../entities/workspace/types';
import { Icon } from '../../shared/ui/Icon';
import { Sheet } from '../../shared/ui/Sheet';
import { SavedAsset } from '../workspace/media';
import { Empty, LinkRow, Notice, Page } from '../workspace/ui';
import { buildEvents, eventSources, filterEvents, type ExchangeState, type FieldEvent } from './events';
import './events.css';

export default function EventsPage(props:{weather:WeatherState;activeField?:Row<Field>}) {
  const user=useMeta<SessionUser|null>('user',null);
  return <EventFeed key={user?.id||'guest'} {...props} user={user}/>;
}
function useEventRows(expectedOwner:string) {
  const [rows,setRows]=useState<Row<Data>[]>([]),[error,setError]=useState('');
  useEffect(()=>{
    let active=true,request=0;
    async function load(){
      const ticket=++request;
      try {
        const who=await owner(),saved=await all<Row<Data>>('records'),currentOwner=await owner();
        if(active&&ticket===request){setRows(who===currentOwner&&who===expectedOwner?saved.filter(row=>row.owner===who):[]);setError('');}
      } catch(e){if(active&&ticket===request)setError(humanError(e));}
    }
    void load();window.addEventListener('egin-data',load);
    return()=>{active=false;window.removeEventListener('egin-data',load);};
  },[expectedOwner]);
  return {rows,error};
}
function EventFeed({weather,activeField:storedActiveField,user}:{weather:WeatherState;activeField?:Row<Field>;user:SessionUser|null}) {
  const expectedOwner=user?.id||'guest';
  const activeField=storedActiveField?.owner===expectedOwner?storedActiveField:undefined;
  const {rows,error}=useEventRows(expectedOwner),{rows:storedFields}=useRows<Field>('field');
  const fields=storedFields.filter(field=>field.owner===expectedOwner);
  const [exchange,setExchange]=useState<ExchangeState|null>(null),[exchangeError,setExchangeError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[now,setNow]=useState(Date.now());
  const [source,setSource]=useState(''),[severity,setSeverity]=useState(''),[fieldId,setFieldId]=useState(''),[opened,setOpened]=useState<string|null>(null),[query,setQuery]=useState(''),[limit,setLimit]=useState(30);
  useEffect(()=>{let active=true;if(!user){setExchange(null);return;}setLoading(true);void api<ExchangeState>('/one-c').then(data=>{if(active){setExchange(data);setExchangeError('');}}).catch(e=>{if(active){if((e as {status?:number}).status===401)setExchange(null);setExchangeError((e as {status?:number}).status===401?'Войдите заново, чтобы видеть события 1С.':humanError(e));}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[user?.id,revision]);
  useEffect(()=>{const update=()=>{if(!document.hidden){setNow(Date.now());setRevision(n=>n+1);}};const timer=setInterval(update,60000);window.addEventListener('online',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};},[]);
  useEffect(()=>setLimit(30),[source,severity,fieldId,query]);
  useEffect(()=>{if(fieldId&&!fields.some(field=>field.id===fieldId))setFieldId('');},[fields,fieldId]);
  const events=buildEvents({rows,report:weather.report,activeField,exchange,now,cached:weather.cached,exchangeCached:!!exchangeError}),matching=filterEvents(events,{source,fieldId,query}),filtered=filterEvents(matching,{severity}),selected=events.find(e=>e.id===opened),attention=matching.filter(e=>e.severity==='attention').length,hasFilters=!!(source||severity||fieldId||query.trim());
  function resetFilters(){setSource('');setSeverity('');setFieldId('');setQuery('');}
  const weatherEvent=events.find(event=>event.source==='weather');
  function refresh(){weather.refresh();setNow(Date.now());setRevision(n=>n+1);}
  function when(event:FieldEvent){return event.at?new Date(event.at).toLocaleString('ru-RU',event.source==='history'?{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}:{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Время не указано';}
  return <Page title="Центр событий" back="/" action={<button className="icon-button" aria-label="Обновить события" disabled={loading||weather.loading} onClick={refresh}><Icon name="rotate"/></button>}>
    <section className="events-intro"><span className="eyebrow">Состояние и история</span><h2>Всё важное об участке</h2><p>Погода, обмен данными и сохранённая история. События появляются из доступных источников.</p></section>
    <div className="event-view-switch" role="group" aria-label="Важность событий"><button aria-pressed={!severity} onClick={()=>setSeverity('')}>Все события <span>{matching.length}</span></button><button aria-pressed={severity==='attention'} onClick={()=>setSeverity('attention')}>Внимание <span>{attention}</span></button></div>
    <label className="event-search"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></svg><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Найти в событиях" aria-label="Поиск по событиям"/></label>
    <div className="events-filters workspace-form"><label>Источник<select value={source} onChange={e=>setSource(e.target.value)}><option value="">Все источники</option>{Object.entries(eventSources).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><label>Участок<select value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">Все участки</option>{fields.map(field=><option key={field.id} value={field.id}>{field.data.name}</option>)}</select></label></div>
    <div className="event-results"><span role="status">Событий: {filtered.length}</span>{hasFilters&&<button className="text-button" onClick={resetFilters}>Сбросить фильтры</button>}</div>
    <Notice error>{error}</Notice><Notice error>{exchangeError}</Notice>
    {exchangeError&&<button className="text-button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Повторить загрузку событий 1С</button>}
    <div aria-live="polite">{loading&&<Notice>Обновляем историю обмена…</Notice>}</div>
    {!filtered.length&&!loading&&<Empty icon="bell" title={hasFilters?'Нет событий с такими фильтрами':'Источники ещё не прислали события'}>{hasFilters?'Измените запрос или сбросьте фильтры, чтобы увидеть остальные события.':'Добавьте участок на карте и подключите сервисы. Здесь появятся данные по мере их поступления.'}</Empty>}
    <div className="event-feed">{filtered.slice(0,limit).map(event=><article className={`event-card ${event.severity==='attention'?'needs-attention':''}`} key={event.id}><div className="event-top"><span className="event-source"><Icon name={event.icon} size={18}/>{eventSources[event.source]}</span>{event.severity==='attention'&&<span className="event-priority">Внимание</span>}</div><h2>{event.title}</h2><p>{event.description}</p><div className="event-meta"><time dateTime={event.at||undefined}>{event.timeLabel?event.timeLabel+' · ':''}{when(event)}</time><span>{event.fieldId?fields.find(f=>f.id===event.fieldId)?.data.name||'Участок недоступен':'Общее событие'}</span></div><div className="event-actions"><a href={'#'+event.href}>{event.action}<Icon name="right" size={16}/></a>{(event.details?.length||event.assets?.length||event.description.length>180)?<button onClick={()=>setOpened(event.id)}>{event.assets?.length?`Материалы · ${event.assets.length}`:'Подробнее'}</button>:null}</div></article>)}</div>
    {filtered.length>limit&&<button className="secondary-button event-load-more" onClick={()=>setLimit(value=>value+30)}>Показать ещё · осталось {filtered.length-limit}</button>}
    {!events.length&&!loading&&!hasFilters&&<a className="secondary-button event-load-more" href="#/fields">Добавить участок<Icon name="right" size={18}/></a>}
    <section className="events-sources"><h2>Доступность источников</h2><p>Отсутствие событий не означает, что на участке всё в норме.</p>{!activeField?<LinkRow href="/fields" icon="map" title="Выбрать участок" description="Погода для примерной точки не попадает в события ваших земель"/>:<LinkRow href="/weather" icon="cloud" title={`Погода · ${activeField.data.name}`} description={weather.error||(!weatherEvent?(weather.loading?'Загружаем прогноз для выбранного участка.':'Нет прогноза для этой точки. Откройте погоду и обновите данные.'):`${weatherEvent.title}. Другие участки проверяются после выбора на карте.`)}/>}<LinkRow href="/settings/sensors" icon="layers" title="Измерения датчиков" description="Реестр доступен; приём телеметрии пока в разработке"/><LinkRow href={user?'/settings/services/one-c':'/auth'} icon="connections" title={user?'Обмен с 1С':'Войти для событий 1С'} description={user?(exchangeError?'Обновление недоступно. Показана ранее загруженная история, если она есть.':loading?'Обновляем состояние подключения…':exchange?.connection?'История обмена и ошибки подключения':'Подключите базу, чтобы получать события обмена'):'Локальная история доступна без входа'}/></section>
    {selected&&<Sheet title={selected.title} onClose={()=>setOpened(null)}><p className="event-detail-copy">{selected.description}</p>{selected.details?.map((detail,index)=><p className="event-detail-copy" key={index}>{detail}</p>)}<div className="attachment-list">{selected.assets?.map(id=><SavedAsset key={id} id={id}/>)}</div><a className="secondary-button" href={'#'+selected.href} onClick={()=>setOpened(null)}>{selected.action}</a></Sheet>}
  </Page>;
}
