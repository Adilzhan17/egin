import { useState } from 'react';
import { api, authenticate, humanError } from '../../entities/workspace/api';
import { Notice } from '../workspace/ui';

export function ConfirmIdentity({ hasKeys, onVerified }: { hasKeys:boolean; onVerified:()=>void }) {
  const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
  async function confirm() {
    setBusy(true);setError('');setDone(false);
    try {
      if(hasKeys){const flow=await api('/auth/reauth/options',{});const response=await authenticate(flow.options);await api('/auth/reauth/verify',{flow:flow.flow,response});}
      else await api('/auth/password/reauth',{password},'POST',60000);
      setPassword('');setDone(true);onVerified();
    }catch(e){setError(humanError(e));}finally{setBusy(false);}
  }
  return <section className="workspace-card"><h2>Подтвердить личность</h2>
    <p>Для изменения ключей и кода восстановления нужно недавнее подтверждение входа. Для управления организацией и оплатами обязателен passkey с проверкой Face ID, отпечатка или кода устройства.</p>
    <form className="workspace-form" onSubmit={e=>{e.preventDefault();void confirm();}}>
      {!hasKeys&&<label>Текущий пароль<input type="password" autoComplete="current-password" value={password} maxLength={1024} onChange={e=>setPassword(e.target.value)}/></label>}
      <button className="secondary-button" disabled={busy||!hasKeys&&!password}>{busy?'Подтверждаем…':hasKeys?'Подтвердить с passkey':'Подтвердить пароль'}</button>
    </form>
    {!hasKeys&&<p className="form-help">После подтверждения пароля добавьте первый passkey ниже. Если вы только что восстановили доступ по коду, можно сразу добавить ключ.</p>}
    <Notice error>{error}</Notice><Notice>{done?'Личность подтверждена. Можно продолжить действие.':''}</Notice>
  </section>;
}
