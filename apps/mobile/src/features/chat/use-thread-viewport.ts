import { useEffect, useState, type CSSProperties } from 'react';

export function useThreadViewport() {
  const read = () => {
    const viewport = window.visualViewport;
    const valid = viewport && Math.abs(viewport.scale - 1) < .05;
    const obscured = valid ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    return { inset: obscured > 120 ? Math.round(obscured) : 0, top: valid ? Math.round(viewport.offsetTop) : 0 };
  };
  const [metrics, setMetrics] = useState(read);
  useEffect(() => {
    let frame = 0;
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { const next = read(); setMetrics(old => old.inset === next.inset && old.top === next.top ? old : next); }); };
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => { cancelAnimationFrame(frame); viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return { '--chat-keyboard-inset': `${metrics.inset}px`, '--chat-viewport-top': `${metrics.top}px` } as CSSProperties;
}
