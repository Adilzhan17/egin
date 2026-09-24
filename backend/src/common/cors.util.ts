export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://egin.kz',
  'https://egin.perricheno.ru',
  'capacitor://localhost',
  'http://localhost',
];

export const parseAllowedOrigins = (value: string | undefined): string[] =>
  value ? value.split(',').map((o) => o.trim()) : DEFAULT_ALLOWED_ORIGINS;

/**
 * Origins allowed regardless of ALLOWED_ORIGINS: the *.perricheno.ru fleet and the Cloudflare
 * Workers preview deploy (frontend/wrangler.jsonc, worker name "egin-frontend").
 */
const ALWAYS_ALLOWED_PATTERNS = [
  /^https?:\/\/[^/]*\.perricheno\.ru$/,
  /^https:\/\/egin-frontend\.[^/]*\.workers\.dev$/,
];

export const isAllowedOrigin = (origin: string, configuredOrigins: string[]): boolean =>
  configuredOrigins.includes(origin) || ALWAYS_ALLOWED_PATTERNS.some((re) => re.test(origin));
