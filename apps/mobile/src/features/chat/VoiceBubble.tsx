import { useEffect, useMemo, useRef, useState } from 'react';
import type { Attachment } from './types';
import { ChatIcon } from './components';
import { durationLabel } from './thread-copy';
import './voice.css';

// Claim playback before play() resolves, so two rapid taps cannot start two files.
let activeAudio: HTMLAudioElement | null = null;
export function pauseChatVoice() { activeAudio?.pause(); activeAudio = null; }

const flatWaveform = Array.from({ length: 40 }, () => .12);
const finiteDuration = (value?: number) => value && Number.isFinite(value) && value > 0 ? value : 0;
type VoiceFile = Pick<Attachment, 'id' | 'url'> & Partial<Pick<Attachment, 'duration' | 'waveform'>>;

/** Preview peaks come from the recorded signal. Stored messages use server peaks. */
export async function decodeVoiceWaveform(blob: Blob): Promise<number[] | undefined> {
  let context: AudioContext | undefined;
  try {
    context = new AudioContext();
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const samples = decoded.getChannelData(0); const peaks: number[] = [];
    for (let i = 0; i < 40; i++) {
      const start = Math.floor(i * samples.length / 40), end = Math.floor((i + 1) * samples.length / 40);
      let peak = 0;
      for (let at = start; at < end; at++) peak = Math.max(peak, Math.abs(samples[at]));
      peaks.push(peak);
    }
    const maximum = Math.max(...peaks, .001);
    return peaks.map(peak => Math.min(1, peak / maximum));
  } catch { return undefined; }
  finally { if (context && context.state !== 'closed') await context.close().catch(() => {}); }
}

export function VoiceBubble({ file, preview = false }: { file: VoiceFile; preview?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(false);
  const [position, setPosition] = useState(0), [duration, setDuration] = useState(finiteDuration(file.duration));
  const [speed, setSpeed] = useState(1); const pendingSeek = useRef<number | null>(null); const alive = useRef(true);
  const peaks = useMemo(() => file.waveform?.length && file.waveform.every(value => Number.isFinite(value) && value >= 0 && value <= 1) ? file.waveform.slice(0, 80) : flatWaveform, [file.waveform]);
  useEffect(() => {
    alive.current = true; const element = audio.current;
    if (element && element.getAttribute('src') !== file.url) element.src = file.url;
    setPlaying(false); setLoading(false); setError(false); setPosition(0); setDuration(finiteDuration(file.duration)); pendingSeek.current = null;
    return () => {
      alive.current = false;
      if (element) { element.pause(); if (activeAudio === element) activeAudio = null; element.removeAttribute('src'); element.load(); }
    };
  }, [file.url]);
  function metadata() {
    const element = audio.current; if (!element) return;
    const length = finiteDuration(element.duration) || finiteDuration(file.duration); setDuration(length);
    if (pendingSeek.current !== null && length) { element.currentTime = Math.min(pendingSeek.current, length); pendingSeek.current = null; }
  }
  async function toggle() {
    const element = audio.current; if (!element) return;
    if (activeAudio === element && (!element.paused || loading)) { pauseChatVoice(); setLoading(false); return; }
    if (activeAudio !== element) pauseChatVoice(); activeAudio = element;
    setError(false); setLoading(true);
    if (element.error) element.load();
    if (element.ended) element.currentTime = 0;
    element.playbackRate = speed;
    try { await element.play(); if (activeAudio !== element || !alive.current) element.pause(); }
    catch (cause) { if (alive.current && activeAudio === element && !(cause instanceof DOMException && cause.name === 'AbortError')) { setError(true); activeAudio = null; } }
    finally { if (alive.current) setLoading(false); }
  }
  function seek(value: number) {
    const element = audio.current; if (!element || !duration) return;
    const next = Math.max(0, Math.min(duration, value)); setPosition(next);
    if (element.readyState) element.currentTime = next;
    else { pendingSeek.current = next; element.load(); }
  }
  function changeSpeed() { const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1; setSpeed(next); if (audio.current) audio.current.playbackRate = next; }
  const progress = duration ? position / duration : 0;
  return <div className="chat-voice" data-voice-id={file.id} data-playing={playing} data-waveform={peaks === flatWaveform ? 'fallback' : 'signal'} aria-label={preview ? 'Предпросмотр голосового' : 'Голосовое сообщение'}>
    <audio ref={audio} src={file.url} preload="metadata" hidden onLoadedMetadata={metadata} onDurationChange={metadata}
      onPlay={() => { if (activeAudio !== audio.current) { audio.current?.pause(); return; } setPlaying(true); }} onPause={() => { setPlaying(false); setLoading(false); }}
      onTimeUpdate={() => setPosition(audio.current?.currentTime || 0)} onWaiting={() => setLoading(true)} onPlaying={() => setLoading(false)}
      onEnded={() => { setPlaying(false); setLoading(false); if (activeAudio === audio.current) activeAudio = null; }}
      onError={() => { if (alive.current) { setError(true); setPlaying(false); setLoading(false); } }} />
    <button type="button" className="chat-voice-toggle" aria-label={error ? 'Повторить воспроизведение' : playing || loading ? 'Приостановить голосовое' : 'Воспроизвести голосовое'} aria-busy={loading} onClick={() => void toggle()}><ChatIcon name={error ? 'retry' : playing || loading ? 'pause' : 'play'} size={22} /></button>
    <div className="chat-voice-side">
      <div className="chat-voice-waveform">
        <div className="chat-voice-bars" aria-hidden="true">{peaks.map((peak, index) => <i key={index} className={progress > index / peaks.length ? 'played' : ''} style={{ height: `${4 + peak * 25}px` }} />)}</div>
        <input type="range" min={0} max={duration || 1} step={.1} value={Math.min(position, duration || 1)} disabled={!duration} aria-label="Перемотка голосового" aria-valuetext={`${durationLabel(position)} из ${durationLabel(duration)}`} onChange={event => seek(Number(event.target.value))} />
      </div>
      <div className="chat-voice-bottom"><span className="chat-voice-time">{error ? 'Не загрузилось' : loading ? 'Загрузка…' : position > 0 ? `${durationLabel(position)} / ${durationLabel(duration)}` : duration ? durationLabel(duration) : '—:—'}</span><button type="button" className="chat-voice-speed" aria-label={`Скорость воспроизведения ${speed}×`} onClick={changeSpeed}>{speed}×</button></div>
    </div>
  </div>;
}
