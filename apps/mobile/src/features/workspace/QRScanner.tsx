import { useEffect, useRef, useState } from 'react';
import { createQRDecoder } from './qr-decoder';
import { humanError } from '../../entities/workspace/api';
import { Icon } from '../../shared/ui/Icon';
import { Notice } from './ui';

export function QRScanner({ onResult }: { onResult: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true), generation = useRef(0), frame = useRef(0), callback = useRef(onResult);
  callback.current = onResult;
  const [error, setError] = useState(''), [active, setActive] = useState(false), [asking, setAsking] = useState(false);
  const [reading, setReading] = useState(false), [cameras, setCameras] = useState<MediaDeviceInfo[]>([]), [cameraId, setCameraId] = useState('');
  function stop() {
    generation.current++;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) { video.current.pause(); video.current.srcObject = null; }
    if (mounted.current) { setActive(false); setAsking(false); setReading(false); }
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hide);
    return () => { mounted.current = false; stop(); document.removeEventListener('visibilitychange', hide); };
  }, []);
  async function start(deviceId = '') {
    stop(); const run = generation.current;
    setError(''); setAsking(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Камера недоступна. Выберите изображение QR.');
      const media = await navigator.mediaDevices.getUserMedia({ video: { ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } }), width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      if (!mounted.current || run !== generation.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const track = media.getVideoTracks()[0];
      setCameraId(track?.getSettings().deviceId || deviceId);
      void navigator.mediaDevices.enumerateDevices?.().then(devices => {
        if (mounted.current && run === generation.current) setCameras(devices.filter(device => device.kind === 'videoinput'));
      }).catch(() => {});
      const element = video.current!;
      element.srcObject = media;
      // The video is visible while asking, before play(): hidden videos can stall on iOS.
      await element.play();
      if (!mounted.current || run !== generation.current) return;
      setActive(true); setAsking(false);
      const decode = createQRDecoder();
      let last = 0;
      const scan = async (time: number) => {
        if (!mounted.current || run !== generation.current || !stream.current) return;
        try {
          if (time - last >= 250 && element.readyState >= 2 && element.videoWidth) {
            last = time;
            const code = await decode(element, element.videoWidth, element.videoHeight, false, () => !mounted.current || run !== generation.current);
            if (!mounted.current || run !== generation.current) return;
            if (code) { stop(); callback.current(code); return; }
          }
          frame.current = requestAnimationFrame(scan);
        } catch (e) { if (mounted.current && run === generation.current) { stop(); setError(humanError(e)); } }
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
    {active || asking ? <><p className="form-help">Расположите QR по центру. Если изображение размыто, немного отодвиньте телефон или выберите другую камеру.</p>{active && cameras.length > 1 && <label>Камера<select aria-label="Камера сканера" value={cameraId} onChange={event => void start(event.target.value)}>{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || `Камера ${index + 1}`}</option>)}</select></label>}<button className="secondary-button" onClick={stop} type="button">{asking ? 'Отменить запуск камеры' : 'Остановить камеру'}</button></> : <button className="secondary-button" type="button" onClick={() => void start()}><Icon name="qr" size={19} />Сканировать QR</button>}
    <label className="file-action text-button">Выбрать изображение QR<input type="file" accept="image/*" aria-label="Изображение QR-кода" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
      stop(); setError(''); setReading(true); const run = generation.current;
      try {
        if (file.size > 15 * 1024 * 1024) throw new Error('Изображение слишком большое. Максимум 15 МБ.');
        const url = URL.createObjectURL(file);
        try {
          const image = new Image(); image.src = url; await image.decode();
          if (!mounted.current || run !== generation.current) return;
          if (image.width * image.height > 32_000_000 || Math.max(image.width, image.height) > 10000) throw new Error('Разрешение изображения слишком большое. Обрежьте снимок ближе к QR.');
          const code = await createQRDecoder()(image, image.width, image.height, true, () => !mounted.current || run !== generation.current);
          if (!mounted.current || run !== generation.current) return;
          if (!code) throw new Error('QR не найден. Обрежьте изображение ближе к коду или сделайте более чёткий снимок.');
          callback.current(code);
        } finally { URL.revokeObjectURL(url); }
      } catch (e) { if (mounted.current && run === generation.current) setError(humanError(e)); }
      finally { if (mounted.current && run === generation.current) setReading(false); }
    }} /></label>{reading && <p role="status">Распознаём QR на изображении…</p>}<Notice error>{error}</Notice>
  </div>;
}
