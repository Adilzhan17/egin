import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { hashPassword, verifyPassword, isLegacyPassword } from './security/passwords.mjs';
import { revokeAccountAccess } from './security/revoke.mjs';
const emailKey = value => createHash('sha256').update(value).digest('hex');
const normalizeEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validEmail = value => value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(value) && !value.includes('..');
const validPassword = value => typeof value === 'string' && Array.from(value).length >= 15 && Buffer.byteLength(value, 'utf8') <= 1024;

export function installPasswordAuth({app,db,wrap,session,required,assertCurrentSession}) {
  db.exec(`CREATE TABLE IF NOT EXISTS password_accounts(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL UNIQUE,salt BLOB NOT NULL,digest BLOB NOT NULL,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS password_attempts(email_key TEXT PRIMARY KEY, failures INTEGER NOT NULL, until INTEGER NOT NULL);`);
  const fail=(status,message)=>Object.assign(new Error(message),{status});
  const recoveryToken=()=>randomBytes(32).toString('base64url');
  app.get('/api/auth/password',required,(req,res)=>{const account=db.prepare('SELECT email FROM password_accounts WHERE user_id=?').get(req.user.id);res.json({email:account?.email||null,email_verified:false});});
  app.post('/api/auth/password/attach',required,wrap(async(req,res)=>{
    const email=normalizeEmail(req.body.email),code=typeof req.body.code==='string'?req.body.code.trim():'';
    if(!validEmail(email))throw fail(400,'Введите корректный email');
    if(!validPassword(req.body.password))throw fail(400,'Пароль должен содержать не менее 15 символов');
    if(!code||code.length>100)throw fail(400,'Проверьте код восстановления');
    const {salt,digest}=await hashPassword(req.body.password),next=recoveryToken();
    assertCurrentSession(req);
    db.exec('BEGIN IMMEDIATE');
    try {
      const user=db.prepare('SELECT id FROM users WHERE id=? AND recovery=?').get(req.user.id,createHash('sha256').update(code).digest('hex'));
      if(!user)throw fail(400,'Проверьте код восстановления');
      if(db.prepare('SELECT 1 FROM password_accounts WHERE email=? OR user_id=?').get(email,user.id))throw fail(409,'Email или вход по паролю уже используется');
      db.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?)').run(user.id,email,salt,digest,Date.now());
      db.prepare('UPDATE users SET recovery=? WHERE id=?').run(createHash('sha256').update(next).digest('hex'),user.id);
      db.exec('COMMIT');res.status(201).json({email,email_verified:false,recovery:next});
    }catch(e){db.exec('ROLLBACK');throw e;}
  }));
  app.post('/api/auth/password/register',wrap(async(req,res)=>{
    if(req.user)throw fail(409,'Сначала выйдите из текущего профиля');
    const email=normalizeEmail(req.body.email),name=typeof req.body.name==='string'?req.body.name.trim():'';
    if(!name||name.length>80)throw fail(400,'Введите имя длиной до 80 символов');
    if(!validEmail(email))throw fail(400,'Введите корректный email');
    if(!validPassword(req.body.password))throw fail(400,'Пароль должен содержать не менее 15 символов');
    const {salt,digest}=await hashPassword(req.body.password),id=randomUUID(),recovery=recoveryToken();
    db.exec('BEGIN IMMEDIATE');
    try {
      if(db.prepare('SELECT 1 FROM password_accounts WHERE email=?').get(email))throw fail(409,'Не удалось создать профиль. Попробуйте войти или используйте другой email.');
      db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,name,createHash('sha256').update(recovery).digest('hex'),Date.now());
      db.prepare('INSERT INTO password_accounts VALUES(?,?,?,?,?)').run(id,email,salt,digest,Date.now());
      db.exec('COMMIT');
    } catch(e) {db.exec('ROLLBACK');throw e;}
    session(res,id,'password');res.status(201).json({user:{id,name},recovery,email_verified:false});
  }));
  async function verifyAccount(email, input) {
    const password=typeof input==='string'&&Buffer.byteLength(input,'utf8')<=1024?input:'';
    if(email.length>254)throw fail(400,'Неверный email или пароль');
    const key=emailKey(email),now=Date.now(),attempt=db.prepare('SELECT * FROM password_attempts WHERE email_key=?').get(key);
    if(attempt&&attempt.until>now&&attempt.failures>=8)throw fail(429,'Слишком много попыток. Повторите позже или используйте код восстановления.');
    // Reserve the attempt before asynchronous hashing so concurrent requests
    // cannot all pass the same account lockout check.
    db.prepare('DELETE FROM password_attempts WHERE until<=?').run(now);
    db.prepare(`INSERT INTO password_attempts VALUES(?,1,?) ON CONFLICT(email_key) DO UPDATE SET failures=failures+1`).run(key,now+15*60*1000);
    const account=db.prepare('SELECT p.*,u.name,u.recovery FROM password_accounts p JOIN users u ON u.id=p.user_id WHERE p.email=?').get(email);
    if(!await verifyPassword(password,account)) throw fail(401,'Неверный email или пароль');
    const upgraded=isLegacyPassword(account)?await hashPassword(password):null;
    // A reset/reattachment may have completed while the KDF was running. Never
    // issue a session for the superseded credential, including after recovery.
    const fresh=db.prepare('SELECT p.digest,p.salt,u.recovery FROM password_accounts p JOIN users u ON u.id=p.user_id WHERE p.user_id=?').get(account.user_id);
    if(!fresh || fresh.recovery!==account.recovery || !Buffer.from(fresh.digest).equals(Buffer.from(account.digest)) || !Buffer.from(fresh.salt).equals(Buffer.from(account.salt))) throw fail(401,'Данные входа изменились. Войдите снова.');
    if(upgraded) db.prepare('UPDATE password_accounts SET salt=?,digest=? WHERE user_id=?').run(upgraded.salt,upgraded.digest,account.user_id);
    db.prepare('DELETE FROM password_attempts WHERE email_key=?').run(key);
    return account;
  }
  app.post('/api/auth/password/login',wrap(async(req,res)=>{
    const account=await verifyAccount(normalizeEmail(req.body.email),req.body.password);
    session(res,account.user_id,'password');res.json({user:{id:account.user_id,name:account.name},email_verified:false});
  }));
  app.post('/api/auth/password/reauth',required,wrap(async(req,res)=>{
    const email=db.prepare('SELECT email FROM password_accounts WHERE user_id=?').get(req.user.id)?.email;
    if(!email)throw fail(409,'Подтвердите личность существующим passkey.');
    const account=await verifyAccount(email,req.body.password);
    assertCurrentSession(req);
    session(res,account.user_id,'password');res.json({ok:true});
  }));
  app.post('/api/auth/password/reset',wrap(async(req,res)=>{
    const email=normalizeEmail(req.body.email),code=typeof req.body.code==='string'?req.body.code.trim():'';
    if(!validEmail(email)||!code||code.length>100)throw fail(400,'Не удалось восстановить доступ. Проверьте email и код.');
    if(!validPassword(req.body.password))throw fail(400,'Пароль должен содержать не менее 15 символов');
    const {salt,digest}=await hashPassword(req.body.password),next=recoveryToken();
    db.exec('BEGIN IMMEDIATE');
    try {
      const user=db.prepare('SELECT u.id,u.name FROM users u JOIN password_accounts p ON p.user_id=u.id WHERE p.email=? AND u.recovery=?').get(email,createHash('sha256').update(code).digest('hex'));
      if(!user)throw fail(400,'Не удалось восстановить доступ. Проверьте email и код.');
      db.prepare('UPDATE password_accounts SET salt=?,digest=? WHERE user_id=?').run(salt,digest,user.id);
      db.prepare('UPDATE users SET recovery=? WHERE id=?').run(createHash('sha256').update(next).digest('hex'),user.id);
      revokeAccountAccess(db,user.id);
      db.prepare('DELETE FROM password_attempts WHERE email_key=?').run(emailKey(email));
      db.exec('COMMIT');session(res,user.id);res.json({user:{id:user.id,name:user.name},recovery:next,email_verified:false});
    } catch(e){db.exec('ROLLBACK');throw e;}
  }));
}
