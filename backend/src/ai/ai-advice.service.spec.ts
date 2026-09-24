import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { AiAdviceService } from './ai-advice.service';
import { FarmPlot } from '../farm-plots/entities/farm-plot.entity';
import { FarmActivity } from '../farm-activities/entities/farm-activity.entity';
import { UserRole } from '../users/entities/user.entity';
import { WeatherService } from '../weather/weather.service';
import { GardenConditionsService } from '../weather/garden-conditions.service';

describe('Garden advice access and provider handling', () => {
  const plot = {
    id: 'plot',
    userId: 'owner',
    title: 'Огород',
    cropType: 'Томаты',
  };
  const garden = {
    getConditions: jest.fn().mockResolvedValue({
      calculatedAt: '2026-09-25T10:00:00Z',
      soilMoisturePercent: 24,
    }),
  };
  const weather = {
    getPlotCoordinates: () => ({ lat: 43, lng: 76 }),
    getForecast: jest.fn().mockResolvedValue({ forecast: [], alerts: [] }),
  };
  function service(key = '') {
    return new AiAdviceService(
      {
        findOne: jest.fn().mockResolvedValue(plot),
      } as unknown as Repository<FarmPlot>,
      {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as Repository<FarmActivity>,
      weather as unknown as WeatherService,
      new ConfigService({ OPENAI_API_KEY: key }),
      garden as unknown as GardenConditionsService,
    );
  }
  afterEach(() => jest.restoreAllMocks());
  it('denies another farmer both soil data and advice before provider calls', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    await expect(
      service().getPlotAdvice('plot', 'other', UserRole.FARMER),
    ).rejects.toThrow('access');
    await expect(
      service().getPlotConditions('plot', 'other', UserRole.FARMER),
    ).rejects.toThrow('access');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('offers honestly labeled Kazakh general guidance when AI is unavailable', async () => {
    const advice = await service().getPlotAdvice(
      'plot',
      'owner',
      UserRole.FARMER,
      'kk',
    );
    expect(advice.source).toBe('fallback');
    expect(advice.summary).toContain('қолжетімсіз');
    expect(JSON.stringify(advice)).not.toContain('OPENAI_API_KEY');
  });
  it('sends soil context, requests strict output and caches successful advice', async () => {
    const advice = {
      title: 'Уход',
      summary: 'Проверьте землю',
      actions: ['Осмотрите растения'],
      risks: [],
      confidenceNote: 'Расчёт модели',
    };
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 'completed',
          output: [{ content: [{ text: JSON.stringify(advice) }] }],
        }),
    } as Response);
    const sut = service('test-key');
    expect(
      (await sut.getPlotAdvice('plot', 'owner', UserRole.FARMER)).source,
    ).toBe('openai');
    await sut.getPlotAdvice('plot', 'owner', UserRole.FARMER);
    expect(mock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(mock.mock.calls[0][1]?.body as string) as {
      store: boolean;
      text: { format: { strict: boolean } };
      input: string;
    };
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.input).toContain('soilMoisturePercent');
  });
  it.each([
    { status: 'incomplete', output_text: '{}' },
    { status: 'completed', output: [{ content: [{ type: 'refusal' }] }] },
    { status: 'completed', output_text: 'not json' },
  ])(
    'falls back on incomplete, refused or malformed output',
    async (output) => {
      jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(output),
      } as Response);
      expect(
        (
          await service('test-key').getPlotAdvice(
            'plot',
            'owner',
            UserRole.FARMER,
          )
        ).source,
      ).toBe('fallback');
    },
  );
});
