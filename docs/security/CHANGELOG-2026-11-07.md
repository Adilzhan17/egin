# Changelog безопасности по файлам

База сравнения: `44dee26`. Полный diff: draft PR #7. Пользовательские несохранённые crop-ресурсы не входят в изменения безопасности.

| Файл(ы) | Изменение и назначение |
|---|---|
| `apps/api/src/security/passwords.mjs`, `apps/api/package.json` | Argon2id, проверка legacy scrypt, безопасное сравнение/миграция, bounded KDF; точная версия node-argon2 |
| `apps/api/src/password-auth.mjs` | Account lockout до async hash, общая проверка пароля для login/reauth, защита гонок reset/recovery, новые assurance-сессии |
| `apps/api/src/security/sessions.mjs` | Отдельные session security metadata и FK/triggers; rotation, absolute/idle expiry, bounded concurrent sessions, legacy assurance |
| `apps/api/src/security/authorization.mjs` | AsyncLocalStorage контекста запроса, повторная проверка текущей сессии и обязательной MFA |
| `apps/api/src/security/revoke.mjs` | Общий отзыв app/portal sessions, API keys, WebAuthn challenges, QR requests владельца |
| `apps/api/src/security/assets.mjs` | Проверка содержимого workspace/developer вложений через media decoders, нормализация и очистка временных файлов |
| `apps/api/src/security/http.mjs` | Explicit proxy networks, проверка production origins/RP ID, security headers и условный HSTS |
| `apps/api/src/security/log.mjs` | Allowlist диагностических событий/кодов без message/stack/cause/DSN |
| `apps/api/src/security/database.mjs` | Production schema verification и проверка минимальных прав; hashes подготовленных миграций |
| `apps/api/scripts/migrate-database.mjs` | Отдельный privileged job: миграции, runtime-role grants, read-only capabilities, проверка итоговых прав; без печати credentials |
| `apps/api/src/server.mjs` | Интеграция перечисленных защит, allowlist sync, reauth endpoints, проверки credential changes и upload revocation, bounded JSON, корректное ожидание закрытия DB pools |
| `apps/api/src/developer.mjs` | Idle/absolute portal sessions, fresh passkey для выпуска/rotation ключа, проверки content и API-key revocation после decode |
| `apps/api/src/qr-auth.mjs` | Проверка актуальности сессии и counter после async WebAuthn; passkey assurance при выдаче сессии |
| `apps/api/src/chat/index.mjs` | Session expiry в SSE, безопасные logs, отдельные миграции в production |
| `apps/api/src/chat/attachments.mjs` | Безопасная проверка коротких audio buffers; действительный MP3 распознаётся и нормализуется |
| `apps/api/src/soilcore/index.mjs` | Проверка сессии на WebSocket upgrade/heartbeat, безопасная диагностика симулятора |
| `apps/api/src/platform/index.mjs` | Обязательная MFA для admin/чувствительных реальных memberships, создание организации/принятие privileged invitation; отдельная runtime migration verification |
| `apps/api/src/platform/billing.mjs` | Admin proof-access проходит requireAdmin/MFA, безопасные cleanup logs |
| `apps/api/src/trade/index.mjs` | Отдельная проверка подготовленной схемы, безопасные журналы; существующие role/party/tenant проверки сохранены |
| `apps/api/src/market/index.mjs` | Production runtime migration verification, safe logs |
| `apps/api/src/market/search.mjs` | Миграция pgvector отделена от запуска индексатора |
| `apps/api/src/market/seed-demo.mjs`, `apps/api/src/news.mjs` | Удалён raw error message из диагностических логов |
| `apps/api/src/search/index.mjs` | Ограничен реальный поток ответа геокодера; наружу выходят только известные пользовательские предупреждения |
| `apps/api/src/catalog.json` | Документация трёх новых reauthentication routes |
| `apps/api/market-inference/limits.py` | ASGI gate до JSON: размер, concurrency, timeout, content type/encoding |
| `apps/api/market-inference/server.py` | Строгая request schema и лимиты строк/списка; docs/debug отключены |
| `apps/api/market-inference/requirements.txt`, `requirements.lock` | Явный huggingface-hub; полная фиксация 37 разрешённых зависимостей |
| `apps/mobile/src/features/settings/ConfirmIdentity.tsx` | UI свежего подтверждения личности через passkey/пароль для допустимых действий |
| `apps/mobile/src/features/settings/ProfilePage.tsx` | Подключён UI подтверждения в настройках безопасности |
| `apps/mobile/src/features/trade/ui.tsx` | Понятная ошибка MFA со ссылкой в настройки |
| `apps/mobile/src/features/market/MarketPage.tsx`, `apps/mobile/tests/market.cjs` | Исправлена выявленная CI гонка: после позднего сохранения избранного текущий список перечитывается, cache учитывает изменение состава. Тест с намеренно задержанным реальным POST и проверкой после reload |
| `apps/api/tests/security-auth.test.mjs` | Production config/headers, recovery revocation, legacy migration, parallel lockout, password-verification race |
| `apps/api/tests/security-sessions.test.mjs` | Ротация/timeout/assurance/MFA/portal freshness, in-flight upload revocation; реальные PG/HTTP проверки privileged routes |
| `apps/api/tests/security-database.test.mjs` | Сохранение данных, повторные миграции, запрет DDL и повышения роли, запуск API с runtime credentials, корректный shutdown |
| `apps/api/tests/security-inventory.test.mjs` | Проверка всего каталога закрытых cookie-routes с настоящей БД; отдельно подтверждён идемпотентный logout |
| `apps/api/tests/security-records.test.mjs` | Негативные payloads sync: owner/role/unknown fields, включая tombstones |
| `apps/api/tests/security-logging.test.mjs` | Диагностика не возвращает DSN, stack, cause и произвольный текст |
| `apps/api/tests/market-inference-security.test.mjs`, `apps/api/market-inference/test_limits.py` | Настоящий ONNX HTTP contract плюс ASGI unit-проверки размеров, overload, content encoding и освобождения слотов |
| `apps/api/tests/chat-attachments.test.mjs` | Реальный FFmpeg MP3 → AAC regression |
| `apps/api/tests/local-search.test.mjs` | Реальный Response stream с ложным Content-Length, overflow cancellation, сокрытие внутренних ошибок |
| `apps/api/tests/api.test.mjs`, `apps/api/tests/developer.test.mjs` | Корректные media fixtures для проверки фактического декодирования |
| `apps/api/tests/platform.test.mjs`, `platform-demo.test.mjs`, `platform-partners.test.mjs`, `platform-security.test.mjs`, `trade.test.mjs` | Domain fixtures явно отделены от проверки MFA: существующие тестовые пользователи получают injected MFA guard; настоящая MFA проверяется отдельным HTTP/PG и browser тестом |
| `apps/mobile/tests/security-auth.cjs` | Реальные WebAuthn registration/reauth, плохой UV, rotation/replay, настройка credentials |
| `apps/mobile/tests/security-headers.cjs` | Заголовки через собранный production Nginx: HTML, JS assets, API, 404, HTTP/forwarded HTTPS |
| `deploy/Api.Dockerfile` | Capability labels, отдельный dependency stage, production node_modules; пакетные менеджеры удалены из runtime |
| `deploy/Dockerfile` | Новый pnpm для сборки web, копирование общего security headers include |
| `deploy/MarketInference.Dockerfile` | Зафиксированные Python packages, ASGI limiter, доступные системные обновления |
| `deploy/Database.Dockerfile` | PostgreSQL 17 на прежней Debian-базе с доступными updates; gosu из фиксированного upstream commit собран на Go 1.27.3 |
| `deploy/market_infrastructure.py` | Отдельные private runtime credentials, ephemeral migration container, production runtime DSN, сети/образ БД; приватный backup существующей базы до замены образа, остановка при ошибке dump или томе без прежнего контейнера |
| `deploy/market.yml` | Аудируемый образ PostgreSQL и отдельная сеть inference; публичных портов БД нет. TCP healthcheck ждёт финальный сервер после initdb |
| `deploy/slot.yml` | Только runtime DB URL, режим schema verify, отдельное подключение к inference network |
| `deploy/compose.yml` | Trusted proxy и явный loopback-only opt-in для HTTP browser CI |
| `deploy/nginx.conf`, `deploy/security-headers.conf` | CSP/HSTS/остальные заголовки, правильное наследование, forwarding и скрытие версии |
| `deploy/manage.py` | HTTPS redirect/headers gateway, guards auth/DB runtime при deploy и rollback, отдельная миграция/сборка БД |
| `deploy/test_auth_compatibility.py`, `deploy/test_postgres_runtime.py` | Negative/fail-closed проверки образов, immutable ID и запрещённого rollback |
| `deploy/test_market_backup.py` | 7 проверок порядка backup/update/migrate, остановки при ошибках и сохранности файлов |
| `deploy/test_demo_compatibility.py`, `deploy/test_presence_compatibility.py` | Изоляция уже существующих guard-fixtures от новых независимых guards |
| `.github/workflows/checks.yml` | Loopback production image config, browser MFA и security headers checks |
| `.github/workflows/business.yml` | Реальные PostgreSQL security sessions/inventory/role tests |
| `.github/workflows/market.yml` | Unit/real inference limits, аудит фактически установленных Linux Python packages |
| `.github/workflows/security.yml` | Source/Git history и четыре образа; 49 deploy unit-тестов в Linux, проверка scanner SHA256, High/Critical gate без blanket ignore, PostgreSQL restart test |
| `.gitleaksignore` | Только шесть конкретных исторических fingerprints с классификацией, не исключение путей/правил |
| `.gitignore`, `.dockerignore` | Runtime DB/data, private keys, certificate containers/password files исключены из Git/build context |
| `package.json` | pnpm 10.34.9 |
| `pnpm-workspace.yaml`, `pnpm-lock.yaml` | Advisory fixes через точные overrides и allowlist Argon2 install script; воспроизводимое dependency tree |
| `docs/security/INITIAL-AUDIT-2026-11-07.md` | Исходная таблица 27 пунктов до исправлений |
| `docs/security/WORKLOG.md` | Этапы, тесты, известные ограничения и промежуточные сбои |
| `docs/security/SERVER-REVIEW.md` | Переданная владельцу сервера проверка production с конкретными условиями закрытия |
| `docs/security/SECURITY-REPORT-2026-11-07.md`, `CHANGELOG-2026-11-07.md`, `TELEGRAM-REPORT.md` | Итоговая оценка кода, файловый changelog и текст для пересылки |
| `docs/security/dependency-audit-before.json`, `dependency-audit-after.json`, `python-audit-before.json` | Dependency evidence; Python «before» — первый полный pinned inventory, без advisory |
| `docs/security/history-secret-scan.json`, `current-secret-scan.json`, `public-edge-before.json` | Классификация secret findings, охват скана, фактический внешний 403 |
| `docs/security/container-api-before.json`, `container-api-after.json`, `container-web-after.json`, `container-inference-before.json`, `container-inference-after.json`, `container-postgres-before.json`, `container-postgres-after.json` | Сырые краткие package/CVE находки до/после; полные inventories в CI artifacts |
