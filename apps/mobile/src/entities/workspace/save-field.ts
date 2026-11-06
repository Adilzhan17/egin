import {get,meta,owner,save} from './db';
import {syncNow} from './hooks';
import type {Field,Row} from './types';

/** The existing sync protocol remains the only writer. Success requires server acknowledgement. */
export async function saveFieldConfirmed(data: Field, id: string, expectedOwner: string, base?: Row<Field>): Promise<Row<Field>> {
  if (expectedOwner==='guest') throw new Error('Войдите в EGIN, чтобы сохранить участок на сервере. Черновик остаётся на этом устройстве.');
  if (await owner()!==expectedOwner) throw new Error('Профиль изменился. Откройте участок заново.');
  const key=`${expectedOwner}:${id}`, current=await get<Row<Field>>('records',key);
  if (current?.conflict) throw new Error('Есть конфликт версий. Разрешите его в настройках синхронизации. Черновик сохранён.');
  if (base && current && (current.localRevision!==base.localRevision || current.version!==base.version) && JSON.stringify(current.data)!==JSON.stringify(base.data) && JSON.stringify(current.data)!==JSON.stringify(data)) throw new Error('Участок изменён в другом окне. Закройте мастер и откройте актуальную версию; черновик сохранён.');
  const row=current || {id,key,owner:expectedOwner,kind:'field' as const,data,version:0,deleted:false,dirty:false,localRevision:0,updated:''};
  const saved=JSON.stringify(current?.data)===JSON.stringify(data)?row:await save('field',data,row);
  await syncNow();
  let confirmed=await get<Row<Field>>('records',key);
  // A sync already in progress may have captured its batch before this edit.
  if (confirmed?.dirty && !confirmed.conflict) {await syncNow();confirmed=await get<Row<Field>>('records',key);}
  if (await owner()!==expectedOwner) throw new Error('Профиль изменился. Результат не открыт в другом профиле.');
  if (!confirmed || confirmed.dirty || confirmed.conflict || confirmed.deleted || confirmed.version<1 || confirmed.localRevision!==saved.localRevision || JSON.stringify(confirmed.data)!==JSON.stringify(data)) {
    const status=await meta('syncStatus',{message:''});
    throw new Error(status.message || 'Сервер пока не подтвердил сохранение. Черновик сохранён; повторите попытку.');
  }
  return confirmed;
}
