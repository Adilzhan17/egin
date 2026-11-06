# SoilCore native firmware core

Portable C++17 prototype for the DFRobot SEN0604. The same decoder and controller can be compiled by a future ESP-IDF platform, but **no ESP32 drivers or hardware build are supplied or verified**. Native CLI uses a mock transport, not a network uplink. It uses RAM by default and supports optional file storage for process restart recovery. The controller accepts injected storage and transport implementations; a production storage implementation must atomically persist both the pending queue and next sequence. A real receiver must deduplicate by device ID and sequence.

## Build and test

```sh
cmake -S firmware/soilcore -B firmware/soilcore/build
cmake --build firmware/soilcore/build --config Debug
ctest --test-dir firmware/soilcore/build -C Debug --output-on-failure
```

Run `firmware/soilcore/build/soilcore_cli` (or `build/Debug/soilcore_cli.exe` with a Windows multi-configuration generator). The process accepts one command per line and flushes one JSON response per command:

```text
READ 01 03 08 02 92 FF 9B 03 E8 00 38 57 B6
TIMEOUT
OFFLINE
ONLINE
```

`READ` parses an actual Modbus response, validates sensor ranges, queues the sample and, when online, sends it to a mock sink. `TIMEOUT` reports a failed read. `OFFLINE` causes samples to accumulate in the bounded queue; `ONLINE` returns the replayed samples in `delivered`. To preserve the queue and sequence across process restarts, run `soilcore_cli --storage PATH` with an existing parent directory and a separate private path per device/user. A lock file prevents two cooperating processes from opening the same path. Storage errors terminate the process. The Windows implementation currently uses the system ANSI path encoding. The storage writes a temporary snapshot and replaces the previous file, but it is not a tested power-loss-safe flash journal and does not guarantee persistence after sudden power failure. Queue removal happens before the caller confirms receipt, so this demo interface does not guarantee delivery on process failure. Without `--storage`, sequence numbers and queue exist only in RAM. This CLI is designed for a simulator subprocess, not for real telemetry delivery. Measurement quality flags indicate that moisture is uncalibrated and probe pH requires laboratory validation.

The controller has injected storage and transport interfaces, detects invalid frames, timeout, low battery, no link, and full storage. Its state transitions describe a single synchronous measurement; actual power switching, warm-up delays, watchdog, retry timing and scheduling must be implemented by the platform. It has no physical UART, Wi-Fi, LoRaWAN, flash, RTC, OTA, or ESP-IDF integration. Never pass simulated values as hardware readings.

## Protocol and electrical constraints

The [DFRobot protocol](https://wiki.dfrobot.com/sen0604/docs/20297) specifies RS485, 9600 baud default, 8N1, address 1, function 03, and four registers starting at 0000. Registers are big-endian: moisture /10, signed temperature /10, EC in µS/cm, pH /10. CRC16 is low byte first. The documented request and response are checked by the tests. Refer to [sensor specification](https://wiki.dfrobot.com/sen0604/) for limits; the probe requires 5–30 V and cannot be directly powered from the MCU 3.3 V rail. Use an appropriately switched probe supply and a 3.3 V compatible RS485 transceiver; confirm grounding, protection, pin allocation and timing on the actual hardware. Do not guess GPIO assignments or share the LoRa SPI pins with UART without reviewing the board schematic.

The intended single-cell LiFePO4 battery requires the correct BQ25185 configuration and battery-specific cold-charge protection. Do not connect it to an unverified Li-ion charger. Board-level power, deep-sleep current and sensor warm-up time remain to be measured. LoRa PHY is not LoRaWAN or internet connectivity; regional settings, gateway, provisioning and field tests are still needed. None of these components have been physically tested here.
