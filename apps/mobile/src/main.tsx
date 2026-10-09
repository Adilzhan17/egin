import React from 'react';
import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { App } from './app/App';
import { registerAppWorker } from './app/app-updates';
import './shared/styles/tokens.css';
import './shared/styles/global.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void registerAppWorker().catch(() => undefined); });
}
