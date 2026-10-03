import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/entities/user.entity';

describe('AuthService', () => {
  const users = {
    findByPhone: jest.fn(),
    createPublicUser: jest.fn(),
    update: jest.fn(),
  };
  const jwt = { sign: jest.fn().mockReturnValue('signed.jwt') };
  let service: AuthService;
  let hash: string;

  beforeAll(async () => {
    hash = await bcrypt.hash('secret123', 4);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    service = new AuthService(users as any, jwt as any);
  });

  afterEach(() => jest.restoreAllMocks());

  const user = () => ({
    id: 'u1',
    fullName: 'Test',
    phone: '+77010000000',
    role: UserRole.FARMER,
    region: 'R',
    district: 'D',
    passwordHash: hash,
  });

  describe('login', () => {
    it('returns a token and a user without passwordHash', async () => {
      users.findByPhone.mockResolvedValue(user());
      const res = await service.login({ phone: '+77010000000', password: 'secret123' });
      expect(res.access_token).toBe('signed.jwt');
      expect(res.user).toEqual({
        id: 'u1',
        fullName: 'Test',
        phone: '+77010000000',
        role: UserRole.FARMER,
        region: 'R',
        district: 'D',
      });
      expect(JSON.stringify(res)).not.toContain(hash);
      expect(jwt.sign).toHaveBeenCalledWith({ sub: 'u1', phone: '+77010000000', role: UserRole.FARMER });
    });

    it('rejects a wrong password', async () => {
      users.findByPhone.mockResolvedValue(user());
      await expect(service.login({ phone: 'x', password: 'nope' })).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown phone with the same error as a wrong password', async () => {
      users.findByPhone.mockResolvedValue(null);
      await expect(service.login({ phone: 'x', password: 'secret123' })).rejects.toThrow('Invalid credentials');
    });
  });

  describe('register', () => {
    it('auto-logs the new user in', async () => {
      users.createPublicUser.mockResolvedValue(user());
      const res = await service.register({} as any);
      expect(res.access_token).toBe('signed.jwt');
      expect(res.user.id).toBe('u1');
      expect(res.user).not.toHaveProperty('passwordHash');
    });
  });

  describe('OTP', () => {
    beforeEach(() => jest.spyOn(service as any, 'generateCode').mockReturnValue('1000'));

    it('sends a code that expires in 5 minutes', async () => {
      const now = Date.now();
      const res = await service.sendOtp('+7701');
      expect(res.message).toMatch(/sent/i);
      expect(res.expiresAt - now).toBeGreaterThanOrEqual(5 * 60 * 1000 - 50);
      expect(res.expiresAt - now).toBeLessThanOrEqual(5 * 60 * 1000 + 500);
    });

    it('does not leak the code in the response', async () => {
      const res = await service.sendOtp('+7701');
      expect(JSON.stringify(res)).not.toContain('1000');
    });

    it('verifies the right code and rejects a wrong one', async () => {
      await service.sendOtp('+7701');
      await expect(service.verifyOtp('+7701', '1000')).resolves.toEqual({ valid: true });
      await expect(service.verifyOtp('+7701', '9999')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects codes for phones that never requested one', async () => {
      await expect(service.verifyOtp('+7999', '1000')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an expired code', async () => {
      jest.useFakeTimers();
      try {
        await service.sendOtp('+7701');
        jest.advanceTimersByTime(5 * 60 * 1000 + 1);
        await expect(service.verifyOtp('+7701', '1000')).rejects.toBeInstanceOf(UnauthorizedException);
      } finally {
        jest.useRealTimers();
      }
    });

    it('resetPassword hashes the new password and consumes the code', async () => {
      users.findByPhone.mockResolvedValue(user());
      await service.sendOtp('+7701');
      await service.resetPassword('+7701', '1000', 'brand-new-pass');
      const [id, patch] = users.update.mock.calls[0];
      expect(id).toBe('u1');
      expect(patch.passwordHash).not.toBe('brand-new-pass');
      expect(await bcrypt.compare('brand-new-pass', patch.passwordHash)).toBe(true);
      await expect(service.verifyOtp('+7701', '1000')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('resetPassword fails without a valid code and never touches the user', async () => {
      await expect(service.resetPassword('+7701', '1234', 'brand-new-pass')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(users.update).not.toHaveBeenCalled();
    });

    it('resetPassword fails for an unknown user', async () => {
      users.findByPhone.mockResolvedValue(null);
      await service.sendOtp('+7701');
      await expect(service.resetPassword('+7701', '1000', 'brand-new-pass')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('SEC-02: generates 4-digit codes from a CSPRNG', () => {
      jest.restoreAllMocks();
      const svc = new AuthService(users as any, jwt as any) as any;
      for (let i = 0; i < 200; i++) expect(svc.generateCode()).toMatch(/^[1-9]\d{3}$/);
      expect(new Set(Array.from({ length: 50 }, () => svc.generateCode())).size).toBeGreaterThan(10);
    });

    it('SEC-02: burns the code after 5 wrong attempts (brute force is impossible)', async () => {
      await service.sendOtp('+7701');
      for (let i = 0; i < 5; i++) {
        await expect(service.verifyOtp('+7701', String(2000 + i))).rejects.toBeInstanceOf(UnauthorizedException);
      }
      await expect(service.verifyOtp('+7701', '1000')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('SEC-02: the correct code still works after 4 wrong attempts', async () => {
      await service.sendOtp('+7701');
      for (let i = 0; i < 4; i++) await service.verifyOtp('+7701', '9999').catch(() => undefined);
      await expect(service.verifyOtp('+7701', '1000')).resolves.toEqual({ valid: true });
    });

    it('SEC-02: throttles re-sending a code to the same phone (429)', async () => {
      await service.sendOtp('+7701');
      await expect(service.sendOtp('+7701')).rejects.toMatchObject({ status: 429 });
    });

    it('SEC-02: allows a new code once the cooldown has passed', async () => {
      jest.useFakeTimers();
      try {
        await service.sendOtp('+7701');
        jest.advanceTimersByTime(AuthService.OTP_RESEND_COOLDOWN_MS + 1);
        await expect(service.sendOtp('+7701')).resolves.toBeDefined();
      } finally {
        jest.useRealTimers();
      }
    });

    it('SEC-03: resetPassword enforces the minimum password length', async () => {
      users.findByPhone.mockResolvedValue(user());
      await service.sendOtp('+7701');
      await expect(service.resetPassword('+7701', '1000', '12345')).rejects.toBeInstanceOf(BadRequestException);
      expect(users.update).not.toHaveBeenCalled();
    });

    it('SEC-03: resetPassword enforces bcrypt\'s 72 byte ceiling', async () => {
      users.findByPhone.mockResolvedValue(user());
      await service.sendOtp('+7701');
      await expect(service.resetPassword('+7701', '1000', 'x'.repeat(73))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('SEC-03: resetPassword rejects a missing password with a 400, not a crash', async () => {
      users.findByPhone.mockResolvedValue(user());
      await service.sendOtp('+7701');
      await expect(service.resetPassword('+7701', '1000', undefined as any)).rejects.toMatchObject({ status: 400 });
    });

    it('does not reveal whether an account exists when a code is requested', async () => {
      users.findByPhone.mockResolvedValue(null);
      const res = await service.sendOtp('+7000');
      expect(res.message).toMatch(/sent/i);
    });
  });
});
