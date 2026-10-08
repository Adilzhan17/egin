/** Only EGIN login links may navigate out of the scanner. */
export function parseLoginQR(raw: string, currentOrigin: string): URL | null {
  const value = raw.trim();
  if (/^FIDO:/i.test(value)) throw new Error('Это системный QR для passkey. Откройте его обычной камерой телефона. Для сканера EGIN выберите на сайте «Войти по QR с телефона».');
  if (value.length > 2048) throw new Error('QR-код слишком длинный.');
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (!/^#\/auth\/confirm\/[A-Za-z0-9_-]{43}$/.test(url.hash)) return null;
  const trusted = ['https://egin.perricheno.com', 'https://dev-egin.perricheno.com', currentOrigin];
  if (!trusted.includes(url.origin) || url.username || url.password || url.pathname !== '/' || url.search) throw new Error('QR входа ведёт на неизвестный адрес. Откройте новый QR на сайте EGIN.');
  return url;
}
