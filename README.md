# EGIN · 0.3

Мобильное приложение для участка: 3D-культура, отдельная вкладка погоды, новости, офлайн-дневник, карта, реестр датчиков и настройки по категориям. Интерфейс белый с тёмно-зелёными элементами, рассчитан на телефон (до 480 px). Главная начинается с 3D; чат и рынок остаются в разработке.

## Что работает

- Дневник: создание, изменение и удаление записей; дата и участок; поиск; фото с камеры/галереи и голосовые заметки. Данные и Blob-вложения сохраняются в IndexedDB без интернета. Фото уменьшаются до 1600 px без исходных EXIF, запись голоса ограничена двумя минутами, до восьми вложений на запись.
- Синхронизация: отдельное пространство для каждого профиля, автоматическая отправка при восстановлении сети, открытии приложения и каждые 60 секунд, ручной запуск, повторные попытки, скачивание вложений на втором устройстве. Сравниваются версии записей: конфликт требует явного выбора. Удаления передаются как tombstones. Повторный запрос с теми же данными идемпотентен.
- Фоновая отправка через Background Sync там, где браузер её поддерживает. На остальных устройствах отправка продолжается при открытии приложения. Отключение автоматической синхронизации учитывает и service worker.
- Профиль и passkey: регистрация, вход, второй ключ, удаление ключа (кроме последнего), одноразовый код восстановления с ротацией. Сервер проверяет challenge, RP ID, origin, подпись и user verification. Биометрические данные приложение не получает.
- Карта Leaflet / OpenStreetMap: точки участков, геолокация с показом точности, ручные координаты, культура и площадь. Текущий участок задаёт модель культуры и реальные координаты Open-Meteo. Границы полигонов пока не рисуются. Подложка карты требует сети; координаты хранятся офлайн. Массовое кеширование тайлов не выполняется.
- Датчики: реестр, QR через камеру/изображение, ручной номер, тип и привязка к участку. Добавление в реестр не выдаётся за физическое подключение датчика.
- Отчёты: фильтр участка и периода; HTML с фото/аудио, CSV для таблиц, JSON с вложениями. Файлы скачиваются или передаются через Web Share; в native используется системное меню через Capacitor Filesystem/Share; если отправка файлов не поддерживается, предлагается скачивание. HTML можно распечатать в PDF средствами браузера.
- Push: подписка текущего устройства, отключение, проверочная доставка на свои подписанные устройства. Автоматические оповещения датчиков не включены: их API ещё в разработке. На iPhone используется установленная PWA с поддержкой Web Push.
- Настройки: хозяйство → участки, датчики, API; данные → дневник, синхронизация, экспорт; личное → профиль, безопасность, уведомления; приложение → анимация, хранилище и установка.

**API и интеграции с Google, умными датчиками и аналитикой обозначены «В разработке», по запросу владельца.** Реально работает внутренний сервер входа и синхронизации. Фаза роста не выбирается пользователем и не вычисляется из вымышленных показаний. До подключения аналитики 3D остаётся примером, измерения почвы и подтверждённая фаза отсутствуют.

## Текущий режим разработки

По запросу владельца сейчас меняем и публикуем только сайт. APK/AAB/IPA и native sync запускаются только после явной команды **«релиз»**. Обычные push/PR проверяют веб-приложение; Android доступен в ручном workflow с `build_native=true` только для такого релиза.

Новости загружаются через публичный `GET /api/news`: сервер читает новостной блок ElDala.kz, сохраняет заголовки, рубрики, даты, URL фотографий и ссылки на оригиналы. Полные статьи открываются на ElDala. Кеш в `/data/news-cache.json` обновляется по запросу раз в 15 минут; при сбое источника возвращается последняя лента с `stale=true`, без кеша — 503. Клиент сохраняет последнюю ленту на устройстве; фотографии загружаются напрямую с ElDala и без сети могут быть недоступны. При изменении разметки источника требуется обновить `apps/api/src/news.mjs`.

## Структура

```text
apps/mobile/src/
  app/                     маршрутизация и нижняя навигация
  entities/field/           культуры и будущий контракт мониторинга
  entities/weather/         Open-Meteo, нормализация и кеш по координатам
  entities/workspace/       IndexedDB, типы, синхронизация, вход, QR
  features/home/            3D, новости, переходы к дневнику и карте
  features/weather/         погодные карточки и графики
  features/workspace/       дневник, медиа, карта, датчики, отчёты
  features/settings/        категории и вложенные настройки
  shared/                   общие стили и компоненты
apps/api/src/               Express, SQLite, WebAuthn, медиа и Push
apps/mobile/scripts/       service worker, native sync, APK, trust-файлы
apps/mobile/tests/         unit и браузерные сценарии
apps/api/tests/            изоляция данных, auth, конфликты и тестовый сервер
deploy/                    nginx + API + постоянный том данных
```

`entities/workspace/sync-engine.js` — одна реализация синхронизации для приложения и service worker. API-ключи сторонних сервисов не вводятся и не сохраняются в этой версии.

## Развёртывание

На рабочем сервере используется переключение двух версий через постоянный Nginx:

```sh
python3 deploy/manage.py deploy staging
python3 deploy/manage.py deploy production --reuse-images TAG
```

`TAG` берётся из проверенного staging-релиза (`python3 deploy/manage.py status`). Для первого перехода с одиночного контейнера предусмотрен `python3 deploy/manage.py deploy production`. Старый `deploy/compose.yml` используется только для CI/локального запуска; на действующем сервере он пересоздаст шлюз.

Адрес сайта: **https://egin.perricheno.com**. Веб-контейнер слушает `127.0.0.1:4934`; существующий Cloudflare Tunnel направляется на этот порт. API доступен только через nginx `/api`, внутренний порт 4936 наружу не опубликован.

По умолчанию `RP_ID=egin.perricheno.com`, разрешённый веб-origin `https://egin.perricheno.com`. Passkey привязан к этому домену. Для двух сред домен и RP задаёт `deploy/manage.py`; для локального Compose — `EGIN_RP_ID` и `EGIN_ORIGINS`. В production cookie — HttpOnly, Secure, SameSite=Lax; сессии истекают через 30 дней. Чувствительные ответы API не кешируются service worker. Регистрация и API имеют ограничение частоты запросов; запись и вложения доступны только владельцу.

Том **egin-mobile_egin-data** содержит SQLite (`egin.sqlite`, WAL), серверные сессии, публичные ключи, хеши кодов восстановления и VAPID-ключ. Не удаляйте том при обновлении. Перед обновлением deploy-скрипт делает online-копию SQLite в `/data/backups/`, не останавливая API. Отдельно сохраняйте VAPID-ключ и том целиком для аварийного восстановления; не копируйте открытые файлы SQLite/WAL как обычные файлы. Файлы данных/ключи не должны попадать в Git. В текущей версии: до 10 000 записей и 128 МБ вложений на профиль, до 8 МБ на вложение.

## Запуск и проверка

Нужны Node 22.12+ и pnpm 10.32.1:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
# Тестовый сервер с отдельной БД и localhost RP; не production:
cd apps/api
node tests/preview.mjs
```

Тестовый сервер слушает `http://localhost:4935`, SQLite — `/tmp/egin-preview-data`. В другом терминале:

```sh
pnpm --filter @egin/mobile exec playwright install chromium webkit
EGIN_URL=http://localhost:4935 pnpm --filter @egin/mobile exec node tests/browser.cjs
EGIN_URL=http://localhost:4935 pnpm --filter @egin/mobile exec node tests/auth.cjs
EGIN_URL=http://localhost:4935 pnpm --filter @egin/mobile exec node tests/workspace.cjs
```

Browser-тесты используют фиксированный ответ погоды и виртуальный WebAuthn-аутентификатор. Проверяются телефонные размеры и системные отступы, 3D, погодные карточки, настройки, геолокация, офлайн-перезагрузка, фото/аудио, настоящая серверная проверка passkey, второй браузер как другое устройство, конфликты и экспорт. Safari/WebKit проверяет интерфейс и локальное сохранение; это не заменяет проверку биометрии и native-разрешений на физическом телефоне.

## Формат QR датчиков

Принимается только собственный формат; URL из QR не открывается и не запрашивается автоматически:

```text
egin://sensor?id=SOIL-001&type=moisture&name=Soil
```

Или JSON:

```json
{"version":1,"kind":"egin-sensor","id":"SOIL-001","type":"moisture","name":"Почва 1"}
```

Типы: `moisture`, `temperature`, `weather`. ID: 3–64 латинских символа, цифры, `_` или `-`. Контракт можно адаптировать к производителю, когда появится документация.

## Android и iOS

```sh
pnpm --filter @egin/mobile native:sync
pnpm --filter @egin/mobile native:apk
pnpm --filter @egin/mobile exec cap open ios
```

Capacitor упаковывает локальный `dist`, без удалённого `server.url`. Android использует Java 21, SDK 36, min API 24. APK для проверки: `releases/EGIN-android-debug.apk`. Права камеры, микрофона и геолокации добавляются воспроизводимо через `prepare-native.mjs` и запрашиваются при использовании.

Нативный passkey: `@capgo/capacitor-passkey`, RP `egin.perricheno.com`. HTTP в native проходит через CapacitorHttp с нативным хранилищем cookie. Android Digital Asset Links размещены в `/.well-known/assetlinks.json`; API разрешает только явно перечисленные Android certificate origins. Текущая привязка относится к сертификату сборки для проверки. Перед релизом нужно заменить её сертификатом Play App Signing; приватный signing key не хранится в репозитории.

```sh
node apps/mobile/scripts/native-trust.mjs /private/path/signing-certificate.der
# Только с собственным Apple Developer Team ID:
EGIN_APPLE_TEAM_ID=ABCDEFGHIJ node apps/mobile/scripts/native-trust.mjs
```

После изменения trust-файлов пересоберите сайт и API. Скрипт с Team ID также включает нативный вход iOS в конфигурации интерфейса. Скрипт меняет Android-сертификат на переданный; при одновременной поддержке нескольких подписей их список нужно сохранить явно.

Для iOS нужны macOS/Xcode и Apple Developer Team ID. Associated Domains и entitlement подготовлены плагином, но `apple-app-site-association` пока содержит пустой список приложений: до настройки Team ID native passkey на iOS не будет работать. Веб-passkey на этом домене от Team ID не зависит.

Сборки для проверки на этой машине используют постоянный debug keystore в `/tmp/egin-native/android-home/debug.keystore`; сохраняйте его между сборками. Для распространения используйте релизную подпись владельца.

## Погода и 3D

Open-Meteo: текущая погода, часы, 10 дней, восход/закат, УФ, давление, видимость, точка росы и влажный термометр. Единицы: °C, км/ч, мм, UTC+5. При отсутствии отдельных heat index / wind chill / вероятности грозы отображается отсутствие данных. Кеш погоды ограничен 24 часами и разделён по координатам.

Сцена поддерживает корни, масштаб, сброс ракурса и полный экран; утро/день/вечер/ночь сочетаются с дождём, снегом, облачностью и ветром. Ручной просмотр окружения не меняет реальный прогноз и не задаёт фазу культуры. Рендеринг приостанавливается за пределами экрана и в скрытой вкладке.

Новости — автоматически обновляемая лента ElDala.kz с фотографиями, рубриками и ссылками на оригиналы. Для коммерческого использования погоды нужно выбрать подходящий план провайдера.

## Вход и QR

`/#/auth` — отдельный экран входа, регистрации с passkey и восстановления по одноразовому коду. Главная остаётся доступной без входа. QR на экране входа действует две минуты; его сканируют камерой телефона или через «Настройки → Безопасность → Войти на другом устройстве». На телефоне нужно сверить шестизначный код и подтвердить своим passkey. QR не является кодом eGov: интеграция eGov согласованно отмечена «В разработке».

QR-запрос связан с HttpOnly/SameSite=Strict cookie браузера, который его создал. Ссылка содержит случайный идентификатор во фрагменте URL; секрета получения сессии в QR нет. Подтверждение WebAuthn связано с конкретным QR и профилем. Получение сессии атомарно и однократно, с проверкой срока действия; поддерживаются отклонение и отмена. Серверные тесты проверяют изоляцию браузеров, срок, повтор, CSRF и отсутствие обхода passkey; `tests/auth.cjs` проверяет настоящее WebAuthn-подтверждение виртуальным ключом между двумя браузерами.

## Переключение сайта без остановки

На текущем сервере `egin-mobile-web-1` используется как постоянный Nginx-шлюз. Скрипт принимает существующий контейнер без перезапуска; конфигурация внутри контейнера сохраняется при его обычном рестарте. **Не запускайте старый `docker compose -f deploy/compose.yml up --build` на production после перехода:** он пересоздаёт шлюз. Этот compose остаётся для CI и локального запуска.

```bash
# Собрать и запустить неактивную версию, проверить здоровье, переключить Nginx
python3 deploy/manage.py deploy production
# Независимая тестовая среда, отдельные SQLite, вложения, сессии и passkey RP
python3 deploy/manage.py deploy staging
# Перенести уже проверенные образы между средами без пересборки
python3 deploy/manage.py deploy production --reuse-images TAG
# Быстрый возврат к предыдущей работающей версии
python3 deploy/manage.py rollback production
python3 deploy/manage.py status
```

Production: `https://egin.perricheno.com`, данные в прежнем `egin-mobile_egin-data`. Staging: `https://dev-egin.perricheno.com`, отдельный `egin-staging-data`. Адрес staging намеренно использует один уровень поддомена: стандартный Cloudflare Universal SSL для `*.perricheno.com` не покрывает `dev.egin.perricheno.com`. Для staging нужен публичный маршрут Cloudflare Tunnel: `dev-egin.perricheno.com → http://localhost:4934`, в том же туннеле. Без DNS/маршрута стенд можно проверить локально: `curl -H 'Host: dev-egin.perricheno.com' http://localhost:4934/api/health`. Тестовый стенд получает `X-Robots-Tag: noindex, nofollow`; это не ограничение доступа, поэтому используйте только тестовые данные.

Слоты `blue`/`green` не публикуют порты. Nginx подключён к `egin-edge`, API доступны только внутри каждого слота. Перед переключением проверяются оба контейнера; затем `nginx -t`, graceful reload и фактический ответ `/api/health` с меткой релиза. При неудачном переключении восстанавливается прежняя конфигурация. Предыдущий слот продолжает работать; хешированные статические файлы сохраняются на шлюзе для уже открытых страниц. Данные production общие для двух production-слотов; schema migrations обязаны быть обратно совместимыми. Перед обновлением сохраняется согласованная SQLite-копия в `/data/backups/`. Откат приложения не откатывает пользовательские данные.

Рабочее состояние хранится в игнорируемом `deploy/state/`; сохраняйте эту папку и Docker volumes при переносе сервера. Замена самого шлюза и несовместимые изменения базы требуют отдельного плана; обычное обновление приложения их не выполняет. После аварийного пересоздания шлюза восстановите `deploy/state/gateway.conf` в `/etc/nginx/conf.d/default.conf`, подключите `egin-edge`, сохранённые assets и выполните `nginx -t` / reload. Старые assets, образы и резервные копии автоматически не удаляются.

## Developer portal and external API

`apps/developers` is the responsive EGIN API reference and developer cabinet. Production: `https://api-egin.perricheno.com`; staging: `https://dev-api-egin.perricheno.com`. Both tunnel hostnames route to the permanent gateway on `http://localhost:4934`. The gateway chooses the portal listener (`4938`) of the active environment's web slot. Its main app and portal share that environment's SQLite volume; staging remains isolated from production. Set `PORTAL_ORIGIN` on the API, alongside `APP_ORIGINS` and `RP_ID`.

The public reference at `/openapi.json` and the UI use `apps/api/src/catalog.json`. A server test compares its methods to the installed routes. The `/v1` API supports profile reading, fields/journal/sensor registry CRUD, attachments, weather and news. Sensor measurements, Google Weather and eGov remain unavailable. Documented `/api/*` methods are the existing app/session protocol and do not accept external keys.

The cabinet uses a separate 12-hour HttpOnly host-only cookie, `egin_developer`, scoped to `/api/developer`. QR approval happens on the main app origin, shows the destination and purpose, and requires a fresh passkey assertion. Browser binding and QR audience prevent a main-app QR from issuing a portal session, or vice versa. The portal origin cannot call main-app endpoints.

Create a key in the cabinet, choose individual read/write scopes and a 7/30/90/365-day expiry. `open_key` is the public identifier, `id` (Secret ID in the UI) identifies the key record, and `secret_key` is shown only at creation/rotation. Only its SHA-256 hash is stored. Server integrations send `X-EGIN-Key: $EGIN_OPEN_KEY` and `Authorization: Bearer $EGIN_SECRET_KEY`. Never place secret keys in browser code, URLs or the repository. Rotation revokes the prior pair immediately and preserves expiry. Revocation never deletes profile data.

Each key is limited to 60 requests/minute using a shared SQLite counter. Request logs omit headers, body and query strings and retain up to 500 requests for seven days; the cabinet shows the latest 50. Record writes require `If-Match` for version-aware updates/deletes and enter the same app synchronization sequence. The API enforces profile ownership, attachment ownership and field associations.

For local browser checks after `pnpm build`, start `node tests/preview.mjs` from `apps/api`: main app `http://localhost:4935`, portal `http://localhost:4938`. Run `pnpm --filter @egin/mobile exec node tests/developers.cjs` (Chromium and WebKit required). This exercises two-browser QR/passkey approval, separate sessions, API rights, secret visibility, rotation/revocation, search and responsive layouts. CI also runs it against Docker Compose. Website builds include both apps; native builds remain manual release-only.

### Phone QR and passkey checks

Both EGIN login scanners accept first-party login QR links. The sensor editor routes a login QR to confirmation instead of treating it as a sensor. Foreign login origins are rejected; a link to the other EGIN environment shows its destination in the login scanner. System `FIDO:/` QR codes are identified as operating-system passkey flows and direct the user to the phone camera.

The camera preview is visible before `video.play()` for iOS and decodes frames up to 1600 pixels; photo decoding supports up to 2000 pixels. The camera stops on recognition, cancellation, backgrounding and unmount. QR confirmation reads the actual browser session and keeps the QR destination through login/recovery. It still requires explicit code matching and a verified passkey assertion; merely opening a camera link never approves a login.

Registration defaults to an on-device passkey (`authenticator=platform`, `client-device` hint). Security settings retain explicit USB/NFC-key registration (`securityKey`). A signed-in QR confirmation screen can add a passkey to the same profile on the current phone. An existing session or a working login/recovery credential is required; an unavailable key on another device cannot be bypassed. Run `node tests/qr-scanner.cjs` from `apps/mobile` to test actual QR images, simulated live video, fresh-browser login, phone-key enrollment and WebKit image decoding.
