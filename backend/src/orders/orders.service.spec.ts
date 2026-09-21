import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { ListingStatus } from '../marketplace/entities/marketplace-listing.entity';

describe('OrdersService', () => {
  const orders = {
    create: jest.fn((x) => x),
    save: jest.fn(async (x) => ({ id: 'o1', ...x })),
    find: jest.fn(),
  };
  const items = { create: jest.fn((x) => x) };
  const listings = { find: jest.fn() };
  const service = new OrdersService(orders as any, items as any, listings as any);

  const listing = (over: Record<string, unknown> = {}) => ({
    id: 'l1', title: 'Wheat', unit: 'kg', price: '100', quantity: '50',
    status: ListingStatus.ACTIVE, farmerId: 'seller', ...over,
  });

  beforeEach(() => jest.clearAllMocks());

  it('SEC-06: prices, title and unit come from the listing, never from the client', async () => {
    listings.find.mockResolvedValue([listing(), listing({ id: 'l2', title: 'Barley', price: '50.5' })]);
    const order = await service.create('buyer', {
      items: [
        { listingId: 'l1', quantity: 2, priceAtPurchase: 0.01, title: 'hacked' } as any,
        { listingId: 'l2', quantity: 1 },
      ],
    });
    expect(order.totalPrice).toBe(250.5);
    expect(order.userId).toBe('buyer');
    expect(order.items).toEqual([
      expect.objectContaining({ listingId: 'l1', title: 'Wheat', unit: 'kg', priceAtPurchase: 100, quantity: 2 }),
      expect.objectContaining({ listingId: 'l2', title: 'Barley', priceAtPurchase: 50.5 }),
    ]);
  });

  it('rounds the total to 2 decimals', async () => {
    listings.find.mockResolvedValue([listing({ price: '0.1' })]);
    const order = await service.create('buyer', { items: [{ listingId: 'l1', quantity: 3 }] });
    expect(order.totalPrice).toBe(0.3);
  });

  it('looks each listing up once even when it appears twice', async () => {
    listings.find.mockResolvedValue([listing()]);
    await service.create('buyer', { items: [{ listingId: 'l1', quantity: 1 }, { listingId: 'l1', quantity: 2 }] });
    const where = (listings.find.mock.calls[0] as any[])[0].where.id;
    expect(where.value ?? where._value).toEqual(['l1']);
  });

  it('404s for an unknown listing and saves nothing', async () => {
    listings.find.mockResolvedValue([]);
    await expect(service.create('buyer', { items: [{ listingId: 'nope', quantity: 1 }] })).rejects.toBeInstanceOf(NotFoundException);
    expect(orders.save).not.toHaveBeenCalled();
  });

  it.each([ListingStatus.SOLD, ListingStatus.CANCELLED])('refuses %s listings', async (status) => {
    listings.find.mockResolvedValue([listing({ status })]);
    await expect(service.create('buyer', { items: [{ listingId: 'l1', quantity: 1 }] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses ordering your own listing', async () => {
    listings.find.mockResolvedValue([listing({ farmerId: 'buyer' })]);
    await expect(service.create('buyer', { items: [{ listingId: 'l1', quantity: 1 }] })).rejects.toThrow(/own listing/);
  });

  it('refuses more than the available quantity', async () => {
    listings.find.mockResolvedValue([listing({ quantity: '5' })]);
    await expect(service.create('buyer', { items: [{ listingId: 'l1', quantity: 6 }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.create('buyer', { items: [{ listingId: 'l1', quantity: 5 }] })).resolves.toBeDefined();
  });

  it('lists only the given user orders, newest first', async () => {
    orders.find.mockResolvedValue([]);
    await service.findByUser('u1');
    expect(orders.find).toHaveBeenCalledWith({ where: { userId: 'u1' }, order: { createdAt: 'DESC' } });
  });
});
