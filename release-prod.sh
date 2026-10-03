#!/bin/bash
set -e

echo "🚀 PRODACT + GITHUB RELEASE v1.0.0"

# 1. Backend prod build
cd backend
npm run build
docker build -t egin-backend:latest .
docker tag egin-backend:latest registry.gitlab.com/yedilius/egin-backend:latest
docker push registry.gitlab.com/yedilius/egin-backend:latest

# 2. Frontend prod + APK
cd ../frontend
npm run build
npx cap sync android
cd android
./gradlew assembleRelease

# 3. Releases папка
mkdir -p ../../releases
cp app/build/outputs/apk/release/app-release.apk ../../releases/EginMap-v1.0.0-release.apk
cp -r ../out ../../releases/EginMap-web-v1.0.0.zip
cp ../package.json ../../releases/

# 4. GitHub Release
cd ../..
gh release create v1.0.0 \
  releases/EginMap-v1.0.0-release.apk \
  releases/EginMap-web-v1.0.0.zip \
  --title "Egin Map v1.0.0 - Кисточка + Android" \
  --notes "✅ Умная кисточка\n📱 Android APK\n🌍 Production ready"

echo "🎉 RELEASE v1.0.0 готов на GitHub!"
echo "APK: https://github.com/yedilius/Egin-KZ/releases/tag/v1.0.0"
