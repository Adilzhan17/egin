import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { UserRole } from './entities/user.entity';

describe('UsersService', () => {
  const repo = {
    findOne: jest.fn(),
    create: jest.fn((x) => ({ ...x })),
    save: jest.fn(async (x) => ({ id: 'new-id', ...x })),
  };
  let service: UsersService;

  const dto = {
    fullName: 'A',
    phone: '+77010000000',
    password: 'secret123',
    region: 'R',
    district: 'D',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsersService(repo as any);
  });

  describe('create', () => {
    it('stores a bcrypt hash and never the plaintext password', async () => {
      repo.findOne.mockResolvedValue(null);
      const saved = await service.create(dto as any);
      expect(saved.passwordHash).toBeDefined();
      expect(saved.passwordHash).not.toBe('secret123');
      expect(await bcrypt.compare('secret123', saved.passwordHash)).toBe(true);
    });

    it('rejects a duplicate phone with 409', async () => {
      repo.findOne.mockResolvedValue({ id: 'x' });
      await expect(service.create(dto as any)).rejects.toBeInstanceOf(ConflictException);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('createPublicUser', () => {
    beforeEach(() => repo.findOne.mockResolvedValue(null));

    it('forbids creating admins through public registration', async () => {
      await expect(service.createPublicUser({ ...dto, role: UserRole.ADMIN } as any)).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('defaults the role to farmer', async () => {
      const u = await service.createPublicUser(dto as any);
      expect(u.role).toBe(UserRole.FARMER);
    });

    it.each([UserRole.BUYER, UserRole.SELLER, UserRole.FARMER])('allows the %s role', async (role) => {
      const u = await service.createPublicUser({ ...dto, role } as any);
      expect(u.role).toBe(role);
    });
  });

  describe('ensureAdminUser', () => {
    const input = { phone: '+7', password: 'pw', fullName: 'Admin', region: 'R', district: 'D' };

    it('creates a new admin', async () => {
      repo.findOne.mockResolvedValue(null);
      const u = await service.ensureAdminUser(input);
      expect(u.role).toBe(UserRole.ADMIN);
      expect(await bcrypt.compare('pw', u.passwordHash)).toBe(true);
    });

    it('promotes and resets an existing account (idempotent)', async () => {
      repo.findOne.mockResolvedValue({ id: 'e', phone: '+7', role: UserRole.FARMER, passwordHash: 'old' });
      const u = await service.ensureAdminUser(input);
      expect(u.id).toBe('e');
      expect(u.role).toBe(UserRole.ADMIN);
      expect(u.passwordHash).not.toBe('old');
    });
  });

  describe('updateProfile', () => {
    it('404s for an unknown user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.updateProfile('x', {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409s when the new phone belongs to somebody else', async () => {
      repo.findOne
        .mockResolvedValueOnce({ id: 'me', phone: '+1' })
        .mockResolvedValueOnce({ id: 'other', phone: '+2' });
      await expect(service.updateProfile('me', { phone: '+2' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not check uniqueness when the phone is unchanged', async () => {
      repo.findOne.mockResolvedValueOnce({ id: 'me', phone: '+1' });
      await service.updateProfile('me', { phone: '+1', fullName: 'New' });
      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ fullName: 'New' }));
    });
  });

  describe('update', () => {
    it('404s for an unknown user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.update('x', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
