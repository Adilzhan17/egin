// Demonstration model, not a calibrated agronomic or battery-management model.
// All time steps are deterministic; measurements enter the public snapshot via
// recordFirmwareResult(), after the virtual Modbus frame has passed through C++.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value, places = 1) => Number(value.toFixed(places));
const SCENARIOS = new Set(['normal', 'rain', 'drought', 'salinity', 'offline', 'low_battery', 'restore', 'sensor_offline']);

function crc16(bytes) {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc & 1) ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}

export function createSimulation(options = {}) {
  const deviceId = options.deviceId || 'EGIN-SC-001';
  const startTime = options.startTime || '2026-06-01T10:00:00.000Z';
  if (!Number.isFinite(Date.parse(startTime))) throw new Error('Invalid start time');
  let state;
  function reset() {
    state = {
      time: Date.parse(startTime), playing: true, speed: 360, scenario: 'normal',
      moisture: 0.25, surfaceWaterMm: 0, temperature: 18, saltMass: 0.25 * 820,
      ph: 7.1, energyWh: 16.8, connected: true, sensorOnline: true,
      seq: 0, buffered: 0, readings: null, measurementTime: null,
      qualityFlags: ['PH_UNVALIDATED', 'MOISTURE_NOT_SOIL_CALIBRATED'],
      firmwareStatus: 'awaiting_decoder', solarW: 0, rainIntensity: 12,
    };
  }
  reset();

  function snapshot() {
    const soc = 100 * state.energyWh / 22.4;
    return {
      schema_version: 1, device_id: deviceId, seq: state.seq,
      timestamp: state.measurementTime, source: 'simulation',
      quality_flags: [...state.qualityFlags], readings: state.readings && { ...state.readings },
      power: { battery_mv: Math.round(3000 + 400 * soc / 100), battery_soc_est_pct: round(soc), solar_input_mw: Math.round(state.solarW * 1000), estimated: true },
      radio: { status: state.connected ? 'connected' : 'offline', buffered_packets: state.buffered },
      firmware_version: '0.1.0', firmware_status: state.firmwareStatus,
      simulation: {
        playing: state.playing, speed: state.speed, scenario: state.scenario,
        virtual_time: new Date(state.time).toISOString(), rain_mm_h: state.scenario === 'rain' ? state.rainIntensity : 0,
        sensor_online: state.sensorOnline, model: 'demonstration_not_calibrated',
        battery_saving: soc < 15, soil_depth_cm: 15,
      },
    };
  }

  function command(body = {}) {
    const { action, value } = body;
    if (action === 'play') state.playing = true;
    else if (action === 'pause') state.playing = false;
    else if (action === 'reset') reset();
    else if (action === 'rainfall' && Number.isFinite(value) && value >= 0 && value <= 50) state.rainIntensity = value;
    else if (action === 'speed' && [1, 60, 360].includes(Number(value))) state.speed = Number(value);
    else if (action === 'scenario' && SCENARIOS.has(value)) {
      if (value === 'offline') state.connected = false;
      else if (value === 'restore') { state.connected = true; state.sensorOnline = true; }
      else if (value === 'low_battery') state.energyWh = Math.min(state.energyWh, 22.4 * 0.12);
      else if (value === 'sensor_offline') state.sensorOnline = false;
      else { state.scenario = value; state.sensorOnline = true; if(value==='normal'){state.connected=true;state.energyWh=Math.max(state.energyWh,22.4*.35);} }
    } else throw new Error('Invalid simulation command');
    return snapshot();
  }

  function tick(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 3600) throw new Error('Invalid tick duration');
    if (!state.playing || deltaSeconds === 0) return snapshot();
    let remaining = deltaSeconds * state.speed;
    // Bounded integration steps preserve stability at every playback speed.
    while (remaining > 0) {
      const seconds = Math.min(remaining, 300);
      const hours = seconds / 3600;
      state.time += seconds * 1000;
      const hour = new Date(state.time).getUTCHours() + new Date(state.time).getUTCMinutes() / 60;
      const sun = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12));
      const rain = state.scenario === 'rain' ? state.rainIntensity : 0;
      const drought = state.scenario === 'drought';
      state.solarW = 5 * sun * (rain ? 0.25 : 1);
      state.surfaceWaterMm += rain * hours;
      // Slow infiltration provides lag between rainfall and sensor response.
      const infiltration = Math.min(state.surfaceWaterMm, 5 * hours);
      state.surfaceWaterMm -= infiltration;
      const et = (drought ? 0.45 : 0.15 + 0.12 * sun) * hours;
      const waterMm = state.moisture * 150;
      const drainage = Math.max(0, waterMm - 0.34 * 150) * Math.min(1, 0.12 * hours);
      const nextWater = clamp(waterMm + infiltration - et - drainage, 0.1 * 150, 0.48 * 150);
      // Dissolved salt leaves with drainage; salinity scenario adds salt gradually.
      state.saltMass = Math.max(0, state.saltMass * (1 - drainage / Math.max(waterMm, 1)) + (state.scenario === 'salinity' ? 3 * hours : 0));
      state.moisture = nextWater / 150;
      const airTemperature = 19 + 8 * Math.sin(Math.PI * (hour - 8) / 12);
      state.temperature += (airTemperature - state.temperature) * (1 - Math.exp(-hours / 6));
      state.ph = clamp(state.ph + 0.00002 * hours, 0, 14);
      // Assumed 70% charging efficiency and 80 mW average station load.
      const loadW = state.energyWh / 22.4 < .15 ? .025 : .08;
      state.energyWh = clamp(state.energyWh + (state.solarW * 0.7 - loadW) * hours, 0, 22.4);
      remaining -= seconds;
    }
    return snapshot();
  }

  function modbusFrame() {
    if (!state.sensorOnline) return null;
    const registers = [Math.round(state.moisture * 1000), Math.round(state.temperature * 10) & 0xffff,
      Math.round(clamp(state.saltMass / Math.max(state.moisture, 0.01), 0, 20000)), Math.round(state.ph * 10)];
    const bytes = [1, 3, 8];
    for (const value of registers) bytes.push((value >>> 8) & 0xff, value & 0xff);
    const crc = crc16(bytes);
    bytes.push(crc & 0xff, crc >>> 8);
    return bytes.map(byte => byte.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  }

  function recordFirmwareResult(result) {
    if (!result || !result.ok) {
      state.firmwareStatus = result ? 'sensor_error' : 'unavailable';
      return snapshot();
    }
    const values = [result.moisture_pct, result.temperature_c, result.ec_us_cm, result.ph];
    if (!values.every(Number.isFinite)) throw new Error('Invalid firmware result');
    state.readings = { soil_moisture_pct: values[0], soil_temperature_c: values[1], ec_us_cm: values[2], soil_ph: values[3] };
    state.qualityFlags = Array.isArray(result.quality_flags) ? [...new Set([...state.qualityFlags, ...result.quality_flags])] : state.qualityFlags;
    state.firmwareStatus = 'decoded';
    state.measurementTime = new Date(state.time).toISOString();
    state.seq += 1;
    if (!state.connected) state.buffered = Math.min(1000, state.buffered + 1);
    else state.buffered = Math.max(0, state.buffered - 5);
    return snapshot();
  }

  function restore(saved) {
    if(saved?.version!==1 || !saved.state)throw new Error('Unsupported simulation state');
    const next=saved.state;
    for(const key of ['time','speed','moisture','surfaceWaterMm','temperature','saltMass','ph','energyWh','seq','solarW'])if(!Number.isFinite(next[key]))throw new Error('Invalid simulation state');
    if(![1,60,360].includes(next.speed)||!SCENARIOS.has(next.scenario)||next.moisture<.1||next.moisture>.48||next.energyWh<0||next.energyWh>22.4)throw new Error('Invalid simulation state');
    state={...next,qualityFlags:[...next.qualityFlags],rainIntensity:next.rainIntensity??12};
  }
  return { snapshot, command, tick, modbusFrame, recordFirmwareResult, exportState:()=>({version:1,state:structuredClone(state)}), restore };
}
