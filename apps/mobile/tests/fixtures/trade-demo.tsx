import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import '@fontsource-variable/inter';
import '../../src/shared/styles/tokens.css';
import '../../src/shared/styles/global.css';
import DemoScenario from '../../src/features/trade/DemoScenario';
function Fixture(){
 const [organizationId,setOrganizationId]=useState(''),[created,setCreated]=useState(0);
 useEffect(()=>{const read=()=>setOrganizationId(new URLSearchParams(location.hash.split('?')[1]).get('organizationId')||'');window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read);},[]);
 return <main style={{maxWidth:560,margin:'0 auto',padding:'0 18px'}}><DemoScenario organizationId={organizationId} compact onCreated={()=>setCreated(n=>n+1)}/><output aria-label="Created callback">{created}</output></main>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
