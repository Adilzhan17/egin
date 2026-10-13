import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ConversationSearch,MessageCollection,ReceiptPeople,ForwardPicker} from '../../src/features/chat/MessageExtras';
import '../../src/features/chat/chat.css';
import '../../src/features/chat/thread.css';
import '../../src/features/chat/messenger.css';
import type {Message} from '../../src/features/chat/types';
const id='10000000-0000-4000-8000-000000000001';
const message={id:'20000000-0000-4000-8000-000000000001',conversationId:id,kind:'text',text:'Для пересылки',sender:{id:'alice',name:'Алия'},sequence:10,attachments:[],createdAt:'2026-10-13T10:00:00Z'} as Message;
function App(){const[view,setView]=useState('saved');(window as any).extrasView=setView;const close=()=>setView('closed');return <div className="chat-page">{['saved','pins'].includes(view)&&<MessageCollection key={view} id={id} type={view as 'saved'|'pins'} onClose={close} onSelect={()=>{}}/>}{view==='search'&&<ConversationSearch id={id} onClose={close} onSelect={()=>{}}/>}{view==='receipts'&&<ReceiptPeople id={id} message={message} onClose={close}/>} {view==='forward'&&<ForwardPicker id={id} messages={[message]} onClose={close} onDone={close}/>}<output>{view}</output></div>}
createRoot(document.getElementById('root')!).render(<App/>);
