import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {migrateDatabase} from '../scripts/migrate-database.mjs';
import {migrateMarket} from '../src/market/migrations.mjs';
import {ensureDatabaseSchema,assertRuntimeRole} from '../src/security/database.mjs';
import {createApp} from '../src/server.mjs';

test('separate migration preserves existing data; runtime cannot perform DDL, modify migrations or assume the owner role',
 {skip:!process.env.MARKET_TEST_DATABASE_URL},async()=>{
  const suffix=randomUUID().replaceAll('-',''),database='security_db_'+suffix,role='runtime_'+suffix,password=randomUUID()+randomUUID();
  const root=new Pool({connectionString:process.env.MARKET_TEST_DATABASE_URL});
  await root.query(`CREATE DATABASE ${database}`);
  const url=new URL(process.env.MARKET_TEST_DATABASE_URL);url.pathname='/'+database;url.search='';
  const owner=new Pool({connectionString:url.href,max:3});let runtime,service,server;
  const previous={market:process.env.MARKET_DATABASE_URL,chat:process.env.CHAT_DATABASE_URL,mode:process.env.EGIN_DATABASE_MODE};
  const dir=mkdtempSync(join(tmpdir(),'egin-db-role-'));
  try{
    await migrateMarket(owner);
    await owner.query("INSERT INTO market_geography(code,name,level) VALUES('existing-region','Existing data','region')");
    await migrateDatabase(owner,{runtimeRole:role,password});
    await migrateDatabase(owner,{runtimeRole:role,password});
    url.username=role;url.password=password;runtime=new Pool({connectionString:url.href,max:2});
    await assertRuntimeRole(runtime);
    assert.equal((await runtime.query('SELECT count(*)::int n FROM egin_schema_capabilities')).rows[0].n,5);
    assert.equal((await runtime.query("SELECT name FROM market_geography WHERE code='existing-region'")).rows[0].name,'Existing data');
    await runtime.query("INSERT INTO market_geography(code,name,level) VALUES('new-region','New data','region')");
    await runtime.query("UPDATE market_geography SET name='Changed' WHERE code='new-region'");
    await runtime.query("DELETE FROM market_geography WHERE code='new-region'");
    for(const sql of ["CREATE TABLE forbidden(id int)","ALTER TABLE market_geography ADD COLUMN forbidden int",'DROP TABLE market_geography',
      'DELETE FROM egin_schema_capabilities','DELETE FROM market_migrations','TRUNCATE market_geography','SET ROLE pg_database_owner']){
      await assert.rejects(()=>runtime.query(sql),{code:'42501'},sql);
    }
    await assert.rejects(()=>ensureDatabaseSchema(owner,'market',()=>assert.fail('must not migrate'),{mode:'verify'}),{code:'EGIN_DB_ROLE'});
    await ensureDatabaseSchema(runtime,'market',()=>assert.fail('must not run DDL'),{mode:'verify'});
    await owner.query("DELETE FROM egin_schema_capabilities WHERE component='market'");
    await assert.rejects(()=>ensureDatabaseSchema(runtime,'market',()=>assert.fail('must not migrate'),{mode:'verify'}),{code:'EGIN_DB_SCHEMA'});
    await migrateDatabase(owner,{runtimeRole:role,password});
    process.env.MARKET_DATABASE_URL=url.href;process.env.CHAT_DATABASE_URL=url.href;process.env.EGIN_DATABASE_MODE='verify';
    service=createApp({dataDir:dir,origins:['http://localhost'],portalOrigin:'http://portal.localhost'});
    server=service.app.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`;
    for(const family of ['market','platform','chat'])assert.equal((await fetch(base+'/api/'+family+'/health')).status,200,family);
    // Trade waits for all three migrations and checks auth before domain work.
    assert.equal((await fetch(base+'/api/trade/lots')).status,401);
  }finally{
    if(server)await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await service?.close();service?.db.close();
    for(const [name,key] of [['MARKET_DATABASE_URL','market'],['CHAT_DATABASE_URL','chat'],['EGIN_DATABASE_MODE','mode']]){if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];}
    await runtime?.end();await owner.end();await root.query(`DROP DATABASE ${database}`);
    await root.query(`DROP ROLE IF EXISTS ${role}`);await root.end();rmSync(dir,{recursive:true,force:true});
  }
 });
