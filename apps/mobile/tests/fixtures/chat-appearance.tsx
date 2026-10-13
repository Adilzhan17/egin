import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '../../src/shared/styles/tokens.css';
import '../../src/shared/styles/global.css';
import '../../src/features/chat/chat.css';
import '../../src/features/chat/thread.css';
import '../../src/features/chat/messenger.css';
import { ChatAppearance, themeStyle } from '../../src/features/chat/ChatAppearance';
import { chatApi } from '../../src/features/chat/api';
import type { ChatTheme } from '../../src/features/chat/types';

function Fixture() {
  const [theme,setTheme]=useState<ChatTheme>(),[open,setOpen]=useState(false);
  useEffect(()=>{void chatApi<{preferences:{theme:ChatTheme}}>('/conversations/test-conversation/preferences').then(value=>setTheme(value.preferences.theme));},[]);
  return <main className="chat-page" style={{padding:18,maxWidth:480,margin:'auto',minHeight:'100dvh'}}>
    <button disabled={!theme} onClick={()=>setOpen(true)}>Оформление</button>
    <div className="chat-theme-preview" data-testid="saved-surface" data-chat-theme={theme?.preset} style={themeStyle(theme)}><div className="chat-theme-preview-bubble">Сообщение собеседника</div><div className="chat-theme-preview-bubble own">Ваше сообщение</div></div>
    {open&&<ChatAppearance id="test-conversation" initial={theme} onClose={()=>setOpen(false)} onSaved={next=>{setTheme(next);setOpen(false);}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
