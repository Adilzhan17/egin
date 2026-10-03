"""Accept a JSON array exported from the original Nest users table on stdin.
Run inside CORE; no secrets printed, original database never modified.
"""
import json,sys
from app import db
people=json.load(sys.stdin)
db.pool.open();db.pool.wait()
with db.connection() as c:
    for u in people:
        c.execute('INSERT INTO users(id,email,phone,password_hash,created_at) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(id) DO NOTHING',(u['id'],u.get('email'),u.get('phone'),u['passwordHash'],u['createdAt']))
        c.execute('INSERT INTO profiles(user_id,name,region,district,legacy_role,onboarded) VALUES(%s,%s,%s,%s,%s,false) ON CONFLICT DO NOTHING',(u['id'],u['fullName'],u.get('region'),u.get('district'),u.get('role')))
print('Legacy accounts preserved:',len(people))
db.pool.close()
