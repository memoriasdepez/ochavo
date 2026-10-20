import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeProgressStorage} from '../src/native-storage.js';
import {createProgressStore} from '../src/sync.js';
import {emptySnapshot,makeEnvelope} from '../src/progress.js';
import {createProgressBackend} from '../src/cloud.js';

const key=id=>'brote.progress.v1.'+id;
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const progress=id=>({...emptySnapshot(),completed:{[id]:{firstTry:3}}});
test('a fresh iPhone restores schema-8 web progress and merges its next lesson back to the same account',async t=>{
  const uid='shared-account',target=`users/${uid}/progress/main`;
  const web=makeEnvelope({...emptySnapshot(),completed:{450:{firstTry:4},453:{firstTry:5},950:{firstTry:3}},passedExams:{45:{best:9,attempts:1}},activeId:462,activeByTrack:{stocks:462},sessions:[[462,9,Array.from({length:10},(_,i)=>i===0?{v:{contentRevision:'stocks-second-depth-2026-10-13'}}:{})]]},null,100);
  const remote=new Map([[target,{schemaVersion:8,payload:JSON.stringify(web),revision:10}]]);
  const read=key=>({exists:()=>remote.has(key),data:()=>remote.get(key)});
  const backend=createProgressBackend({}, {doc:(_db,...p)=>p.join('/'),serverTimestamp:()=>123,getDocFromServer:async key=>read(key),runTransaction:async(_db,callback)=>{
    const writes=[];const result=await callback({get:async key=>read(key),set:(key,value)=>writes.push([key,value])});
    for(const [key,value] of writes)remote.set(key,value);return result;
  }});
  const preferences=fakePreferences(),storage=await createNativeProgressStorage({preferences}),statuses=[];
  const phone=createProgressStore({storage,backend,onStatus:s=>statuses.push(s),delay:1e6});t.after(()=>phone.pause());
  await phone.select({uid,emailVerified:true});await phone.flushLocal();
  assert.equal(statuses.at(-1),'saved');assert.deepEqual(phone.getSnapshot(),web.snapshot);
  assert.equal(phone.getSnapshot().sessions[0][2].length,10);
  assert.deepEqual(JSON.parse(preferences.data.get(key(uid))).data.snapshot,web.snapshot);
  phone.save({...phone.getSnapshot(),completed:{...phone.getSnapshot().completed,454:{firstTry:3}}});
  assert.equal(await phone.flush(),true);
  const fromWeb=await backend.read(uid);
  assert.deepEqual(Object.keys(fromWeb.snapshot.completed),['450','453','454','950']);
  assert.ok(fromWeb.snapshot.passedExams[45]);assert.equal(fromWeb.snapshot.sessions[0][2].length,10);
  assert.equal(remote.get(target).schemaVersion,9);assert.equal(remote.get(target).revision,11);
});
function fakePreferences(initial=[]){
  const data=new Map(initial),calls=[];
  const api={
    data,calls,beforeSet:null,beforeRemove:null,
    async keys(){return {keys:[...data.keys()]};},
    async get({key}){calls.push(['get',key]);return {value:data.get(key)??null};},
    async set({key,value}){calls.push(['set',key,value]);await api.beforeSet?.(key,value);data.set(key,value);},
    async remove({key}){calls.push(['remove',key]);await api.beforeRemove?.(key);data.delete(key);}
  };
  return api;
}
function webStorage(initial=[]){
  const data=new Map(initial);
  return {data,get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
}

test('precarga solo progreso y no permite guardar tokens u otras claves',async()=>{
  const preferences=fakePreferences([[key('A'),'account A'],['firebase:authUser:secret','auth']]);
  const storage=await createNativeProgressStorage({preferences});
  assert.equal(storage.getItem(key('A')),'account A');
  assert.deepEqual(preferences.calls,[['get',key('A')]]);
  assert.throws(()=>storage.setItem('firebase:authUser:secret','changed'));
  assert.throws(()=>storage.removeItem('unrelated'));
  assert.equal(preferences.data.get('firebase:authUser:secret'),'auth');
});

test('migra cuentas de WebView una vez; conserva autenticación e ignora copias invitadas antiguas',async()=>{
  const preferences=fakePreferences([[key('guest'),'native guest'],[key('game.guest'),'native wallet']]);
  const fallback=webStorage([[key('A'),'account A'],[key('guest'),'web guest'],[key('game.guest'),'web wallet'],['firebase:authUser:secret','auth']]);
  const storage=await createNativeProgressStorage({preferences,fallback});
  assert.equal(storage.getItem(key('A')),'account A');assert.equal(preferences.data.get(key('A')),'account A');assert.equal(fallback.getItem(key('A')),null);
  assert.equal(fallback.getItem('firebase:authUser:secret'),'auth');
  for(const id of ['guest','game.guest']){
    assert.throws(()=>storage.getItem(key(id)));assert.throws(()=>storage.setItem(key(id),'new'));assert.throws(()=>storage.removeItem(key(id)));
    assert.ok(fallback.getItem(key(id)));assert.ok(preferences.data.get(key(id)));assert.equal(preferences.calls.some(c=>c[1]===key(id)),false);
  }
  await storage.removeItem(key('A'));const restarted=await createNativeProgressStorage({preferences,fallback});assert.equal(restarted.getItem(key('A')),null);
});

test('un fallo de migración conserva la única copia local y rechaza el arranque',async()=>{
  const preferences=fakePreferences(),fallback=webStorage([[key('A'),'account A']]);
  preferences.beforeSet=()=>{throw Error('disk full');};
  await assert.rejects(createNativeProgressStorage({preferences,fallback}),/disk full/);
  assert.equal(fallback.getItem(key('A')),'account A');
  preferences.beforeSet=null;
  const storage=await createNativeProgressStorage({preferences,fallback});
  assert.equal(storage.getItem(key('A')),'account A');
});

test('un error al leer Preferences no se transforma en una cuenta vacía',async()=>{
  const preferences=fakePreferences([[key('A'),'existing']]);
  preferences.get=async()=>{throw Error('read failed');};
  await assert.rejects(createNativeProgressStorage({preferences}),/read failed/);
  assert.equal(preferences.data.get(key('A')),'existing');
});

test('migration preserves an existing account wallet and migrates other account wallets without guest data',async()=>{
  const preferences=fakePreferences([[key('game.account.A'),'native A']]);
  const fallback=webStorage([[key('game.account.A'),'older A'],[key('game.account.B'),'wallet B'],[key('game.guest'),'legacy wallet']]);
  const storage=await createNativeProgressStorage({preferences,fallback});
  assert.equal(storage.getItem(key('game.account.A')),'native A');assert.equal(storage.getItem(key('game.account.B')),'wallet B');
  assert.equal(fallback.getItem(key('game.account.A')),null);assert.equal(fallback.getItem(key('game.account.B')),null);
  assert.equal(fallback.getItem(key('game.guest')),'legacy wallet');assert.equal(preferences.data.has(key('game.guest')),false);
});

test('serializa escrituras y conserva la clave y el valor de cada cuenta',async()=>{
  const preferences=fakePreferences(),first=deferred();let blocked=true;
  preferences.beforeSet=async()=>{if(blocked){blocked=false;await first.promise;}};
  const storage=await createNativeProgressStorage({preferences});
  const a=storage.setItem(key('A'),'A1'),b=storage.setItem(key('B'),'B1'),a2=storage.setItem(key('A'),'A2');
  assert.equal(storage.getItem(key('A')),'A2');
  assert.equal(storage.getItem(key('B')),'B1');
  assert.deepEqual(preferences.calls,[['set',key('A'),'A1']]);
  first.resolve();await Promise.all([a,b,a2]);await storage.flush();
  assert.equal(preferences.data.get(key('A')),'A2');
  assert.equal(preferences.data.get(key('B')),'B1');
  assert.deepEqual(preferences.calls.map(c=>c.slice(0,2)),[['set',key('A')],['set',key('A')],['set',key('B')]]);
});

test('un fallo retiene el último valor para reintentar y restaurar tras reiniciar',async()=>{
  const preferences=fakePreferences();let fail=true;
  preferences.beforeSet=()=>{if(fail)throw Error('storage unavailable');};
  const storage=await createNativeProgressStorage({preferences});
  await assert.rejects(storage.setItem(key('A'),'A1'),/storage unavailable/);
  await assert.rejects(storage.setItem(key('A'),'A2'),/storage unavailable/);
  assert.equal(storage.getItem(key('A')),'A2');assert.equal(preferences.data.has(key('A')),false);
  fail=false;await storage.flush();
  const restarted=await createNativeProgressStorage({preferences});
  assert.equal(restarted.getItem(key('A')),'A2');
});

test('borrar durante una escritura no resucita la cuenta al reiniciar',async()=>{
  const preferences=fakePreferences(),request=deferred();preferences.beforeSet=()=>request.promise;
  const storage=await createNativeProgressStorage({preferences});
  const saving=storage.setItem(key('A'),'A1'),removing=storage.removeItem(key('A'));
  assert.equal(storage.getItem(key('A')),null);
  request.resolve();await Promise.all([saving,removing]);
  assert.equal(preferences.data.has(key('A')),false);
  const restarted=await createNativeProgressStorage({preferences});
  assert.equal(restarted.getItem(key('A')),null);
});

test('un borrado fallido queda pendiente y puede completarse con flush',async()=>{
  const preferences=fakePreferences([[key('A'),'A1']]);
  preferences.beforeRemove=()=>{throw Error('remove failed');};
  const storage=await createNativeProgressStorage({preferences});
  await assert.rejects(storage.removeItem(key('A')),/remove failed/);
  assert.equal(preferences.data.get(key('A')),'A1');
  preferences.beforeRemove=null;await storage.flush();assert.equal(preferences.data.has(key('A')),false);
});

test('el store anuncia guardado local de la cuenta solo después de la confirmación de Preferences',async t=>{
  const preferences=fakePreferences(),request=deferred(),statuses=[];preferences.beforeSet=()=>request.promise;
  const storage=await createNativeProgressStorage({preferences});const store=createProgressStore({storage,isOnline:()=>false,onStatus:s=>statuses.push(s),delay:1e6});
  t.after(async()=>{request.resolve();await store.pause();});await store.select({uid:'A',emailVerified:true});store.save(progress(0));
  assert.equal(statuses.at(-1),'saving-local');assert.equal(preferences.data.has(key('A')),false);request.resolve();assert.equal(await store.flushLocal(),true);
  assert.equal(statuses.at(-1),'offline');assert.ok(JSON.parse(preferences.data.get(key('A'))).data.snapshot.completed[0]);assert.equal(preferences.data.has(key('guest')),false);
});

test('el store muestra fallo local y retry recupera el progreso de una cuenta offline',async t=>{
  const preferences=fakePreferences(),statuses=[];let fail=true;preferences.beforeSet=()=>{if(fail)throw Error('disk full');};
  const storage=await createNativeProgressStorage({preferences});const store=createProgressStore({storage,isOnline:()=>false,onStatus:s=>statuses.push(s),delay:1e6});t.after(()=>store.pause());
  await store.select({uid:'A',emailVerified:true});store.save(progress(0));assert.equal(await store.flushLocal(),false);assert.equal(statuses.at(-1),'storage-error');
  assert.equal(await store.flush(),false);assert.ok(store.getSnapshot().completed[0]);fail=false;await store.retry();assert.equal(statuses.at(-1),'offline');
  const restarted=await createNativeProgressStorage({preferences});assert.ok(JSON.parse(restarted.getItem(key('A'))).data.snapshot.completed[0]);
});

test('cuentas offline y sus cambios pendientes sobreviven a reinicio sin mezclarse',async t=>{
  const preferences=fakePreferences(),storage=await createNativeProgressStorage({preferences});
  const options={isOnline:()=>false,delay:1e6,backend:{read:()=>assert.fail(),commit:()=>assert.fail()}};
  const store=createProgressStore({storage,...options});let restored;
  t.after(async()=>{await store.pause();await restored?.pause();});
  await store.select({uid:'A',emailVerified:true});store.save(progress(0));
  await store.select({uid:'B',emailVerified:true});store.save(progress(1));
  await store.flushLocal();await store.pause();
  restored=createProgressStore({storage:await createNativeProgressStorage({preferences}),...options});
  await restored.select({uid:'A',emailVerified:true});
  assert.deepEqual(Object.keys(restored.getSnapshot().completed),['0']);assert.equal(restored.hasPending(),true);
  await restored.select({uid:'B',emailVerified:true});
  assert.deepEqual(Object.keys(restored.getSnapshot().completed),['1']);assert.equal(restored.hasPending(),true);
});

test('flush local durante un cambio de cuenta no desbloquea una lectura todavía pendiente',async t=>{
  const preferences=fakePreferences(),storage=await createNativeProgressStorage({preferences});
  const request=deferred(),statuses=[];
  const store=createProgressStore({storage,onStatus:s=>statuses.push(s),delay:1e6,backend:{read:()=>request.promise}});
  t.after(async()=>{request.resolve(null);await store.pause();});
  await store.select(null);assert.equal(store.save(progress(0)),false);await store.flushLocal();
  const switching=store.select({uid:'A',emailVerified:true});
  await store.flushLocal();
  assert.equal(store.isReady(),false);assert.equal(statuses.at(-1),'loading');
  request.resolve(null);await switching;await store.flushLocal();
  assert.equal(store.isReady(),true);assert.equal(statuses.at(-1),'saved');
});

test('volver a una cuenta con un guardado fallido no anuncia falsamente que ya está guardado',async t=>{
  const preferences=fakePreferences(),storage=await createNativeProgressStorage({preferences}),statuses=[];
  let fail=true;preferences.beforeSet=()=>{if(fail)throw Error('disk full');};
  const store=createProgressStore({storage,onStatus:s=>statuses.push(s),isOnline:()=>false,delay:1e6});
  t.after(()=>store.pause());
  await store.select({uid:'A',emailVerified:true});store.save(progress(0));
  assert.equal(await store.flushLocal(),false);
  await store.select({uid:'B',emailVerified:true});
  await store.select({uid:'A',emailVerified:true});
  assert.equal(statuses.at(-1),'storage-error');assert.ok(store.getSnapshot().completed[0]);
  fail=false;await store.retry();assert.equal(statuses.at(-1),'offline');
  assert.ok(JSON.parse(preferences.data.get(key('A'))).data.snapshot.completed[0]);
});

test('cuentas verificadas no importan copias invitadas de Preferences ni de WebView',async t=>{
  const guest=JSON.stringify({data:makeEnvelope(progress(2)),dirty:true});const preferences=fakePreferences([[key('guest'),guest]]),fallback=webStorage([[key('guest'),guest]]);
  const storage=await createNativeProgressStorage({preferences,fallback}),store=createProgressStore({storage,isOnline:()=>false,delay:1e6});t.after(()=>store.pause());
  await store.select(null);assert.equal(store.isReady(),false);assert.equal(store.save(progress(1)),false);assert.equal(store.guestAvailable(),false);
  await store.select({uid:'A',emailVerified:true});await assert.rejects(store.importGuest(),{code:'account/guest-disabled'});assert.deepEqual(store.getSnapshot().completed,{});
  assert.equal(preferences.data.get(key('guest')),guest);assert.equal(fallback.getItem(key('guest')),guest);assert.equal(preferences.data.has(key('A')),false);
});





test('forget espera la eliminación de Preferences y el reinicio no recupera esa cuenta',async t=>{
  const a=JSON.stringify({data:makeEnvelope(progress(0)),dirty:true}),b=JSON.stringify({data:makeEnvelope(progress(1)),dirty:false});
  const preferences=fakePreferences([[key('A'),a],[key('B'),b]]),request=deferred();
  preferences.beforeRemove=()=>request.promise;
  const storage=await createNativeProgressStorage({preferences}),store=createProgressStore({storage,isOnline:()=>false,delay:1e6});
  t.after(async()=>{request.resolve();await store.pause();});
  await store.select({uid:'A',emailVerified:true});await store.pause();
  let finished=false;const deleting=store.forget('A').then(result=>{finished=true;return result;});
  await Promise.resolve();assert.equal(finished,false);assert.equal(preferences.data.get(key('A')),a);
  request.resolve();assert.equal(await deleting,true);assert.equal(preferences.data.has(key('A')),false);
  const restarted=await createNativeProgressStorage({preferences});
  assert.equal(restarted.getItem(key('A')),null);assert.equal(restarted.getItem(key('B')),b);
});

test('forget fallido en Preferences conserva el error hasta reintentar sin trasladar datos a invitado',async t=>{
  const a=JSON.stringify({data:makeEnvelope(progress(0)),dirty:false}),guest=JSON.stringify({data:makeEnvelope(progress(2)),dirty:true});
  const preferences=fakePreferences([[key('A'),a],[key('guest'),guest]]),statuses=[];
  preferences.beforeRemove=()=>{throw Error('disk unavailable');};
  const storage=await createNativeProgressStorage({preferences}),store=createProgressStore({storage,onStatus:v=>statuses.push(v),isOnline:()=>false,delay:1e6});
  t.after(()=>store.pause());
  await store.select({uid:'A',emailVerified:true});await store.pause();
  await assert.rejects(store.forget('A'),error=>error.code==='storage/delete-failed');
  assert.equal(statuses.at(-1),'storage-error');assert.equal(preferences.data.get(key('A')),a);
  assert.deepEqual(store.getSnapshot().completed,{});
  await store.select(null);assert.deepEqual(store.getSnapshot().completed,{});
  assert.equal(preferences.data.get(key('guest')),guest);
  preferences.beforeRemove=null;assert.equal(await store.forget('A'),true);
  assert.equal(preferences.data.has(key('A')),false);assert.deepEqual(store.getSnapshot().completed,{});
});
