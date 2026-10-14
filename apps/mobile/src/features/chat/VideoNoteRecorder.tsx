import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ChatIcon, ChatSheet, ErrorNotice } from './components';
import { VideoNoteBubble, pauseChatVideoNote } from './VideoNoteBubble';
import { pauseChatVoice } from './VoiceBubble';
import { durationLabel } from './thread-copy';
import './video-note.css';
import { useMotionPhase } from './motion';
const MAX_BYTES = 15 * 1024 ** 2;
const supportedMime = () => typeof MediaRecorder === 'undefined' ? undefined : ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
function cameraError(cause: unknown) {
  const name = cause instanceof Error ? cause.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Доступ к камере или микрофону запрещён. Разрешите его в настройках сайта либо загрузите видео.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Камера или микрофон не найдены. Подключите устройство либо загрузите видео.';
  if (name === 'NotReadableError') return 'Камера или микрофон заняты другим приложением. Закройте его и повторите.';
  return cause instanceof Error ? cause.message : 'Не удалось включить камеру. Повторите или загрузите видео.';
}
export function VideoNoteRecorder({ maxSeconds = 60, onClose, onSend, onRecording }: { maxSeconds?: number; onClose: () => void; onSend: (file: File, duration: number) => Promise<void>; onRecording?: (active: boolean) => void }) {
  const phase = useMotionPhase();
  const limit = Math.max(10, Math.min(180, maxSeconds));
  const [stage, setStage] = useState<'idle' | 'acquiring' | 'preview' | 'recording' | 'finishing' | 'review'>('idle');
  const [facing, setFacing] = useState<'user' | 'environment'>('user'), [seconds, setSeconds] = useState(0), [locked, setLocked] = useState(false), [error, setError] = useState(''), [sending, setSending] = useState(false);
  const [review, setReview] = useState<{ file: File; url: string; duration: number } | null>(null);
  const preview = useRef<HTMLVideoElement>(null), input = useRef<HTMLInputElement>(null), stream = useRef<MediaStream | null>(null), recorder = useRef<MediaRecorder | null>(null);
  const alive = useRef(true), generation = useRef(0), timer = useRef<ReturnType<typeof setInterval> | null>(null), discard = useRef(false), started = useRef(0), url = useRef<string | null>(null), busy = useRef(false);
  const recordingCallback = useRef(onRecording); recordingCallback.current = onRecording;
  const hold = useRef<{ y: number; timer: ReturnType<typeof setTimeout> | null; started: boolean; locked: boolean } | null>(null), suppressClick = useRef(false);
  const capable = !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';
  function releaseCamera() { stream.current?.getTracks().forEach(track => track.stop()); stream.current = null; }
  function clearTimer() { if (timer.current) clearInterval(timer.current); timer.current = null; }
  function releaseReview() { if (url.current) URL.revokeObjectURL(url.current); url.current = null; setReview(null); }
  function stop(cancel = false) {
    discard.current = cancel; clearTimer(); recordingCallback.current?.(false);
    if (recorder.current?.state !== 'inactive' && recorder.current) { setStage('finishing'); try { recorder.current.stop(); } catch { releaseCamera(); setStage('idle'); } }
    else { releaseCamera(); setStage('idle'); }
  }
  useEffect(() => {
    alive.current = true;
    const hide = () => { if (!document.hidden) return; generation.current++; discard.current = false; if (recorder.current?.state === 'recording') stop(); else { releaseCamera(); setStage(current => current === 'review' ? current : 'idle'); } };
    document.addEventListener('visibilitychange', hide);
    return () => { alive.current = false; generation.current++; discard.current = true; if (hold.current?.timer) clearTimeout(hold.current.timer); clearTimer(); recordingCallback.current?.(false); if (recorder.current && recorder.current.state !== 'inactive') { try { recorder.current.stop(); } catch { /* Browser already ended capture. */ } } releaseCamera(); if (url.current) URL.revokeObjectURL(url.current); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => {
    if (phase !== 'exit') return;
    generation.current++; discard.current = true;
    if (hold.current?.timer) clearTimeout(hold.current.timer);
    clearTimer(); recordingCallback.current?.(false);
    if (recorder.current && recorder.current.state !== 'inactive') { try { recorder.current.stop(); } catch { /* Already stopped. */ } }
    releaseCamera(); pauseChatVideoNote();
  }, [phase]);
  useEffect(() => { if (preview.current && stream.current && stage === 'preview') { preview.current.srcObject = stream.current; void preview.current.play().catch(() => {}); } }, [stage, facing]);
  async function acquire(nextFacing = facing) {
    if (!capable || busy.current || recorder.current?.state === 'recording') return;
    const request = ++generation.current; releaseCamera(); releaseReview(); setError(''); setStage('acquiring'); setFacing(nextFacing);
    pauseChatVoice(); pauseChatVideoNote();
    try {
      const device = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: { facingMode: { ideal: nextFacing }, width: { ideal: 640, max: 1280 }, height: { ideal: 640, max: 1280 }, frameRate: { ideal: 24, max: 30 } } });
      if (!alive.current || request !== generation.current || document.hidden) { device.getTracks().forEach(track => track.stop()); return; }
      if (!device.getVideoTracks().length || !device.getAudioTracks().length) { device.getTracks().forEach(track => track.stop()); throw new Error('Для записи нужны камера и микрофон. Можно загрузить готовое видео.'); }
      stream.current = device; setStage('preview');
    } catch (cause) { if (alive.current && request === generation.current) { setError(cameraError(cause)); setStage('idle'); } }
  }
  function begin(held = false) {
    if (!stream.current || recorder.current || stage !== 'preview') return;
    setError(''); discard.current = false; setLocked(!held); pauseChatVoice(); pauseChatVideoNote();
    try {
      const mimeType = supportedMime(); const device = new MediaRecorder(stream.current, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 1_200_000, audioBitsPerSecond: 64_000 });
      recorder.current = device; const chunks: Blob[] = []; let size = 0;
      device.ondataavailable = event => { if (!event.data.size) return; size += event.data.size; if (size > MAX_BYTES) { setError('Запись превысила 15 МБ. Запишите более короткое видео.'); stop(true); return; } chunks.push(event.data); };
      device.onerror = () => { if (alive.current) setError('Запись прервалась. Повторите или загрузите готовое видео.'); stop(true); };
      device.onstop = () => {
        clearTimer(); releaseCamera(); recorder.current = null; recordingCallback.current?.(false);
        if (!alive.current) return;
        if (discard.current || !chunks.length) { setStage('idle'); return; }
        const mime = device.mimeType || chunks[0].type, blob = new Blob(chunks, { type: mime });
        const file = new File([blob], `video-note-${Date.now()}.${mime.includes('mp4') ? 'mp4' : 'webm'}`, { type: mime });
        if (url.current) URL.revokeObjectURL(url.current); url.current = URL.createObjectURL(blob);
        setReview({ file, url: url.current, duration: Math.min(limit, Math.max(.1, (performance.now() - started.current) / 1000)) }); setStage('review');
      };
      started.current = performance.now(); device.start(200); setSeconds(0); setStage('recording'); recordingCallback.current?.(true);
      timer.current = setInterval(() => { const elapsed = (performance.now() - started.current) / 1000; setSeconds(Math.min(limit, elapsed)); recordingCallback.current?.(true); if (elapsed >= limit) stop(); }, 100);
    } catch (cause) { recorder.current = null; releaseCamera(); setStage('idle'); setError(cameraError(cause)); }
  }
  function pointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (stage !== 'preview' || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId); const state = { y: event.clientY, started: false, locked: false, timer: null as ReturnType<typeof setTimeout> | null };
    state.timer = setTimeout(() => { state.started = true; suppressClick.current = true; begin(true); }, 260); hold.current = state;
  }
  function pointerUp(cancel = false) {
    const current = hold.current; if (!current) return; if (current.timer) clearTimeout(current.timer);
    if (current.started && !current.locked) stop(cancel); hold.current = null;
  }
  async function select(file?: File) {
    if (!file) return;
    if (!/^(video\/(mp4|quicktime|webm))/.test(file.type) || file.size > MAX_BYTES || !file.size) { setError('Выберите MP4, MOV или WebM до 15 МБ.'); return; }
    const operation = ++generation.current; releaseCamera(); releaseReview(); setError(''); setStage('finishing');
    const source = URL.createObjectURL(file), element = document.createElement('video'); element.preload = 'metadata';
    try {
      const duration = await new Promise<number>((resolve, reject) => { const timeout = setTimeout(() => { element.removeAttribute('src'); reject(new Error('Не удалось прочитать длительность. Выберите другое видео.')); }, 8000); element.onloadedmetadata = () => { clearTimeout(timeout); resolve(element.duration); }; element.onerror = () => { clearTimeout(timeout); reject(new Error('Браузер не смог прочитать это видео. Выберите MP4.')); }; element.src = source; });
      if (!alive.current || operation !== generation.current) { URL.revokeObjectURL(source); return; }
      // Duration-less WebM is independently decoded and bounded by the server.
      if (Number.isFinite(duration) && (duration <= 0 || duration > limit + .3)) throw new Error(`Видеозаметка должна быть не длиннее ${limit} секунд.`);
      url.current = source; setReview({ file, url: source, duration: Number.isFinite(duration) ? duration : 0 }); setStage('review');
    } catch (cause) { URL.revokeObjectURL(source); if (alive.current && operation === generation.current) { setError(cameraError(cause)); setStage('idle'); } }
    finally { element.removeAttribute('src'); element.load(); }
  }
  async function send() {
    if (!review || busy.current) return; busy.current = true; setSending(true); setError('');
    try { await onSend(review.file, review.duration); if (alive.current) onClose(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'Не удалось сохранить запись в очередь отправки.'); }
    finally { busy.current = false; if (alive.current) setSending(false); }
  }
  return <ChatSheet title="Видеозаметка" onClose={onClose} dismissDisabled={sending}>
    <div className="chat-video-recorder" data-stage={stage}>
      <p className="chat-muted">До {limit} секунд · до 15 МБ. Камера и микрофон выключатся после записи.</p>
      {stage === 'review' && review ? <VideoNoteBubble file={{ id: 'preview', url: review.url, duration: review.duration }}/> : <div className="chat-video-camera" data-mirrored={facing === 'user'}><video ref={preview} autoPlay muted playsInline/>{!['preview', 'recording'].includes(stage) && <span><ChatIcon name="camera" size={44}/></span>}{stage === 'recording' && <b className="chat-video-recording-dot"/>}</div>}
      {stage === 'recording' && <p className="chat-video-countdown" role="timer">{durationLabel(seconds)} <span>осталось {durationLabel(Math.max(0, limit - seconds))}</span>{locked && <ChatIcon name="lock" size={18}/>}</p>}
      <ErrorNotice message={error}/>
      {!capable && <p role="status">Запись в этом браузере недоступна. Загрузите готовое видео.</p>}
      {stage === 'acquiring' && <p role="status">Разрешите доступ к камере и микрофону…</p>}
      {stage === 'finishing' && <p role="status">Подготавливаем запись…</p>}
      {stage === 'idle' && capable && <button className="chat-button" onClick={() => void acquire()}>Включить камеру</button>}
      {(stage === 'preview' || stage === 'recording') && <div className="chat-video-record-actions">
        <button className="chat-icon-button" aria-label="Отменить запись" onClick={() => { generation.current++; stop(true); }}><ChatIcon name="close"/></button>
        <button className="chat-video-record-button" aria-label={stage === 'recording' ? 'Завершить запись' : 'Начать запись видеозаметки'} onPointerDown={pointerDown} onPointerMove={event => { const current = hold.current; if (current?.started && current.y - event.clientY > 55) { current.locked = true; setLocked(true); } }} onPointerUp={() => pointerUp()} onPointerCancel={() => { pointerUp(true); suppressClick.current = false; }} onContextMenu={event => event.preventDefault()} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } if (stage === 'recording') stop(); else begin(); }}><ChatIcon name={stage === 'recording' ? 'stop' : 'camera'}/></button>
        <button className="chat-icon-button" aria-label="Переключить камеру" disabled={stage === 'recording'} onClick={() => void acquire(facing === 'user' ? 'environment' : 'user')}><ChatIcon name="switch-camera"/></button>
      </div>}
      {stage === 'preview' && <small>Нажмите для записи. Или удерживайте и сдвиньте вверх, чтобы зафиксировать.</small>}
      {stage === 'recording' && <small>{locked ? 'Нажмите ■, чтобы закончить и посмотреть.' : 'Отпустите для просмотра · вверх — продолжить без удержания'}</small>}
      {stage === 'review' && <div className="chat-video-review-actions"><button className="chat-button secondary" disabled={sending} onClick={() => { releaseReview(); setStage('idle'); }}>Удалить запись</button>{capable && <button className="chat-button secondary" disabled={sending} onClick={() => void acquire()}>Перезаписать</button>}<button className="chat-button" disabled={sending} onClick={() => void send()}>{sending ? 'Сохраняем…' : 'Отправить видеозаметку'}</button></div>}
      {['idle', 'preview', 'review'].includes(stage) && <button className="chat-text-button" disabled={sending} onClick={() => input.current?.click()}>Загрузить видеофайл</button>}
      <input ref={input} type="file" hidden accept="video/mp4,video/quicktime,video/webm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void select(file); }}/>
    </div>
  </ChatSheet>;
}
