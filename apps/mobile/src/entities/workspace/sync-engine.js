// Shared by the app and generated service worker. Both exports are embedded there.
// Keep the helper self-contained and retain original rows for localRevision checks.
export function buildSyncBatches(records, maxBytes = 750 * 1024) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 14 || maxBytes > 750 * 1024) throw new Error('Некорректный размер пакета синхронизации');
  const encoder = new TextEncoder(), prefix = '{"records":[', suffix = ']}';
  const overhead = encoder.encode(prefix + suffix).byteLength;
  const batches = [];
  let rows = [], parts = [], bytes = overhead;
  const flush = () => {
    if (!rows.length) return;
    batches.push({ records: rows, body: prefix + parts.join(',') + suffix });
    rows = []; parts = []; bytes = overhead;
  };
  for (const row of records) {
    const { id, kind, data, version, deleted } = row;
    const part = JSON.stringify({ id, kind, data, version, deleted });
    const size = encoder.encode(part).byteLength;
    if (size + overhead > maxBytes) throw new Error(`Запись ${id} слишком большая для отправки. Уменьшите объём данных или детализацию границ. Запись сохранена на устройстве.`);
    if (rows.length === 50 || bytes + size + (rows.length ? 1 : 0) > maxBytes) flush();
    bytes += size + (rows.length ? 1 : 0);
    rows.push(row); parts.push(part);
  }
  flush();
  return batches;
}
export async function runSync(automatic = false) {
  const execute = async () => {
    const db = await new Promise((resolve,reject)=>{const q=indexedDB.open('egin-workspace-v1',1);q.onupgradeneeded=()=>{for(const n of ['records','assets','meta'])q.result.createObjectStore(n,{keyPath:'key'});};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const read=(s,k)=>new Promise((resolve,reject)=>{const q=db.transaction(s).objectStore(s)[k===undefined?'getAll':'get'](k);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
    const write=(s,v)=>new Promise((resolve,reject)=>{const t=db.transaction(s,'readwrite');t.objectStore(s).put(v);t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
    const mutate=(s,key,fn)=>new Promise((resolve,reject)=>{const t=db.transaction(s,'readwrite'),st=t.objectStore(s),q=st.get(key);q.onsuccess=()=>{const v=fn(q.result);if(v)st.put(v);};t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
    const meta=async(k,f)=>(await read('meta',k))?.value??f;
    try {
      if(automatic && !await meta('autoSync',true))return {state:'paused',message:'Автоматическая отправка отключена'};
      const who=await meta('owner','guest');if(who==='guest')return {state:'guest',message:'Записи хранятся на этом телефоне. Войдите для синхронизации.'};
      const base=await meta('apiBase','');
      const request=async(path,options={})=>{const r=await fetch(base+'/api'+path,{...options,credentials:'include',headers:{'X-EGIN':'1',...options.headers},signal:AbortSignal.timeout(25000)});if(!r.ok){let msg='Не удалось синхронизировать';try{msg=(await r.json()).error||msg;}catch{}throw new Error(msg);}return r;};
      const session=await (await request('/session')).json();if(session.user?.id!==who)return {state:'auth',message:'Войдите снова, чтобы отправить записи. Данные сохранены на телефоне.'};
      const pending=(await read('records')).filter(r=>r.owner===who&&r.dirty&&!r.conflict);
      const batches=buildSyncBatches(pending);
      const needed=new Set(pending.filter(r=>r.kind==='entry'&&!r.deleted).flatMap(r=>r.data.assets));
      for(const id of needed){if(await meta('owner','guest')!==who)throw new Error('Профиль изменился');const a=await read('assets',`${who}:${id}`);if(a&&!a.uploaded){await request('/assets/'+id,{method:'PUT',headers:{'Content-Type':a.blob.type},body:a.blob});await write('assets',{...a,uploaded:true});}}
      for(const {records:batch,body} of batches){if(await meta('owner','guest')!==who)throw new Error('Профиль изменился');const result=await(await request('/sync',{method:'POST',headers:{'Content-Type':'application/json'},body})).json();
        for(const out of result.results){const sent=batch.find(r=>r.id===out.id);await mutate('records',sent.key,local=>!local?undefined:out.conflict?{...local,conflict:out.remote}:{...local,version:out.version,dirty:local.localRevision!==sent.localRevision});}
      }
      let more=true;while(more){const cursor=await meta(`cursor:${who}`,0);const result=await(await request('/sync?cursor='+cursor)).json();for(const remote of result.records){const key=`${who}:${remote.id}`;await mutate('records',key,local=>local?.dirty?local.version===remote.version?local:{...local,conflict:remote}:{...remote,key,owner:who,dirty:false,localRevision:local?.localRevision||0,updated:local?.updated||new Date().toISOString()});}await write('meta',{key:`cursor:${who}`,value:result.cursor});more=result.more;}
      const rows=(await read('records')).filter(r=>r.owner===who);
      // Download attachments for offline use on a second device. Never send local blobs to another owner.
      for(const id of new Set(rows.filter(r=>!r.deleted&&r.kind==='entry').flatMap(r=>r.data.assets))){if(!await read('assets',`${who}:${id}`)){const r=await request('/assets/'+id);await write('assets',{key:`${who}:${id}`,owner:who,id,blob:await r.blob(),name:'Вложение',uploaded:true});}}
      await write('meta',{key:`lastSync:${who}`,value:new Date().toISOString()});
      const conflicts=rows.filter(r=>r.conflict).length;return {state:conflicts?'conflict':'ok',message:conflicts?'Есть разные версии записей. Выберите нужную в настройках.':'Все записи синхронизированы'};
    } catch(e) {return {state:'error',message:e instanceof TypeError || e.name==='TimeoutError' || e.name==='AbortError' ? 'Нет соединения или сервер не ответил. Повторим отправку позже.' : e.message||'Не удалось синхронизировать'};} finally {db.close();}
  };
  return globalThis.navigator?.locks ? navigator.locks.request('egin-sync',execute) : execute();
}
