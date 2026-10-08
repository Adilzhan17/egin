import { lazy, Suspense, useEffect, useState } from 'react';
import { HomePage } from '../features/home/HomePage';
import { readPreferences, savePreferences, type Preferences } from '../shared/lib/preferences';
import { Icon, type IconName } from '../shared/ui/Icon';
import { InstallSheet } from '../features/install/InstallSheet';
import { useWeather } from '../entities/weather/use-weather';
import './shell.css';
import '../features/workspace/workspace.css';
import { useSync, useRows, useMeta } from '../entities/workspace/hooks';
import type { Field } from '../entities/workspace/types';

const WeatherPage = lazy(() => import('../features/weather/WeatherPage'));
const JournalPage = lazy(() => import('../features/workspace/JournalPage'));
const FieldsPage = lazy(() => import('../features/workspace/FieldsPage'));
const ChatPage = lazy(() => import('../features/chat/ChatPage'));
const MarketPage = lazy(() => import('../features/market/MarketPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const tabs: { path: string; name: string; icon: IconName }[] = [{ path: '/', name: 'Главная', icon: 'navHome' }, { path: '/weather', name: 'Погода', icon: 'navWeather' }, { path: '/chat', name: 'Чат', icon: 'navChat' }, { path: '/market', name: 'Рынок', icon: 'navMarket' }, { path: '/settings', name: 'Настройки', icon: 'navSettings' }];
const currentPath = () => { const path = location.hash.slice(1) || '/'; return tabs.some(t => t.path === path) || ['/journal', '/fields'].includes(path) || /^\/settings\/(profile|security|sync|sensors|reports|notifications|api|app)$/.test(path) ? path : '/'; };

export function App() {
  const [path, setPath] = useState(currentPath), [preferences, setPreferences] = useState(readPreferences), [install, setInstall] = useState(false), [storageError, setStorageError] = useState(false), [online, setOnline] = useState(navigator.onLine);
  useSync();
  const { rows: fields } = useRows<Field>('field'), selectedField = useMeta('selectedField', '');
  const activeField = fields.find(f => f.id === selectedField);
  const effectivePreferences = activeField ? { ...preferences, crop: activeField.data.crop } : preferences;
  const weatherLocation = activeField ? { name: activeField.data.name, latitude: activeField.data.latitude, longitude: activeField.data.longitude, timezone: 'Asia/Almaty' } : undefined;
  const weather = useWeather(effectivePreferences.crop, weatherLocation);
  useEffect(() => {
    const navigate = () => { setPath(currentPath()); window.scrollTo({ top: 0 }); };
    const network = () => setOnline(navigator.onLine);
    window.addEventListener('hashchange', navigate); window.addEventListener('online', network); window.addEventListener('offline', network);
    return () => { window.removeEventListener('hashchange', navigate); window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => { document.title = `${tabs.find(t => t.path === path)?.name || (path.startsWith('/settings') ? 'Настройки' : path === '/fields' ? 'Участки' : 'Дневник')} — EGIN`; }, [path]);
  function change(next: Preferences) { setPreferences(next); setStorageError(!savePreferences(next)); }
  return <div className="mobile-shell">
    <a className="skip-link" href="#main" onClick={event => { event.preventDefault(); document.getElementById('main')?.focus(); }}>К содержимому</a>
    {!online && <div className="connection-note" role="status">Без сети · доступны сохранённые данные</div>}
    {storageError && <div className="connection-note" role="alert">Не удалось сохранить изменения на устройстве.</div>}
    <main id="main" tabIndex={-1} className="mobile-main"><Suspense fallback={<div className="page-loading">Загрузка…</div>}>
      {path === '/' && <HomePage weather={weather} preferences={effectivePreferences} onChange={change} onInstall={() => setInstall(true)} />}
      {path === '/weather' && <WeatherPage weather={weather} />}
      {path === '/chat' && <ChatPage />}
      {path === '/market' && <MarketPage />}
      {path === '/journal' && <JournalPage />}
      {path === '/fields' && <FieldsPage />}
      {path.startsWith('/settings') && <SettingsPage path={path} preferences={preferences} onChange={change} onInstall={() => setInstall(true)} />}
    </Suspense></main>
    <nav className="mobile-nav" aria-label="Основная навигация"><div className="nav-items">{tabs.map(tab => <a key={tab.path} href={`#${tab.path}`} aria-current={(path === tab.path || (tab.path === '/settings' && path.startsWith('/settings/'))) ? 'page' : undefined} className={`nav-item ${path === tab.path || (tab.path === '/settings' && path.startsWith('/settings/')) ? 'active' : ''}`}><span className="nav-icon"><Icon name={tab.icon} size={23} strokeWidth={path === tab.path ? 2 : 1.7} /></span><span>{tab.name}</span></a>)}</div></nav>
    {install && <InstallSheet onClose={() => setInstall(false)} />}
  </div>;
}
