import {before,after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,getDocs,collection,query,where,deleteDoc,updateDoc,serverTimestamp,Timestamp} from 'firebase/firestore';
import {createFeedbackBackend} from '../src/feedback.js';
import {reportContext} from '../src/feedback-domain.js';
let env;const id='a'.repeat(32),path='feedbackReports/'+id;
const context=reportContext({page:'lesson',track:'stocks',lessonId:0,worldId:0,stepIndex:1,stepCount:8,exerciseKind:'choice'});
const payload=()=>({schemaVersion:1,ownerUid:'A',category:'contenido',message:'Esta explicación no se entiende.',context,createdAt:serverTimestamp()});
const db=(uid='A',verified=true,anonymous=false)=>env.authenticatedContext(uid,{email_verified:verified,firebase:{sign_in_provider:anonymous?'anonymous':'password'}}).firestore();
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ochavo-feedback',firestore:{host:process.env.FIRESTORE_EMULATOR_HOST.split(':')[0],port:+process.env.FIRESTORE_EMULATOR_HOST.split(':')[1],rules:await readFile('firestore.rules','utf8')}});});
beforeEach(()=>env.clearFirestore());after(()=>env.cleanup());
test('a verified owner can submit and retry the actual backend with a server date',async()=>{
  const user={uid:'A',emailVerified:true},d=db(),backend=createFeedbackBackend({db:d,getUser:()=>user});
  const report={id,category:'contenido',text:'Esta explicación no se entiende.',context};
  await assertSucceeds(backend.send(report));await assertSucceeds(backend.send(report));
  const saved=(await getDoc(doc(d,path))).data();assert.equal(saved.ownerUid,'A');assert(saved.createdAt.toMillis()>0);
  await assertSucceeds(getDocs(query(collection(d,'feedbackReports'),where('ownerUid','==','A'))));
});
test('other users, unverified, anonymous and signed-out clients cannot read or forge a report',async()=>{
  await setDoc(doc(db(),path),payload());
  for(const d of [db('B'),db('A',false),db('A',true,true),env.unauthenticatedContext().firestore()]){
    await assertFails(getDoc(doc(d,path)));await assertFails(setDoc(doc(d,'feedbackReports/'+'b'.repeat(32)),payload()));
  }
  await assertFails(getDocs(collection(db(),'feedbackReports')));
});
test('invalid dates, extra identity or answer fields, wrong bounds and incomplete schema are rejected',async()=>{
  for(const patch of [{ownerUid:'B'},{email:'private@test.invalid'},{createdAt:Timestamp.fromMillis(1)},{message:'corto'},{message:'x'.repeat(2001)},{category:'bad'},{context:{...context,answers:[2]}},{context:{...context,stepIndex:8}},{context:{...context,lessonId:1750}},{context:{...context,worldId:175}},{context:{...context,track:'unknown'}},{context:{...context,questionIndex:10}}])await assertFails(setDoc(doc(db(),path),{...payload(),...patch}));
});
test('technical lessons can report their precise location through the real backend',async()=>{
  const user={uid:'A',emailVerified:true},d=db(),backend=createFeedbackBackend({db:d,getUser:()=>user});
  const technical=reportContext({page:'lesson',track:'technical',lessonId:1749,worldId:174,stepIndex:7,stepCount:8,exerciseKind:'hotspot'});
  await assertSucceeds(backend.send({id,category:'contenido',text:'La explicación del gráfico no se entiende.',context:technical}));
  assert.deepEqual((await getDoc(doc(d,path))).data().context,technical);
  assert.equal(technical.track,'technical');assert.equal(technical.lessonId,1749);
});
test('reports are immutable and account deletion blocks new reports while allowing only own cleanup',async()=>{
  const d=db();await setDoc(doc(d,path),payload());await assertFails(updateDoc(doc(d,path),{message:'Cambiar la explicación.'}));await assertFails(deleteDoc(doc(d,path)));
  await env.withSecurityRulesDisabled(c=>setDoc(doc(c.firestore(),'accountDeletions/A'),{deletedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(d,'feedbackReports/'+'b'.repeat(32)),payload()));await assertFails(deleteDoc(doc(db('B'),path)));await assertSucceeds(deleteDoc(doc(d,path)));
});
