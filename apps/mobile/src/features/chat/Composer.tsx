import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from 'react';
import { chatApi } from './api';
import { ChatIcon, ChatSheet, ErrorNotice } from './components';
import type { Attachment, ListingReference, Message, MessageDraft } from './types';
import { durationLabel, fileSize, messageLabel, threadError, threadText as t } from './thread-copy';
import { ListingCard } from './messages';
import type { OutboxInput } from './outbox-store';
import { decodeVoiceWaveform, pauseChatVoice, VoiceBubble } from './VoiceBubble';
import './voice.css';
import { LocationPicker } from './LocationPicker';
import { useServerDraft } from './useServerDraft';
import { useActivityPublisher } from './activity';
import { VideoNoteRecorder } from './VideoNoteRecorder';
import { pauseChatVideoNote } from './VideoNoteBubble';
import { useBusinessFeatures } from '../business/api';
import { animateChat, ChatMotion, ChatPresence, motion, useMotionPhase } from './motion';

type PendingFile = { key: string; file: File; kind: Attachment['kind']; preview?: string; uploaded?: Attachment; progress: number; duration?: number; waveform?: number[] };
type Props = { conversationId: string; userId: string; disabled: boolean; reply: Message | null; edit: Message | null; onCancelContext: () => void; onEnqueue: (input: OutboxInput) => Promise<void>; onEdit: (message: Message, text: string) => Promise<void> };
const newId = () => crypto.randomUUID();

export default function Composer({ conversationId, userId, disabled, reply, edit, onCancelContext, onEnqueue, onEdit }: Props) {
  const phase = useMotionPhase(), exiting = useRef(false); exiting.current = phase === 'exit';
  const pendingVideos = useRef(new Map<string, HTMLVideoElement>());
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const node = root.current; return () => node?.querySelectorAll('video').forEach(video => video.pause()); }, []);
  const features = useBusinessFeatures();
  const videoEnabled = features.ready && features.features?.['chat.video_notes'] === true;
  const [recordMode, setRecordMode] = useState<'audio' | 'video'>('audio');
  const activity = useActivityPublisher(conversationId, !disabled);
  const storageKey = `egin.chat.draft.v1.${userId}.${conversationId}`;
  const restored = useRef<{ text: string; clientId: string } | null>(null);
  if (!restored.current) {
    try { const draft = JSON.parse(localStorage.getItem(storageKey) || 'null'); restored.current = { text: typeof draft?.text === 'string' ? draft.text.slice(0, 4000) : '', clientId: typeof draft?.clientId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.clientId) ? draft.clientId : newId() }; }
    catch { restored.current = { text: '', clientId: newId() }; }
  }
  const [text, setText] = useState(restored.current.text); const [editText, setEditText] = useState(''); const clientId = useRef(restored.current.clientId);
  const serverDraft = useServerDraft({conversationId,userId,text,setText});
  const [files, setFiles] = useState<PendingFile[]>([]); const filesRef = useRef(files); filesRef.current = files;
  const [sheet, setSheet] = useState<'attach' | 'listing' | 'location' | 'video-note' | null>(null);
  const [listing, setListing] = useState<ListingReference | null>(null); const [location, setLocation] = useState<MessageDraft['location']>();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false); const [finishingRecording, setFinishingRecording] = useState(false); const acquiringMicrophone = useRef(false); const finishingRef = useRef(false); const [seconds, setSeconds] = useState(0); const [gettingMicrophone, setGettingMicrophone] = useState(false);
  const mounted = useRef(true); const disabledRef = useRef(disabled); disabledRef.current = disabled; const stream = useRef<MediaStream | null>(null); const recorder = useRef<MediaRecorder | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const recordingStart = useRef(0); const discardRecording = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null); const photos = useRef<HTMLInputElement>(null); const documentInput = useRef<HTMLInputElement>(null); const videoInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; discardRecording.current = true;
      if (recorder.current && recorder.current.state !== 'inactive') { try { recorder.current.stop(); } catch { /* Already stopped by the browser. */ } }
      stream.current?.getTracks().forEach(track => track.stop());
      if (timer.current) clearInterval(timer.current);
      filesRef.current.forEach(file => { if (file.preview) URL.revokeObjectURL(file.preview); });
    };
  }, []);
  useEffect(() => {
    if (edit) { setEditText(edit.text); textarea.current?.focus(); }
    // Editing is a separate operation: never overwrite the ordinary message draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edit?.id]);
  useEffect(() => {
    try { if (text) localStorage.setItem(storageKey, JSON.stringify({ text, clientId: clientId.current })); else localStorage.removeItem(storageKey); }
    catch { /* Private mode or storage quota must not prevent sending. */ }
  }, [text, storageKey]);
  useLayoutEffect(() => {
    const el = textarea.current; if (!el) return;
    const before = el.getBoundingClientRect().height;
    el.style.height = 'auto';
    const after = Math.min(el.scrollHeight, 132); el.style.height = `${after}px`;
    if (Math.abs(before - after) < 1) return;
    const animation = animateChat(el, [{ height: `${before}px` }, { height: `${after}px` }], { duration: motion.fast });
    return () => animation?.cancel();
  }, [text, editText, edit?.id, recording]);
  useEffect(() => { if (disabled) { setSheet(null); if (recorder.current?.state === 'recording') stopRecording(true); } }, [disabled]);
  const changed = () => { clientId.current = newId(); setFailed(false); setError(''); try { if (text) localStorage.setItem(storageKey, JSON.stringify({ text, clientId: clientId.current })); } catch { /* Optional local draft. */ } };
  const previousReply = useRef(reply?.id);
  useEffect(() => { if (previousReply.current !== reply?.id) { previousReply.current = reply?.id; changed(); } }, [reply?.id]);
  const release = (file: PendingFile) => { pendingVideos.current.get(file.key)?.pause(); if (file.preview) URL.revokeObjectURL(file.preview); };
  function removeFile(key: string) { changed(); setFiles(items => { const removed = items.find(file => file.key === key); if (removed) release(removed); return items.filter(file => file.key !== key); }); }
  function selectFiles(event: ChangeEvent<HTMLInputElement>, kind: 'image' | 'document' | 'video') {
    const chosen = [...(event.target.files || [])]; event.target.value = ''; if (!chosen.length) return;
    if (kind === 'image' && (chosen.some(file => !file.type.startsWith('image/') || file.size > 10 * 1024 ** 2) || chosen.length + files.filter(file => file.kind === 'image').length > 10)) { setError(t.photoLimit); return; }
    if (kind === 'document' && (chosen.length + files.filter(file=>file.kind==='document').length > 10 || chosen.some(file=>!/\.(pdf|docx|xlsx|pptx|txt|zip)$/i.test(file.name) || file.size > 15 * 1024 ** 2))) { setError(t.documentLimit); return; }
    if (kind === 'video' && (chosen.length!==1 || chosen[0].size>15*1024**2 || !chosen[0].type.startsWith('video/'))) {setError('Выберите одно видео до 15 МБ и 3 минут.');return;}
    changed(); setListing(null); setLocation(undefined);
    setFiles(current => {
      const kept = kind === 'video' ? [] : current.filter(file => file.kind === kind);
      current.filter(file => !kept.includes(file)).forEach(release);
      return [...kept, ...chosen.map(file => ({ key: newId(), file, kind, progress: 0, ...(['image','video'].includes(kind) ? { preview: URL.createObjectURL(file) } : {}) }))];
    }); setSheet(null);
  }
  function clearAttachments() { filesRef.current.forEach(release); setFiles([]); setListing(null); setLocation(undefined); }
  function locate() {setSheet('location');setError('');}
  function stopRecording(discard = false) {
    discardRecording.current = discard;
    const device = recorder.current;
    if (device?.state === 'recording') { finishingRef.current = true; setFinishingRecording(true); device.stop(); }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (timer.current) clearInterval(timer.current); timer.current = null; setRecording(false); activity.stop();
  }
  useEffect(() => {
    if (phase !== 'exit') return;
    stopRecording(true); pendingVideos.current.forEach(video => video.pause());
  }, [phase]);
  async function startRecording() {
    if (exiting.current || disabledRef.current || acquiringMicrophone.current || finishingRef.current || recording || busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError(t.recordingUnsupported); return; }
    acquiringMicrophone.current = true; setGettingMicrophone(true); setError(''); pauseChatVoice();
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current || exiting.current || disabledRef.current) { microphone.getTracks().forEach(track => track.stop()); return; }
      stream.current = microphone; discardRecording.current = false;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'].find(value => MediaRecorder.isTypeSupported(value));
      const device = new MediaRecorder(microphone, mimeType ? { mimeType } : undefined); recorder.current = device; const chunks: Blob[] = [];
      device.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      device.onerror = () => { stopRecording(true); if (mounted.current) setError(t.microphoneDenied); };
      device.onstop = async () => {
        microphone.getTracks().forEach(track => track.stop()); recorder.current = null;
        if (timer.current) clearInterval(timer.current); timer.current = null;
        const duration = Math.min(180, Math.max(.1, (Date.now() - recordingStart.current) / 1000));
        try {
          if (!mounted.current || exiting.current || disabledRef.current || discardRecording.current) return;
          setRecording(false); activity.stop(); setFinishingRecording(true); finishingRef.current = true;
          if (!chunks.length) { setError('Запись не сохранилась. Попробуйте ещё раз.'); return; }
          const mime = device.mimeType || chunks[0].type; const blob = new Blob(chunks, { type: mime });
          const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
          const waveform = await decodeVoiceWaveform(blob);
          if (!mounted.current || exiting.current || disabledRef.current || discardRecording.current) return;
          clearAttachments(); changed(); setFiles([{ key: newId(), file, kind: 'audio', preview: URL.createObjectURL(blob), progress: 0, duration, waveform }]);
        } finally { finishingRef.current = false; if (mounted.current) { setRecording(false); setFinishingRecording(false); } }
      };
      device.start(250); recordingStart.current = Date.now(); setSeconds(0); setRecording(true); activity.publish('recording');
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - recordingStart.current) / 1000); setSeconds(Math.min(180, elapsed)); activity.publish('recording'); if (elapsed >= 180) stopRecording(); }, 250);
    } catch { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; recorder.current = null; if (mounted.current) setError(t.microphoneDenied); }
    finally { acquiringMicrophone.current = false; if (mounted.current) setGettingMicrophone(false); }
  }
  async function submit() {
    if (disabled || busyRef.current || recording || acquiringMicrophone.current || finishingRef.current || (edit ? !editText.trim() : !text.trim() && !files.length && !listing && !location)) return;
    busyRef.current = true; setBusy(true); setError(''); activity.stop();
    try {
      if (edit) { await onEdit(edit, editText.trim()); if (!mounted.current) return; onCancelContext(); return; }
      const kind = listing ? 'listing_reference' : location ? 'location' : files[0]?.kind || 'text';
      const draft: MessageDraft = { clientId: clientId.current, kind, text: text.trim(), ...(reply ? { replyToMessageId: reply.id } : {}), ...(listing ? { listingId: listing.id } : {}), ...(location ? { location } : {}) };
      await onEnqueue({ draft, files: files.map(({ key, file, kind, duration, waveform }) => ({ key, file, kind, duration, waveform })), listing, replyTo: reply ? { id: reply.id, text: reply.text, kind: reply.kind, senderName: reply.sender.name } : null });
      if (!mounted.current) return;
      clientId.current = newId(); setText(''); clearAttachments(); setFailed(false); onCancelContext();
      try { localStorage.removeItem(storageKey); } catch { /* Optional local draft. */ }
    } catch (cause) { if (mounted.current) { setError(threadError(cause)); setFailed(true); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function enqueueVideoNote(file: File, duration: number) {
    if (disabledRef.current || !videoEnabled || busyRef.current) throw new Error('Отправка видеозаметок сейчас недоступна.');
    busyRef.current = true; setBusy(true); activity.stop();
    try {
      await onEnqueue({ draft: { clientId: clientId.current, kind: 'video_note', text: text.trim(), ...(reply ? { replyToMessageId: reply.id } : {}) }, files: [{ key: newId(), file, kind: 'video_note', duration }], replyTo: reply ? { id: reply.id, text: reply.text, kind: reply.kind, senderName: reply.sender.name } : null });
      if (!mounted.current) return; clientId.current = newId(); setText(''); clearAttachments(); setFailed(false); onCancelContext();
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const canSend = Boolean(text.trim() || files.length || listing || location);
  return <div ref={root} className="chat-composer">
    {disabled ? <p className="chat-composer-readonly">{t.readonly}</p> : <>
      <ChatMotion kind="collapse" show={Boolean(reply || edit)}>{(reply || edit) && <div className="chat-composer-context"><span><strong>{edit ? t.editTitle : `${t.replyTitle} · ${reply!.sender.name}`}</strong><small>{messageLabel((edit || reply)!)}</small></span><button className="chat-icon-button" aria-label={t.cancel} disabled={busy} onClick={onCancelContext}><ChatIcon name="close" /></button></div>}</ChatMotion>
      <ChatMotion kind="collapse" show={files.length > 0 && !edit}><div className="chat-pending-files">{files.map(file => <div className={`chat-pending-file ${file.kind}`} key={file.key}>
        {file.kind === 'image' && <img src={file.preview} alt={file.file.name} />}
        {file.kind === 'video' && <video ref={node => { if (node) pendingVideos.current.set(file.key, node); else pendingVideos.current.delete(file.key); }} src={file.preview} controls playsInline preload="metadata" onPlay={() => { pauseChatVoice(); pauseChatVideoNote(); }}/>}
        {file.kind === 'audio' && file.preview && <VoiceBubble preview file={{ id: file.key, url: file.preview, duration: file.duration, waveform: file.waveform }} />}
        {file.kind === 'document' && <span><ChatIcon name="file" /><b>{file.file.name}</b><small>{fileSize(file.file.size)}</small></span>}
        <button className="chat-icon-button" aria-label={`${t.removeAttachment}: ${file.file.name}`} disabled={busy} onClick={() => removeFile(file.key)}><ChatIcon name="close" size={16} /></button>

      </div>)}</div></ChatMotion>
      <ChatMotion kind="collapse" show={Boolean(listing && !edit)}>{listing && <div className="chat-pending-reference"><ListingCard listing={listing} compact /><button className="chat-icon-button" disabled={busy} aria-label={t.removeAttachment} onClick={() => { changed(); setListing(null); }}><ChatIcon name="close" /></button></div>}</ChatMotion>
      <ChatMotion kind="collapse" show={Boolean(location && !edit)}>{location && <div className="chat-pending-reference"><span><ChatIcon name="location" /> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span><button className="chat-icon-button" disabled={busy} aria-label={t.removeAttachment} onClick={() => { changed(); setLocation(undefined); }}><ChatIcon name="close" /></button></div>}</ChatMotion>
      {serverDraft.remoteConflict!==null&&<div className="chat-draft-conflict" role="status">На другом устройстве изменён черновик.<button onClick={serverDraft.useRemote}>Взять с другого устройства</button><button onClick={serverDraft.keepLocal}>Оставить этот</button></div>}
      {serverDraft.error&&<div className="chat-draft-conflict">Черновик сохранён на устройстве. Синхронизация: {serverDraft.error}<button onClick={serverDraft.retry}>Повторить</button></div>}
      <ErrorNotice message={error} />
      <div className="chat-composer-mode-frame"><ChatMotion identity={recording ? 'recording' : 'input'} kind="fade">{recording ? <div className="chat-recording" role="status"><i className="chat-recording-dot" aria-hidden="true" /><span><strong>{t.recording} · {durationLabel(seconds)}</strong><small>{t.voiceLimit}</small></span><button className="chat-icon-button" aria-label={t.cancel} onClick={() => stopRecording(true)}><ChatIcon name="close" /></button><button className="chat-icon-button" aria-label={t.stop} onClick={() => stopRecording()}><ChatIcon name="stop" /></button></div> : <div className="chat-composer-row" aria-busy={gettingMicrophone || finishingRecording}>
        {!edit && <button className="chat-icon-button chat-composer-circle" aria-label={t.attach} disabled={busy || gettingMicrophone || finishingRecording} onClick={() => setSheet('attach')}><ChatIcon name="plus" /></button>}
        <textarea ref={textarea} value={edit ? editText : text} rows={1} maxLength={4000} disabled={busy || gettingMicrophone || finishingRecording} aria-label={t.message} placeholder={t.placeholder} onBlur={()=>activity.stop()} onChange={event => { if(event.target.value.trim())activity.publish('typing');else activity.stop(); if (edit) setEditText(event.target.value); else { changed(); setText(event.target.value); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } }} />
        {canSend || edit ? <button className="chat-send chat-composer-circle" aria-label={busy ? t.sending : failed ? t.retry : edit ? t.save : t.send} disabled={busy || finishingRecording || gettingMicrophone || Boolean(edit && !editText.trim())} onClick={() => void submit()}><ChatIcon name={failed ? 'retry' : 'send'} /></button> : <>{videoEnabled && <button className="chat-icon-button chat-composer-mode" aria-label={recordMode === 'audio' ? 'Переключить на видеозаметку' : 'Переключить на голосовое'} disabled={gettingMicrophone || finishingRecording} onClick={() => setRecordMode(value => value === 'audio' ? 'video' : 'audio')}><ChatIcon name={recordMode === 'audio' ? 'camera' : 'mic'} size={18}/></button>}<button className="chat-icon-button chat-composer-circle" aria-label={videoEnabled && recordMode === 'video' ? 'Записать видеозаметку' : t.record} disabled={gettingMicrophone || finishingRecording} onClick={() => { if (videoEnabled && recordMode === 'video') setSheet('video-note'); else void startRecording(); }}><ChatIcon name={videoEnabled && recordMode === 'video' ? 'camera' : 'mic'} /></button></>}
      </div>}</ChatMotion></div>
      {(busy || failed || gettingMicrophone || finishingRecording || text.length > 3800) && <small className="chat-compose-status" role="status">{gettingMicrophone ? 'Разрешите доступ к микрофону…' : finishingRecording ? 'Подготавливаем запись…' : busy ? t.sending : failed ? t.failed : `${text.length} / 4000`}</small>}
      <input ref={photos} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => selectFiles(event, 'image')} />
      <input ref={videoInput} type="file" hidden accept="video/mp4,video/quicktime,video/webm" onChange={event=>selectFiles(event,'video')}/>
      <input ref={documentInput} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.pptx,.txt,.zip" onChange={event => selectFiles(event, 'document')} />
    </>}
    <ChatPresence identity={sheet ?? undefined}>{sheet === 'attach' ? <ChatSheet title={t.attach} onClose={() => setSheet(null)}><div className="chat-attach-options">{videoEnabled && <button onClick={() => setSheet('video-note')}><ChatIcon name="camera"/>Видеозаметка</button>}<button onClick={() => photos.current?.click()}><ChatIcon name="image" />{t.photo}</button><button onClick={()=>videoInput.current?.click()}><ChatIcon name="play"/>Видео</button><button onClick={() => documentInput.current?.click()}><ChatIcon name="file" />{t.document}</button><button onClick={() => setSheet('listing')}><ChatIcon name="market" />{t.listing}</button><button onClick={() => void locate()}><ChatIcon name="location" />{t.location}</button></div></ChatSheet> : sheet === 'video-note' && videoEnabled && !disabled ? <VideoNoteRecorder maxSeconds={features.videoNoteMaxSeconds} onClose={() => { activity.stop(); setSheet(null); }} onSend={enqueueVideoNote} onRecording={active => active ? activity.publish('recording') : activity.stop()}/> : sheet === 'listing' ? <ListingPicker onClose={() => setSheet(null)} onSelect={value => { changed(); clearAttachments(); setListing(value); setSheet(null); }} /> : sheet === 'location' ? <LocationPicker initialLocation={location} onClose={()=>setSheet(null)} onSelect={value=>{changed();clearAttachments();setLocation(value);setSheet(null);}}/> : null}</ChatPresence>
  </div>;
}

function ListingPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (listing: ListingReference) => void }) {
  const [query, setQuery] = useState(''); const [items, setItems] = useState<ListingReference[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; setLoading(true); const timer = setTimeout(() => { void chatApi<{ items: ListingReference[] }>(`/listings?q=${encodeURIComponent(query)}`).then(result => { if (active) { setItems(result.items); setError(''); } }).catch(cause => { if (active) setError(threadError(cause)); }).finally(() => { if (active) setLoading(false); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [query]);
  return <ChatSheet title={t.listing} onClose={onClose}><div className="chat-form"><input aria-label={t.listingSearch} placeholder={t.listingSearch} value={query} onChange={event => setQuery(event.target.value)} /></div><ErrorNotice message={error} />{loading ? <p role="status">{t.loading}</p> : !items.length ? <p className="chat-muted">{t.listingEmpty}</p> : <div className="chat-listing-picker">{items.map(item => <button key={item.id} onClick={() => onSelect(item)}>{item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}<span><strong>{item.title}</strong><small>{item.regionName}</small></span><ChatIcon name="attach" /></button>)}</div>}</ChatSheet>;
}
