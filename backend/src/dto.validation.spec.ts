import 'reflect-metadata';
import { ClassConstructor, plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './users/dto/create-user.dto';
import { UpdateUserDto } from './users/dto/update-user.dto';
import { LoginDto } from './auth/dto/login.dto';
import { CreateCropDto } from './crops/dto/create-crop.dto';
import { CreateFarmPlotDto } from './farm-plots/dto/create-farm-plot.dto';
import { CreateFarmActivityDto } from './farm-activities/dto/create-farm-activity.dto';
import { CreateDirectChatDto, SendMessageDto } from './chat/dto/create-direct-chat.dto';
import { CreateListingDto } from './marketplace/dto/create-listing.dto';
import { FarmActivityType } from './farm-activities/entities/farm-activity.entity';

// Mirrors the global ValidationPipe from main.ts
const errorsFor = async <T extends object>(cls: ClassConstructor<T>, body: unknown) =>
  (await validate(plainToInstance(cls, body) as object, { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

describe('DTO validation', () => {
  describe('CreateUserDto', () => {
    const ok = { fullName: 'A', phone: '+77010000000', password: 'secret1', region: 'R', district: 'D' };

    it('accepts a valid payload', async () => expect(await errorsFor(CreateUserDto, ok)).toEqual([]));
    it('requires every mandatory field', async () => {
      for (const key of Object.keys(ok)) {
        const { [key as keyof typeof ok]: _omit, ...rest } = ok;
        expect(await errorsFor(CreateUserDto, rest)).toContain(key);
      }
    });
    it('enforces the 6 character minimum password', async () => {
      expect(await errorsFor(CreateUserDto, { ...ok, password: '12345' })).toContain('password');
      expect(await errorsFor(CreateUserDto, { ...ok, password: '123456' })).toEqual([]);
    });
    it('rejects unknown roles', async () => expect(await errorsFor(CreateUserDto, { ...ok, role: 'root' })).toContain('role'));
    it('rejects non-whitelisted properties (mass assignment)', async () =>
      expect(await errorsFor(CreateUserDto, { ...ok, isAdmin: true })).toContain('isAdmin'));
    it('rejects non-string values', async () => expect(await errorsFor(CreateUserDto, { ...ok, phone: 123 })).toContain('phone'));
  });

  describe('UpdateUserDto', () => {
    it('accepts partial updates', async () => expect(await errorsFor(UpdateUserDto, { fullName: 'B' })).toEqual([]));
    it('accepts an empty body', async () => expect(await errorsFor(UpdateUserDto, {})).toEqual([]));
    it('forbids changing role or password', async () => {
      expect(await errorsFor(UpdateUserDto, { role: 'admin' })).toContain('role');
      expect(await errorsFor(UpdateUserDto, { passwordHash: 'x' })).toContain('passwordHash');
    });
  });

  describe('LoginDto', () => {
    it('accepts phone + password', async () => expect(await errorsFor(LoginDto, { phone: '+7', password: 'x' })).toEqual([]));
    it('rejects empty values', async () => expect((await errorsFor(LoginDto, { phone: '', password: '' })).sort()).toEqual(['password', 'phone']));
  });

  describe('CreateCropDto', () => {
    it('requires name and category', async () => expect((await errorsFor(CreateCropDto, {})).sort()).toEqual(['category', 'name']));
    it('accepts optional color/icon', async () =>
      expect(await errorsFor(CreateCropDto, { name: 'W', category: 'grain', color: '#fff', icon: 'x' })).toEqual([]));
  });

  describe('CreateFarmPlotDto', () => {
    const ok = {
      title: 'T', region: 'R', district: 'D', areaSizeHectares: 12.5,
      geometry: { type: 'Polygon', coordinates: [] }, cropType: 'wheat', seasonYear: 2026,
    };
    it('accepts a valid plot', async () => expect(await errorsFor(CreateFarmPlotDto, ok)).toEqual([]));
    it('rejects a string area', async () => expect(await errorsFor(CreateFarmPlotDto, { ...ok, areaSizeHectares: '12' })).toContain('areaSizeHectares'));
    it('rejects a bad plantingDate', async () => expect(await errorsFor(CreateFarmPlotDto, { ...ok, plantingDate: 'yesterday' })).toContain('plantingDate'));
    it('rejects a bad plantingStatus', async () => expect(await errorsFor(CreateFarmPlotDto, { ...ok, plantingStatus: 'nope' })).toContain('plantingStatus'));
    it('requires geometry', async () => {
      const { geometry: _g, ...rest } = ok;
      expect(await errorsFor(CreateFarmPlotDto, rest)).toContain('geometry');
    });
  });

  describe('CreateFarmActivityDto', () => {
    const type = Object.values(FarmActivityType)[0];
    it('accepts a minimal entry', async () => expect(await errorsFor(CreateFarmActivityDto, { type, activityDate: '2026-05-01' })).toEqual([]));
    it('rejects unknown types', async () => expect(await errorsFor(CreateFarmActivityDto, { type: 'x', activityDate: '2026-05-01' })).toContain('type'));
    it('rejects negative cost', async () => expect(await errorsFor(CreateFarmActivityDto, { type, activityDate: '2026-05-01', costKzt: -1 })).toContain('costKzt'));
    it('coerces numeric-string cost', async () => expect(await errorsFor(CreateFarmActivityDto, { type, activityDate: '2026-05-01', costKzt: '100' })).toEqual([]));
    it('caps description at 1000 chars', async () =>
      expect(await errorsFor(CreateFarmActivityDto, { type, activityDate: '2026-05-01', description: 'x'.repeat(1001) })).toContain('description'));
    it('requires string materials', async () =>
      expect(await errorsFor(CreateFarmActivityDto, { type, activityDate: '2026-05-01', materials: [1] })).toContain('materials'));
  });

  describe('Chat DTOs', () => {
    it('requires a UUID participant', async () => {
      expect(await errorsFor(CreateDirectChatDto, { participantUserId: 'abc' })).toContain('participantUserId');
      expect(await errorsFor(CreateDirectChatDto, { participantUserId: '123e4567-e89b-12d3-a456-426614174000' })).toEqual([]);
    });
    it('limits message body to 1000 chars', async () => {
      expect(await errorsFor(SendMessageDto, { body: 'x'.repeat(1001) })).toContain('body');
      expect(await errorsFor(SendMessageDto, { body: 'hi' })).toEqual([]);
    });
    it('requires metadata to be an object', async () => expect(await errorsFor(SendMessageDto, { body: 'x', metadata: 'str' })).toContain('metadata'));
  });

  describe('CreateListingDto', () => {
    const ok = {
      cropId: 'c', title: 'T', category: 'grain', quantity: 10, unit: 'kg', price: 5, currency: 'KZT',
      availableFrom: '2026-09-21', location: 'Almaty',
    };
    it('rejects an empty payload', async () => expect((await errorsFor(CreateListingDto, {})).length).toBeGreaterThan(5));
    it('rejects negative price/quantity', async () => {
      const errs = await errorsFor(CreateListingDto, { ...ok, price: -1, quantity: -1 });
      expect(errs).toEqual(expect.arrayContaining(['price', 'quantity']));
    });
    it('rejects a bad availableFrom date', async () => expect(await errorsFor(CreateListingDto, { ...ok, availableFrom: 'soon' })).toContain('availableFrom'));
  });
});
