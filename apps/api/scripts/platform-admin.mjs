import {Pool} from 'pg';
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {migratePlatform} from '../src/platform/migrations.mjs';
const [action,id]=process.argv.slice(2);
if(!['grant','revoke','list'].includes(action)||action!=='list'&&!/^[a-zA-Z0-9_-]{1,100}$/.test(id||'')){console.error('Usage: node scripts/platform-admin.mjs grant|revoke USER_ID; node scripts/platform-admin.mjs list');process.exit(1);}
const pool=new Pool({connectionString:process.env.MARKET_DATABASE_URL});
try{
 await migratePlatform(pool);
 if(action==='list')console.log(JSON.stringify((await pool.query('SELECT user_id,created_at,granted_by FROM platform_admins ORDER BY created_at')).rows,null,2));
 else{
  const db=new DatabaseSync(resolve(process.env.DATA_DIR||'/data','egin.sqlite'));
  const user=db.prepare('SELECT id,name FROM users WHERE id=?').get(id);db.close();if(!user)throw Error('Account does not exist in this environment');
  const c=await pool.connect();try{await c.query('BEGIN');if(action==='grant')await c.query("INSERT INTO platform_admins(user_id,granted_by) VALUES($1,'server-operator') ON CONFLICT DO NOTHING",[id]);else await c.query('DELETE FROM platform_admins WHERE user_id=$1',[id]);await c.query("INSERT INTO platform_audit(actor_id,action,entity_type,entity_id) VALUES('server-operator',$1,'admin',$2)",['admin.'+action,id]);await c.query('COMMIT');console.log(JSON.stringify({action,userId:user.id,name:user.name}));}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
 }
}finally{await pool.end();}
