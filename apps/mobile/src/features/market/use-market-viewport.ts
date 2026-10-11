import { useEffect, useState, type CSSProperties } from 'react';

type ViewportMetrics = { height: number; offsetTop: number; scale: number };
export function marketViewportMetrics(layoutHeight: number, viewport?: ViewportMetrics | null) {
  const unzoomed = !viewport || Math.abs(viewport.scale - 1) < 0.05;
  const obscured = viewport && unzoomed ? Math.max(0, layoutHeight - viewport.height - viewport.offsetTop) : 0;
  return { keyboardInset: obscured > 120 ? Math.round(obscured) : 0, height: Math.round(viewport && unzoomed ? viewport.height : layoutHeight) };
}

/** Viewport variables belong to Market elements only; the app shell is untouched. */
export function useMarketViewport() {
  const read = () => marketViewportMetrics(window.innerHeight, window.visualViewport);
  const [metrics, setMetrics] = useState(read);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = read();
        setMetrics(current => current.height === next.height && current.keyboardInset === next.keyboardInset ? current : next);
      });
    };
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return { keyboardVisible: metrics.keyboardInset > 0, style: {
    '--market-keyboard-inset': `${metrics.keyboardInset}px`,
    '--market-viewport-height': `${metrics.height}px`,
  } as CSSProperties };
}
