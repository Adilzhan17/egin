# 🌾 AgriPlan (Egin-KZ)

> **Цифровая ГИС-платформа для агрокультуры Казахстана** — веб-приложение для управления сельскохозяйственными участками, мониторинга погоды, торговли на маркетплейсе и анализа данных на базе OpenStreetMap.

---

## 📋 Содержание

- [О проекте](#-о-проекте)
- [Технологический стек](#️-технологический-стек)
- [Архитектура](#-архитектура)
- [Быстрый старт (Локальная разработка)](#-быстрый-старт-локальная-разработка)
- [Структура проекта](#-структура-проекта)
- [Backend API](#-backend-api)
- [Frontend](#-frontend)
- [База данных и миграции](#️-база-данных-и-миграции)
- [Переменные окружения](#-переменные-окружения)
- [Продакшн деплой](#-продакшн-деплой)
- [CI/CD Pipeline](#-cicd-pipeline)
- [Supabase Stack](#-supabase-stack)
- [Cloudflare Tunnel](#-cloudflare-tunnel)
- [Команды разработки](#-команды-разработки)
- [API документация](#-api-документация)
- [Лицензия](#-лицензия)

---

## 🌍 О проекте

**AgriPlan** — полнофункциональная платформа для казахстанских фермеров, покупателей и продавцов сельхозпродукции. Проект решает следующие задачи:

- 🗺️ **Интерактивная карта** — управление земельными участками на базе MapLibre GL с рисованием полигонов
- 🌦️ **Погодный мониторинг** — интеграция с Open-Meteo API для прогноза погоды по координатам
- 🛒 **Маркетплейс** — площадка для торговли сельхозпродукцией между фермерами и покупателями
- 📰 **Инфо-центр** — актуальные новости и полезная информация для аграриев
- 👤 **Профили и роли** — система ролей (фермер, продавец, покупатель, администратор)
- 📊 **Аналитика** — дашборд с данными по участкам и урожайности
- 💬 **Чат** — встроенная система обмена сообщениями

---

## 🛠️ Технологический стек

### Frontend
| Технология | Версия | Назначение |
|-----------|--------|------------|
| **Next.js** | 16.1.6 | React-фреймворк с SSR/SSG |
| **React** | 19.2.3 | UI-библиотека |
| **TypeScript** | 5.x | Типизация |
| **Tailwind CSS** | 4.x | Утилитарные CSS-стили |
| **MapLibre GL** | 5.20.1 | Рендеринг интерактивных карт |
| **Mapbox GL Draw** | 1.5.1 | Рисование полигонов на карте |
| **Turf.js** | 7.3.4 | Геопространственные расчёты |
| **Framer Motion** | 12.36.0 | Анимации и переходы |
| **Radix UI** | Latest | Доступные UI-компоненты |
| **Lucide React** | 0.577.0 | Иконки |
| **Capacitor** | 6.0.0 | Мобильная адаптация (Android/iOS) |
| **@capacitor/google-maps** | 5.4.1 | Google Maps для мобильных |

### Backend
| Технология | Версия | Назначение |
|-----------|--------|------------|
| **NestJS** | 11.x | REST API фреймворк |
| **TypeORM** | 0.3.28 | ORM для PostgreSQL |
| **PostgreSQL** | 15+ | Основная БД (через Supabase) |
| **Passport + JWT** | Latest | Аутентификация |
| **Swagger/OpenAPI** | 11.2.6 | Документация API |
| **bcrypt** | 6.0 | Хеширование паролей |
| **class-validator** | 0.14.4 | Валидация DTO |

### Инфраструктура
| Технология | Назначение |
|-----------|------------|
| **Docker** | Контейнеризация |
| **GitHub Actions** | CI/CD |
| **Supabase (self-hosted)** | Полный стек БД + Auth + Storage |
| **Cloudflare Tunnel** | Безопасный доступ без открытых портов |

---

## 🏗 Архитектура

```
┌──────────────────────────────────────────────────────────────┐
│                     Cloudflare Tunnel                         │
│                                                              │
│  egin.perricheno.ru ──────► Frontend (127.0.0.1:3285)        │
│  egin-api.perricheno.ru ──► Backend  (127.0.0.1:3284)        │
│  egin-studio.perricheno.ru► Supabase Studio (127.0.0.1:3390) │
└──────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Docker Network   │
                    │ (agriplan_default) │
                    └─────────┬─────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
    │   Frontend   │  │   Backend    │  │   Supabase   │
    │  (Next.js)   │  │  (NestJS)    │  │   Stack      │
    │  Port: 3285  │  │  Port: 3284  │  │              │
    └──────────────┘  └──────┬───────┘  │  - PostgreSQL│
                             │          │  - Auth      │
                             ▼          │  - Storage   │
                      ┌──────────────┐  │  - Realtime  │
                      │ agriplan-db  │◄─│  - Kong API  │
                      │ (PostgreSQL) │  │  - Studio    │
                      │  Port: 5435  │  └──────────────┘
                      └──────────────┘
```

Все порты привязаны к `127.0.0.1` — **наружу ничего не торчит**. Весь публичный трафик идёт через Cloudflare Tunnel.

---

## 🚀 Быстрый старт (Локальная разработка)

### Предварительные требования

- **Node.js** >= 24.x (LTS)
- **npm** >= 11.x
- **PostgreSQL** 15+ (локально или через Docker)
- **Git**

### 1. Клонирование репозитория

```bash
git clone https://github.com/yedilius/Egin-KZ.git
cd Egin-KZ
```

### 2. Настройка Backend

```bash
cd backend

# Создаём файл окружения
cp .env.example .env

# Редактируем .env — задаём подключение к локальному PostgreSQL
# Минимально нужно:
#   DB_HOST=localhost
#   DB_PORT=5432
#   DB_USERNAME=postgres
#   DB_PASSWORD=<ваш_пароль>
#   DB_NAME=agro_platform_db
#   JWT_SECRET=your-secret-key

# Устанавливаем зависимости
npm install

# Запускаем миграции (создаёт все таблицы)
npm run migration:run

# Запускаем в режиме разработки (hot-reload)
npm run start:dev
```

Backend запустится на `http://localhost:3008` (или порт из `PORT` в .env).

### 3. Настройка Frontend

```bash
cd frontend

# Устанавливаем зависимости
npm install

# Запускаем в режиме разработки
npm run dev
```

Frontend запустится на `http://localhost:3001`.

### 4. Открываем приложение

Откройте `http://localhost:3001` в браузере. При первом запуске будут созданы демо-аккаунты:

| Роль | Телефон | Пароль |
|------|---------|--------|
| Администратор | +77777777777 | admin123 |
| Фермер (демо) | +77010000001 | demo123 |
| Продавец (демо) | +77010000002 | demo123 |
| Покупатель (демо) | +77010000003 | demo123 |

> **Примечание:** Демо-аккаунты создаются автоматически при `DEMO_ACCOUNTS_ENABLED=true`.

---

## 📁 Структура проекта

```
Egin-KZ/
├── .github/
│   └── workflows/
│       └── deploy.yml              # CI/CD конфигурация
│
├── backend/                        # NestJS API сервер
│   ├── src/
│   │   ├── analytics/              # Аналитика и статистика
│   │   ├── auth/                   # Аутентификация (JWT, Passport)
│   │   │   ├── guards/             # Auth guards (JWT, роли)
│   │   │   ├── strategies/         # Passport стратегии
│   │   │   ├── dto/                # Login/Register DTO
│   │   │   └── admin-bootstrap.service.ts  # Создание админа при старте
│   │   ├── chat/                   # Система сообщений
│   │   ├── common/                 # Общие утилиты, декораторы
│   │   ├── crops/                  # Справочник культур
│   │   ├── dashboard/              # Дашборд агрегации
│   │   ├── database/               # TypeORM конфигурация и миграции
│   │   │   ├── database.config.ts  # Конфигурация подключения к БД
│   │   │   ├── data-source.ts      # DataSource для CLI
│   │   │   └── migrations/         # SQL миграции
│   │   ├── demo/                   # Демо-данные и аккаунты
│   │   ├── farm-plots/             # CRUD земельных участков (GeoJSON)
│   │   ├── info-center/            # Новости и информация
│   │   ├── marketplace/            # Маркетплейс объявлений
│   │   ├── orders/                 # Заказы и транзакции
│   │   ├── services/               # Сервисы (погода, внешние API)
│   │   ├── users/                  # Управление пользователями
│   │   ├── weather/                # Интеграция с Open-Meteo
│   │   ├── app.module.ts           # Корневой модуль NestJS
│   │   └── main.ts                 # Точка входа (bootstrap)
│   ├── Dockerfile                  # Продакшн Docker-образ
│   ├── .env.example                # Пример переменных окружения
│   └── package.json
│
├── frontend/                       # Next.js клиентское приложение
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx            # Главная страница (SPA)
│   │   │   ├── layout.tsx          # Root layout
│   │   │   └── globals.css         # Глобальные стили
│   │   ├── components/
│   │   │   ├── map/
│   │   │   │   ├── Map.tsx         # Интерактивная карта (MapLibre)
│   │   │   │   └── draw-theme.ts   # Стили рисования полигонов
│   │   │   └── ui/
│   │   │       ├── auth-view.tsx          # Авторизация / регистрация
│   │   │       ├── admin-view.tsx         # Панель администратора
│   │   │       ├── market-view.tsx        # Маркетплейс
│   │   │       ├── services-view.tsx      # Сервисы
│   │   │       ├── info-center-view.tsx   # Инфо-центр
│   │   │       ├── profile-view.tsx       # Профиль пользователя
│   │   │       ├── crop-detail-sheet.tsx  # Детали культуры
│   │   │       ├── create-listing-modal.tsx # Создание объявления
│   │   │       └── ...                    # UI компоненты (button, card, etc.)
│   │   ├── lib/                    # Утилиты и хелперы
│   │   └── workers/                # Web Workers (тяжёлые вычисления)
│   ├── Dockerfile                  # Multi-stage Docker-образ
│   ├── next.config.ts              # Конфигурация Next.js (standalone)
│   └── package.json
│
├── docs/                           # Документация проекта
├── docker-compose.prod.yml         # Docker Compose для продакшна
├── install_agriplan_supabase_server.sh  # Скрипт установки Supabase
├── GeoJson.txt                     # Примеры GeoJSON данных
└── README.md                       # ← Вы здесь
```

---

## 🔌 Backend API

Backend построен на **NestJS** и предоставляет REST API по адресу `/api/v1`.

### Основные модули

| Модуль | Маршрут | Описание |
|--------|---------|----------|
| **Auth** | `/api/v1/auth/*` | Регистрация, вход, JWT токены |
| **Users** | `/api/v1/users/*` | CRUD пользователей, роли |
| **Farm Plots** | `/api/v1/farm-plots/*` | Земельные участки (GeoJSON полигоны) |
| **Crops** | `/api/v1/crops/*` | Справочник сельскохозяйственных культур |
| **Marketplace** | `/api/v1/marketplace/*` | Объявления купли-продажи |
| **Orders** | `/api/v1/orders/*` | Управление заказами |
| **Chat** | `/api/v1/chat/*` | Обмен сообщениями |
| **Weather** | `/api/v1/weather/*` | Прогноз погоды (Open-Meteo) |
| **Dashboard** | `/api/v1/dashboard/*` | Агрегированные данные |
| **Info Center** | `/api/v1/info-center/*` | Новости и статьи |
| **Analytics** | `/api/v1/analytics/*` | Статистика платформы |

### Аутентификация

API использует **JWT Bearer** токены:

```bash
# Вход
curl -X POST http://localhost:3008/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "+77777777777", "password": "admin123"}'

# Ответ: { "accessToken": "eyJhbG..." }

# Использование токена
curl http://localhost:3008/api/v1/users/me \
  -H "Authorization: Bearer eyJhbG..."
```

### Swagger документация

При включённом `API_DOCS_ENABLED=true` доступна интерактивная документация:
```
http://localhost:3008/api/docs
```

---

## 🎨 Frontend

Frontend — это **Single Page Application** на Next.js 16 с интерактивной картой как основным элементом интерфейса.

### Ключевые возможности

- 🗺️ **MapLibre GL** — высокопроизводительный рендеринг карт на WebGL
- ✏️ **Mapbox GL Draw** — рисование и редактирование полигонов земельных участков
- 📐 **Turf.js** — расчёт площадей, пересечений, буферных зон
- 📱 **Capacitor** — компиляция в нативное iOS-приложение
- 🎭 **Framer Motion** — плавные анимации и переходы между экранами
- 🧠 **ONNX Runtime** — ML-модели прямо в браузере (Web Workers)

### Настройка API URL

Frontend обращается к API через переменную окружения:

```env
NEXT_PUBLIC_API_URL=http://localhost:3008/api/v1
```

Для продакшна:
```env
NEXT_PUBLIC_API_URL=https://egin-api.perricheno.ru/api/v1
```

> **Важно:** `NEXT_PUBLIC_` переменные вшиваются на этапе сборки (`next build`).

---

## 🗄️ База данных и миграции

### Подключение

Backend поддерживает два способа подключения к PostgreSQL:

**Вариант 1: Отдельные параметры** (для локальной разработки)
```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=mypassword
DB_NAME=agro_platform_db
```

**Вариант 2: DATABASE_URL** (для продакшна / Supabase)
```env
DATABASE_URL=postgres://postgres:password@agriplan-db:5435/postgres
```

Если задан `DATABASE_URL`, он имеет приоритет над отдельными параметрами.

### Миграции TypeORM

```bash
cd backend

# Применить все миграции
npm run migration:run

# Сгенерировать миграцию из изменений в entities
npm run migration:generate

# Создать пустую миграцию вручную
npm run migration:create

# Откатить последнюю миграцию
npm run migration:revert
```

### Авто-миграции

При `DB_MIGRATIONS_RUN=true` миграции применяются автоматически при запуске бэкенда. Рекомендуется для продакшна.

---

## 🔐 Переменные окружения

### Backend (.env)

| Переменная | Обязательная | По умолчанию | Описание |
|-----------|:---:|------------|----------|
| `APP_ENV` | ❌ | `development` | Окружение (development / production) |
| `PORT` | ❌ | `3000` | Порт API сервера |
| `DATABASE_URL` | ⚡ | — | Полный URL подключения к PostgreSQL |
| `DB_HOST` | ⚡ | `localhost` | Хост базы данных |
| `DB_PORT` | ⚡ | `5432` | Порт базы данных |
| `DB_USERNAME` | ⚡ | `postgres` | Пользователь БД |
| `DB_PASSWORD` | ⚡ | — | Пароль БД |
| `DB_NAME` | ⚡ | — | Имя базы данных |
| `DB_SSL` | ❌ | `false` | SSL-подключение к БД |
| `DB_SYNCHRONIZE` | ❌ | `false` | Авто-синхронизация схемы (⚠️ не для продакшна!) |
| `DB_MIGRATIONS_RUN` | ❌ | `true` | Запуск миграций при старте |
| `DB_LOGGING` | ❌ | `false` | Логирование SQL-запросов |
| `JWT_SECRET` | ✅ | — | Секретный ключ JWT подписи |
| `CORS_ORIGIN` | ❌ | `*` | Разрешённые домены (через запятую) |
| `API_DOCS_ENABLED` | ❌ | `true` | Включить Swagger UI |
| `WEATHER_API_BASE_URL` | ❌ | Open-Meteo | URL погодного API |
| `ADMIN_PHONE` | ❌ | — | Телефон администратора |
| `ADMIN_PASSWORD` | ❌ | — | Пароль администратора |
| `ADMIN_FULL_NAME` | ❌ | — | Имя администратора |
| `ADMIN_REGION` | ❌ | — | Регион администратора |
| `ADMIN_DISTRICT` | ❌ | — | Район администратора |
| `DEMO_ACCOUNTS_ENABLED` | ❌ | `false` | Создание демо-аккаунтов |
| `DEMO_PASSWORD` | ❌ | — | Пароль для демо-аккаунтов |

> ⚡ = обязательна одна из групп: либо `DATABASE_URL`, либо набор `DB_HOST` + `DB_PORT` + `DB_USERNAME` + `DB_PASSWORD` + `DB_NAME`

### Frontend

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_API_URL` | URL бэкенда (вшивается при сборке) |

### GitHub Secrets (для CI/CD)

| Секрет | Описание |
|--------|----------|
| `SSH_HOST` | IP-адрес продакшн-сервера |
| `SSH_USER` | SSH пользователь (root) |
| `SSH_PRIVATE_KEY` | Приватный SSH ключ |
| `PROD_ENV_FILE` | Полный .env файл для продакшна |
| `NEXT_PUBLIC_API_URL` | URL API для фронтенда |

---

## 🚢 Продакшн деплой

### Архитектура развёртывания

Приложение развёрнуто на выделенном сервере (Contabo VPS) со следующей конфигурацией:

- **8 vCPU / 24 GB RAM / 400 GB SSD**
- **1 Гбит/с** канал
- **Ubuntu** с Docker
- Все сервисы спрятаны за **Cloudflare Tunnel**

---

## 🛠️ Администрирование и "Ядерная" Починка

Если сайт упал, не видит базу или Studio не открывается, используй эти инструкции.

### 🔗 Основные Ссылки (Production)
- **Frontend:** [https://egin.perricheno.ru](https://egin.perricheno.ru)
- **Backend API:** [https://egin-api.perricheno.ru](https://egin-api.perricheno.ru)
- **Studio (БД):** [https://egin-studio.perricheno.ru](https://egin-studio.perricheno.ru)
- **Swagger:** [https://egin-api.perricheno.ru/api/docs](https://egin-api.perricheno.ru/api/docs)

### ☣️ Nuclear Fix (Атомарное восстановление)
Выполни этот блок команд на сервере, если всё сломалось. Он гарантированно поднимет стэк в правильном порядке:

```bash
# 1. Запуск инфраструктуры (БД, Auth, API Gateway)
cd /root/agriplan-supabase-stack/docker
docker compose up -d

# 2. Перезапуск приложения (Backend + Frontend)
cd ~/agriplan
docker compose down && docker compose up -d

# 3. Проброс сети (если Backend не видит БД "agriplan-db")
docker network connect agriplan_default agriplan-db 2>/dev/null || true
```

### Компоненты на сервере

```
~/agriplan/
├── repo/                   # Код проекта (git clone)
├── docker-compose.yml      # Копия docker-compose.prod.yml
└── .env                    # Продакшн переменные

~/agriplan-supabase-stack/  # Изолированный Supabase
└── docker/
    ├── docker-compose.yml
    └── .env
```

### docker-compose.prod.yml

```yaml
services:
  backend:
    image: agriplan-backend:latest
    container_name: agriplan-backend
    restart: always
    ports:
      - "127.0.0.1:3284:3284"    # Только localhost!
    env_file:
      - .env

  frontend:
    image: agriplan-frontend:latest
    container_name: agriplan-frontend
    restart: always
    ports:
      - "127.0.0.1:3285:3285"    # Только localhost!
    env_file:
      - .env

networks:
  default:
    name: agriplan_default
    external: true
```

### Порты (все на 127.0.0.1)

| Сервис | Порт | Контейнер |
|--------|------|-----------|
| Frontend (Next.js) | 3285 | agriplan-frontend |
| Backend (NestJS) | 3284 | agriplan-backend |
| Supabase Studio | 3390 | agriplan-studio |
| Supabase Kong API | 8021 | agriplan-kong |
| PostgreSQL | 5435 | agriplan-db |
| Supabase Pooler | 6544 | agriplan-pooler |

---

## 🔄 CI/CD Pipeline

### Как работает деплой

При каждом `git push` в ветку `main` запускается GitHub Actions:

```
git push main
    │
    ▼
GitHub Actions запускается
    │
    ▼
SSH → Сервер
    │
    ├── 1. git fetch --depth 1 (обновление кода)
    ├── 2. Запись .env из GitHub Secrets
    ├── 3. docker build (frontend + backend ПАРАЛЛЕЛЬНО)
    ├── 4. docker compose down
    ├── 5. docker compose up -d
    └── 6. docker image prune
    │
    ▼
✅ Деплой завершён (~1-3 мин)
```

### Почему так быстро?

- **Сборка на сервере** — образы не пушатся через GHCR, а собираются прямо на VPS (8 ядер)
- **Параллельная сборка** — frontend и backend строятся одновременно
- **Docker layer cache** — повторные сборки при изменении только кода занимают ~30 секунд
- **Shallow clone** — `git clone --depth 1` качает только последний коммит

### Конфигурация (.github/workflows/deploy.yml)

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy & Build on Server
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.SSH_HOST }}
          username: ${{ secrets.SSH_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          command_timeout: 10m
          script: |
            # ... сборка и деплой на сервере
```

---

## 🗃 Supabase Stack

### Зачем отдельный Supabase?

На сервере уже работают другие проекты с PostgreSQL. Чтобы избежать конфликтов, AgriPlan использует **полностью изолированный** инстанс Supabase со своими:

- Контейнерами (agriplan-* вместо supabase-*)
- Портами (5435, 3390, 8021 вместо стандартных)
- Сетью Docker (agriplan_default)
- Паролями

### Установка

```bash
# На сервере:
bash install_agriplan_supabase_server.sh
```

Скрипт автоматически:
1. Клонирует официальный репозиторий Supabase
2. Переименовывает все контейнеры в `agriplan-*`
3. Меняет порты на уникальные (числовые значения: 5435, 3390, 8021 и т.д.)
4. Устанавливает пароль БД
5. Запускает весь стек в единой сети `agriplan_default`

### 🔑 Доступы в Supabase Studio
Интерфейс управления базой доступен по адресу **egin-studio.perricheno.ru**.
- **User:** `perricheno`
- **Password:** `perricheno2.7`

> ⚠️ **Важно:** Переменные портов в `.env` Supabase (`POSTGRES_PORT`, `STUDIO_PORT` и т.д.) должны содержать **только число** (например, `5435`), а не `127.0.0.1:5435`. PostgreSQL использует эти значения для внутренней конфигурации параметра `port`, который не принимает IP-адреса. Привязка к localhost делается через секцию `ports:` в `docker-compose.yml`.

### Что входит в стек

| Компонент | Контейнер | Описание |
|-----------|-----------|----------|
| PostgreSQL | agriplan-db | Основная база данных |
| PostgREST | agriplan-rest | Auto-generated REST API |
| GoTrue | agriplan-gotrue | Аутентификация |
| Realtime | agriplan-realtime | WebSocket подписки |
| Storage | agriplan-storage | Хранилище файлов (S3-совместимое) |
| Kong | agriplan-kong | API Gateway |
| Studio | agriplan-studio | Веб-интерфейс управления |
| PgBouncer | agriplan-pgbouncer | Connection pooling |

---

## 🌐 Cloudflare Tunnel

`cloudflared` контейнер работает в режиме `network_mode: host`, поэтому он видит все порты на `127.0.0.1` напрямую.

### Настройка маршрутов

В Cloudflare Dashboard → Zero Trust → Tunnels → Configure:

| Subdomain | Domain | Service |
|-----------|--------|---------|
| `egin` | `perricheno.ru` | `http://127.0.0.1:3285` |
| `egin-api` | `perricheno.ru` | `http://127.0.0.1:3284` |
| `egin-studio` | `perricheno.ru` | `http://127.0.0.1:3390` |

### Результат

| URL | Назначение |
|-----|------------|
| `https://egin.perricheno.ru` | Веб-приложение |
| `https://egin-api.perricheno.ru` | REST API |
| `https://egin-api.perricheno.ru/api/docs` | Swagger |
| `https://egin-studio.perricheno.ru` | Supabase Studio |

### Общая Docker-сеть

Supabase и приложение (backend/frontend) работают в **одной Docker-сети** `agriplan_default`. Supabase docker-compose должен содержать:

```yaml
networks:
  default:
    name: agriplan_default
```

А docker-compose.prod.yml приложения:

```yaml
networks:
  default:
    name: agriplan_default
    external: true
```

Это позволяет backend'у обращаться к БД по имени `agriplan-db:5432` через внутреннюю сеть.

---

## 🔧 Troubleshooting

### `getaddrinfo EAI_AGAIN agriplan-db`

Backend не может найти контейнер `agriplan-db`. Причины:
1. Supabase не запущен → `cd /root/agriplan-supabase-stack/docker && docker compose up -d`
2. Контейнеры на разных сетях → `docker network connect agriplan_default agriplan-db`
3. Сеть создана вручную и Supabase не подключился → удалите сеть, пусть Supabase создаст:
   ```bash
   cd ~/agriplan && docker compose down
   docker network rm agriplan_default
   cd /root/agriplan-supabase-stack/docker && docker compose up -d
   cd ~/agriplan && docker compose up -d
   ```

### `invalid value for parameter "port": "127.0.0.1:5435"`

В `.env` Supabase порт содержит IP-адрес. Исправьте:
```bash
sed -i 's/POSTGRES_PORT=127.0.0.1:5435/POSTGRES_PORT=5435/' .env
```

### 502 Bad Gateway (Cloudflare)

1. Проверьте что контейнеры запущены: `docker ps --filter name=agriplan`
2. Проверьте что `cloudflared` в режиме `host` видит порты: `curl http://127.0.0.1:3285`
3. Убедитесь что в Cloudflare маршруты указывают на `http://127.0.0.1:PORT` (не на имена контейнеров)

### Supabase контейнеры не стартуют

```bash
# Проверить логи проблемного контейнера
docker logs agriplan-db --tail 30

# Полный перезапуск с очисткой
cd /root/agriplan-supabase-stack/docker
docker compose down -v
docker compose up -d
```

---

## 📝 Команды разработки

### Backend

```bash
cd backend

npm run start:dev        # Разработка (hot-reload)
npm run start:prod       # Продакшн
npm run build            # Сборка
npm run lint             # Линтинг
npm run test             # Юнит-тесты
npm run test:e2e         # E2E тесты
npm run migration:run    # Применить миграции
npm run migration:generate  # Генерация миграции из entities
npm run format           # Форматирование кода (Prettier)
```

### Frontend

```bash
cd frontend

npm run dev              # Разработка на порту 3001
npm run build            # Продакшн сборка
npm run lint             # ESLint проверка
npm run cap:sync         # Синхронизация Capacitor (iOS)
npm run cap:open:ios     # Открыть проект в Xcode
```

### Docker (продакшн)

```bash
# Ручная сборка образов
docker build -t agriplan-backend:latest ./backend
docker build -t agriplan-frontend:latest --build-arg NEXT_PUBLIC_API_URL=https://egin-api.perricheno.ru/api/v1 ./frontend

# Запуск
docker compose -f docker-compose.prod.yml up -d

# Просмотр логов
docker logs agriplan-backend --tail 50 -f
docker logs agriplan-frontend --tail 50 -f

# Перезапуск
docker compose -f docker-compose.prod.yml restart
```

---

## 📱 Мобильное приложение (Android)

### Скачать APK

Готовое Android-приложение доступно в релизах:
- **GitHub Release:** [v1.0.0](https://github.com/yedilius/Egin-KZ/releases/tag/v1.0.0)
- **Файл:** `EginMap-v1.0.0-release.apk` (23MB)

### Установка на Android

1. Скачайте APK файл с GitHub
2. Разрешите установку из неизвестных источников в настройках Android
3. Откройте APK файл и установите приложение
4. Приложение автоматически подключится к production API: `https://egin-api.perricheno.ru`

### Сборка Android APK локально

```bash
cd frontend

# 1. Установка зависимостей
npm install

# 2. Сборка Next.js приложения
npm run build

# 3. Синхронизация с Capacitor
npx cap sync android

# 4. Установка Java 17 (если нужно)
bash ../fix-android-gradle.sh

# 5. Сборка APK
cd android
./gradlew assembleRelease

# APK будет в: android/app/build/outputs/apk/release/app-release-unsigned.apk
```

### Требования для сборки

- **Node.js** >= 24.x
- **Java JDK** 17
- **Gradle** 8.2.1+
- **Android SDK** (API 34+)

### Особенности мобильной версии

- ✅ Полная функциональность веб-версии
- ✅ Google Maps нативная интеграция
- ✅ Оффлайн кэширование
- ✅ Push-уведомления (планируется)
- ✅ Геолокация с высокой точностью
- ✅ Оптимизация для мобильных сетей

---

## 📚 API документация

При запущенном бэкенде доступна интерактивная документация Swagger:

- **Локально:** http://localhost:3008/api/docs
- **Продакшн:** https://egin-api.perricheno.ru/api/docs

Swagger позволяет:
- Просматривать все эндпоинты с описаниями
- Тестировать запросы прямо из браузера
- Видеть схемы запросов и ответов (DTO)
- Авторизовываться через Bearer токен

---

## 📄 Лицензия

Этот проект является приватным и не распространяется под открытой лицензией.

---

<div align="center">

**Сделано с ❤️ для казахстанских фермеров**

🌾 AgriPlan — Цифровое будущее сельского хозяйства Казахстана 🇰🇿

</div>
