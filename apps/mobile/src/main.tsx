import React from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './app/App';
import { registerAppWorker } from './app/app-updates';
import { LaunchScreen } from './app/LaunchScreen';
import { selectLaunchSplash } from './app/splash-sequence';
import './shared/styles/tokens.css';
import './shared/styles/global.css';
import './shared/styles/nature-glass.css';

// One reservation per document launch, outside React's repeated render/effects.
const launchSplash = selectLaunchSplash();
createRoot(document.getElementById('root')!).render(<React.StrictMode><LaunchScreen selection={launchSplash}><App /></LaunchScreen></React.StrictMode>);

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void registerAppWorker().catch(() => undefined); });
}
