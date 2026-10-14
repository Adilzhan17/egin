import { useLayoutEffect, useRef } from 'react';
import { animateChat, motion } from './motion';
import type { Message } from './types';

/** A server acknowledgement changes the receipt/id, never the bubble identity. */
export const messageMotionKey=(message:Pick<Message,'sender'|'clientId'|'id'>)=>`${message.sender.id}:${message.clientId||message.id}`;
type Snapshot={height:number;version:string};
/** Initial history and prepended pages are stationary. Only unseen tail messages
 * enter; acknowledgements, receipt updates and re-fetches reuse the same nodes. */
export function useMessageMotion(ref:{current:HTMLElement|null},messages:unknown,pending:unknown,loading:boolean){
 const seen=useRef(new Set<string>()),heights=useRef(new Map<string,Snapshot>()),highest=useRef(0),initialized=useRef(false);
 const animations=useRef(new Map<Element,Animation>());
 useLayoutEffect(()=>{
  const root=ref.current;if(!root||loading)return;
  // Cancellation releases our references to removed/private DOM immediately.
  for(const [node,animation] of animations.current)if(!root.contains(node)){animation.cancel();animations.current.delete(node);}
  const viewport=root.parentElement?.getBoundingClientRect();
  const nodes=[...root.querySelectorAll<HTMLElement>('[data-motion-key]')];
  const next=new Map<string,Snapshot>();let high=highest.current;
  for(const node of nodes){
   const key=node.dataset.motionKey!,sequence=Number(node.dataset.motionSequence||0),version=node.dataset.layoutVersion||'';
   const previous=heights.current.get(key),fresh=!seen.current.has(key),local=node.dataset.motionLocal==='true';
   const changed=Boolean(previous&&previous.version!==version);
   if(changed){animations.current.get(node)?.cancel();animations.current.delete(node);}
   const rect=node.getBoundingClientRect();next.set(key,{height:changed||!previous?rect.height:previous.height,version});seen.current.add(key);high=Math.max(high,sequence);
   if(!viewport||rect.bottom<viewport.top||rect.top>viewport.bottom)continue;
   let animation:Animation|null=null;
   if(fresh&&((initialized.current&&sequence>highest.current)||local)){
    animation=animateChat(node,[{opacity:0,transform:'translate3d(0,6px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:motion.normal,easing:motion.spring});
   }else if(changed&&previous&&Math.abs(previous.height-rect.height)>1){
    // Animate the space, not a scaled text surface; ResizeObserver keeps the
    // reader's anchor through every frame. No historical content is retained.
    animation=animateChat(node,[{height:`${previous.height}px`,overflow:'clip'},{height:`${rect.height}px`,overflow:'clip'}],{duration:motion.normal});
   }
   if(animation){animations.current.set(node,animation);void animation.finished.then(()=>{if(animations.current.get(node)===animation)animations.current.delete(node);}).catch(()=>{});}
  }
  heights.current=next;highest.current=high;initialized.current=true;
 },[ref,messages,pending,loading]);
 useLayoutEffect(()=>()=>{animations.current.forEach(animation=>animation.cancel());animations.current.clear();},[]);
}
