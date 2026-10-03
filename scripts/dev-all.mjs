// Compatibility alias: the entire application now runs through Compose.
import {spawnSync} from 'node:child_process';
const args=process.argv.includes('--stop')?['compose','stop']:['compose','up','--build','-d'];
const result=spawnSync('docker',args,{stdio:'inherit'});
if(result.status)process.exit(result.status);
console.log(process.argv.includes('--stop')?'EGIN stopped; persistent data retained.':'EGIN: http://localhost:3000 · docker compose logs -f');
