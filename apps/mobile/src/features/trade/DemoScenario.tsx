import {useEffect,useId,useRef,useState} from 'react';
import {businessError,businessRequest,type Organization} from '../business/api';
import {MarketIcon} from '../market/components';
import './demo-scenario.css';

type DemoStep={id:string;title:string;description:string;organizationId:string;view:'trade'|'business';screen?:string;tab?:string;entityId?:string};
export type DemoManifest={isDemo:false}|{isDemo:true;organizations:(Organization&{isDemo:true})[];scenario:{sellerOrganizationId:string;buyerOrganizationId:string;partnerOrganizationId:string;lotIds:string[];listingIds:string[];offerIds:string[];dealIds:string[];conversationIds:string[];steps?:DemoStep[];profiles?:{id:string;name:string;role:string}[]}};
type Props={organizationId?:string;compact?:boolean;onCreated?:(manifest:Extract<DemoManifest,{isDemo:true}>)=>void};
const tradeLink=(organizationId:string,screen:string,id?:string)=>'#/market?'+new URLSearchParams({view:'trade',organizationId,screen,...(id?{id}:{})});
const businessLink=(organizationId:string)=>'#/market?'+new URLSearchParams({view:'business',organizationId,tab:'services'});

function scenarioSteps(s:Extract<DemoManifest,{isDemo:true}>['scenario']):DemoStep[]{
 if(s.steps?.length)return s.steps;
 return [
  {id:'harvest',title:'Продавец · мой урожай',description:'Посмотрите качество партии, свободный остаток и объём в резерве.',organizationId:s.sellerOrganizationId,view:'trade',screen:s.lotIds[0]?'lot':'lots',entityId:s.lotIds[0]},
  {id:'offer',title:'Покупатель · предложение',description:'Откройте цену, объём, доставку и условия оплаты. Попробуйте предложить свои условия.',organizationId:s.buyerOrganizationId,view:'trade',screen:s.offerIds[0]?'offer':'offers',entityId:s.offerIds[0]},
  {id:'compare',title:'Сравните условия',description:'Отметьте два предложения и нажмите «Сравнить». Неизвестные расходы отмечаются отдельно.',organizationId:s.sellerOrganizationId,view:'trade',screen:'offers'},
  {id:'deal',title:'Сделка, отгрузка и оплата',description:'Продавец оформляет отгрузку, покупатель принимает её. Заявленную оплату подтверждает продавец.',organizationId:s.sellerOrganizationId,view:'trade',screen:s.dealIds.length?'deal':'deals',entityId:s.dealIds[1]||s.dealIds[0]},
  {id:'finance',title:'Финансы хозяйства',description:'Сравните плановые и фактические расходы. В выручку попадают только подтверждённые поступления.',organizationId:s.sellerOrganizationId,view:'trade',screen:'finance'},
  {id:'partner',title:'Партнёр · услуги',description:'Откройте приглашение в сделку и предложение по услуге. Решение принимает заказчик.',organizationId:s.partnerOrganizationId,view:'business',tab:'services'},
 ];
}

export default function DemoScenario({organizationId,compact=false,onCreated}:Props){
 const [manifest,setManifest]=useState<DemoManifest|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[unauthorized,setUnauthorized]=useState(false),[expanded,setExpanded]=useState(!compact),[revision,setRevision]=useState(0);
 const detailsId=useId(),titleId=useId(),alive=useRef(true),creating=useRef(false),loadRequest=useRef<AbortController|null>(null),creationRequest=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;loadRequest.current?.abort();creationRequest.current?.abort();};},[]);
 useEffect(()=>{
  const controller=new AbortController();loadRequest.current=controller;setLoading(true);setError('');setUnauthorized(false);
  void businessRequest<DemoManifest>('/demo',undefined,'GET',controller.signal).then(value=>{if(!controller.signal.aborted)setManifest(value);}).catch(e=>{if(!controller.signal.aborted){setError(businessError(e));setUnauthorized(e?.status===401);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[revision]);
 async function create(){
  if(creating.current)return;creating.current=true;setBusy(true);setError('');setUnauthorized(false);loadRequest.current?.abort();
  const controller=new AbortController();creationRequest.current=controller;
  try{
   const result=await businessRequest<DemoManifest>('/demo',{},'POST',controller.signal);
   if(!result.isDemo)throw new Error('Демо-пример пока не создан. Попробуйте ещё раз.');
   if(alive.current&&!controller.signal.aborted){setManifest(result);setExpanded(true);setLoading(false);onCreated?.(result);}
  }catch(e){if(alive.current&&!controller.signal.aborted){setError(businessError(e));setUnauthorized((e as {status?:number})?.status===401);}}
  finally{creating.current=false;if(alive.current&&!controller.signal.aborted)setBusy(false);}
 }
 const scenario=manifest?.isDemo?manifest.scenario:null;
 const route=new URLSearchParams(location.hash.split('?')[1]),currentScreen=route.get('screen'),currentId=route.get('id')||'';
 const ownSide=scenario&&(organizationId===scenario.sellerOrganizationId||organizationId===scenario.buyerOrganizationId);
 const sharedScreen=ownSide&&route.get('view')==='trade'&&['deal','offer'].includes(currentScreen||'')&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(currentId)?currentScreen:null;
 const sideLink=(id:string)=>tradeLink(id,sharedScreen||'overview',sharedScreen?currentId:undefined);
 const roles=scenario?[{id:scenario.sellerOrganizationId,label:'Продавец',icon:'wheat',href:sideLink(scenario.sellerOrganizationId)},{id:scenario.buyerOrganizationId,label:'Покупатель',icon:'market',href:sideLink(scenario.buyerOrganizationId)},{id:scenario.partnerOrganizationId,label:'Партнёр',icon:'connections',href:businessLink(scenario.partnerOrganizationId)}]:[];
 const currentRole=roles.find(role=>role.id===organizationId);
 return <section className={'trade-demo'+(compact?' trade-demo--compact':'')} aria-labelledby={titleId} aria-busy={busy}>
  <div className="trade-demo-top"><span className="trade-demo-badge"><MarketIcon name="leaf" size={15}/>Демо-пример</span>{currentRole&&<span className="trade-demo-current">Сейчас: {currentRole.label.toLowerCase()}</span>}</div>
  <h2 id={titleId}>{scenario?'Одна сделка — с разных сторон':'Посмотрите, как работает торговля'}</h2>
  <p className="trade-demo-intro">{scenario?'Ваш учебный сценарий сохранён. Можно менять компанию и проходить этапы в своём темпе.':'Готовое хозяйство, покупатель и партнёр: урожай, предложения, сделки и расходы уже заполнены.'}</p>
  {loading&&!manifest?<p className="trade-demo-status" role="status">Проверяем ваш демо-пример…</p>:null}
  {error&&<div className="trade-demo-error" role="alert"><p>{error}</p>{unauthorized?<a href="#/auth">Войти в EGIN</a>:<button type="button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Проверить ещё раз</button>}</div>}
  {!scenario&&!loading&&!unauthorized&&<button type="button" className="trade-demo-start" disabled={busy} onClick={()=>void create()}><MarketIcon name={busy?'clock':'play'} size={18}/>{busy?'Создаём ваш пример…':'Попробовать на демо-примере'}</button>}
  {scenario&&<>
   <nav className="trade-demo-roles" aria-label="Сторона демо-сделки">{roles.map(role=><a key={role.id} href={role.href} aria-current={currentRole?.id===role.id?'true':undefined}><MarketIcon name={role.icon} size={19}/><span>{role.label}</span></a>)}</nav>
   <button type="button" className="trade-demo-toggle" aria-expanded={expanded} aria-controls={detailsId} onClick={()=>setExpanded(value=>!value)}>{expanded?'Свернуть инструкцию':'Как пройти сценарий'}<MarketIcon name={expanded?'up':'down'} size={18}/></button>
   <div id={detailsId} hidden={!expanded}>
    <ol className="trade-demo-steps">{scenarioSteps(scenario).map((step,index)=><li key={step.id}><a href={step.view==='business'?'#/market?'+new URLSearchParams({view:'business',organizationId:step.organizationId,tab:step.tab||'services',...(step.entityId?{id:step.entityId}:{})}):tradeLink(step.organizationId,step.screen||'overview',step.entityId)}><span className="trade-demo-number" aria-hidden="true">{index+1}</span><span className="trade-demo-step-copy"><strong>{step.title}</strong><span>{step.description}</span></span><MarketIcon name="right" size={17}/></a></li>)}</ol>
    <p className="trade-demo-tip"><MarketIcon name="info" size={17}/><span>Это учебные профили, они не отвечают автоматически. Чтобы выполнить действие другой стороны, выберите её компанию выше или в списке организаций.</span></p>
   </div>
  </>}
  <p className="trade-demo-disclaimer">Учебные компании и суммы. Действия в демо не означают реальную отгрузку или перевод денег.{!scenario?' Ваши существующие данные сохранятся.':''}</p>
 </section>;
}
