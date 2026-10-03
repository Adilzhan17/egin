import { PlaceSearchService } from './place-search.service';

describe('Address search', () => {
  afterEach(() => jest.restoreAllMocks());
  it('validates search length', async () => {
    await expect(new PlaceSearchService().search(' a ', 'ru')).rejects.toThrow(
      'Enter 3–200 characters',
    );
  });
  it('normalizes, caches and limits requests across users; ignores broken coordinates', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            place_id: 1,
            display_name: 'Алматы, Абая 10',
            lat: '43.2',
            lon: '76.9',
            place_rank: 30,
          },
          { place_id: 2, display_name: 'bad', lat: 'NaN', lon: '76' },
        ]),
    } as Response);
    const service = new PlaceSearchService();
    const result = await service.search(' Алматы   Абая 10 ', 'ru');
    expect(result).toEqual([
      { id: '1', label: 'Алматы, Абая 10', lat: 43.2, lng: 76.9, zoom: 17 },
    ]);
    expect(await service.search('алматы Абая 10', 'ru')).toEqual(result);
    expect(mock).toHaveBeenCalledTimes(1);
    await expect(service.search('Астана', 'ru')).rejects.toThrow(
      'Please retry',
    );
    const url = mock.mock.calls[0][0] as URL;
    expect(url.searchParams.get('countrycodes')).toBe('kz');
  });
  it('returns a retriable error when the provider fails', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
    await expect(
      new PlaceSearchService().search('Алматы', 'ru'),
    ).rejects.toThrow('temporarily unavailable');
  });
});
