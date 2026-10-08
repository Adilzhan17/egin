import { useEffect, useRef, useState } from 'react';
import type { SceneOptions } from './create-scene';
import { Icon } from '../../../shared/ui/Icon';

export default function CropScene({ options }: { options: SceneOptions }) {
  const host = useRef<HTMLDivElement>(null), controller = useRef<ReturnType<typeof import('./create-scene').createScene> | null>(null);
  const latest = useRef(options); latest.current = options;
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false), [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setReady(false); setFailed(false); setZoom(1);
    import('./create-scene').then(({ createScene }) => {
      if (cancelled || !host.current) return;
      try { controller.current = createScene(host.current, latest.current); setReady(true); } catch { setFailed(true); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; controller.current?.dispose(); controller.current = null; };
  }, [options.crop, options.stage]);
  useEffect(() => { controller.current?.update(options); }, [options]);
  return <>
    <div ref={host} className="crop-canvas" data-zoom={zoom.toFixed(1)} data-roots={options.roots} data-period={options.timeOfDay} data-ready={ready} data-crop={options.crop} data-weather={options.weather} data-stage={options.stage} data-condition={options.condition ?? options.weather} data-night={options.isDaytime === false} role="img" aria-label={`Интерактивная 3D-модель культуры. ${options.timeOfDay === 'night' ? 'Ночь. ' : ''}${({ rain: 'Дождь', snow: 'Снег', cloud: 'Облачно', storm: 'Гроза', fog: 'Туман', wind: 'Ветер', night: 'Ночь', sun: 'Ясно' })[options.condition ?? options.weather]}. Поверните горизонтальным движением.`} />
    {!ready && !failed && <div className="scene-loading"><span /><span /><span /><p>Выращиваем вашу модель…</p></div>}
    {failed && <div className="scene-fallback"><Icon name="wheat" size={80} /><p>3D недоступно на этом устройстве</p><small>Погода и доступные данные остаются доступны.</small></div>}
    {ready && <div className="scene-camera" role="group" aria-label="Управление камерой">
      <button aria-label="Отдалить модель" disabled={zoom <= .8} onClick={() => { const next = Math.max(.8, +(zoom - .1).toFixed(1)); setZoom(next); controller.current?.setZoom(next); }}><Icon name="minus" size={18} /></button>
      <button aria-label="Сбросить ракурс" onClick={() => { setZoom(1); controller.current?.resetView(); }}><Icon name="rotate" size={18} /></button>
      <button aria-label="Приблизить модель" disabled={zoom >= 1.5} onClick={() => { const next = Math.min(1.5, +(zoom + .1).toFixed(1)); setZoom(next); controller.current?.setZoom(next); }}><Icon name="plus" size={18} /></button>
    </div>}

  </>;
}
