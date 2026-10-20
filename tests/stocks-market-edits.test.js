import test from 'node:test';
import {beforeCompoundNotes} from './compound-notes-utils.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptySnapshot,sanitizeSnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
import {editorialDrafts,packedEditorial} from './editorial-drafts.js';
import {validateActivity,activityCorrect,activityAnswered,activityMarkup} from '../src/exercise-formats.js';
import {MARKET_EDITS_RESTART_IDS,MARKET_EDITS_REVISION} from '../scripts/stocks-editorial/market-edits.mjs';
import {createProgressBackend} from '../src/cloud.js';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const course=read('src/content/stocks-curriculum-v2.json'),old=read('tests/fixtures/stocks-market-0342-baseline.json');
course.lessons=course.lessons.map(beforeCompoundNotes);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const lesson=id=>course.lessons.find(l=>l.id===id);
const requested={470:[0,6],471:[0,4,6,8,9],472:[2,4,6],473:[0,2,3,4,6,7],474:[0,2,4,5,6,7],475:[0,4,6],476:[0,2,3,4,5,6,7],477:[0,2,4,6,7],478:[0,2,3,4,5,6,7]};

test('all changes stay inside the requested screens of 21–29; the other 491 points, every exam and every old reward are intact',()=>{
 for(const previous of old.lessons){
  const l=lesson(previous.id);
  assert.equal(hash([l.id,l.title,l.short,l.prerequisites]),previous.identity);
  if(!requested[l.id])assert.equal(hash(l),previous.full,'Unrelated point '+(l.id-449));
  else{
   for(let i=0;i<previous.steps.length;i++)if(!requested[l.id].includes(i))assert.equal(hash(l.steps[i]),previous.steps[i],`Unrequested ${l.id}/${i}`);
   assert.equal(l.editorialRevision,MARKET_EDITS_RESTART_IDS.includes(l.id)?MARKET_EDITS_REVISION:previous.revision);
  }
 }
 for(const previous of old.before){
  const l=structuredClone(lesson(previous.id));l.steps=previous.steps;l.summary=previous.summary;l.takeaway=previous.takeaway;l.editorialRevision=previous.editorialRevision;l.minutes=previous.minutes;
  assert.deepEqual(l,previous,'Metadata/identity changed '+l.id);
 }
 assert.equal(hash(course.groups),old.groups);for(const e of old.exams)assert.equal(hash(course.exams.find(x=>x.id===e.id)),e.hash);
 const catalog=read('src/content/game-catalog.json');assert.deepEqual(catalog['answer-471-9'],{kind:'answer',amount:1});delete catalog['answer-471-9'];assert.deepEqual(catalog,old.catalog);
 assert.equal(lesson(471).steps.length,10);assert.match(lesson(471).steps[8].body,/Oferta Pública de Venta.*actuales propietarios/);
 for(const id of Object.keys(requested).map(Number)){const l=lesson(id);assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);assert.doesNotMatch(JSON.stringify(l),/&#x|undefined|NaN/);}
});

test('new numerical and reasoning activities accept the whole answer and reject plausible errors or partial allocations',()=>{
 const checks=[[471,9],[473,3],[473,7],[474,5],[474,7],[476,3],[476,7],[477,7],[478,3],[478,5],[478,7]];
 for(const [id,index] of checks){
  const s=lesson(id).steps[index],a=s.activity;validateActivity(a);
  const p=packedEditorial(s),draft={vars:p.v||{},choice:p.c??null,number:p.n??'',selected:p.s||[],matches:p.m||{},order:p.o||[]};
  assert.equal(activityAnswered(a,draft),true,`${id}/${index}`);assert.equal(activityCorrect(a,draft),true);
  if(a.rows)draft.matches[0]=String((a.rows[0].answer+1)%a.rows[0].options.length);
  else if(a.kind==='allocate')draft.vars.exerciseAlloc=[...a.answer].reverse();
  else if(a.kind==='slider')draft.number='7';
  else draft.selected=[1];
  assert.equal(activityCorrect(a,draft),false,`Wrong ${id}/${index}`);
 }
 assert.deepEqual(lesson(471).steps[9].activity.answer,[9,3]);assert.equal(lesson(471).steps[9].activity.tokenUnit,'10 €');
 assert.deepEqual(lesson(478).steps[3].activity.answer,[19,1]);assert.equal(lesson(478).steps[7].answer,6);
 assert.deepEqual(lesson(476).steps[7].activity.answers,[0,2]);
 const repair=lesson(474).steps[5].activity;for(const row of repair.rows)assert.ok(row.wrongWord.length>20);
 assert.doesNotMatch(activityMarkup(repair,{vars:{},matches:{}}),/Sustituye «»/);
 const app=mount(input(476,2));openLesson(app,476);assert.match(app.main.innerHTML,/<em>guidance<\/em>/);
});

function input(id,index=0,revision=lesson(id).editorialRevision,length=lesson(id).steps.length){return {...emptySnapshot(),group:47,completed:{...Object.fromEntries(Array.from({length:30},(_,i)=>[450+i,{firstTry:4}])),950:{firstTry:3}},passedExams:{45:{best:9,passed:true,attempts:1},46:{best:9,passed:true,attempts:1},47:{best:8,passed:true,attempts:2}},activeId:id,activeByTrack:{stocks:id},sessions:[[id,index,Array.from({length},(_,i)=>i===0?{v:{contentRevision:revision}}:{})]]};}

test('the nine current lessons render and grade every authored activity, including the fifth OPV answer',()=>{
 for(const id of Object.keys(requested).map(Number)){
  const l=lesson(id),snapshot={...input(id),sessions:[[id,0,editorialDrafts(l)]]},app=mount(snapshot);openLesson(app,id);
  for(const step of l.steps){if(step.type!=='learn')app.click({check:''});app.click({next:''});}
  assert.equal(app.main.dataset.view,'success',String(id));assert.equal(app.saved.completed[id].firstTry,id===471?5:4);
  assert.deepEqual(app.saved.passedExams,snapshot.passedExams);assert.deepEqual(app.saved.completed[950],snapshot.completed[950]);
 }
});

test('only the six incompatible exercise drafts restart; text-only changes preserve attempts and all completions/exams',()=>{
 for(const previous of old.before){
  const snapshot=input(previous.id,5,previous.editorialRevision,8),app=mount(snapshot);openLesson(app,previous.id);
  assert.equal(app.course.reportContext().stepIndex,MARKET_EDITS_RESTART_IDS.includes(previous.id)?0:5);
  assert.deepEqual(app.saved.completed,snapshot.completed);assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
 }
 const s=input(471,9);s.completed[471].firstTry=5;s.sessions[0][2][9]={q:'10000000-0000-4000-8000-000000000001',v:{exerciseKind:'allocate',exerciseAlloc:[9,3]}};
 const first=makeEnvelope(s,null,100),merged=mergeProgress(null,JSON.parse(JSON.stringify(first)));
 assert.deepEqual(merged.snapshot.sessions,s.sessions);assert.equal(merged.snapshot.completed[471].firstTry,5);
 const app=mount(merged.snapshot);openLesson(app,471);assert.equal(app.course.reportContext().stepIndex,9);assert.match(app.main.innerHTML,/10 \/ 10/);assert.match(app.main.querySelector('#br-activity').innerHTML,/Abrir calculadora/);
 assert.deepEqual(mergeProgress(first,makeEnvelope(app.saved,first,200)).snapshot.sessions,s.sessions);
 assert.equal(sanitizeSnapshot(input(472,9,lesson(472).editorialRevision,10)).sessions.length,0);
});

test('schema 9 preserves the OPV attempt when upgrading a real backend interface from schema 8 and rejects an unknown future format',async()=>{
 const s=input(471,9),target='users/test/progress/main';s.completed[471].firstTry=5;
 const map=new Map([[target,{schemaVersion:8,payload:JSON.stringify(makeEnvelope(s,null,100)),revision:2}]]),snap=k=>({exists:()=>map.has(k),data:()=>map.get(k)});
 const api={doc:(_db,...p)=>p.join('/'),serverTimestamp:()=>123,getDocFromServer:async k=>snap(k),runTransaction:async(_db,fn)=>fn({get:async k=>snap(k),set:(k,v)=>map.set(k,v)})};
 const backend=createProgressBackend({},api),before=await backend.read('test');await backend.commit('test',before);
 assert.equal(map.get(target).schemaVersion,9);assert.equal(map.get(target).revision,3);assert.deepEqual((await backend.read('test')).snapshot,s);
 const future={...map.get(target),schemaVersion:10};map.set(target,future);
 await assert.rejects(backend.commit('test',before),e=>e.code==='progress/update-required');assert.equal(map.get(target),future);
});
