import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceLabel,clearExpiredPresence,type PeerPresence} from '../src/features/chat/presence.ts';
const now=new Date(2026,9,14,15,30),peer:PeerPresence={user:{id:'peer',name:'Алия'},visible:true,online:false,lastSeen:new Date(2026,9,14,15,25).toISOString()};
test('presence uses verified visibility and bounds online by server lease',()=>{
 assert.equal(presenceLabel({...peer,online:true,onlineUntil:new Date(+now+10000).toISOString()},now),'В сети');
 assert.equal(presenceLabel({...peer,online:true,onlineUntil:new Date(+now-1).toISOString()},now),'Был(а) 5 минут назад');
 assert.equal(presenceLabel({...peer,visible:false,online:true,status:'recently'},now),'Был(а) недавно');
 assert.equal(presenceLabel({...peer,visible:false,online:true,status:'hidden'},now),'Время активности скрыто');
 assert.equal(presenceLabel(undefined,now),'Личная переписка');
});
test('last seen formats Russian minutes, today, yesterday and older dates',()=>{
 for(const[n,word]of [[1,'минуту'],[2,'минуты'],[5,'минут'],[11,'минут'],[21,'минуту'],[22,'минуты'],[25,'минут']] as const)assert.equal(presenceLabel({...peer,lastSeen:new Date(+now-n*60000).toISOString()},now),`Был(а) ${n} ${word} назад`);
 assert.equal(presenceLabel({...peer,lastSeen:new Date(+now-30000).toISOString()},now),'Был(а) только что');
 assert.equal(presenceLabel({...peer,lastSeen:new Date(2026,9,14,13,10).toISOString()},now),'Был(а) сегодня в 13:10');
 assert.equal(presenceLabel({...peer,lastSeen:new Date(2026,9,13,20,15).toISOString()},now),'Был(а) вчера в 20:15');
 assert.match(presenceLabel({...peer,lastSeen:new Date(2025,5,1,10,0).toISOString()},now),/2025/);
 assert.equal(presenceLabel({...peer,lastSeen:'invalid'},now),'Личная переписка');
});
test('expired peers immediately lose online while valid leases retain identity',()=>{
 const expired={...peer,online:true,onlineUntil:new Date(+now-1).toISOString()},valid={...peer,online:true,onlineUntil:new Date(+now+1).toISOString()};
 const next=clearExpiredPresence([expired,valid],+now);assert.equal(next[0].online,false);assert.equal(next[0].status,'offline');assert.equal(next[1],valid);
});
