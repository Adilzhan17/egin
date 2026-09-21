import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

const builder = (raw: unknown) => {
  const b: any = {};
  for (const m of ['select', 'addSelect', 'where', 'andWhere', 'setParameters', 'groupBy', 'orderBy']) {
    b[m] = jest.fn().mockReturnValue(b);
  }
  b.getRawMany = jest.fn().mockResolvedValue(raw);
  b.getRawOne = jest.fn().mockResolvedValue(raw);
  return b;
};

describe('AnalyticsService', () => {
  const make = (raw: unknown) => {
    const b = builder(raw);
    return { b, service: new AnalyticsService({ createQueryBuilder: () => b } as any) };
  };

  it('getRegionStats requires a region', async () => {
    await expect(make([]).service.getRegionStats('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getRegionStats binds the region as a parameter (no string concatenation)', async () => {
    const { b, service } = make([{ cropType: 'wheat' }]);
    await expect(service.getRegionStats("x'; DROP TABLE users;--")).resolves.toEqual([{ cropType: 'wheat' }]);
    expect(b.where).toHaveBeenCalledWith('plot.region = :region', { region: "x'; DROP TABLE users;--" });
  });

  describe('getOverproductionRisk', () => {
    it.each([
      ['0', 'LOW'],
      ['200', 'LOW'],
      ['201', 'MEDIUM'],
      ['500', 'MEDIUM'],
      ['501', 'HIGH'],
    ])('%s ha => %s', async (ha, level) => {
      const { service } = make({ totalHectares: ha });
      const res = await service.getOverproductionRisk(43, 76, 'wheat');
      expect(res.riskLevel).toBe(level);
      expect(res.totalHectaresPlanted).toBe(Number(ha));
    });

    it('treats an empty result as 0 ha / LOW', async () => {
      const { service } = make(undefined);
      expect(await service.getOverproductionRisk(43, 76, 'wheat')).toMatchObject({ totalHectaresPlanted: 0, riskLevel: 'LOW' });
    });

    it('converts the radius to metres, default 50 km', async () => {
      const { b, service } = make({ totalHectares: '1' });
      await service.getOverproductionRisk(43, 76, 'wheat');
      expect(b.setParameters).toHaveBeenCalledWith({ lng: 76, lat: 43, distance: 50_000 });
      await service.getOverproductionRisk(43, 76, 'wheat', 10);
      expect(b.setParameters).toHaveBeenLastCalledWith({ lng: 76, lat: 43, distance: 10_000 });
    });

    it('requires lat, lng and cropType', async () => {
      const { service } = make({});
      await expect(service.getOverproductionRisk(undefined as any, 76, 'wheat')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.getOverproductionRisk(43, 76, '')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('BUG-04: accepts a valid coordinate of 0 (equator / prime meridian)', async () => {
      const { service } = make({ totalHectares: '0' });
      await expect(service.getOverproductionRisk(0, 0, 'wheat')).resolves.toBeDefined();
    });
  });

  describe('coordinate validation', () => {
    it.each([
      ['NaN', 'abc', 76],
      ['lat > 90', 91, 76],
      ['lng < -180', 43, -181],
      ['Infinity', Infinity, 76],
    ])('rejects %s', async (_n, lat, lng) => {
      await expect(make({}).service.getCropDensity(lat as any, lng as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a non-positive or absurd radius', async () => {
      await expect(make([]).service.getCropDensity(43, 76, 0)).rejects.toBeInstanceOf(BadRequestException);
      await expect(make([]).service.getCropDensity(43, 76, 5000)).rejects.toBeInstanceOf(BadRequestException);
      await expect(make([]).service.getCropDensity(43, 76, 'x' as any)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts numeric strings (query params)', async () => {
      await expect(make([]).service.getCropDensity('43.2' as any, '76.9' as any, '10' as any)).resolves.toEqual([]);
    });
  });

  describe('getCropDensity', () => {
    it('requires lat and lng', async () => {
      await expect(make([]).service.getCropDensity(undefined as any, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('orders by area, descending', async () => {
      const { b, service } = make([]);
      await service.getCropDensity(43, 76);
      expect(b.orderBy).toHaveBeenCalledWith('"totalHectares"', 'DESC'); // BUG-02: alias must be quoted for Postgres
    });
  });
});
