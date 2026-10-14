export type PresenceAudience='all'|'interlocutors'|'nobody';
export type PeerPresence={user:{id:string;name:string};visible:boolean;online:boolean;lastSeen:string|null;onlineUntil?:string|null;status?:'online'|'offline'|'recently'|'hidden'};
let clientId:string|undefined;
/** A tab identifier, never an authentication credential. Shared with its SSE connection. */
export function getPresenceClientId(){return clientId??=crypto.randomUUID();}
export function presenceLabel(peer:PeerPresence|undefined,now:Date|number=new Date()):string{
 if(!peer)return 'Личная переписка';
 if(!peer.visible)return peer.status==='recently'?'Был(а) недавно':'Время активности скрыто';
 const time=typeof now==='number'?new Date(now):now;
 const expires=peer.onlineUntil?Date.parse(peer.onlineUntil):null;
 if(peer.online&&(expires===null||Number.isFinite(expires)&&expires>+time))return 'В сети';
 const seen=peer.lastSeen?new Date(peer.lastSeen):null;
 if(!seen||!Number.isFinite(+seen))return 'Личная переписка';
 const elapsed=Math.max(0,+time-+seen),minutes=Math.floor(elapsed/60000);
 if(minutes<1)return 'Был(а) только что';
 if(minutes<60){const ending=minutes%10===1&&minutes%100!==11?'минуту':minutes%10>=2&&minutes%10<=4&&!(minutes%100>=12&&minutes%100<=14)?'минуты':'минут';return `Был(а) ${minutes} ${ending} назад`;}
 const clock=seen.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
 if(seen.toDateString()===time.toDateString())return `Был(а) сегодня в ${clock}`;
 const yesterday=new Date(time);yesterday.setDate(yesterday.getDate()-1);
 if(seen.toDateString()===yesterday.toDateString())return `Был(а) вчера в ${clock}`;
 return `Был(а) ${seen.toLocaleDateString('ru-RU',{day:'numeric',month:'short',...(seen.getFullYear()!==time.getFullYear()?{year:'numeric' as const}:{})})} в ${clock}`;
}
export function clearExpiredPresence(items:PeerPresence[],now=Date.now()):PeerPresence[]{
 if(!items.some(p=>p.online&&p.onlineUntil&&Date.parse(p.onlineUntil)<=now))return items;
 return items.map(p=>p.online&&p.onlineUntil&&Date.parse(p.onlineUntil)<=now?{...p,online:false,status:'offline'}:p);
}
