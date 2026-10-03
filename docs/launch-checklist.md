> Historical record, superseded by [rescue audit](RESCUE_AUDIT.md) and [current verification](VERIFICATION.md).

# Launch Checklist

## Product

- [ ] Dashboard работает для пустого, частично заполненного и полного аккаунта.
- [ ] Карточка культуры вынесена из модалки в отдельный модуль.
- [ ] Marketplace поддерживает фото, freshness, storage, delivery и trust-сигналы.
- [ ] Services имеют provider profile, CRUD и рабочий чат.
- [ ] Chat поддерживает прямые и региональные каналы на REST + polling.
- [ ] Info Center имеет детальные страницы по субсидиям, требованиям и логистике.

## Data

- [ ] Dashboard и аналитика не опираются на заглушки в критических пользовательских сценариях.
- [ ] Погода может работать по координатам поля.
- [ ] Заглушки поставщиков и услуг отделены от launch-данных.
- [ ] Trust-метрики считаются последовательно и объяснимо.

## Backend

- [ ] `synchronize: true` выключен.
- [ ] Миграции описывают текущую схему и применяются предсказуемо.
- [ ] Есть `GET /health`.
- [ ] Swagger и CORS управляются env-настройками.
- [ ] Ошибки API унифицированы.

## Frontend

- [ ] `frontend/src/app/page.tsx` декомпозирован по доменным модулям.
- [ ] Есть единый слой API/error/loading state.
- [ ] Пустые состояния и сетевые ошибки обработаны в dashboard, market, services, chat, info center.
- [ ] Mobile web остается основным и проверенным сценарием.

## QA

- [ ] Пройдены сценарии dashboard: новый пользователь, 1 поле, несколько культур, отсутствие данных.
- [ ] Пройдены сценарии культуры: сроки, стадии роста, shelf life, цвета.
- [ ] Пройдены сценарии marketplace: публикация, рекомендации, фото, чат.
- [ ] Пройдены сценарии services: фильтры, CRUD, чат, рейтинг.
- [ ] Пройдены сценарии chat: доступ, каналы, модерация, медиа.
- [ ] Пройдены сценарии trust: отзывы, агрегирование, abuse protection.

## Release

- [ ] Web build стабилен.
- [ ] Capacitor iOS smoke test пройден.
- [ ] Android scope явно отмечен как post-stabilization, если не доведен до релиза.
- [ ] Документация, roadmap и ownership map актуальны.
