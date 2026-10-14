import React,{useEffect,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';
import{ChatPresence,ChatMotion,useChatListMotion,useMotionPhase}from'../../src/features/chat/motion';
import{ChatSheet,ErrorNotice}from'../../src/features/chat/components';
import'../../src/features/chat/chat.css';
const counts={mounts:0,unmounts:0};Object.assign(window,{counts});
function Panel({onClose}:{onClose:()=>void}){useEffect(()=>{counts.mounts++;return()=>{counts.unmounts++;};},[]);return <ChatSheet title="Панель" onClose={onClose}><input aria-label="Черновик" defaultValue="сохранён"/><button onClick={onClose}>Сохранить и закрыть</button></ChatSheet>}
function Rows(){const[rows,setRows]=useState(['А','Б','В']),[revision,setRevision]=useState(0),ref=useRef<HTMLDivElement>(null);useChatListMotion(ref,rows);return <><button onClick={()=>setRows(r=>[r[2],r[0],r[1]])}>Переставить</button><button onClick={()=>setRevision(v=>v+1)}>Обновить без изменений</button><span>{revision}</span><div ref={ref}>{rows.map(r=><button className="chat-row" data-conversation-id={r} key={r}>{r}</button>)}</div></>}
function Test(){const[open,setOpen]=useState(false),[status,setStatus]=useState(false),[error,setError]=useState('');return <section className="chat-page"><button onClick={()=>setOpen(true)}>Открыть</button><button onClick={()=>setOpen(v=>!v)}>Переключить</button><ChatPresence>{open?<Panel onClose={()=>setOpen(false)}/>:null}</ChatPresence><button onClick={()=>setStatus(v=>!v)}>Изменить статус</button><div data-testid="status"><ChatMotion as="span" kind="status" identity={status?'typing':'offline'}>{status?'Печатает…':'Был(а) недавно'}</ChatMotion></div><button onClick={()=>setError(v=>v?'':'Ошибка сети')}>Ошибка</button><ErrorNotice message={error}/><div data-testid="after-error">Следующая строка</div><Rows/></section>}
createRoot(document.getElementById('root')!).render(<Test/>);
