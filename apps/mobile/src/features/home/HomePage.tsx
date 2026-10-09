import { useMeta } from '../../entities/workspace/hooks';
import type { Field, Row, SessionUser } from '../../entities/workspace/types';
import { Capacitor } from '@capacitor/core';
import { lazy, Suspense, useEffect, useState } from 'react';
import { crops } from '../../entities/field/catalog';
import { modelStage, pendingMonitoring } from '../../entities/field/monitoring';
import type { WeatherId } from '../../entities/field/types';
import type { WeatherCondition } from '../../entities/weather/live-types';
import type { WeatherState } from '../../entities/weather/use-weather';
import { dateKey } from '../../entities/weather/open-meteo';
import type { Preferences } from '../../shared/lib/preferences';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { Sheet } from '../../shared/ui/Sheet';
import { NewsFeed } from './NewsFeed';
import { FieldReadiness } from './FieldReadiness';
import './home.css';

const CropScene = lazy(() => import('./scene/CropScene'));
type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
type Preview = 'dawn' | 'sun' | 'dusk' | 'night' | 'rain' | 'snow' | 'cloud' | 'wind';
const previewOptions: { id: Preview; title: string; icon: IconName }[] = [
  { id: 'dawn', title: 'Утро', icon: 'sunrise' }, { id: 'sun', title: 'День', icon: 'sun' }, { id: 'dusk', title: 'Вечер', icon: 'sunrise' }, { id: 'night', title: 'Ночь', icon: 'night' },
  { id: 'rain', title: 'Дождь', icon: 'rain' }, { id: 'snow', title: 'Снег', icon: 'snow' }, { id: 'cloud', title: 'Облачно', icon: 'cloud' }, { id: 'wind', title: 'Ветер', icon: 'wind' },
];
function timeOfDay(weather: WeatherState): TimeOfDay {
  const now = weather.report?.current;
  if (!now) return 'day';
  const day = weather.report?.daily.find(d => dateKey(d.date) === dateKey(now.time));
  const time = Date.parse(now.time);
  if (day?.sunrise && Math.abs(time - Date.parse(day.sunrise)) < 45 * 60000) return 'dawn';
  if (day?.sunset && Math.abs(time - Date.parse(day.sunset)) < 45 * 60000) return 'dusk';
  return now.isDaytime ? 'day' : 'night';
}
type Props = { activeField?: Row<Field>; preferences: Preferences; weather: WeatherState; onChange: (next: Preferences) => void; onInstall: () => void };
export function HomePage({ activeField, preferences, weather, onChange, onInstall }: Props) {
  const user = useMeta<SessionUser|null>('user', null);
  const [sheet, setSheet] = useState<'scene' | 'layers' | 'source' | 'growth' | null>(null);
  const [roots, setRoots] = useState(false), [telemetry, setTelemetry] = useState(false), [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reduceMotion, setReduceMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const listener = () => setReduceMotion(media.matches); media.addEventListener('change', listener); return () => media.removeEventListener('change', listener); }, []);
  const unspecifiedCrop = !activeField || activeField.data.crop === 'unknown';
  const crop = crops[preferences.crop], monitoring = pendingMonitoring(crop.id), live = weather.report?.current;
  const period = preview && ['dawn', 'dusk', 'night', 'sun'].includes(preview) ? (preview === 'sun' ? 'day' : preview) as TimeOfDay : timeOfDay(weather);
  const condition: WeatherCondition = preview === 'dawn' || preview === 'dusk' ? 'sun' : preview ?? live?.condition ?? 'sun';
  const isNight = period === 'night';
  const sceneWeather: WeatherId = condition === 'rain' || condition === 'storm' ? 'rain' : condition === 'wind' ? 'wind' : isNight ? 'night' : 'sun';
  const options = { crop: crop.id, stage: monitoring.stage ?? modelStage[crop.id], weather: sceneWeather, condition, timeOfDay: period, isDaytime: !isNight,
    windSpeed: preview === 'wind' ? 32 : live?.wind ?? 9, cloudCover: preview ? (preview === 'rain' || preview === 'cloud' ? 95 : 10) : live?.cloudCover ?? 0,
    motion: preferences.motion && !reduceMotion, roots, active: !sheet };
  const sceneClass = `plant-hero weather-${sceneWeather} condition-${condition} period-${period} ${isNight ? 'scene-night' : ''} ${options.motion ? '' : 'scene-static'}`;
  const atmosphere = <div className="scene-atmosphere" aria-hidden="true"><span className="scene-moon" /><span className="scene-sun" /><span className="scene-cloud scene-cloud-one" /><span className="scene-cloud scene-cloud-two" /><span className="scene-stars" /></div>;
  const overlays = telemetry && <div className="scene-data-overlay"><span><Icon name="drop" size={14} />Почва: нет данных</span><span><Icon name="leaf" size={14} />Фаза: ожидает данных</span></div>;
  return <div className="home-page">
    <header className="home-header"><a href="#/" className="wordmark" aria-label="EGIN — главная"><span className="brand-symbol"><i /><i /><i /></span>egin<span className="brand-period">.</span></a><div className="header-actions">{!user && <a className="header-login" href="#/auth">Войти</a>}<button className="demo-label" onClick={() => setSheet('source')}><Icon name="info" size={16} />О данных</button><a className="profile-button" aria-label="Открыть настройки" href="#/settings"><Icon name="settings" size={20} /></a></div></header>
    <section className={sceneClass} aria-label={activeField ? `Модель культуры · ${activeField.data.name}` : 'Пример 3D-модели культуры'}>
      <div className="plant-heading"><div><span className="eyebrow">{unspecifiedCrop ? 'Культура не указана' : 'Ваша культура'}</span><h1>{unspecifiedCrop ? 'Пример растения' : crop.name}</h1><p>{unspecifiedCrop ? `${crop.name} · демонстрация 3D` : crop.variety}</p>{activeField && <a className="scene-field-link" href="#/fields"><Icon name="location" size={13} /><span>{activeField.data.name}</span><Icon name="right" size={13} /></a>}</div><span className="model-note">3D · пример</span></div>
      <div className="scene-stage">{atmosphere}<span className="scene-orbit orbit-one" /><span className="scene-orbit orbit-two" />
        {!expanded && <Suspense fallback={<div className="scene-loading"><p>Загрузка модели…</p></div>}><CropScene options={options} /></Suspense>}
        <span className="scene-hint">Вращайте пальцем</span><button className="scene-weather-badge" aria-label="Условия 3D-просмотра" onClick={() => setSheet('scene')}><Icon name={condition} size={16} />{preview ? `Просмотр: ${previewOptions.find(p => p.id === preview)?.title}` : live ? `${weather.cached ? 'Сохранено: ' : ''}${live.description}` : 'Ожидаем погоду'}</button>
        {overlays}<div className="scene-tools"><button className={`icon-button ${roots || telemetry ? 'selected' : ''}`} aria-label="Слои модели" onClick={() => setSheet('layers')}><Icon name="layers" size={20} /></button><button className="icon-button" aria-label="Развернуть 3D" onClick={() => setExpanded(true)}><Icon name="expand" size={20} /></button></div>
      </div>
      <button className="growth-caption" onClick={() => setSheet('growth')}><span className="growth-mark"><Icon name="leaf" size={18} /><span><small>Автоматический мониторинг</small><strong>Ожидаем данные участка</strong></span></span><Icon name="right" size={18} /></button>
    </section>

    <div className="home-workspace-links"><a href="#/events"><Icon name="bell" size={22}/><span><strong>События</strong><small>Погода и состояние данных</small></span></a><a href="#/fields"><Icon name="map" size={22}/><span><strong>{activeField ? 'Мои участки' : 'Добавить участок'}</strong><small>{activeField ? 'Карта и границы земель' : 'Найти землю по кадастру'}</small></span></a></div>
    <FieldReadiness activeField={activeField} weather={weather}/>
    <NewsFeed />


    <section className="sensor-section" aria-labelledby="sensor-title"><div className="section-head"><a href="#/settings/sensors"><h2 id="sensor-title">Датчики участка</h2></a><span className="data-label">Не подключены</span></div><div className="sensor-grid"><div><Icon name="drop" size={21} /><strong>—<small>%</small></strong><span>Влажность почвы</span></div><div><Icon name="temperature" size={21} /><strong>—<small>°C</small></strong><span>Температура почвы</span></div></div><p>Показатели появятся после подключения датчиков.</p></section>
    {!Capacitor.isNativePlatform() && <button className="install-banner" onClick={onInstall}><span className="install-banner-icon"><Icon name="phone" size={25} /></span><span><strong>EGIN как приложение</strong><small>Добавить на главный экран телефона</small></span><Icon name="arrow" size={20} /></button>}
    <footer className="home-footer"><span className="footer-brand">egin.</span><span>Ваш участок. Всё под рукой.</span></footer>

    {expanded && <Sheet title={crop.name + ' · 3D'} wide onClose={() => setExpanded(false)}><div className={`${sceneClass} expanded-scene`}><div className="scene-stage">{atmosphere}<CropScene options={options} />{overlays}</div><div className="expanded-layers"><button aria-pressed={roots} onClick={() => setRoots(!roots)}><Icon name="layers" size={19} />Корни</button><button aria-pressed={telemetry} onClick={() => setTelemetry(!telemetry)}><Icon name="info" size={19} />Данные</button></div><p className="expanded-note">Вращайте пальцем. Кнопки − и + меняют масштаб.</p></div></Sheet>}
    {sheet === 'layers' && <Sheet title="Слои модели" onClose={() => setSheet(null)}><p>Рассмотрите растение, корни или доступность данных прямо на модели.</p><button className="layer-option" aria-pressed={roots} onClick={() => setRoots(!roots)}><Icon name="layers" size={23} /><span><strong>Корневая система</strong><small>Прозрачная почва и обзор корней</small></span><Icon name={roots ? 'check' : 'plus'} size={19} /></button><button className="layer-option" aria-pressed={telemetry} onClick={() => setTelemetry(!telemetry)}><Icon name="info" size={23} /><span><strong>Показатели участка</strong><small>Статус датчиков и фазы роста</small></span><Icon name={telemetry ? 'check' : 'plus'} size={19} /></button><button className="primary-button" onClick={() => setSheet(null)}>Применить</button></Sheet>}
    {sheet === 'scene' && <Sheet title="Условия 3D-просмотра" onClose={() => setSheet(null)}><p>Окружение следует погоде участка. Сценарии ниже меняют только просмотр модели.</p><button className={`scene-auto ${!preview ? 'active' : ''}`} aria-pressed={!preview} onClick={() => setPreview(null)}><Icon name="location" size={20} /><span>По погоде участка<small>{live?.description ?? 'Ожидаем прогноз'}</small></span>{!preview && <Icon name="check" size={18} />}</button><div className="weather-options">{previewOptions.map(p => <button key={p.id} aria-pressed={preview === p.id} onClick={() => setPreview(p.id)}><Icon name={p.icon} size={23} />{p.title}</button>)}</div><button className="preference-row" role="switch" aria-checked={preferences.motion} onClick={() => onChange({ ...preferences, motion: !preferences.motion })}><span><strong>Анимация</strong><small>{reduceMotion ? 'В системе включено уменьшение движения' : 'Движение растения и осадков'}</small></span><span className={`toggle ${preferences.motion ? 'on' : ''}`} /></button><button className="primary-button" onClick={() => setSheet(null)}>Вернуться к модели</button></Sheet>}
    {sheet === 'growth' && <Sheet title="Автоматическое развитие" onClose={() => setSheet(null)}><div className="monitoring-empty"><Icon name="leaf" size={40} /><h3>Ожидаем подключение</h3></div><p>Фазу будет определять система по данным культуры, погоде и показаниям датчиков. Пользователю выбирать этап не нужно.</p><ul className="monitoring-sources"><li><Icon name="cloud" size={20} /><span>Google Weather<small>Планируется подключение</small></span></li><li><Icon name="drop" size={20} /><span>Умные датчики<small>Ещё не подключены</small></span></li><li><Icon name="layers" size={20} /><span>Аналитический сервис<small>Ещё не подключён</small></span></li></ul><p>Сейчас 3D показывает пример растения. Подтверждённой фазы и измерений почвы пока нет.</p></Sheet>}
    {sheet === 'source' && <Sheet title="Данные EGIN" onClose={() => setSheet(null)}><p>Погода поступает из Open-Meteo для точки «{weather.report?.location.name ?? 'ещё не определена'}». {weather.cached ? 'Сейчас показан сохранённый прогноз. ' : ''} Подробности доступны во вкладке «Погода».</p><div className="info-box"><strong>Мониторинг ещё не подключён</strong><p>3D — пример культуры, а не результат измерения. Google Weather, датчики и аналитический сервис будут подключены отдельно. До этого фаза роста и почвенные показатели остаются неизвестными.</p></div><p>Новости — подборка опубликованных материалов со ссылками и датами источников.</p><button className="primary-button" onClick={() => setSheet(null)}>Понятно</button></Sheet>}
  </div>;
}
