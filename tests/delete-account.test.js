import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteAccountWithProgress} from '../src/delete-account.js';

function setup(overrides={}) {
  const calls=[];
  const user={uid:'account-A',emailVerified:true};
  const options={user,
    authenticate:async()=>calls.push('authenticate'),
    removeProgress:async uid=>calls.push('remote:'+uid),
    deleteIdentity:async()=>calls.push('identity'),
    getCurrentUser:()=>user,
    store:{pause:async()=>calls.push('pause'),forget:async uid=>calls.push('forget:'+uid),select:async u=>calls.push('select:'+u.uid)},
    ...overrides,
  };
  return {calls,options};
}

test('account deletion waits for local removal before confirming the complete result',async()=>{
  const {calls,options}=setup();
  let release,settled=false;
  options.store.forget=async uid=>{calls.push('forget:'+uid);await new Promise(resolve=>release=resolve);};
  const pending=deleteAccountWithProgress(options).then(result=>{settled=true;return result;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(settled,false);
  assert.deepEqual(calls,['authenticate','pause','remote:account-A','identity','forget:account-A']);
  release();
  assert.match((await pending).message,/incluida la copia/);
});

test('an invalid password cannot pause the store or remove anything',async()=>{
  const {calls,options}=setup({authenticate:async()=>{throw new Error('Wrong password');}});
  await assert.rejects(deleteAccountWithProgress(options),/Wrong password/);
  assert.deepEqual(calls,[]);
});

test('failed remote removal keeps the identity and device copy intact and resumes the same account',async()=>{
  const {calls,options}=setup({removeProgress:async()=>{throw new Error('Offline');}});
  await assert.rejects(deleteAccountWithProgress(options),error=>/No se pudo completar/.test(error.message) && error.cause.message==='Offline');
  assert.deepEqual(calls,['authenticate','pause','select:account-A']);
});

test('failed identity deletion resumes the surviving account without forgetting its local progress',async()=>{
  const {calls,options}=setup({deleteIdentity:async()=>{throw new Error('Try again');}});
  await assert.rejects(deleteAccountWithProgress(options),error=>/copia local/.test(error.message) && error.cause.message==='Try again');
  assert.deepEqual(calls,['authenticate','pause','remote:account-A','select:account-A']);
});

test('a changed session is never replaced after a failed deletion',async()=>{
  const {calls,options}=setup({deleteIdentity:async()=>{throw new Error('Changed');},getCurrentUser:()=>({uid:'account-B'})});
  await assert.rejects(deleteAccountWithProgress(options),error=>error.cause.message==='Changed');
  assert.deepEqual(calls,['authenticate','pause','remote:account-A']);
});

test('local cleanup failure reports remote success and the remaining local copy accurately',async()=>{
  const {calls,options}=setup();
  options.store.forget=async()=>{throw new Error('Storage unavailable');};
  const result=await deleteAccountWithProgress(options);
  assert.match(result.message,/en la nube se han eliminado/);
  assert.match(result.message,/No se pudo borrar la copia local/);
  assert.deepEqual(calls,['authenticate','pause','remote:account-A','identity']);
});

test('an unverified account has no permitted remote progress to remove',async()=>{
  const {calls,options}=setup({user:{uid:'account-A',emailVerified:false}});
  await deleteAccountWithProgress(options);
  assert.deepEqual(calls,['authenticate','pause','identity','forget:account-A']);
});
