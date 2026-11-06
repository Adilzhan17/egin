const assert=require('node:assert/strict');
const origin=process.env.EGIN_URL||'http://localhost:4934',portal=process.env.EGIN_PORTAL_URL||'http://localhost:4938';
for(const url of [origin,portal])if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('This proxy test is for local CI containers only');
async function check(url,{status=200,https=false}={}){
 const response=await fetch(url,{headers:https?{'X-Forwarded-Proto':'https'}:{},signal:AbortSignal.timeout(10000)});
 assert.equal(response.status,status,url);
 const h=response.headers;
 assert.ok(h.get('x-content-type-options').split(',').every(x=>x.trim()==='nosniff'));
 assert.ok(h.get('x-frame-options').split(',').every(x=>x.trim()==='DENY'));
 assert.ok(h.get('referrer-policy').includes('strict-origin-when-cross-origin'));
 assert.ok(h.get('permissions-policy').includes('payment=()'));
 assert.match(h.get('content-security-policy'),/frame-ancestors 'none'/);
 if(https)assert.match(h.get('strict-transport-security'),/max-age=31536000/);
 else assert.equal(h.get('strict-transport-security'),null);
 assert.equal(h.get('x-powered-by'),null);
 return response.text();
}
(async()=>{
 for(const site of [origin,portal]){
  const html=await check(site);await check(site,{https:true});
  const script=html.match(/<script[^>]*src="([^"]+)"/);assert.ok(script,'built module must exist');
  await check(new URL(script[1],site),{https:true});
 }
 await check(origin+'/api/health',{https:true});
 await check(origin+'/.well-known/security-audit-missing',{https:true,status:404});
 console.log('Production Nginx HTML, immutable assets, API, errors and forwarded HTTPS headers PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
