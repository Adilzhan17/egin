import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { chatApi, chatError, uploadChatBinary } from './api';
import { ChatSheet, ChatWallpaper, ErrorNotice } from './components';
import { optimizeChatImage } from './image-upload';
import type { Attachment, ChatTheme } from './types';
import { API_BASE } from '../../entities/workspace/api';
export const chatThemes = [
  { id:'nature', name:'Egin Nature', bg:'#c0d8b8', light:'#edf3d7', incoming:'#f7fbee', outgoing:'#d7e9c5', ink:'#233b2b', muted:'#4d6654', accent:'#24513c' },
  { id:'ocean', name:'Ocean Glass', bg:'#b7dce9', light:'#e6f4f6', incoming:'#f3fafc', outgoing:'#c9e8ee', ink:'#163946', muted:'#426575', accent:'#196079' },
  { id:'lavender', name:'Lavender Mist', bg:'#d7cdeb', light:'#f1eafa', incoming:'#fcf8ff', outgoing:'#e5daf5', ink:'#393044', muted:'#655b77', accent:'#68518a' },
  { id:'sunset', name:'Sunset', bg:'#eacfc5', light:'#fbefda', incoming:'#fff7f2', outgoing:'#f5dad0', ink:'#4c3432', muted:'#795b58', accent:'#8b5147' },
  { id:'sand', name:'Sand & Wheat', bg:'#dfd1b2', light:'#f8f0d9', incoming:'#fffaf0', outgoing:'#eee1bb', ink:'#433d2b', muted:'#6a624b', accent:'#796326' },
  { id:'midnight', name:'Midnight', bg:'#182a3e', light:'#233d50', incoming:'#293d52', outgoing:'#304f69', ink:'#edf5fb', muted:'#bfd0de', accent:'#a1d4ef' },
  { id:'forest', name:'Forest', bg:'#203b30', light:'#304e3c', incoming:'#344f40', outgoing:'#426450', ink:'#f1f7e9', muted:'#c3d4bd', accent:'#c1dda9' },
  { id:'pearl', name:'Pearl', bg:'#dfe6e8', light:'#f8f9f6', incoming:'#ffffff', outgoing:'#e8efea', ink:'#283d39', muted:'#566b66', accent:'#345f55' },
];
export const darkTheme = (theme?: ChatTheme) => ['midnight','forest'].includes(theme?.preset || '');
export function wallpaperUrl(value?: ChatTheme): string | null {
  return /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value?.wallpaperAttachmentId || '') ? `${API_BASE}/api/chat/attachments/${value!.wallpaperAttachmentId}/file` : null;
}
export function themeStyle(value?: ChatTheme): CSSProperties {
  const p = chatThemes.find(item => item.id === value?.preset) || chatThemes[0];
  const hex = (v?: string) => /^#[0-9a-f]{6}$/i.test(v || '') ? v! : null;
  const bg = hex(value?.background) || p.bg, tint = hex(value?.accent) || p.outgoing;
  // Custom outgoing tint gets its own contrast-safe foreground; incoming theme stays legible.
  const rgb = tint.match(/[0-9a-f]{2}/gi)!.map(v => parseInt(v,16));
  const lum = rgb.reduce((sum,v,i) => { const c=v/255;return sum+[.2126,.7152,.0722][i]*(c<=.04045?c/12.92:((c+.055)/1.055)**2.4); },0);
  const photo = wallpaperUrl(value);
  return { '--chat-theme-bg':bg,'--chat-theme-light':p.light,'--chat-incoming':p.incoming,'--chat-outgoing':tint,'--chat-ink':p.ink,'--chat-muted':p.muted,'--chat-forest':p.accent,'--chat-outgoing-ink':lum>.30?'#172c25':lum>.179?'#000000':'#ffffff','--chat-glass':p.incoming+'e8','--chat-glass-border':darkTheme(value)?'#ffffff26':'#ffffffb3','--chat-decoration':String(Math.max(0,Math.min(1,value?.intensity ?? .45))), '--chat-wallpaper-image':photo ? `url("${photo}")` : 'none', '--chat-wallpaper-shade':photo ? (darkTheme(value) ? '#10251e66' : '#f4f8ef55') : 'transparent' } as CSSProperties;
}
export function ChatAppearance({id,initial,onClose,onSaved}:{id:string;initial?:ChatTheme;onClose:()=>void;onSaved:(theme:ChatTheme)=>void}) {
  const [value,setValue]=useState<ChatTheme>(initial||{preset:'nature',intensity:.45});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uploading,setUploading]=useState(false),[progress,setProgress]=useState(0),[imageError,setImageError]=useState(false);
  const fileInput=useRef<HTMLInputElement>(null),upload=useRef<AbortController|null>(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;upload.current?.abort();};},[]);
  useEffect(()=>setImageError(false),[value.wallpaperAttachmentId]);
  async function choosePhoto(file?:File){
    if(!file)return;
    if(file.size>10*1024*1024){setError('Изображение фона должно быть не больше 10 МБ.');return;}
    if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)){setError('Выберите фотографию JPEG, PNG, WebP или HEIC.');return;}
    const controller=new AbortController();upload.current=controller;setUploading(true);setProgress(0);setError('');
    try{
      const prepared=await optimizeChatImage(file);
      if(controller.signal.aborted)return;
      const result=await uploadChatBinary<{attachment:Attachment}>(`/conversations/${encodeURIComponent(id)}/attachments?kind=image&purpose=wallpaper&name=${encodeURIComponent(prepared.name)}`,prepared,percent=>{if(mounted.current)setProgress(percent);},controller.signal);
      if(mounted.current&&!controller.signal.aborted)setValue(current=>({...current,wallpaperAttachmentId:result.attachment.id}));
    }catch(cause){if(mounted.current&&!controller.signal.aborted)setError(chatError(cause));}
    finally{if(mounted.current){setUploading(false);upload.current=null;}}
  }
  async function save(){setBusy(true);setError('');try{const result=await chatApi<{theme?:ChatTheme;preferences?:{theme:ChatTheme}}>(`/conversations/${id}/preferences`,{theme:value},'PATCH');onSaved(result.theme||result.preferences?.theme||value);}catch(e){setError(chatError(e));}finally{setBusy(false);}}
  const current=chatThemes.find(item=>item.id===value.preset)||chatThemes[0];
  return <ChatSheet title="Тема чата" onClose={onClose} dismissDisabled={busy}><p className="chat-muted">Оформление этой беседы видно только вам. Оно сохраняется в вашем профиле.</p><div className="chat-theme-preview" data-chat-theme={value.preset} style={themeStyle(value)}><ChatWallpaper/><div className="chat-theme-preview-bubble">Как проходит день? 🌿</div><div className="chat-theme-preview-bubble own">Всё хорошо. На связи!</div></div><div className="chat-theme-grid">{chatThemes.map(theme=><button key={theme.id} disabled={busy||uploading} aria-pressed={value.preset===theme.id} onClick={()=>setValue({preset:theme.id,intensity:value.intensity,wallpaperAttachmentId:value.wallpaperAttachmentId})}><span style={{background:`linear-gradient(135deg,${theme.light},${theme.bg})`}}><i style={{background:theme.outgoing}}/></span>{theme.name}</button>)}</div><div className="chat-form">
    <section className="chat-theme-photo" aria-label="Своё изображение фона"><input ref={fileInput} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" aria-label="Изображение фона чата" onChange={event=>{const selected=event.target.files?.[0];event.target.value='';void choosePhoto(selected);}}/>
      <div className="chat-theme-photo-heading">{wallpaperUrl(value)&&!imageError&&<img src={wallpaperUrl(value)!} alt="Текущий фон" onError={()=>setImageError(true)}/>}<div><strong>Своё изображение</strong><p>Фотография до 10 МБ. Видна только вам в этой беседе.</p></div></div>
      {imageError&&<p className="chat-muted">Изображение сейчас недоступно. Используется цвет выбранной темы.</p>}
      {uploading?<div className="chat-theme-upload"><label>Загрузка фона · {progress}%<progress max="100" value={progress}/></label><button type="button" className="chat-text-button" onClick={()=>upload.current?.abort()}>Отменить загрузку фона</button></div>:<div className="chat-theme-photo-actions"><button type="button" className="chat-button secondary" disabled={busy} onClick={()=>fileInput.current?.click()}>{value.wallpaperAttachmentId?'Заменить изображение':'Загрузить изображение'}</button>{value.wallpaperAttachmentId&&<button type="button" className="chat-text-button" disabled={busy} onClick={()=>setValue({...value,wallpaperAttachmentId:null})}>Убрать фото</button>}</div>}
    </section>
    <label className="chat-theme-color">Оттенок сообщений<input type="color" disabled={busy||uploading} aria-label="Оттенок сообщений" value={value.accent||current.outgoing} onChange={e=>setValue({...value,accent:e.target.value})}/></label><label className="chat-theme-color">Фон<input type="color" disabled={busy||uploading} aria-label="Фон" value={value.background||current.bg} onChange={e=>setValue({...value,background:e.target.value})}/></label><label>Природный узор · {Math.round((value.intensity??.45)*100)}%<input type="range" disabled={busy||uploading} aria-label="Интенсивность узора" min="0" max="1" step=".05" value={value.intensity??.45} onChange={e=>setValue({...value,intensity:Number(e.target.value)})}/></label><button className="chat-button secondary" disabled={busy||uploading} onClick={()=>setValue({preset:'nature',intensity:.45})}>Стандартная тема</button><ErrorNotice message={error}/><button className="chat-button" disabled={busy||uploading} onClick={()=>void save()}>{busy?'Сохраняем…':'Сохранить оформление'}</button></div></ChatSheet>;
}
