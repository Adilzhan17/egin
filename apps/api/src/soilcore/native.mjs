import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const candidates=['../../../../firmware/soilcore/build/soilcore_cli','../../../../firmware/soilcore/build/soilcore_cli.exe','../../../../firmware/soilcore/build/Debug/soilcore_cli.exe'].map(path=>fileURLToPath(new URL(path,import.meta.url)));
export const nativeExecutable=()=>process.env.SOILCORE_CLI||candidates.find(existsSync);
export function nativeCommand(item,command){
  return new Promise(resolve=>{
    const executable=nativeExecutable();if(!executable)return resolve(null);
    if(!item.process){
      const child=spawn(executable,[],{stdio:['pipe','pipe','ignore'],windowsHide:true});item.process=child;item.nativeOnline=true;
      const lines=createInterface({input:child.stdout});
      lines.on('line',line=>{if(!item.resolve)return;let result=null;try{if(line.length<=262144)result=JSON.parse(line);}catch{}const done=item.resolve;item.resolve=null;done(result);});
      const failed=()=>{if(item.process===child){item.process=null;item.nativeOnline=null;item.firmwareQueue=null;}if(item.resolve){const done=item.resolve;item.resolve=null;done(null);}};
      child.on('error',failed);child.on('close',failed);child.stdin.on('error',failed);
    }
    const child=item.process;
    const timeout=setTimeout(()=>{if(item.resolve){item.resolve=null;child.kill();resolve(null);}},5000);
    item.resolve=result=>{clearTimeout(timeout);resolve(result);};
    child.stdin.write(`${command}\n`);
  });
}
