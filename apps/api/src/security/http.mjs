// Only explicitly configured proxy hops may supply client addresses. Express
// validates CIDR/range syntax and walks X-Forwarded-For from the socket inward.
export function configureProxy(app, value = process.env.TRUST_PROXY || '') {
  if (value === 'false') value = '';
  if (value === 'true' || /^\d+$/.test(value)) throw new Error('TRUST_PROXY must name trusted networks, not all clients or a hop count');
  app.set('trust proxy', value ? value.split(',').map(x => x.trim()).filter(Boolean) : false);
}

export function validateProductionConfig({ origins, portalOrigin, rpID }, production = process.env.NODE_ENV === 'production', allowLoopbackHttp = process.env.ALLOW_LOOPBACK_HTTP === '1') {
  if (!production) return;
  // Browser CI uses the production image on localhost. This opt-in permits
  // only an entirely loopback configuration, never a public HTTP deployment.
  const loopbackOrigin = value => {
    try { const url = new URL(value); return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.origin === value && !url.username && !url.password; }
    catch { return false; }
  };
  if (allowLoopbackHttp && origins.length && [...origins, portalOrigin].every(loopbackOrigin) && rpID === 'localhost' && origins.every(value => new URL(value).hostname === rpID)) return;
  const validOrigin = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.origin === value && !url.username && !url.password; }
    catch { return false; }
  };
  if (!origins.length || !origins.every(validOrigin) || !validOrigin(portalOrigin))
    throw new Error('Production requires explicit HTTPS application and portal origins');
  if (!rpID || rpID === 'localhost' || !origins.every(origin => { const host = new URL(origin).hostname; return host === rpID || host.endsWith('.' + rpID); }))
    throw new Error('Production RP_ID must match the configured application origins');
}

export function securityHeaders(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=()',
    // API responses are data, including uploaded documents; they never need
    // script execution. The SPA has a separate policy at the static gateway.
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  });
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
  next();
}
