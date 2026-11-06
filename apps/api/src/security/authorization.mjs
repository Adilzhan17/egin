import { AsyncLocalStorage } from 'node:async_hooks';
import { isFresh } from './sessions.mjs';

// Preserve the authenticated request across async database operations, without
// passing a caller-controlled assurance flag through business payloads.
export function createAuthorization(readSession) {
  const context = new AsyncLocalStorage();
  function requireMfa(userId) {
    const req = context.getStore();
    const active = req && readSession(req.sid);
    if (!active || active.user.id !== userId) throw Object.assign(new Error('Сессия истекла. Войдите снова.'), { status:401 });
    if (!isFresh(active.security, { mfa:true })) throw Object.assign(new Error('Для этой роли нужен вход с passkey. Подтвердите личность в разделе «Настройки → Безопасность».'), { status:403, code:'mfa_required' });
  }
  return { requireMfa, middleware:(req,res,next)=>context.run(req,next) };
}
