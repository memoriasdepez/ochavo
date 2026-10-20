import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,updateDoc,deleteDoc,writeBatch,Timestamp,serverTimestamp} from 'firebase/firestore';
import {createPromotions} from '../src/promotions.js';
import {createGameBackend} from '../src/game-backend.js';
import {GAME_CONFIG,createGameCatalog,emptyGame,emptyCommerce,dayWindow,dayKeyAt,dayOrdinal} from '../src/game-domain.js';

const enabled=!!process.env.FIRESTORE_EMULATOR_HOST;
const check=(name,fn)=>test('promotions rules: '+name,{skip:!enabled},fn);
const day=dayKeyAt(),yesterday=new Date((dayOrdinal(day)-1)*86400000).toISOString().slice(0,10);
const catalog=createGameCatalog({lessons:[{id:0,steps:[{type:'learn'},{type:'choice'}]}],exams:[{id:0}]});
let env;
before(async()=>{if(!enabled)return;const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');env=await initializeTestEnvironment({projectId:'demo-viruta-promotions',firestore:{host,port:+port,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>{await env?.cleanup();});
const db=(uid='A',verified=true)=>env.authenticatedContext(uid,{email_verified:verified}).firestore();
const backend=(uid='A')=>createPromotions({db:db(uid),getUser:()=>({uid,emailVerified:true})});
const seed=async(path,data)=>env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),path),data));
const grant=(database,uid,hash)=>({ref:doc(database,'users',uid,'promotions','lifetime'),data:{schemaVersion:1,codeHash:hash,grantedAt:serverTimestamp()}});
beforeEach(async()=>{if(!enabled)return;await env.clearFirestore();await env.withSecurityRulesDisabled(async c=>{
  const database=c.firestore(),batch=writeBatch(database);batch.set(doc(database,'promoAdmins','admin'),{schemaVersion:1,enabled:true,createdAt:Timestamp.now()});
  batch.set(doc(database,'gameConfig','economy'),GAME_CONFIG);for(const [id,value]of Object.entries(catalog))batch.set(doc(database,'gameCatalog',id),value);
  for(const value of [day,yesterday]){const w=dayWindow(value);batch.set(doc(database,'gameDays',value),{...w,startAt:Timestamp.fromMillis(w.startAt),endAt:Timestamp.fromMillis(w.endAt)});}
  batch.set(doc(database,'premiumCases','case-1'),{schemaVersion:1,caseJson:'{"steps":[]}'});await batch.commit();
});});
check('admin-only creation, list and disable; no plaintext stored',async()=>{
  const admin=backend('admin');assert.equal(await admin.getAdmin(),true);assert.equal(await backend().getAdmin(),false);
  const created=await admin.createCode({label:'Beta 1'}),stored=(await getDoc(doc(db(),'promoCodes',created.hash))).data();
  assert.equal(stored.label,'Beta 1');assert.equal('code' in stored,false);assert.equal((await admin.listCodes()).length,1);
  await assert.rejects(backend().createCode(),{code:'promotions/admin-required'});await assertFails(getDocs(collection(db(),'promoCodes')));
  await assertFails(updateDoc(doc(db(),'promoCodes',created.hash),{status:'disabled'}));await admin.disableCode(created.hash);
  await assert.rejects(backend().redeem(created.code),{code:'promotions/invalid-code'});
  await assertFails(updateDoc(doc(db('admin'),'promoCodes',created.hash),{status:'available'}));
});
check('guests/unverified cannot read codes, grants or admins; client cannot assign admin role',async()=>{
  const created=await backend('admin').createCode();for(const database of [env.unauthenticatedContext().firestore(),db('A',false)]){
    await assertFails(getDoc(doc(database,'promoCodes',created.hash)));await assertFails(getDoc(doc(database,'users','A','promotions','lifetime')));await assertFails(getDoc(doc(database,'promoAdmins','A')));
  }
  await assertFails(setDoc(doc(db(),'promoAdmins','A'),{schemaVersion:1,enabled:true,createdAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(db('admin'),'promoAdmins','admin'),{enabled:false}));await assertFails(deleteDoc(doc(db('admin'),'promoAdmins','admin')));
});
check('free verified user atomically redeems and same account repeats without using another code',async()=>{
  const admin=backend('admin'),a=await admin.createCode(),b=await admin.createCode();
  assert.deepEqual(await backend().redeem(a.code),{lifetime:true,alreadyActive:false});assert.deepEqual(await backend().redeem(a.code),{lifetime:true,alreadyActive:true});
  await backend().redeem(b.code);assert.equal((await getDoc(doc(db(),'promoCodes',b.hash))).data().status,'available');
  await assert.rejects(backend('B').redeem(a.code),{code:'promotions/invalid-code'});await assertFails(getDoc(doc(db('B'),'users','A','promotions','lifetime')));
  assert.equal((await getDoc(doc(db(),'premiumCases','case-1'))).exists(),true);
});
check('concurrent accounts and devices result in exactly one owner',async()=>{
  const code=await backend('admin').createCode();const outcomes=await Promise.allSettled([backend('A').redeem(code.code),backend('B').redeem(code.code)]);
  assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);const owner=(await getDoc(doc(db(),'promoCodes',code.hash))).data().redeemedBy;
  assert.ok(['A','B'].includes(owner));assert.equal((await getDoc(doc(db(owner),'users',owner,'promotions','lifetime'))).exists(),true);
  const same=await Promise.all([backend(owner).redeem(code.code),backend(owner).redeem(code.code)]);assert.ok(same.every(x=>x.alreadyActive));
});
check('rebrand preserves stored historical codes and accepts newly issued Ochavo codes',async()=>{
  const old='VIRUTA-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF',hash='d3f0d0e9471ea129fa214c128b3ddd0d6ae16b168765a22996eeb17313a24e8b';
  await seed('promoCodes/'+hash,{schemaVersion:1,createdBy:'admin',createdAt:Timestamp.now(),label:'Legacy fixture',status:'available',redeemedBy:'',redeemedAt:null});
  await backend('A').redeem(old);assert.equal((await getDoc(doc(db(),'users','A','promotions','lifetime'))).data().codeHash,hash);
  assert.deepEqual(await backend('A').redeem(old.replace('VIRUTA','OCHAVO')),{lifetime:true,alreadyActive:true});
  const fresh=await backend('admin').createCode();assert.match(fresh.code,/^OCHAVO-/);await backend('B').redeem(fresh.code);
  assert.equal((await getDoc(doc(db('B'),'users','B','promotions','lifetime'))).data().codeHash,fresh.hash);
  assert.equal((await getDoc(doc(db(),'premiumCases','case-1'))).exists(),true);
});
check('grant alone, code alone, wrong hash, recipient mismatch and fake timestamps all fail',async()=>{
  const created=await backend('admin').createCode(),database=db(),ref=doc(database,'promoCodes',created.hash),g=grant(database,'A',created.hash);
  await assertFails(setDoc(g.ref,g.data));await assertFails(updateDoc(ref,{status:'redeemed',redeemedBy:'A',redeemedAt:serverTimestamp()}));
  for(const variant of ['hash','recipient','timestamp','extra']){
    const batch=writeBatch(database);batch.update(ref,{status:'redeemed',redeemedBy:variant==='recipient'?'B':'A',redeemedAt:variant==='timestamp'?Timestamp.fromMillis(0):serverTimestamp()});
    batch.set(g.ref,{...g.data,...variant==='hash'?{codeHash:'f'.repeat(64)}:variant==='extra'?{premium:true}:{}});await assertFails(batch.commit());
  }
  assert.equal((await getDoc(ref)).data().status,'available');assert.equal((await getDoc(g.ref)).exists(),false);
});
check('even an admin cannot pregrant access, mint direct commerce, reopen or erase redeemed code',async()=>{
  const created=await backend('admin').createCode();await backend().redeem(created.code);
  for(const database of [db(),db('admin')]){
    await assertFails(deleteDoc(doc(database,'promoCodes',created.hash)));await assertFails(updateDoc(doc(database,'promoCodes',created.hash),{status:'available',redeemedBy:'',redeemedAt:null}));
    await assertFails(setDoc(doc(database,'users','A','commerce','main'),{...emptyCommerce(),premiumUntilMs:253402300799000}));
  }
  await assert.rejects(backend('admin').disableCode(created.hash),{code:'promotions/already-used'});
  await assertFails(updateDoc(doc(db(),'users','A','promotions','lifetime'),{codeHash:'a'.repeat(64)}));await assertFails(deleteDoc(doc(db(),'users','A','promotions','lifetime')));
});
check('disabled admin and deletion markers block code creation or redemption including same batch',async()=>{
  const created=await backend('admin').createCode();await seed('promoAdmins/admin',{schemaVersion:1,enabled:false,createdAt:Timestamp.now()});await assert.rejects(backend('admin').createCode(),{code:'promotions/admin-required'});
  const database=db(),batch=writeBatch(database),g=grant(database,'A',created.hash);batch.set(doc(database,'accountDeletions','A'),{deletedAt:serverTimestamp()});
  batch.update(doc(database,'promoCodes',created.hash),{status:'redeemed',redeemedBy:'A',redeemedAt:serverTimestamp()});batch.set(g.ref,g.data);await assertFails(batch.commit());
  await setDoc(doc(database,'accountDeletions','A'),{deletedAt:serverTimestamp()});await assert.rejects(backend().redeem(created.code),{code:'account/deletion-pending'});
});
check('lifetime enables zero-life answers, successful exam with two rewards and case reward without paid changes',async()=>{
  const created=await backend('admin').createCode();await backend().redeem(created.code);
  await seed('users/A/game/main',{...emptyGame(),revision:1,lifeDay:day,lives:0,updatedAt:Timestamp.now()});
  await seed('users/A/commerce/main',{...emptyCommerce(),revision:1,paidGranted:5,paidLives:5,updatedAt:Timestamp.now()});
  const game=createGameBackend(db());await game.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'promo-wrong',correct:false});
  await game.commit('A',{kind:'exam',target:'exam-0',attemptId:'promo-pass',wrongCount:2,passed:true});
  await game.commit('A',{kind:'case-complete',target:'complete-case-1'});assert.equal((await game.read('A')).lives,0);
  const raw=(await getDoc(doc(db(),'users','A','commerce','main'))).data();assert.equal(raw.paidLives,5);assert.equal(raw.paidConsumed,0);assert.equal(raw.premiumUntilMs,0);
  assert.ok((await game.read('A')).gems>100);assert.equal((await getDoc(doc(db(),'premiumCases','case-1'))).exists(),true);
});
check('lifetime plus streak milestone stays within Firestore access limits',async()=>{
  const created=await backend('admin').createCode();await backend().redeem(created.code);await seed('users/A/game/main',{...emptyGame(),revision:1,lifeDay:yesterday,lastOpenDay:yesterday,streak:2,bestStreak:2,updatedAt:Timestamp.now()});
  assert.equal((await createGameBackend(db()).commit('A',{kind:'open'})).state.streak,3);
});
check('recipient deletion removes private grant and code uid without making the code reusable',async()=>{
  const created=await backend('admin').createCode();await backend().redeem(created.code);await setDoc(doc(db(),'accountDeletions','A'),{deletedAt:serverTimestamp()});
  await assertFails(getDoc(doc(db(),'premiumCases','case-1')));await createGameBackend(db()).remove('A');await createGameBackend(db()).remove('A');
  assert.equal((await getDoc(doc(db(),'users','A','promotions','lifetime'))).exists(),false);const data=(await getDoc(doc(db('admin'),'promoCodes',created.hash))).data();assert.equal(data.status,'redeemed');assert.equal(data.redeemedBy,'');
  await assert.rejects(backend('B').redeem(created.code),{code:'promotions/invalid-code'});
});
check('admin deletion disables outstanding codes, removes labels and creator uid, preserves existing recipients',async()=>{
  const unused=await backend('admin').createCode({label:'Private name'}),used=await backend('admin').createCode();await backend().redeem(used.code);
  await setDoc(doc(db('admin'),'accountDeletions','admin'),{deletedAt:serverTimestamp()});await createGameBackend(db('admin')).remove('admin');
  for(const created of [unused,used]){const data=(await getDoc(doc(db(),'promoCodes',created.hash))).data();assert.equal(data.createdBy,'');assert.equal(data.label,'');assert.equal(data.status,created===unused?'disabled':'redeemed');}
  assert.equal((await getDoc(doc(db(),'premiumCases','case-1'))).exists(),true);await assert.rejects(backend('B').redeem(unused.code),{code:'promotions/invalid-code'});
});
