import { parseEnvNumber } from './utils/env.util';

export const THROTTLE_TTL_MS = 60_000;
/** Requests per minute per client for every route. */
export const DEFAULT_LIMIT = parseEnvNumber(process.env.THROTTLE_LIMIT, 120);
/** Stricter budget for credential/OTP endpoints. */
export const AUTH_LIMIT = parseEnvNumber(process.env.THROTTLE_AUTH_LIMIT, 10);

export const AUTH_THROTTLE = { default: { limit: AUTH_LIMIT, ttl: THROTTLE_TTL_MS } };
