import { useId, useState, type KeyboardEvent } from 'react';
import type { ForecastDay, Reading } from '../../entities/weather/live-types';
import type { WeatherState } from '../../entities/weather/use-weather';
import { dateKey, localDate, localTime } from '../../entities/weather/open-meteo';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { Sheet } from '../../shared/ui/Sheet';
import { extraMetrics, mainMetrics, MetricCards, metricInfo, value, type MetricKey } from './WeatherMetrics';
import { forecastChart, forecastDayLabel } from './presentation';
import './weather.css';

type Detail = { type: 'reading'; reading: Reading } | { type: 'day'; day: ForecastDay } | { type: 'metric'; key: MetricKey } | { type: 'source' };
type ChartMetric = 'temperature' | 'rain' | 'wind';
const chartMetrics: { key: ChartMetric; label: string; unit: string }[] = [{ key: 'temperature', label: 'Температура', unit: '°' }, { key: 'rain', label: 'Осадки', unit: ' мм' }, { key: 'wind', label: 'Ветер', unit: ' км/ч' }];
export function WeatherPanel({ weather }: { weather: WeatherState }) {
  const location = weather.report?.location;
  return <WeatherReport key={location ? `${location.latitude}:${location.longitude}:${location.name}` : 'loading'} weather={weather} />;
}
function WeatherReport({ weather }: { weather: WeatherState }) {
  const [range, setRange] = useState<'hours' | 'days'>('hours'), [metric, setMetric] = useState<ChartMetric>('temperature');
  const [detail, setDetail] = useState<Detail | null>(null), [more, setMore] = useState(false);
  const id = useId(), report = weather.report;
  if (!report) return <section id="field-weather" tabIndex={-1} className="weather-empty"><Icon name="cloud" size={34} /><h2>Погода на участке</h2><p role="status">{weather.loading ? 'Загружаем прогноз для участка…' : weather.error}</p>{!weather.loading && <button className="secondary-button" onClick={weather.refresh}><Icon name="rotate" size={18} />Повторить</button>}</section>;
  const now = report.current, day = report.daily.find(d => dateKey(d.date) === dateKey(now.time)), hours = report.hourly.slice(0, 24);
  const currentMetric = chartMetrics.find(m => m.key === metric)!;
  const { max, path, hasValues } = forecastChart(hours, metric);
  const dayRange = report.daily.length;
  const dayUnit = new Intl.PluralRules('ru-RU').select(dayRange);
  const dayRangeLabel = `На ${dayRange} ${dayUnit === 'one' ? 'день' : dayUnit === 'few' ? 'дня' : 'дней'}`;
  const switchForecast = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'hours' : event.key === 'End' ? 'days' : range === 'hours' ? 'days' : 'hours';
    setRange(next);
    document.getElementById(`${id}-${next}`)?.focus();
  };
  const selected = detail?.type === 'reading' ? detail.reading : now;
  const selectedDay = report.daily.find(d => dateKey(d.date) === dateKey(selected.time));
  const night = !now.isDaytime;
  const title = detail?.type === 'source' ? 'Источник погоды' : detail?.type === 'day' ? forecastDayLabel(detail.day.date) : detail?.type === 'metric' ? metricInfo[detail.key].title : `Погода · ${localTime(selected.time)}`;
  const allMetrics = [...mainMetrics, ...extraMetrics];
  return <section id="field-weather" tabIndex={-1} className={`weather-report weather-sky-${night ? 'night' : now.condition}`} aria-labelledby={`${id}-heading`}>
    <div className="weather-report-top"><h2 id={`${id}-heading`}><Icon name="location" size={15} />Погода на участке</h2><button aria-label="Обновить погоду" className={`weather-refresh ${weather.loading ? 'is-loading' : ''}`} disabled={weather.loading} onClick={weather.refresh}><Icon name="rotate" size={19} /></button></div>
    <header className="weather-location"><a className="weather-field-link" href="#/fields" aria-label={`Выбранная точка: ${report.location.name}. Открыть участки`}>{report.location.name}<Icon name="right" size={16} /></a><strong>{value(Math.round(now.temperature))}°</strong><p><Icon name={now.condition} size={21} />{now.description}</p><small>Ощущается как {value(now.feelsLike, '°')} · {value(day?.min, '°')}…{value(day?.max, '°')}</small></header>
    <div className="weather-freshness" role="status">{weather.error || (weather.cached ? 'Сохранённый прогноз' : 'Open-Meteo')} · {localDate(now.time)}, {localTime(now.time)} · UTC+5</div>
    <div className="forecast-card"><div className="forecast-tabs" role="tablist" aria-label="Период прогноза"><button role="tab" id={`${id}-hours`} aria-controls={`${id}-forecast`} aria-selected={range === 'hours'} tabIndex={range === 'hours' ? 0 : -1} onKeyDown={switchForecast} onClick={() => setRange('hours')}><Icon name="clock" size={15} />По часам</button><button role="tab" id={`${id}-days`} aria-controls={`${id}-forecast`} aria-selected={range === 'days'} tabIndex={range === 'days' ? 0 : -1} onKeyDown={switchForecast} onClick={() => setRange('days')}><Icon name="calendar" size={15} />{dayRangeLabel}</button></div>
    <div id={`${id}-forecast`} role="tabpanel" tabIndex={0} aria-labelledby={`${id}-${range}`}>
      {range === 'hours' ? <><div className="weather-chart-controls" role="group" aria-label="Показатель на графике">{chartMetrics.map(m => <button key={m.key} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}</div>
      {!hasValues && <p className="weather-chart-empty" role="status">Нет почасовых данных для показателя «{currentMetric.label}».</p>}
      <div className="forecast-scroll" tabIndex={0} aria-label={`Прогноз на 24 часа: ${currentMetric.label}. Прокрутите горизонтально.`}><div className="forecast-plot" style={{ width: hours.length * 62 }}><svg viewBox={`0 0 ${hours.length * 62} 110`} aria-hidden="true"><path d={`M0 92H${hours.length * 62} M0 22H${hours.length * 62}`} stroke="currentColor" strokeOpacity=".12" strokeDasharray="3 5" />{metric === 'rain' ? hours.map((h, i) => h.rain == null || !Number.isFinite(h.rain) ? null : <rect key={h.time} x={i * 62 + 21} y={92 - h.rain / max * 70} width="20" height={h.rain / max * 70} fill="currentColor" rx="5" />) : <path d={path} stroke="currentColor" strokeWidth="2.5" fill="none" />}</svg><div className="forecast-hours">{hours.map((h, i) => <button className="forecast-hour" key={h.time} onClick={() => setDetail({ type: 'reading', reading: h })} aria-label={`${localDate(h.time)}, ${localTime(h.time)}, ${value(h[metric], currentMetric.unit)}, подробнее`}><span className="forecast-hour-date">{i === 0 || dateKey(h.time) !== dateKey(hours[i - 1].time) ? localDate(h.time) : '\u00a0'}</span><span>{localTime(h.time)}</span><Icon name={h.condition} size={22} /><strong>{value(h[metric], metric === 'temperature' ? '°' : '')}</strong><small>{metric === 'temperature' ? value(h.rainProbability, '%') : currentMetric.unit}</small></button>)}</div></div></div><p className="weather-chart-note">Нажмите на час — все условия на это время</p></>
      : <div className="forecast-days">{report.daily.map(d => { const low = Math.min(...report.daily.map(x => x.min)), high = Math.max(...report.daily.map(x => x.max)), span = high - low || 1; return <button className="forecast-day" key={d.date} onClick={() => setDetail({ type: 'day', day: d })} aria-label={`${forecastDayLabel(d.date)}, от ${value(d.min, '°')} до ${value(d.max, '°')}, осадки ${value(d.rainProbability, '%')}, подробнее`}><span>{forecastDayLabel(d.date)}</span><span className="forecast-day-condition"><Icon name={d.condition} size={20} /><small>{value(d.rainProbability, '%')}</small></span><small>{value(Math.round(d.min), '°')}</small><span className="day-temp-range"><i style={{ left: `${(d.min - low) / span * 100}%`, width: `${Math.max(5, (d.max - d.min) / span * 100)}%` }} /></span><strong>{value(Math.round(d.max), '°')}</strong></button>; })}</div>}
    </div></div>
    <MetricCards reading={now} day={day} onSelect={key => setDetail({ type: 'metric', key })} />
    {more && <MetricCards reading={now} day={day} metrics={extraMetrics} onSelect={key => setDetail({ type: 'metric', key })} />}
    <button className="weather-all-details" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Свернуть показатели' : 'Все погодные показатели'}<Icon name={more ? 'up' : 'down'} size={17} /></button>
    <button className="weather-source" onClick={() => setDetail({ type: 'source' })}><Icon name="info" size={15} /><span>Прогноз Open-Meteo · координаты выбранной точки</span><Icon name="right" size={15} /></button>
    {detail && <Sheet title={title} onClose={() => setDetail(null)}><div className={`weather-detail weather-sky-${!selected.isDaytime ? 'night' : selected.condition}`}>
      {detail.type === 'source' ? <div className="weather-source-info"><p>Прогноз погодной модели для точки «{report.location.name}»: {report.location.latitude}°, {report.location.longitude}°. Координаты можно изменить в разделе «Мои участки».</p><p>Последнее обновление: {localDate(new Date(report.fetchedAt).toISOString())}, {localTime(new Date(report.fetchedAt).toISOString())} (UTC+5).</p><p>Погодная модель Open-Meteo, не датчик на поле. Прогноз обновляется каждые 15 минут, последний ответ сохраняется на устройстве до 24 часов.</p><p>Тепловой индекс, отдельное охлаждение ветром и вероятность грозы недоступны у текущего источника. Почвенные показатели появятся после подключения датчиков.</p><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Weather data by Open-Meteo<Icon name="arrow" size={16} /></a></div>
      : detail.type === 'day' ? <><div className="reading-heading"><Icon name={detail.day.condition} size={32} /><strong>{value(detail.day.min, '°')}…{value(detail.day.max, '°')}</strong><span>{localDate(detail.day.date, true)} · {report.location.name}</span></div><div className="weather-metric-grid">{[
          ['rain', 'Осадки за сутки', value(detail.day.rain, ' мм')], ['rain', 'Вероятность осадков', value(detail.day.rainProbability, '%')], ['wind', 'Максимальный ветер', value(detail.day.wind, ' км/ч')], ['wind', 'Порывы', value(detail.day.gust, ' км/ч')], ['sunrise', 'Восход', detail.day.sunrise ? localTime(detail.day.sunrise) : '—'], ['night', 'Закат', detail.day.sunset ? localTime(detail.day.sunset) : '—'], ['sun', 'Максимальный УФ', value(detail.day.uvIndex)],
        ].map(([icon, label, v]) => <article className="weather-metric" key={label}><span className="weather-metric-title"><Icon name={icon as IconName} size={16} />{label}</span><strong className="day-detail-value">{v}</strong></article>)}</div></>
      : detail.type === 'metric' ? <><MetricCards reading={now} day={day} metrics={[detail.key]} /><p className="metric-explanation">{metricInfo[detail.key].description}</p><p className="metric-timestamp">{report.location.name} · {localDate(now.time)}, {localTime(now.time)} · UTC+5</p></>
      : <><div className="reading-heading"><span>{report.location.name} · {localDate(selected.time)} · UTC+5</span><strong>{value(selected.temperature, '°')}</strong><p><Icon name={selected.condition} size={20} />{selected.description}</p><small>Ощущается как {value(selected.feelsLike, '°')}</small></div><MetricCards reading={selected} day={selectedDay} metrics={allMetrics} /></>}
    </div></Sheet>}
  </section>;
}
