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
import { PlantEnvironment, PlantPhases, plantLabEnabled, plantPhases, type PlantPeriod } from './scene/PlantLab';
import './home.css';
import './nature-home.css';

const CropScene = lazy(() => import('./scene/CropScene'));
const PlantScene2D = lazy(() => import('./scene/PlantScene2D'));
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
  const [sheet, setSheet] = useState<'scene' | 'layers' | 'source' | 'growth' | 'phases' | null>(null);
  const lab = plantLabEnabled(location.hostname);
  const [view, setView] = useState<'2d' | '3d'>(() => { if (!lab) return '3d'; try { return localStorage.getItem('egin.plant-lab.view') === '3d' ? '3d' : '2d'; } catch { return '2d'; } });
  const is2D = lab && view === '2d';
  const [phase, setPhase] = useState(1);
  const [labPeriod, setLabPeriod] = useState<PlantPeriod | null>(null), [labCondition, setLabCondition] = useState<WeatherCondition | null>(null);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => { if (!is2D) return; const timer = setInterval(() => { if (!document.hidden) setClock(Date.now()); }, 30000); return () => clearInterval(timer); }, [is2D]);
  function changeView(next: '2d' | '3d') { setView(next); try { localStorage.setItem('egin.plant-lab.view', next); } catch { /* Optional display preference. */ } }
  const [roots, setRoots] = useState(false), [telemetry, setTelemetry] = useState(false), [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reduceMotion, setReduceMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const listener = () => setReduceMotion(media.matches); media.addEventListener('change', listener); return () => media.removeEventListener('change', listener); }, []);
  const unspecifiedCrop = !activeField || activeField.data.crop === 'unknown';
  const crop = crops[preferences.crop], monitoring = pendingMonitoring(crop.id), live = weather.report?.current;
  const period = is2D ? labPeriod ?? timeOfDay(weather) : preview && ['dawn', 'dusk', 'night', 'sun'].includes(preview) ? (preview === 'sun' ? 'day' : preview) as TimeOfDay : timeOfDay(weather);
  const condition: WeatherCondition = is2D ? labCondition ?? (live?.condition === 'night' ? 'sun' : live?.condition) ?? 'sun' : preview === 'dawn' || preview === 'dusk' ? 'sun' : preview ?? live?.condition ?? 'sun';
  const isNight = period === 'night';
  const sceneWeather: WeatherId = condition === 'rain' || condition === 'storm' ? 'rain' : condition === 'wind' ? 'wind' : isNight ? 'night' : 'sun';
  const options = { crop: crop.id, stage: monitoring.stage ?? modelStage[crop.id], weather: sceneWeather, condition, timeOfDay: period, isDaytime: !isNight,
    windSpeed: (is2D ? labCondition : preview) === 'wind' ? 32 : live?.wind ?? 9,
    cloudCover: is2D && labCondition ? (['cloud', 'rain', 'snow', 'storm', 'fog'].includes(labCondition) ? 95 : 10) : preview ? (preview === 'rain' || preview === 'cloud' ? 95 : 10) : live?.cloudCover ?? 0,
    motion: preferences.motion && !reduceMotion, roots: is2D ? false : roots, active: !sheet };
  const sceneClass = `plant-hero ${is2D ? 'plant-hero-2d' : ''} weather-${sceneWeather} condition-${condition} period-${period} ${isNight ? 'scene-night' : ''} ${options.motion ? '' : 'scene-static'}`;
  const dimension = is2D ? '2D' : '3D';
  const toggleRoots = () => setRoots(!roots);
  const labPreview = labPeriod !== null || labCondition !== null;
  const clockLabel = is2D && labPeriod ? ({ dawn: '06:15', day: '12:30', dusk: '18:45', night: '23:10' })[labPeriod] : new Intl.DateTimeFormat('ru-RU', { timeZone: weather.report?.location.timezone || 'Asia/Almaty', hour: '2-digit', minute: '2-digit' }).format(clock);
  const illustration = <Suspense fallback={<div className="scene-loading"><p>Загрузка растения…</p></div>}>{is2D ? <PlantScene2D options={options} phase={phase} clockLabel={clockLabel} /> : <CropScene options={options} />}</Suspense>;
  const atmosphere = <div className="scene-atmosphere" aria-hidden="true"><span className="scene-moon" /><span className="scene-sun" /><span className="scene-cloud scene-cloud-one" /><span className="scene-cloud scene-cloud-two" /><span className="scene-stars" /></div>;
  const overlays = telemetry && <div className="scene-data-overlay"><span><Icon name="drop" size={14} />Почва: нет данных</span><span><Icon name="leaf" size={14} />Фаза: ожидает данных</span></div>;
  return <div className="home-page">
    <header className="home-header"><a href="#/" className="wordmark" aria-label="EGIN — главная"><span className="brand-symbol"><i /><i /><i /></span>egin<span className="brand-period">.</span></a><div className="header-actions">{!user && <a className="header-login" href="#/auth">Войти</a>}<button className="demo-label" onClick={() => setSheet('source')}><Icon name="info" size={16} />О данных</button><a className="profile-button" aria-label="Открыть настройки" href="#/settings"><Icon name="settings" size={20} /></a></div></header>
    <section className={sceneClass} aria-label={activeField ? `Модель культуры · ${activeField.data.name}` : `Пример ${dimension}-модели культуры`}>
      <div className="plant-heading"><div><span className="eyebrow">{unspecifiedCrop ? 'Культура не указана' : 'Ваша культура'}</span><h1>{unspecifiedCrop ? 'Пример растения' : crop.name}</h1><p>{unspecifiedCrop ? `${crop.name} · демонстрация ${dimension}` : crop.variety}</p>{activeField && <a className="scene-field-link" href="#/fields"><Icon name="location" size={13} /><span>{activeField.data.name}</span><Icon name="right" size={13} /></a>}</div>{lab ? <div className="plant-view-switch" role="group" aria-label="Вид растения"><button aria-pressed={is2D} onClick={() => changeView('2d')}>2D</button><button aria-pressed={!is2D} onClick={() => changeView('3d')}>3D</button></div> : <span className="model-note">3D · пример</span>}</div>
      {is2D && <div className="plant-lab-note">Иллюстрация · фаза для примера</div>}
      <div className="scene-stage">{!is2D && <>{atmosphere}<span className="scene-orbit orbit-one" /><span className="scene-orbit orbit-two" /></>}
        {!expanded && illustration}
        {!is2D && <span className="scene-hint">Вращайте пальцем</span>}<button className="scene-weather-badge" aria-label={is2D ? 'Окружение растения' : 'Условия 3D-просмотра'} onClick={() => setSheet('scene')}><Icon name={condition} size={16} />{is2D && labPreview ? 'Пример окружения' : !is2D && preview ? `Просмотр: ${previewOptions.find(p => p.id === preview)?.title}` : live ? `${weather.cached ? 'Сохранено: ' : ''}${live.description}` : 'Ожидаем погоду'}{is2D && <Icon name="right" size={12} />}</button>
        {is2D && <button className="plant-phase-trigger" aria-label="Фазы роста" onClick={() => setSheet('phases')}><Icon name="leaf" size={17} /><span>{plantPhases[phase]}</span><Icon name="right" size={12} /></button>}
        {overlays}<div className="scene-tools"><button className={`icon-button ${options.roots || telemetry ? 'selected' : ''}`} aria-label="Слои модели" onClick={() => setSheet('layers')}><Icon name="layers" size={20} /></button><button className="icon-button" aria-label={`Развернуть ${dimension}`} onClick={() => setExpanded(true)}><Icon name="expand" size={20} /></button></div>
      </div>
      <button className="growth-caption" onClick={() => setSheet('growth')}><span className="growth-mark"><Icon name="leaf" size={18} /><span><small>Автоматический мониторинг</small><strong>Ожидаем данные участка</strong></span></span><Icon name="right" size={18} /></button>
    </section>

    <FieldReadiness activeField={activeField} weather={weather}/>
    <a className="home-events-link" href="#/events"><Icon name="bell" size={20}/><span>События</span><Icon name="right" size={18}/></a>
    <NewsFeed />


    <section className="sensor-section" aria-labelledby="sensor-title"><div className="section-head"><a href="#/settings/sensors"><h2 id="sensor-title">Датчики участка</h2></a><span className="data-label">Не подключены</span></div><div className="sensor-grid"><div><Icon name="drop" size={21} /><strong>—<small>%</small></strong><span>Влажность почвы</span></div><div><Icon name="temperature" size={21} /><strong>—<small>°C</small></strong><span>Температура почвы</span></div></div><p>Показатели появятся после подключения датчиков.</p></section>
    {!Capacitor.isNativePlatform() && <button className="install-banner" onClick={onInstall}><span className="install-banner-icon"><Icon name="phone" size={25} /></span><span><strong>EGIN как приложение</strong><small>Добавить на главный экран телефона</small></span><Icon name="arrow" size={20} /></button>}
    <footer className="home-footer"><span className="footer-brand">egin.</span><span>Ваш участок. Всё под рукой.</span></footer>

    {expanded && <Sheet title={crop.name + ` · ${dimension}`} wide onClose={() => setExpanded(false)}><div className={`${sceneClass} expanded-scene`}><div className="scene-stage">{!is2D && atmosphere}{illustration}{overlays}</div><div className="expanded-layers">{!is2D && <button aria-pressed={options.roots} onClick={toggleRoots}><Icon name="layers" size={19} />Корни</button>}<button aria-pressed={telemetry} onClick={() => setTelemetry(!telemetry)}><Icon name="info" size={19} />Данные</button></div><p className="expanded-note">{is2D ? 'Иллюстрация растения. Фактическая фаза ожидает данных.' : 'Вращайте пальцем. Кнопки − и + меняют масштаб.'}</p></div></Sheet>}
    {sheet === 'layers' && <Sheet title="Слои модели" onClose={() => setSheet(null)}><p>{is2D ? 'Показывать доступность данных рядом с растением.' : 'Рассмотрите растение, корни или доступность данных прямо на модели.'}</p>{!is2D && <button className="layer-option" aria-pressed={options.roots} onClick={toggleRoots}><Icon name="layers" size={23} /><span><strong>Корневая система</strong><small>Прозрачная почва и обзор корней</small></span><Icon name={options.roots ? 'check' : 'plus'} size={19} /></button>}<button className="layer-option" aria-pressed={telemetry} onClick={() => setTelemetry(!telemetry)}><Icon name="info" size={23} /><span><strong>Показатели участка</strong><small>Статус датчиков и фазы роста</small></span><Icon name={telemetry ? 'check' : 'plus'} size={19} /></button><button className="primary-button" onClick={() => setSheet(null)}>Применить</button></Sheet>}
    {sheet === 'phases' && is2D && <Sheet title="Фазы роста · пример" onClose={() => setSheet(null)}><PlantPhases phase={phase} onChange={setPhase} /><button className="primary-button" onClick={() => setSheet(null)}>Вернуться к модели</button></Sheet>}
    {sheet === 'scene' && <Sheet title={is2D ? 'Окружение растения' : 'Условия 3D-просмотра'} onClose={() => setSheet(null)}>{is2D ? <PlantEnvironment period={period} condition={condition} automatic={!labPreview} description={live?.description ?? 'Ожидаем прогноз'} onPeriod={setLabPeriod} onCondition={setLabCondition} onAutomatic={() => { setLabPeriod(null); setLabCondition(null); }} /> : <><p>Окружение следует погоде участка. Сценарии ниже меняют только просмотр модели.</p><button className={`scene-auto ${!preview ? 'active' : ''}`} aria-pressed={!preview} onClick={() => setPreview(null)}><Icon name="location" size={20} /><span>По погоде участка<small>{live?.description ?? 'Ожидаем прогноз'}</small></span>{!preview && <Icon name="check" size={18} />}</button><div className="weather-options">{previewOptions.map(p => <button key={p.id} aria-pressed={preview === p.id} onClick={() => setPreview(p.id)}><Icon name={p.icon} size={23} />{p.title}</button>)}</div></> }<button className="preference-row" role="switch" aria-checked={preferences.motion} onClick={() => onChange({ ...preferences, motion: !preferences.motion })}><span><strong>Анимация</strong><small>{reduceMotion ? 'В системе включено уменьшение движения' : 'Движение растения и осадков'}</small></span><span className={`toggle ${preferences.motion ? 'on' : ''}`} /></button><button className="primary-button" onClick={() => setSheet(null)}>Вернуться к модели</button></Sheet>}
    {sheet === 'growth' && <Sheet title="Автоматическое развитие" onClose={() => setSheet(null)}><div className="monitoring-empty"><Icon name="leaf" size={40} /><h3>Ожидаем подключение</h3></div><p>Фазу будет определять система по данным культуры, погоде и показаниям датчиков. Пользователю выбирать этап не нужно.</p><ul className="monitoring-sources"><li><Icon name="cloud" size={20} /><span>Google Weather<small>Планируется подключение</small></span></li><li><Icon name="drop" size={20} /><span>Умные датчики<small>Ещё не подключены</small></span></li><li><Icon name="layers" size={20} /><span>Аналитический сервис<small>Ещё не подключён</small></span></li></ul><p>Сейчас {dimension} показывает пример растения. Подтверждённой фазы и измерений почвы пока нет.</p></Sheet>}
    {sheet === 'source' && <Sheet title="Данные EGIN" onClose={() => setSheet(null)}><p>Погода поступает из Open-Meteo для точки «{weather.report?.location.name ?? 'ещё не определена'}». {weather.cached ? 'Сейчас показан сохранённый прогноз. ' : ''} Подробности доступны во вкладке «Погода».</p><div className="info-box"><strong>Мониторинг ещё не подключён</strong><p>{dimension} — пример культуры, а не результат измерения. Google Weather, датчики и аналитический сервис будут подключены отдельно. До этого фаза роста и почвенные показатели остаются неизвестными.</p></div><p>Новости — подборка опубликованных материалов со ссылками и датами источников.</p><button className="primary-button" onClick={() => setSheet(null)}>Понятно</button></Sheet>}
  </div>;
}
