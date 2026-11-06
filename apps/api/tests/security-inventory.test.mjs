import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../src/server.mjs';
import { catalog } from '../src/reference.mjs';

test('every documented cookie-protected API route rejects anonymous requests with real PostgreSQL available',{skip:!process.env.MARKET_TEST_DATABASE_URL},async()=>{
  const root=new Pool({connectionString:process.env.MARKET_TEST_DATABASE_URL}),schema='security_inventory_'+randomUUID().replaceAll('-','');
  await root.query(`CREATE SCHEMA ${schema}`);
  const url=new URL(process.env.MARKET_TEST_DATABASE_URL);url.searchParams.set('options',`-c search_path=${schema},public`);
  const previous={market:process.env.MARKET_DATABASE_URL,chat:process.env.CHAT_DATABASE_URL};
  process.env.MARKET_DATABASE_URL=url.href;process.env.CHAT_DATABASE_URL=url.href;
  const dataDir=mkdtempSync(join(tmpdir(),'egin-route-audit-')),service=createApp({dataDir,origins:['http://localhost'],portalOrigin:'http://portal.localhost'});
  const server=service.app.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    for(const family of ['market','platform','chat']){
      const response=await fetch(base+'/api/'+family+'/health');
      assert.equal(response.status,200,`${family} must be available; a 503 is not authentication evidence`);
    }
    const protectedRoutes=catalog.filter(item=>['app','portal'].includes(item.auth));
    assert.ok(protectedRoutes.length>150,'inventory must include all protected domain families');
    const failures=[];
    for(const route of protectedRoutes){
      const path=route.path.replace(/\{[^}]+\}/g,'00000000-0000-4000-8000-000000000001');
      const response=await fetch(base+path,{method:route.method,headers:{'X-EGIN':'1','Content-Type':'application/json'},...(!['GET','HEAD'].includes(route.method)?{body:'{}'}:{}),redirect:'manual',signal:AbortSignal.timeout(10000)});
      // Logout is deliberately idempotent, including an already expired session.
      // It must only clear the caller's cookie and return the empty success marker.
      if(route.method==='POST'&&['/api/logout','/api/developer/logout'].includes(route.path)){
        assert.equal(response.status,200);assert.deepEqual(await response.json(),{ok:true});
        assert.match(response.headers.get('set-cookie')||'',/Max-Age=0/i);
        continue;
      }
      if(![401,403].includes(response.status))failures.push({method:route.method,path:route.path,status:response.status});
      await response.arrayBuffer();
    }
    assert.deepEqual(failures,[],'anonymous requests must fail before returning domain data or writing it');
    console.log(`Protected route inventory: ${protectedRoutes.length-2} reject anonymous requests; 2 idempotent logout routes clear cookies without returning data`);
  }finally{
    await new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});await service.close();service.db.close();
    for(const [name,key] of [['MARKET_DATABASE_URL','market'],['CHAT_DATABASE_URL','chat']]){if(previous[key]===undefined)delete process.env[name];else process.env[name]=previous[key];}
    await root.query(`DROP SCHEMA ${schema} CASCADE`);await root.end();rmSync(dataDir,{recursive:true,force:true});
  }
});
