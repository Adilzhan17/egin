import test from 'node:test';
import assert from 'node:assert/strict';
import { safeDiagnostic } from '../src/security/log.mjs';

test('diagnostics keep allowlisted operational codes without raw values, messages, stack or cause',()=>{
  const secret='private-token-from-request',error=Object.assign(new Error('postgresql://user:'+secret+'@host/db'),{code:'28P01',detail:'customer-private-data',cause:{request:{authorization:secret}},status:503});
  assert.deepEqual(safeDiagnostic('Platform initialization',error),{event:'Platform initialization',code:'28P01',status:503});
  error.code=secret;
  assert.deepEqual(safeDiagnostic(secret,error),{event:'Application error',code:'unclassified',status:503});
  assert.equal(JSON.stringify(safeDiagnostic('Market request failed',error)).includes(secret),false);
  assert.deepEqual(safeDiagnostic('Chat database',null),{event:'Chat database',code:'unclassified'});
});
