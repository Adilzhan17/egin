#!/bin/bash
set -e

echo "🚀 [1/6] Установка Capacitor Android..."
cd frontend
npm i @capacitor/android @capacitor/core @capacitor/google-maps --save

echo "🚀 [2/6] Создание capacitor.config.ts..."
cat > capacitor.config.ts << 'EOF'
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.egin.aginmap',
  appName: 'Egin Map',
  webDir: 'out',
  bundledWebRuntime: false,
  plugins: {
    GoogleMaps: {
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || 'YOUR_GOOGLE_MAPS_KEY'
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#1a1a1a',
      splashFullScreen: true,
      splashImmersive: true
    }
  }
};

export default config;
EOF

echo "🚀 [3/6] Next.js production build..."
npm run build

echo "🚀 [4/6] Capacitor sync..."
rm -rf android
npx cap init kz.egin.aginmap Egin Map
npx cap add android
npx cap sync

echo "🚀 [5/6] Открытие Android Studio..."
npx cap open android

echo "✅ [6/6] APK готовится в Android Studio!"
echo ""
echo "📱 Следующие шаги:"
echo "1. В Android Studio: Build → Generate Signed Bundle/APK → APK"
echo "2. Установи на телефон: adb install app-release.apk"
echo ""
echo "🎉 Кисточка на Android готова к тестированию!"
