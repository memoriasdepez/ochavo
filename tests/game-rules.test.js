import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,writeBatch,Timestamp,serverTimestamp} from 'firebase/firestore';
import {createGameBackend} from '../src/game-backend.js';
import {GAME_CONFIG,createGameCatalog,emptyGame,emptyCommerce,emptyGemCommerce,dayWindow,dayKeyAt,dayOrdinal,applyGameCommand} from '../src/game-domain.js';

const enabled=!!process.env.FIRESTORE_EMULATOR_HOST;
const catalog=createGameCatalog({lessons:[{id:0,steps:[{type:'learn'},{type:'choice'}]},...[462,471].map(id=>({id,steps:Array.from({length:10},(_,i)=>({type:i%2?'choice':'learn'}))}))],exams:[{id:0},{id:1}]});
let environment;
const day=dayKeyAt(),yesterday=new Date((dayOrdinal(day)-1)*86400000).toISOString().slice(0,10);
before(async()=>{
  if(!enabled)return;
  const [base,proposal]=await Promise.all([readFile(new URL('../firestore.rules',import.meta.url),'utf8'),readFile(new URL('../../../work/game-rules-proposal.txt',import.meta.url),'utf8')]);
  const block=proposal.split('BEGIN GAME RULES\n')[1].split('\nEND GAME RULES')[0];
  const isolated=`rules_version = '2'; service cloud.firestore { match /databases/{database}/documents {
    function verifiedOwner(uid) { return request.auth != null && request.auth.uid == uid && request.auth.token.email_verified == true; }
    function accountActive(uid) { return !exists(/databases/$(database)/documents/accountDeletions/$(uid)); }
    function accountActiveAfterWrite(uid) { return accountActive(uid) && !existsAfter(/databases/$(database)/documents/accountDeletions/$(uid)); }
    match /accountDeletions/{uid} { allow get: if verifiedOwner(uid); allow create: if verifiedOwner(uid) && request.resource.data.keys().hasOnly(['deletedAt']) && request.resource.data.deletedAt == request.time; }
    match /{document=**} { allow read, write: if false; }
  } }`;
  const chosen=process.env.GAME_RULES_STANDALONE?isolated:base;
  const rules=chosen.includes('function gWalletPath(')?chosen:chosen.replace('    match /{document=**}',()=>block+'\n    match /{document=**}');
  const [host,port]=process.env.FIRESTORE_EMULATOR_HOST.split(':');
  environment=await initializeTestEnvironment({projectId:'demo-viruta-game',firestore:{host,port:+port,rules}});
});
after(async()=>{if(environment)await environment.cleanup();});
beforeEach(async()=>{
  if(!enabled)return;
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),records=[['gameConfig/economy',GAME_CONFIG],...Object.entries(catalog).map(([id,value])=>['gameCatalog/'+id,value])];
    for(const d of [day,yesterday]){const w=dayWindow(d);records.push(['gameDays/'+d,{...w,startAt:Timestamp.fromMillis(w.startAt),endAt:Timestamp.fromMillis(w.endAt)}]);}
    for(let i=0;i<records.length;i+=400){const batch=writeBatch(db);for(const [path,value]of records.slice(i,i+400))batch.set(doc(db,path),value);await batch.commit();}
  });
});
const check=(name,fn)=>test(name,{skip:!enabled},fn);
const db=uid=>environment.authenticatedContext(uid,{email_verified:true}).firestore();
const backend=uid=>createGameBackend(db(uid));
check('real rules: welcome and entry commit wallet, event and immutable claim atomically',async()=>{
  const result=await backend('A').commit('A',{kind:'open'});assert.equal(result.state.gems,200);
  const repeat=await backend('A').commit('A',{kind:'open'});assert.equal(repeat.state.gems,200);assert.equal(repeat.duplicate,true);
});
check('real rules: the fifth dividend exercise grants its one gem once, with the original rewards retained',async()=>{
 const b=backend('A');await b.commit('A',{kind:'open'});
 const first=await b.commit('A',{kind:'answer',target:'answer-462-9',attemptId:'dividend-first',correct:true});
 assert.equal(first.state.gems,201);assert.equal(first.duplicate,false);
 const retry=await b.commit('A',{kind:'answer',target:'answer-462-9',attemptId:'dividend-first',correct:true});
 assert.equal(retry.state.gems,201);assert.equal(retry.duplicate,true);
 const repeated=await b.commit('A',{kind:'answer',target:'answer-462-9',attemptId:'dividend-repeat',correct:true});
 assert.equal(repeated.state.gems,201); // A distinct practice attempt creates a zero-reward event; the claim remains unique.
 assert.deepEqual(catalog['answer-462-1'],{kind:'answer',amount:1});
 const claim=await getDoc(doc(db('A'),'users','A','gameClaims','answer-462-9'));assert.equal(claim.exists(),true);
});
check('real rules: the OPV fifth answer adds exactly one gem once and retains the four old claims',async()=>{
 const b=backend('A');await b.commit('A',{kind:'open'});
 const first=await b.commit('A',{kind:'answer',target:'answer-471-9',attemptId:'opv-first',correct:true});assert.equal(first.state.gems,201);
 const retry=await b.commit('A',{kind:'answer',target:'answer-471-9',attemptId:'opv-first',correct:true});assert.equal(retry.duplicate,true);assert.equal(retry.state.gems,201);
 const replay=await b.commit('A',{kind:'answer',target:'answer-471-9',attemptId:'opv-replay',correct:true});assert.equal(replay.state.gems,201);
 for(const step of [1,3,5,7])assert.deepEqual(catalog['answer-471-'+step],{kind:'answer',amount:1});
 assert.equal((await getDoc(doc(db('A'),'users','A','gameClaims','answer-471-9'))).exists(),true);
});
check('real rules: first lesson, answer, exam, world, case and badges have validated balances',async()=>{
  const b=backend('A'),commit=b.commit;b.commit=async(uid,c)=>{try{return await commit(uid,c);}catch(cause){throw new Error(c.kind+' '+c.target+': '+cause.message,{cause});}};
  await b.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'correct',correct:true});
  await b.commit('A',{kind:'lesson',target:'lesson-0'});await b.commit('A',{kind:'badge',target:'badge-first-lesson'});
  await b.commit('A',{kind:'exam',target:'exam-0',attemptId:'grade',wrongCount:2,passed:true});
  await b.commit('A',{kind:'badge',target:'badge-world-0'});
  await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','A','commerce','main'),{schemaVersion:1,revision:1,premiumUntilMs:Date.now()+86400000,store:'play_store',environment:'production',paidGranted:0,paidConsumed:0,paidLives:0}));
  await b.commit('A',{kind:'case-complete',target:'complete-case-1'});await b.commit('A',{kind:'badge',target:'badge-cases-1'});
  assert.equal((await b.read('A')).gems,331);
});
check('real rules: milestone opening has enough document-access budget',async()=>{
  await environment.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),'users','A','game','main'),{...emptyGame(),revision:1,lifeDay:yesterday,lastOpenDay:yesterday,streak:2,bestStreak:2,updatedAt:Timestamp.now()}));
  const result=await backend('A').commit('A',{kind:'open'});assert.equal(result.state.streak,3);assert.equal(result.state.gems,207);
});
check('real rules: unknown owner, unverified account and guests cannot access a wallet',async()=>{
  await backend('A').commit('A',{kind:'open'});
  await assertFails(getDoc(doc(db('B'),'users','A','game','main')));
  await assertFails(getDoc(doc(environment.authenticatedContext('A',{email_verified:false}).firestore(),'users','A','game','main')));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),'users','A','game','main')));
});
check('real rules: direct saldo inflation, forged claims and changed receipt are denied',async()=>{
  const b=backend('A'),result=await b.commit('A',{kind:'open'}),database=db('A');
  await assertFails(setDoc(doc(database,'users','A','game','main'),{...result.state,gems:99999,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(database,'users','A','gameClaims','lesson-0'),{eventId:result.receipt.id,createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(database,'users','A','gameEvents',result.receipt.id),{...result.receipt,gemDelta:999,createdAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(database,'users','A','gameClaims','open-'+day)));
});
check('real rules: stale calendar cannot renew lives or forge another opening',async()=>{
  const database=db('A'),result=applyGameCommand(emptyGame(),{kind:'open'},{day:yesterday}),batch=writeBatch(database);
  batch.set(doc(database,'users','A','game','main'),{...result.state,updatedAt:serverTimestamp()});
  batch.set(doc(database,'users','A','gameEvents',result.receipt.id),{...result.receipt,createdAt:serverTimestamp()});
  for(const c of result.claims)batch.set(doc(database,'users','A','gameClaims',c.id),{eventId:result.receipt.id,createdAt:serverTimestamp()});
  await assertFails(batch.commit());
});
check('real rules: historical credit and guest debit work without copying welcome',async()=>{
  const b=backend('A');await b.commit('A',{kind:'answer-credit',target:'answer-0-1',attemptId:'import-guest-answer'});
  await b.commit('A',{kind:'exam-credit',target:'exam-0'});
  await b.commit('A',{kind:'import-debit',attemptId:'import-guest-lives',amount:20});
  assert.equal((await b.read('A')).gems,261);
});
check('real rules: cleanup after marker denies old-token writes and removes events/claims',async()=>{
  const b=backend('A'),database=db('A');await b.commit('A',{kind:'open'});
  await setDoc(doc(database,'accountDeletions','A'),{deletedAt:serverTimestamp()});
  await assert.rejects(b.commit('A',{kind:'lesson',target:'lesson-0'}),{code:'account/deletion-pending'});
  await b.remove('A');await b.remove('A');
  await environment.withSecurityRulesDisabled(async context=>assert.equal((await getDoc(doc(context.firestore(),'users','A','game','main'))).exists(),false));
});
check('real rules: concurrent devices award one answer once and cannot spend the same gems twice',async()=>{
  const a=backend('A'),b=backend('A');
  await Promise.all([a.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'device-a',correct:true}),b.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'device-b',correct:true})]);
  assert.equal((await a.read('A')).gems,201);
  await a.commit('A',{kind:'exam-credit',target:'exam-0'});await b.commit('A',{kind:'exam-credit',target:'exam-1'});
  const purchases=await Promise.allSettled([a.commit('A',{kind:'case',target:'case-1'}),b.commit('A',{kind:'case',target:'case-2'})]);
  assert.equal(purchases.filter(p=>p.status==='fulfilled').length,0);assert.equal((await a.read('A')).gems,361);assert.equal((await a.read('A')).unlockedCases.length,0);
});
check('real rules: incorrect delivery, refill and repeated exam delivery preserve bounded lives',async()=>{
  const b=backend('A');for(let i=0;i<5;i++)await b.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'wrong-'+i,correct:false});
  assert.equal((await b.read('A')).lives,0);
  await b.commit('A',{kind:'refill',attemptId:'buy-life'});await b.commit('A',{kind:'refill',attemptId:'buy-life'});
  assert.equal((await b.read('A')).lives,5);assert.equal((await b.read('A')).gems,180);
  const grade={kind:'exam',target:'exam-0',attemptId:'exam-fail',wrongCount:7,passed:false};await b.commit('A',grade);await b.commit('A',grade);assert.equal((await b.read('A')).lives,0);
});
check('real rules: even a coherent forged wallet/event/claim batch cannot raise catalog reward',async()=>{
  const database=db('A'),result=applyGameCommand(emptyGame(),{kind:'lesson',target:'lesson-0'},{day,entry:catalog['lesson-0']}),batch=writeBatch(database);
  batch.set(doc(database,'users','A','game','main'),{...result.state,gems:1020,updatedAt:serverTimestamp()});
  batch.set(doc(database,'users','A','gameEvents',result.receipt.id),{...result.receipt,gemDelta:1000,rewardAmount:1000,createdAt:serverTimestamp()});
  batch.set(doc(database,'users','A','gameClaims','lesson-0'),{eventId:result.receipt.id,createdAt:serverTimestamp()});
  await assertFails(batch.commit());
});
const seedCommerce=async(uid,extra={})=>environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users',uid,'commerce','main'),{...emptyCommerce(),revision:1,paidGranted:5,paidLives:5,...extra,updatedAt:Timestamp.now()}));
const seedLives=async(uid,lives=0,date=day)=>environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users',uid,'game','main'),{...emptyGame(),revision:1,lifeDay:date,lives,updatedAt:Timestamp.now()}));
check('commerce rules: clients cannot grant premium, add purchased lives, rewrite ledger or read another UID',async()=>{
  const database=db('A');await assertFails(setDoc(doc(database,'users','A','commerce','main'),{...emptyCommerce(),premiumUntilMs:Date.now()+100000}));
  await seedCommerce('A');const c=await backend('A').readCommerce('A');
  for(const forged of [{...c,paidGranted:100,paidLives:100},{...c,premiumUntilMs:Date.now()+100000},{...c,paidConsumed:0,paidLives:7}])await assertFails(setDoc(doc(database,'users','A','commerce','main'),{...forged,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(database,'users','A','commercePurchases','fake'),{lives:5}));
  await assertFails(getDoc(doc(db('B'),'users','A','commerce','main')));
  await assertFails(getDoc(doc(environment.authenticatedContext('A',{email_verified:false}).firestore(),'users','A','commerce','main')));
});
check('commerce rules: paid-only incorrect answer spends once atomically and cannot replay delta',async()=>{
  await seedLives('A');await seedCommerce('A');const b=backend('A'),c={kind:'answer',target:'answer-0-1',attemptId:'paid',correct:false};
  await b.commit('A',c);await b.commit('A',c);assert.equal((await b.readCommerce('A')).paidLives,4);assert.equal((await b.read('A')).lives,0);
  const funds=await b.readCommerce('A');await assertFails(setDoc(doc(db('A'),'users','A','commerce','main'),{...funds,paidConsumed:2,paidLives:3,revision:funds.revision+1,updatedAt:serverTimestamp()}));
});
check('commerce rules: server-confirmed web purchases spend normally but client grants remain forbidden',async()=>{
  await seedLives('A');await seedCommerce('A',{store:'rc_billing'});
  const b=backend('A'),command={kind:'answer',target:'answer-0-1',attemptId:'web-paid',correct:false};
  await b.commit('A',command);await b.commit('A',command);
  const funds=await b.readCommerce('A');assert.equal(funds.store,'rc_billing');assert.equal(funds.paidLives,4);
  for(const changes of [{paidGranted:10,paidLives:9},{premiumUntilMs:Date.now()+100000},{store:'play_store'}]) {
    await assertFails(setDoc(doc(db('A'),'users','A','commerce','main'),{...funds,...changes,updatedAt:serverTimestamp()}));
  }
});
check('commerce rules: exam uses daily before purchased, caps total and retains paid balance through reset',async()=>{
  await seedLives('A',2);await seedCommerce('A');const b=backend('A'),c={kind:'exam',target:'exam-0',attemptId:'paid-exam',wrongCount:4,passed:false};
  await b.commit('A',c);await b.commit('A',c);assert.equal((await b.readCommerce('A')).paidLives,3);assert.equal((await b.read('A')).lives,0);
  await seedLives('A',0,yesterday);await b.commit('A',{kind:'open'});assert.equal((await b.read('A')).lives,5);assert.equal((await b.readCommerce('A')).paidLives,3);
});
check('commerce rules: two devices cannot consume the last purchased life twice',async()=>{
  await seedLives('A');await seedCommerce('A',{paidGranted:1,paidLives:1});
  const settled=await Promise.allSettled(['one','two'].map(attemptId=>backend('A').commit('A',{kind:'answer',target:'answer-0-1',attemptId,correct:false})));
  assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);assert.equal((await backend('A').readCommerce('A')).paidConsumed,1);
});
check('commerce rules: premium permits zero-life answers, exams and cases without spending either balance',async()=>{
  await seedLives('A');await seedCommerce('A',{premiumUntilMs:Date.now()+3600000,store:'play_store'});const b=backend('A');
  await b.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'premium-answer',correct:false});
  await b.commit('A',{kind:'exam',target:'exam-0',attemptId:'premium-exam',wrongCount:9,passed:false});
  await b.commit('A',{kind:'case-complete',target:'complete-case-1'});
  assert.equal((await b.read('A')).lives,0);assert.equal((await b.readCommerce('A')).paidLives,5);
});
check('real rules: new case rewards are atomic across devices and retain the historical case receipt',async()=>{
  await seedLives('A');await seedCommerce('A',{premiumUntilMs:Date.now()+3600000,store:'play_store'});
  const a=backend('A'),b=backend('A'),ids=['case-1','case-46','case-96','case-116','case-146','case-149','case-175'];
  const before=await a.read('A');
  for(const id of ids){
    const command={kind:'case-complete',target:'complete-'+id};
    const results=await Promise.all([a.commit('A',command),b.commit('A',command)]);
    assert.equal(results.filter(r=>r.duplicate).length,1,id);
    assert.equal((await a.commit('A',command)).duplicate,true,id+' later retry');
    assert.equal((await getDoc(doc(db('A'),'users','A','gameClaims','complete-'+id))).exists(),true);
  }
  const after=await a.read('A');
  assert.deepEqual(after.completedCases,ids);assert.equal(after.gems,before.gems+ids.length*GAME_CONFIG.caseReward);
  assert.equal(after.lives,0);assert.equal((await a.readCommerce('A')).paidLives,5);
  assert.equal(after.completedLessons,before.completedLessons);assert.equal(after.passedExams,before.passedExams);assert.deepEqual(after.badges,before.badges);
  await assert.rejects(a.commit('A',{kind:'case-complete',target:'complete-case-148'}),{code:'game/unknown-reward'});
  assert.deepEqual(await a.read('A'),after);
});
check('commerce rules: premium case payload denies free, expired, guest and unverified reads',async()=>{
  await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'premiumCases','case-1'),{schemaVersion:1,caseJson:JSON.stringify({steps:[]})}));
  await assertFails(getDoc(doc(db('A'),'premiumCases','case-1')));await seedCommerce('A',{premiumUntilMs:Date.now()-1});
  await assertFails(getDoc(doc(db('A'),'premiumCases','case-1')));
  await seedCommerce('A',{premiumUntilMs:Date.now()+3600000});assert.equal((await getDoc(doc(db('A'),'premiumCases','case-1'))).exists(),true);
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),'premiumCases','case-1')));
  await assertFails(getDoc(doc(environment.authenticatedContext('A',{email_verified:false}).firestore(),'premiumCases','case-1')));
  await assertFails(setDoc(doc(db('A'),'premiumCases','case-1'),{changed:true}));
});
check('commerce rules: forged receipt cannot omit purchased spend or force an arbitrary larger delta',async()=>{
  await seedLives('A');await seedCommerce('A');const b=backend('A'),funds=await b.readCommerce('A');
  const result=applyGameCommand(await b.read('A'),{kind:'answer',target:'answer-0-1',attemptId:'forged',correct:false},{day,commerce:funds,entry:catalog['answer-0-1']});
  const database=db('A');const batch=writeBatch(database);
  batch.set(doc(database,'users','A','game','main'),{...result.state,updatedAt:serverTimestamp()});batch.set(doc(database,'users','A','gameEvents',result.receipt.id),{...result.receipt,createdAt:serverTimestamp()});
  await assertFails(batch.commit());
  const forged=writeBatch(database);forged.set(doc(database,'users','A','game','main'),{...result.state,updatedAt:serverTimestamp()});forged.set(doc(database,'users','A','gameEvents',result.receipt.id),{...result.receipt,createdAt:serverTimestamp()});
  forged.set(doc(database,'users','A','commerce','main'),{...funds,paidLives:2,paidConsumed:3,revision:funds.revision+1,updatedAt:serverTimestamp()});await assertFails(forged.commit());
});
check('commerce rules: deletion marker blocks premium and cleanup removes private ledger',async()=>{
  await seedCommerce('A',{premiumUntilMs:Date.now()+3600000});await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','A','commercePurchases','receipt'),{lives:5}));
  await setDoc(doc(db('A'),'accountDeletions','A'),{deletedAt:serverTimestamp()});
  await assertFails(getDoc(doc(db('A'),'users','A','commerce','main')));await assertFails(getDoc(doc(db('A'),'premiumCases','case-1')));
  await backend('A').remove('A');await environment.withSecurityRulesDisabled(async c=>{assert.equal((await getDoc(doc(c.firestore(),'users','A','commerce','main'))).exists(),false);assert.equal((await getDoc(doc(c.firestore(),'users','A','commercePurchases','receipt'))).exists(),false);});
});
check('commerce rules: passing paid-only exam can bind two rewards and consumption in one transaction',async()=>{
  await seedLives('A');await seedCommerce('A');const b=backend('A');
  await b.commit('A',{kind:'exam',target:'exam-0',attemptId:'pass-paid-only',wrongCount:2,passed:true});
  assert.equal((await b.readCommerce('A')).paidLives,3);assert.equal((await b.read('A')).gems,280);
});
check('commerce rules: passing premium exam at zero lives grants first rewards without consuming',async()=>{
  await seedLives('A');await seedCommerce('A',{premiumUntilMs:Date.now()+3600000});const b=backend('A');
  await b.commit('A',{kind:'exam',target:'exam-0',attemptId:'pass-premium',wrongCount:1,passed:true});
  assert.equal((await b.readCommerce('A')).paidLives,5);assert.equal((await b.read('A')).gems,280);
});

check('skip rules: free first stock world is atomic at zero balance and permits the next paid shortcut',async()=>{
 const a=backend('A'),b=backend('A');await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','A','game','main'),{...emptyGame(),gems:0,updatedAt:Timestamp.now()}));
 const command={kind:'skip-world',target:'skip-world-45'},results=await Promise.allSettled([a.commit('A',command),b.commit('A',command)]);
 for(const result of results)assert.equal(result.status,'fulfilled',result.reason?.message);
 assert.equal((await a.read('A')).gems,0);assert.deepEqual(await b.readSkips('A'),[45]);assert.equal((await a.read('A')).passedExams,0);assert.deepEqual((await a.read('A')).badges,[]);
 await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','A','game','main'),{...emptyGame(),gems:200,revision:2,updatedAt:Timestamp.now()}));
 await a.commit('A',{kind:'skip-world',target:'skip-world-46'});assert.equal((await a.read('A')).gems,0);assert.deepEqual(await b.readSkips('A'),[45,46]);
});
check('skip rules: forged free price on another world or charging for the free first world is rejected',async()=>{
 const database=db('A');
 for(const [id,cost] of [[95,0],[45,200]]){
  const entry={...catalog['skip-world-'+id],cost};
  await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'gameCatalog','skip-world-'+id),entry));
  const original=applyGameCommand(emptyGame(),{kind:'skip-world',target:'skip-world-0'},{day,entry:catalog['skip-world-0']});
  const r=structuredClone(original);r.receipt.target='skip-world-'+id;r.receipt.rewardId=r.receipt.target;r.receipt.id='skip-world-'+r.receipt.target;r.state.lastEventId=r.receipt.id;r.state.gems=200-cost;r.receipt.gemDelta=-cost;
  const batch=writeBatch(database);batch.set(doc(database,'users','A','game','main'),{...r.state,updatedAt:serverTimestamp()});batch.set(doc(database,'users','A','gameEvents',r.receipt.id),{...r.receipt,createdAt:serverTimestamp()});batch.set(doc(database,'users','A','gameClaims',r.receipt.target),{eventId:r.receipt.id,createdAt:serverTimestamp()});batch.set(doc(database,'users','A','game','skips'),{schemaVersion:1,worldIds:[id],updatedAt:serverTimestamp()});
  await assertFails(batch.commit());
 }
});

check('skip rules: atomic 200 debit, one purchase across devices, no exam or badge rewards',async()=>{
 const a=backend('A'),b=backend('A');await a.commit('A',{kind:'open'});
 assert.equal((await a.read('A')).gems,200);
 const command={kind:'skip-world',target:'skip-world-0'};
 await Promise.all([a.commit('A',command),b.commit('A',command)]);
 assert.equal((await a.read('A')).gems,0);assert.deepEqual(await b.readSkips('A'),[0]);
 assert.equal((await a.commit('A',command)).duplicate,true);
 const w=await a.read('A');assert.equal(w.completedLessons,0);assert.equal(w.passedExams,0);assert.deepEqual(w.badges,[]);
 await assert.rejects(a.commit('A',{kind:'badge',target:'badge-world-0'}),{code:'game/badge-locked'});
 await assert.rejects(a.commit('A',{kind:'skip-world',target:'skip-world-1'}),{code:'game/insufficient-gems'});
 await assertFails(getDoc(doc(db('B'),'users','A','game','skips')));
});
check('skip rules: locked world, direct shortcut, forged cheap debit and writes without the shortcut are denied',async()=>{
 const a=backend('A'),database=db('A');
 await assert.rejects(a.commit('A',{kind:'skip-world',target:'skip-world-2'}),{code:'game/world-locked'});
 await assertFails(setDoc(doc(database,'users','A','game','skips'),{schemaVersion:1,worldIds:[2],updatedAt:serverTimestamp()}));
 const original=applyGameCommand(emptyGame(),{kind:'skip-world',target:'skip-world-0'},{day,entry:catalog['skip-world-0']});
 for(const mode of ['missing-skip','cheap','extra-world']){
  const r=structuredClone(original),batch=writeBatch(database);
  if(mode==='cheap'){r.state.gems=199;r.receipt.gemDelta=-1;}
  batch.set(doc(database,'users','A','game','main'),{...r.state,updatedAt:serverTimestamp()});
  batch.set(doc(database,'users','A','gameEvents',r.receipt.id),{...r.receipt,createdAt:serverTimestamp()});
  batch.set(doc(database,'users','A','gameClaims','skip-world-0'),{eventId:r.receipt.id,createdAt:serverTimestamp()});
  if(mode!=='missing-skip')batch.set(doc(database,'users','A','game','skips'),{schemaVersion:1,worldIds:mode==='extra-world'?[0,1]:[0],updatedAt:serverTimestamp()});
  await assertFails(batch.commit());
 }
 assert.equal((await a.read('A')).gems,200);assert.deepEqual(await a.readSkips('A'),[]);
});
check('skip rules: second world and discontinuous extension preserve the actual path and prior balances',async()=>{
 const a=backend('A');await a.commit('A',{kind:'skip-world',target:'skip-world-0'});
 await environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users','A','game','main'),{...emptyGame(),gems:620,revision:4,passedExamIds:['exam-9'],updatedAt:Timestamp.now()}));
 await a.commit('A',{kind:'skip-world',target:'skip-world-1'});
 await a.commit('A',{kind:'skip-world',target:'skip-world-20'});
 assert.equal((await a.read('A')).gems,220);assert.deepEqual(await a.readSkips('A'),[0,1,20]);
 await assertFails(setDoc(doc(db('A'),'users','A','game','skips'),{schemaVersion:1,worldIds:[0,1,20,21],updatedAt:serverTimestamp()}));
 await setDoc(doc(db('A'),'accountDeletions','A'),{deletedAt:serverTimestamp()});await a.remove('A');
 await environment.withSecurityRulesDisabled(async c=>assert.equal((await getDoc(doc(c.firestore(),'users','A','game','skips'))).exists(),false));
});

check('skip rules: retired technical world 147 is not required between passed world 146 and the 200-gem shortcut for 148',async()=>{
 const entry=catalog['skip-world-148'],command={kind:'skip-world',target:'skip-world-148'};
 assert.equal(entry.previousWorldId,146);assert.equal(entry.cost,200);assert.equal(entry.amount,0);
 const previous={...emptyGame(),gems:200,revision:1,lifeDay:day,passedExams:1,passedExamIds:['exam-146']};
 const locked={...emptyGame(),gems:200,revision:1,lifeDay:day};
 await environment.withSecurityRulesDisabled(async c=>{
  const database=c.firestore(),batch=writeBatch(database);
  batch.set(doc(database,'users','A','game','main'),{...previous,updatedAt:Timestamp.now()});
  batch.set(doc(database,'users','B','game','main'),{...locked,updatedAt:Timestamp.now()});
  await batch.commit();
 });
 const a=backend('A'),result=await a.commit('A',command);
 assert.equal(result.receipt.gemDelta,-200);assert.equal(result.receipt.rewardAmount,0);assert.equal(result.receipt.bonusAmount,0);
 assert.equal(result.receipt.lifeDelta,0);assert.deepEqual(await a.readSkips('A'),[148]);
 const after=await a.read('A');
 assert.equal(after.gems,0);assert.equal(after.completedLessons,previous.completedLessons);assert.equal(after.passedExams,1);
 assert.deepEqual(after.passedExamIds,['exam-146']);assert.deepEqual(after.badges,previous.badges);assert.equal(after.lives,previous.lives);
 for(const id of ['exam-147','exam-148','world-148','badge-world-148'])assert.equal((await getDoc(doc(db('A'),'users','A','gameClaims',id))).exists(),false);
 assert.equal((await a.commit('A',command)).duplicate,true);assert.equal((await a.read('A')).gems,0);
 const b=backend('B');await assert.rejects(b.commit('B',command),{code:'game/world-locked'});
 // Bypass the domain guard to verify the Firestore rule itself: this debit has
 // a valid event/claim/shortcut shape but no passed or skipped predecessor 146.
 const forged=applyGameCommand(previous,command,{day,entry}),database=db('B'),batch=writeBatch(database);
 batch.set(doc(database,'users','B','game','main'),{...forged.state,passedExams:locked.passedExams,passedExamIds:locked.passedExamIds,updatedAt:serverTimestamp()});
 batch.set(doc(database,'users','B','gameEvents',forged.receipt.id),{...forged.receipt,createdAt:serverTimestamp()});
 batch.set(doc(database,'users','B','gameClaims','skip-world-148'),{eventId:forged.receipt.id,createdAt:serverTimestamp()});
 batch.set(doc(database,'users','B','game','skips'),{schemaVersion:1,worldIds:[148],updatedAt:serverTimestamp()});
 await assertFails(batch.commit());
 assert.equal((await b.read('B')).gems,200);assert.deepEqual(await b.readSkips('B'),[]);
 assert.equal((await getDoc(doc(database,'users','B','gameClaims','skip-world-148'))).exists(),false);
});

const seedGemCommerce=async(uid,extra={})=>environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users',uid,'commerceGems','main'),{...emptyGemCommerce(),revision:1,granted:600,balance:600,...extra,updatedAt:Timestamp.now()}));
const seedEarnedGems=async(uid,gems,lives=0)=>environment.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'users',uid,'game','main'),{...emptyGame(),gems,revision:1,lifeDay:day,lives,updatedAt:Timestamp.now()}));

check('gem commerce rules: earned-first refill spends the exact purchased remainder once within the document budget',async()=>{
  for(const earned of [0,7,20]){
    const uid='refill-'+earned;await seedGemCommerce(uid);await seedEarnedGems(uid,earned);
    const b=backend(uid),c={kind:'refill',attemptId:'mixed'};await b.commit(uid,c);await b.commit(uid,c);
    const paid=await b.readGemCommerce(uid),wallet=await b.read(uid);
    assert.equal(paid.consumed,20-earned);assert.equal(paid.balance,580+earned);assert.equal(paid.granted,600);
    assert.equal(wallet.gems,0);assert.equal(wallet.lives,5);
  }
});

check('gem commerce rules: purchased-only and mixed world skips bind wallet, ledger, event, shortcut and claim within budget',async()=>{
  for(const earned of [0,17,200]){
    const uid='skip-'+earned;await seedGemCommerce(uid);await seedEarnedGems(uid,earned);
    const b=backend(uid),c={kind:'skip-world',target:'skip-world-0'};await b.commit(uid,c);await b.commit(uid,c);
    assert.equal((await b.readGemCommerce(uid)).consumed,200-earned);assert.equal((await b.readGemCommerce(uid)).balance,400+earned);
    assert.equal((await b.read(uid)).gems,0);assert.deepEqual(await b.readSkips(uid),[0]);
    assert.equal((await b.read(uid)).passedExams,0);assert.equal((await b.read(uid)).completedLessons,0);
  }
});

check('gem commerce rules: clients cannot grant or rewrite purchased gems, consume directly, or read another UID',async()=>{
  const database=db('A'),path=doc(database,'users','A','commerceGems','main');
  await assertFails(setDoc(path,{...emptyGemCommerce(),granted:1500,balance:1500}));
  await seedGemCommerce('A');const paid=await backend('A').readGemCommerce('A');
  for(const changes of [{granted:1500,balance:1500},{environment:'sandbox'},{consumed:20,balance:580,revision:2},{consumed:0,balance:900}])await assertFails(setDoc(path,{...paid,...changes,updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(db('B'),'users','A','commerceGems','main')));
  await assertFails(getDoc(doc(environment.authenticatedContext('A',{email_verified:false}).firestore(),'users','A','commerceGems','main')));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(),'users','A','commerceGems','main')));
});

check('gem commerce rules: omission, cheap paid debit, over-consumption and spending purchased before earned are rejected',async()=>{
  await seedGemCommerce('A');await seedEarnedGems('A',7);
  const database=db('A'),b=backend('A'),paid=await b.readGemCommerce('A'),before=await b.read('A');
  const command={kind:'refill',attemptId:'forged'},original=applyGameCommand(before,command,{day,commerceGems:paid});
  for(const mode of ['missing','cheap','extra','paid-first']){
    const result=structuredClone(original),batch=writeBatch(database);let consumed=13;
    if(mode==='cheap')consumed=12;if(mode==='extra')consumed=14;
    if(mode==='paid-first'){consumed=20;result.state.gems=7;result.receipt.gemDelta=0;}
    batch.set(doc(database,'users','A','game','main'),{...result.state,updatedAt:serverTimestamp()});
    batch.set(doc(database,'users','A','gameEvents',result.receipt.id),{...result.receipt,createdAt:serverTimestamp()});
    if(mode!=='missing')batch.set(doc(database,'users','A','commerceGems','main'),{...paid,consumed,balance:600-consumed,revision:paid.revision+1,updatedAt:serverTimestamp()});
    await assertFails(batch.commit());
  }
  assert.equal((await b.read('A')).gems,7);assert.equal((await b.readGemCommerce('A')).consumed,0);
});

check('gem commerce rules: simultaneous skips cannot double-spend purchased gems and replay leaves the exact audit unchanged',async()=>{
  await seedGemCommerce('A',{granted:200,balance:200});await seedEarnedGems('A',50);
  const a=backend('A'),b=backend('A');
  const results=await Promise.allSettled([a.commit('A',{kind:'skip-world',target:'skip-world-0'}),b.commit('A',{kind:'skip-world',target:'skip-world-10'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await a.readGemCommerce('A')).balance,50);assert.equal((await a.readGemCommerce('A')).consumed,150);
  const receipt=results.find(r=>r.status==='fulfilled').value.receipt;await a.commit('A',receipt);
  assert.equal((await a.readGemCommerce('A')).consumed,150);assert.equal((await a.readSkips('A')).length,1);
});

check('gem commerce rules: refund debt preserves earned rewards and deletion denies old-token access and clears the ledger',async()=>{
  await seedGemCommerce('A',{granted:0,consumed:230,balance:0});await seedEarnedGems('A',200);
  const b=backend('A');await b.commit('A',{kind:'skip-world',target:'skip-world-0'});
  assert.equal((await b.readGemCommerce('A')).consumed,230);
  await b.commit('A',{kind:'lesson',target:'lesson-0'});assert.equal((await b.read('A')).gems,10);
  await assert.rejects(b.commit('A',{kind:'refill',attemptId:'no-credit'}),{code:'game/insufficient-gems'});
  await setDoc(doc(db('A'),'accountDeletions','A'),{deletedAt:serverTimestamp()});
  await assertFails(getDoc(doc(db('A'),'users','A','commerceGems','main')));
  await b.remove('A');await b.remove('A');
  await environment.withSecurityRulesDisabled(async c=>assert.equal((await getDoc(doc(c.firestore(),'users','A','commerceGems','main'))).exists(),false));
});
