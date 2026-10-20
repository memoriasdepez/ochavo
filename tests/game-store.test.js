import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameStore,gameStorageKey} from '../src/game-store.js';
import {emptyGame,createGameCatalog,applyGameCommand,eventIdFor} from '../src/game-domain.js';

const catalog=createGameCatalog({lessons:[{id:0,steps:[{type:'learn'},{type:'choice'}]},{id:1,steps:[{type:'learn'},{type:'choice'}]}],exams:[{id:0}]});
function setup(){
  const data=new Map(),wallets=new Map(),events=new Map(),claims=new Map(),skips=new Map(),calls=[];
  let online=true,loseResponse=false,failLocal=false;
  const storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>{if(failLocal)throw Error('disk full');data.set(key,value);},removeItem:key=>data.delete(key)};
  const backend={readSkips:async uid=>skips.get(uid)||[],read:async uid=>wallets.get(uid)||emptyGame(),commit:async(uid,c)=>{
    calls.push([uid,c]);const id=eventIdFor(c,'2026-10-04'),key=uid+'/'+id;
    const result=applyGameCommand(wallets.get(uid)||emptyGame(),c,{day:'2026-10-04',entry:catalog[c.target],existingClaims:claims.get(uid)||[],existingEvent:events.get(key),skippedWorldIds:skips.get(uid)||[]});
    skips.set(uid,result.skippedWorldIds);wallets.set(uid,result.state);if(result.receipt)events.set(key,result.receipt);claims.set(uid,[...(claims.get(uid)||[]),...result.claims.map(v=>v.id)]);
    if(loseResponse){loseResponse=false;throw Object.assign(Error('lost response'),{code:'unavailable'});}return result;
  }};
  const options={storage,backend,catalog,now:()=>Date.parse('2026-10-04T12:00:00Z'),isOnline:()=>online};
  return {data,wallets,calls,backend,storage,options,store:createGameStore(options),set online(v){online=v;},set loseResponse(v){loseResponse=v;},set failLocal(v){failLocal=v;}};
}

test('animation receipts emit only after durable confirmation, never on selecting a wallet',async()=>{
 const f=setup(),events=[],store=createGameStore({...f.options,onEvent:e=>events.push(e)});
 await store.select({uid:'A',emailVerified:true});assert.deepEqual(events,[]);
 await store.claimLesson(0);assert.equal(events.length,1);assert.equal(events[0].owner,'A');assert.equal(events[0].receipt.gemDelta,10);
 assert.equal(JSON.parse(f.data.get(gameStorageKey('A'))).state.gems,210);
 await store.claimLesson(0);assert.equal(events[1].duplicate,true);
 await store.select({uid:'A',emailVerified:true});assert.equal(events.length,2);
});
test('unacknowledged operations and a departed account cannot emit reward animations',async()=>{
 const f=setup(),events=[],store=createGameStore({...f.options,onEvent:e=>events.push(e)});
 await store.select({uid:'A',emailVerified:true});f.loseResponse=true;
 await assert.rejects(store.claimLesson(0));assert.deepEqual(events,[]);await store.retry();assert.equal(events[0].duplicate,true);
 const normal=f.backend.commit;let release,start;const gate=new Promise(r=>release=r),begun=new Promise(r=>start=r);
 f.backend.commit=async(...args)=>{start();await gate;return normal(...args);};
 const pending=store.claimLesson(1);await begun;await store.select({uid:'B',emailVerified:true});release();
 await assert.rejects(pending,{code:'game/identity-changed'});assert.equal(events.length,1);
});
test('a failed decorative observer never leaves a confirmed reward pending',async()=>{
 const f=setup(),store=createGameStore({...f.options,onEvent:()=>{throw Error('animation unavailable');}});
 await store.select({uid:'A',emailVerified:true});await store.claimLesson(0);
 assert.equal(store.getView().gems,210);assert.equal(store.getView().pending,false);assert.equal(store.getView().status,'saved');
});
test('account restart preserves receipts, gems and lives without granting welcome twice',async()=>{
  const f=setup(),user={uid:'A',emailVerified:true};await f.store.select(user);await f.store.openApp();await f.store.answer({lessonId:0,stepId:1,attemptId:'wrong',correct:false});
  const next=createGameStore(f.options);await next.select(user);await next.openApp();await next.answer({lessonId:0,stepId:1,attemptId:'wrong',correct:false});
  assert.equal(next.getView().gems,200);assert.equal(next.getView().lives,4);assert.equal(f.data.has(gameStorageKey(null)),false);
});

test('verified offline permits cached practice only; unverified and signed-out accounts cannot play',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});f.online=false;
  await assert.rejects(f.store.claimLesson(0),{code:'game/offline'});assert.equal(f.calls.length,0);assert.equal(f.store.getView().canSpend,false);assert.equal(f.store.getView().canPractice,true);
  await f.store.select({uid:'B',emailVerified:false});await assert.rejects(f.store.claimLesson(0),{code:'game/verification-required'});assert.equal(f.store.getView().canPractice,false);assert.equal(f.data.has(gameStorageKey('B')),false);
  await f.store.select(null);await assert.rejects(f.store.claimLesson(0),{code:'game/auth-required'});assert.equal(f.store.getView().status,'signed-out');assert.equal(f.store.getView().gems,0);assert.equal(f.store.getView().lives,0);assert.equal(f.store.getView().canPractice,false);
});

test('lost server response persists intent; reload retries same transaction without double charge',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});f.loseResponse=true;
  await assert.rejects(f.store.answer({lessonId:0,stepId:1,attemptId:'wrong',correct:false}));
  const next=createGameStore(f.options);await next.select({uid:'A',emailVerified:true});assert.equal(next.getView().pending,true);
  await next.retry();assert.equal(next.getView().lives,4);assert.equal(next.getView().pending,false);
});

test('an unconfirmed attempt is visible immediately and retries without spending another life',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});f.loseResponse=true;
  await assert.rejects(f.store.answer({lessonId:0,stepId:1,attemptId:'pending-visible',correct:false}));
  assert.equal(f.store.getView().pending,true);assert.equal(f.store.getView().canPlay,false);
  assert.equal(f.store.getView().status,'error');
  await f.store.retry();assert.equal(f.store.getView().pending,false);assert.equal(f.store.getView().lives,4);
  assert.equal(f.calls.filter(([,c])=>c.attemptId==='pending-visible').length,2);
});

test('one retry restores a denied initial read and confirms its previously saved attempt',async()=>{
  const f=setup(),user={uid:'A',emailVerified:true};await f.store.select(user);f.loseResponse=true;
  await assert.rejects(f.store.answer({lessonId:0,stepId:1,attemptId:'initial-denied',correct:false}));
  const read=f.backend.read;let deny=true;f.backend.read=async uid=>{if(deny)throw Object.assign(Error('permission'),{code:'permission-denied'});return read(uid);};
  const restarted=createGameStore(f.options);await assert.rejects(restarted.select(user));
  assert.equal(restarted.getView().canSpend,false);assert.equal(restarted.getView().pending,true);
  deny=false;await restarted.retry();
  assert.equal(restarted.getView().canSpend,true);assert.equal(restarted.getView().pending,false);assert.equal(restarted.getView().lives,4);
  assert.equal(f.wallets.get('A').lives,4);
});
test('durable local write failure blocks server mutation and can be retried',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});f.failLocal=true;
  await assert.rejects(f.store.claimLesson(0),{code:'game/storage-write'});assert.equal(f.calls.length,0);
  f.failLocal=false;await f.store.claimLesson(0);assert.equal(f.store.getView().gems,210);
});
test('an old account request never restores its wallet into a newly selected account',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});const normal=f.backend.commit;let release,started;
  const gate=new Promise(resolve=>release=resolve),begun=new Promise(resolve=>started=resolve);
  f.backend.commit=async(...args)=>{started();await gate;return normal(...args);};
  const pending=f.store.claimLesson(0);await begun;await f.store.select({uid:'B',emailVerified:true});release();
  await assert.rejects(pending,{code:'game/identity-changed'});assert.equal(f.store.getView().owner,'B');assert.equal(f.store.getView().gems,200);
  assert.equal(JSON.parse(f.data.get(gameStorageKey('A'))).state.gems,210);
});
test('historical progress reconciles once without fabricated errors, with explicit achievement rewards',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});const progress={completed:{0:{}},passedExams:{0:{best:8}}};
  await f.store.reconcileProgress(progress);const first=f.store.getView();await f.store.reconcileProgress(progress);
  assert.equal(f.store.getView().gems,first.gems);assert.equal(first.lives,5);assert.equal(first.gems,310);
  assert.deepEqual(first.badges.sort(),['first-lesson','world-0']);assert.ok(first.achievements.find(a=>a.id==='lessons-10').current===1);
});
test('legacy guest economy cannot be offered, imported or erased',async()=>{
  const f=setup(),legacy='unread legacy guest record';f.data.set(gameStorageKey(null),legacy);f.data.set('brote.progress.v1.guest','legacy progress');
  for(const user of [null,{uid:'A',emailVerified:false},{uid:'A',emailVerified:true}]){
    await f.store.select(user);assert.equal(f.store.guestAvailable(),false);
    await assert.rejects(f.store.importGuest({consumeGuest:true}),{code:'account/guest-disabled'});await assert.rejects(f.store.finishGuestImport(),{code:'account/guest-disabled'});
    assert.equal(f.data.get(gameStorageKey(null)),legacy);assert.equal(f.data.get('brote.progress.v1.guest'),'legacy progress');
  }
  assert.equal(f.store.getView().gems,200);assert.equal(f.calls.length,0);
});

test('daily open and historical reconciliation use durable confirmation cache without repeated network calls',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});await f.store.openApp();await f.store.reconcileProgress({completed:{0:{}},passedExams:{0:{best:8}}});
  const count=f.calls.length;await f.store.openApp();await f.store.reconcileProgress({completed:{0:{}},passedExams:{0:{best:8}}});assert.equal(f.calls.length,count);
  const restarted=createGameStore(f.options);await restarted.select({uid:'A',emailVerified:true});await restarted.openApp();await restarted.reconcileProgress({completed:{0:{}},passedExams:{0:{best:8}}});assert.equal(f.calls.length,count);
});


test('forget awaits async local deletion and leaves other accounts and guest untouched',async()=>{
  const f=setup();f.data.set(gameStorageKey(null),'legacy');await f.store.select({uid:'A',emailVerified:true});await f.store.select({uid:'B',emailVerified:true});
  const normal=f.storage.removeItem;let finish;f.storage.removeItem=key=>new Promise(resolve=>finish=()=>{normal(key);resolve();});
  let finished=false;const request=f.store.forget('A').then(()=>finished=true);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(finished,false);finish();await request;
  assert.equal(f.data.has(gameStorageKey('A')),false);assert.ok(f.data.has(gameStorageKey('B')));assert.ok(f.data.has(gameStorageKey(null)));
});






test('signed-out and Firebase anonymous users reject every economy mutation without storage or backend access',async()=>{
  const fail=()=>assert.fail('No storage or backend access expected');const store=createGameStore({storage:{getItem:fail,setItem:fail,removeItem:fail},backend:{read:fail,commit:fail},catalog});
  for(const user of [null,{uid:'anonymous',isAnonymous:true,emailVerified:true}]){
    await store.select(user);await store.retry();const view=store.getView();assert.equal(view.status,'signed-out');assert.equal(view.owner,null);assert.equal(view.canPlay,false);assert.equal(view.canSpend,false);assert.equal(view.canPractice,false);
    const actions=[()=>store.openApp(),()=>store.claimLesson(0),()=>store.claimBadge('first-lesson'),()=>store.awardAchievements(),()=>store.reconcileProgress({completed:{0:{}}}),()=>store.answer({lessonId:0,stepId:1,attemptId:'x',correct:true}),()=>store.gradeExam({examId:0,attemptId:'x',wrongCount:0,passed:true}),()=>store.buyLife(),()=>store.unlockCase({caseId:'case-1'}),()=>store.completeCase('case-1'),()=>store.claimReferral('receipt')];
    for(const action of actions)await assert.rejects(action,{code:'game/auth-required'});
  }
});

test('sign-out during a mutation preserves only its originating account cache',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});const normal=f.backend.commit;let release,started;
  const gate=new Promise(resolve=>release=resolve),begun=new Promise(resolve=>started=resolve);f.backend.commit=async(...args)=>{started();await gate;return normal(...args);};
  const request=f.store.claimLesson(0);await begun;await f.store.select(null);release();await assert.rejects(request,{code:'game/identity-changed'});
  assert.equal(f.store.getView().status,'signed-out');assert.equal(f.store.getView().gems,0);assert.equal(f.data.has(gameStorageKey(null)),false);
  f.online=false;const restarted=createGameStore(f.options);await restarted.select({uid:'A',emailVerified:true});assert.equal(restarted.getView().gems,210);assert.equal(restarted.getView().canPractice,true);
});

test('an unverified account never overwrites its existing wallet and verification restores it offline',async()=>{
  const f=setup();await f.store.select({uid:'A',emailVerified:true});await f.store.claimLesson(0);
  const saved=f.data.get(gameStorageKey('A'));f.online=false;
  await f.store.select({uid:'A',emailVerified:false});assert.equal(f.store.getView().gems,0);
  await assert.rejects(f.store.claimLesson(1),{code:'game/verification-required'});await f.store.retry();
  assert.equal(f.data.get(gameStorageKey('A')),saved);
  await f.store.select({uid:'A',emailVerified:true});assert.equal(f.store.getView().gems,210);assert.equal(f.store.getView().canPractice,true);
});

test('lost skip response recovers its stable intent after restart, with one debit and no learning credit',async()=>{
 const f=setup(),u={uid:'A',emailVerified:true};await f.store.select(u);await f.store.openApp();
 f.loseResponse=true;await assert.rejects(f.store.skipWorld(0));
 const restarted=createGameStore(f.options);await restarted.select(u);assert.equal(restarted.getView().gems,0);
 await restarted.retry();assert.equal(restarted.getView().gems,0);assert.deepEqual(restarted.getView().skippedWorldIds,[0]);
 assert.equal(restarted.getView().completedLessons,0);assert.equal(restarted.getView().passedExams,0);assert.equal(restarted.getView().pending,false);
 await restarted.claimLesson(0);assert.deepEqual(restarted.getView().skippedWorldIds,[0]);assert.equal(restarted.getView().gems,10);
 await restarted.select({uid:'B',emailVerified:true});assert.equal(restarted.getView().gems,200);assert.deepEqual(restarted.getView().skippedWorldIds,[]);
 await restarted.select(null);assert.deepEqual(restarted.getView().skippedWorldIds,[]);
});
