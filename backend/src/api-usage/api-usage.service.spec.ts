import { ApiUsageService } from './api-usage.service';

describe('ApiUsageService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => x),
    find: jest.fn(async () => []),
  };
  const service = new ApiUsageService(repo as any);

  beforeEach(() => jest.clearAllMocks());

  it('seeds the google_maps counter on module init when missing', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.onModuleInit();
    expect(repo.save).toHaveBeenCalledWith({ provider: 'google_maps', monthlyLimit: 28500 });
  });

  it('does not reseed an existing counter', async () => {
    repo.findOne.mockResolvedValue({ provider: 'google_maps' });
    await service.onModuleInit();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('increments an existing provider', async () => {
    const row = { provider: 'google_maps', callCount: 5 };
    repo.findOne.mockResolvedValue(row);
    await service.increment('google_maps');
    expect(row.callCount).toBe(6);
    expect(repo.save).toHaveBeenCalledWith(row);
  });

  it('ignores unknown providers', async () => {
    repo.findOne.mockResolvedValue(null);
    await service.increment('nope');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('returns stats', async () => {
    await expect(service.getStats()).resolves.toEqual([]);
  });
});
