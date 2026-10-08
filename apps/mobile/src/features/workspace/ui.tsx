import type { ReactNode } from 'react';
import { Icon,type IconName } from '../../shared/ui/Icon';
import './workspace.css';
export function Page({title,back='/settings',children,action}:{title:string;back?:string;children:ReactNode;action?:ReactNode}){return <div className="workspace-page"><header className="workspace-header"><a className="icon-button" href={'#'+back} aria-label="Назад"><Icon name="back"/></a><h1>{title}</h1>{action}</header>{children}</div>;}
export function LinkRow({href,title,description,icon,badge}:{href:string;title:string;description:string;icon:IconName;badge?:string}){return <a className="setting-link" href={'#'+href}><span className="setting-icon"><Icon name={icon}/></span><span><strong>{title}</strong><small>{description}</small></span>{badge&&<em>{badge}</em>}<Icon name="right" size={17}/></a>;}
export function Notice({children,error=false}:{children:ReactNode;error?:boolean}){return children?<p className={`workspace-notice ${error?'error':''}`} role={error?'alert':'status'}>{children}</p>:null;}
export function Empty({icon,title,children}:{icon:IconName;title:string;children:ReactNode}){return <div className="workspace-empty"><Icon name={icon} size={36}/><h2>{title}</h2><p>{children}</p></div>;}
export function Toggle({title,description,on,onChange}:{title:string;description:string;on:boolean;onChange:()=>void}){return <button className="preference-row workspace-toggle" role="switch" aria-checked={on} onClick={onChange}><span><strong>{title}</strong><small>{description}</small></span><span className={`toggle ${on?'on':''}`}/></button>;}
