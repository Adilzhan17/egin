# Проверка SoilCore

> Исторический отчёт первой версии. Актуальные результаты переработки EGIN One, гостевой демонстрации и новых браузерных проверок: [EGIN_ONE_REBUILD.md](EGIN_ONE_REBUILD.md).

Проверено локально 5 ноября 2026 года. Результаты относятся к виртуальному прототипу; физического прибора в испытании не было.

| Проверка | Результат |
| --- | --- |
| Сборка мобильного приложения и TypeScript | PASS |
| Существующие тесты мобильного приложения | PASS, 73 теста |
| Серверная модель и API: сценарии, авторизация, изоляция, проверка входных данных и WebSocket | PASS, 4 теста |
| Native C++ через CMake/CTest, включая восстановление файловой очереди | PASS, 2 теста |
| Реальный процесс C++ → сервер → SQLite и WebSocket, отключение/восстановление | PASS, 1 тест |
| Chrome: вход во вкладку, выбор детали на 3D-модели, вращение, дождь, восстановление связи, пустой LIVE и мобильная ширина | PASS |
| Настройки Dockerfile и gateway | PASS, 2 теста конфигурации |
| Docker build и развёртывание | НЕ ПРОВЕРЕНО: Docker отсутствует |
| ESP-IDF, UART/RS485, питание, Wi-Fi, LoRaWAN и физический SEN0604 | НЕ ПРОВЕРЕНО: адаптеры и оборудование отсутствуют |
| 30 FPS на типичном ноутбуке | НЕ ИЗМЕРЯЛОСЬ |

Официальный тестовый ответ Modbus `01 03 08 02 92 FF 9B 03 E8 00 38 57 B6` декодирован как влажность 65,8%, температура −10,1 °C, EC 1000 µS/cm и pH 5,6. Проверяются CRC, длина, адрес, функция, исключение Modbus, тайм-аут и отрицательная температура. Native CLI хранит очередь в RAM по умолчанию; файловый режим запускается отдельно и не подключён к серверной симуляции. Он не гарантирует доставку при сбое между передачей и подтверждением БД.

Браузерный тест запускается после сборки UI и CLI командой `node tests/soilcore.cjs` из `apps/mobile`; он использует локальную временную базу, тестовую сессию, Chrome и реальный native CLI. Снимок страницы, полученный во время проверки: [soilcore-preview.png](soilcore-preview.png). Ограничения физической части и команды запуска перечислены в [описании архитектуры](SOILCORE_ARCHITECTURE.md) и [прошивки](../firmware/soilcore/README.md).

## Файлы изменения

- Интерфейс: `apps/mobile/src/app/App.tsx`, `apps/mobile/src/features/home/HomePage.tsx`, `apps/mobile/src/features/home/nature-home.css`, `apps/mobile/src/features/soilcore/SoilCorePage.tsx`, `SoilCoreScene.tsx`, `soilcore.css`.
- Сервер: `apps/api/src/server.mjs`, `apps/api/src/soilcore/index.mjs`, `simulation.mjs`, `CONTRACT.md`, `apps/api/package.json`, `pnpm-lock.yaml`.
- Прошивка: `firmware/soilcore/CMakeLists.txt`, `README.md`, `core/soilcore.hpp`, `core/soilcore.cpp`, `platform/native/main.cpp`, `tests/tests.cpp`, `tests/cli_recovery.py`.
- Запуск и проверки: `apps/api/tests/preview.mjs`, `soilcore-api.test.mjs`, `soilcore-e2e.test.mjs`, `soilcore-simulation.test.mjs`, `apps/mobile/tests/soilcore.cjs`, `deploy/Api.Dockerfile`, `deploy/nginx.conf`, `deploy/manage.py`, `deploy/test_soilcore_deploy.py`, `.dockerignore`.
- Документация и артефакт: `docs/SOILCORE_ARCHITECTURE.md`, `docs/SOILCORE_TEST_REPORT.md`, `docs/soilcore-preview.png`.
