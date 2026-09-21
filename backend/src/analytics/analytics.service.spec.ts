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

    // KNOWN ISSUE (docs/CODE_REVIEW.md, BUG-04): `!lat` treats coordinate 0 as missing.
    it.failing('BUG-04: accepts a valid coordinate of 0 (equator / prime meridian)', async () => {
      const { service } = make({ totalHectares: '0' });
      await expect(service.getOverproductionRisk(0, 0, 'wheat')).resolves.toBeDefined();
    });
  });

  describe('getCropDensity', () => {
    it('requires lat and lng', async () => {
      await expect(make([]).service.getCropDensity(undefined as any, 1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('orders by area, descending', async () => {
      const { b, service } = make([]);
      await service.getCropDensity(43, 76);
      expect(b.orderBy).toHaveBeenCalledWith('totalHectares', 'DESC');
    });
  });
});
