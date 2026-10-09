import type { Asset, Data, Kind, Row } from './types';
export const DB_NAME = 'egin-workspace-v1';
let promise: Promise<IDBDatabase> | undefined;
export function database() { return promise ??= new Promise<IDBDatabase>((resolve,reject)=>{ const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{for(const name of ['records','assets','meta'])req.result.createObjectStore(name,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>{promise=undefined;reject(new Error('Не удалось открыть хранилище телефона'));}; }); }
export async function all<T>(store: string): Promise<T[]> { const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
export async function get<T>(store: string,key: string): Promise<T|undefined> { const db=await database();return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
export async function put(store: string,value: unknown) { const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(new Error('Не удалось сохранить. Проверьте свободное место.'));}); }
export const notify = () => window.dispatchEvent(new Event('egin-data'));
export async function meta<T>(key:string,fallback:T):Promise<T> {return (await get<{value:T}>('meta',key))?.value ?? fallback;}
export async function setMeta(key:string,value:unknown){await put('meta',{key,value});notify();window.dispatchEvent(new Event('egin-write'));}
export const owner = () => meta('owner','guest');
export async function records<T=Data>(kind?:Kind):Promise<Row<T>[]> {const who=await owner();return (await all<Row<T>>('records')).filter(r=>r.owner===who&&(!kind||r.kind===kind)&&!r.deleted).sort((a,b)=>b.updated.localeCompare(a.updated));}
export async function save(kind:Kind,data:Data,existing?:Row):Promise<Row> {const who=await owner();if(existing&&existing.owner!==who)throw new Error('Профиль изменился. Откройте запись заново.');const id=existing?.id||(kind==='profile'?'profile':crypto.randomUUID());const row:Row={...existing,key:`${who}:${id}`,owner:who,id,kind,data,version:existing?.version||0,deleted:false,dirty:true,localRevision:(existing?.localRevision||0)+1,updated:new Date().toISOString()};await put('records',row);notify();window.dispatchEvent(new Event('egin-write'));return row;}
export async function remove(row:Row){if(row.owner!==await owner())throw new Error('Профиль изменился');await put('records',{...row,deleted:true,dirty:true,localRevision:row.localRevision+1,updated:new Date().toISOString()});notify();window.dispatchEvent(new Event('egin-write'));}
export async function resolveConflict(row:Row,choice:'local'|'remote') {
  if(!row.conflict)return;
  const db=await database();
  await new Promise<void>((resolve,reject)=>{
    const tx=db.transaction(['records','meta'],'readwrite'),store=tx.objectStore('records');
    const record=store.get(row.key),profile=tx.objectStore('meta').get('owner');
    let recordReady=false,profileReady=false,reason:Error|undefined;
    const apply=()=>{
      if(!recordReady||!profileReady)return;
      const latest=record.result as Row|undefined,who=profile.result?.value??'guest';
      if(who!==row.owner){reason=new Error('Профиль изменился. Откройте синхронизацию заново.');tx.abort();return;}
      if(!latest||latest.owner!==who||latest.localRevision!==row.localRevision||!latest.conflict||latest.conflict.version!==row.conflict!.version){reason=new Error('Версии изменились. Сравните их ещё раз.');tx.abort();return;}
      const remote=latest.conflict;
      store.put(choice==='remote'?{...latest,...remote,conflict:undefined,dirty:false,localRevision:latest.localRevision+1,updated:new Date().toISOString()}:{...latest,version:remote.version,conflict:undefined,dirty:true,localRevision:latest.localRevision+1,updated:new Date().toISOString()});
    };
    record.onsuccess=()=>{recordReady=true;apply();};profile.onsuccess=()=>{profileReady=true;apply();};
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(reason||new Error('Не удалось выбрать версию. Попробуйте ещё раз.'));tx.onerror=()=>reject(tx.error);
  });
  notify();window.dispatchEvent(new Event('egin-write'));
}
export async function addAsset(blob:Blob,name:string) {if(blob.size>8*1024*1024)throw new Error('Вложение должно быть меньше 8 МБ');const who=await owner(),id=crypto.randomUUID();await put('assets',{key:`${who}:${id}`,owner:who,id,blob,name,uploaded:false} satisfies Asset);return id;}
export async function localAsset(id:string){return get<Asset>('assets',`${await owner()}:${id}`);}
export async function importGuest(){const who=await owner();if(who==='guest')return;const db=await database();const rows=(await all<Row>('records')).filter(r=>r.owner==='guest');const assets=(await all<Asset>('assets')).filter(r=>r.owner==='guest');await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['records','assets'],'readwrite');for(const r of rows){tx.objectStore('records').put({...r,key:`${who}:${r.id}`,owner:who,version:0,dirty:true,conflict:undefined});tx.objectStore('records').delete(r.key);}for(const a of assets){tx.objectStore('assets').put({...a,key:`${who}:${a.id}`,owner:who,uploaded:false});tx.objectStore('assets').delete(a.key);}tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});notify();window.dispatchEvent(new Event('egin-write'));}
export async function discardLocal(){const who=await owner();const rows=(await all<Row>('records')).filter(r=>r.owner===who);if(rows.some(r=>r.dirty||r.conflict))throw new Error('Сначала синхронизируйте или экспортируйте несохранённые записи');const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['records','assets','meta'],'readwrite');for(const store of ['records','assets']){const req=tx.objectStore(store).openCursor();req.onsuccess=()=>{const c=req.result;if(c){if(c.value.owner===who)c.delete();c.continue();}};}tx.objectStore('meta').delete(`cursor:${who}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});notify();window.dispatchEvent(new Event('egin-write'));}
