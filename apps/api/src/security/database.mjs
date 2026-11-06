import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

// Only the separate deployment job performs DDL in production. Hashes are
// append-only so additive upgrades retain compatibility with earlier releases.
const sources={market:['market/migrations.mjs','market/categories.mjs'],search:['market/search.mjs'],
  platform:['platform/migrations.mjs'],chat:['chat/migrations.mjs','chat/messenger.mjs','chat/presence.mjs'],trade:['trade/migrations.mjs']};
export async function schemaDigest(component){
  if(!sources[component])throw Error('Unknown database component');
  const hash=createHash('sha256');
  for(const path of sources[component])hash.update(path+'\0').update((await readFile(new URL('../'+path,import.meta.url),'utf8')).replaceAll('\r\n','\n'));
  return hash.digest('hex');
}
export async function assertRuntimeRole(pool){
  const {rows:[r]}=await pool.query(`SELECT r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,r.rolreplication,
    has_schema_privilege(current_user,current_schema(),'CREATE') schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') database_create,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) membership,
    EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=current_schema()::regnamespace AND relowner=r.oid) owns_tables
    FROM pg_roles r WHERE rolname=current_user`);
  if(!r||Object.values(r).some(Boolean))throw Object.assign(Error('Database runtime role has elevated privileges'),{code:'EGIN_DB_ROLE'});
}
export async function ensureDatabaseSchema(pool,component,migrate,{mode=process.env.EGIN_DATABASE_MODE||(process.env.NODE_ENV==='production'?'verify':'auto')}={}){
  if(mode==='auto'&&process.env.NODE_ENV!=='production')return migrate(pool);
  if(mode!=='verify')throw Object.assign(Error('Invalid database runtime mode'),{code:'EGIN_DB_MODE'});
  await assertRuntimeRole(pool);
  const result=await pool.query('SELECT 1 FROM egin_schema_capabilities WHERE component=$1 AND digest=$2',[component,await schemaDigest(component)]);
  if(!result.rowCount)throw Object.assign(Error('Separate database migration required'),{code:'EGIN_DB_SCHEMA'});
}
