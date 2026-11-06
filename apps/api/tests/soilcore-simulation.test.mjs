import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/soilcore/simulation.mjs';

function registers(frame) {
  const bytes = frame.split(' ').map(value => parseInt(value, 16));
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xa001 : 0);
  }
  assert.equal(crc, 0, 'frame contains a valid Modbus CRC');
  assert.deepEqual(bytes.slice(0, 3), [1, 3, 8]);
  return [3, 5, 7, 9].map(i => (bytes[i] << 8) | bytes[i + 1]);
}

test('rain infiltrates over time and increases moisture relative to drought', () => {
  const wet = createSimulation();
  const dry = createSimulation();
  wet.command({ action: 'scenario', value: 'rain' });
  dry.command({ action: 'scenario', value: 'drought' });
  const initial = registers(wet.modbusFrame())[0];
  wet.tick(10); // one simulated hour at 360×
  dry.tick(10);
  assert.ok(registers(wet.modbusFrame())[0] > initial);
  assert.ok(registers(wet.modbusFrame())[0] > registers(dry.modbusFrame())[0]);
  assert.equal(wet.snapshot().simulation.rain_mm_h, 12);
});

test('simulation is reproducible and pause, speed and reset are respected', () => {
  const a = createSimulation();
  const b = createSimulation();
  for (const sim of [a, b]) {
    sim.command({ action: 'speed', value: 60 });
    sim.command({ action: 'scenario', value: 'salinity' });
    sim.tick(30);
  }
  assert.equal(a.modbusFrame(), b.modbusFrame());
  const before = a.snapshot();
  a.command({ action: 'pause' });
  a.tick(30);
  assert.equal(a.snapshot().simulation.virtual_time, before.simulation.virtual_time);
  a.command({ action: 'reset' });
  assert.equal(a.modbusFrame(), createSimulation().modbusFrame());
  assert.throws(() => a.command({ action: 'speed', value: 999 }));
});

test('public measurements require decoder results and link interruption buffers readings', () => {
  const sim = createSimulation();
  assert.equal(sim.snapshot().readings, null);
  sim.command({ action: 'scenario', value: 'offline' });
  const decoded = { ok: true, moisture_pct: 25, temperature_c: 18, ec_us_cm: 820, ph: 7.1 };
  sim.recordFirmwareResult(decoded);
  assert.equal(sim.snapshot().radio.buffered_packets, 1);
  assert.equal(sim.snapshot().readings.soil_moisture_pct, 25);
  const measurementTime = sim.snapshot().timestamp;
  sim.tick(1);
  sim.recordFirmwareResult({ ok: false });
  assert.equal(sim.snapshot().timestamp, measurementTime);
  assert.equal(sim.snapshot().firmware_status, 'sensor_error');
  sim.command({ action: 'scenario', value: 'restore' });
  sim.recordFirmwareResult(decoded);
  assert.equal(sim.snapshot().radio.buffered_packets, 0);
  sim.command({ action: 'scenario', value: 'sensor_offline' });
  assert.equal(sim.modbusFrame(), null);
});
