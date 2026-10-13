import React,{useState} from 'react';
import{createRoot}from'react-dom/client';
import'@fontsource-variable/inter';
import'../../src/shared/styles/tokens.css';
import'../../src/shared/styles/global.css';
import'../../src/features/chat/chat.css';
import'../../src/features/chat/thread.css';
import'../../src/features/chat/messenger.css';
import{TradeMessageCard}from'../../src/features/chat/TradeMessageCard';
import{themeStyle,chatThemes}from'../../src/features/chat/ChatAppearance';
import type{Message}from'../../src/features/chat/types';
const note:Message={id:'10000000-0000-4000-8000-000000000001',conversationId:'chat-a',sender:{id:'seller',name:'Продавец'},clientId:'fixture',sequence:1,kind:'text',text:'',createdAt:'2026-10-14T10:00:00Z',editedAt:null,deletedAt:null,attachments:[],replyTo:null,listing:null,location:null,readByCount:0,system:{type:'trade',entityType:'offer',entityId:'offer-a',title:'Предложение пшеницы',summary:'PRIVATE CACHED SUMMARY NEVER RENDER'}};
function Fixture(){const[theme,setTheme]=useState('nature'),[id,setId]=useState('offer-a'),[user,setUser]=useState('buyer'),[replies,setReplies]=useState(0);return <main className="chat-thread" data-chat-theme={theme} style={{...themeStyle({preset:theme}),position:'relative',inset:'auto',transform:'none',margin:'auto',minHeight:'100dvh',height:'auto',background:'var(--chat-theme-bg)',display:'block',padding:12}}><label style={{color:'var(--chat-ink)'}}>Тестовая тема <select aria-label="Тестовая тема" value={theme} onChange={e=>setTheme(e.target.value)}>{chatThemes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div><button onClick={()=>setId(id==='offer-a'?'offer-b':'offer-a')}>Сменить карточку</button><button onClick={()=>setUser(user==='buyer'?'outsider':'buyer')}>Сменить профиль</button><button onClick={()=>window.dispatchEvent(new Event('fixture-platform'))}>Обновление сервера</button></div><output aria-label="Ответы">{replies}</output><TradeMessageCard message={{...note,id:'message-'+id,conversationId:'chat-'+id,system:{...note.system!,entityId:id}}} userId={user} onReply={()=>setReplies(v=>v+1)}/></main>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
