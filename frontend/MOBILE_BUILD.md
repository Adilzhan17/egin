# Сборка мобильного приложения для iOS и Android

## Предварительные требования

- Node.js 18+
- Для iOS: macOS с Xcode
- Для Android: Android Studio

## Установка зависимостей

```bash
cd frontend
npm install
```

## Сборка для мобильных платформ

### 1. Сборка веб-версии

```bash
npm run build
```

Это создаст статический экспорт в папке `out/`

### 2. Синхронизация с Capacitor

```bash
npm run cap:sync
```

Эта команда:
- Копирует собранные файлы из `out/` в нативные проекты
- Обновляет нативные зависимости
- Синхронизирует конфигурацию

### 3. Открытие нативных проектов

#### iOS

```bash
npm run cap:open:ios
```

Откроется Xcode. Далее:
1. Выберите целевое устройство или симулятор
2. Нажмите Run (⌘R)
3. Для публикации: Product → Archive

#### Android

```bash
npx cap open android
```

Откроется Android Studio. Далее:
1. Выберите устройство или эмулятор
2. Нажмите Run
3. Для публикации: Build → Generate Signed Bundle / APK

## Важные настройки

### Конфигурация Next.js

`next.config.ts` настроен для статического экспорта:
- `output: "export"` - генерирует статические HTML файлы
- `images: { unoptimized: true }` - отключает оптимизацию изображений
- `trailingSlash: true` - добавляет слэш в конце URL

### Конфигурация Capacitor

`capacitor.config.ts`:
- `appId: "kz.agriplan.app"` - уникальный идентификатор приложения
- `appName: "AgriPlan"` - название приложения
- `webDir: "out"` - папка со статическими файлами

## Логотип и иконки

### Логотип авторизации
- Файл: `public/logo.svg`
- Используется на странице входа
- Автоматически копируется в нативные проекты

### Иконки приложения
- iOS: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Android: `android/app/src/main/res/mipmap-*/`

Для генерации иконок используйте:
```bash
npx @capacitor/assets generate --iconBackgroundColor '#0a2416' --iconBackgroundColorDark '#0a2416'
```

## Публикация

### App Store (iOS)

1. Настройте сертификаты в Apple Developer
2. В Xcode: Product → Archive
3. Distribute App → App Store Connect
4. Загрузите в App Store Connect
5. Заполните метаданные и отправьте на ревью

### Google Play (Android)

1. Создайте keystore для подписи:
```bash
keytool -genkey -v -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

2. В Android Studio: Build → Generate Signed Bundle
3. Выберите keystore и создайте AAB
4. Загрузите в Google Play Console
5. Заполните метаданные и отправьте на ревью

## Тестирование

### Локальное тестирование

```bash
# Запуск dev-сервера
npm run dev

# Открыть в браузере
open http://localhost:3001
```

### Тестирование на устройстве

#### iOS
- Подключите iPhone через USB
- В Xcode выберите устройство
- Нажмите Run

#### Android
- Включите режим разработчика на устройстве
- Подключите через USB
- В Android Studio выберите устройство
- Нажмите Run

## Обновление приложения

После изменений в коде:

```bash
npm run build
npm run cap:sync
```

Затем пересоберите в Xcode/Android Studio.

## Troubleshooting

### Проблема: "next: command not found"
```bash
npm install
```

### Проблема: Логотип не отображается
Проверьте, что файл `public/logo.svg` существует и путь правильный.

### Проблема: Белый экран в приложении
1. Проверьте консоль в Safari Web Inspector (iOS) или Chrome DevTools (Android)
2. Убедитесь, что `output: "export"` в next.config.ts
3. Проверьте, что все API endpoints используют абсолютные URL

### Проблема: API не работает в приложении
Убедитесь, что `NEXT_PUBLIC_API_BASE_URL` указывает на доступный сервер (не localhost).

## Полезные команды

```bash
# Очистка и пересборка
rm -rf out .next
npm run build
npm run cap:sync

# Проверка версии Capacitor
npx cap --version

# Обновление Capacitor
npm install @capacitor/core@latest @capacitor/cli@latest
npm install @capacitor/ios@latest @capacitor/android@latest
npx cap sync
```
