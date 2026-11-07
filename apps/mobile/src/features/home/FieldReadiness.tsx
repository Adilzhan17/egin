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
  if (!field) return <section className="field-readiness field-readiness-empty" aria-labelledby="field-readiness-title">
    <h2 id="field-readiness-title">Добавьте свой участок</h2>
    <p className="readiness-empty">Сохраните границы и культуру — EGIN покажет модель растения и прогноз для вашего поля.</p>
    <ol className="readiness-steps"><li>Укажите границы на карте или загрузите файл</li><li>Выберите культуру и назовите участок</li><li>Откройте погоду для его координат</li></ol>
    <a className="readiness-next readiness-add" href="#/fields/new"><span>Добавить участок</span><Icon name="right" size={18}/></a>
    <p className="readiness-note">Можно начать без профиля. Для сохранения предложим войти. Подключать датчик сейчас не требуется.</p>
  </section>;
  return <section className="field-readiness" aria-labelledby="field-readiness-title">
    <header><h2 id="field-readiness-title">Данные участка</h2><Icon name="layers" size={23}/></header>
    {field ? <>
      <a className="readiness-field" href={'#/fields/'+field.id}><span><strong>{field.data.name}</strong><small>{area} га · {field.data.cadastre?.source === 'demo' ? 'Демонстрационный участок' : field.data.boundary ? 'Площадь по контуру' : 'Площадь указана вручную'}</small></span><Icon name="right" size={17}/></a>
      <div className="readiness-sources">
        <a href={'#/fields/'+field.id}><Icon name="map" size={19}/><span><strong>Границы и кадастр</strong><small>{field.data.cadastre?.source === 'demo' ? 'Учебный контур EGIN' : details ? `ЕГКН · получено ${new Date(details.fetchedAt).toLocaleDateString('ru-RU')}` : field.data.boundary ? 'Контур сохранён · паспорт ЕГКН не загружен' : 'Сохранена точка · границ пока нет'}</small></span><Icon name="right" size={15}/></a>
        <a href="#/weather"><Icon name="cloud" size={19}/><span><strong>Погода</strong><small>{state.weather === 'missing' ? weather.loading ? 'Загружаем для этого участка' : 'Нет прогноза для этой точки' : `${state.weather === 'saved' ? 'Сохранённый прогноз' : 'Прогноз получен'} · ${new Date(weather.report!.fetchedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`}</small></span><Icon name="right" size={15}/></a>
        <a href="#/settings/sensors"><Icon name="layers" size={19}/><span><strong>Датчики · {error ? 'не удалось прочитать реестр' : `привязано ${state.sensorCount}`}</strong><small>Приём показаний ещё не подключён</small></span><Icon name="right" size={15}/></a>
      </div>
    </> : <p className="readiness-empty">Участок свяжет карту, прогноз, датчики и события. Сейчас 3D показывает пример культуры.</p>}
    <a href={'#' + state.next.href} className="readiness-next"><span className="readiness-next-label">{field ? 'Следующий шаг' : 'Кадастровая карта Казахстана'}</span><strong>{state.next.title}<Icon name="right" size={18}/></strong><small>{state.next.description}</small></a>
    {field && <p className="readiness-note">Погода и история участка доступны без датчика. Стадию роста можно указать в настройках; почвенные показатели требуют измерений.</p>}
  </section>;
}
