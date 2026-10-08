import { useEffect, useState } from 'react';
import type { WeatherState } from '../../entities/weather/use-weather';
import { useMeta, useRows } from '../../entities/workspace/hooks';
import { api, humanError } from '../../entities/workspace/api';
import type { Field, Row, SessionUser } from '../../entities/workspace/types';
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
function EventFeed({weather,activeField,user}:{weather:WeatherState;activeField?:Row<Field>;user:SessionUser|null}) {
  const {rows,error}=useRows(),{rows:fields}=useRows<Field>('field');
  const [exchange,setExchange]=useState<ExchangeState|null>(null),[exchangeError,setExchangeError]=useState(''),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[now,setNow]=useState(Date.now());
  const [source,setSource]=useState(''),[severity,setSeverity]=useState(''),[fieldId,setFieldId]=useState(''),[opened,setOpened]=useState<string|null>(null);
  useEffect(()=>{let active=true;setExchangeError('');if(!user){setExchange(null);return;}setLoading(true);void api<ExchangeState>('/one-c').then(data=>{if(active)setExchange(data);}).catch(e=>{if(active){setExchange(null);setExchangeError((e as {status?:number}).status===401?'Войдите заново, чтобы видеть события 1С.':humanError(e));}}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[user?.id,revision]);
  useEffect(()=>{const update=()=>{if(!document.hidden){setNow(Date.now());setRevision(n=>n+1);}};const timer=setInterval(update,60000);window.addEventListener('online',update);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);window.removeEventListener('online',update);document.removeEventListener('visibilitychange',update);};},[]);
  const events=buildEvents({rows,report:weather.report,activeField,exchange,now,cached:weather.cached}),filtered=filterEvents(events,{source,severity,fieldId}),selected=events.find(e=>e.id===opened),attention=events.filter(e=>e.severity==='attention').length;
  function refresh(){weather.refresh();setNow(Date.now());setRevision(n=>n+1);}
  function when(event:FieldEvent){return event.at?new Date(event.at).toLocaleString('ru-RU',event.source==='history'?{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}:{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Время не указано';}
  return <Page title="Центр событий" back="/" action={<button className="icon-button" aria-label="Обновить события" disabled={loading||weather.loading} onClick={refresh}><Icon name="rotate"/></button>}>
    <section className="events-intro"><span className="eyebrow">Состояние и история</span><h2>{attention?`${attention} · требуют внимания`:'Всё важное об участке'}</h2><p>Погода, обмен данными и сохранённая история. События появляются из доступных источников.</p></section>
    <div className="event-view-switch" role="group" aria-label="Важность событий"><button aria-pressed={!severity} onClick={()=>setSeverity('')}>Все события <span>{events.length}</span></button><button aria-pressed={severity==='attention'} onClick={()=>setSeverity('attention')}>Внимание <span>{attention}</span></button></div>
    <div className="events-filters workspace-form"><label>Источник<select value={source} onChange={e=>setSource(e.target.value)}><option value="">Все источники</option>{Object.entries(eventSources).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><label>Участок<select value={fieldId} onChange={e=>setFieldId(e.target.value)}><option value="">Все участки</option>{fields.map(field=><option key={field.id} value={field.id}>{field.data.name}</option>)}</select></label></div>
    <Notice error>{error}</Notice><Notice error>{exchangeError}</Notice>
    {exchangeError&&<button className="text-button" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Повторить загрузку событий 1С</button>}
    <div aria-live="polite">{loading&&<Notice>Обновляем историю обмена…</Notice>}</div>
    {!filtered.length&&<Empty icon="bell" title={events.length?'Нет событий с такими фильтрами':'Источники ещё не прислали события'}>{events.length?'Выберите другой источник, участок или покажите все события.':'Добавьте участок на карте и подключите сервисы. Здесь появятся данные по мере их поступления.'}</Empty>}
    <div className="event-feed">{filtered.map(event=><article className={`event-card ${event.severity==='attention'?'needs-attention':''}`} key={event.id}><div className="event-top"><span className="event-source"><Icon name={event.icon} size={18}/>{eventSources[event.source]}</span>{event.severity==='attention'&&<span className="event-priority">Внимание</span>}</div><h2>{event.title}</h2><p>{event.description}</p><div className="event-meta"><time dateTime={event.at||undefined}>{event.timeLabel?event.timeLabel+' · ':''}{when(event)}</time><span>{event.fieldId?fields.find(f=>f.id===event.fieldId)?.data.name||'Участок недоступен':'Общее событие'}</span></div><div className="event-actions"><a href={'#'+event.href}>{event.action}<Icon name="right" size={16}/></a>{(event.details?.length||event.assets?.length)?<button onClick={()=>setOpened(event.id)}>{event.assets?.length?`Материалы · ${event.assets.length}`:'Подробнее'}</button>:null}</div></article>)}</div>
    <section className="events-sources"><h2>Доступность источников</h2><p>Отсутствие событий не означает, что на участке всё в норме.</p>{!activeField?<LinkRow href="/fields" icon="map" title="Выбрать участок" description="Погода для примерной точки не попадает в события ваших земель"/>:<LinkRow href="/weather" icon="cloud" title={`Погода · ${activeField.data.name}`} description={weather.error||'Прогноз Open-Meteo для выбранного участка. Другие участки проверяются после выбора на карте.'}/>}<LinkRow href="/settings/sensors" icon="layers" title="Измерения датчиков" description="Реестр доступен; приём телеметрии пока в разработке"/><LinkRow href={user?'/settings/services/one-c':'/auth'} icon="connections" title={user?'Обмен с 1С':'Войти для событий 1С'} description={user?'История обмена и ошибки подключения':'Локальная история доступна без входа'}/></section>
    {selected&&<Sheet title={selected.title} onClose={()=>setOpened(null)}><p className="event-detail-copy">{selected.description}</p>{selected.details?.map((detail,index)=><p className="event-detail-copy" key={index}>{detail}</p>)}<div className="attachment-list">{selected.assets?.map(id=><SavedAsset key={id} id={id}/>)}</div><a className="secondary-button" href={'#'+selected.href} onClick={()=>setOpened(null)}>{selected.action}</a></Sheet>}
  </Page>;
}
