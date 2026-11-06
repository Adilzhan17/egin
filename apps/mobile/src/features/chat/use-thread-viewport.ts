import { useEffect, useRef, useState, type CSSProperties } from 'react';

export function useThreadViewport() {
  const baseline = useRef({ width: window.innerWidth, height: window.innerHeight });
  const read = () => {
    const viewport = window.visualViewport;
    const valid = viewport && Math.abs(viewport.scale - 1) < .05;
    const obscured = valid ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    if (Math.abs(window.innerWidth - baseline.current.width) > 80) baseline.current = { width: window.innerWidth, height: window.innerHeight };
    const resized = Math.max(0, baseline.current.height - window.innerHeight);
    const focused = document.activeElement instanceof HTMLElement && !!document.activeElement.closest('.chat-thread textarea, .chat-thread input, .chat-thread [contenteditable="true"]');
    const touchDevice = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const keyboard = touchDevice && (!viewport || !!valid) && focused && (obscured > 120 || resized > 120);
    if (!keyboard && !focused && obscured < 120) baseline.current.height = window.innerHeight;
    const banner = Math.max(0, ...Array.from(document.querySelectorAll('.mobile-shell > .connection-note'), node => node.getBoundingClientRect().bottom));
    return { inset: keyboard && obscured > 120 ? Math.round(obscured) : 0, top: valid ? Math.round(viewport.offsetTop) : 0, banner: Math.ceil(banner), keyboard };
  };
  const [metrics, setMetrics] = useState(read);
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const next = read(); setMetrics(old => old.inset === next.inset && old.top === next.top && old.banner === next.banner && old.keyboard === next.keyboard ? old : next); }); };
    const banners = new ResizeObserver(update);
    const observeBanners = () => { banners.disconnect(); document.querySelectorAll('.mobile-shell > .connection-note').forEach(node => banners.observe(node)); update(); };
    const shell = document.querySelector('.mobile-shell');
    const observer = new MutationObserver(observeBanners);
    if (shell) observer.observe(shell, { childList: true });
    observeBanners();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update); window.addEventListener('resize', update); document.addEventListener('focusin', update); document.addEventListener('focusout', update);
    return () => { cancelAnimationFrame(frame); banners.disconnect(); observer.disconnect(); viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update); };
  }, []);
  return { style: { '--chat-keyboard-inset': `${metrics.inset}px`, '--chat-viewport-top': `${metrics.top}px`, '--chat-banner-bottom': `${metrics.banner}px` } as CSSProperties, keyboard: metrics.keyboard };
}
