import { useEffect, useState, type CSSProperties } from 'react';

export function useThreadViewport() {
  const read = () => {
    const viewport = window.visualViewport;
    const valid = viewport && Math.abs(viewport.scale - 1) < .05;
    const obscured = valid ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    const banner = Math.max(0, ...Array.from(document.querySelectorAll('.mobile-shell > .connection-note'), node => node.getBoundingClientRect().bottom));
    return { inset: obscured > 120 ? Math.round(obscured) : 0, top: valid ? Math.round(viewport.offsetTop) : 0, banner: Math.ceil(banner) };
  };
  const [metrics, setMetrics] = useState(read);
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const next = read(); setMetrics(old => old.inset === next.inset && old.top === next.top && old.banner === next.banner ? old : next); }); };
    const banners = new ResizeObserver(update);
    const observeBanners = () => { banners.disconnect(); document.querySelectorAll('.mobile-shell > .connection-note').forEach(node => banners.observe(node)); update(); };
    const shell = document.querySelector('.mobile-shell');
    const observer = new MutationObserver(observeBanners);
    if (shell) observer.observe(shell, { childList: true });
    observeBanners();
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(frame); banners.disconnect(); observer.disconnect(); viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return { '--chat-keyboard-inset': `${metrics.inset}px`, '--chat-viewport-top': `${metrics.top}px`, '--chat-banner-bottom': `${metrics.banner}px` } as CSSProperties;
}
