import { useEffect, useState } from 'react';
import { useMeta, useRows } from '../../entities/workspace/hooks';
import type { Field, Row, Sensor } from '../../entities/workspace/types';
import type { WeatherState } from '../../entities/weather/use-weather';
import { Icon } from '../../shared/ui/Icon';
import { fieldReadiness } from './field-readiness';
import './field-readiness.css';

export function FieldReadiness({ activeField, weather }: { activeField?: Row<Field>; weather: WeatherState }) {
  const who = useMeta('owner', 'guest'), { rows: sensors, error } = useRows<Sensor>('sensor');
  const field = activeField?.owner === who ? activeField : undefined;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const update = () => { if (!document.hidden) setNow(Date.now()); }; const timer = setInterval(update, 60000); document.addEventListener('visibilitychange', update); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); }; }, []);
  const state = fieldReadiness(field, sensors, weather.report, weather.cached, now), details = field?.data.cadastre?.details;
  const area = field ? new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(field.data.area) : '';
  return <section className="field-readiness" aria-labelledby="field-readiness-title">
    <header><div><span className="eyebrow">Данные для мониторинга</span><h2 id="field-readiness-title">{field ? 'Данные участка' : 'Начните со своей земли'}</h2></div><Icon name="layers" size={23}/></header>
    {field ? <>
      <a className="readiness-field" href="#/fields"><span><strong>{field.data.name}</strong><small>{area} га · {field.data.cadastre?.source === 'demo' ? 'Демонстрационный участок' : field.data.boundary ? 'Площадь по контуру' : 'Площадь указана вручную'}</small></span><Icon name="right" size={17}/></a>
      <div className="readiness-sources">
        <a href="#/fields"><Icon name="map" size={19}/><span><strong>Границы и кадастр</strong><small>{field.data.cadastre?.source === 'demo' ? 'Учебный контур EGIN' : details ? `ЕГКН · получено ${new Date(details.fetchedAt).toLocaleDateString('ru-RU')}` : field.data.boundary ? 'Контур сохранён · паспорт ЕГКН не загружен' : 'Сохранена точка · границ пока нет'}</small></span><Icon name="right" size={15}/></a>
        <a href="#/weather"><Icon name="cloud" size={19}/><span><strong>Погода</strong><small>{state.weather === 'missing' ? weather.loading ? 'Загружаем для этого участка' : 'Нет прогноза для этой точки' : `${state.weather === 'saved' ? 'Сохранённый прогноз' : 'Прогноз получен'} · ${new Date(weather.report!.fetchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</small></span><Icon name="right" size={15}/></a>
        <a href="#/settings/sensors"><Icon name="layers" size={19}/><span><strong>Датчики · {error ? 'не удалось прочитать реестр' : `привязано ${state.sensorCount}`}</strong><small>Приём показаний ещё не подключён</small></span><Icon name="right" size={15}/></a>
      </div>
    </> : <p className="readiness-empty">Участок свяжет карту, прогноз, датчики и события. Сейчас 3D показывает пример культуры.</p>}
    <a href={'#' + state.next.href} className="readiness-next"><span className="readiness-next-label">{field ? 'Следующий шаг' : 'Кадастровая карта Казахстана'}</span><strong>{state.next.title}<Icon name="right" size={18}/></strong><small>{state.next.description}</small></a>
    {field && <p className="readiness-note">Фаза роста и состояние почвы появятся после подключения измерений и аналитики.</p>}
  </section>;
}
