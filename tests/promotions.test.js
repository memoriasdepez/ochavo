import test from 'node:test';
import assert from 'node:assert/strict';
import {createPromotions,generatePromoCode,normalizePromoCode,hashPromoCode} from '../src/promotions.js';

function setup(){
  let user={uid:'admin',emailVerified:true};const docs=new Map([['promoAdmins/admin',{schemaVersion:1,enabled:true}]]);
  const snap=key=>({id:key.split('/').at(-1),exists:()=>docs.has(key),data:()=>docs.get(key)});
  const api={doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>123,getDocFromServer:async key=>snap(key),
    collection:(_db,...parts)=>parts.join('/'),query:value=>value,orderBy:()=>null,limit:()=>null,
    getDocsFromServer:async()=>({docs:[...docs.keys()].filter(k=>k.startsWith('promoCodes/')).map(snap)}),
    runTransaction:async(_db,fn)=>{const writes=[];const result=await fn({get:async key=>snap(key),set:(key,value)=>writes.push(()=>docs.set(key,value)),update:(key,value)=>writes.push(()=>docs.set(key,{...docs.get(key),...value}))});for(const write of writes)write();return result;}};
  return {api,docs,setUser:value=>user=value,backend:createPromotions({db:{},api,getUser:()=>user})};
}
test('promo code uses 128 cryptographic random bits, normalizes separators and hashes consistent plaintext',async()=>{
  const first=generatePromoCode(),second=generatePromoCode();assert.notEqual(first,second);assert.match(first,/^OCHAVO(?:-[A-F0-9]{4}){8}$/);
  const compact=normalizePromoCode(first);assert.equal(compact.length,32);assert.equal(normalizePromoCode(first.toLowerCase().replaceAll('-',' ')),compact);
  assert.equal(await hashPromoCode(first),await hashPromoCode(compact));assert.match(await hashPromoCode(first),/^[a-f0-9]{64}$/);
  for(const code of ['',null,'VIRUTA-1234','OCHAVO-1234','VIRUTA'+compact+'/', 'OCHAVO'+compact+'/', 'x'.repeat(1000)])assert.equal(normalizePromoCode(code),null);
  await assert.rejects(hashPromoCode('not-a-code'),{code:'promotions/invalid-code'});
});
test('historical and current prefixes resolve to the original stored hash and grant',async()=>{
  const old='VIRUTA-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF',current=old.replace('VIRUTA','OCHAVO');
  const hash='d3f0d0e9471ea129fa214c128b3ddd0d6ae16b168765a22996eeb17313a24e8b';
  for(const code of [old,current,current.toLowerCase().replaceAll('-',' ')])assert.equal(await hashPromoCode(code),hash);
  const f=setup();f.docs.set('promoCodes/'+hash,{schemaVersion:1,createdBy:'admin',createdAt:123,label:'Legacy fixture',status:'available',redeemedBy:'',redeemedAt:null});f.setUser({uid:'A',emailVerified:true});
  assert.deepEqual(await f.backend.redeem(old),{lifetime:true,alreadyActive:false});assert.equal(f.docs.get('users/A/promotions/lifetime').codeHash,hash);
  assert.deepEqual(await f.backend.redeem(current),{lifetime:true,alreadyActive:true});
});
test('admin creates one-time plaintext and list contains only safe metadata',async()=>{
  const f=setup();assert.equal(await f.backend.getAdmin(),true);const created=await f.backend.createCode({label:' Ana '});assert.equal(created.label,'Ana');
  const stored=f.docs.get('promoCodes/'+created.hash);assert.equal(stored.status,'available');assert.equal('code' in stored,false);assert.equal(JSON.stringify(stored).includes(created.code),false);
  const [listed]=await f.backend.listCodes();assert.deepEqual(Object.keys(listed).sort(),['createdAt','hash','label','redeemedAt','status']);assert.equal(listed.hash,created.hash);
  await f.backend.disableCode(created.hash);assert.equal(f.docs.get('promoCodes/'+created.hash).status,'disabled');assert.equal((await f.backend.disableCode(created.hash)).disabled,true);
});
test('redemption is atomic and already-lifetime account does not consume a second code',async()=>{
  const f=setup(),first=await f.backend.createCode(),second=await f.backend.createCode();f.setUser({uid:'A',emailVerified:true});
  assert.deepEqual(await f.backend.redeem(first.code),{lifetime:true,alreadyActive:false});assert.equal(f.docs.get('users/A/promotions/lifetime').codeHash,first.hash);
  assert.deepEqual(await f.backend.redeem(second.code),{lifetime:true,alreadyActive:true});assert.equal(f.docs.get('promoCodes/'+second.hash).status,'available');
  f.setUser({uid:'B',emailVerified:true});await assert.rejects(f.backend.redeem(first.code),{code:'promotions/invalid-code'});assert.equal(f.docs.has('users/B/promotions/lifetime'),false);
});
test('only verified nonanonymous account enters operations and server checks admin role',async()=>{
  const f=setup();for(const user of [null,{uid:'A',emailVerified:false},{uid:'A',emailVerified:true,isAnonymous:true}]){f.setUser(user);await assert.rejects(f.backend.getAdmin(),{code:'promotions/auth-required'});await assert.rejects(f.backend.redeem(generatePromoCode()),{code:'promotions/auth-required'});}
  f.setUser({uid:'A',emailVerified:true});assert.equal(await f.backend.getAdmin(),false);await assert.rejects(f.backend.createCode(),{code:'promotions/admin-required'});await assert.rejects(f.backend.listCodes(),{code:'promotions/admin-required'});
  f.setUser({uid:'admin',emailVerified:true});await assert.rejects(f.backend.createCode({label:'x'.repeat(81)}),{code:'promotions/invalid-label'});
});
test('account changes during server reads prevent writes or leaked admin results',async()=>{
  const f=setup(),get=f.api.getDocFromServer;f.api.getDocFromServer=async key=>{const result=await get(key);f.setUser({uid:'B',emailVerified:true});return result;};
  await assert.rejects(f.backend.getAdmin(),{code:'promotions/identity-changed'});
  const g=setup(),original=g.api.runTransaction;g.api.runTransaction=async(db,callback)=>original(db,async tx=>{const get=tx.get;tx.get=async key=>{const result=await get(key);g.setUser({uid:'B',emailVerified:true});return result;};return callback(tx);});
  await assert.rejects(g.backend.createCode(),{code:'promotions/identity-changed'});assert.equal([...g.docs.keys()].some(k=>k.startsWith('promoCodes/')),false);
});
test('deletion markers, denied transactions and offline failure never grant access locally',async()=>{
  const f=setup(),created=await f.backend.createCode();f.setUser({uid:'A',emailVerified:true});f.docs.set('accountDeletions/A',{deletedAt:123});
  await assert.rejects(f.backend.redeem(created.code),{code:'account/deletion-pending'});assert.equal(f.docs.get('promoCodes/'+created.hash).status,'available');
  f.docs.delete('accountDeletions/A');f.api.runTransaction=async()=>{throw Object.assign(Error('denied'),{code:'permission-denied'});};await assert.rejects(f.backend.redeem(created.code),{code:'promotions/invalid-code'});
  f.api.runTransaction=async()=>{throw Object.assign(Error('offline'),{code:'unavailable'});};await assert.rejects(f.backend.redeem(created.code),{code:'promotions/unavailable'});
  assert.equal(f.docs.has('users/A/promotions/lifetime'),false);
});
