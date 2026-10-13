import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locationLinks, locationTiles, messageLinks, validLocation } from '../src/features/chat/location-utils.ts';

test('map thumbnail wraps the date line and clamps poles without invalid provider tile requests', () => {
  for (const latitude of [-90, -85, 0, 85, 90]) for (const longitude of [-180, 0, 180]) {
    const tiles = locationTiles({ latitude, longitude }, 430, 160);
    assert(tiles.length > 0);
    for (const tile of tiles) {
      const match = tile.url.match(/\/15\/(\d+)\/(\d+)\.png$/)!;
      assert(match);
      assert(Number(match[1]) >= 0 && Number(match[1]) < 2 ** 15);
      assert(Number(match[2]) >= 0 && Number(match[2]) < 2 ** 15);
      assert(Number.isFinite(tile.left)); assert(Number.isFinite(tile.top));
    }
  }
  assert.deepEqual(locationTiles({ latitude: NaN, longitude: 51 }), []);
  assert.equal(validLocation({ latitude: 91, longitude: 51 }), false);
});

test('location actions preserve the selected coordinates, including zero and southern locations', () => {
  const links = locationLinks({ latitude: -33.8688, longitude: 0 });
  assert.equal(new URL(links.directions).searchParams.get('destination'), '-33.8688,0');
  assert.equal(new URL(links.map).searchParams.get('mlon'), '0');
});

test('materials links are safe external HTTP links, deduplicated without fetching metadata', () => {
  const links = messageLinks('https://egin.perricheno.com. Снова https://egin.perricheno.com/ javascript:alert(1) https://user:password@evil.test https://');
  assert.deepEqual(links, [{ url: 'https://egin.perricheno.com/', domain: 'egin.perricheno.com' }]);
  assert.deepEqual(messageLinks('<img src=x> data:text/html,xxx file:///etc/passwd'), []);
});
