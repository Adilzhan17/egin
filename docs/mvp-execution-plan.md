# Launch Execution Plan

## Цель

Перевести текущий проект из состояния "богатый MVP" в состояние "контролируемый запуск для Казахстана".

## Главный приоритет

Не добавлять хаотично новые фичи. Сначала закрыть foundation, затем продуктовые пробелы, затем release hardening.

## Порядок работ

### Stage 1. Foundation Hardening

Цель:

- убрать технические блокеры запуска

Задачи:

- убрать зависимость от `synchronize: true`
- ввести миграции
- добавить health-checks
- зафиксировать env-переменные запуска
- обновить roadmap, checklist и ownership docs

Definition of done:

- backend стартует в migration-first режиме
- есть endpoint для health probes
- launch docs живут в репозитории и соответствуют фактическому scope

### Stage 2. Data Integrity и Real Data

Цель:

- убрать продуктовые заглушки из критичных модулей

Задачи:

- dashboard не использует placeholder состояния как основной сценарий
- услуги перестают сидироваться на чтении как launch-данные
- маркетплейс получает реальные поля по freshness, delivery, storage и media
- погода получает режим работы по координатам поля

Definition of done:

- ключевые пользовательские карточки и списки не выглядят демо-данными

### Stage 3. Product Completion по ядру

Цель:

- закрыть функциональные пробелы v1

Задачи:

- вынести карточку культуры в отдельный модуль
- добавить provider profiles и CRUD по услугам
- расширить чат до региональных каналов на REST + polling
- внедрить отзывы и trust layer
- расширить инфоцентр до детальных страниц

Definition of done:

- основные сценарии фермера замыкаются внутри платформы без ручных обходов

### Stage 4. Frontend Restructure

Цель:

- убрать монолитный frontend entrypoint

Задачи:

- разделить frontend на модули: `dashboard`, `market`, `services`, `chat`, `info-center`
- вынести shared API/error/loading patterns
- стабилизировать mobile web UX

Definition of done:

- `frontend/src/app/page.tsx` не является единственной точкой концентрации бизнес-логики

### Stage 5. Release Hardening

Цель:

- подготовить controlled launch

Задачи:

- роли и права
- API error handling
- логирование и мониторинг
- smoke tests по релизным сценариям
- Capacitor regression pass

Definition of done:

- команда может пройти launch checklist без ручных допущений

## Что делать первым

### P0

- production baseline: migrations, health, env policy, docs

### P1

- real-data cleanup: dashboard, services, marketplace, weather

### P2

- trust + community chat + provider cabinet

### P3

- frontend modularization + release polish

## Immediate Next Tasks

1. Перевести backend config на env-управление `synchronize` и подготовить migration-first flow.
2. Добавить `GET /health` и включить его в launch checklist.
3. Обновить документацию под Kazakhstan launch scope.
4. Разбить frontend `page.tsx` на доменные модули, начиная с `dashboard` и `market`.
5. Убрать seed-on-read из `services` и заменить его управляемыми launch-данными.
