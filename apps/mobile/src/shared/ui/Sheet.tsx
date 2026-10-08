import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = old; previous?.focus(); };
  }, []);
  return <dialog className={`sheet ${wide ? 'sheet-large' : ''}`} ref={ref} aria-labelledby={titleId} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="sheet-content"><div className="sheet-handle" /><header className="sheet-header"><h2 id={titleId}>{title}</h2><button className="icon-button" aria-label="Закрыть" onClick={onClose}><Icon name="close" /></button></header><div className="sheet-body">{children}</div></div>
  </dialog>;
}
