import type { CSSProperties } from 'react';
import type { ForecastDay, Reading } from '../../entities/weather/live-types';
import { localTime } from '../../entities/weather/open-meteo';
import { Icon, type IconName } from '../../shared/ui/Icon';

export const value = (n: number | null | undefined, unit = '') => n == null || !Number.isFinite(n) ? '—' : `${n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}${unit}`;
export const metricInfo = {
  feelsLike: { title: 'Ощущается как', icon: 'temperature', unit: '°', description: 'Ощущаемая температура с учётом ветра, влажности и солнечного излучения. Это расчёт погодной модели.' },
  uvIndex: { title: 'УФ-индекс', icon: 'sun', unit: '', description: 'Интенсивность ультрафиолетового излучения. 0–2 — низкая, 3–5 — умеренная, 6–7 — высокая, 8–10 — очень высокая, 11 и выше — экстремальная.' },
  wind: { title: 'Ветер', icon: 'wind', unit: ' км/ч', description: 'Скорость ветра на высоте 10 м. Направление показывает, откуда дует ветер. Стрелка на компасе направлена по движению воздуха.' },
  sunrise: { title: 'Солнце', icon: 'sunrise', unit: '', description: 'Восход и закат для координат участка. Время указано по Казахстану, UTC+5.' },
  rain: { title: 'Осадки', icon: 'rain', unit: ' мм', description: 'Количество осадков за выбранный час, включая дождь и водный эквивалент снега. 1 мм соответствует 1 литру на квадратный метр.' },
  visibility: { title: 'Видимость', icon: 'eye', unit: ' км', description: 'Горизонтальная дальность видимости у поверхности по погодной модели. Туман и осадки могут её снижать.' },
  humidity: { title: 'Влажность', icon: 'humidity', unit: '%', description: 'Относительная влажность воздуха на высоте 2 м. Это не влажность почвы.' },
  pressure: { title: 'Давление', icon: 'pressure', unit: ' гПа', description: 'Атмосферное давление, приведённое к уровню моря. Его удобно сравнивать между участками разной высоты.' },
  cloudCover: { title: 'Облачность', icon: 'cloud', unit: '%', description: 'Доля неба, покрытая облаками, по погодной модели.' },
  dewPoint: { title: 'Точка росы', icon: 'drop', unit: '°', description: 'Температура, при которой водяной пар начинает конденсироваться. Чем она ближе к температуре воздуха, тем выше влажность.' },
  wetBulb: { title: 'Влажный термометр', icon: 'temperature', unit: '°', description: 'Температура влажного термометра по модели Open-Meteo. Учитывает охлаждение за счёт испарения.' },
  rainProbability: { title: 'Вероятность осадков', icon: 'rain', unit: '%', description: 'Вероятность осадков в выбранный час. Она не означает долю времени, в течение которого будет идти дождь.' },
  thunderProbability: { title: 'Вероятность грозы', icon: 'storm', unit: '%', description: 'Этот источник не предоставляет отдельную вероятность грозы. Фактический прогноз грозы может отображаться в описании погоды.' },
  heatIndex: { title: 'Тепловой индекс', icon: 'sun', unit: '°', description: 'Отдельный тепловой индекс не предоставляется этим источником. Ощущаемая температура показана отдельной карточкой.' },
  windChill: { title: 'Охлаждение ветром', icon: 'snow', unit: '°', description: 'Отдельный индекс охлаждения ветром не предоставляется этим источником. Влияние ветра учитывается в ощущаемой температуре.' },
} satisfies Record<string, { title: string; icon: IconName; unit: string; description: string }>;
export type MetricKey = keyof typeof metricInfo;
export const mainMetrics: MetricKey[] = ['wind', 'feelsLike', 'humidity', 'rain', 'sunrise', 'pressure', 'visibility', 'cloudCover', 'uvIndex'];
export const extraMetrics: MetricKey[] = ['dewPoint', 'wetBulb', 'rainProbability', 'thunderProbability', 'heatIndex', 'windChill'];
export function WindCompass({ reading }: { reading: Reading }) {
  return <div className="wind-compass" aria-label={`Ветер с ${reading.windDirection}, ${value(reading.windDegrees, '°')}`}><span className="compass-n">С</span><span className="compass-e">В</span><span className="compass-s">Ю</span><span className="compass-w">З</span><div className="compass-ring" />{reading.windDegrees !== null && <div className="compass-arrow" style={{ transform: `rotate(${reading.windDegrees + 180}deg)` }}><i /><b /></div>}<div className="compass-value"><strong>{value(reading.wind)}</strong><small>км/ч</small></div></div>;
}
function SunPath({ reading, day }: { reading: Reading; day?: ForecastDay }) {
  const sunrise = day?.sunrise ? Date.parse(day.sunrise) : NaN, sunset = day?.sunset ? Date.parse(day.sunset) : NaN;
  const position = Math.min(1, Math.max(0, (Date.parse(reading.time) - sunrise) / (sunset - sunrise)));
  const x = 8 + position * 144, y = 62 - Math.sin(position * Math.PI) * 44;
  return <svg className="sun-path" viewBox="0 0 160 82" aria-label="Положение солнца между восходом и закатом"><path d="M8 62 Q80 -26 152 62" fill="none" stroke="currentColor" strokeWidth="4" opacity=".25" /><path d="M0 62H160" stroke="currentColor" opacity=".3" />{Number.isFinite(position) && <circle cx={x} cy={y} r="5" fill="currentColor" />}<circle cx="8" cy="62" r="2" fill="currentColor" /><circle cx="152" cy="62" r="2" fill="currentColor" /></svg>;
}
export function MetricCards({ reading, day, metrics = mainMetrics, onSelect }: { reading: Reading; day?: ForecastDay; metrics?: MetricKey[]; onSelect?: (key: MetricKey) => void }) {
  return <div className="weather-metric-grid">{metrics.map(key => {
    const info = metricInfo[key], Wrapper = onSelect ? 'button' : 'article';
    const n = key === 'sunrise' ? null : reading[key];
    const content = key === 'wind' ? <div className="wind-card-content"><dl><div><dt>Скорость</dt><dd>{value(reading.wind)} <small>км/ч</small></dd></div><div><dt>Порывы</dt><dd>{value(reading.gust)} <small>км/ч</small></dd></div><div><dt>Направление</dt><dd>{reading.windDirection} <small>{value(reading.windDegrees, '°')}</small></dd></div></dl><WindCompass reading={reading} /></div>
      : key === 'sunrise' ? <><strong className="weather-metric-value">{day?.sunrise ? localTime(day.sunrise) : '—'}</strong><SunPath reading={reading} day={day} /><p>Закат: {day?.sunset ? localTime(day.sunset) : '—'}</p></>
      : <><strong className="weather-metric-value">{value(n)}<small>{n !== null ? info.unit : ''}</small></strong>
        {key === 'uvIndex' && <><span className="metric-status">{n === null ? 'Нет данных' : n < 3 ? 'Низкий' : n < 6 ? 'Умеренный' : n < 8 ? 'Высокий' : 'Очень высокий'}</span><div className="uv-scale"><i style={{ left: `${Math.min(100, (n ?? 0) / 11 * 100)}%` }} /></div></>}
        {key === 'humidity' && <div className="humidity-meter" style={{ '--fill': `${n ?? 0}%` } as CSSProperties}><i /></div>}
        {key === 'pressure' && <div className="pressure-scale"><span>Низкое</span><i style={{ left: `${Math.max(0, Math.min(100, ((n ?? 1013) - 980) / 65 * 100))}%` }} /><span>Высокое</span></div>}
        <p>{n === null ? 'Источник не передаёт этот показатель' : key === 'feelsLike' ? `Фактически ${value(reading.temperature, '°')}` : key === 'rain' ? `За час · вероятность ${value(reading.rainProbability, '%')}` : key === 'humidity' ? `Точка росы ${value(reading.dewPoint, '°')}` : key === 'visibility' ? (n >= 10 ? 'Хорошая видимость' : n >= 1 ? 'Видимость снижена' : 'Очень низкая видимость') : key === 'pressure' ? 'На уровне моря' : key === 'cloudCover' ? 'Небо, покрытое облаками' : key === 'uvIndex' ? 'Для выбранного часа' : key === 'dewPoint' ? 'Температура конденсации' : key === 'wetBulb' ? 'С учётом испарения' : 'Для выбранного часа'}</p>
      </>;
    return <Wrapper key={key} className={`weather-metric metric-${key}`} {...(onSelect ? { onClick: () => onSelect(key), type: 'button' as const, 'aria-label': `${info.title}, подробнее` } : {})}><span className="weather-metric-title"><Icon name={info.icon} size={16} />{info.title}</span>{content}</Wrapper>;
  })}</div>;
}
