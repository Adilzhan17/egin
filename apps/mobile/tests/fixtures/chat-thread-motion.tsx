import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Conversation from '../../src/features/chat/Conversation';
import {ChatPresence} from '../../src/features/chat/motion';
import type {Message} from '../../src/features/chat/types';
import type {PendingOutboxEntry} from '../../src/features/chat/useChatOutbox';
import '../../src/features/chat/chat.css';
const id='10000000-0000-4000-8000-000000000001',user={id:'alice',name:'Алия'};
function Fixture(){
 const[accepted,setAccepted]=useState<Message|null>(null),[pending,setPending]=useState<PendingOutboxEntry[]>([]),[open,setOpen]=useState(true);
 (window as any).threadFixture={queue:(message:Message)=>setPending([{key:message.clientId,clientId:message.clientId,userId:user.id,conversationId:id,createdAt:message.createdAt,state:'sending',files:[],progress:0,message} as unknown as PendingOutboxEntry]),ack:(message:Message)=>setAccepted(message),close:()=>setOpen(false)};
 return <div className="chat-page"><ChatPresence duration={300}>{open?<Conversation id={id} user={user} onBack={()=>setOpen(false)} onChanged={()=>{}} onOpenGroup={()=>{}} accepted={accepted} pending={pending} onEnqueue={async()=>{}} onRetryPending={async()=>{}} onDiscardPending={async()=>setPending([])} onScrubReply={async()=>{}} onConfirmAccepted={async messages=>setPending(current=>current.filter(entry=>!messages.some(m=>m.clientId===entry.clientId)))}/>:null}</ChatPresence></div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
