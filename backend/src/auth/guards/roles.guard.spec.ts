import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../../users/entities/user.entity';

describe('RolesGuard', () => {
  const ctx = (role?: string) =>
    ({
      getHandler: () => 'h',
      getClass: () => 'c',
      switchToHttp: () => ({ getRequest: () => ({ user: role ? { role } : undefined }) }),
    }) as any;
  const guardFor = (required?: UserRole[]) => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector;
    return new RolesGuard(reflector);
  };

  it('allows everything when no role is required', () => {
    expect(guardFor(undefined).canActivate(ctx('farmer'))).toBe(true);
    expect(guardFor([]).canActivate(ctx())).toBe(true);
  });

  it('allows a matching role', () => {
    expect(guardFor([UserRole.ADMIN]).canActivate(ctx('admin'))).toBe(true);
  });

  it.each(['farmer', 'buyer', 'seller', undefined])('forbids %s when admin is required', (role) => {
    expect(() => guardFor([UserRole.ADMIN]).canActivate(ctx(role))).toThrow(ForbiddenException);
  });

  it('supports several allowed roles', () => {
    expect(guardFor([UserRole.ADMIN, UserRole.SELLER]).canActivate(ctx('seller'))).toBe(true);
  });
});
