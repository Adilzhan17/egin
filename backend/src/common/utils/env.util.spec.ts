import { parseEnvBoolean, parseEnvList, parseEnvNumber } from './env.util';

describe('env.util', () => {
  describe('parseEnvBoolean', () => {
    it.each(['1', 'true', 'TRUE', ' yes ', 'On'])('treats %p as true', (v) => {
      expect(parseEnvBoolean(v)).toBe(true);
    });

    it.each(['0', 'false', 'no', 'off', '', 'random'])('treats %p as false', (v) => {
      expect(parseEnvBoolean(v, true)).toBe(false);
    });

    it('returns the default only when the value is undefined', () => {
      expect(parseEnvBoolean(undefined)).toBe(false);
      expect(parseEnvBoolean(undefined, true)).toBe(true);
    });
  });

  describe('parseEnvNumber', () => {
    it('parses numeric strings', () => {
      expect(parseEnvNumber('42', 1)).toBe(42);
      expect(parseEnvNumber('3.5', 1)).toBe(3.5);
    });

    it('falls back for undefined, junk and infinity', () => {
      expect(parseEnvNumber(undefined, 7)).toBe(7);
      expect(parseEnvNumber('abc', 7)).toBe(7);
      expect(parseEnvNumber('Infinity', 7)).toBe(7);
    });
  });

  describe('parseEnvList', () => {
    it('splits, trims and drops empty items', () => {
      expect(parseEnvList(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
    });

    it('returns an empty list for undefined/empty', () => {
      expect(parseEnvList(undefined)).toEqual([]);
      expect(parseEnvList('')).toEqual([]);
    });
  });
});
