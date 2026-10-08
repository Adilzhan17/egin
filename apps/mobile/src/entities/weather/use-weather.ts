import { useEffect, useState } from 'react';
import type { CropId } from '../field/types';
import type { LiveWeatherReport } from './live-types';
import { openMeteo, readWeatherCache, saveWeatherCache } from './open-meteo';
export type WeatherState = { report: LiveWeatherReport | null; loading: boolean; error: string | null; cached: boolean; refresh: () => void };
export function useWeather(crop: CropId, location?: LiveWeatherReport['location']): WeatherState {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ crop: CropId; report: LiveWeatherReport | null; loading: boolean; error: string | null; cached: boolean }>(() => ({ crop, report: readWeatherCache(crop, location), loading: true, error: null, cached: true }));
  useEffect(() => {
    const controller = new AbortController();
    const cache = readWeatherCache(crop, location);
    setState({ crop, report: cache, loading: true, error: null, cached: !!cache });
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    let cancelled = false;
    openMeteo.getReport(crop, controller.signal, location).then(report => {
      if (cancelled) return;
      saveWeatherCache(report); setState({ crop, report, loading: false, error: null, cached: false });
    }).catch(() => {
      if (cancelled) return;
      setState({ crop, report: cache, loading: false, cached: !!cache, error: cache ? 'Нет связи. Показан сохранённый прогноз.' : 'Не удалось загрузить погоду. Проверьте соединение.' });
    }).finally(() => clearTimeout(timeout));
    const refresh = () => { if (!document.hidden) setRevision(n => n + 1); };
    const interval = window.setInterval(refresh, 15 * 60 * 1000);
    window.addEventListener('online', refresh);
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); clearInterval(interval); window.removeEventListener('online', refresh); };
  }, [crop, revision, location?.latitude, location?.longitude, location?.name]);
  return { ...(state.crop === crop ? state : { report: null, loading: true, error: null, cached: false }), refresh: () => setRevision(n => n + 1) };
}
