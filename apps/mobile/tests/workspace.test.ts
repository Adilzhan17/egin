import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseSensorQR} from '../src/entities/workspace/qr.ts';
test('sensor QR accepts the EGIN contract and rejects arbitrary URLs and invalid IDs',()=>{
 assert.deepEqual(parseSensorQR('egin://sensor?id=SOIL-001&type=moisture&name=Soil'),{serial:'SOIL-001',type:'moisture',name:'Soil'});
 assert.equal(parseSensorQR(JSON.stringify({version:1,kind:'egin-sensor',id:'TEMP-2',type:'temperature'})).serial,'TEMP-2');
 for(const value of ['https://example.com/sensor?id=x','javascript:alert(1)','egin://sensor?id=../../x&type=moisture','egin://sensor?id=SOIL-1&type=invalid','{}'])assert.throws(()=>parseSensorQR(value));
});

import {parseLoginQR} from '../src/entities/workspace/auth-qr.ts';
test('login QR supports both EGIN environments, rejects foreign links and identifies system passkey QR',()=>{
 const id='a'.repeat(43), main='https://egin.perricheno.com',dev='https://dev-egin.perricheno.com';
 assert.equal(parseLoginQR('  '+main+'/#/auth/confirm/'+id+'  ',main)?.origin,main);
 assert.equal(parseLoginQR(dev+'/#/auth/confirm/'+id,main)?.origin,dev);
 assert.equal(parseLoginQR(main+'/#/auth/confirm/'+id,'capacitor://localhost')?.origin,main);
 assert.equal(parseLoginQR('egin://sensor?id=SOIL-001&type=moisture',main),null);
 assert.throws(()=>parseLoginQR('FIDO:/123456',main),/обычной камерой/);
 for(const origin of ['https://evil.example','http://egin.perricheno.com','https://egin.perricheno.com.evil.test','https://attacker@egin.perricheno.com'])assert.throws(()=>parseLoginQR(origin+'/#/auth/confirm/'+id,main));
 assert.throws(()=>parseLoginQR(main+'/?redirect=https://evil.test#/auth/confirm/'+id,main));
 assert.equal(parseLoginQR(main+'/#/auth/confirm/short',main),null);
});
