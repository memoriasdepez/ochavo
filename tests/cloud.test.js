import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressBackend} from '../src/cloud.js';
import {emptySnapshot,makeEnvelope} from '../src/progress.js';

const envelope=()=>makeEnvelope({...emptySnapshot(),completed:{0:{firstTry:4}}});
const record=()=>({schemaVersion:1,payload:JSON.stringify(envelope()),revision:1,updatedAt:123});
const progress=uid=>`users/${uid}/progress/main`;
const marker=uid=>`accountDeletions/${uid}`;
const pending=error=>error.code==='account/deletion-pending';
function setup(entries=[]){
  const data=new Map(entries),operations=[],serverTime={serverTimestamp:true};
  const snapshot=key=>({exists:()=>data.has(key),data:()=>data.get(key)});
  const api={doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>serverTime,getDocFromServer:async key=>snapshot(key),runTransaction:async(_db,callback)=>{
    const writes=[];
    const result=await callback({get:async key=>snapshot(key),set:(key,value)=>writes.push(['set',key,value]),delete:key=>writes.push(['delete',key])});
    operations.push(writes);
    for(const [type,key,value] of writes){if(type==='set')data.set(key,value);else data.delete(key);}
    return result;
  }};
  return {data,operations,serverTime,api,backend:createProgressBackend({},api)};
}

test('remove atomically creates only a minimal marker and deletes only the requested account progress',async()=>{
  const f=setup([[progress('A'),record()],[progress('B'),record()]]);
  await f.backend.remove('A');
  assert.deepEqual(f.operations,[[['set',marker('A'),{deletedAt:f.serverTime}],['delete',progress('A')]]]);
  assert.equal(f.data.has(progress('A')),false);assert.equal(f.data.has(progress('B')),true);
});

test('repeated deletion retains the original marker timestamp and remains safe with no progress',async()=>{
  const original={deletedAt:123},f=setup([[marker('A'),original]]);
  await f.backend.remove('A');await f.backend.remove('A');
  assert.equal(f.data.get(marker('A')),original);
  assert.deepEqual(f.operations,[[['delete',progress('A')]],[['delete',progress('A')]]]);
});

test('a marked account cannot read or commit progress through the current backend',async()=>{
  const f=setup([[marker('A'),{deletedAt:123}],[progress('A'),record()]]);
  await assert.rejects(f.backend.read('A'),pending);
  await assert.rejects(f.backend.commit('A',envelope()),pending);
  assert.deepEqual(f.operations,[]);
  assert.equal(await f.backend.read('B'),null);
  await f.backend.commit('B',envelope());assert.ok(f.data.has(progress('B')));
});

test('a marker appearing between read and permission rejection is reported as deletion pending',async()=>{
  const f=setup();const normal=f.api.getDocFromServer;
  f.api.getDocFromServer=async key=>{
    if(key===progress('A')){f.data.set(marker('A'),{deletedAt:123});throw Object.assign(Error('denied'),{code:'permission-denied'});}
    return normal(key);
  };
  await assert.rejects(f.backend.read('A'),pending);
});

test('other permission and network errors are not mislabeled as deletion',async()=>{
  const f=setup(),error=Object.assign(Error('access denied'),{code:'permission-denied'});
  f.api.runTransaction=async()=>{throw error;};
  await assert.rejects(f.backend.commit('A',envelope()),candidate=>candidate===error);
  f.api.getDocFromServer=async()=>{throw Object.assign(Error('offline'),{code:'unavailable'});};
  await assert.rejects(f.backend.read('A'),candidate=>candidate.code==='unavailable');
});

test('a denied concurrent revision retries and merges both devices without weakening access',async()=>{
  const f=setup([[progress('A'),record()]]),normal=f.api.runTransaction;
  const other=makeEnvelope({...emptySnapshot(),completed:{950:{firstTry:3}}});
  let calls=0;
  f.api.runTransaction=async(db,callback)=>{
    calls++;
    if(calls===1){
      await callback({get:async key=>({exists:()=>f.data.has(key),data:()=>f.data.get(key)}),set:()=>{}});
      f.data.set(progress('A'),{...record(),schemaVersion:6,payload:JSON.stringify(other),revision:2});
      throw Object.assign(Error('revision race'),{code:'firestore/permission-denied'});
    }
    return normal(db,callback);
  };
  await f.backend.commit('A',envelope());
  const restored=await f.backend.read('A');
  assert.equal(calls,2);assert.ok(restored.snapshot.completed[0]);assert.ok(restored.snapshot.completed[950]);
  assert.equal(f.data.get(progress('A')).revision,3);
});

test('a denial without a newer revision is not retried',async()=>{
  const f=setup([[progress('A'),record()]]);let calls=0;
  f.api.runTransaction=async(db,callback)=>{
    calls++;await callback({get:async key=>({exists:()=>f.data.has(key),data:()=>f.data.get(key)}),set:()=>{}});
    throw Object.assign(Error('access denied'),{code:'permission-denied'});
  };
  await assert.rejects(f.backend.commit('A',envelope()),{code:'permission-denied'});assert.equal(calls,1);assert.equal(f.data.get(progress('A')).revision,1);
});

test('first multi-path write upgrades the remote format without losing legacy achievements',async()=>{
  const f=setup([[progress('A'),record()]]);
  const remote=await f.backend.read('A');assert.ok(remote.snapshot.completed[0]);
  const next=makeEnvelope({...emptySnapshot(),track:'etfs',group:10,completed:{100:{firstTry:3}}});
  await f.backend.commit('A',next);
  const persisted=f.data.get(progress('A'));assert.equal(persisted.schemaVersion,9);assert.equal(persisted.revision,2);
  const restored=await f.backend.read('A');assert.ok(restored.snapshot.completed[0]);assert.ok(restored.snapshot.completed[100]);
});

test('expanded lessons and worlds upgrade a v3 account and survive a later device merge',async()=>{
  const old={...record(),schemaVersion:3},f=setup([[progress('A'),old]]);
  const next=makeEnvelope({...emptySnapshot(),track:'crypto',group:44,mapTarget:'br-point-449',completed:{200:{firstTry:4},350:{firstTry:3},449:{firstTry:2}},passedExams:{20:{best:9,attempts:1},35:{best:8,attempts:1},44:{best:10,attempts:1}}});
  await f.backend.commit('A',next);
  assert.equal(f.data.get(progress('A')).schemaVersion,9);
  await f.backend.commit('A',envelope());
  const restored=await f.backend.read('A');
  assert.deepEqual(Object.keys(restored.snapshot.completed),['0','200','350','449']);
  assert.deepEqual(Object.keys(restored.snapshot.passedExams),['20','35','44']);
});

test('a v4 account gains the technical path without losing any previous path',async()=>{
  const initial=makeEnvelope({...emptySnapshot(),completed:{450:{firstTry:4},950:{firstTry:3},1150:{firstTry:2}},passedExams:{45:{best:8,attempts:1},95:{best:9,attempts:2},115:{best:10,attempts:1}}},null,100);
  const f=setup([[progress('A'),{...record(),schemaVersion:4,payload:JSON.stringify(initial)}]]);
  const next=makeEnvelope({...emptySnapshot(),track:'technical',group:174,mapTarget:'br-point-1749',completed:{1450:{firstTry:4},1749:{firstTry:3}},passedExams:{145:{best:9,attempts:1},174:{best:8,attempts:1}}},null,200);
  await f.backend.commit('A',next);
  assert.equal(f.data.get(progress('A')).schemaVersion,9);
  const restored=await f.backend.read('A');
  assert.equal(restored.snapshot.track,'technical');assert.equal(restored.snapshot.group,174);assert.equal(restored.snapshot.mapTarget,'br-point-1749');
  assert.deepEqual(Object.keys(restored.snapshot.completed),['450','950','1150','1450','1749']);
  assert.deepEqual(Object.keys(restored.snapshot.passedExams),['45','95','115','145','174']);
  await f.backend.commit('A',initial);
  assert.deepEqual((await f.backend.read('A')).snapshot.completed,restored.snapshot.completed,'A stale device must not erase technical achievements');
});

test('an unsupported future format is readable only after updating and is never overwritten',async()=>{
  const future={...record(),schemaVersion:10},f=setup([[progress('A'),future]]);
  const updateNeeded=e=>e.code==='progress/update-required'&&/Actualiza Ochavo/.test(e.message);
  await assert.rejects(f.backend.read('A'),updateNeeded);
  await assert.rejects(f.backend.commit('A',envelope()),updateNeeded);
  assert.deepEqual(f.operations,[]);assert.deepEqual(f.data.get(progress('A')),future);
});

test('schema 9 stores the ten-screen lesson and its fifth result across devices',async()=>{
 for(const id of [453,462,471]){
 const snapshot={...emptySnapshot(),completed:{[id]:{firstTry:5}},activeId:id,activeByTrack:{stocks:id},sessions:[[id,9,Array.from({length:10},(_,i)=>i===0?{v:{contentRevision:id===453?'stocks-opening-2026-10-12':id===471?'stocks-market-edits-2026-10-14':'stocks-second-depth-2026-10-13'}}:i===9?{c:1,q:'10000000-0000-4000-8000-000000000001'}:{})]]};
 const f=setup();await f.backend.commit('A',makeEnvelope(snapshot,null,100));
 assert.equal(f.data.get(progress('A')).schemaVersion,9);
 const restored=await f.backend.read('A');assert.equal(restored.snapshot.sessions[0][1],9);assert.equal(restored.snapshot.sessions[0][2].length,10);assert.equal(restored.snapshot.completed[id].firstTry,5);
 }
});
