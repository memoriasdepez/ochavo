import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySnapshot,sanitizeSnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {createProgressStore} from '../src/sync.js';
import {createProgressBackend} from '../src/cloud.js';

const UUID='f67a6e5a-6b52-4d13-a3f2-44a41f665a7e';
const UUID2='2d4adfc5-ef57-4c8a-b44e-84fa812dc449';
const copy=value=>JSON.parse(JSON.stringify(value));
const draftSession=(id,step=1,draft={})=>[id,step,Array.from({length:6},(_,i)=>i===step?copy(draft):{})];
const snapshot=changes=>({...emptySnapshot(),...changes});
const pendingExam=(changes={})=>({id:45,step:9,order:[0,1,2,3,4,5,6,7,8,9],drafts:Array.from({length:10},()=>({c:1})),submitted:false,...changes});
const memory=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};

test('legacy snapshots migrate with fresh empty case state and supported pages remain bounded',()=>{
 const legacy={version:5,page:'map',completed:{49:{firstTry:4}},sessions:[]};
 const clean=sanitizeSnapshot(legacy);
 assert.deepEqual(clean.completedCases,{});assert.deepEqual(clean.caseSessions,[]);assert.equal(clean.activeCaseId,null);
 assert.deepEqual(clean.completed,legacy.completed);
 for(const page of ['cases','profile'])assert.equal(sanitizeSnapshot(snapshot({page})).page,page);
 assert.equal(sanitizeSnapshot(snapshot({page:'case-secret'})).page,'map');
 const other=emptySnapshot();clean.completedCases['case-1']={firstTry:3};assert.deepEqual(other.completedCases,{});
});

test('case IDs, six-step sessions and completion counts are bounded; active cases are independent of the path selector',()=>{
 const clean=sanitizeSnapshot(snapshot({track:'etfs',group:10,completedCases:{'case-1':{firstTry:3},'case-10':{firstTry:4},'case-15':{firstTry:2},'case-20':{firstTry:1},'case-148':{},'case-176':{},'case-0':{},'case-01':{}},
  caseSessions:[draftSession('case-1'),draftSession('case-15',5),draftSession('case-20'),draftSession('case-148'),draftSession('case-11',6),['case-12',0,[]]],activeCaseId:'case-15'}));
 assert.deepEqual(clean.completedCases,{'case-1':{firstTry:3},'case-10':{firstTry:0},'case-15':{firstTry:2},'case-20':{firstTry:1}});
 assert.deepEqual(clean.caseSessions.map(s=>s[0]),['case-1','case-15','case-20']);assert.equal(clean.activeCaseId,'case-15');
 assert.equal(sanitizeSnapshot({...clean,activeCaseId:'case-1'}).activeCaseId,'case-1');
 assert.equal(sanitizeSnapshot({...clean,activeCaseId:'case-14'}).activeCaseId,null);
 const duplicate=sanitizeSnapshot(snapshot({caseSessions:[draftSession('case-1',1),draftSession('case-1',3)]}));
 assert.equal(duplicate.caseSessions.length,1);assert.equal(duplicate.caseSessions[0][1],3);
 const crossPath=makeEnvelope({...clean,track:'crypto',group:15,page:'cases',activeCaseId:'case-1'},null,100);
 assert.equal(mergeProgress(null,crossPath).snapshot.activeCaseId,'case-1');
});

test('case input cannot inject accessors, prototype fields, PII or oversized drafts',()=>{
 let reads=0;
 const inherited=Object.create({'case-1':{firstTry:3}});
 Object.defineProperty(inherited,'case-2',{get(){reads++;return {firstTry:3};}});
 const packed={n:'9'.repeat(90),q:UUID,c:2,s:[0,2],m:{0:'',1:'2',4:'0'},a:9999999,p:1,h:1,v:{explore:2,private:'secret'},email:'private@example.invalid'};
 const input=snapshot({completedCases:inherited,caseSessions:[draftSession('case-1',1,packed)]});
 const clean=sanitizeSnapshot(input);
 assert.equal(reads,0);assert.deepEqual(clean.completedCases,{});
 assert.deepEqual(clean.caseSessions[0][2][1],{c:2,s:[0,2],m:{0:'',1:'2'},n:'9'.repeat(32),a:1000000,p:1,h:1,v:{explore:2},q:UUID});
 clean.caseSessions[0][2][1].s.push(3);assert.deepEqual(input.caseSessions[0][2][1].s,[0,2]);
 const polluted=JSON.parse('{"version":5,"completedCases":{"__proto__":{"firstTry":3}},"caseSessions":[],"__proto__":{"polluted":true}}');
 assert.deepEqual(sanitizeSnapshot(polluted).completedCases,{});assert.equal({}.polluted,undefined);
});

test('opaque attempt UUIDs survive lesson, case and exam drafts without accepting arbitrary text',()=>{
 const input=snapshot({sessions:[[0,1,Array.from({length:8},(_,i)=>i===1?{q:UUID}: {})]],caseSessions:[draftSession('case-1',1,{q:UUID2})],exam:pendingExam({attemptId:UUID,pendingSubmit:true})});
 const clean=sanitizeSnapshot(input);
 assert.equal(clean.sessions[0][2][1].q,UUID);assert.equal(clean.caseSessions[0][2][1].q,UUID2);assert.equal(clean.exam.attemptId,UUID);assert.equal(clean.exam.pendingSubmit,true);
 const upper=UUID.toUpperCase(),preserved=sanitizeSnapshot(snapshot({caseSessions:[draftSession('case-1',1,{q:upper})],exam:pendingExam({attemptId:upper,pendingSubmit:true})}));
 assert.equal(preserved.caseSessions[0][2][1].q,upper);assert.equal(preserved.exam.attemptId,upper);
 for(const bad of ['person@example.invalid','uuid','0'.repeat(36),null,123]){
  const invalid=sanitizeSnapshot(snapshot({caseSessions:[draftSession('case-1',1,{q:bad})],exam:pendingExam({attemptId:bad,pendingSubmit:true})}));
  assert.equal(invalid.caseSessions[0][2][1].q,undefined);assert.equal(invalid.exam.attemptId,undefined);assert.equal(invalid.exam.pendingSubmit,false);
 }
 const submitted=sanitizeSnapshot(snapshot({exam:pendingExam({attemptId:UUID,pendingSubmit:true,submitted:true,score:8})})).exam;
 assert.equal(submitted.pendingSubmit,false);assert.equal(submitted.score,8);assert.equal(submitted.attemptId,UUID);
});

test('case clocks change only for edited or removed sessions, even if the device clock moves backward',()=>{
 const first=makeEnvelope(snapshot({caseSessions:[draftSession('case-1'),draftSession('case-2',3)],activeCaseId:'case-1'}),null,100);
 assert.deepEqual(first.caseTimes,{'case-1':100,'case-2':100});
 const changed=copy(first.snapshot);changed.caseSessions[0]=draftSession('case-1',3,{q:UUID,n:'2,5'});
 const second=makeEnvelope(changed,first,200);assert.deepEqual(second.caseTimes,{'case-1':200,'case-2':100});
 const nav=makeEnvelope({...second.snapshot,page:'profile'},second,50);assert.equal(nav.modifiedAt,201);assert.deepEqual(nav.caseTimes,second.caseTimes);
 const cleared=makeEnvelope({...nav.snapshot,caseSessions:[],activeCaseId:null},nav,300);assert.deepEqual(cleared.caseTimes,{'case-1':300,'case-2':300});
 assert.deepEqual(makeEnvelope(cleared.snapshot,cleared,900),cleared);
});

test('case completions union with maximum first-try score and never mutate either source',()=>{
 const remote=makeEnvelope(snapshot({completedCases:{'case-1':{firstTry:3},'case-12':{firstTry:1}}}),null,100);
 const local=makeEnvelope(snapshot({completedCases:{'case-12':{firstTry:2},'case-18':{firstTry:0}}}),null,200);
 const before=JSON.stringify([remote,local]),merged=mergeProgress(remote,local);
 assert.deepEqual(merged.snapshot.completedCases,{'case-1':{firstTry:3},'case-12':{firstTry:2},'case-18':{firstTry:0}});
 assert.equal(JSON.stringify([remote,local]),before);merged.snapshot.completedCases['case-1'].firstTry=0;assert.equal(remote.snapshot.completedCases['case-1'].firstTry,3);
});

test('a case draft follows its own clock despite newer unrelated navigation',()=>{
 const base=makeEnvelope(snapshot({caseSessions:[draftSession('case-1')],activeCaseId:'case-1'}),null,100);
 const local=makeEnvelope({...base.snapshot,caseSessions:[draftSession('case-1',5,{q:UUID,n:'33,5'})]},base,200);
 const remote=makeEnvelope({...base.snapshot,page:'profile'},base,300);
 const merged=mergeProgress(remote,local);
 assert.equal(merged.snapshot.page,'profile');assert.equal(merged.snapshot.caseSessions[0][1],5);assert.equal(merged.snapshot.caseSessions[0][2][5].q,UUID);assert.equal(merged.caseTimes['case-1'],200);
 assert.equal(merged.snapshot.activeCaseId,'case-1');
 const backwards=makeEnvelope({...local.snapshot,caseSessions:[draftSession('case-1',1)]},local,400);
 assert.equal(mergeProgress(merged,backwards).snapshot.caseSessions[0][1],1);
});

test('case removals are tombstones that survive a later merge with stale data',()=>{
 const base=makeEnvelope(snapshot({caseSessions:[draftSession('case-1',5)],activeCaseId:'case-1'}),null,100);
 const removed=makeEnvelope({...base.snapshot,caseSessions:[],activeCaseId:null},base,200);
 const merged=mergeProgress(base,removed);
 assert.deepEqual(merged.snapshot.caseSessions,[]);assert.equal(merged.snapshot.activeCaseId,null);assert.equal(merged.caseTimes['case-1'],200);
 assert.deepEqual(mergeProgress(merged,base).snapshot.caseSessions,[]);
});

test('completed cases reject stale unfinished drafts but keep an explicitly active replay',()=>{
 const done=makeEnvelope(snapshot({completedCases:{'case-1':{firstTry:3}}}),null,100);
 const stale=makeEnvelope(snapshot({caseSessions:[draftSession('case-1',5)],activeCaseId:'case-1'}),null,200);
 assert.deepEqual(mergeProgress(done,stale).snapshot.caseSessions,[]);
 const replay=makeEnvelope(snapshot({completedCases:{'case-1':{firstTry:1}},caseSessions:[draftSession('case-1',1)],activeCaseId:'case-1'}),null,300);
 const merged=mergeProgress(done,replay);assert.equal(merged.snapshot.caseSessions.length,1);assert.equal(merged.snapshot.completedCases['case-1'].firstTry,3);
 const inactive=makeEnvelope({...replay.snapshot,activeCaseId:null},replay,400);assert.deepEqual(mergeProgress(done,inactive).snapshot.caseSessions,[]);
});

test('old envelopes get clocks only for existing cases; untrusted clocks are bounded',()=>{
 const legacy={schema:1,modifiedAt:100,snapshot:snapshot({caseSessions:[draftSession('case-1')],activeCaseId:'case-1'}),sessionTimes:{},examTime:0};
 const restored=mergeProgress(null,legacy);assert.deepEqual(restored.caseTimes,{'case-1':100});
 const raw={...legacy,caseTimes:{'case-1':1000,'case-2':Infinity,'case-3':-1,'case-999':99}};
 assert.deepEqual(mergeProgress(null,raw).caseTimes,{'case-1':100});
 assert.deepEqual(mergeProgress(null,JSON.parse(JSON.stringify(restored))),restored);
});

test('exam submission intent and UUID follow exam clocks across navigation and survive retry',()=>{
 const base=makeEnvelope(snapshot({exam:pendingExam({attemptId:UUID,pendingSubmit:false})}),null,100);
 const submit=makeEnvelope({...base.snapshot,exam:pendingExam({attemptId:UUID,pendingSubmit:true})},base,200);
 const oldNavigation=makeEnvelope({...base.snapshot,page:'profile'},base,300);
 const merged=mergeProgress(submit,oldNavigation);
 assert.equal(merged.snapshot.exam.pendingSubmit,true);assert.equal(merged.snapshot.exam.attemptId,UUID);assert.equal(merged.examTime,200);
 const finished=makeEnvelope({...merged.snapshot,exam:pendingExam({attemptId:UUID,pendingSubmit:false,submitted:true,score:8}),passedExams:{45:{best:8,attempts:1}}},merged,400);
 const final=mergeProgress(merged,finished);assert.equal(final.snapshot.exam.pendingSubmit,false);assert.equal(final.snapshot.exam.submitted,true);assert.equal(final.snapshot.passedExams[45].passed,true);
});

test('case-only legacy guest data is never offered or merged into an account',async()=>{
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const legacy=JSON.stringify({data:makeEnvelope(snapshot({completedCases:{'case-1':{firstTry:2}},caseSessions:[draftSession('case-2',3,{q:UUID,c:1})],activeCaseId:'case-2'})),dirty:true});values.set('brote.progress.v1.guest',legacy);
 const store=createProgressStore({storage,isOnline:()=>false,delay:1e6});await store.select(null);assert.equal(store.save(snapshot({activeCaseId:'case-1'})),false);
 await store.select({uid:'A',emailVerified:true});assert.equal(store.guestAvailable(),false);assert.deepEqual(store.getSnapshot().completedCases,{});
 await assert.rejects(store.importGuest(),{code:'account/guest-disabled'});assert.deepEqual(store.getSnapshot().caseSessions,[]);assert.equal(values.get('brote.progress.v1.guest'),legacy);await store.pause();
});

test('offline case drafts survive a fresh store and synchronize on reconnect',async()=>{
 let online=false,remote=null;
 const storage=memory(),backend={read:async()=>remote,commit:async(_uid,data)=>(remote=data)};
 const options={storage,backend,isOnline:()=>online,delay:1e6};
 const first=createProgressStore(options);await first.select({uid:'A',emailVerified:true});
 first.save(snapshot({caseSessions:[draftSession('case-4',5,{q:UUID2,s:[1,2]})],activeCaseId:'case-4',page:'cases'}));await first.pause();
 const restored=createProgressStore(options);await restored.select({uid:'A',emailVerified:true});assert.deepEqual(restored.getSnapshot().caseSessions,[draftSession('case-4',5,{q:UUID2,s:[1,2]})]);
 online=true;await restored.retry();assert.equal(remote.snapshot.caseSessions[0][2][5].q,UUID2);assert.equal(remote.snapshot.page,'cases');await restored.pause();
});

test('cloud accepts schemas 1–9 and commits schema 9 without losing historical or case progress',async()=>{
 for(const schemaVersion of [1,2,3,4,5,6,7,8,9]){
  const data=new Map([['users/A/progress/main',{schemaVersion,payload:JSON.stringify(makeEnvelope(snapshot({completed:{0:{firstTry:4}}}),null,100)),revision:1}]]);
  const snap=k=>({exists:()=>data.has(k),data:()=>data.get(k)});
  const api={doc:(_db,...parts)=>parts.join('/'),getDocFromServer:async k=>snap(k),serverTimestamp:()=>123,runTransaction:async(_db,fn)=>fn({get:async k=>snap(k),set:(k,v)=>data.set(k,v)})};
  const backend=createProgressBackend({},api);assert.ok((await backend.read('A')).snapshot.completed[0]);
  await backend.commit('A',makeEnvelope(snapshot({completedCases:{'case-1':{firstTry:3}},caseSessions:[draftSession('case-2',3,{q:UUID})],activeCaseId:'case-2'}),null,200));
  const saved=data.get('users/A/progress/main');assert.equal(saved.schemaVersion,9);assert.equal(saved.revision,2);assert.equal(typeof saved.payload,'string');
  const restored=await backend.read('A');assert.equal(restored.snapshot.completed[0].firstTry,4);assert.equal(restored.snapshot.completedCases['case-1'].firstTry,3);assert.equal(restored.snapshot.caseSessions[0][2][3].q,UUID);
 }
});

test('case progress in every new path and the technical gap keeps distinct clocks, scores and drafts',()=>{
 const ids=['case-46','case-96','case-116','case-146','case-149','case-175'];
 const historic={'case-1':{firstTry:3},'case-11':{firstTry:2},'case-16':{firstTry:1}};
 const completed=Object.fromEntries(ids.map((id,i)=>[id,{firstTry:i%4}]));
 const drafts=ids.map((id,i)=>draftSession(id,i%6,{n:String(100+i),q:UUID}));
 const clean=sanitizeSnapshot(snapshot({completedCases:{...historic,...completed,'case-148':{firstTry:3}},caseSessions:drafts,activeCaseId:'case-149'}));
 assert.deepEqual(clean.completedCases,{...historic,...completed});assert.deepEqual(clean.caseSessions,drafts);assert.equal(clean.activeCaseId,'case-149');
 const remote=makeEnvelope(snapshot({completedCases:historic}),null,100);
 const local=makeEnvelope(clean,null,200),merged=mergeProgress(remote,local);
 assert.deepEqual(merged.snapshot.completedCases,{...historic,...completed});
 // Completed cases do not resurrect old sessions; the explicitly active replay survives.
 assert.deepEqual(merged.snapshot.caseSessions,[drafts[4]]);assert.equal(merged.snapshot.activeCaseId,'case-149');
 const inFlight=makeEnvelope(snapshot({caseSessions:drafts,activeCaseId:'case-149'}),null,300);
 const resumed=mergeProgress(remote,inFlight);
 assert.deepEqual(resumed.snapshot.caseSessions,drafts);assert.deepEqual(resumed.caseTimes,Object.fromEntries(ids.map(id=>[id,300])));
 assert.deepEqual(mergeProgress(null,JSON.parse(JSON.stringify(resumed))),resumed);
});
