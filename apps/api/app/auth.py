import hashlib,hmac,os,secrets,time
from collections import defaultdict,deque
from fastapi import HTTPException,Request,Response,Depends
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError,InvalidHashError
from . import db

hasher=PasswordHasher(time_cost=2,memory_cost=19456,parallelism=1)
DUMMY_HASH=hasher.hash('non-user-constant-placeholder')
COOKIE='egin_session'
_buckets=defaultdict(deque)

def rate_limit(key,limit=12,seconds=60):
    now=time.monotonic()
    q=_buckets[key]
    while q and q[0]<now-seconds:q.popleft()
    if len(q)>=limit:raise HTTPException(429,'Слишком много запросов. Повторите позже.',headers={'Retry-After':str(seconds)})
    q.append(now)
    if len(_buckets)>10000:
        for k in list(_buckets):
            if not _buckets[k] or _buckets[k][-1]<now-600:del _buckets[k]

def digest(token):
    return hmac.new(os.environ['SESSION_SECRET'].encode(),token.encode(),hashlib.sha256).hexdigest()

def issue_session(response:Response,user_id):
    token=secrets.token_urlsafe(48)
    db.execute("DELETE FROM sessions WHERE expires_at<now()")
    db.execute("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(%s,%s,now()+interval '14 days')",(digest(token),user_id))
    response.set_cookie(COOKIE,token,httponly=True,secure=os.getenv('COOKIE_SECURE')=='true',samesite='lax',max_age=1209600,path='/')

def current_user(request:Request):
    token=request.cookies.get(COOKIE,'')
    user=db.one('''SELECT u.id,u.email,p.name,p.language,p.region,p.onboarded FROM sessions s JOIN users u ON u.id=s.user_id JOIN profiles p ON p.user_id=u.id WHERE s.token_hash=%s AND s.expires_at>now()''',(digest(token),)) if token else None
    if not user:raise HTTPException(401,'Войдите в аккаунт')
    return user

def verify_password(password,stored):
    if stored.startswith(('$2a$','$2b$','$2y$')):
        # Existing Nest accounts use bcrypt. Upgrade only after a successful login.
        compatible='$2a$'+stored[4:]
        return bool(db.one('SELECT crypt(%s,%s)=%s AS valid',(password,compatible,compatible))['valid'])
    try:return hasher.verify(stored,password)
    except (VerificationError,InvalidHashError):return False

def farm_access(user_id,farm_id,write=False):
    role=db.one('''SELECT om.role FROM farms f JOIN organization_members om ON om.organization_id=f.organization_id WHERE f.id=%s AND om.user_id=%s''',(farm_id,user_id))
    if not role or (write and role['role'] not in ('owner','admin','agronomist')):raise HTTPException(403,'Нет доступа к хозяйству')
    return role['role']

def field_access(user_id,field_id,write=False):
    f=db.one('SELECT farm_id FROM fields WHERE id=%s',(field_id,))
    if not f:raise HTTPException(404,'Поле не найдено')
    farm_access(user_id,f['farm_id'],write)

def conversation_access(user_id,conversation_id):
    if not db.one('SELECT 1 FROM conversation_members WHERE conversation_id=%s AND user_id=%s',(conversation_id,user_id)):
        raise HTTPException(403,'Нет доступа к переписке')
