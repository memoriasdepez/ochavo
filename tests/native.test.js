import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthLifecycle,isAndroidNative,isNativeMobile,mountNativeLifecycle} from '../src/native.js';

const android={isNativePlatform:()=>true,getPlatform:()=>'android'};
const ios={isNativePlatform:()=>true,getPlatform:()=>'ios'};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function plugin(){
  const listeners=new Map();
  let removed=0;
  return {listeners,get removed(){return removed;},
    async addListener(name,handler){listeners.set(name,handler);return {async remove(){removed++;listeners.delete(name);}};},
    emit(name,value){listeners.get(name)?.(value);}
  };
}

async function runtime(overrides={}){
  const app={...plugin(),minimizeApp:async()=>{calls.push('minimize');}};
  const network={...plugin(),getStatus:async()=>({connected:true,connectionType:'wifi'})};
  const calls=[];
  const course={flushInputs:()=>calls.push('inputs'),backToPath:()=>{calls.push('path');return false;}};
  const store={isReady:()=>true,flushLocal:async()=>{calls.push('local');return true;},flush:async()=>{calls.push('cloud');return true;},retry:async()=>calls.push('retry')};
  const document={activeElement:null,querySelectorAll:()=>[],defaultView:{Event}};
  const controller=await mountNativeLifecycle({platform:android,loadPlugins:async()=>({app,network}),store,getCourse:()=>course,document,...overrides});
  return {app,network,calls,course,store,document,controller};
}

class Dialog extends EventTarget{
  open=true;
  busy=false;
  getAttribute(name){return name==='aria-busy'?String(this.busy):null;}
  close(){this.open=false;}
}

test('Android back from the account gate minimizes without creating guest progress',async()=>{
  const {controller,store,calls}=await runtime();store.isReady=()=>false;
  assert.equal(await controller.back(),'minimized');assert.deepEqual(calls,['minimize']);
  await controller.dispose();
});

test('browser and unsupported native platforms do not load mobile plugins',async()=>{
  let loads=0;
  for(const platform of [{isNativePlatform:()=>false,getPlatform:()=>'web'},{isNativePlatform:()=>true,getPlatform:()=>'desktop'},{isNativePlatform:()=>false,getPlatform:()=>'ios'}]){
    assert.equal(isAndroidNative(platform),false);
    assert.equal(isNativeMobile(platform),false);
    const runtime=await mountNativeLifecycle({platform,loadPlugins:async()=>{loads++;throw Error('must not load');}});
    assert.equal(runtime.native,false);
    await runtime.dispose();
  }
  assert.equal(loads,0);
});

test('iOS saves and resumes through native events without a back listener or minimization',async()=>{
  assert.equal(isNativeMobile(android),true);
  assert.equal(isAndroidNative(android),true);
  assert.equal(isNativeMobile(ios),true);
  assert.equal(isAndroidNative(ios),false);
  let refreshes=0;
  const statuses=[];
  const {controller,app,network,calls}=await runtime({platform:ios,onResume:async()=>{refreshes++;},onConnection:status=>statuses.push(status.connected)});
  assert.equal(controller.native,true);
  assert.deepEqual([...app.listeners.keys()],['pause','resume']);
  assert.equal(await controller.back(),'unsupported');
  assert.deepEqual(calls,[]);
  app.emit('pause');
  assert.equal(calls[0],'inputs');
  await tick();
  assert.ok(calls.includes('local'));assert.ok(calls.includes('cloud'));
  // Cold start and returning from Mail/Safari use the same protected refresh.
  await controller.resumeIfPending();
  assert.equal(refreshes,1);
  app.emit('resume');await tick();
  assert.equal(refreshes,2);
  network.emit('networkStatusChange',{connected:false,connectionType:'none'});
  network.emit('networkStatusChange',{connected:true,connectionType:'wifi'});
  await tick();
  assert.equal(refreshes,3);
  assert.equal(calls.filter(call=>call==='retry').length,3);
  assert.ok(statuses.includes(false));
  assert.ok(!calls.includes('minimize'));assert.ok(!calls.includes('path'));
  await controller.dispose();
  assert.equal(app.listeners.size,0);assert.equal(network.listeners.size,0);
  assert.equal(await controller.resume(),false);
});

test('back cancels only the top confirmation before navigating or minimizing',async()=>{
  const account=new Dialog(),confirmation=new Dialog();
  let confirmed=0;
  confirmation.addEventListener('cancel',event=>{event.preventDefault();confirmation.close();});
  confirmation.addEventListener('submit',()=>confirmed++);
  const document={activeElement:{closest:()=>confirmation.open?confirmation:account},querySelectorAll:()=>[account,confirmation].filter(d=>d.open),defaultView:{Event}};
  const {controller,calls}=await runtime({document});
  assert.equal(await controller.back(),'dialog');
  assert.equal(confirmation.open,false);
  assert.equal(account.open,true);
  assert.equal(confirmed,0);
  assert.deepEqual(calls,[]);
  assert.equal(await controller.back(),'dialog');
  assert.equal(account.open,false);
  await controller.dispose();
});

test('back respects a cancel veto and busy account operations',async()=>{
  const dialog=new Dialog();dialog.addEventListener('cancel',event=>event.preventDefault());
  let busy=false;
  const {controller,calls}=await runtime({isBusy:()=>busy,document:{activeElement:null,querySelectorAll:()=>[dialog],defaultView:{Event}}});
  assert.equal(await controller.back(),'dialog');assert.equal(dialog.open,true);
  dialog.busy=true;assert.equal(await controller.back(),'blocked');
  dialog.busy=false;busy=true;assert.equal(await controller.back(),'blocked');
  assert.deepEqual(calls,[]);
  await controller.dispose();
});

test('a course page returns to the path; the root waits for durable storage before minimizing',async()=>{
  const {controller,course,calls,store}=await runtime();
  course.backToPath=()=>{calls.push('preserved-path');return true;};
  assert.equal(await controller.back(),'path');
  assert.deepEqual(calls,['preserved-path']);
  calls.length=0;course.backToPath=()=>false;
  const write=deferred();store.flushLocal=()=>{calls.push('local');return write.promise;};
  const back=controller.back();
  assert.equal(await controller.back(),'blocked');
  assert.deepEqual(calls,['local']);
  write.resolve(true);
  assert.equal(await back,'minimized');
  assert.ok(calls.includes('cloud'));assert.ok(calls.includes('minimize'));
  await controller.dispose();
});

test('failed local saving or an account operation started during saving prevents minimizing',async()=>{
  let busy=false;
  const {controller,store,calls}=await runtime({isBusy:()=>busy});
  store.flushLocal=async()=>false;
  assert.equal(await controller.back(),'blocked');assert.ok(!calls.includes('minimize'));
  const write=deferred();store.flushLocal=()=>write.promise;
  const back=controller.back();busy=true;write.resolve(true);
  assert.equal(await back,'blocked');assert.ok(!calls.includes('minimize'));
  await controller.dispose();
});

test('pause captures input synchronously and drains local storage without pausing the store',async()=>{
  const {app,controller,calls,store}=await runtime();
  store.pause=()=>{throw Error('destructive store pause must not run');};
  app.emit('pause');
  assert.equal(calls[0],'inputs');
  await tick();
  assert.ok(calls.includes('local'));assert.ok(calls.includes('cloud'));
  await controller.dispose();
});

test('resume and network recovery share one refresh, deferred while the UI is busy',async()=>{
  let busy=true,refreshes=0;
  const refresh=deferred();
  const {controller,network,calls}=await runtime({isBusy:()=>busy,onResume:()=>{refreshes++;return refresh.promise;}});
  await controller.resume();assert.equal(refreshes,0);
  busy=false;
  const resumed=controller.resumeIfPending();
  await tick();
  network.emit('networkStatusChange',{connected:true,connectionType:'wifi'});
  const duplicate=controller.resume();
  await tick();assert.equal(refreshes,1);
  refresh.resolve();await resumed;await duplicate;
  assert.equal(calls.filter(c=>c==='retry').length,1);
  await controller.dispose();
});

test('native network status is forwarded, and disposal stops a pending resume',async()=>{
  const statuses=[],refresh=deferred();
  const {controller,network,app,calls}=await runtime({onConnection:s=>statuses.push(s.connected),onResume:()=>refresh.promise});
  network.emit('networkStatusChange',{connected:false,connectionType:'none'});
  assert.deepEqual(statuses,[true,false]);
  const resuming=controller.resume();await tick();await controller.dispose();refresh.resolve();await resuming;
  assert.ok(!calls.includes('retry'));
  assert.equal(app.listeners.size,0);assert.equal(network.listeners.size,0);
  assert.equal(await controller.back(),'blocked');
});

test('partially installed listeners are removed if setup fails',async()=>{
  const app=plugin();
  await assert.rejects(mountNativeLifecycle({platform:android,loadPlugins:async()=>({app,network:{addListener:async()=>{throw Error('plugin unavailable');}}})}),/plugin unavailable/);
  assert.equal(app.listeners.size,0);assert.equal(app.removed,3);
});

function authHarness(overrides={}){
  const state={user:{uid:'a',emailVerified:false},busy:false,selected:[],shown:[],ready:0,reloads:0,tokens:0};
  const lifecycle=createAuthLifecycle({getUser:()=>state.user,isBusy:()=>state.busy,
    reloadUser:async()=>{state.reloads++;},refreshToken:async()=>{state.tokens++;},
    selectUser:async user=>state.selected.push(user),onUser:user=>state.shown.push(user),onReady:()=>state.ready++,...overrides});
  return {state,lifecycle};
}

test('an unchanged verification never reselects or resets progress',async()=>{
  const {state,lifecycle}=authHarness();
  assert.equal(await lifecycle.refresh({background:true}),state.user);
  assert.equal(state.reloads,1);assert.equal(state.tokens,0);assert.deepEqual(state.selected,[]);
  state.user.emailVerified=true;
  await lifecycle.refresh({background:true});
  assert.equal(state.reloads,1);assert.deepEqual(state.selected,[]);
});

test('verification reload cannot select the old user after logout or account replacement',async()=>{
  const wait=deferred();
  const {state,lifecycle}=authHarness({reloadUser:()=>wait.promise});
  const old=state.user;
  const first=lifecycle.refresh({background:true});
  const duplicate=lifecycle.refresh({background:true});
  assert.equal(first,duplicate);
  state.user={uid:'b',emailVerified:false};old.emailVerified=true;wait.resolve();
  assert.equal(await first,null);assert.deepEqual(state.selected,[]);assert.equal(state.tokens,0);assert.deepEqual(state.shown,[]);
});

test('identity is checked again after token renewal; same UID with a new identity is still a change',async()=>{
  const token=deferred();
  const {state,lifecycle}=authHarness({reloadUser:async user=>{user.emailVerified=true;},refreshToken:()=>token.promise});
  const refreshing=lifecycle.refresh({background:true});await tick();
  state.user={uid:'a',emailVerified:true};token.resolve();
  assert.equal(await refreshing,null);assert.deepEqual(state.selected,[]);
});

test('background verification yields to a busy account operation without re-opening a paused store',async()=>{
  const reload=deferred();
  const {state,lifecycle}=authHarness({reloadUser:()=>reload.promise});
  const refreshing=lifecycle.refresh({background:true});state.busy=true;state.user.emailVerified=true;reload.resolve();
  assert.equal(await refreshing,null);assert.deepEqual(state.selected,[]);assert.equal(state.tokens,0);
  await lifecycle.select(state.user);assert.deepEqual(state.selected,[]);
  state.busy=false;await lifecycle.select(state.user);assert.equal(state.selected.length,1);
});

test('duplicate token events share selection; completion for an old identity cannot update the new UI',async()=>{
  const oldLoad=deferred();
  const {state,lifecycle}=authHarness({selectUser:user=>user.uid==='a'?oldLoad.promise:Promise.resolve()});
  const first=lifecycle.select(state.user);
  assert.equal(lifecycle.select(state.user),first);
  state.user={uid:'b',emailVerified:true};
  assert.equal(await lifecycle.select(state.user),true);assert.equal(state.ready,1);
  oldLoad.resolve();assert.equal(await first,false);assert.equal(state.ready,1);
  assert.equal(state.shown.at(-1).uid,'b');
});

test('manual verification during a UI action defers selection until that action settles',async()=>{
  const {state,lifecycle}=authHarness({reloadUser:async user=>{user.emailVerified=true;}});
  state.busy=true;
  assert.equal(await lifecycle.refresh(),state.user);assert.equal(state.tokens,1);assert.deepEqual(state.selected,[]);
  state.busy=false;await lifecycle.select(state.user);assert.equal(state.selected.length,1);
});

test('obsolete selection errors cannot replace a newer account or signed-out view with session failure',async()=>{
  for(const replacement of [null,{uid:'b',emailVerified:true},{uid:'a',emailVerified:true}]){
    const oldLoad=deferred();let selections=0;
    const {state,lifecycle}=authHarness({selectUser:()=>++selections===1?oldLoad.promise:Promise.resolve()});
    const first=lifecycle.select(state.user);
    state.user=replacement;assert.equal(await lifecycle.select(state.user),true);assert.equal(state.ready,1);
    oldLoad.reject(Object.assign(Error('Missing or insufficient permissions.'),{code:'permission-denied'}));
    assert.equal(await first,false);assert.equal(state.ready,1);
    assert.equal(state.shown.at(-1),replacement);
  }
});

test('a stale generation on the same User object cannot report an obsolete selection error',async()=>{
  const oldLoad=deferred();let selections=0;
  const {state,lifecycle}=authHarness({selectUser:()=>++selections===1?oldLoad.promise:Promise.resolve()});
  const first=lifecycle.select(state.user);state.user.emailVerified=true;
  assert.equal(await lifecycle.select(state.user),true);oldLoad.reject(Error('old request failed'));
  assert.equal(await first,false);assert.equal(state.ready,1);
});

test('a current selection error remains visible and can be retried',async()=>{
  const error=Object.assign(Error('Missing or insufficient permissions.'),{code:'permission-denied'});
  let failing=true;
  const {state,lifecycle}=authHarness({selectUser:async()=>{if(failing)throw error;}});
  await assert.rejects(lifecycle.select(state.user),error);assert.equal(state.ready,0);
  failing=false;assert.equal(await lifecycle.select(state.user),true);assert.equal(state.ready,1);
});
