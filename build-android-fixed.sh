#!/bin/bash
set -e

echo "🚀 [1/7] Фиксим Capacitor версии + установка..."
cd frontend

# Фикс версий - используем legacy-peer-deps
npm i @capacitor/core@^6.0.0 @capacitor/android@^6.0.0 @capacitor/cli@^6.0.0 @capacitor/google-maps@^5.0.0 --legacy-peer-deps --save

echo "🚀 [2/7] capacitor.config.ts..."
cat > capacitor.config.ts << 'EOF'
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'kz.egin.aginmap',
  appName: 'Egin Map',
  webDir: 'out',
  bundledWebRuntime: false,
  plugins: {
    GoogleMaps: {
      apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#1a1a1a'
    }
  }
};

export default config;
EOF

echo "🚀 [3/7] Next.js build..."
npm run build

echo "🚀 [4/7] Cap sync..."
npx cap sync android


echo "🚀 [5/7] Android Studio..."
npx cap open android

echo "✅ Готово! Build → APK в Android Studio"
echo "📱 adb install app/build/outputs/apk/debug/app-debug.apk"
