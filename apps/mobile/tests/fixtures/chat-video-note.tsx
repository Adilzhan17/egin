import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '../../src/shared/styles/tokens.css';
import '../../src/shared/styles/global.css';
import '../../src/features/chat/chat.css';
import '../../src/features/chat/thread.css';
import '../../src/features/chat/messenger.css';
import { VideoNoteRecorder } from '../../src/features/chat/VideoNoteRecorder';
import { VideoNoteBubble } from '../../src/features/chat/VideoNoteBubble';
import { themeStyle } from '../../src/features/chat/ChatAppearance';
function Fixture() {
  const [open,setOpen]=useState(false),[file,setFile]=useState<{url:string;duration:number;size:number}>(),[theme,setTheme]=useState('nature');
  return <main className="chat-page chat-thread" data-chat-theme={theme} style={{...themeStyle({preset:theme}),padding:18,maxWidth:480,margin:'auto',minHeight:'100dvh'}}>
    <button onClick={()=>setOpen(true)}>Видеозаметка</button><button onClick={()=>setTheme(value=>value==='nature'?'midnight':'nature')}>Сменить тему</button>
    {file&&<><output data-testid="sent-size">{file.size}</output><VideoNoteBubble file={{id:'sent',url:file.url,duration:file.duration}}/></>}
    {open&&<VideoNoteRecorder maxSeconds={10} onClose={()=>setOpen(false)} onSend={async(file,duration)=>{if(new URLSearchParams(location.search).has('fail'))throw new Error('Очередь недоступна. Запись сохранена в предпросмотре.');setFile({url:URL.createObjectURL(file),duration,size:file.size});}}/>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
