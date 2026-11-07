import { useEffect, useRef, useState, type ReactNode } from 'react';
import splashUrl from './media/egin-v2.mp4?url';
import emblemUrl from '../shared/brand/emblem.png?url';
import './launch-screen.css';

type Props = { enabled: boolean; children: ReactNode };

export function LaunchScreen({ enabled, children }: Props) {
  const [phase, setPhase] = useState<'waiting' | 'playing' | 'leaving' | 'done'>(enabled ? 'waiting' : 'done');
  const video = useRef<HTMLVideoElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);
  const close = () => {
    returnFocus.current ||= document.activeElement === overlay.current;
    setPhase('done');
  };
  const finish = () => {
    returnFocus.current ||= document.activeElement === overlay.current;
    setPhase(current => current === 'done' ? current : 'leaving');
  };
  const active = phase !== 'done';

  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      if (event.key === 'Tab') { event.preventDefault(); overlay.current?.focus(); }
    };
    const hidden = () => { if (document.hidden) close(); };
    const pagehide = close;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => { if (motion.matches) close(); };
    // A hard upper bound also covers a stalled decoder and a missing ended event.
    const deadline = window.setTimeout(close, 8000);
    document.addEventListener('keydown', escape);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pagehide);
    motion.addEventListener('change', reduced);
    return () => {
      document.body.style.overflow = overflow;
      clearTimeout(deadline);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pagehide);
      motion.removeEventListener('change', reduced);
    };
  }, [active]);

  useEffect(() => {
    if (active || !returnFocus.current) return;
    // WebKit must apply the removal of inert/visibility before accepting focus.
    const frame = requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('done'), 160);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const element = video.current;
    if (!element || !active) return;
    let cancelled = false;
    // Give a cold mobile connection time to load; the original emblem is the poster.
    const startDeadline = window.setTimeout(finish, 5000);
    const playing = () => { clearTimeout(startDeadline); setPhase(current => current === 'waiting' ? 'playing' : current); };
    element.addEventListener('playing', playing);
    overlay.current?.focus({ preventScroll: true });
    element.muted = true;
    element.src = splashUrl;
    void element.play().catch(() => { if (!cancelled) finish(); });
    return () => {
      cancelled = true;
      clearTimeout(startDeadline);
      element.removeEventListener('playing', playing);
      element.pause();
      // Release decoder/network resources, including on StrictMode cleanup.
      element.removeAttribute('src');
      element.load();
    };
  }, [active]);

  return <>
    <div className="launch-app" inert={active} aria-hidden={active ? true : undefined}>{children}</div>
    {active && <div ref={overlay} tabIndex={-1} className={`launch-screen${phase === 'leaving' ? ' launch-screen-leaving' : ''}`}
      role="dialog" aria-modal="true" aria-label="Запуск EGIN">
      <div className="launch-frame">
        <video ref={video} muted playsInline preload="auto" poster={emblemUrl}
          disablePictureInPicture aria-hidden="true" onEnded={finish} onError={finish} />
      </div>
    </div>}
  </>;
}
