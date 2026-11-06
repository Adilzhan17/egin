import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export function ChatPopover({anchor,onClose,children,label,dark=false}:{anchor:RefObject<HTMLButtonElement|null>;onClose:()=>void;children:ReactNode;label:string;dark?:boolean}) {
  const panel=useRef<HTMLDivElement>(null),close=useRef(onClose);close.current=onClose;
  useLayoutEffect(()=>{
    const element=panel.current,trigger=anchor.current;if(!element||!trigger)return;
    const position=()=>{const rect=trigger.getBoundingClientRect(),v=window.visualViewport,width=v?.width||window.innerWidth,height=v?.height||window.innerHeight,left=v?.offsetLeft||0,top=v?.offsetTop||0,pad=10;const w=Math.min(300,width-pad*2);element.style.width=`${w}px`;element.style.maxHeight=`${Math.max(100,height-pad*2)}px`;const h=Math.min(element.scrollHeight,height-pad*2);const below=height-(rect.bottom-top)-pad,above=rect.top-top-pad;const y=below>=h||below>=above?Math.min(rect.bottom+6,top+height-h-pad):Math.max(top+pad,rect.top-h-6);element.style.left=`${Math.max(left+pad,Math.min(rect.right-w,left+width-w-pad))}px`;element.style.top=`${y}px`;};
    const outside=(event:PointerEvent)=>{if(!element.contains(event.target as Node)&&!trigger.contains(event.target as Node))close.current();};
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();close.current();}};
    position();element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',key);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
    return()=>{document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',key);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);window.visualViewport?.removeEventListener('resize',position);window.visualViewport?.removeEventListener('scroll',position);if(trigger.isConnected&&!document.querySelector('dialog[open]'))trigger.focus({preventScroll:true});};
  },[anchor]);
  return createPortal(<div ref={panel} className={`chat-popover${dark?' is-dark':''}`} role="dialog" aria-label={label}>{children}</div>,document.body);
}
