import {
  GardenConditionsService,
  parseGardenConditions,
} from './garden-conditions.service';

describe('Garden conditions', () => {
  const now = Date.UTC(2026, 8, 25, 10, 30);
  const response = () => ({
    hourly: {
      time: [
        Date.UTC(2026, 8, 25, 10) / 1000,
        Date.UTC(2026, 8, 25, 11) / 1000,
      ],
      soil_moisture_3_to_9cm: [0.237, 0.8],
      soil_temperature_6cm: [18.2, 30],
      relative_humidity_2m: [64, 90],
    },
    hourly_units: {
      soil_moisture_3_to_9cm: 'm³/m³',
      soil_temperature_6cm: '°C',
      relative_humidity_2m: '%',
    },
  });

  it('uses the latest past hour and converts volumetric fraction to percent', () => {
    expect(parseGardenConditions(response(), now)).toMatchObject({
      soilMoisturePercent: 23.7,
      soilTemperatureC: 18.2,
      airHumidityPercent: 64,
      calculatedAt: '2026-09-25T10:00:00.000Z',
      kind: 'model',
      soilMoistureDepthCm: [3, 9],
    });
  });
  it('does not turn missing, stale or differently measured values into zero', () => {
    const data = response();
    data.hourly_units.soil_moisture_3_to_9cm = '%';
    expect(parseGardenConditions(data, now).soilMoisturePercent).toBeNull();
    expect(parseGardenConditions({}, now).airHumidityPercent).toBeNull();
    expect(
      parseGardenConditions(response(), now + 86400000).calculatedAt,
    ).toBeNull();
  });
  it('accepts zero but rejects physically invalid values', () => {
    const data = response();
    data.hourly.soil_moisture_3_to_9cm[0] = 0;
    data.hourly.relative_humidity_2m[0] = 110;
    const result = parseGardenConditions(data, now);
    expect(result.soilMoisturePercent).toBe(0);
    expect(result.airHumidityPercent).toBeNull();
  });
  it('rejects invalid coordinates without contacting the provider', async () => {
    await expect(
      new GardenConditionsService().getConditions(100, 76),
    ).rejects.toThrow('Invalid coordinates');
  });
  it('deduplicates simultaneous requests and caches results', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(response()),
    } as Response);
    try {
      const service = new GardenConditionsService();
      await Promise.all([
        service.getConditions(43, 76),
        service.getConditions(43, 76),
      ]);
      await service.getConditions(43, 76);
      expect(mock).toHaveBeenCalledTimes(1);
    } finally {
      mock.mockRestore();
    }
  });
});
