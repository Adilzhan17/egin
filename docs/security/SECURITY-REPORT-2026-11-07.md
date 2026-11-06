# EGIN — практический аудит безопасности, 7 ноября 2026

База: `44dee26`. Контрольная версия кода: `1afcb8607a1647b66ce1f37f9898d7112ad9d046`. Исправления: ветка `codex/security-hardening-20261107`, [draft PR #7](https://github.com/Adilzhan17/egin/pull/7).

Код авторизации, сессий, загрузки файлов, конфигурации HTTP и доступа к PostgreSQL усилен. Изменения подготовлены для ревью. **Production не проверен и не изменён; разрешения на выкладку этот отчёт не даёт.** По решению пользователя проверка действующего сервера передана другому контрибьютору. Пункт 27 остаётся открытым для системных пакетов двух образов: security gate намеренно красный.

## Что было найдено и исправлено

| Риск | Важность | Изменение |
|---|---|---|
| Восстановление аккаунта оставляло developer-сессии и API-ключи действующими | High | Общий отзыв сессий, ключей, challenges и QR-flow одного владельца; проверка гонок восстановления с асинхронной проверкой пароля |
| Не было обязательной MFA для чувствительных бизнес-ролей | High | Серверная проверка passkey с WebAuthn user verification для admin/owner/admin/trader; пароль и recovery-сессия не дают этих полномочий |
| Чувствительные действия не требовали свежего подтверждения | High | Подтверждение не старше 10 минут для passkeys/recovery и developer-ключей; flow привязан к текущей сессии и одноразовый |
| Не было общего idle timeout/ротации сессий и проверки времени жизни в постоянных соединениях | High | Общий менеджер HTTP/portal/SSE/WebSocket; ротация cookie, абсолютный и idle сроки, ограничение числа сессий |
| Парольные проверки могли параллельно обходить счётчик попыток | Medium | Попытка резервируется до KDF; общий предел параллельных KDF; scrypt переводится на Argon2id при успешном входе |
| Доверие произвольному X-Real-IP могло обойти IP-лимит при доступном API | High | IP берётся из Express с явной границей доверенных proxy; запрет trust-all и неоднозначного числа hops |
| Workspace/developer uploads доверяли MIME клиента | High | Декодирование/нормализация изображений и аудио, ограничение размеров, проверка доступа после обработки |
| Sync сохранял неизвестные поля | Medium | Allowlist записи и вложенных данных, включая tombstone; роль/владелец не принимаются из payload |
| API использовал bootstrap-superuser PostgreSQL | High | Отдельный мигратор и роль `egin_runtime` с CRUD; production API не выполняет DDL и проверяет отсутствие повышенных привилегий |
| Недоставало security headers; Nginx locations теряли наследованные заголовки | Medium | CSP, HSTS по HTTPS, DENY/nosniff/referrer/permissions во всех нужных locations, redirect на gateway |
| Диагностические сообщения могли содержать внутренние значения | Medium | Allowlist событий/кодов вместо raw errors; геокодер не возвращает текст исключений и ограничивает поток ответа 512 KiB |
| Python inference не ограничивал тело до JSON-разбора | Medium | 512 KiB, 2 операции одновременно, 10 секунд на тело, строгая схема, запрет сжатого тела, отключение debug/OpenAPI |
| Известные уязвимости библиотек и инструментов внутри образов | High/Critical по advisory | Исправлены JS advisory, зафиксированы Python-зависимости, обновлён pnpm; build tools удалены из runtime API, gosu пересобран, доступные обновления ОС установлены |

Важность — оценка риска/классификация advisory. Это не утверждение, что проект был взломан или что каждое обнаружение сканера достижимо через HTTP.

## Результат по всем 27 пунктам

`FIXED` — изменение кода проверено в указанной области; `NOT FOUND` — проблема не найдена в проверенном объёме; `PARTIALLY FIXED` — остаётся конкретная проверка/работа. Для исходных статусов до изменений см. [INITIAL-AUDIT-2026-11-07.md](INITIAL-AUDIT-2026-11-07.md).

| ID | Проверка | Статус | Доказательство / что остаётся |
|---|---|---|---|
| 01 | Секреты в коде | NOT FOUND | Gitleaks текущих текстов, `.env*`, история; отдельно gazetteer 3.28 MB. Найдены только публичные fingerprints/checksums и примеры |
| 02 | env, CI/CD, Docker, Nginx | PARTIALLY FIXED | Production origins/RP, proxy, file exclusions, приватные credential-файлы, отдельная роль БД. Реальные значения и права production/CI secret store проверяет владелец |
| 03 | История Git | NOT FOUND | Просканированы доступные refs; 223 коммита на контрольном этапе. CI продолжает проверять новые коммиты. Удалённые недоступные refs не проверены |
| 04 | Ротация утёкших секретов | NOT FOUND | Подтверждённых утёкших credentials нет; фиктивная ротация не заявляется. При находке в production обязательны отзыв/замена и проверка использования |
| 05 | Публичный доступ к БД | PARTIALLY FIXED | Production compose не публикует порт PostgreSQL. Фактические firewall/порты проверяет владелец сервера |
| 06 | Сеть и права БД | PARTIALLY FIXED | API имеет отдельную ограниченную роль; inference в другой сети. Реальный PG-тест запрещает DDL, TRUNCATE, изменение миграций, SET ROLE владельца. Требуется проверка обновления существующей production-базы |
| 07 | HTTPS/redirect | PARTIALLY FIXED | Production требует HTTPS origins; gateway делает redirect на настроенный host. TLS завершается на внешнем edge, его сертификат/redirect не подтверждены |
| 08 | HSTS | PARTIALLY FIXED | Настроен при HTTPS через доверенный proxy; реальная цепочка edge остаётся в server review |
| 09 | Security headers | PARTIALLY FIXED | Добавлены в API/Nginx/gateway, исправлено наследование. Есть тест через собранный Nginx; внешний edge проверяется отдельно |
| 10 | SQL Injection | NOT FOUND | Данные идут через SQLite bindings/PG parameters. Динамические таблицы/колонки/sort/lock clauses берутся из фиксированных карт и валидаторов; DDL identifiers мигратора проверяются и quoting выполняется отдельно |
| 11 | Mass assignment | FIXED | Allowlist sync; валидаторы Market, Chat, Platform, Trade, integrations и SoilCore не присваивают owner/role из произвольных полей |
| 12 | IDOR/BOLA read/update/delete | NOT FOUND | Каталог, owner-scoped SQLite queries, membership/tenant guards; реальные двухпользовательские тесты Market/Chat/Trade/Platform, private media и revocation. Анонимная инвентаризация сама по себе не доказывает BOLA: она дополнена этими проверками |
| 13 | Ownership/tenant/role/scope | FIXED | Сохранены отдельные role/tenant/scope guards, добавлена обязательная MFA, исправлен admin-доступ к payment proof. Файлы и уведомления проверяют текущую доступность объекта |
| 14 | Login/recovery/logout | FIXED | Одноразовые WebAuthn/QR/recovery flows, общий отзыв, безопасная проверка пароля и гонок |
| 15 | Хеширование паролей | FIXED | Argon2id: 19 MiB, t=2, p=1; legacy scrypt мигрирует при входе/reset. Обратного преобразования новых хешей нет, старый API блокируется rollback guard |
| 16 | Rate limits | FIXED | Auth/public/API, account quota, module/user quotas; устранено доверие клиентскому X-Real-IP, ограничены decode/KDF/inference операции. IP-лимиты процесса не являются глобальным распределённым лимитером всех реплик |
| 17 | Lockout/backoff | FIXED | 8 парольных попыток за окно 15 минут с атомарной резервацией до async KDF; ограничение нагрузки и Retry-After |
| 18 | MFA | FIXED | Passkey + обязательный UV; сервер повторно читает assurance. Проверены неправильный UV, повтор flow, password-only и чужая/истёкшая сессия. Нужна регистрация passkeys сотрудников перед production |
| 19 | Cookie/сессии | FIXED | HttpOnly, host-only, Secure на HTTPS, SameSite Lax (app)/Strict (portal); app: 30 дней/24 часа idle, portal: 12 часов/30 минут idle; максимум 10; MFA требует нового подтверждения через 12 часов |
| 20 | CSRF | NOT FOUND | Cookie-mutations требуют X-EGIN и проверяют Origin; SameSite дополняет защиту. `/v1` использует bearer/API-key, не cookie; WS проверяет origin и сессию |
| 21 | XSS | NOT FOUND | React text rendering; не найдены innerHTML/dangerouslySetInnerHTML/eval sinks. Chat links только HTTP(S), без credentials; новости ограничены источником; CSP и безопасная выдача файлов |
| 22 | CORS | NOT FOUND | Точное совпадение origins, ограниченные methods/headers, нет wildcard с credentials. Отдельно разрешены фиксированные localhost/Capacitor origins нативного приложения; это сознательная часть существующей мобильной архитектуры |
| 23 | Server validation / deserialization | FIXED | Allowlist и проверки типов/длин/диапазонов на сервере; bounded JSON; запрет XML DTD/entities и опасных OOXML-элементов; pickle/исполняемая десериализация внешнего payload не найдены |
| 24 | File upload | FIXED | Реальные decoders, magic/content validation, пределы размеров/длительности/распаковки; генерируемые имена, приватное хранение, ownership, nosniff/CSP/download. Проверены OOXML, PDF, изображения, видео и аудио |
| 25 | Цена/оплата/роли | NOT FOUND | Серверные billing plans и неизменяемый invoice snapshot, подтверждение администратором; decimal/BigInt в Trade, двустороннее подтверждение оплат, транзакции/locks/idempotency. Автоматического платёжного webhook нет |
| 26 | Debug/ошибки/документация | FIXED | NODE_ENV=production в образе, нет stack trace в ответах, safe logs, Python docs/debug отключены. Публичный `/openapi.json` — статическое описание developer API, не интерактивная Swagger-консоль и не данные пользователей; права каждого вызова сохраняются |
| 27 | CVE/версии | PARTIALLY FIXED | JS audit и Python inventory — без advisory; API/web — без High/Critical по Trivy. В Debian-образах inference/PostgreSQL остаются находки без готового исправления для этих веток дистрибутива. Подробности ниже |

## Проверенные границы доступа и бизнес-логика

| Область | Проверка и тесты |
|---|---|
| Workspace/интеграции | Запросы и версии привязаны к user_id; вложения нельзя прикрепить из другого аккаунта. `api`, `developer`, `integrations`, `one-c`, `land` тесты |
| Developer API | Секрет выдаётся один раз; хранится hash, scopes, expires/revoked; issuer — отдельная portal-сессия. `developer` и `security-sessions` тесты |
| Chat | Текущее членство, роль в группе, ban/block, доступ к attachment/message/wallpaper, revocation, SSE session expiry. `chat`, `chat-messenger`, `chat-receipts`, `chat-presence`, `chat-video-notes` тесты |
| Market | Owner/draft/published разделение, allowlist patch, безопасные SQL fragments поиска и атомарные версии. `market` и браузерные market fixtures |
| Platform/Trade | Membership и права проверяются отдельно от MFA; private/demo worlds разделены. Ограничения стороны сделки, серверный расчёт, доказательства оплаты, согласие и TTL приглашений, одноразовое принятие в транзакции. `platform*`, `trade` и браузерный lifecycle |
| SoilCore | Session/device ownership, отдельный device bearer-token, валидация и дедупликация показаний, session/origin в WS; симуляция отдельно от hardware. `soilcore*`, `engineering`, `hardware-diagnostics` |
| Внешние подключения | 1С: HTTPS/public DNS, pin адреса, запрет redirects, bounds, XML без DTD/entities. Геокодер и новости не принимают произвольный destination URL от пользователя. Push — allowlist сервисов |

Пароль пользователя EGIN хранится как hash. Пароль внешней 1С нужен для подключения к самой 1С: он хранится отдельно в AES-GCM с привязкой к владельцу и ключом в private data volume, не возвращается API. Это разные классы секретов; ключ и резервные копии необходимо защитить на сервере.

## Проверки и воспроизводимые доказательства

- Локальный полный API-прогон после разделения БД: **127 тестов, 107 passed, 20 skipped, 0 failed**. Пропуски требуют настоящих PostgreSQL/ONNX/media-инструментов и не засчитаны как успех. Последующее ограничение геокодера отдельно проверено: **6/6 passed**.
- **49 deploy unit-тестов** прошли локально; Windows запуск использовал заглушку fcntl. Это не проверка реальных Docker/Linux операций. Все тесты добавлены в Linux CI. Новые backup-тесты проверяют остановку до замены образа при неудачном dump и сохранность существующей копии.
- CI с реальной PostgreSQL проверил миграцию существующих данных, повторный запуск, ограниченную роль, все модули, MFA/ACL и финансовые инварианты. Каталог: **220** cookie-маршрутов отклоняют анонимные запросы; два logout очищают cookie и возвращают только `{ok:true}`.
- Браузерный тест реально проходит WebAuthn/passkey-операции, проверяет отказ UV, rotation/replay и действия настроек. Доменные unit-fixtures с подставленным пользователем отдельно отмечены; они не используются как доказательство MFA.
- `b1d5bd9`: все четыре функциональных workflow прошли — [Market](https://github.com/Adilzhan17/egin/actions/runs/42309328788), [Business](https://github.com/Adilzhan17/egin/actions/runs/42309328659), [Mobile](https://github.com/Adilzhan17/egin/actions/runs/42309328572), [Chat](https://github.com/Adilzhan17/egin/actions/runs/42309328591). Это включает исправление гонки избранного с намеренно задержанным реальным POST и проверкой после reload.
- Следующий `1afcb86` меняет только healthcheck PostgreSQL и соответствующий шаг CI: они ждут TCP финального сервера, не временный socket во время initdb. [Market](https://github.com/Adilzhan17/egin/actions/runs/42309922775) прошёл. Статусы повторных функциональных workflow на этом SHA и последующих коммитах документации доступны в PR; их нельзя автоматически считать успешными по предыдущему SHA.
- [Security audit `1afcb86`](https://github.com/Adilzhan17/egin/actions/runs/42309922848): source (в том числе 49 deploy-тестов в Linux), API и web прошли; база успешно прошла initialization/pgvector/restart. CVE-проверки PostgreSQL/inference остались красными. JSON после исправлений привязаны к этому SHA, ID образа и SHA256 скачанного artifact.
- Gitleaks 8.30.1, pip-audit 2.10.1, Trivy 0.76.1. Скрипты получения Gitleaks/Trivy проверяют опубликованные SHA256. Evidence хранится в `docs/security/*audit*.json`, `*secret-scan.json`, `container-*.json` и CI artifacts.
- В промежуточных прогонах исправлены два дефекта тестов: ожидание 401 для идемпотентного logout и удаление временной БД до завершения async pool close. Отдельный timeout WebKit при reload видеозаметки не воспроизвёлся в успешном Business `f0fbbf7`; это не заявление об исправлении всех возможных browser flakes.

## Остаточные CVE образов и границы вывода

Числа ниже — срабатывания package/CVE, включая повторения одного CVE у разных бинарных пакетов, **не число подтверждённых удалённых атак**. High/Critical отсутствуют в API и web в проверенном образе; это не гарантирует отсутствие будущих advisory.

| Образ | До | После доступных обновлений | Состояние |
|---|---:|---:|---|
| API | 31 | 0 | Уязвимые build tools отсутствуют в runtime |
| Web | 0 | 0 | Проверка пройдена |
| Inference | 49 High | 49 High | Нет FixedVersion для текущих Debian-пакетов |
| PostgreSQL | 81 | 50 High + 3 Critical | Исправлены доступные apt/CVE и Go-runtime gosu; оставшиеся находки требуют отдельного разбора |

Разбор трёх Critical PostgreSQL:

1. **CVE-2023-45853, zlib1g**: Debian прямо указывает, что у этой версии уязвимая часть contrib/minizip не собирается в бинарный пакет. Это срабатывание по исходному пакету, а не доказанная уязвимость установленного zlib1g. Оно сохранено в сыром отчёте; blanket ignore не добавлялся. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2023-45853).
2. **CVE-2025-7458, libsqlite3-0**: уязвимость требует возможности выполнить специально составленный SQL в SQLite; Debian bookworm пока не выпускает исправление, trixie уже исправлен. PostgreSQL-контейнер не является SQLite API. До закрытия нужно подтвердить используемые зависимости/достижимость либо подготовить проверенное обновление/минимизацию образа. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2025-7458).
3. **CVE-2026-6653, libxml2**: исправление upstream существует, backport в используемую Debian-ветку отложен. В EGIN параметры SQL связаны, произвольные XML-выражения PostgreSQL через API не принимаются; это снижает достижимость, но не является полной оценкой всех возможностей сервера. Нужен проверенный backport/совместимый образ либо документированный разбор применимости. [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-6653).

Нельзя закрыть эти пункты одной командой `apt upgrade` или скрыть их через `--ignore-unfixed`. Переход работающей PostgreSQL на другую libc/major/base требует отдельной проверки locale/collation, backup/restore и совместимости данных. В этой ветке такой рискованный переход не производится. Полный перечень оставшихся High приведён в `container-inference-after.json` и `container-postgres-after.json`; upstream-статус не равен автоматическому принятию риска.

## Что передано владельцу сервера

[SERVER-REVIEW.md](SERVER-REVIEW.md) содержит конкретные пункты и формат доказательств: сертификаты/redirect, реальные proxy/headers, закрытые порты БД, новые runtime credentials, права файлов, реальные секреты и журналы, backup/restore, MFA enrollment, staging UI/CSP и совместимый rollback. Старые API-контейнеры с bootstrap-доступом к БД нужно остановить после перехода.

Публичные адреса вернули внешний 403; SSH отсутствует. Поэтому вывод о HTTPS, firewall и секретах действующего production не сделан. Значения секретов, cookies и дампы в PR публиковать не нужно. Merge/deploy остаются заблокированы до завершения обязательных проверок и решения по остаточным CVE.

Changelog по файлам: [CHANGELOG-2026-11-07.md](CHANGELOG-2026-11-07.md). Короткий текст для пересылки: [TELEGRAM-REPORT.md](TELEGRAM-REPORT.md). Сообщения в Telegram не отправлялись.
