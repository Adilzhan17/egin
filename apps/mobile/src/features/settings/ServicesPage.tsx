import { useEffect, useState } from 'react';
import { api, humanError } from '../../entities/workspace/api';
import { useMeta } from '../../entities/workspace/hooks';
import type { SessionUser } from '../../entities/workspace/types';
import { Icon } from '../../shared/ui/Icon';
import { Page, Notice, LinkRow } from '../workspace/ui';
import './services.css';
import OneCPage, { type OneCState } from './OneCPage';

const services = [
  {id:'one-c',name:'1С:ERP АПК',fullName:'1С:ERP Агропромышленный комплекс',mark:'1С',icon:'storage',
    summary:'Импорт участков и журнала из вашей базы',badge:'Обмен через OData',
    description:'Подготовьте доступ к вашей базе 1С. EGIN умеет проверить публикацию OData и показать доступные справочники. Обмен записями потребует настройки соответствий вашей конфигурации.',
    steps:['Попросите администратора опубликовать OData базы по HTTPS.','Создайте отдельного пользователя с правами только на чтение нужных справочников.','Укажите адрес публикации и проверьте доступ. Затем нужно согласовать соответствие полей данных.'],
    source:'https://v8.1c.ru/platforma/rest-interfeys/',sourceLabel:'Как работает интеграция 1С',
    request:'Нужно подготовить подключение 1С:ERP АПК к EGIN: версия конфигурации, HTTPS-адрес публикации OData, отдельный пользователь только для чтения, перечень опубликованных справочников полей, работ, материалов и урожая. Просьба согласовать соответствие реквизитов. Пароль передайте владельцу отдельно защищённым способом.'},
  {id:'agrosignal',name:'АгроСигнал',fullName:'АгроСигнал',mark:'АС',icon:'layers',
    summary:'Поля, агрооперации и ресурсы хозяйства',badge:'Партнёрский REST API',
    description:'У АгроСигнала есть партнёрский REST API для получения и отправки данных. Для подключения EGIN нужны документация и доступ от поставщика. Адаптер обмена ещё не настроен.',
    steps:['Запросите у АгроСигнала доступ к партнёрскому REST API для вашего хозяйства.','Получите документацию: авторизацию, методы, лимиты и доступные права.','Согласуйте состав данных. Ключ можно будет добавить после подготовки адаптера EGIN.'],
    source:'https://agrosignal.com/articles/integratsiya-s-1s/',sourceLabel:'Об API АгроСигнала',
    request:'Хотим подключить наше хозяйство в АгроСигнале к EGIN. Просим предоставить условия партнёрского REST API, документацию, способ авторизации, права только на чтение, идентификатор хозяйства, методы полей/агроопераций/материалов/урожая, лимиты и условия тестового доступа. Секреты в текст заявки не включаем.'},
  {id:'agrostream',name:'AgroStream',fullName:'AgroStream',mark:'AS',icon:'wheat',
    summary:'Планирование, выполнение работ и зерно',badge:'Доступ по согласованию',
    description:'AgroStream поддерживает интеграции, в том числе с 1С. Публичную документацию универсального API мы пока не нашли: способ обмена и доступные данные нужно подтвердить у поставщика.',
    steps:['Уточните у AgroStream возможность обмена данными вашего хозяйства с EGIN.','Запросите документацию API или согласованный формат выгрузки и условия доступа.','Укажите организацию и нужные данные — они сохранятся как подготовка подключения.'],
    source:'https://agrostream.net/modules/agrofact',sourceLabel:'Интеграции AgroStream',
    request:'Хотим организовать обмен между AgroStream и EGIN для нашего хозяйства. Подскажите, доступен ли клиентский или партнёрский API для AgroPlan, AgroFact и учёта зерна. Нужны условия подключения, документация, авторизация, лимиты, тестовый доступ и форматы выгрузки при отсутствии API. На первом этапе планируем только чтение.'},
] as const;
const datasets = [{id:'fields',title:'Поля и культуры',detail:'Участки, посевы и сезоны'},{id:'operations',title:'Полевые работы',detail:'План и выполненные операции'},{id:'materials',title:'Материалы',detail:'Семена, удобрения и средства защиты'},{id:'harvest',title:'Урожай',detail:'Сбор и учёт продукции'}];
type Connection = {provider:string;account:string;endpoint:string;datasets:string[];version:number;updated:number;checkedAt:number|null;collections:string[];status:'draft'|'access_checked';syncEnabled:false};
type Service = typeof services[number];
const status = (c?:Connection) => c?.checkedAt?'Доступ проверен':c?'Настройки сохранены':'Не настроен';
export default function ServicesPage({provider}:{provider?:string}) {
  const user = useMeta<SessionUser|null>('user',null);
  if(provider==='one-c')return <OneCPage/>;
  return <ServicesContent key={(user?.id||'guest')+':'+(provider||'list')} user={user} provider={provider}/>;
}
function ServicesContent({user,provider}:{user:SessionUser|null;provider?:string}) {
  const [oneCState,setOneCState] = useState<OneCState>({connection:null,runs:[]});
  const [connections,setConnections] = useState<Connection[]>([]), [loading,setLoading] = useState(!!user), [error,setError] = useState(''), [retry,setRetry] = useState(0);
  useEffect(()=>{
    if(!user)return;
    let active=true;
    setLoading(true);setError('');
    Promise.all([api<{connections:Connection[]}>('/integrations'),api<OneCState>('/one-c')]).then(([data,oneC])=>{if(active){setConnections(data.connections);setOneCState(oneC);}}).catch(e=>{if(active)setError(humanError(e));}).finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[user?.id,retry]);
  const service=services.find(s=>s.id===provider);
  if(provider&&!service)return <Page title="Сервис не найден" back="/settings/services"><Notice>Выберите сервис из списка подключений.</Notice></Page>;
  if(loading||error)return <Page title={service?.name||'Подключённые сервисы'} back={service?'/settings/services':'/settings'}>{loading?<Notice>Загружаем настройки…</Notice>:<><Notice error>{error}</Notice><button className="secondary-button" onClick={()=>setRetry(x=>x+1)}>Повторить загрузку</button></>}</Page>;
  if(service)return <ServiceDetail service={service} user={user} initial={connections.find(c=>c.provider===service.id)}/>;
  return <Page title="Подключённые сервисы">
    <p className="page-description">Свяжите учётную систему с EGIN. Возможности обмена зависят от сервиса.</p>
    <div className="service-overview"><Icon name="connections" size={28}/><div><strong>Обмен под вашим контролем</strong><p>Импорт из 1С с проверкой данных, ручным запуском и расписанием.</p></div></div>
    <div className="service-cards">{services.map(s=><a className="service-card" href={'#/settings/services/'+s.id} key={s.id}>
      <span className="service-mark" aria-hidden="true">{s.mark}</span><div><h2>{s.name}</h2><p>{s.summary}</p><span className="service-status">{s.id==='one-c'?(oneCState.connection?(oneCState.connection.status==='error'?'Требует внимания':oneCState.connection.mapping?'Обмен настроен':'Подключено · выберите данные'):'Не подключено'):status(connections.find(c=>c.provider===s.id))}</span></div><Icon name="right" size={19}/>
    </a>)}</div>
    {!user&&<LinkRow href="/auth" title="Войти в EGIN" description="Чтобы сохранять настройки в своём профиле" icon="lock"/>}
    <Notice>Для 1С доступен импорт участков и журнала. АгроСигнал и AgroStream пока требуют согласования доступа с поставщиками.</Notice>
    <LinkRow href="/settings/api" title="EGIN API и погода" description="Ключи для ваших разработок и источники погоды" icon="cloud"/>
  </Page>;
}
function ServiceDetail({service,user,initial}:{service:Service;user:SessionUser|null;initial?:Connection}) {
  const [saved,setSaved]=useState(initial),[account,setAccount]=useState(initial?.account||''),[endpoint,setEndpoint]=useState(initial?.endpoint||''),[selected,setSelected]=useState(initial?.datasets||['fields','operations']);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[confirm,setConfirm]=useState(false),[requestVisible,setRequestVisible]=useState(false);
  const request=service.request+(account.trim()?'\nОрганизация: '+account.trim():'')+'\nИнтересующие данные: '+datasets.filter(d=>selected.includes(d.id)).map(d=>d.title).join(', ')+'.';
  async function act(fn:()=>Promise<void>) {setBusy(true);setError('');setMessage('');try{await fn();}catch(e){setError(humanError(e));}finally{setBusy(false);}}
  return <Page title={service.name} back="/settings/services">
    <div className="service-detail-heading"><span className="service-mark" aria-hidden="true">{service.mark}</span><div><span className="service-status">{service.badge}</span><h2>{service.fullName}</h2></div></div>
    <p className="page-description">{service.description}</p>
    <section className="workspace-card"><h2>Подготовка подключения</h2><ol className="service-steps">{service.steps.map(step=><li key={step}>{step}</li>)}</ol><a className="text-button" href={service.source} target="_blank" rel="noopener noreferrer">{service.sourceLabel}<Icon name="arrow" size={16}/></a></section>
    {user?<>
      <form className="workspace-form service-form" onSubmit={e=>{e.preventDefault();void act(async()=>{
        const next=await api<Connection>('/integrations/'+service.id,{account,endpoint,datasets:selected,version:saved?.version||0},'PUT');
        setSaved(next);setAccount(next.account);setEndpoint(next.endpoint);setSelected(next.datasets);setMessage('Настройки сохранены. Обмен данными ещё не настроен.');
      });}}>
        <h2>Параметры подключения</h2>
        <fieldset disabled={busy}>
          <label>Организация в сервисе<input value={account} onChange={e=>setAccount(e.target.value)} maxLength={120} required placeholder="Название вашего хозяйства" autoComplete="organization"/></label>
          <label>Адрес сервиса, если известен<input type="url" inputMode="url" value={endpoint} onChange={e=>setEndpoint(e.target.value)} maxLength={1024} placeholder="https://…" autoCapitalize="none" spellCheck={false}/><span className="form-help">Необязательное поле. Адрес API должен подтвердить поставщик. Без ключей и паролей в ссылке.</span></label>
          <div><h3>Какие данные нужны</h3><p className="form-help">Это пожелания к будущему обмену. Доступность зависит от версии сервиса и прав вашей организации.</p></div>
          {datasets.map(d=><label className="service-dataset" key={d.id}><input type="checkbox" checked={selected.includes(d.id)} onChange={()=>setSelected(list=>list.includes(d.id)?list.filter(x=>x!==d.id):[...list,d.id])}/><span><strong>{d.title}</strong><small>{d.detail}</small></span></label>)}
          <button className="primary-button" disabled={!selected.length||busy}>{busy?'Подождите…':'Сохранить настройки'}</button>
        </fieldset>
      </form>
      <section className="workspace-card"><h2>Состояние подключения</h2><dl className="settings-facts"><div><dt>Настройки</dt><dd>{status(saved)}</dd></div><div><dt>Обмен данными</dt><dd>Не настроен</dd></div>{saved?.checkedAt&&<div><dt>Доступ проверен</dt><dd>{new Date(saved.checkedAt).toLocaleString('ru-RU')}</dd></div>}</dl>
        {saved?.checkedAt&&<p>Публикация ответила на запрос каталога OData. Это не проверка прав на каждый справочник. Следующий шаг — сопоставить данные 1С и EGIN.</p>}
        {!!saved?.collections.length&&<details className="service-collections"><summary>Доступные объекты · {saved.collections.length}{saved.collections.length===100?' (первые 100)':''}</summary><ul>{saved.collections.map(c=><li key={c}>{c}</li>)}</ul></details>}
        <p>Ожидается документация и согласование доступа с поставщиком. Ввод ключей появится после подготовки адаптера.</p>
      </section>
    </>:<LinkRow href="/auth" title="Войти для настройки" description="Подключения сохраняются в вашем профиле EGIN" icon="lock"/>}
    <Notice error>{error}</Notice><Notice>{message}</Notice>
    <section className="workspace-card"><h2>Для поддержки сервиса</h2><p>Готовый текст с составом данных. Вы можете скопировать и отправить его самостоятельно.</p><button className="secondary-button" onClick={async()=>{setRequestVisible(true);try{await navigator.clipboard.writeText(request);setMessage('Текст скопирован. Отправьте его администратору или поддержке сервиса.');}catch{setMessage('Выделите и скопируйте текст ниже.');}}}>Скопировать запрос на подключение</button>{requestVisible&&<textarea className="service-request" aria-label="Запрос на подключение" value={request} readOnly rows={9}/>}</section>
    {saved&&(confirm?<div className="delete-confirm"><p>Удалить параметры {service.name} из EGIN? Данные в самом сервисе сохранятся.</p><button className="secondary-button" disabled={busy} onClick={()=>void act(async()=>{await api('/integrations/'+service.id,{version:saved.version},'DELETE');setSaved(undefined);setAccount('');setEndpoint('');setSelected(['fields','operations']);setConfirm(false);setMessage('Параметры подключения удалены.');})}>Удалить параметры</button><button className="text-button" disabled={busy} onClick={()=>setConfirm(false)}>Отмена</button></div>:<button className="text-button" disabled={busy} onClick={()=>setConfirm(true)}>Удалить настройки подключения</button>)}
  </Page>;
}
