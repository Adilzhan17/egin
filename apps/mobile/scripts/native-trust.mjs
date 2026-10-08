// Generate domain association files from the actual Android signing certificate.
// Usage: node scripts/native-trust.mjs /private/path/signing-certificate.der
// Optional: EGIN_APPLE_TEAM_ID=ABCDEFGHIJ for an owned Apple Developer account.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../public/.well-known/',import.meta.url);mkdirSync(root,{recursive:true});
if(process.argv[2]){
 const digest=createHash('sha256').update(readFileSync(process.argv[2])).digest();
 writeFileSync(new URL('assetlinks.json',root),JSON.stringify([{relation:['delegate_permission/common.handle_all_urls','delegate_permission/common.get_login_creds'],target:{namespace:'android_app',package_name:'kz.egin.app',sha256_cert_fingerprints:[Array.from(digest,b=>b.toString(16).padStart(2,'0').toUpperCase()).join(':')]}}],null,2)+'\n');
 writeFileSync(new URL('../api/src/native-origins.json',new URL('../',import.meta.url)),JSON.stringify(['android:apk-key-hash:'+digest.toString('base64url')],null,2)+'\n');
}
if(process.env.EGIN_APPLE_TEAM_ID){if(!/^[A-Z0-9]{10}$/.test(process.env.EGIN_APPLE_TEAM_ID))throw new Error('Invalid Apple Team ID');writeFileSync(new URL('../src/shared/native-config.json',import.meta.url),JSON.stringify({iosPasskeyReady:true})+'\n');writeFileSync(new URL('apple-app-site-association',root),JSON.stringify({webcredentials:{apps:[process.env.EGIN_APPLE_TEAM_ID+'.kz.egin.app']}})+'\n');}
