import {beforeMarketEdits,beforeMarketCatalog} from './market-edits-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const current=read('src/content/stocks-curriculum-v2.json'),old=read('tests/fixtures/stocks-notes-0341-baseline.json');
current.lessons=current.lessons.map(beforeMarketEdits);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const changed={460:[4],461:[6],465:[0,2,4],467:[2,6],468:[2,4,6]};
const lesson=id=>current.lessons.find(l=>l.id===id);

test('only the ten requested teaching screens change; all questions, IDs, revisions, exams and rewards remain identical',()=>{
 for(const prior of old.lessons){
  const l=lesson(prior.id);
  if(!changed[l.id])assert.equal(hash(l),prior.full,`Unexpected point ${l.id-449}`);
  assert.equal(hash([l.id,l.title,l.short,l.prerequisites,l.editorialRevision]),prior.identity);
  assert.equal(hash(l.steps.filter(s=>s.type!=='learn')),prior.exercises);
  for(let i=0;i<l.steps.length;i++)if(!changed[l.id]?.includes(i))assert.equal(hash(l.steps[i]),prior.steps[i]);
 }
 for(const prior of old.before){
  const l=structuredClone(lesson(prior.id));
  if(l.id===465)l.summary=prior.summary;
  for(const i of changed[l.id]){l.steps[i].body=prior.steps[i].body;delete l.steps[i].laboratoryLink;}
  assert.deepEqual(l,prior,`Unexpected non-text change ${l.id}`);
 }
 assert.equal(hash(current.exams),old.exams);assert.equal(hash(current.groups),old.groups);
 assert.equal(hash(JSON.parse(beforeMarketCatalog(readFileSync(new URL('../src/content/game-catalog.json',import.meta.url))))),old.catalog);
 assert.doesNotMatch(lesson(465).steps[0].body,/La pendiente puede cambiar/);
 assert.match(lesson(465).steps[2].body,/200 €.*800 €.*1\.000 €/);
 assert.match(lesson(465).steps[4].body,/impuestos por el beneficio obtenido/);
 assert.match(lesson(460).steps[4].body,/6 acciones a 10 €.*ganancia realizada de 12 €/);
 assert.match(lesson(467).steps[2].body,/12.*24 €.*no están garantizados/);
 assert.match(lesson(467).steps[6].body,/11 €.*5 €.*sobrará 1 €/);
 assert.match(lesson(468).steps[4].body,/100 € a 50 €.*5 % al 10 %/);
});

function snapshot(id,step){return {...emptySnapshot(),group:46,completed:Object.fromEntries(Array.from({length:20},(_,i)=>[450+i,{firstTry:4}])),passedExams:{45:{best:8,passed:true,attempts:1}},activeId:id,activeByTrack:{stocks:id},sessions:[[id,step,Array.from({length:8},(_,i)=>i===0?{v:{contentRevision:lesson(id).editorialRevision}}:i===7?{q:'10000000-0000-4000-8000-000000000001'}:{})]]};}

test('compatible explanations preserve cloud round trips, lesson positions and pending reward identities',()=>{
 for(const id of Object.keys(changed).map(Number)){
  const input=snapshot(id,6),first=makeEnvelope(input,null,100),merged=mergeProgress(null,JSON.parse(JSON.stringify(first)));
  const app=mount(merged.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,6);
  assert.deepEqual(app.saved.sessions,input.sessions);
  assert.deepEqual(app.saved.completed,input.completed);assert.deepEqual(app.saved.passedExams,input.passedExams);
  assert.deepEqual(mergeProgress(first,makeEnvelope(app.saved,first,200)).snapshot.sessions,input.sessions);
 }
});

test('the recovery hyperlink opens the intended calculator and returns to the same screen without completion or awards',()=>{
 let tool,options;const lab={reset(){},render(){},open(id,opts){tool=id;options=opts;}};
 const input=snapshot(461,6),app=mount(input,null,lab);openLesson(app,461);
 assert.match(app.main.querySelector('.br-body').innerHTML,/href="#laboratorio-recuperacion".*data-lesson-tool="recovery"/);
 app.click({lessonTool:'compound'});assert.equal(tool,undefined);
 app.click({lessonTool:'recovery'});assert.equal(tool,'recovery');assert.equal(app.main.dataset.view,'lab');
 options.onReturn();assert.equal(app.main.dataset.view,'lesson');assert.equal(app.course.reportContext().stepIndex,6);
 assert.deepEqual(app.saved.sessions,input.sessions);assert.deepEqual(app.saved.completed,input.completed);
 app.click({next:''});assert.equal(app.course.reportContext().stepIndex,7);
 app.click({lessonTool:'recovery'});assert.equal(app.main.dataset.view,'lesson');
 app.click({prev:''});assert.equal(app.course.reportContext().stepIndex,6);
 // A saved return callback must not reopen teaching after access is revoked.
 app.click({lessonTool:'recovery'});assert.equal(app.main.dataset.view,'lab');
 const staleReturn=options.onReturn;
 app.window.virutaAccess.canLearn=()=>false;app.course.refreshAccess();
 const blockedView=app.main.dataset.view;staleReturn();assert.equal(app.main.dataset.view,blockedView);
});
