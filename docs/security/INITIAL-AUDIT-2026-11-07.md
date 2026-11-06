# EGIN: первоначальная таблица аудита безопасности

Дата: 2026-11-07. Исходный commit: `44dee26`. Аудит и исправления продолжаются.
Это исходная оценка до изменений, а не сертификат безопасности production.
`FOUND` — обнаружен конкретный пробел; `NOT FOUND` — проблема не найдена в указанной проверенной области;
`PARTIALLY FIXED` — часть защит существует, но проверка/исправление пункта не завершены.
Severity обозначает риск при наличии пробела, а не доказанный факт эксплуатации.

| Check ID | Vulnerability / Risk | Status | Affected files/modules | Severity |
|---|---|---|---|---|
| 01 | Секреты в исходниках: требуется сканирование текущего дерева | PARTIALLY FIXED | repository, deploy, firmware | High |
| 02 | Конфигурация env/CI/Docker: production-проверки env не централизованы | PARTIALLY FIXED | server.mjs, deploy, .github | High |
| 03 | История Git ещё не просканирована полностью | PARTIALLY FIXED | all local/remote refs | High |
| 04 | Ротация найденных секретов зависит от результатов сканирования и доступа к провайдерам | PARTIALLY FIXED | credentials inventory | Critical |
| 05 | Порт PostgreSQL не публикуется в production compose; живой сервер не проверен | PARTIALLY FIXED | deploy/market.yml | High |
| 06 | Приватная сеть БД есть; API использует bootstrap-пользователя PostgreSQL | FOUND | deploy/market.yml, market_infrastructure.py | High |
| 07 | TLS завершается вне контейнеров; конфигурация edge и redirect не подтверждены | PARTIALLY FIXED | deploy/manage.py, external edge | High |
| 08 | HSTS отсутствует в конфигурации репозитория | FOUND | deploy/nginx.conf, manage.py | Medium |
| 09 | Нет CSP/Permissions-Policy; location add_header отменяет наследование заголовков Nginx | FOUND | deploy/nginx.conf | Medium |
| 10 | Основные запросы параметризованы; необходим полный обзор динамических SQL | PARTIALLY FIXED | apps/api/src | High |
| 11 | /api/sync сохраняет дополнительные поля record.data без allowlist | FOUND | server.mjs validateRecord | Medium |
| 12 | Проверки владельцев есть; нужна инвентаризация всех маршрутов и негативные тесты | PARTIALLY FIXED | server, developer, chat, platform, trade, market, soilcore | High |
| 13 | Роли/tenant проверяются сервисами; полный обзор ещё не завершён | PARTIALLY FIXED | platform.requireMember, chat.member, trade contexts | High |
| 14 | Восстановление не отзывает developer_sessions и api_keys; нужен свежий вход для чувствительных действий | FOUND | password-auth.mjs, server.mjs, developer.mjs | High |
| 15 | Сейчас scrypt (не plaintext); заданный Argon2id/bcrypt ещё не используется | FOUND | password-auth.mjs | Medium |
| 16 | API безусловно доверяет X-Real-IP; обход зависит от границы proxy | FOUND | server.mjs, deploy/nginx.conf | High |
| 17 | Account lockout существует, но параллельные проверки пароля не резервируют попытку до KDF | FOUND | password-auth.mjs | Medium |
| 18 | Нет обязательной MFA/step-up для admin/чувствительных ролей | FOUND | platform, trade, authentication | High |
| 19 | Cookie HttpOnly/SameSite есть; нет idle timeout и общего механизма отзыва | FOUND | server.mjs, developer.mjs | High |
| 20 | State-changing запросы требуют X-EGIN и проверяют Origin; нужно проверить все альтернативные входы | PARTIALLY FIXED | server.mjs, developer.mjs, websocket | High |
| 21 | В frontend не найдены dangerouslySetInnerHTML/innerHTML/eval; обзор URL/renderers ещё нужен | PARTIALLY FIXED | mobile/src, developers/src | High |
| 22 | CORS allowlist есть; native localhost origins разрешены также в production без явной настройки | PARTIALLY FIXED | server.mjs | Medium |
| 23 | Есть валидаторы модулей; sync допускает неизвестные поля, нужна проверка остальных payloads | FOUND | server.mjs, module validations | Medium |
| 24 | /api/assets и /v1/assets принимают MIME клиента без декодирования, в отличие от chat uploads | FOUND | server.mjs, developer.mjs, chat/attachments.mjs | High |
| 25 | Billing берёт цены тарифа с сервера, подтверждение оплаты требует admin; нужен полный обзор сделок | PARTIALLY FIXED | platform/billing.mjs, trade | High |
| 26 | Ошибки API скрывают stack traces; публичный OpenAPI и журналы требуют дополнительной проверки | PARTIALLY FIXED | server.mjs, developer.mjs, console.error calls | Medium |
| 27 | pnpm audit выявил High в body-parser и undici, а также Moderate (точные данные в evidence) | FOUND | pnpm-lock.yaml, package manifests | High |

Все 27 пунктов остаются в объёме работ. Отдельно проверяются SSRF, webhooks, безопасная десериализация, утечки в логах и ответы API.
Итоговые статусы, changelog, выполненные команды и короткий текст для Telegram будут вынесены в финальный отчёт после проверки исправлений.
