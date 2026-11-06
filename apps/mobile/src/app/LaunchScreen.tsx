import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SplashVariant } from './splash-sequence';
import './launch-screen.css';

type Props = { selection: Promise<SplashVariant | null>; children: ReactNode };

export function LaunchScreen({ selection, children }: Props) {
  const [variant, setVariant] = useState<SplashVariant | null>(null);
  const [phase, setPhase] = useState<'waiting' | 'playing' | 'leaving' | 'done'>('waiting');
  const video = useRef<HTMLVideoElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const finish = () => {
    returnFocus.current = document.activeElement === skip.current;
    setPhase(current => current === 'done' ? current : 'leaving');
  };
  const active = phase !== 'done';

  useEffect(() => {
    let cancelled = false;
    void selection.then(value => {
      if (cancelled) return;
      if (value) setVariant(value);
      else setPhase('done');
    }, () => { if (!cancelled) setPhase('done'); });
    return () => { cancelled = true; };
  }, [selection]);

  useEffect(() => {
    if (!active) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(); }
      if (event.key === 'Tab') { event.preventDefault(); skip.current?.focus(); }
    };
    const hidden = () => { if (document.hidden) setPhase('done'); };
    const pagehide = () => setPhase('done');
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => { if (motion.matches) setPhase('done'); };
    // A hard upper bound also covers a stalled decoder and a missing ended event.
    const deadline = window.setTimeout(() => setPhase('done'), 6000);
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
    if (!active && returnFocus.current) document.getElementById('main')?.focus({ preventScroll: true });
  }, [active]);

  useEffect(() => {
    if (phase !== 'leaving') return;
    const timer = window.setTimeout(() => setPhase('done'), 160);
    return () => clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    const element = video.current;
    if (!element || !variant || !active) return;
    let cancelled = false;
    const startDeadline = window.setTimeout(finish, 2000);
    const playing = () => { clearTimeout(startDeadline); setPhase(current => current === 'waiting' ? 'playing' : current); };
    element.addEventListener('playing', playing);
    skip.current?.focus({ preventScroll: true });
    element.muted = true;
    element.src = `/splash/${variant}-v1.mp4`;
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
  }, [variant, active]);

  return <>
    <div className="launch-app" inert={active} aria-hidden={active ? true : undefined}>{children}</div>
    {active && <div className={`launch-screen${phase === 'leaving' ? ' launch-screen-leaving' : ''}`}
      role="dialog" aria-modal="true" aria-label="Запуск EGIN" data-variant={variant || 'pending'}>
      <div className="launch-frame">
        {variant && <video ref={video} muted playsInline preload="auto"
          disablePictureInPicture aria-hidden="true" onEnded={finish} onError={finish} />}
        <button ref={skip} className="launch-skip" onClick={finish}>Пропустить заставку</button>
      </div>
    </div>}
  </>;
}
