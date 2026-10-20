import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressStore} from '../src/sync.js';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {deleteAccountWithProgress} from '../src/delete-account.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};};
const user=id=>({uid:id,emailVerified:true});
const progress=id=>({...emptySnapshot(),completed:{[id]:{firstTry:3}}});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const deletionPending=()=>Object.assign(Error('Account deletion pending'),{code:'account/deletion-pending'});

test('a newer cloud format preserves local work, blocks a false fresh start and can recover safely',async t=>{
  const storage=memory(),statuses=[],calls=[];
  const cached=JSON.stringify({data:makeEnvelope(progress(450),null,100),dirty:true});
  storage.setItem('brote.progress.v1.A',cached);
  let compatible=false,online=true;
  const remote=makeEnvelope({...emptySnapshot(),completed:{450:{firstTry:4},451:{firstTry:3}},passedExams:{45:{best:9,attempts:1}}},null,200);
  const s=createProgressStore({storage,onStatus:v=>statuses.push(v),isOnline:()=>online,delay:1e6,backend:{
    read:async uid=>{calls.push('read:'+uid);if(uid!=='A')return null;if(!compatible)throw Object.assign(Error('Update required'),{code:'progress/update-required'});return remote;},
    commit:async(uid,p)=>{calls.push('commit:'+uid);return mergeProgress(remote,p);}
  }});
  t.after(()=>s.pause());
  await s.select(user('A'));
  assert.equal(statuses.at(-1),'update-required');assert.ok(s.getSnapshot().completed[450]);
  assert.equal(s.save(progress(452)),false);assert.equal(await s.flush(),false);
  assert.equal(storage.getItem('brote.progress.v1.A'),cached);assert.deepEqual(calls,['read:A']);
  online=false;await s.retry();assert.equal(statuses.at(-1),'update-required');
  online=true;compatible=true;await s.retry();await s.flush();
  assert.equal(statuses.at(-1),'saved');
  assert.deepEqual(Object.keys(s.getSnapshot().completed),['450','451']);
  assert.ok(s.getSnapshot().passedExams[45]);assert.ok(calls.includes('commit:A'));
  await s.select(user('B'));assert.equal(statuses.at(-1),'saved');assert.deepEqual(s.getSnapshot().completed,{});
});
test('an unreadable local copy is retained and cannot overwrite server progress as an empty account',async t=>{
  for(const raw of ['{truncated','null',JSON.stringify({data:{schema:1,snapshot:{version:5}}}),JSON.stringify({data:{schema:99,snapshot:progress(0)}})]){
    const storage=memory(),statuses=[];storage.setItem('brote.progress.v1.A',raw);
    const s=createProgressStore({storage,onStatus:value=>statuses.push(value),backend:{read:()=>assert.fail('no cloud read'),commit:()=>assert.fail('no cloud mutation')}});
    t.after(()=>s.pause());await assert.rejects(s.select(user('A')),{code:'storage/read-failed'});
    assert.equal(statuses.at(-1),'storage-invalid');assert.equal(s.isReady(),false);assert.equal(s.save(progress(1)),false);await s.retry();assert.equal(storage.getItem('brote.progress.v1.A'),raw);
  }
});
test('a deleted account stops cloud attempts while retaining its local copy and isolating guest and another account',async t=>{
  const storage=memory(),statuses=[],calls=[];
  storage.setItem('brote.progress.v1.A',JSON.stringify({data:makeEnvelope(progress(0)),dirty:true}));
  storage.setItem('brote.progress.v1.guest',JSON.stringify({data:makeEnvelope(progress(2)),dirty:true}));
  const s=createProgressStore({storage,onStatus:v=>statuses.push(v),delay:1e6,backend:{read:async uid=>{calls.push('read:'+uid);if(uid==='A')throw deletionPending();return null;},commit:async(uid,p)=>{calls.push('commit:'+uid);return p;}}});
  t.after(()=>s.pause());
  await s.select(user('A'));assert.equal(statuses.at(-1),'deletion-pending');assert.ok(s.getSnapshot().completed[0]);
  s.save(progress(1));assert.equal(statuses.at(-1),'deletion-pending');
  await s.retry();assert.equal(await s.flush(),false);
  await assert.rejects(s.importGuest(),error=>error.code==='account/guest-disabled');
  assert.equal(s.guestAvailable(),false);assert.deepEqual(calls,['read:A']);assert.equal(s.hasPending(),false);
  await s.select(user('B'));assert.deepEqual(s.getSnapshot().completed,{});
  s.save(progress(3));assert.equal(await s.flush(),true);assert.equal(statuses.at(-1),'saved');
  assert.deepEqual(calls,['read:A','read:B','commit:B']);
  await s.select(null);assert.deepEqual(s.getSnapshot().completed,{});assert.equal(statuses.at(-1),'signed-out');assert.ok(storage.getItem('brote.progress.v1.guest'));
});
test('a deletion marker discovered on upload stops retries and never touches the legacy guest source',async t=>{
  const storage=memory(),statuses=[];let commits=0;
  const guest=JSON.stringify({data:makeEnvelope(progress(2)),dirty:true});storage.setItem('brote.progress.v1.guest',guest);
  const s=createProgressStore({storage,onStatus:v=>statuses.push(v),delay:1e6,backend:{read:async()=>null,commit:async()=>{commits++;throw deletionPending();}}});
  t.after(()=>s.pause());await s.select(user('A'));s.save(progress(1));assert.equal(await s.flush(),false);
  assert.equal(statuses.at(-1),'deletion-pending');assert.equal(s.guestAvailable(),false);assert.ok(s.getSnapshot().completed[1]);
  await s.retry();await s.flush();assert.equal(commits,1);assert.equal(storage.getItem('brote.progress.v1.guest'),guest);
});

test('failed Auth deletion retains the barrier and local copy; a later deletion retry completes',async t=>{
  const storage=memory(),identity=user('A'),statuses=[];let marked=false,commits=0,current=identity;
  const s=createProgressStore({storage,onStatus:v=>statuses.push(v),delay:1e6,backend:{read:async()=>{if(marked)throw deletionPending();return null;},commit:async(_uid,p)=>{commits++;return p;}}});
  t.after(()=>s.pause());await s.select(identity);s.save(progress(0));await s.flush();
  const options={user:identity,authenticate:async()=>{},removeProgress:async()=>{marked=true;},deleteIdentity:async()=>{throw Error('Auth unavailable');},getCurrentUser:()=>current,store:s};
  await assert.rejects(deleteAccountWithProgress(options),/bloqueado nuevas subidas/);
  assert.equal(marked,true);assert.equal(statuses.at(-1),'deletion-pending');assert.ok(s.getSnapshot().completed[0]);
  await s.retry();await s.flush();assert.equal(commits,1);
  options.deleteIdentity=async()=>{current=null;};
  await deleteAccountWithProgress(options);
  assert.equal(storage.getItem('brote.progress.v1.A'),null);assert.equal(marked,true);
});
test('a late successful upload cannot replace deletion-pending detected by another in-flight read',async t=>{
  const reading=deferred(),writing=deferred(),statuses=[],merged=[];let reads=0;
  const s=createProgressStore({storage:memory(),onStatus:v=>statuses.push(v),onMerge:v=>merged.push(v),delay:1e6,backend:{read:()=>++reads===1?Promise.resolve(null):reading.promise,commit:()=>writing.promise}});
  t.after(async()=>{writing.resolve(makeEnvelope(progress(0)));await s.pause();});
  await s.select(user('A'));const refresh=s.retry();s.save(progress(0));const upload=s.flush();
  reading.reject(deletionPending());await refresh;assert.equal(statuses.at(-1),'deletion-pending');
  writing.resolve(makeEnvelope(progress(0)));assert.equal(await upload,false);
  assert.equal(statuses.at(-1),'deletion-pending');assert.deepEqual(merged,[]);
});
test('retry vuelve a persistir una copia web fallida de una cuenta verificada offline',async t=>{
  let failing=true;const values=new Map(),statuses=[];
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(failing)throw Error('storage unavailable');values.set(key,value);},removeItem:key=>values.delete(key)};
  const s=createProgressStore({storage,isOnline:()=>false,onStatus:value=>statuses.push(value),backend:{read:()=>assert.fail('no cloud read expected'),commit:()=>assert.fail('no cloud commit expected')}});
  t.after(()=>s.pause());await s.select(user('A'));assert.equal(s.save(progress(3)),false);
  assert.equal(statuses.at(-1),'storage-error');assert.equal(values.size,0);
  failing=false;await s.retry();assert.equal(statuses.at(-1),'offline');assert.equal(await s.flushLocal(),true);
  const saved=JSON.parse(values.get('brote.progress.v1.A'));assert.deepEqual(saved.data.snapshot.completed,progress(3).completed);assert.equal(saved.dirty,true);
});

test('retry no vuelve a persistir una cuenta web pausada para eliminación',async()=>{
  let failing=true,writes=0;
  const storage={getItem:()=>null,setItem:()=>{if(failing)throw Error('storage unavailable');writes++;},removeItem:()=>{}};
  const s=createProgressStore({storage,isOnline:()=>false});
  await s.select(user('A'));s.save(progress(3));await s.pause();
  failing=false;await s.retry();assert.equal(writes,0);assert.equal(s.isReady(),false);
});
test('A→B limpia la vista y nunca mezcla logros',async()=>{
  const restored=[],commits=[];const backend={read:async uid=>uid==='A'?makeEnvelope(progress(0)):null,commit:async(uid,p)=>{commits.push(uid);return p;}};
  const s=createProgressStore({storage:memory(),backend,onRestore:p=>restored.push(p),delay:1e6});
  await s.select(user('A'));assert.ok(s.getSnapshot().completed[0]);await s.select(user('B'));assert.deepEqual(s.getSnapshot().completed,{});
  s.save(progress(1));await s.flush();assert.deepEqual(commits,['B']);await s.pause();
});
test('carga tardía de A no reemplaza la cuenta B',async()=>{
  const request=deferred();const s=createProgressStore({storage:memory(),backend:{read:uid=>uid==='A'?request.promise:Promise.resolve(null)},delay:1e6});
  const a=s.select(user('A'));await s.select(user('B'));request.resolve(makeEnvelope(progress(0)));await a;
  assert.equal(s.getOwner(),'B');assert.deepEqual(s.getSnapshot().completed,{});await s.pause();
});
test('el timer no envía a B un guardado pendiente de A',async()=>{
  const commits=[];const storage=memory();const s=createProgressStore({storage,backend:{read:async()=>null,commit:async(uid,p)=>{commits.push(uid);return p;}},delay:10});
  await s.select(user('A'));s.save(progress(0));await s.select(user('B'));await new Promise(r=>setTimeout(r,25));assert.deepEqual(commits,[]);
  await s.select(user('A'));await s.flush();assert.deepEqual(commits,['A']);await s.pause();
});
test('solo muestra sincronizado tras confirmación del servidor',async()=>{
  const statuses=[],request=deferred();const s=createProgressStore({storage:memory(),backend:{read:async()=>null,commit:()=>request.promise},onStatus:v=>statuses.push(v),delay:1e6});
  await s.select(user('A'));s.save(progress(0));const pending=s.flush();assert.equal(statuses.at(-1),'saving');request.resolve(makeEnvelope(progress(0)));await pending;assert.equal(statuses.at(-1),'saved');await s.pause();
});
test('error de red conserva la copia y reintenta sin perder progreso',async()=>{
  let fail=true;const storage=memory(),statuses=[];const backend={read:async()=>null,commit:async(u,p)=>{if(fail)throw Error('offline');return p;}};
  const s=createProgressStore({storage,backend,onStatus:v=>statuses.push(v),delay:1e6});await s.select(user('A'));s.save(progress(0));assert.equal(await s.flush(),false);assert.equal(statuses.at(-1),'error');assert.ok(s.getSnapshot().completed[0]);fail=false;await s.retry();assert.equal(statuses.at(-1),'saved');await s.pause();
  const t=createProgressStore({storage,backend});await t.select(user('A'));assert.ok(t.getSnapshot().completed[0]);await t.pause();
});
test('legacy guest progress is never loaded, offered, imported or erased',async t=>{
  const storage=memory(),legacy=JSON.stringify({data:makeEnvelope(progress(2)),dirty:true});storage.setItem('brote.progress.v1.guest',legacy);
  const s=createProgressStore({storage,backend:{read:async()=>null,commit:async(u,p)=>p},delay:1e6});t.after(()=>s.pause());
  for(const identity of [null,user('A')]){
    await s.select(identity);assert.deepEqual(s.getSnapshot().completed,{});assert.equal(s.guestAvailable(),false);
    await assert.rejects(s.importGuest(),{code:'account/guest-disabled'});assert.equal(storage.getItem('brote.progress.v1.guest'),legacy);
  }
  assert.deepEqual(JSON.parse(storage.getItem('brote.progress.v1.A')).data.snapshot.completed,{});
});

test('signed-out, anonymous and unverified identities cannot read, create or save progress',async t=>{
  for(const [identity,expected] of [[null,'signed-out'],[{uid:'anonymous',isAnonymous:true,emailVerified:true},'signed-out'],[{uid:'A',emailVerified:false},'unverified']]){
    await t.test(expected+':'+(identity?.uid||'none'),async()=>{
      let status;const fail=()=>assert.fail('No storage or cloud operation expected');
      const s=createProgressStore({storage:{getItem:fail,setItem:fail,removeItem:fail},backend:{read:fail,commit:fail},onStatus:s=>status=s});
      await s.select(identity);assert.equal(s.isReady(),false);assert.equal(s.save(progress(0)),false);assert.equal(await s.flush(),false);
      await s.retry();assert.equal(status,expected);assert.equal(s.hasPending(),false);assert.deepEqual(s.getSnapshot().completed,{});
      await assert.rejects(s.importGuest(),{code:'account/guest-disabled'});await s.pause();
    });
  }
});

test('verification gates an existing account copy without modifying it; verifying restores it offline',async t=>{
  const storage=memory(),saved=JSON.stringify({data:makeEnvelope(progress(0)),dirty:true});storage.setItem('brote.progress.v1.A',saved);
  const s=createProgressStore({storage,isOnline:()=>false});t.after(()=>s.pause());
  await s.select({uid:'A',emailVerified:false});assert.equal(s.save(progress(1)),false);assert.deepEqual(s.getSnapshot().completed,{});
  assert.equal(storage.getItem('brote.progress.v1.A'),saved);
  await s.select(user('A'));assert.ok(s.getSnapshot().completed[0]);assert.equal(s.hasPending(),true);
});

test('fusionar nube nunca resta niveles locales ya completados',async()=>{
  const remote=makeEnvelope(progress(1));const s=createProgressStore({storage:memory(),backend:{read:async()=>remote,commit:async(u,p)=>mergeProgress(remote,p)},delay:1e6});await s.select(user('A'));s.save({...s.getSnapshot(),completed:{...s.getSnapshot().completed,0:{firstTry:4}}});await s.flush();assert.deepEqual(Object.keys(s.getSnapshot().completed),['0','1']);await s.pause();
});

test('B envía su progreso después de esperar al guardado pendiente de A',async t=>{
  const request=deferred(),commits=[],merged=[];
  const s=createProgressStore({
    storage:memory(),delay:1e6,onMerge:p=>merged.push(p),
    backend:{
      read:async()=>null,
      commit:async(uid,p)=>{commits.push({uid,data:structuredClone(p)});return uid==='A'?request.promise:p;}
    }
  });
  t.after(async()=>{request.resolve(makeEnvelope(progress(0)));await s.pause();});
  await s.select(user('A'));s.save(progress(0));const first=s.flush();
  await s.select(user('B'));s.save(progress(1));const second=s.flush();
  assert.deepEqual(commits.map(c=>c.uid),['A']);
  request.resolve(commits[0].data);
  assert.deepEqual(await Promise.all([first,second]),[false,true]);
  assert.deepEqual(commits.map(c=>c.uid),['A','B']);
  assert.deepEqual(Object.keys(commits[1].data.snapshot.completed),['1']);
  assert.deepEqual(Object.keys(s.getSnapshot().completed),['1']);
  assert.equal(s.getOwner(),'B');assert.equal(s.hasPending(),false);
  assert.equal(merged.length,1);assert.deepEqual(Object.keys(merged[0].completed),['1']);
});

test('un guardado del motor no borra sesiones ni examen remotos que aún no conoce',async t=>{
  let remote=null;const commits=[];
  const s=createProgressStore({
    storage:memory(),delay:1e6,
    backend:{read:async()=>remote,commit:async(uid,p)=>{commits.push(structuredClone(p));return mergeProgress(remote,p);}}
  });
  t.after(()=>s.pause());
  await s.select(user('A'));
  const engineBeforeRemote=s.getSnapshot();
  const session=[2,3,Array.from({length:8},(_,i)=>i===3?{n:'145'}:{})];
  const exam={id:45,step:2,order:[4,0,8,2,9,1,5,7,6,3],drafts:Array.from({length:10},(_,i)=>i===4?{c:2}:{}),submitted:false};
  remote=makeEnvelope({...emptySnapshot(),sessions:[session],activeId:2,exam},null,100);
  await s.retry();
  assert.deepEqual(s.getSnapshot().sessions,[session]);assert.deepEqual(s.getSnapshot().exam,exam);
  s.save({...engineBeforeRemote,page:'library'});
  assert.deepEqual(s.getSnapshot().sessions,[session]);assert.deepEqual(s.getSnapshot().exam,exam);
  await s.flush();
  assert.deepEqual(commits[0].snapshot.sessions,[session]);assert.deepEqual(commits[0].snapshot.exam,exam);
});

test('una lectura tardía no anuncia sincronizado mientras hay una edición local pendiente',async t=>{
  const request=deferred(),statuses=[],commits=[];let reads=0;
  const s=createProgressStore({
    storage:memory(),delay:1e6,onStatus:v=>statuses.push(v),
    backend:{read:async()=>++reads===1?null:request.promise,commit:async(uid,p)=>{commits.push(p);return p;}}
  });
  t.after(async()=>{request.resolve(null);await s.pause();});
  await s.select(user('A'));const pendingRead=s.retry();
  s.save(progress(0));request.resolve(null);await pendingRead;
  assert.equal(statuses.at(-1),'saving');assert.equal(s.hasPending(),true);
  assert.ok(s.getSnapshot().completed[0]);assert.equal(commits.length,0);
  await s.flush();
  assert.equal(statuses.at(-1),'saved');assert.equal(s.hasPending(),false);assert.equal(commits.length,1);
});

test('isOnline false restaura y guarda por cuenta sin red; al reconectar envía la copia pendiente',async t=>{
  const storage=memory(),calls=[],statuses=[];let online=false;
  storage.setItem('brote.progress.v1.A',JSON.stringify({data:makeEnvelope(progress(0),null,100),dirty:false}));
  const backend={read:async uid=>{calls.push(['read',uid]);return null;},commit:async(uid,p)=>{calls.push(['commit',uid]);return p;}};
  const options={storage,backend,isOnline:()=>online,onStatus:v=>statuses.push(v),delay:1e6};
  const first=createProgressStore(options);let restored;
  t.after(async()=>{await first.pause();await restored?.pause();});
  await first.select(user('A'));assert.equal(first.isReady(),true);assert.ok(first.getSnapshot().completed[0]);
  first.save({...first.getSnapshot(),completed:{0:{firstTry:3},1:{firstTry:4}}});
  assert.equal(await first.flush(),false);assert.equal(statuses.at(-1),'offline');assert.deepEqual(calls,[]);
  await first.pause();restored=createProgressStore(options);await restored.select(user('A'));
  assert.deepEqual(Object.keys(restored.getSnapshot().completed),['0','1']);assert.equal(restored.hasPending(),true);
  online=true;await restored.retry();
  assert.deepEqual(calls,[['commit','A']]);assert.equal(statuses.at(-1),'saved');assert.equal(restored.hasPending(),false);
});

test('retry sin cambios también respeta isOnline false y no declara sincronización',async t=>{
  const calls=[],statuses=[];
  const s=createProgressStore({
    storage:memory(),isOnline:()=>false,delay:1e6,onStatus:v=>statuses.push(v),
    backend:{read:async uid=>{calls.push(['read',uid]);return null;},commit:async(uid,p)=>{calls.push(['commit',uid]);return p;}}
  });
  t.after(()=>s.pause());
  await s.select(user('A'));assert.equal(s.hasPending(),false);
  await s.retry();
  assert.deepEqual(calls,[]);assert.equal(statuses.at(-1),'offline');assert.equal(s.isReady(),true);
});

test('forget espera un borrado local asíncrono y limpia solo la cuenta indicada',async t=>{
  const storage=memory(),removal=deferred(),originalRemove=storage.removeItem;
  storage.setItem('brote.progress.v1.A',JSON.stringify({data:makeEnvelope(progress(0)),dirty:false}));
  storage.setItem('brote.progress.v1.B',JSON.stringify({data:makeEnvelope(progress(1)),dirty:false}));
  storage.setItem('brote.progress.v1.guest',JSON.stringify({data:makeEnvelope(progress(2)),dirty:true}));
  storage.removeItem=async key=>{await removal.promise;originalRemove(key);};
  const s=createProgressStore({storage,isOnline:()=>false,delay:1e6});
  t.after(async()=>{removal.resolve();await s.pause();});
  await s.select(user('A'));await s.pause();
  let finished=false;const deleting=s.forget('A').then(result=>{finished=true;return result;});
  await Promise.resolve();assert.equal(finished,false);assert.equal(s.isReady(),false);
  assert.deepEqual(s.getSnapshot().completed,{});assert.ok(storage.getItem('brote.progress.v1.A'));
  removal.resolve();assert.equal(await deleting,true);
  assert.equal(storage.getItem('brote.progress.v1.A'),null);
  assert.ok(storage.getItem('brote.progress.v1.B'));assert.ok(storage.getItem('brote.progress.v1.guest'));
  await s.select(user('B'));assert.deepEqual(Object.keys(s.getSnapshot().completed),['1']);
});

test('forget propaga el fallo local y no permite anunciar borrado completado',async t=>{
  const storage=memory(),statuses=[];
  const cause=Error('storage blocked');storage.removeItem=()=>{throw cause;};
  const s=createProgressStore({storage,isOnline:()=>false,onStatus:v=>statuses.push(v),delay:1e6});
  t.after(()=>s.pause());
  await s.select(user('A'));s.save(progress(0));await s.pause();
  await assert.rejects(s.forget('A'),error=>error.code==='storage/delete-failed'&&error.cause===cause);
  assert.equal(statuses.at(-1),'storage-error');assert.equal(s.isReady(),false);
  assert.deepEqual(s.getSnapshot().completed,{});assert.ok(storage.getItem('brote.progress.v1.A'));
});

test('un borrado tardío de A no vacía ni cambia el estado de B',async t=>{
  const storage=memory(),removal=deferred(),originalRemove=storage.removeItem;
  storage.setItem('brote.progress.v1.A',JSON.stringify({data:makeEnvelope(progress(0)),dirty:false}));
  storage.removeItem=async key=>{await removal.promise;originalRemove(key);};
  const statuses=[],s=createProgressStore({storage,isOnline:()=>false,onStatus:v=>statuses.push(v),delay:1e6});
  t.after(async()=>{removal.resolve();await s.pause();});
  await s.select(user('A'));const deleting=s.forget('A');
  await s.select(user('B'));s.save(progress(1));const statusB=statuses.at(-1);
  removal.resolve();await deleting;
  assert.equal(s.getOwner(),'B');assert.equal(s.isReady(),true);assert.equal(statuses.at(-1),statusB);
  assert.deepEqual(Object.keys(s.getSnapshot().completed),['1']);assert.ok(storage.getItem('brote.progress.v1.B'));
});

test('pause espera el commit anterior y una eliminación fallida de Auth restaura la copia limpia como pendiente',async t=>{
  const storage=memory(),request=deferred(),events=[],statuses=[];let remote=null,blocking=false;
  const backend={
    read:async()=>remote,
    commit:async(uid,p)=>{events.push(['commit',uid]);if(blocking)await request.promise;remote=p;return p;},
    remove:async()=>{events.push(['remove']);remote=null;}
  };
  const s=createProgressStore({storage,backend,onStatus:v=>statuses.push(v),delay:1e6});
  t.after(async()=>{request.resolve();await s.pause();});
  await s.select(user('A'));s.save(progress(0));await s.flush();
  blocking=true;s.save({...s.getSnapshot(),page:'library'});const sending=s.flush();
  let paused=false;const pausing=s.pause().then(()=>{paused=true;});await Promise.resolve();assert.equal(paused,false);
  request.resolve();await Promise.all([sending,pausing]);await backend.remove();
  assert.deepEqual(events.at(-1),['remove']);assert.equal(remote,null);assert.equal(s.isReady(),false);
  // Model a clean local cache as well: neither clean nor dirty must be mistaken for a server copy.
  const cached=JSON.parse(storage.getItem('brote.progress.v1.A'));cached.dirty=false;storage.setItem('brote.progress.v1.A',JSON.stringify(cached));
  await s.select(user('A'));assert.ok(s.getSnapshot().completed[0]);assert.equal(s.hasPending(),true);
  assert.equal(statuses.at(-1),'saving');assert.equal(remote,null);
  await s.flush();assert.ok(remote.snapshot.completed[0]);assert.equal(s.hasPending(),false);assert.equal(statuses.at(-1),'saved');
});

test('retry detecta un documento eliminado y no afirma sincronizado antes de restaurarlo',async t=>{
  let remote=makeEnvelope(progress(0));const statuses=[];
  const s=createProgressStore({storage:memory(),delay:1e6,onStatus:v=>statuses.push(v),backend:{read:async()=>remote,commit:async(uid,p)=>{remote=p;return p;}}});
  t.after(()=>s.pause());await s.select(user('A'));remote=null;await s.retry();
  assert.equal(statuses.at(-1),'saving');assert.equal(s.hasPending(),true);assert.equal(remote,null);
  await s.flush();assert.ok(remote.snapshot.completed[0]);assert.equal(statuses.at(-1),'saved');
});

test('sign-out fences a late cloud read and a late commit without creating guest data',async t=>{
  const storage=memory(),reading=deferred(),writing=deferred(),statuses=[];let slowRead=true;
  const s=createProgressStore({storage,delay:1e6,onStatus:v=>statuses.push(v),backend:{read:()=>slowRead?reading.promise:Promise.resolve(null),commit:()=>writing.promise}});
  t.after(()=>s.pause());const loading=s.select(user('A'));await s.select(null);reading.resolve(makeEnvelope(progress(0)));await loading;
  assert.equal(statuses.at(-1),'signed-out');assert.deepEqual(s.getSnapshot().completed,{});
  slowRead=false;await s.select(user('A'));s.save(progress(1));const sending=s.flush();await s.select(null);writing.resolve(makeEnvelope(progress(1)));assert.equal(await sending,false);
  assert.equal(statuses.at(-1),'signed-out');assert.equal(s.save(progress(2)),false);assert.deepEqual(s.getSnapshot().completed,{});
  assert.equal(storage.getItem('brote.progress.v1.guest'),null);assert.ok(JSON.parse(storage.getItem('brote.progress.v1.A')).data.snapshot.completed[1]);
});
