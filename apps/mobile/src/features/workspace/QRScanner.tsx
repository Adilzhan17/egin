import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { humanError } from '../../entities/workspace/api';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from './ui';

// Keep enough pixels per QR module when reading a code from a laptop screen.
function decode(source: CanvasImageSource, width: number, height: number, maxSize = 1600): string | null {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxSize / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Сканер недоступен в этом браузере.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(pixels.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' })?.data || null;
}

export function QRScanner({ onResult }: { onResult: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true), generation = useRef(0), frame = useRef(0), callback = useRef(onResult);
  callback.current = onResult;
  const [error, setError] = useState(''), [active, setActive] = useState(false), [asking, setAsking] = useState(false);
  function stop() {
    generation.current++;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) { video.current.pause(); video.current.srcObject = null; }
    if (mounted.current) { setActive(false); setAsking(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    return () => { mounted.current = false; stop(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  async function start() {
    stop(); const run = generation.current;
    setError(''); setAsking(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна. Выберите изображение QR.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!mounted.current || run !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const element = video.current!;
      element.srcObject = media;
      // The video is visible while asking, before play(): hidden videos can stall on iOS.
      await element.play();
      if (!mounted.current || run !== generation.current) return;
      setActive(true); setAsking(false);
      let last = 0;
      const scan = (time: number) => {
        if (!mounted.current || run !== generation.current || !stream.current) return;
        try {
          if (time - last >= 250 && element.readyState >= 2 && element.videoWidth) {
            last = time;
            const code = decode(element, element.videoWidth, element.videoHeight);
            if (code) { stop(); callback.current(code); return; }
          }
          frame.current = requestAnimationFrame(scan);
        } catch (e) { stop(); setError(humanError(e)); }
      };
      frame.current = requestAnimationFrame(scan);
    } catch (e) {
      if (mounted.current && run === generation.current) {
        stop(); setError((e as Error).name === 'NotAllowedError' ? 'Разрешите доступ к камере в настройках браузера или выберите изображение QR.' : humanError(e));
      }
    }
  }
  return <div className="qr-scanner">
    <video ref={video} muted autoPlay playsInline className={active || asking ? '' : 'hidden-video'} aria-label="Камера сканера QR" />
    {active || asking ? <><p className="form-help">Наведите заднюю камеру на весь QR. Если код мелкий, приблизьте телефон к экрану.</p><button className="secondary-button" onClick={stop} type="button">{asking ? 'Отменить запуск камеры' : 'Остановить камеру'}</button></> : <button className="secondary-button" type="button" onClick={() => void start()}><Icon name="qr" size={19} />Сканировать QR</button>}
    <label className="file-action text-button">Выбрать изображение QR<input type="file" accept="image/*" aria-label="Изображение QR-кода" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      stop(); setError(''); const run = generation.current;
      try {
        if (file.size > 15 * 1024 * 1024) throw new Error('Изображение слишком большое. Максимум 15 МБ.');
        const url = URL.createObjectURL(file);
        try {
          const image = new Image(); image.src = url; await image.decode();
          if (!mounted.current || run !== generation.current) return;
          const code = decode(image, image.width, image.height, 2000);
          if (!code) throw new Error('QR не найден. Обрежьте изображение ближе к коду или сделайте более чёткий снимок.');
          callback.current(code);
        } finally { URL.revokeObjectURL(url); }
      } catch (e) { if (mounted.current && run === generation.current) setError(humanError(e)); }
    }} /></label><Notice error>{error}</Notice>
  </div>;
}
