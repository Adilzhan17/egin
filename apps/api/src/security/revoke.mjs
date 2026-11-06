// Called inside the account-recovery transaction. A recovered account must not
// remain accessible through another browser, developer portal, API key or an
// already-approved QR login. No raw credentials are read or logged here.
export function revokeAccountAccess(db, userId) {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM developer_sessions WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM challenges WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM qr_logins WHERE user_id=?').run(userId);
  db.prepare('UPDATE api_keys SET revoked=? WHERE user_id=? AND revoked IS NULL').run(Date.now(), userId);
}
