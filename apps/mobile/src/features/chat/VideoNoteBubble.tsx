import { useEffect, useRef, useState } from 'react';
import type { Attachment } from './types';
import { ChatIcon } from './components';
import { pauseChatVoice } from './VoiceBubble';
import { durationLabel } from './thread-copy';
import './video-note.css';
import { useMotionPhase } from './motion';
let activeVideo: HTMLVideoElement | null = null;
export function pauseChatVideoNote() { activeVideo?.pause(); activeVideo = null; }
type VideoFile = Pick<Attachment, 'id' | 'url'> & Partial<Pick<Attachment, 'duration' | 'thumbnailUrl'>>;
/** Playback progress is local media state; no fabricated viewed receipt is sent. */
export function VideoNoteBubble({ file }: { file: VideoFile }) {
  const video = useRef<HTMLVideoElement>(null), alive = useRef(true), request = useRef(0);
  const phase = useMotionPhase();
  const [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [position, setPosition] = useState(0), [duration, setDuration] = useState(file.duration || 0);
  useEffect(() => {
    alive.current = true; const element = video.current;
    setPosition(0); setDuration(file.duration || 0); setPlaying(false); setError('');
    const pause = () => { request.current++; element?.pause(); if (activeVideo === element) activeVideo = null; setLoading(false); };
    const hidden = () => { if (document.hidden) pause(); };
    window.addEventListener('egin:audio-play', pause); document.addEventListener('visibilitychange', hidden);
    return () => { alive.current = false; request.current++; element?.pause(); if (activeVideo === element) activeVideo = null; window.removeEventListener('egin:audio-play', pause); document.removeEventListener('visibilitychange', hidden); };
  }, [file.url, file.duration]);
  useEffect(() => { if (phase === 'exit') { request.current++; video.current?.pause(); if (activeVideo === video.current) activeVideo = null; setLoading(false); } }, [phase]);
  async function toggle() {
    const element = video.current; if (!element) return;
    if (!element.paused || loading) { request.current++; element.pause(); if (activeVideo === element) activeVideo = null; setLoading(false); return; }
    const operation = ++request.current;
    pauseChatVoice(); if (activeVideo !== element) activeVideo?.pause(); activeVideo = element;
    if (element.ended) element.currentTime = 0;
    if (error) element.load(); setError(''); setLoading(true);
    try { await element.play(); if (!alive.current || activeVideo !== element) element.pause(); }
    catch (cause) { if (operation === request.current && alive.current && !(cause instanceof DOMException && cause.name === 'AbortError')) { setError('Не удалось воспроизвести. Нажмите, чтобы повторить.'); setLoading(false); } }
  }
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  return <div className="chat-video-note" data-playing={playing}>
    <button className="chat-video-note-player" aria-label={playing || loading ? 'Пауза видеозаметки' : 'Воспроизвести видеозаметку'} aria-pressed={playing} aria-busy={loading} onClick={() => void toggle()}>
      <video ref={video} src={file.url} poster={file.thumbnailUrl} playsInline preload="metadata" onLoadedMetadata={() => { const value = video.current?.duration; if (value && Number.isFinite(value)) setDuration(value); }} onTimeUpdate={() => setPosition(video.current?.currentTime || 0)} onPlay={() => { if (activeVideo !== video.current) { video.current?.pause(); return; } setPlaying(true); }} onPause={() => { setPlaying(false); setLoading(false); }} onPlaying={() => setLoading(false)} onWaiting={() => setLoading(true)} onEnded={() => { setPlaying(false); setLoading(false); }} onError={() => { setError('Видео недоступно. Нажмите, чтобы повторить.'); setLoading(false); }} />
      <svg className="chat-video-note-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48"/><circle cx="50" cy="50" r="48" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress * 100}/></svg>
      <span className="chat-video-note-play" aria-hidden="true" data-visible={!playing}><ChatIcon name={loading ? 'pause' : 'play'} size={26}/></span>
      <span className="chat-video-note-time">{loading ? 'Загрузка…' : durationLabel(Math.max(0, duration - position))}</span>
    </button>
    <span className="chat-video-note-progress" role="progressbar" aria-label="Воспроизведение видеозаметки" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}/>
    {error && <small className="chat-video-note-error" role="status">{error}</small>}
  </div>;
}
