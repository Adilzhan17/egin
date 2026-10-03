#!/bin/bash
set -e

echo "🚀 Собираем Android APK..."

cd frontend

# 1. Capacitor (уже установлен)
npm i --legacy-peer-deps

# 2. Next.js build
npm run build

# 3. Инициализация + Android platform
npx cap init kz.egin.aginmap "Egin Map" || true
npx cap add android

# 4. Sync
npx cap sync android

# 5. Открыть Android Studio
npx cap open android

echo "✅ APK готов в Android Studio!"
echo "📱 Build → APK → adb install app/build/outputs/apk/debug/app-debug.apk"
