import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {businessRequest,businessError} from './api';
import {useChatEvents} from '../chat/hooks';
export {Field,Section,Empty,ErrorNotice,Loading,Submit,Modal} from '../trade/ui';

export function useBusinessResource<T>(path:string|null){
 const[data,setData]=useState<T|null>(null),[loading,setLoading]=useState(!!path),[error,setError]=useState(''),[revision,setRevision]=useState(0);const reload=useCallback(()=>setRevision(n=>n+1),[]),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 useChatEvents(e=>{if(['platform','ready'].includes(e.type)){if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(reload,200);}});
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 useEffect(()=>{setData(null);setLoading(!!path);setError('');},[path]);
 useEffect(()=>{if(!path)return;const controller=new AbortController();void businessRequest<T>(path,undefined,'GET',controller.signal).then(r=>{if(!controller.signal.aborted){setData(r);setError('');}}).catch(e=>{if(!controller.signal.aborted){setError(businessError(e));if(e.status===401||e.status===403||e.status===404)setData(null);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[path,revision]);return{data,loading,error,reload};
}
export function Hint({children}:{children:ReactNode}){return <p className="business-hint">{children}</p>;}
export function Status({children}:{children:ReactNode}){return <span className="trade-badge">{children}</span>;}

export function useBusinessSelection(tab:string){
 const read=()=>{const p=new URLSearchParams(location.hash.split('?')[1]);return p.get('tab')===tab?p.get('id')||'':'';};
 const[selected,setSelected]=useState(read);
 useEffect(()=>{const change=()=>setSelected(read());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[tab]);
 return [selected,setSelected] as const;
}
