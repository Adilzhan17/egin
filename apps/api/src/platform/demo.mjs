import {createHash} from 'node:crypto';
import {fail,fields} from './validation.mjs';
import {seedDemoScenario} from './demo-seed.mjs';

/** Demo tenants can interact only with their own demonstration tenant. */
export async function assertSameWorld(c,first,second,user){
  const rows=(await c.query('SELECT id,demo_owner_id FROM business_organizations WHERE id=ANY($1::uuid[])',[[first,second]])).rows;
  const a=rows.find(r=>r.id===first),b=rows.find(r=>r.id===second);
  if(!a||!b)throw fail(404,'Организация недоступна');
  if(a.demo_owner_id&&a.demo_owner_id!==user||b.demo_owner_id&&b.demo_owner_id!==user)throw fail(404,'Организация недоступна');
  if(a.demo_owner_id||b.demo_owner_id){if(a.demo_owner_id!==user||b.demo_owner_id!==user)throw fail(403,'Демо-сценарий нельзя объединять с реальными организациями или чужим демо');return true;}
  return false;
}
export function installDemo({router,service:s,db,wrap}){
  async function snapshot(user){const row=(await s.pool.query('SELECT manifest FROM platform_demo_scenarios WHERE owner_id=$1',[user])).rows[0];if(!row)return{isDemo:false};const organizations=(await s.pool.query('SELECT o.*,m.role FROM business_organizations o JOIN business_members m ON m.organization_id=o.id AND m.user_id=$1 WHERE o.demo_owner_id=$1 ORDER BY o.created_at,o.id',[user])).rows.map(r=>({id:r.id,name:r.name,kind:r.kind,ownerId:r.owner_id,role:r.role,isDemo:true,publicProfile:r.public_profile,privateProfile:r.private_profile,verificationStatus:r.verification_status,version:r.version,createdAt:r.created_at}));return{isDemo:true,organizations,scenario:row.manifest};}
  router.get('/demo',wrap(async(req,res)=>res.json(await snapshot(req.user.id))));
  router.post('/demo',wrap(async(req,res)=>{
    fields(req.body||{},[]);
    if(!s.demoTrade||!await s.demoTrade.ready)throw fail(503,'Демонстрация временно недоступна');
    await s.requireFeature(s.pool,req.user.id,'trade.enabled');
    const user=req.user.id,prefix='demo:'+createHash('sha256').update(user).digest('hex').slice(0,24)+':';
    const identities=['seller','buyer','partner'].map((role,i)=>({id:prefix+role,name:['ДЕМО · Айдар, фермер','ДЕМО · Алия, закупщик','ДЕМО · Данияр, перевозчик'][i]}));
    // Profiles have no recovery token, passkey or session. SQLite rows are deterministic;
    // a retried PostgreSQL transaction reuses them without manufacturing credentials.
    const hasCreated=db.prepare('PRAGMA table_info(users)').all().some(v=>v.name==='created');
    for(const v of identities)db.prepare(hasCreated?'INSERT OR IGNORE INTO users(id,name,created) VALUES(?,?,?)':'INSERT OR IGNORE INTO users(id,name) VALUES(?,?)').run(...(hasCreated?[v.id,v.name,Date.now()]:[v.id,v.name]));
    const cleanup=[];try{await s.transaction(async c=>{
      await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['egin-demo:'+user]);
      if((await c.query('SELECT 1 FROM platform_demo_scenarios WHERE owner_id=$1',[user])).rowCount)return;
      const manifest=await seedDemoScenario(c,{user,identities,ctx:s.demoTrade.ctx,chat:s.demoTrade.chat,dataDir:s.demoTrade.dataDir,cleanup});
      await c.query('INSERT INTO platform_demo_scenarios(owner_id,manifest) VALUES($1,$2)',[user,manifest]);
      await s.audit(c,user,'demo.created','organization',manifest.sellerOrganizationId,{isDemo:true});
    });}catch(e){await Promise.allSettled(cleanup.map(fn=>fn()));throw e;}
    res.status(201).json(await snapshot(user));
  }));
}
