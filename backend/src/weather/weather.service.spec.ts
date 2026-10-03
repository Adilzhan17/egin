import { WeatherService } from './weather.service';

describe('Weather used by garden advice', () => {
  it('requests metres per second so wind alerts use the intended thresholds', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          daily: {
            time: ['2026-09-25', '2026-09-26'],
            wind_speed_10m_max: [8, 14],
            temperature_2m_min: [15, 15],
          },
        }),
    } as Response);
    try {
      const result = await new WeatherService().getForecast(43, 76, 2);
      const url = new URL(mock.mock.calls[0][0] as string);
      expect(url.searchParams.get('wind_speed_unit')).toBe('ms');
      expect(
        result.alerts
          .filter((alert) => alert.type === 'wind')
          .map((alert) => alert.day),
      ).toEqual(['2026-09-26']);
    } finally {
      mock.mockRestore();
    }
  });
});
