#!/bin/bash
# Фикс Java 26 + Gradle 8.2.1 → JDK17

echo "🔧 Фиксим Java/Gradle для Android..."

# 1. Установи JDK17
sudo pacman -S jdk17-openjdk jre17-openjdk

# 2. Переключи на JDK17
sudo archlinux-java set java-17-openjdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk

# 3. Очисти Gradle cache
rm -rf ~/.gradle/caches/
rm -rf frontend/android/.gradle

# 4. Build APK
cd frontend/android
./gradlew clean assembleDebug

echo "✅ APK: app/build/outputs/apk/debug/app-debug.apk"
echo "📱 adb install app/build/outputs/apk/debug/app-debug.apk"
