import { DEFAULT_ALLOWED_ORIGINS, isAllowedOrigin, parseAllowedOrigins } from './cors.util';

describe('parseAllowedOrigins', () => {
  it('falls back to the default list when unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS);
  });

  it('splits and trims a comma-separated env value', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com ,https://c.com')).toEqual([
      'https://a.com',
      'https://b.com',
      'https://c.com',
    ]);
  });

  it('an explicit value fully replaces the defaults (no merge)', () => {
    expect(parseAllowedOrigins('https://a.com')).toEqual(['https://a.com']);
  });
});

describe('isAllowedOrigin', () => {
  const configured = ['https://egin.perricheno.com'];

  it('allows an exact match from the configured list', () => {
    expect(isAllowedOrigin('https://egin.perricheno.com', configured)).toBe(true);
  });

  it('rejects anything not configured or pattern-matched', () => {
    expect(isAllowedOrigin('https://evil.example', configured)).toBe(false);
    expect(isAllowedOrigin('http://egin.perricheno.com', configured)).toBe(false); // scheme matters
  });

  it('always allows the *.perricheno.ru fleet, regardless of configuredOrigins', () => {
    expect(isAllowedOrigin('https://app.perricheno.ru', [])).toBe(true);
    expect(isAllowedOrigin('http://api.perricheno.ru', [])).toBe(true);
    expect(isAllowedOrigin('https://perricheno.ru.evil.com', [])).toBe(false);
  });

  describe('the Cloudflare Workers preview deploy', () => {
    it('allows the egin-frontend worker on any account subdomain', () => {
      expect(isAllowedOrigin('https://egin-frontend.amangeldy-toy123.workers.dev', [])).toBe(true);
      expect(isAllowedOrigin('https://egin-frontend.some-other-account.workers.dev', [])).toBe(true);
    });

    it('does not allow just any *.workers.dev origin', () => {
      expect(isAllowedOrigin('https://some-other-worker.amangeldy-toy123.workers.dev', [])).toBe(false);
      expect(isAllowedOrigin('https://evil.workers.dev', [])).toBe(false);
    });

    it('requires https and rejects path/subdomain tricks', () => {
      expect(isAllowedOrigin('http://egin-frontend.amangeldy-toy123.workers.dev', [])).toBe(false);
      expect(isAllowedOrigin('https://egin-frontend.workers.dev.evil.com', [])).toBe(false);
    });
  });
});
