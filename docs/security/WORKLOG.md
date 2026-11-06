# EGIN: ход исправлений безопасности

База: `44dee26`. Ветка: `codex/security-hardening-20261107`. Аудит продолжается; этот документ не является итоговым заключением.

## Подготовленные изменения

- Пароли: Argon2id (19 MiB, t=2, p=1), миграция существующего scrypt после успешного входа, ограничение параллельных KDF. Проверка устаревшего результата входа после восстановления доступа.
- Защита входа: резервирование попыток до асинхронной проверки пароля; общий лимит больше не опирается на произвольный X-Real-IP клиента.
- Восстановление: отзыв сессий приложения и developer portal, API-ключей, WebAuthn challenges и QR-входов одного пользователя.
- Sync: allowlist полей записи и данных, отклонение неизвестных полей и попыток записать роль через payload.
- Вложения workspace/developer API: проверка содержимого через декодеры, нормализация формата, ограничение размера; MIME клиента не считается доказательством типа файла.
- HTTP: валидация production origins/RP ID, настройка доверенных proxy, security headers, CSP и HSTS через HTTPS proxy, HTTP redirect на gateway. Исправлено наследование заголовков в Nginx locations с Cache-Control.
- Зависимости: устранены 13 найденных pnpm audit advisory; после изменения lockfile известных advisory в этой проверке нет.

## Выполненные проверки

- `pnpm --filter @egin/api test`: 118 тестов, 102 passed, 16 skipped, 0 failed. Пропуски требуют PostgreSQL, inference, нативных media-инструментов или специального окружения; их нельзя считать пройденными.
- `pnpm build`: TypeScript/Vite приложения и developer portal успешно собраны.
- `pnpm audit --json`: 0 известных advisory в проверенном JavaScript dependency tree; JSON до/после хранится рядом.
- Gitleaks 8.30.1: сканирование доступной Git-истории всех refs и текущих текстовых файлов. Срабатывания изучены; найденные значения — публичные fingerprints/checksums и примеры. Подтверждённых утёкших credentials в проверенном объёме нет. Реальные секреты production и CI недоступны этому аудиту; ротация не выполнялась.
- `python -m py_compile deploy/manage.py`: успешно. Linux-тесты deploy в Windows не запускаются из-за системного модуля fcntl; это не проверка Nginx или production.

## Открытая работа до готовности

- Обязательная MFA для администраторов/чувствительных ролей, свежая проверка личности для изменения способов входа, idle timeout сессий.
- Защита развёртывания/отката от несовместимых с Argon2id образов; проверка миграции на staging.
- Полная инвентаризация object-level доступа, SQL, ролей, цены, CSRF/CORS и утечек в ответах/логах; негативные тесты по результатам.
- Проверка отзыва доступа во время асинхронной обработки вложений.
- Минимальные права PostgreSQL, аудит Python/системных зависимостей, проверки media/PG/inference и CI.
- Проверка Nginx/CSP в Linux и браузере.
- Проверка реальной инфраструктуры другим контрибьютором: [SERVER-REVIEW.md](SERVER-REVIEW.md).
- Итоговые статусы всех 27 пунктов, changelog и короткий отчёт для Telegram после завершения аудита.

## Источники решений

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [node-argon2](https://github.com/ranisalt/node-argon2)
- [Gitleaks 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1)
