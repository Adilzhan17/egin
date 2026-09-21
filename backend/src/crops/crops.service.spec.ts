import { CropsService } from './crops.service';

describe('CropsService', () => {
  const repo = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'c1', ...x })),
    find: jest.fn(async () => [{ id: 'c1' }]),
    findOne: jest.fn(),
    update: jest.fn(async () => undefined),
  };
  const service = new CropsService(repo as any);

  beforeEach(() => jest.clearAllMocks());

  it('creates and returns the saved crop', async () => {
    await expect(service.create({ name: 'Wheat', category: 'grain' })).resolves.toMatchObject({ id: 'c1', name: 'Wheat' });
  });

  it('lists crops', async () => {
    await expect(service.findAll()).resolves.toEqual([{ id: 'c1' }]);
  });

  it('finds one by id', async () => {
    repo.findOne.mockResolvedValue({ id: 'c1' });
    await service.findOne('c1');
    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('updates by id', async () => {
    await service.update('c1', { color: 'red' });
    expect(repo.update).toHaveBeenCalledWith('c1', { color: 'red' });
  });
});
