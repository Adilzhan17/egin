import {Pool} from 'pg';
import {pathToFileURL} from 'node:url';
import {migrateMarket} from '../src/market/migrations.mjs';
import {migrateSearch} from '../src/market/search.mjs';
import {migratePlatform} from '../src/platform/migrations.mjs';
import {migrateChat} from '../src/chat/migrations.mjs';
import {migrateMessenger} from '../src/chat/messenger.mjs';
import {migratePresence} from '../src/chat/presence.mjs';
import {migrateTrade} from '../src/trade/migrations.mjs';
import {schemaDigest,assertRuntimeRole} from '../src/security/database.mjs';

const identifier=value=>{if(!/^[a-z][a-z0-9_]{0,62}$/.test(value))throw Error('Invalid database identifier');return '"'+value+'"';};
export async function migrateDatabase(pool,{runtimeRole='egin_runtime',password}={}){
  const role=identifier(runtimeRole);
  if(typeof password!=='string'||password.length<32||password.length>128)throw Error('Invalid database credential configuration');
  const c=await pool.connect();
  try{
    await c.query("SELECT pg_advisory_lock(hashtext('egin-deployment-migrations'))");
    // Preserve the bootstrap owner and existing objects; never reassign another
    // database's objects or put the privileged credential in the API container.
    await migrateMarket(pool);await migrateSearch(pool);await migratePlatform(pool);
    await migrateChat(pool);await migrateMessenger(pool);await migratePresence(pool);await migrateTrade(pool);
    await c.query('BEGIN');
    const {rows:[{schema,database}]}=await c.query('SELECT current_schema() schema,current_database() database');
    const schemaSql=identifier(schema),dbSql=identifier(database);
    if(!(await c.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[runtimeRole])).rowCount)await c.query(`CREATE ROLE ${role} LOGIN`);
    await c.query(`ALTER ROLE ${role} NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT`);
    // PostgreSQL formats its own literal; no external text is concatenated into SQL.
    const {rows:[{sql}]}=await c.query('SELECT format(\'ALTER ROLE %I PASSWORD %L\',$1::text,$2::text) sql',[runtimeRole,password]);
    await c.query(sql);
    await c.query(`REVOKE CREATE ON SCHEMA ${schemaSql} FROM PUBLIC,${role};
      REVOKE ALL ON DATABASE ${dbSql} FROM ${role};GRANT CONNECT ON DATABASE ${dbSql} TO ${role};
      GRANT USAGE ON SCHEMA ${schemaSql} TO ${role};
      CREATE TABLE IF NOT EXISTS egin_schema_capabilities(component text NOT NULL,digest text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(component,digest));
      REVOKE ALL ON ALL TABLES IN SCHEMA ${schemaSql} FROM ${role};
      REVOKE ALL ON ALL SEQUENCES IN SCHEMA ${schemaSql} FROM ${role};`);
    const tables=(await c.query("SELECT tablename FROM pg_tables WHERE schemaname=$1",[schema])).rows;
    for(const {tablename} of tables){
      const permissions=tablename.endsWith('_migrations')||tablename==='egin_schema_capabilities'?'SELECT':'SELECT,INSERT,UPDATE,DELETE';
      await c.query(`GRANT ${permissions} ON ${schemaSql}.${identifier(tablename)} TO ${role}`);
    }
    await c.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA ${schemaSql} TO ${role}`);
    for(const component of ['market','search','platform','chat','trade'])await c.query('INSERT INTO egin_schema_capabilities(component,digest) VALUES($1,$2) ON CONFLICT DO NOTHING',[component,await schemaDigest(component)]);
    await c.query(`SET LOCAL ROLE ${role}`);await assertRuntimeRole(c);await c.query('RESET ROLE');
    await c.query('COMMIT');
  }catch(error){await c.query('ROLLBACK');throw error;}
  finally{await c.query("SELECT pg_advisory_unlock(hashtext('egin-deployment-migrations'))");c.release();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const pool=new Pool({connectionString:process.env.MARKET_DATABASE_URL,max:2,connectionTimeoutMillis:10000});
  try{await migrateDatabase(pool,{password:process.env.EGIN_RUNTIME_PASSWORD});console.log('Database migrations and runtime permissions verified');}
  catch{console.error('Database migration failed; no traffic should be switched. Review schema and role configuration.');process.exitCode=1;}
  finally{await pool.end();}
}
