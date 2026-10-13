# EGIN 3.0 — отчёт и проверка

Изменения встроены в существующий сайт. Нижняя навигация, 3D, Погода, кадастр, прежние объявления и переписка сохранены. Торговый кабинет открывается из Рынка; на Главной добавлена компактная ссылка под растением.

## Реализовано

| Направление | Рабочие возможности |
| --- | --- |
| Chat Video Notes | Запись с камеры и микрофона, передняя/задняя камера, удержание и фиксация записи, ограничение длительности, просмотр перед отправкой, отмена, повтор, загрузка готового видео при отсутствии записи, круглый проигрыватель. Сервер проверяет видео, преобразует MP4 и создаёт превью. Используются существующие сообщения, приватные вложения и очередь отправки. |
| Trade | Организации и роли, привязка существующих участков, партии и показатели качества, шестишаговая публикация с серверным черновиком, закупки, предложения и встречные версии, сравнение чистой выручки, переговоры через настоящий Чат. Принятие предложения создаёт сделку и резервирует остаток в одной транзакции. |
| Исполнение | Согласование условий и копий документов, версии документов, частичные отгрузки, приёмка и расхождения, заявление об оплате и независимое подтверждение продавца, завершение и история действий. Доступ к документам проверяется при каждом запросе. |
| Profitability | Плановые и фактические затраты, CSV-импорт, фактические подтверждённые поступления, аналитика культур и полей, остатки, себестоимость, платные экспорт и сравнение сезонов. Неизвестные расходы и отсутствующая площадь не заменяются выдуманными числами. |
| Billing | Серверные тарифы, лимиты сотрудников/закупок/предложений, неизменяемый снимок условий счёта, банковское подтверждение оператором, подписки и явный пробный период. Платные сохранённые поиски, согласие на предоставление квалифицированной заявки, оплачиваемый доступ к контактам и учёт подтверждённого возврата. |
| Партнёры | Настоящие компании публикуют услуги, получают запрос по конкретной сделке и предлагают цену/сроки. Заказчик принимает или отклоняет предложение; закрытые документы сделки партнёру не раскрываются. |
| Управление | Защищённая панель оператора: проверка организаций и заявок, тарифы, банковские реквизиты, платежи, пробные периоды, аудит, переключатели функций и лимит видеозаметок. |

## Архитектура

Сохранены React/Vite, Express, существующая авторизация SQLite, PostgreSQL и приватное файловое хранилище. Новые модули: `apps/api/src/platform/`, `apps/api/src/trade/`, `apps/mobile/src/features/business/`, `apps/mobile/src/features/trade/`. Новый чат или отдельная база не создавались.

- Миграции Platform 1–2: организации/участники/приглашения, операторы, настройки и аудит, уведомления, тарифы/счета/доказательства платежа/подписки, квалифицированные заявки, партнёры/запросы/предложения услуг.
- Миграции Trade 1–4: партии, публикации, закупки, предложения и версии, сделки/события, отгрузки/платежи/документы/файлы, расходы, сохранённые поиски и очередь совпадений.
- Миграция Chat 8: тип `video_note` в существующих сообщениях и вложениях.
- API: `/api/platform/*`, `/api/trade/*`; видеозаметки расширяют прежние `/api/chat/*`. Полные маршруты находятся в справочнике API; DTO торговли — в `apps/api/src/trade/CONTRACT.md`.

Изменения фиксируют событие PostgreSQL в той же транзакции, затем через существующий SSE приходит адресный сигнал `platform`. Клиент загружает актуальные разрешённые данные. История уведомлений восстанавливается после reconnect; доставка подтверждается видимым экраном. Переход из уведомления выбирает организацию по серверным правам. Повторные команды защищены идентификаторами, версиями и ограничениями БД.

## Что исправлено во время проверки

- Повторное подтверждение банковского платежа не выдаёт вторую подписку.
- Удаление сотрудника и одновременная запись не приводят к взаимной блокировке; права отзываются на сервере.
- Приглашение от утратившего права администратора больше нельзя принять.
- Перевозчик не может создать или принять новые условия по закрытой сделке.
- Переход к встречному предложению работает и внутри уже открытой карточки.
- Изменившиеся условия предложения явно показаны в диалоге подтверждения после конфликта версии.
- Уведомления партнёра открывают запрос услуги, а не недоступную ему закрытую сделку.
- Убрано горизонтальное переполнение кабинета на 360px.
- Nginx пропускает допустимые API документы до 15 МБ: лимит прокси согласован на обоих уровнях.

## Проверка пользователем

Используйте тестовый сайт и отдельные браузерные профили для продавца и покупателя.

1. Войдите обычным passkey или QR. Рынок → «Урожай и сделки» → «Организация и тарифы». Создайте хозяйство, укажите реквизиты и свяжите участки.
2. Создайте партию: культура, фактический объём, хранение, качество и документы. Пройдите публикацию; сохраните черновик и перезагрузите страницу перед продолжением.
3. Во втором аккаунте создайте компанию покупателя. Найдите продукцию и отправьте предложение с объёмом, ценой, оплатой, доставкой и сроком действия.
4. От другого покупателя отправьте второе предложение. Продавец сравнивает их: если расходы неизвестны или условия несопоставимы, окончательный победитель не назначается.
5. Откройте переговоры в Чате. Измените условия встречным предложением, затем примите актуальную версию другой стороной. Проверьте резерв партии.
6. В сделке обе стороны согласуют условия. Загрузите договор и подтвердите его копию с другой стороны. Это подтверждение документа, а не ЭЦП.
7. Выполните частичную отгрузку, на стороне покупателя внесите факт приёмки. Для расхождения требуется отдельное согласование.
8. Покупатель заявляет перевод и прикладывает документ. Выручка ещё не меняется. Продавец сверяет фактическое поступление и подтверждает его. После исполнения обе стороны завершают сделку.
9. В «Финансах урожая» добавьте фактический и плановый расход или импортируйте CSV по образцу. Проверьте раздельные суммы и аналитику.
10. В Чате переключите запись на видео, разрешите камеру/микрофон, запишите, просмотрите и отправьте. Получатель должен воспроизвести сообщение после перезагрузки. Отдельно проверьте отказ в разрешении и повтор после потери сети.
11. Для тарифа оператор задаёт реальные условия и банковские реквизиты либо выдаёт явно согласованный пробный период. До подтверждения реального поступления платные функции не включаются. Проверьте отмену, истечение срока и доступ к прежним сделкам.
12. Для партнёрского сценария создайте компанию «Партнёр», опубликуйте услугу, пригласите её из сделки, отправьте и согласуйте цену. Закрытые документы сделки у партнёра должны оставаться недоступными.

## Переключатели и доступ оператора

Путь: Рынок → кабинет организации → «Управление egin». Прямая ссылка: `/#/market?view=business&tab=admin`. Панель появляется только у назначенного оператора. Назначение требует точного ID существующего аккаунта; первому зарегистрировавшемуся права не выдаются. Команда внутри активного API-контейнера: `node scripts/platform-admin.mjs grant USER_ID`.

Доступны 13 переключателей: видеозаметки; Trade целиком, публикации, предложения, сравнение, сделки, логистика, партнёры; расходы и аналитика; подписки покупателя, Egin Pro и квалифицированные заявки. В каждом можно выбрать всех, конкретные аккаунты, роли или организации. Отключение новых операций сохраняет данные и исполнение существующих обязательств. Лимит видео — 10–180 секунд, по умолчанию 60.

## Внешние ограничения

Автоматический эквайринг, банковские webhooks, ЭЦП, официальная проверка реестров и API перевозчиков не подключены: нужны выбранный поставщик и его доступы. Работают прозрачные ручные подтверждения и реальные предложения партнёров. Дорожное расстояние не вычисляется по прямой: показываются заданные точки и переход к внешнему построению маршрута. Налоговая сумма вводится явно; режим налогообложения не угадывается.

Тарифы, цены лидов и банковские реквизиты нужно настроить оператору — фиктивных коммерческих данных в основной базе нет. Назначение оператора ожидает точного профиля владельца. На физическом iPhone и Android остаётся ручная проверка камеры, жестов и системных разрешений: автоматический WebKit не заменяет настоящий телефон.

Подробные контракты и эксплуатация: [BUSINESS-PLATFORM.md](BUSINESS-PLATFORM.md), [VIDEO-NOTES.md](VIDEO-NOTES.md). Результаты автоматических прогонов и перечень файлов приводятся ниже.


## Результаты автоматических проверок

- `pnpm typecheck` — обе веб-части прошли.
- `pnpm test` — 70 мобильных unit-тестов и 78 API-тестов прошли. В стандартном запуске 12 проверок с внешними зависимостями отмечены как skipped; для Chat/Platform/Trade выполнен отдельный реальный прогон ниже.
- PostgreSQL + ffmpeg/qpdf: **97/97**, без пропусков — авторизация, членство, финансы, конкурирующие операции, видео, приватные документы, подписки, партнёры и переходы из уведомлений.
- Прежний Market, отдельная чистая PostgreSQL: **11/11** — объявления, права, фильтры, поиск, избранное, квоты и файлы. Первый запуск на общей базе браузерных fixtures выявил зависимость старого теста от пустого каталога; повтор в отдельной временной БД прошёл без изменения приложения.
- Реальный браузерный торговый сценарий: три аккаунта, PostgreSQL, SSE, повторная загрузка, сравнение, встречные версии, CSV; **230 запросов без 429 и ошибок страницы**.
- Прежний Chat 2.0: реальные два пользователя, typing, одновременная отправка без дублей, реакции, личные темы, поиск старой истории, удаление, геолокация, выход/передача группы и отзыв доступа — прошёл.
- Chromium + WebKit: видеозаметки/очередь, административная панель, бизнес-кабинет, торговые карточки, уведомления и прямые ссылки. Проверены 360/390/430px и desktop; снимки просмотрены.
- `pnpm build` — сайт и developer portal прошли. Сохраняется предупреждение Vite о больших chunks; это не ошибка сборки. Отдельного lint-скрипта в проекте нет; `git diff --check` чистый.
- Физическая камера iPhone/Android и реальный платёжный провайдер не проверялись автоматически. ML inference не менялся и его внешний тест в общем запуске пропущен.

## Изменённые файлы

Исходные пользовательские HTML/ZIP/PNG-комплекты в корне не включены в коммит.

- `.github/workflows/business.yml`
- `apps/api/scripts/platform-admin.mjs`
- `apps/api/src/catalog.json`
- `apps/api/src/chat/CONTRACT.md`
- `apps/api/src/chat/attachments.mjs`
- `apps/api/src/chat/index.mjs`
- `apps/api/src/chat/messenger.mjs`
- `apps/api/src/chat/trade-bridge.mjs`
- `apps/api/src/chat/validation.mjs`
- `apps/api/src/platform/billing.mjs`
- `apps/api/src/platform/index.mjs`
- `apps/api/src/platform/migrations.mjs`
- `apps/api/src/platform/notifications.mjs`
- `apps/api/src/platform/services.mjs`
- `apps/api/src/platform/validation.mjs`
- `apps/api/src/server.mjs`
- `apps/api/src/trade/CONTRACT.md`
- `apps/api/src/trade/context.mjs`
- `apps/api/src/trade/deals.mjs`
- `apps/api/src/trade/decimal.mjs`
- `apps/api/src/trade/farm.mjs`
- `apps/api/src/trade/files.mjs`
- `apps/api/src/trade/history.mjs`
- `apps/api/src/trade/index.mjs`
- `apps/api/src/trade/listings.mjs`
- `apps/api/src/trade/lots.mjs`
- `apps/api/src/trade/migrations.mjs`
- `apps/api/src/trade/offers.mjs`
- `apps/api/src/trade/saved-searches.mjs`
- `apps/api/src/trade/validation.mjs`
- `apps/api/tests/chat-video-notes.test.mjs`
- `apps/api/tests/developer.test.mjs`
- `apps/api/tests/platform-partners.test.mjs`
- `apps/api/tests/platform-security.test.mjs`
- `apps/api/tests/platform.test.mjs`
- `apps/api/tests/trade.test.mjs`
- `apps/mobile/src/features/business/BillingPanel.tsx`
- `apps/mobile/src/features/business/BusinessAdmin.tsx`
- `apps/mobile/src/features/business/BusinessPanel.tsx`
- `apps/mobile/src/features/business/LeadsPanel.tsx`
- `apps/mobile/src/features/business/NotificationsPanel.tsx`
- `apps/mobile/src/features/business/OrganizationTeam.tsx`
- `apps/mobile/src/features/business/PartnerServices.tsx`
- `apps/mobile/src/features/business/admin.css`
- `apps/mobile/src/features/business/api.ts`
- `apps/mobile/src/features/business/business.css`
- `apps/mobile/src/features/business/ui.tsx`
- `apps/mobile/src/features/chat/ChatMaterials.tsx`
- `apps/mobile/src/features/chat/Composer.tsx`
- `apps/mobile/src/features/chat/Conversation.tsx`
- `apps/mobile/src/features/chat/MessageExtras.tsx`
- `apps/mobile/src/features/chat/TradeMessageCard.tsx`
- `apps/mobile/src/features/chat/VideoNoteBubble.tsx`
- `apps/mobile/src/features/chat/VideoNoteRecorder.tsx`
- `apps/mobile/src/features/chat/VoiceBubble.tsx`
- `apps/mobile/src/features/chat/components.tsx`
- `apps/mobile/src/features/chat/hooks.ts`
- `apps/mobile/src/features/chat/locale.ts`
- `apps/mobile/src/features/chat/messages.tsx`
- `apps/mobile/src/features/chat/thread-copy.ts`
- `apps/mobile/src/features/chat/trade-card.css`
- `apps/mobile/src/features/chat/types.ts`
- `apps/mobile/src/features/chat/video-note.css`
- `apps/mobile/src/features/home/HomePage.tsx`
- `apps/mobile/src/features/market/MarketPage.tsx`
- `apps/mobile/src/features/trade/DealPage.tsx`
- `apps/mobile/src/features/trade/FarmPanel.tsx`
- `apps/mobile/src/features/trade/ListingWizard.tsx`
- `apps/mobile/src/features/trade/LotEditor.tsx`
- `apps/mobile/src/features/trade/Offers.tsx`
- `apps/mobile/src/features/trade/SavedSearches.tsx`
- `apps/mobile/src/features/trade/TradeEntry.tsx`
- `apps/mobile/src/features/trade/TradePage.tsx`
- `apps/mobile/src/features/trade/api.ts`
- `apps/mobile/src/features/trade/trade.css`
- `apps/mobile/src/features/trade/ui.tsx`
- `apps/mobile/tests/business-admin.cjs`
- `apps/mobile/tests/business-deeplinks.cjs`
- `apps/mobile/tests/business-notifications.cjs`
- `apps/mobile/tests/business-panel.cjs`
- `apps/mobile/tests/chat-trade-card.cjs`
- `apps/mobile/tests/chat-video-note.cjs`
- `apps/mobile/tests/chat-video-outbox.cjs`
- `apps/mobile/tests/fixtures/business-admin.html`
- `apps/mobile/tests/fixtures/business-admin.tsx`
- `apps/mobile/tests/fixtures/business-deeplinks.html`
- `apps/mobile/tests/fixtures/business-deeplinks.tsx`
- `apps/mobile/tests/fixtures/business-notifications.html`
- `apps/mobile/tests/fixtures/business-notifications.tsx`
- `apps/mobile/tests/fixtures/business-panel.html`
- `apps/mobile/tests/fixtures/business-panel.tsx`
- `apps/mobile/tests/fixtures/chat-trade-card.html`
- `apps/mobile/tests/fixtures/chat-trade-card.tsx`
- `apps/mobile/tests/fixtures/chat-video-note.html`
- `apps/mobile/tests/fixtures/chat-video-note.tsx`
- `apps/mobile/tests/fixtures/chat-video-outbox.html`
- `apps/mobile/tests/fixtures/chat-video-outbox.tsx`
- `apps/mobile/tests/trade.cjs`
- `deploy/Api.Dockerfile`
- `deploy/manage.py`
- `deploy/nginx.conf`
- `docs/BUSINESS-PLATFORM.md`
- `docs/EGIN3-IMPLEMENTATION.md`
- `docs/EGIN3-REPORT.md`
- `docs/VIDEO-NOTES.md`
