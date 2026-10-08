import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const android = fileURLToPath(new URL('../android/', import.meta.url));
execFileSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew', ['assembleDebug', '--no-daemon'], { cwd: android, stdio: 'inherit' });
const releases = new URL('../../../releases/', import.meta.url);
mkdirSync(releases, { recursive: true });
copyFileSync(new URL('../android/app/build/outputs/apk/debug/app-debug.apk', import.meta.url), new URL('EGIN-android-debug.apk', releases));
console.log('Debug APK: releases/EGIN-android-debug.apk');
