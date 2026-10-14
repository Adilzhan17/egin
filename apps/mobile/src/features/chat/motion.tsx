import { createContext, useContext, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import './motion.css';

export const motion = { fast:180, normal:240, screen:300, spring:'cubic-bezier(.22,1,.36,1)', ease:'cubic-bezier(.2,.7,.2,1)' } as const;
export const reducedMotion=()=>typeof window==='undefined'||window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function animateChat(node:Element|null,frames:Keyframe[]|PropertyIndexedKeyframes,options:KeyframeAnimationOptions={}):Animation|null {
 if(!node||reducedMotion()||document.hidden||typeof node.animate!=='function')return null;
 const animation=node.animate(frames,{duration:motion.normal,easing:motion.ease,...options});
 // Cancellation is normal on rapid gestures, navigation and unmount.
 const media=window.matchMedia('(prefers-reduced-motion: reduce)'),stop=()=>{if(media.matches||document.hidden)animation.cancel();};media.addEventListener('change',stop);document.addEventListener('visibilitychange',stop);void animation.finished.catch(()=>{}).finally(()=>{media.removeEventListener('change',stop);document.removeEventListener('visibilitychange',stop);});return animation;
}
/** Samples a damped spring; only finite transform/opacity work reaches the compositor. */
export function springFrames(distance=24):Keyframe[]{return Array.from({length:21},(_,i)=>{const t=i/20,p=1-Math.exp(-8*t)*(Math.cos(10*t)+.8*Math.sin(10*t));return{offset:t,opacity:Math.min(1,t*4),transform:`translate3d(0,${i===20?0:distance*(1-p)}px,0) scale(${i===20?1:1-.012*(1-p)})`};});}
type Phase='enter'|'present'|'exit';
const MotionContext=createContext<Phase>('present');
export const useMotionPhase=()=>useContext(MotionContext);
/** Retains one outgoing subtree, with bounded lifetime. Consumers disable interaction
 * and animate their actual root; no layout wrapper or duplicate live screen is added. */
export function ChatPresence({children,identity,duration=motion.normal}:{children:ReactElement|null|false|undefined;identity?:string|null;duration?:number}) {
 const parentPhase=useMotionPhase();
 const child=children||null,key=child?(identity??String(child.key??'content')):null;
 const serial=useRef(0),last=useRef({key,child,serial:0});
 const [state,setState]=useState<{key:string|null;serial:number;out:{key:string;child:ReactElement;serial:number}|null}>({key,serial:0,out:null});
 useLayoutEffect(()=>{
  if(last.current.key!==key){const old=last.current,next=++serial.current;last.current={key,child,serial:next};setState({key,serial:next,out:old.key!==null&&old.child&&!reducedMotion()?{key:old.key,child:old.child,serial:old.serial}:null});}
  else last.current.child=child;
 },[key,child]);
 useLayoutEffect(()=>{if(!state.out)return;const timeout=setTimeout(()=>setState(s=>s.out===state.out?{...s,out:null}:s),reducedMotion()?0:duration+24);return()=>clearTimeout(timeout);},[state.out,duration]);
 // During the layout-effect reconciliation keep the old tree; it becomes inert
 // before paint. The current branch always receives up-to-date server props.
 const current=state.key===key?child:last.current.child;
 return <>{state.out&&<MotionContext.Provider key={'motion-'+state.out.serial} value="exit">{state.out.child}</MotionContext.Provider>}{current&&<MotionContext.Provider key={'motion-'+state.serial} value={parentPhase==='exit'?'exit':'enter'}>{current}</MotionContext.Provider>}</>;
}
type MotionKind='fade'|'panel'|'collapse'|'status';
type MotionProps={children:ReactNode;show?:boolean;identity?:string;kind?:MotionKind;className?:string;as?:'div'|'span';style?:CSSProperties};
export function ChatMotion({children,show=true,identity,kind='fade',className='',as:Tag='div',style}:MotionProps){const content=<ChatPresence identity={identity}>{show?<MotionBox kind={kind} className={className} as={Tag} style={style}>{children}</MotionBox>:null}</ChatPresence>;return identity!==undefined?<Tag className="chat-motion-switch">{content}</Tag>:content;}
function MotionBox({children,kind,className,as:Tag,style}:{children:ReactNode;kind:MotionKind;className:string;as:'div'|'span';style?:CSSProperties}){
 const ref=useRef<HTMLDivElement&HTMLSpanElement>(null),phase=useMotionPhase();
 useLayoutEffect(()=>{
  const node=ref.current;if(!node)return;const exiting=phase==='exit',collapse=kind==='collapse',translate=kind==='panel'?16:kind==='status'?3:5;
  const frames:Keyframe[]=exiting?[{opacity:1,transform:'translate3d(0,0,0)'},{opacity:0,transform:`translate3d(0,${translate}px,0)`}]:[{opacity:0,transform:`translate3d(0,${translate}px,0)`},{opacity:1,transform:'translate3d(0,0,0)'}];
  if(collapse){const height=node.getBoundingClientRect().height;frames[0].height=exiting?`${height}px`:'0px';frames[1].height=exiting?'0px':`${height}px`;frames.forEach(f=>{f.overflow='clip';});}
  const animation=animateChat(node,frames,{duration:motion.normal,easing:kind==='panel'?motion.spring:motion.ease,fill:exiting?'forwards':'none'});
  return()=>animation?.cancel();
 },[phase,kind]);
 return <Tag ref={ref} className={'chat-motion '+className} data-motion-phase={phase} data-motion-kind={kind} inert={phase==='exit'} aria-hidden={phase==='exit'||undefined} style={style}>{children}</Tag>;
}
/** FLIP only changed visible rows. Images/content keep their natural layout size. */
export function useChatListMotion(ref:{current:HTMLElement|null},revision:unknown,selector='[data-conversation-id]',collapsing=false) {
 const rects=useRef(new Map<string,number>()),animations=useRef(new Map<Element,Animation>()),wasCollapsing=useRef(false);
 useLayoutEffect(()=>{
  const root=ref.current;if(!root){rects.current.clear();return;}const next=new Map<string,number>(),viewport=window.innerHeight,rootTop=root.getBoundingClientRect().top;
  const skip=collapsing||wasCollapsing.current;wasCollapsing.current=collapsing;
  const nodes=[...root.querySelectorAll<HTMLElement>(selector)];
  const measured=nodes.map(node=>{const active=animations.current.get(node),transform=active?getComputedStyle(node).transform:'none',translation=transform==='none'?0:new DOMMatrixReadOnly(transform).m42;return{node,key:node.dataset.conversationId||node.dataset.motionKey||'',rect:node.getBoundingClientRect(),translation};});
  for(const [index,{node,key,rect,translation}] of measured.entries()){const top=rect.top-translation-rootTop;next.set(key,top);const previous=rects.current.get(key);if(skip){animations.current.get(node)?.cancel();continue;}if(rect.bottom<0||rect.top>viewport)continue;
   if(previous!==undefined&&Math.abs(previous-top)<1)continue;
   // A second reorder starts at the current visual position, even mid-flight.
   const dy=previous===undefined?0:previous-top+translation;
   animations.current.get(node)?.cancel();const animation=animateChat(node,previous!==undefined?[{transform:`translate3d(0,${dy}px,0)`},{transform:'translate3d(0,0,0)'}]:[{opacity:0,transform:'translate3d(0,7px,0)'},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:motion.normal,easing:motion.spring,delay:previous!==undefined?0:Math.min(index,5)*22,fill:'backwards'});if(animation){animations.current.set(node,animation);void animation.finished.then(()=>{if(animations.current.get(node)===animation)animations.current.delete(node);}).catch(()=>{});}
  }rects.current=next;
 },[ref,revision,selector,collapsing]);
 useLayoutEffect(()=>()=>{animations.current.forEach(a=>a.cancel());animations.current.clear();},[]);
}
