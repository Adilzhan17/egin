import {useCallback,useEffect,useRef,useState} from 'react';
import {API_BASE} from '../../entities/workspace/api';
import {stationApi} from './api';
import type {Device,DeviceEvent,Mode,Snapshot} from './types';

export function useStation(mode:Mode,deviceId:string,accountId:string|undefined){
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[history,setHistory]=useState<Snapshot[]>([]),[events,setEvents]=useState<DeviceEvent[]>([]),[devices,setDevices]=useState<Device[]>([]),[authenticated,setAuthenticated]=useState(false),[connection,setConnection]=useState<'loading'|'connected'|'reconnecting'|'offline'|'login'>('loading'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const active=useRef({mode,deviceId}),mounted=useRef(true),generation=useRef(0),account=useRef(accountId);active.current={mode,deviceId};
  const refreshEvents=useCallback(async()=>{const requestedMode=active.current.mode,version=generation.current;const result=await stationApi<{items:DeviceEvent[]}>(`/events?mode=${requestedMode}`);if(!Array.isArray(result.items))throw new Error('Сервер вернул некорректный журнал событий');if(mounted.current&&generation.current===version&&active.current.mode===requestedMode)setEvents(result.items);},[]);
  const refreshDevices=useCallback(async()=>{const version=generation.current,result=await stationApi<{items:Device[]}>('/devices');if(!Array.isArray(result.items))throw new Error('Сервер вернул некорректный список устройств');if(mounted.current&&generation.current===version)setDevices(result.items);},[]);
  useEffect(()=>{mounted.current=true;generation.current++;let disposed=false,ws:WebSocket|undefined,reconnect:ReturnType<typeof setTimeout>|undefined,delay=1000,cursor=0,currentDevice='',syncing=false,lastEvents=0;const abort=new AbortController();
    setSnapshot(null);setHistory([]);setEvents([]);if(account.current!==accountId){account.current=accountId;setDevices([]);setAuthenticated(false);}setError('');setConnection('loading');
    const query=()=>`mode=${mode}${mode==='hardware'&&deviceId?`&device_id=${encodeURIComponent(deviceId)}`:''}`;
    function apply(next:Snapshot|null){if(disposed)return;if(!next){setSnapshot(null);setHistory([]);return;}if(currentDevice&&currentDevice!==next.device_id){cursor=0;setHistory([]);}currentDevice=next.device_id;
      setSnapshot(old=>old&&old.device_id===next.device_id&&old.run_id===next.run_id&&old.seq>next.seq?old:next);
      if(next.readings&&next.timestamp)setHistory(old=>{const values=old.filter(x=>x.device_id===next.device_id&&(!next.run_id||x.run_id===next.run_id));if(values.some(x=>x.seq===next.seq))return values;return [...values,next].sort((a,b)=>a.seq-b.seq).slice(-500);});
    }
    async function backfill(){if(syncing||disposed)return;syncing=true;try{const current=await stationApi<{snapshot:Snapshot|null}>(`/snapshot?${query()}`,undefined,abort.signal);if(disposed)return;const next=current.snapshot;if(!next){apply(null);return;}if(currentDevice&&currentDevice!==next.device_id)cursor=0;currentDevice=next.device_id;
      const collected:Snapshot[]=[];let more=false;do{const past=await stationApi<{items:Snapshot[];more:boolean}>(`/history?${query()}${mode==='hardware'&&!deviceId?`&device_id=${encodeURIComponent(next.device_id)}`:''}${cursor?`&after=${cursor}`:''}`,undefined,abort.signal);collected.push(...past.items);more=past.more&&past.items.length>0;cursor=past.items.at(-1)?.seq??cursor;}while(more&&!disposed);
      if(disposed)return;setHistory(old=>[...new Map([...old,...collected].filter(x=>x.device_id===next.device_id&&(!next.run_id||x.run_id===next.run_id)).map(x=>[x.seq,x])).values()].sort((a,b)=>a.seq-b.seq).slice(-500));apply(next);cursor=Math.max(cursor,next.seq);
    }finally{syncing=false;}}
    async function connect(){try{const session=await stationApi<{authenticated:boolean}>('/demo',{},abort.signal);if(disposed)return;setAuthenticated(session.authenticated);if(session.authenticated)void refreshDevices().catch(()=>{});if(mode==='hardware'&&!session.authenticated){setConnection('login');return;}
      await backfill();if(disposed)return;await refreshEvents();if(disposed)return;
      const url=new URL(`/api/soilcore/ws?${query()}`,API_BASE||location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';ws=new WebSocket(url);ws.onopen=()=>{if(disposed)return;delay=1000;setError('');setConnection('connected');void backfill().catch(()=>{});};
      ws.onmessage=message=>{if(disposed)return;try{const payload=JSON.parse(message.data) as {type:string;snapshot:Snapshot|null};if(payload.type!=='snapshot')return;const next=payload.snapshot;const gap=next&&cursor&&next.seq>cursor+1;apply(next);if(gap)void backfill().catch(()=>{});else cursor=Math.max(cursor,next?.seq||0);if(Date.now()-lastEvents>6000){lastEvents=Date.now();void refreshEvents().catch(()=>{});}}catch{setError('Получен некорректный пакет телеметрии');}};
      ws.onerror=()=>ws?.close();ws.onclose=()=>{if(disposed)return;setConnection('reconnecting');reconnect=setTimeout(connect,delay);delay=Math.min(delay*2,30000);};
    }catch(e){if(disposed)return;setError(e instanceof Error?e.message:'Нет связи с сервером');setConnection('offline');reconnect=setTimeout(connect,delay);delay=Math.min(delay*2,30000);}}
    void connect();const poll=setInterval(()=>{if(!disposed&&mode==='hardware')void backfill().catch(()=>{});},30000);
    return()=>{disposed=true;mounted.current=false;generation.current++;abort.abort();if(reconnect)clearTimeout(reconnect);clearInterval(poll);ws?.close();};
  },[mode,deviceId,accountId,retry,refreshEvents,refreshDevices]);
  async function command(action:string,value?:string|number){const version=generation.current;setBusy(true);setError('');try{const response=await stationApi<{snapshot:Snapshot}>('/control',{action,...(value===undefined?{}:{value})});if(generation.current!==version)return;if(active.current.mode==='simulation'){setSnapshot(response.snapshot);if(action==='reset'||action==='restore_checkpoint')setHistory([]);}await refreshEvents();}catch(e){if(generation.current===version)setError(e instanceof Error?e.message:'Команда не выполнена');}finally{setBusy(false);}}
  async function provision(name:string){const version=generation.current,result=await stationApi<{device_id:string;token:string}>('/devices',{name});if(generation.current!==version)throw new Error('Сессия изменилась. Откройте список станций заново.');await refreshDevices();await refreshEvents();return result;}
  async function revoke(id:string){await stationApi(`/devices/${encodeURIComponent(id)}`,{},undefined,'DELETE');await refreshDevices();}
  return {snapshot,history,events,devices,authenticated,connection,error,busy,command,provision,revoke,reconnect:()=>setRetry(x=>x+1)};
}
