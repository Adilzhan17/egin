import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

describe('OrdersService', () => {
  const orders = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'o1', ...x })),
    find: jest.fn(),
  };
  const items = { create: jest.fn((x) => x) };
  const service = new OrdersService(orders as any, items as any);

  beforeEach(() => jest.clearAllMocks());

  it('sums quantity * price across items', async () => {
    const order = await service.create('u1', {
      items: [
        { listingId: 'a', title: 'A', quantity: 2, unit: 'kg', priceAtPurchase: 10 },
        { listingId: 'b', title: 'B', quantity: 1.5, unit: 'kg', priceAtPurchase: 100 },
      ],
    });
    expect(order.totalPrice).toBe(170);
    expect(order.userId).toBe('u1');
    expect(order.items).toHaveLength(2);
  });

  it('lists only the given user orders, newest first', async () => {
    orders.find.mockResolvedValue([]);
    await service.findByUser('u1');
    expect(orders.find).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { createdAt: 'DESC' } });
  });

  describe('CreateOrderDto validation', () => {
    const check = (body: unknown) => validate(plainToInstance(CreateOrderDto, body), { whitelist: true, forbidNonWhitelisted: true });
    const item = { listingId: 'a', title: 'A', quantity: 1, unit: 'kg', priceAtPurchase: 10 };

    it('accepts a valid order', async () => {
      expect(await check({ items: [item] })).toHaveLength(0);
    });

    it('rejects a missing items array', async () => {
      expect(await check({})).not.toHaveLength(0);
    });

    it('rejects zero/negative quantity', async () => {
      expect(await check({ items: [{ ...item, quantity: 0 }] })).not.toHaveLength(0);
      expect(await check({ items: [{ ...item, quantity: -1 }] })).not.toHaveLength(0);
    });

    it('rejects unknown properties', async () => {
      expect(await check({ items: [item], totalPrice: 1 })).not.toHaveLength(0);
    });

    // KNOWN ISSUES (docs/CODE_REVIEW.md, SEC-06)
    it.failing('SEC-06: rejects a negative client-supplied price', async () => {
      expect(await check({ items: [{ ...item, priceAtPurchase: -1000 }] })).not.toHaveLength(0);
    });

    it.failing('SEC-06: rejects an empty cart', async () => {
      expect(await check({ items: [] })).not.toHaveLength(0);
    });
  });
});
