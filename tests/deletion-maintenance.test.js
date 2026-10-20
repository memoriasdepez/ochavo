import test from 'node:test';
import assert from 'node:assert/strict';
import {deletionCandidate, purgePage, cleanupDeletedPromotions, PROJECT} from '../scripts/purge-deletion-markers.mjs';
const entry = (overrides = {}) => ({readTime: '2026-10-03T14:00:00Z', document: {
  name: `projects/${PROJECT}/databases/(default)/documents/accountDeletions/test-uid`,
  fields: {deletedAt: {timestampValue: '2026-10-03T11:59:59Z'}},
  updateTime: '2026-10-03T11:59:59Z', ...overrides,
}});

test('maintenance accepts only minimal old markers from this exact project and uses server time', () => {
  assert.equal(deletionCandidate(entry()).uid, 'test-uid');
  assert.equal(deletionCandidate({...entry(), readTime: '2026-10-03T12:05:00Z'}), null);
  assert.equal(deletionCandidate({...entry(), readTime: undefined}), null);
  assert.equal(deletionCandidate(entry({name: 'projects/other/databases/(default)/documents/accountDeletions/test-uid'})), null);
  assert.equal(deletionCandidate(entry({name: `projects/${PROJECT}/databases/(default)/documents/users/test-uid/progress/main`})), null);
  assert.equal(deletionCandidate(entry({fields: {deletedAt: {timestampValue: '2026-10-03T10:00:00Z'}, email: {stringValue: 'extra'}}})), null);
});

test('preview never deletes; apply keeps existing accounts and uses an unchanged-document precondition', async () => {
  const calls = [];
  const adapters = {lookup: async () => ({}),remove: async (...args) => calls.push(args)};
  assert.equal((await purgePage([entry()],adapters)).eligible,1);
  assert.deepEqual(calls,[]);
  assert.equal((await purgePage([entry()],{...adapters,apply:true,lookup:async()=>({users:[{localId:'test-uid'}]})})).removed,0);
  assert.equal((await purgePage([entry()],{...adapters,apply:true})).removed,1);
  assert.deepEqual(calls,[[entry().document.name,entry().document.updateTime]]);
});

test('lookup failure or malformed response cannot be interpreted as a deleted account', async () => {
  let removed = false;
  for (const lookup of [async()=>{throw Error('network');}, async()=>null, async()=>({users:'unknown'}),async()=>({error:'unknown'})]) {
    await assert.rejects(purgePage([entry()],{apply:true,lookup,remove:async()=>{removed=true;}}));
  }
  assert.equal(removed,false);
});

test('promotion recovery is executed only for confirmed deleted accounts in apply mode and precedes marker removal',async()=>{
  const order=[],adapters={lookup:async()=>({}),cleanup:async uid=>order.push('cleanup:'+uid),remove:async()=>order.push('remove')};
  await purgePage([entry()],adapters);assert.deepEqual(order,[]);
  await purgePage([entry()],{...adapters,apply:true,lookup:async()=>({users:[{localId:'test-uid'}]})});assert.deepEqual(order,[]);
  await purgePage([entry()],{...adapters,apply:true});assert.deepEqual(order,['cleanup:test-uid','remove']);
  await assert.rejects(purgePage([entry()],{...adapters,apply:true,cleanup:async()=>{throw Error('cleanup failed');}}));assert.equal(order.filter(v=>v==='remove').length,1);
});

test('promotion recovery clears creator and redeemer identities without making consumed codes reusable',async()=>{
  const root=`projects/${PROJECT}/databases/(default)/documents`,writes=[],seen=new Set();
  await cleanupDeletedPromotions('test-uid',{
    listCodes:async field=>{
      if(seen.has(field))return [];seen.add(field);
      return [{name:root+'/promoCodes/'+(field==='createdBy'?'a':'b').repeat(64),updateTime:'2026-10-03T12:00:00Z',fields:{[field]:{stringValue:'test-uid'},status:{stringValue:field==='createdBy'?'available':'redeemed'}}}];
    },commit:async value=>writes.push(...value),
  });
  assert.deepEqual(writes[0].update.fields,{createdBy:{stringValue:''},label:{stringValue:''},status:{stringValue:'disabled'}});
  assert.deepEqual(writes[1].update.fields,{redeemedBy:{stringValue:''}});assert.equal(writes[1].currentDocument.updateTime,'2026-10-03T12:00:00Z');
  assert.deepEqual(writes.slice(2),[{delete:root+'/users/test-uid/promotions/lifetime'},{delete:root+'/promoAdmins/test-uid'}]);
});

test('promotion recovery rejects another account or unexpected collection before writing',async()=>{
  let wrote=false;const root=`projects/${PROJECT}/databases/(default)/documents`;
  for(const bad of [
    {name:root+'/promoCodes/'+'a'.repeat(64),fields:{createdBy:{stringValue:'another'},status:{stringValue:'available'}}},
    {name:root+'/users/'+'a'.repeat(64),fields:{createdBy:{stringValue:'test-uid'},status:{stringValue:'available'}}},
  ])await assert.rejects(cleanupDeletedPromotions('test-uid',{listCodes:async()=>[{...bad,updateTime:'2026-10-03T12:00:00Z'}],commit:async()=>{wrote=true;}}));
  assert.equal(wrote,false);
});
