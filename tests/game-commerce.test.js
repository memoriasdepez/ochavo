import test from 'node:test';
import assert from 'node:assert/strict';
import {applyGameCommand,emptyGame,emptyCommerce,emptyGemCommerce,validateGemCommerce,effectiveCommerce,createGameCatalog,currentGame,validateCommerce} from '../src/game-domain.js';
import {createGameStore,gameStorageKey} from '../src/game-store.js';
const now=Date.parse('2026-10-04T12:00:00Z'),day='2026-10-04';
const catalog=createGameCatalog({lessons:[{id:0,steps:[{type:'choice'}]}],exams:[{id:0}]});
const funds=(extra={})=>({...emptyCommerce(),revision:1,paidGranted:5,paidLives:5,...extra});
const run=(state,command,commerce)=>applyGameCommand(state,command,{day,now,commerce,entry:catalog[command.target]});
const exam={kind:'exam',target:'exam-0',attemptId:'exam',wrongCount:4,passed:false};
test('exam spends daily then paid lives; next day reset never erases purchased balance',()=>{
  const result=run({...emptyGame(),lifeDay:day,lives:2},exam,funds());
  assert.equal(result.state.lives,0);assert.equal(result.commerce.paidLives,3);assert.equal(result.commerce.paidConsumed,2);
  assert.equal(currentGame(result.state,'2026-10-05').lives,5);assert.equal(result.commerce.paidLives,3);
});
test('premium allows zero daily lives and preserves both balances; exact expiry consumes again',()=>{
  const state={...emptyGame(),lifeDay:day,lives:0};
  const premium=run(state,exam,funds({premiumUntilMs:now+1}));assert.equal(premium.commerce.paidLives,5);assert.equal(premium.state.lives,0);
  const expired=run(state,exam,funds({premiumUntilMs:now}));assert.equal(expired.commerce.paidLives,1);
});
test('exam caps combined consumption, retries do not consume paid lives twice',()=>{
  const result=run({...emptyGame(),lifeDay:day,lives:1},exam,funds({paidGranted:2,paidLives:2}));
  assert.equal(result.commerce.paidLives,0);assert.equal(result.commerce.paidConsumed,2);
  const repeated=applyGameCommand(result.state,exam,{day,now,commerce:result.commerce,existingEvent:result.receipt});
  assert.equal(repeated.commerce.paidConsumed,2);assert.equal(repeated.duplicate,true);
  assert.throws(()=>run(result.state,{...exam,attemptId:'new'},result.commerce),{code:'game/no-lives'});
});
test('refund debt cannot produce negative lives or free play',()=>{
  const commerce=funds({paidGranted:0,paidConsumed:3,paidLives:0});
  assert.throws(()=>run({...emptyGame(),lifeDay:day,lives:0},exam,commerce),{code:'game/no-lives'});
});

test('server-confirmed web purchases preserve benefits and consumption across the shared game',()=>{
  const state={...emptyGame(),lifeDay:day,lives:0};
  const web=funds({store:'rc_billing',premiumUntilMs:now+1});
  assert.equal(run(state,exam,web).commerce.paidLives,5);
  const expired=run(state,exam,{...web,premiumUntilMs:now});
  assert.equal(expired.commerce.store,'rc_billing');assert.equal(expired.commerce.paidLives,1);
  const lifetime=effectiveCommerce(web,{schemaVersion:1,codeHash:'a'.repeat(64),grantedAt:now});
  assert.equal(lifetime.lifetimePremium,true);assert.equal(lifetime.paidPremiumUntilMs,now+1);
  assert.throws(()=>validateCommerce({...web,store:'unverified_web'}),{code:'game/invalid-commerce'});
  assert.throws(()=>validateCommerce({...web,paidLives:500}),{code:'game/invalid-commerce'});
});

test('web commerce is available only while confirmed for the current verified account',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};let online=true;
  const backend={read:async()=>emptyGame(),readCommerce:async uid=>uid==='A'?funds({premiumUntilMs:now+1000,store:'rc_billing'}):emptyCommerce()};
  const store=createGameStore({storage,backend,catalog,now:()=>now,isOnline:()=>online});
  await store.select({uid:'A',emailVerified:true});assert.equal(store.getView().premium,true);assert.equal(store.getView().paidLives,5);
  assert.equal(JSON.parse(data.get(gameStorageKey('A'))).commerce,undefined);
  online=false;assert.equal(store.getView().premium,false);assert.equal(store.getView().paidLives,0);
  online=true;await store.select({uid:'B',emailVerified:true});assert.equal(store.getView().premium,false);
  await store.select({uid:'A',emailVerified:false});assert.equal(store.getView().premium,false);
});
test('store ignores forged commerce in cache, clears premium offline and on account switch',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};let online=true;
  const backend={read:async()=>emptyGame(),readCommerce:async uid=>uid==='A'?funds({premiumUntilMs:now+1000,store:'play_store'}):emptyCommerce()};
  const store=createGameStore({storage,backend,catalog,now:()=>now,isOnline:()=>online});
  await store.select({uid:'A',emailVerified:true});assert.equal(store.getView().premium,true);assert.equal(store.getView().paidLives,5);
  assert.equal(JSON.parse(data.get(gameStorageKey('A'))).commerce,undefined);
  online=false;assert.equal(store.getView().premium,false);assert.equal(store.getView().paidLives,0);
  online=true;await store.select({uid:'B',emailVerified:true});assert.equal(store.getView().premium,false);
  await store.select(null);assert.equal(store.getView().paidLives,0);
});
test('late commerce refresh cannot attach previous accounts entitlement to current account',async()=>{
  const storage={getItem:()=>null,setItem:()=>{}};let finish;
  const backend={read:async()=>emptyGame(),readCommerce:async()=>emptyCommerce()};
  const store=createGameStore({storage,backend,catalog,now:()=>now});await store.select({uid:'A',emailVerified:true});
  backend.readCommerce=uid=>uid==='A'?new Promise(r=>finish=r):Promise.resolve(emptyCommerce());
  const pending=store.refreshCommerce();await store.select({uid:'B',emailVerified:true});finish(funds({premiumUntilMs:now+1000}));
  await assert.rejects(pending,{code:'game/identity-changed'});assert.equal(store.getView().owner,'B');assert.equal(store.getView().premium,false);
});

test('lifetime view uses only current server identity, keeps subscription status separate, and never caches grants',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};let online=true,granted=false,paidUntil=now+1000;
  const backend={read:async()=>({...emptyGame(),lifeDay:day,lives:0}),readCommerce:async uid=>uid==='A'?effectiveCommerce(funds({premiumUntilMs:paidUntil,store:'play_store'}),granted?{schemaVersion:1,codeHash:'a'.repeat(64),grantedAt:now}:null):emptyCommerce()};
  const store=createGameStore({storage,backend,catalog,now:()=>now,isOnline:()=>online});
  await store.select({uid:'A',emailVerified:true});assert.equal(store.getView().lifetimePremium,false);
  granted=true;await store.refreshCommerce();
  assert.equal(store.getView().lifetimePremium,true);assert.equal(store.getView().canPlay,true);assert.equal(store.getView().paidSubscriptionActive,true);assert.equal(store.getView().paidPremiumUntilMs,paidUntil);
  paidUntil=0;await store.refreshCommerce();assert.equal(store.getView().lifetimePremium,true);assert.equal(store.getView().paidSubscriptionActive,false);
  assert.equal(JSON.parse(data.get(gameStorageKey('A'))).commerce,undefined);
  online=false;assert.equal(store.getView().lifetimePremium,false);assert.equal(store.getView().premium,false);
  online=true;await store.select({uid:'B',emailVerified:true});assert.equal(store.getView().lifetimePremium,false);
  await store.select({uid:'A',emailVerified:false});assert.equal(store.getView().lifetimePremium,false);
  await store.select(null);assert.equal(store.getView().lifetimePremium,false);
});

test('a failed promotion refresh fails closed until the server confirms again',async()=>{
  const grant=effectiveCommerce(emptyCommerce(),{schemaVersion:1,codeHash:'a'.repeat(64),grantedAt:now});
  const backend={read:async()=>emptyGame(),readCommerce:async()=>grant};
  const store=createGameStore({storage:{getItem:()=>null,setItem:()=>{}},backend,catalog,now:()=>now});
  await store.select({uid:'A',emailVerified:true});assert.equal(store.getView().lifetimePremium,true);
  backend.readCommerce=async()=>{throw Error('server unavailable');};
  await assert.rejects(store.refreshCommerce());assert.equal(store.getView().lifetimePremium,false);assert.equal(store.getView().commerceConfirmed,false);
});

test('purchased gem ledger validates derived balance and preserves refund debt without affecting learning rewards',()=>{
  const paid={...emptyGemCommerce(),granted:200,consumed:250,balance:0};
  assert.equal(validateGemCommerce(paid).consumed,250);
  for(const changes of [{balance:1},{consumed:-1},{granted:1.5},{environment:'fake'},{revision:NaN}])assert.throws(()=>validateGemCommerce({...paid,...changes}),{code:'game/invalid-commerce'});
  const state={...emptyGame(),gems:12,lives:0,lifeDay:day};
  assert.throws(()=>applyGameCommand(state,{kind:'refill',attemptId:'debt'},{day,commerceGems:paid}),{code:'game/insufficient-gems'});
  const earned=applyGameCommand(state,{kind:'lesson',target:'lesson-0'},{day,commerceGems:paid,entry:catalog['lesson-0']});
  assert.equal(earned.state.gems,22);assert.equal(earned.commerceGems.consumed,250);
  const refill=applyGameCommand(earned.state,{kind:'refill',attemptId:'earned'},{day,commerceGems:paid});
  assert.equal(refill.state.gems,2);assert.equal(refill.commerceGems.balance,0);assert.equal(refill.commerceGems.consumed,250);
});

test('store exposes confirmed combined gems, excludes purchased counters from offline cache and updates them after spending',async()=>{
  const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};let online=true;
  let state={...emptyGame(),gems:7,lives:0,lifeDay:day},paid={...emptyGemCommerce(),revision:1,granted:200,balance:200};
  const backend={read:async()=>state,readCommerce:async()=>emptyCommerce(),readGemCommerce:async()=>paid,commit:async(_uid,c)=>{
    const result=applyGameCommand(state,c,{day,now,commerceGems:paid});state=result.state;paid=result.commerceGems;return result;
  }};
  const store=createGameStore({storage,backend,catalog,now:()=>now,isOnline:()=>online});
  await store.select({uid:'A',emailVerified:true});
  assert.equal(store.getView().gems,207);assert.equal(store.getView().earnedGems,7);assert.equal(store.getView().paidGems,200);assert.equal(store.getView().gemsConfirmed,true);
  await store.buyLife({requestId:'mixed'});assert.equal(store.getView().gems,187);assert.equal(store.getView().paidGems,187);assert.equal(store.getView().earnedGems,0);
  const cached=JSON.parse(data.get(gameStorageKey('A')));assert.equal(cached.state.gems,0);assert.equal(cached.commerceGems,undefined);assert.equal(cached.commerce,undefined);
  online=false;assert.equal(store.getView().gems,0);assert.equal(store.getView().paidGems,0);assert.equal(store.getView().gemsConfirmed,false);
  await assert.rejects(store.buyLife({requestId:'offline'}),{code:'game/offline'});
  online=true;paid={...paid,granted:0,balance:0};await store.refreshCommerce();
  assert.equal(store.getView().gems,0);assert.equal(store.getView().gemDebt,13);
  await store.select(null);assert.equal(store.getView().gems,0);assert.equal(store.getView().gemDebt,0);
});

test('failed or late purchased-gem refresh cannot show unconfirmed balance or another accounts purchase',async()=>{
  const paid={...emptyGemCommerce(),revision:1,granted:600,balance:600};let resolve;
  const backend={read:async()=>({...emptyGame(),gems:3}),readCommerce:async()=>emptyCommerce(),readGemCommerce:async uid=>uid==='A'?paid:emptyGemCommerce()};
  const store=createGameStore({storage:{getItem:()=>null,setItem:()=>{}},backend,catalog,now:()=>now});
  await store.select({uid:'A',emailVerified:true});assert.equal(store.getView().gems,603);
  backend.readGemCommerce=async()=>{throw Error('unavailable');};
  await assert.rejects(store.refreshCommerce());assert.equal(store.getView().gems,3);assert.equal(store.getView().gemsConfirmed,false);
  backend.readGemCommerce=uid=>uid==='A'?new Promise(r=>resolve=r):Promise.resolve(emptyGemCommerce());
  const pending=store.refreshCommerce();await store.select({uid:'B',emailVerified:true});resolve(paid);
  await assert.rejects(pending,{code:'game/identity-changed'});assert.equal(store.getView().owner,'B');assert.equal(store.getView().gems,3);assert.equal(store.getView().paidGems,0);
});
