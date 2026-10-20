import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import * as firestore from 'firebase/firestore';
import {createGameBackend} from '../src/game-backend.js';

const enabled=!!process.env.FIRESTORE_EMULATOR_HOST;
let env;
before(async()=>{
  if(!enabled)return;
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  env=await initializeTestEnvironment({projectId:'demo-viruta-promo-review',firestore:{host,port:+port,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
});
after(async()=>{await env?.cleanup();});
beforeEach(async()=>{if(enabled)await env.clearFirestore();});
const hash=i=>i.toString(16).padStart(64,'0');
const db=()=>env.authenticatedContext('admin',{email_verified:true}).firestore();
async function seed(){
  await env.withSecurityRulesDisabled(async c=>{
    const database=c.firestore(),batch=firestore.writeBatch(database),stamp=firestore.Timestamp.now();
    batch.set(firestore.doc(database,'accountDeletions','admin'),{deletedAt:stamp});
    batch.set(firestore.doc(database,'promoAdmins','admin'),{schemaVersion:1,enabled:true,createdAt:stamp});
    batch.set(firestore.doc(database,'users','admin','promotions','lifetime'),{schemaVersion:1,codeHash:hash(1),grantedAt:stamp});
    batch.set(firestore.doc(database,'users','other','promotions','lifetime'),{schemaVersion:1,codeHash:hash(2),grantedAt:stamp});
    for(let i=1;i<=205;i++)batch.set(firestore.doc(database,'promoCodes',hash(i)),{schemaVersion:1,createdBy:'admin',createdAt:stamp,label:'Private beta label',status:i<=2?'redeemed':'available',redeemedBy:i===1?'admin':i===2?'other':'',redeemedAt:i<=2?stamp:null});
    await batch.commit();
  });
}
async function verifyCleanup(){
  await env.withSecurityRulesDisabled(async c=>{
    const database=c.firestore(),records=await firestore.getDocs(firestore.collection(database,'promoCodes'));
    assert.equal(records.size,205);
    for(const record of records.docs){const value=record.data();assert.equal(value.createdBy,'');assert.equal(value.label,'');assert.equal(value.status,[hash(1),hash(2)].includes(record.id)?'redeemed':'disabled');}
    assert.equal((await firestore.getDoc(firestore.doc(database,'promoCodes',hash(1)))).data().redeemedBy,'');
    assert.equal((await firestore.getDoc(firestore.doc(database,'promoCodes',hash(2)))).data().redeemedBy,'other');
    assert.equal((await firestore.getDoc(firestore.doc(database,'users','admin','promotions','lifetime'))).exists(),false);
    assert.equal((await firestore.getDoc(firestore.doc(database,'promoAdmins','admin'))).exists(),false);
    assert.equal((await firestore.getDoc(firestore.doc(database,'users','other','promotions','lifetime'))).exists(),true);
  });
}
test('promotion security review: 205-code deletion stays within access limits and preserves other recipients',{skip:!enabled},async()=>{
  await seed();const backend=createGameBackend(db());await backend.remove('admin');await backend.remove('admin');await verifyCleanup();
});
test('promotion security review: lost response after creator cleanup resumes with grant/code linkage intact',{skip:!enabled},async()=>{
  await seed();let lost=false;
  const api={...firestore,writeBatch:database=>{
    const batch=firestore.writeBatch(database),commit=batch.commit.bind(batch);
    batch.commit=async()=>{await commit();if(!lost){lost=true;throw Error('simulated lost cleanup response');}};
    return batch;
  }};
  await assert.rejects(createGameBackend(db(),{api}).remove('admin'),/simulated/);
  await env.withSecurityRulesDisabled(async c=>{
    assert.equal((await firestore.getDoc(firestore.doc(c.firestore(),'users','admin','promotions','lifetime'))).exists(),true);
    assert.equal((await firestore.getDoc(firestore.doc(c.firestore(),'promoCodes',hash(1)))).data().redeemedBy,'admin');
  });
  await createGameBackend(db()).remove('admin');await verifyCleanup();
});
