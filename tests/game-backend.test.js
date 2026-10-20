import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameBackend} from '../src/game-backend.js';
import {GAME_CONFIG,createGameCatalog,dayWindow,emptyGame,emptyCommerce,emptyGemCommerce,LIFETIME_PREMIUM_UNTIL_MS} from '../src/game-domain.js';

function fixture(){
  const data=new Map(),versions=new Map(),day='2026-10-04',window=dayWindow(day),catalog=createGameCatalog({lessons:[{id:0,steps:[{type:'learn'},{type:'choice'}]}],exams:[{id:0}]});
  data.set('gameConfig/economy',GAME_CONFIG);data.set('gameDays/'+day,window);for(const [id,entry] of Object.entries(catalog))data.set('gameCatalog/'+id,entry);
  const snapshot=key=>({ref:key,exists:()=>data.has(key),data:()=>structuredClone(data.get(key))});let retries=0;
  const api={doc:(_,...parts)=>parts.join('/'),serverTimestamp:()=>123,getDocFromServer:async key=>snapshot(key),runTransaction:async(_,fn)=>{
    for(let attempt=0;attempt<20;attempt++){
      const reads=new Map(),writes=[];
      const result=await fn({get:async key=>{reads.set(key,versions.get(key)||0);return snapshot(key);},set:(key,value)=>writes.push([key,value])});
      if([...reads].some(([key,version])=>(versions.get(key)||0)!==version)){retries++;continue;}
      for(const [key,value] of writes){data.set(key,structuredClone(value));versions.set(key,(versions.get(key)||0)+1);}return result;
    }
    throw Error('contention');
  },collection:(_,...parts)=>parts.join('/'),limit:n=>n,where:(field,op,value)=>({field,op,value}),query:(prefix,...constraints)=>({prefix,count:constraints.find(c=>typeof c==='number'),filter:constraints.find(c=>c?.field)}),getDocs:async({prefix,count,filter})=>{
    const docs=[...data.keys()].filter(key=>key.startsWith(prefix+'/')&&(!filter||data.get(key)[filter.field]===filter.value)).slice(0,count).map(snapshot);return {docs,empty:docs.length===0};
  },writeBatch:()=>{const keys=[],updates=[];return {delete:key=>keys.push(key),update:(key,value)=>updates.push([key,value]),commit:async()=>{for(const [key,value] of updates)data.set(key,{...data.get(key),...value});for(const key of keys)data.delete(key);}};}};
  return {data,api,catalog,get retries(){return retries;},backend:createGameBackend({}, {api,now:()=>Date.parse('2026-10-04T12:00:00Z')})};
}

test('free intro is atomic across devices, preserves a zero balance and supports subsequent paid shortcuts',async()=>{
 const f=fixture();f.data.set('users/A/game/main',{...emptyGame(),gems:0});
 const free={kind:'skip-world',target:'skip-world-45'};
 const results=await Promise.all([f.backend.commit('A',free),f.backend.commit('A',free)]);
 assert.equal(results.filter(r=>r.duplicate).length,1);assert.equal((await f.backend.read('A')).gems,0);assert.deepEqual(await f.backend.readSkips('A'),[45]);
 assert.equal((await f.backend.read('A')).passedExams,0);assert.deepEqual((await f.backend.read('A')).badges,[]);
 f.data.set('users/A/game/main',{...await f.backend.read('A'),gems:200});await f.backend.commit('A',{kind:'skip-world',target:'skip-world-46'});
 assert.equal((await f.backend.read('A')).gems,0);assert.deepEqual(await f.backend.readSkips('A'),[45,46]);
});

test('new account starts with exactly 200; skip debits atomically, preserves learning counts and retries for free',async()=>{
 const f=fixture();await f.backend.commit('A',{kind:'open'});
 assert.equal((await f.backend.read('A')).gems,200);
 const skip={kind:'skip-world',target:'skip-world-0'};
 const [a,b]=await Promise.all([f.backend.commit('A',skip),f.backend.commit('A',skip)]);
 assert.equal([a,b].filter(r=>r.duplicate).length,1);
 const w=await f.backend.read('A');assert.equal(w.gems,0);assert.equal(w.completedLessons,0);assert.equal(w.passedExams,0);
 assert.deepEqual(w.passedExamIds,[]);assert.deepEqual(w.badges,[]);assert.deepEqual(await f.backend.readSkips('A'),[0]);
 assert.equal((await f.backend.commit('A',skip)).duplicate,true);
 await assert.rejects(f.backend.commit('A',{kind:'skip-world',target:'skip-world-1'}),{code:'game/insufficient-gems'});
 await assert.rejects(f.backend.commit('B',{kind:'skip-world',target:'skip-world-2'}),{code:'game/world-locked'});
 assert.equal((await f.backend.read('B')).gems,200);assert.deepEqual(await f.backend.readSkips('B'),[]);
});
test('existing balance is preserved; skipping uses the actual order across added world ranges',async()=>{
 const f=fixture();f.data.set('users/A/game/main',{...emptyGame(),gems:444,passedExamIds:['exam-9']});
 const r=await f.backend.commit('A',{kind:'skip-world',target:'skip-world-20'});
 assert.equal(r.state.gems,244);assert.deepEqual(await f.backend.readSkips('A'),[20]);
 assert.equal(r.state.passedExams,0);assert.deepEqual(r.state.passedExamIds,['exam-9']);
 f.data.set('accountDeletions/A',{deletedAt:123});await f.backend.remove('A');
 assert.equal(f.data.has('users/A/game/skips'),false);
});
test('different simultaneous skips cannot spend one welcome twice',async()=>{
 const f=fixture();const r=await Promise.allSettled([0,10].map(id=>f.backend.commit('A',{kind:'skip-world',target:'skip-world-'+id})));
 assert.equal(r.filter(v=>v.status==='fulfilled').length,1);assert.equal((await f.backend.read('A')).gems,0);
 assert.equal((await f.backend.readSkips('A')).length,1);
});
test('a genuinely passed world cannot be charged and new welcome never replaces an old wallet',async()=>{
 const f=fixture(),old={...emptyGame(),gems:17,revision:12,passedExamIds:['exam-0'],lifeDay:'2026-10-04',lastOpenDay:'2026-10-04'};
 f.data.set('users/A/game/main',old);
 await assert.rejects(f.backend.commit('A',{kind:'skip-world',target:'skip-world-0'}),{code:'game/world-complete'});
 assert.deepEqual(await f.backend.read('A'),old);
});
test('transaction retries concurrent correct submissions, one claim and one gem',async()=>{
  const f=fixture();
  await Promise.all(['a','b'].map(attemptId=>f.backend.commit('A',{kind:'answer',target:'answer-0-1',correct:true,attemptId})));
  assert.equal(f.data.get('users/A/game/main').gems,201);assert.equal(f.data.get('users/A/game/main').revision,2);
  assert.equal([...f.data.keys()].filter(k=>k.startsWith('users/A/gameClaims/')).length,1);assert.ok(f.retries>0);
});
test('old case purchases are denied without spending gems',async()=>{
 const f=fixture();await f.backend.commit('A',{kind:'exam-credit',target:'exam-0'});
 await assert.rejects(f.backend.commit('A',{kind:'case',target:'case-1'}),{code:'game/premium-required'});
 assert.equal((await f.backend.read('A')).gems,280);
});
test('two independent refills with one balance serialize; second cannot spend again',async()=>{
  const f=fixture();f.data.set('users/A/game/main',{...emptyGame(),gems:20,lives:0,lifeDay:'2026-10-04'});
  const results=await Promise.allSettled(['a','b'].map(attemptId=>f.backend.commit('A',{kind:'refill',attemptId})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.data.get('users/A/game/main').gems,0);assert.equal(f.data.get('users/A/game/main').lives,5);
});
test('stable exam ID survives a lost response and does not charge or reward twice',async()=>{
  const f=fixture(),command={kind:'exam',target:'exam-0',attemptId:'submission',wrongCount:2,passed:true};
  await f.backend.commit('A',command);const result=await f.backend.commit('A',command);
  assert.equal(result.duplicate,true);assert.equal(result.state.gems,280);assert.equal(result.state.lives,3);
});
test('different users cannot share a reward receipt or referral evidence',async()=>{
  const f=fixture();f.data.set('users/A/referrals/receipt',{qualifiedAt:123});
  await f.backend.commit('A',{kind:'referral',target:'receipt'});
  await assert.rejects(f.backend.commit('B',{kind:'referral',target:'receipt'}),{code:'game/referral-unverified'});
  assert.equal((await f.backend.read('B')).gems,200);assert.equal((await f.backend.read('A')).gems,230);
});
test('deletion marker blocks reads/writes and cleanup is bounded, repeatable and account-scoped',async()=>{
  const f=fixture();await f.backend.commit('A',{kind:'lesson',target:'lesson-0'});await f.backend.commit('B',{kind:'lesson',target:'lesson-0'});
  await assert.rejects(f.backend.remove('A'),{code:'game/deletion-marker-required'});
  for(let i=0;i<405;i++)f.data.set('users/A/gameEvents/extra-'+i,{});
  f.data.set('accountDeletions/A',{deletedAt:123});
  await assert.rejects(f.backend.read('A'),{code:'account/deletion-pending'});await assert.rejects(f.backend.commit('A',{kind:'open'}),{code:'account/deletion-pending'});
  await f.backend.remove('A');await f.backend.remove('A');
  assert.equal([...f.data.keys()].some(k=>k.startsWith('users/A/game')),false);assert.equal(f.data.has('users/B/game/main'),true);
});
test('missing calendar/catalog fail closed instead of inventing rewards',async()=>{
  const f=fixture();f.data.delete('gameDays/2026-10-04');await assert.rejects(f.backend.commit('A',{kind:'open'}),{code:'game/calendar-unavailable'});
  assert.equal(f.data.has('users/A/game/main'),false);
});
test('a permission race retries only after an observed wallet revision advance',async()=>{
  const f=fixture(),normal=f.api.runTransaction;let calls=0;
  f.api.runTransaction=async(...args)=>{calls++;const result=await normal(...args);if(calls===1)throw Object.assign(Error('rules saw a newer commit'),{code:'permission-denied'});return result;};
  const result=await f.backend.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'same',correct:true});
  assert.equal(calls,2);assert.equal(result.state.gems,201);assert.equal(result.duplicate,true);
});
test('permission denial without revision advance is never bypassed by retries',async()=>{
  const f=fixture();let calls=0;
  f.api.runTransaction=async(_db,callback)=>{calls++;await callback({get:async key=>({exists:()=>f.data.has(key),data:()=>f.data.get(key)}),set:()=>{}});throw Object.assign(Error('denied'),{code:'permission-denied'});};
  await assert.rejects(f.backend.commit('A',{kind:'lesson',target:'lesson-0'}),{code:'permission-denied'});
  assert.equal(calls,1);assert.equal(f.data.has('users/A/game/main'),false);
});

const lifetime={schemaVersion:1,codeHash:'a'.repeat(64),grantedAt:123};
test('server promotion enables zero-life practice and cases without rewriting the paid entitlement',async()=>{
  const f=fixture(),billing={...emptyCommerce(),revision:8,paidGranted:5,paidConsumed:2,paidLives:3,store:'play_store'};
  f.data.set('users/A/commerce/main',billing);f.data.set('users/A/promotions/lifetime',lifetime);
  f.data.set('users/A/game/main',{...emptyGame(),lifeDay:'2026-10-04',lives:0});
  const funds=await f.backend.readCommerce('A');assert.equal(funds.lifetimePremium,true);assert.equal(funds.premiumUntilMs,LIFETIME_PREMIUM_UNTIL_MS);
  assert.equal(funds.paidPremiumUntilMs,0);
  const answer=await f.backend.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'promo-answer',correct:false});
  assert.equal(answer.state.lives,0);assert.equal(answer.commerce.paidLives,3);assert.equal(answer.commerce.lifetimePremium,true);
  const exam=await f.backend.commit('A',{kind:'exam',target:'exam-0',attemptId:'promo-exam',wrongCount:8,passed:false});
  assert.equal(exam.state.lives,0);assert.deepEqual(f.data.get('users/A/commerce/main'),billing);
  const result=await f.backend.commit('A',{kind:'case-complete',target:'complete-case-1'});
  assert.deepEqual(result.state.completedCases,['case-1']);assert.equal(result.commerce.lifetimePremium,true);
  assert.equal((await f.backend.readCommerce('B')).lifetimePremium,undefined);
});

test('billing expiry and refund updates cannot erase an independent lifetime grant',async()=>{
  const f=fixture();f.data.set('users/A/promotions/lifetime',lifetime);
  f.data.set('users/A/commerce/main',{...emptyCommerce(),premiumUntilMs:Date.parse('2027-01-01'),store:'play_store'});
  assert.equal((await f.backend.readCommerce('A')).paidPremiumUntilMs,Date.parse('2027-01-01'));
  f.data.set('users/A/commerce/main',{...emptyCommerce(),revision:2,paidConsumed:4});
  const updated=await f.backend.readCommerce('A');assert.equal(updated.lifetimePremium,true);assert.equal(updated.paidPremiumUntilMs,0);assert.equal(updated.paidConsumed,4);
  assert.deepEqual(f.data.get('users/A/promotions/lifetime'),lifetime);
});

test('consuming purchased lives updates only paid counters and keeps original subscription fields',async()=>{
  const f=fixture(),billing={...emptyCommerce(),revision:3,paidGranted:5,paidLives:5,premiumUntilMs:1,store:'play_store',customerReference:'server-owned'};
  f.data.set('users/A/commerce/main',billing);f.data.set('users/A/game/main',{...emptyGame(),lifeDay:'2026-10-04',lives:0});
  await f.backend.commit('A',{kind:'answer',target:'answer-0-1',attemptId:'paid',correct:false});
  assert.deepEqual(f.data.get('users/A/commerce/main'),{...billing,revision:4,paidConsumed:1,paidLives:4,updatedAt:123});
});

test('deletion removes grants and admin roles, redacts identities, and never recycles a code',async()=>{
  const f=fixture(),hash=lifetime.codeHash;
  f.data.set('users/A/promotions/lifetime',lifetime);f.data.set('promoAdmins/A',{enabled:true});f.data.set('promoAdmins/B',{enabled:true});
  f.data.set('promoCodes/'+hash,{status:'redeemed',createdBy:'A',label:'Friend',redeemedBy:'A',redeemedAt:123});
  for(let i=0;i<205;i++)f.data.set('promoCodes/unused-'+i,{status:'available',createdBy:'A',label:'Invite',redeemedBy:''});
  f.data.set('promoCodes/other',{status:'redeemed',createdBy:'B',label:'Keep',redeemedBy:'B'});
  f.data.set('accountDeletions/A',{deletedAt:123});
  f.data.set('users/A/preferences/communications',{newsletter:true});
  f.data.set('users/A/consentEvents/record',{newsletter:true});
  await f.backend.remove('A');await f.backend.remove('A');
  assert.equal(f.data.has('users/A/preferences/communications'),false);
  assert.equal(f.data.has('users/A/consentEvents/record'),false);
  assert.equal(f.data.has('users/A/promotions/lifetime'),false);assert.equal(f.data.has('promoAdmins/A'),false);assert.equal(f.data.has('promoAdmins/B'),true);
  assert.deepEqual(f.data.get('promoCodes/'+hash),{status:'redeemed',createdBy:'',label:'',redeemedBy:'',redeemedAt:123});
  assert.equal(f.data.get('promoCodes/unused-204').status,'disabled');assert.equal(f.data.get('promoCodes/other').createdBy,'B');
});

test('missing or invalid protected grants never create lifetime access',async()=>{
  const f=fixture();f.data.set('users/A/commerce/main',{...emptyCommerce(),lifetimePremium:true,paidPremiumUntilMs:0});
  assert.equal((await f.backend.readCommerce('A')).lifetimePremium,undefined);
  f.data.set('users/A/promotions/lifetime',{...lifetime,codeHash:'forged'});
  await assert.rejects(f.backend.readCommerce('A'),{code:'game/invalid-commerce'});
  await assert.rejects(f.backend.commit('A',{kind:'open'}),{code:'game/invalid-commerce'});
});

test('purchased gems pay only the remainder after earned gems; receipt retries consume once and preserve protected fields',async()=>{
  const f=fixture(),paid={...emptyGemCommerce(),revision:3,granted:200,balance:200,serverReference:'private'};
  f.data.set('users/A/game/main',{...emptyGame(),gems:7,lives:0,lifeDay:'2026-10-04'});
  f.data.set('users/A/commerceGems/main',paid);
  const command={kind:'refill',attemptId:'mixed-gems'},result=await f.backend.commit('A',command);
  assert.equal(result.state.gems,0);assert.equal(result.receipt.gemDelta,-7);assert.equal(result.commerceGems.balance,187);
  assert.deepEqual(f.data.get('users/A/commerceGems/main'),{...paid,revision:4,consumed:13,balance:187,updatedAt:123});
  assert.equal((await f.backend.commit('A',command)).duplicate,true);
  assert.equal((await f.backend.readGemCommerce('A')).consumed,13);
  assert.equal(Object.keys(f.data.get('users/A/gameEvents/attempt-mixed-gems')).length,17);
  const previous=structuredClone(f.data.get('users/A/commerceGems/main'));
  f.data.set('users/A/game/main',{...result.state,gems:210});
  await f.backend.commit('A',{kind:'skip-world',target:'skip-world-0'});
  assert.deepEqual(f.data.get('users/A/commerceGems/main'),previous,'earned-only spend cannot rewrite purchased counters');
});

test('purchased-only skip is audited atomically; concurrent different worlds cannot overspend a combined balance',async()=>{
  const f=fixture();f.data.set('users/A/game/main',{...emptyGame(),gems:50});
  f.data.set('users/A/commerceGems/main',{...emptyGemCommerce(),revision:1,granted:200,balance:200});
  const results=await Promise.allSettled([0,10].map(id=>f.backend.commit('A',{kind:'skip-world',target:'skip-world-'+id})));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await f.backend.read('A')).gems,0);assert.equal((await f.backend.readGemCommerce('A')).balance,50);
  assert.equal((await f.backend.readGemCommerce('A')).consumed,150);assert.equal((await f.backend.readSkips('A')).length,1);
  const accepted=results.find(r=>r.status==='fulfilled').value.receipt;
  assert.equal((await f.backend.commit('A',accepted)).duplicate,true);
  assert.equal((await f.backend.readGemCommerce('A')).consumed,150);
});

test('refund debt never removes earned gems; missing commerce grants nothing and cleanup removes only the account ledger',async()=>{
  const f=fixture();f.data.set('users/A/commerceGems/main',{...emptyGemCommerce(),revision:2,granted:0,consumed:150,balance:0});
  f.data.set('users/B/commerceGems/main',{...emptyGemCommerce(),granted:600,balance:600});
  await f.backend.commit('A',{kind:'skip-world',target:'skip-world-0'});
  assert.equal((await f.backend.readGemCommerce('A')).consumed,150);
  await assert.rejects(f.backend.commit('A',{kind:'skip-world',target:'skip-world-1'}),{code:'game/insufficient-gems'});
  assert.deepEqual(await f.backend.readGemCommerce('C'),emptyGemCommerce());
  f.data.set('accountDeletions/A',{deletedAt:123});
  await assert.rejects(f.backend.readGemCommerce('A'),{code:'account/deletion-pending'});
  await f.backend.remove('A');assert.equal(f.data.has('users/A/commerceGems/main'),false);assert.equal(f.data.get('users/B/commerceGems/main').balance,600);
});

test('a denied spend retries a newer purchased ledger revision and cannot spend a concurrent refund',async()=>{
  const f=fixture();f.data.set('users/A/game/main',{...emptyGame(),gems:0,lives:0,lifeDay:'2026-10-04'});
  f.data.set('users/A/commerceGems/main',{...emptyGemCommerce(),revision:1,granted:200,balance:200});
  const normal=f.api.runTransaction;let calls=0;
  f.api.runTransaction=async(_db,callback)=>{
    calls++;
    if(calls!==1)return normal(_db,callback);
    await callback({get:async key=>({exists:()=>f.data.has(key),data:()=>structuredClone(f.data.get(key))}),set(){}});
    f.data.set('users/A/commerceGems/main',{...emptyGemCommerce(),revision:2});
    throw Object.assign(Error('rules observed refunded balance'),{code:'permission-denied'});
  };
  await assert.rejects(f.backend.commit('A',{kind:'refill',attemptId:'refund-race'}),{code:'game/insufficient-gems'});
  assert.equal(calls,2);assert.equal((await f.backend.read('A')).gems,0);assert.equal((await f.backend.read('A')).lives,0);
  assert.equal(f.data.has('users/A/gameEvents/attempt-refund-race'),false);assert.equal((await f.backend.readGemCommerce('A')).consumed,0);
});
