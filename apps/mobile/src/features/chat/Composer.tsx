import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { chatApi, uploadChatAttachment } from './api';
import { ChatIcon, ChatSheet, ErrorNotice } from './components';
import type { Attachment, ListingReference, Message, MessageDraft } from './types';
import { durationLabel, fileSize, messageLabel, threadError, threadText as t } from './thread-copy';
import { ListingCard } from './messages';
import { optimizeChatImage } from './image-upload';
import { decodeVoiceWaveform, pauseChatVoice, VoiceBubble } from './VoiceBubble';
import './voice.css';

type PendingFile = { key: string; file: File; kind: Attachment['kind']; preview?: string; uploaded?: Attachment; progress: number; duration?: number; waveform?: number[] };
type Props = { conversationId: string; userId: string; disabled: boolean; reply: Message | null; edit: Message | null; onCancelContext: () => void; onSend: (draft: MessageDraft) => Promise<void>; onEdit: (message: Message, text: string) => Promise<void> };
const newId = () => crypto.randomUUID();

export default function Composer({ conversationId, userId, disabled, reply, edit, onCancelContext, onSend, onEdit }: Props) {
  const storageKey = `egin.chat.draft.v1.${userId}.${conversationId}`;
  const restored = useRef<{ text: string; clientId: string } | null>(null);
  if (!restored.current) {
    try { const draft = JSON.parse(localStorage.getItem(storageKey) || 'null'); restored.current = { text: typeof draft?.text === 'string' ? draft.text.slice(0, 4000) : '', clientId: typeof draft?.clientId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draft.clientId) ? draft.clientId : newId() }; }
    catch { restored.current = { text: '', clientId: newId() }; }
  }
  const [text, setText] = useState(restored.current.text); const [editText, setEditText] = useState(''); const clientId = useRef(restored.current.clientId);
  const [files, setFiles] = useState<PendingFile[]>([]); const filesRef = useRef(files); filesRef.current = files;
  const [sheet, setSheet] = useState<'attach' | 'listing' | 'location' | null>(null);
  const [listing, setListing] = useState<ListingReference | null>(null); const [location, setLocation] = useState<MessageDraft['location']>();
  const [candidateLocation, setCandidateLocation] = useState<MessageDraft['location']>();
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const busyRef = useRef(false); const [failed, setFailed] = useState(false);
  const [recording, setRecording] = useState(false); const [finishingRecording, setFinishingRecording] = useState(false); const acquiringMicrophone = useRef(false); const finishingRef = useRef(false); const [seconds, setSeconds] = useState(0); const [gettingMicrophone, setGettingMicrophone] = useState(false);
  const mounted = useRef(true); const disabledRef = useRef(disabled); disabledRef.current = disabled; const stream = useRef<MediaStream | null>(null); const recorder = useRef<MediaRecorder | null>(null); const timer = useRef<ReturnType<typeof setInterval> | null>(null); const recordingStart = useRef(0); const discardRecording = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null); const photos = useRef<HTMLInputElement>(null); const documentInput = useRef<HTMLInputElement>(null);
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
  useEffect(() => { const el = textarea.current; if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 132)}px`; } }, [text, editText, edit]);
  useEffect(() => { if (disabled) { setSheet(null); if (recorder.current?.state === 'recording') stopRecording(true); } }, [disabled]);
  const changed = () => { clientId.current = newId(); setFailed(false); setError(''); try { if (text) localStorage.setItem(storageKey, JSON.stringify({ text, clientId: clientId.current })); } catch { /* Optional local draft. */ } };
  const previousReply = useRef(reply?.id);
  useEffect(() => { if (previousReply.current !== reply?.id) { previousReply.current = reply?.id; changed(); } }, [reply?.id]);
  const release = (file: PendingFile) => { if (file.preview) URL.revokeObjectURL(file.preview); };
  function removeFile(key: string) { changed(); setFiles(items => { const removed = items.find(file => file.key === key); if (removed) release(removed); return items.filter(file => file.key !== key); }); }
  function selectFiles(event: ChangeEvent<HTMLInputElement>, kind: 'image' | 'document') {
    const chosen = [...(event.target.files || [])]; event.target.value = ''; if (!chosen.length) return;
    if (kind === 'image' && (chosen.some(file => !file.type.startsWith('image/') || file.size > 10 * 1024 ** 2) || chosen.length + files.filter(file => file.kind === 'image').length > 10)) { setError(t.photoLimit); return; }
    if (kind === 'document' && (chosen.length !== 1 || !/\.(pdf|docx|xlsx)$/i.test(chosen[0].name) || chosen[0].size > 15 * 1024 ** 2)) { setError(t.documentLimit); return; }
    changed(); setListing(null); setLocation(undefined);
    setFiles(current => {
      const kept = kind === 'image' ? current.filter(file => file.kind === 'image') : [];
      current.filter(file => !kept.includes(file)).forEach(release);
      return [...kept, ...chosen.map(file => ({ key: newId(), file, kind, progress: 0, ...(kind === 'image' ? { preview: URL.createObjectURL(file) } : {}) }))];
    }); setSheet(null);
  }
  function clearAttachments() { filesRef.current.forEach(release); setFiles([]); setListing(null); setLocation(undefined); }
  async function locate() {
    setSheet('location'); setCandidateLocation(undefined); setError('');
    if (!navigator.geolocation) { setError(t.locationUnsupported); return; }
    navigator.geolocation.getCurrentPosition(position => {
      if (mounted.current && !disabledRef.current) setCandidateLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    }, () => { if (mounted.current) setError(t.locationError); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }
  function stopRecording(discard = false) {
    discardRecording.current = discard;
    const device = recorder.current;
    if (device?.state === 'recording') { finishingRef.current = true; setFinishingRecording(true); device.stop(); }
    stream.current?.getTracks().forEach(track => track.stop()); stream.current = null;
    if (timer.current) clearInterval(timer.current); timer.current = null; setRecording(false);
  }
  async function startRecording() {
    if (disabledRef.current || acquiringMicrophone.current || finishingRef.current || recording || busyRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError(t.recordingUnsupported); return; }
    acquiringMicrophone.current = true; setGettingMicrophone(true); setError(''); pauseChatVoice();
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current || disabledRef.current) { microphone.getTracks().forEach(track => track.stop()); return; }
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
          if (!mounted.current || disabledRef.current || discardRecording.current) return;
          setRecording(false); setFinishingRecording(true); finishingRef.current = true;
          if (!chunks.length) { setError('Запись не сохранилась. Попробуйте ещё раз.'); return; }
          const mime = device.mimeType || chunks[0].type; const blob = new Blob(chunks, { type: mime });
          const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
          const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mime });
          const waveform = await decodeVoiceWaveform(blob);
          if (!mounted.current || disabledRef.current || discardRecording.current) return;
          clearAttachments(); changed(); setFiles([{ key: newId(), file, kind: 'audio', preview: URL.createObjectURL(blob), progress: 0, duration, waveform }]);
        } finally { finishingRef.current = false; if (mounted.current) { setRecording(false); setFinishingRecording(false); } }
      };
      device.start(250); recordingStart.current = Date.now(); setSeconds(0); setRecording(true);
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - recordingStart.current) / 1000); setSeconds(Math.min(180, elapsed)); if (elapsed >= 180) stopRecording(); }, 250);
    } catch { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; recorder.current = null; if (mounted.current) setError(t.microphoneDenied); }
    finally { acquiringMicrophone.current = false; if (mounted.current) setGettingMicrophone(false); }
  }
  async function submit() {
    if (disabled || busyRef.current || recording || acquiringMicrophone.current || finishingRef.current || (edit ? !editText.trim() : !text.trim() && !files.length && !listing && !location)) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      if (edit) { await onEdit(edit, editText.trim()); if (!mounted.current) return; onCancelContext(); return; }
      const attachments: Attachment[] = [];
      for (const pending of files) {
        if (!mounted.current || disabledRef.current) return;
        let uploaded = pending.uploaded;
        if (!uploaded) {
          const file = pending.kind === 'image' ? await optimizeChatImage(pending.file) : pending.file;
          if (!mounted.current || disabledRef.current) return;
          uploaded = await uploadChatAttachment(conversationId, file, pending.kind, progress => { if (mounted.current) setFiles(current => current.map(file => file.key === pending.key ? { ...file, progress } : file)); });
          pending.uploaded = uploaded;
          if (mounted.current) setFiles(current => current.map(file => file.key === pending.key ? { ...file, uploaded, progress: 100 } : file));
        }
        attachments.push(uploaded);
      }
      if (!mounted.current || disabledRef.current) return;
      const kind = listing ? 'listing_reference' : location ? 'location' : files[0]?.kind || 'text';
      const draft: MessageDraft = { clientId: clientId.current, kind, text: text.trim(), ...(attachments.length ? { attachmentIds: attachments.map(file => file.id) } : {}), ...(reply ? { replyToMessageId: reply.id } : {}), ...(listing ? { listingId: listing.id } : {}), ...(location ? { location } : {}) };
      await onSend(draft);
      if (!mounted.current) return;
      clientId.current = newId(); setText(''); clearAttachments(); setFailed(false); onCancelContext();
      try { localStorage.removeItem(storageKey); } catch { /* Optional local draft. */ }
    } catch (cause) { if (mounted.current) { setError(threadError(cause)); setFailed(true); } }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  const canSend = Boolean(text.trim() || files.length || listing || location);
  return <div className="chat-composer">
    {disabled ? <p className="chat-composer-readonly">{t.readonly}</p> : <>
      {(reply || edit) && <div className="chat-composer-context"><span><strong>{edit ? t.editTitle : `${t.replyTitle} · ${reply!.sender.name}`}</strong><small>{messageLabel((edit || reply)!)}</small></span><button className="chat-icon-button" aria-label={t.cancel} disabled={busy} onClick={onCancelContext}><ChatIcon name="close" /></button></div>}
      {files.length > 0 && !edit && <div className="chat-pending-files">{files.map(file => <div className={`chat-pending-file ${file.kind}`} key={file.key}>
        {file.kind === 'image' && <img src={file.preview} alt={file.file.name} />}
        {file.kind === 'audio' && file.preview && <VoiceBubble preview file={{ id: file.key, url: file.preview, duration: file.duration, waveform: file.waveform }} />}
        {file.kind === 'document' && <span><ChatIcon name="file" /><b>{file.file.name}</b><small>{fileSize(file.file.size)}</small></span>}
        <button className="chat-icon-button" aria-label={`${t.removeAttachment}: ${file.file.name}`} disabled={busy} onClick={() => removeFile(file.key)}><ChatIcon name="close" size={16} /></button>
        {busy && !file.uploaded && <progress max={100} value={file.progress} aria-label={t.upload} />}
      </div>)}</div>}
      {listing && !edit && <div className="chat-pending-reference"><ListingCard listing={listing} compact /><button className="chat-icon-button" disabled={busy} aria-label={t.removeAttachment} onClick={() => { changed(); setListing(null); }}><ChatIcon name="close" /></button></div>}
      {location && !edit && <div className="chat-pending-reference"><span><ChatIcon name="location" /> {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</span><button className="chat-icon-button" disabled={busy} aria-label={t.removeAttachment} onClick={() => { changed(); setLocation(undefined); }}><ChatIcon name="close" /></button></div>}
      {error && <ErrorNotice message={error} />}
      {recording ? <div className="chat-recording" role="status"><i className="chat-recording-dot" aria-hidden="true" /><span><strong>{t.recording} · {durationLabel(seconds)}</strong><small>{t.voiceLimit}</small></span><button className="chat-icon-button" aria-label={t.cancel} onClick={() => stopRecording(true)}><ChatIcon name="close" /></button><button className="chat-icon-button" aria-label={t.stop} onClick={() => stopRecording()}><ChatIcon name="stop" /></button></div> : <div className="chat-composer-row" aria-busy={gettingMicrophone || finishingRecording}>
        {!edit && <button className="chat-icon-button chat-composer-circle" aria-label={t.attach} disabled={busy || gettingMicrophone || finishingRecording} onClick={() => setSheet('attach')}><ChatIcon name="plus" /></button>}
        <textarea ref={textarea} value={edit ? editText : text} rows={1} maxLength={4000} disabled={busy || gettingMicrophone || finishingRecording} aria-label={t.message} placeholder={t.placeholder} onChange={event => { if (edit) setEditText(event.target.value); else { changed(); setText(event.target.value); } }} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); void submit(); } }} />
        {canSend || edit ? <button className="chat-send chat-composer-circle" aria-label={busy ? t.sending : failed ? t.retry : edit ? t.save : t.send} disabled={busy || finishingRecording || gettingMicrophone || Boolean(edit && !editText.trim())} onClick={() => void submit()}><ChatIcon name={failed ? 'retry' : 'send'} /></button> : <button className="chat-icon-button chat-composer-circle" aria-label={t.record} disabled={gettingMicrophone || finishingRecording} onClick={() => void startRecording()}><ChatIcon name="mic" /></button>}
      </div>}
      {(busy || failed || gettingMicrophone || finishingRecording || text.length > 3800) && <small className="chat-compose-status" role="status">{gettingMicrophone ? 'Разрешите доступ к микрофону…' : finishingRecording ? 'Подготавливаем запись…' : busy ? t.sending : failed ? t.failed : `${text.length} / 4000`}</small>}
      <input ref={photos} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={event => selectFiles(event, 'image')} />
      <input ref={documentInput} type="file" hidden accept=".pdf,.docx,.xlsx" onChange={event => selectFiles(event, 'document')} />
    </>}
    {sheet === 'attach' && <ChatSheet title={t.attach} onClose={() => setSheet(null)}><div className="chat-attach-options"><button onClick={() => photos.current?.click()}><ChatIcon name="image" />{t.photo}</button><button onClick={() => documentInput.current?.click()}><ChatIcon name="file" />{t.document}</button><button onClick={() => setSheet('listing')}><ChatIcon name="market" />{t.listing}</button><button onClick={() => void locate()}><ChatIcon name="location" />{t.location}</button></div></ChatSheet>}
    {sheet === 'listing' && <ListingPicker onClose={() => setSheet(null)} onSelect={value => { changed(); clearAttachments(); setListing(value); setSheet(null); }} />}
    {sheet === 'location' && <ChatSheet title={t.location} onClose={() => setSheet(null)}>{error ? <ErrorNotice message={error} /> : candidateLocation ? <div className="chat-form"><p>{t.locationPrompt}</p><strong>{candidateLocation.latitude.toFixed(5)}, {candidateLocation.longitude.toFixed(5)}</strong><button className="chat-button" onClick={() => { changed(); clearAttachments(); setLocation(candidateLocation); setSheet(null); }}>{t.locationConfirm}</button></div> : <p role="status">{t.locationFinding}</p>}</ChatSheet>}
  </div>;
}

function ListingPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (listing: ListingReference) => void }) {
  const [query, setQuery] = useState(''); const [items, setItems] = useState<ListingReference[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let active = true; setLoading(true); const timer = setTimeout(() => { void chatApi<{ items: ListingReference[] }>(`/listings?q=${encodeURIComponent(query)}`).then(result => { if (active) { setItems(result.items); setError(''); } }).catch(cause => { if (active) setError(threadError(cause)); }).finally(() => { if (active) setLoading(false); }); }, 250); return () => { active = false; clearTimeout(timer); }; }, [query]);
  return <ChatSheet title={t.listing} onClose={onClose}><div className="chat-form"><input aria-label={t.listingSearch} placeholder={t.listingSearch} value={query} onChange={event => setQuery(event.target.value)} /></div>{error && <ErrorNotice message={error} />}{loading ? <p role="status">{t.loading}</p> : !items.length ? <p className="chat-muted">{t.listingEmpty}</p> : <div className="chat-listing-picker">{items.map(item => <button key={item.id} onClick={() => onSelect(item)}>{item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" />}<span><strong>{item.title}</strong><small>{item.regionName}</small></span><ChatIcon name="attach" /></button>)}</div>}</ChatSheet>;
}
