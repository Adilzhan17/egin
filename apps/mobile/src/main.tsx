import React from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './app/App';
import { registerAppWorker } from './app/app-updates';
import { LaunchScreen } from './app/LaunchScreen';
import './shared/styles/tokens.css';
import './shared/styles/global.css';
import './shared/styles/nature-glass.css';

// One screen per document launch, independent of routes and foreground changes.
const showLaunch = !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden;
createRoot(document.getElementById('root')!).render(<React.StrictMode><LaunchScreen enabled={showLaunch}><App /></LaunchScreen></React.StrictMode>);

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void registerAppWorker().catch(() => undefined); });
}
