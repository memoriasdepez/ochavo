import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareReport,reportContext,reportLocation} from '../src/feedback-domain.js';
import {createFeedbackBackend} from '../src/feedback.js';

const id='a'.repeat(32),user={uid:'A',emailVerified:true};
const context={page:'lesson',track:'stocks',lessonId:200,worldId:20,stepIndex:3,stepCount:8,exerciseKind:'numeric',appVersion:'0.14.0',platform:'Android'};
const report={id,category:'contenido',text:'El dato para calcular no aparece.',context,includeTechnical:false};
function fixture(){
  let current=user,loseResponse=false,writes=0;
  const records=new Map();
  const snapshot=ref=>({exists:()=>records.has(ref),data:()=>structuredClone(records.get(ref))});
  const api={doc:(_,...p)=>p.join('/'),serverTimestamp:()=>123,runTransaction:async(_,fn)=>{const queued=[];const result=await fn({get:async ref=>snapshot(ref),set:(ref,data)=>queued.push([ref,data])});for(const [ref,data] of queued){records.set(ref,structuredClone(data));writes++;}if(loseResponse){loseResponse=false;throw Error('Lost response');}return result;},
    collection:(_,path)=>path,where:(field,op,value)=>({field,value}),limit:n=>n,query:(path,filter)=>({path,filter}),getDocs:async({path,filter})=>{const docs=[...records].filter(([ref,data])=>ref.startsWith(path+'/')&&data[filter.field]===filter.value).map(([ref])=>({ref}));return {docs,empty:!docs.length};},writeBatch:()=>{const pending=[];return {delete:ref=>pending.push(ref),commit:async()=>{for(const ref of pending)records.delete(ref);}}}};
  const backend=createFeedbackBackend({db:{},getUser:()=>current},api);
  return {backend,records,api,get writes(){return writes;},change:next=>{current=next;},lose:()=>{loseResponse=true;}};
}

test('reports use visible path numbering even after appended lesson ID ranges',()=>{
  assert.equal(reportLocation(context),'Acciones · Mundo 11 · Punto 101 · Paso 4 de 8');
  assert.equal(reportLocation({...context,track:'etfs',lessonId:350,worldId:35}),'ETFs · Mundo 6 · Punto 51 · Paso 4 de 8');
  assert.equal(reportLocation({...context,track:'crypto',lessonId:400,worldId:40}),'Cripto · Mundo 6 · Punto 51 · Paso 4 de 8');
});
test('context strips answers and account identifiers; optional diagnostics start empty',()=>{
  const clean=prepareReport({...report,context:{...context,email:'private@test.invalid',uid:'private',answers:[42],token:'private',url:'private'}});
  assert.equal(clean.context.appVersion,'');assert.equal(clean.context.platform,'');
  assert(!JSON.stringify(clean).includes('private'));assert(!Object.hasOwn(clean.context,'answers'));
  const technical=prepareReport({...report,includeTechnical:true});assert.equal(technical.context.platform,'android');assert.equal(technical.context.appVersion,'0.14.0');
});
test('unknown context, invalid numbering and invalid text cannot become a report',()=>{
  const clean=reportContext({page:'unknown',track:'stocks',lessonId:350,worldId:35,stepIndex:10,stepCount:8,appVersion:'secret',platform:'secret'},true);
  assert.equal(clean.page,'help');assert.equal(clean.lessonId,-1);assert.equal(clean.worldId,-1);assert.equal(clean.stepIndex,-1);assert.equal(clean.platform,'');
  assert.throws(()=>prepareReport({...report,text:'corto'}));assert.throws(()=>prepareReport({...report,category:'<script>'}));
});
test('lost response can retry the same report without creating a duplicate or changing its date',async()=>{
  const f=fixture();f.lose();await assert.rejects(f.backend.send(report),/Lost response/);
  // Firestore map key order is not preserved by a read.
  const saved=f.records.get('feedbackReports/'+id);saved.context=Object.fromEntries(Object.entries(saved.context).reverse());
  assert.deepEqual(await f.backend.send(report),{id});assert.equal(f.writes,1);
  assert.equal(saved.ownerUid,'A');assert.equal(saved.createdAt,123);
  await assert.rejects(f.backend.send({...report,text:'Otro problema diferente.'}),/otro contenido/);
});
test('unverified, anonymous, signed-out, deleted and changed accounts cannot send reports',async()=>{
  for(const identity of [null,{uid:'A',emailVerified:false},{uid:'A',emailVerified:true,isAnonymous:true}]){const f=fixture();f.change(identity);await assert.rejects(f.backend.send(report));assert.equal(f.writes,0);}
  const f=fixture();f.records.set('accountDeletions/A',{});await assert.rejects(f.backend.send(report),/eliminación/);assert.equal(f.writes,0);
  const changed=fixture(),get=changed.api.runTransaction;changed.api.runTransaction=(_,fn)=>get(_,async tx=>{const read=tx.get;tx.get=async ref=>{const value=await read(ref);changed.change({uid:'B',emailVerified:true});return value;};return fn(tx);});
  await assert.rejects(changed.backend.send(report),/cambiado/);assert.equal(changed.writes,0);
});
test('deleting an account removes only its reports and supports a repeat cleanup',async()=>{
  const f=fixture();await f.backend.send(report);f.records.set('feedbackReports/'+'b'.repeat(32),{ownerUid:'B'});
  await f.backend.remove('A');await f.backend.remove('A');assert.equal(f.records.size,1);assert.equal([...f.records.values()][0].ownerUid,'B');
});

test('offline and unconfirmed sends preserve a safe, idempotent retry',async()=>{
  const f=fixture();
  const offline=createFeedbackBackend({db:{},getUser:()=>user,isOnline:()=>false},f.api);
  await assert.rejects(offline.send(report),/internet/);assert.equal(f.writes,0);
  let release;
  const original=f.api.runTransaction;
  f.api.runTransaction=async(...args)=>{await new Promise(resolve=>{release=resolve;});return original(...args);};
  const slow=createFeedbackBackend({db:{},getUser:()=>user,timeoutMs:5},f.api);
  await assert.rejects(slow.send(report),/confirmación/);
  release();
  await new Promise(resolve=>setTimeout(resolve,0));
  f.api.runTransaction=original;
  assert.deepEqual(await f.backend.send(report),{id});assert.equal(f.writes,1);
});
