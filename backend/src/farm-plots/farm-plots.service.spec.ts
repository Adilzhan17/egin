import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FarmPlotsService } from './farm-plots.service';
import { UserRole } from '../users/entities/user.entity';

describe('FarmPlotsService — access control', () => {
  const plots = {
    findOne: jest.fn(),
    findOneByOrFail: jest.fn(),
    update: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };
  const service = new FarmPlotsService(plots as any, {} as any);
  const plot = { id: 'p1', userId: 'owner' };

  beforeEach(() => {
    jest.clearAllMocks();
    plots.findOne.mockResolvedValue(plot);
    plots.findOneByOrFail.mockResolvedValue(plot);
  });

  describe('update', () => {
    it('404s for a missing plot', async () => {
      plots.findOne.mockResolvedValue(null);
      await expect(service.update('p1', 'owner', UserRole.FARMER, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403s for a non-owner', async () => {
      await expect(service.update('p1', 'intruder', UserRole.FARMER, { title: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(plots.update).not.toHaveBeenCalled();
    });

    it('lets the owner update', async () => {
      await service.update('p1', 'owner', UserRole.FARMER, { title: 'x' });
      expect(plots.update).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'x' }));
    });

    it('lets an admin update any plot', async () => {
      await service.update('p1', 'admin-id', UserRole.ADMIN, { title: 'x' });
      expect(plots.update).toHaveBeenCalled();
    });

    it('SEC-05: never writes columns outside the allow-list', async () => {
      await service.update('p1', 'owner', UserRole.FARMER, { title: 'ok', userId: 'x', geometry: 'x', createdAt: 'x' } as any);
      expect(plots.update).toHaveBeenCalledWith('p1', { title: 'ok' });
    });

    it('skips the UPDATE when nothing allowed was sent', async () => {
      await service.update('p1', 'owner', UserRole.FARMER, { userId: 'x' } as any);
      expect(plots.update).not.toHaveBeenCalled();
    });

    it('converts plantingDate to a Date', async () => {
      await service.update('p1', 'owner', UserRole.FARMER, { plantingDate: '2026-05-01' as any });
      const patch = (plots.update.mock.calls[0] as any[])[1];
      expect(patch.plantingDate).toBeInstanceOf(Date);
    });

    it('SEC-05: ignores ownership/identity fields in the PATCH body', async () => {
      await service.update('p1', 'owner', UserRole.FARMER, { title: 'ok', userId: 'intruder', id: 'other' } as any);
      const patch = (plots.update.mock.calls[0] as any[])[1];
      expect(patch).not.toHaveProperty('userId');
      expect(patch).not.toHaveProperty('id');
    });
  });

  describe('remove', () => {
    it('404s for a missing plot', async () => {
      plots.findOne.mockResolvedValue(null);
      await expect(service.remove('p1', 'owner', UserRole.FARMER)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403s for a non-owner and does not delete', async () => {
      await expect(service.remove('p1', 'intruder', UserRole.BUYER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(plots.delete).not.toHaveBeenCalled();
    });

    it('deletes for the owner and for admins', async () => {
      await service.remove('p1', 'owner', UserRole.FARMER);
      await service.remove('p1', 'admin-id', UserRole.ADMIN);
      expect(plots.delete).toHaveBeenCalledTimes(2);
    });
  });
});
