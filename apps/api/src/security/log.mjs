// Database/HTTP error messages may contain values, URLs or server diagnostics.
// Production logs retain a stable operation and bounded code, never the raw
// message, stack, request, body, connection string or nested cause.
const codes = new Set(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOENT','ENOTFOUND','EACCES','EPIPE','ERR_SQLITE_ERROR',
  '28000','28P01','23505','23503','23514','22P02','22003','42P01','42703','42501','40P01','40001','53300','53400','57014','57P01','EGIN_DB_ROLE','EGIN_DB_MODE','EGIN_DB_SCHEMA']);
const events = new Set(['Chat database','Chat realtime','Chat cleanup','Chat initialization','Chat push','Chat deleted files','Chat disconnect',
  'News update failed','Market seed failed','Platform database','Platform initialization','Billing cleanup',
  'Market semantic search unavailable; lexical search active','Market initialization failed','Market database connection',
  'Market request failed','EGIN One simulation','Trade maintenance','Trade initialization']);
export function safeDiagnostic(event, error) {
  return { event: events.has(event) ? event : 'Application error', code:codes.has(error?.code)?error.code:'unclassified',
    ...(Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?{status:error.status}:{}) };
}
export function safeLog(event, error) { console.error(JSON.stringify(safeDiagnostic(event,error))); }
