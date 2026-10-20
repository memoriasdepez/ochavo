import test from 'node:test';
import {beforeRiskNotes} from './risk-notes-utils.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {calculateCompound,calculateInflation,calculateFees} from '../src/lab-calculators.js';
import {evaluateGrowthLab,renderGrowthLab} from '../src/growth-lab.js';
import {activityAnswered,activityCorrect,validateActivity} from '../src/exercise-formats.js';
import {packedEditorial} from './editorial-drafts.js';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
import {COMPOUND_NOTES_REVISION} from '../scripts/stocks-editorial/compound-notes.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const current=read('src/content/stocks-curriculum-v2.json'),old=read('tests/fixtures/stocks-compound-notes-0351-baseline.json');
current.lessons=current.lessons.map(beforeRiskNotes);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const lesson=id=>current.lessons.find(l=>l.id===id);
const changed={480:[2,6],481:[0,4,6],483:[0,2,4],484:[2,4,5,6,7],485:[0,2,4],486:[0],487:[0,4,5],488:[0,2,6]};
test('confirmed topic placement preserves point 33, the other 492 points, all exams, IDs, groups and rewards',()=>{
 for(const previous of old.lessons){
  const l=lesson(previous.id);
  assert.equal(hash([l.id,l.title,l.short,l.prerequisites]),previous.identity);
  if(!changed[l.id])assert.equal(hash(l),previous.hash,'Unexpected change '+l.id);
  else{
   assert.equal(l.steps.length,8);
   for(let i=0;i<8;i++)if(!changed[l.id].includes(i))assert.equal(hash(l.steps[i]),previous.steps[i],`Unexpected ${l.id}/${i}`);
   assert.equal(l.editorialRevision,l.id===484?COMPOUND_NOTES_REVISION:previous.revision);
   assert.deepEqual(l.steps.flatMap((s,i)=>s.type==='learn'?[]:[i]),[1,3,5,7]);
   assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);
   assert.doesNotMatch(JSON.stringify(l),/&#x|undefined|NaN/);
  }
 }
 assert.equal(hash(current.groups),old.groups);
 for(const exam of old.exams)assert.equal(hash(current.exams.find(e=>e.id===exam.id)),exam.hash);
 assert.equal(hash(read('src/content/game-catalog.json')),old.catalog);
 assert.equal(hash(lesson(482)),old.lessons.find(l=>l.id===482).hash);
});
test('inflation calculator moves intact to screen 3 and no longer appears on screen 5',()=>{
 const l=lesson(483),previous=old.before.find(l=>l.id===483);
 assert.deepEqual(l.steps[2].growthLab,previous.steps[4].growthLab);
 assert.equal(l.steps[4].growthLab,undefined);
 assert.equal(evaluateGrowthLab(l.steps[2].growthLab).result.ok,true);
 assert.match(l.steps[4].body,/Banco Central Europeo.*2 %.*medio plazo/);
 assert.ok(l.steps[4].sources.some(s=>s.url.startsWith('https://www.ecb.europa.eu/')));
 assert.ok(Math.abs(calculateInflation({amount:100,years:10,inflationRate:2}).futureEquivalent-121.89944199947573)<1e-8);
});
test('10% charts match authored fifteen/thirty-year examples without changing fixed exercise premises',()=>{
 const growth=lesson(485).steps[2].growthLab,time=lesson(486).steps[0].growthLab,contribution=lesson(487).steps[4].growthLab;
 for(const config of [growth,time,contribution]){
  assert.equal(config.values.annualRate,10);assert.deepEqual(config.compareYears,[15,30]);
  const model=evaluateGrowthLab(config);assert.equal(model.result.ok,true);
  assert.match(renderGrowthLab(config),/value="10"/);
 }
 assert.equal(Math.round(calculateCompound({...growth.values,years:15}).total),4177);
 assert.equal(Math.round(calculateCompound({...growth.values,years:30}).total),17449);
 assert.equal(Math.round(calculateCompound({...contribution.values,years:15}).total),44022);
 assert.equal(Math.round(calculateCompound({...contribution.values,years:30}).total),223734);
 assert.equal(calculateCompound({...contribution.values,years:15}).contributed,19000);
 assert.equal(calculateCompound({...contribution.values,years:30}).contributed,37000);
 assert.match(lesson(487).steps[5].body,/otro escenario.*5 %/);
 assert.equal(lesson(487).steps[5].activity.prompt,lesson(487).steps[5].body);
 assert.deepEqual(lesson(487).steps[5].activity.rows,old.before.find(l=>l.id===487).steps[5].activity.rows);
 assert.equal(lesson(485).steps[5].answer,5);
 const fees=calculateFees({initial:100,monthly:0,years:1,annualRate:10,annualFee:2});
 assert.ok(Math.abs(fees.withFees-107.8)<1e-8);
});
test('new table and classification exercises require every correct answer and reject plausible misunderstandings',()=>{
 const l=lesson(484);
 for(const index of [5,7]){
  const s=l.steps[index],a=s.activity;assert.equal(validateActivity(a),true);
  const packed=packedEditorial(s),draft={vars:packed.v,choice:null,number:'',selected:[],matches:packed.m,order:[]};
  assert.equal(activityAnswered(a,draft),true);assert.equal(activityCorrect(a,draft),true);
  const partial={...draft,matches:{...draft.matches}};delete partial.matches[0];
  assert.equal(activityAnswered(a,partial),false);
  for(let row=0;row<a.rows.length;row++){
   const wrong={...draft,matches:{...draft.matches,[row]:String((a.rows[row].answer+1)%a.rows[row].options.length)}};
   assert.equal(activityCorrect(a,wrong),false,`Must reject ${index}/${row}`);
  }
 }
 assert.deepEqual(l.steps[5].activity.rows.map(r=>r.answer),[2,1,1]);
 assert.equal(Number((200*1.1*1.03).toFixed(2)),226.6);
 assert.deepEqual(l.steps[7].activity.rows.map(r=>r.answer),[0,0,1,1]);
 assert.equal(l.steps[5].calculator,true);assert.equal(l.steps[7].calculator,true);
 assert.match(l.steps[5].explanation,/213,40/);
});
test('cloud synchronization restarts only the incompatible point 35 draft and preserves results and every other draft',()=>{
 const completed=Object.fromEntries(Array.from({length:50},(_,i)=>[450+i,{firstTry:4}]));
 const passedExams=Object.fromEntries(Array.from({length:5},(_,i)=>[45+i,{best:10,attempts:1,passed:true}]));
 for(const [id,revision,step,restart] of [[483,'stocks-compound-2026-10-11',4,false],[484,'stocks-compound-2026-10-11',5,true],[484,COMPOUND_NOTES_REVISION,5,false],[485,'stocks-compound-2026-10-11',2,false],[487,'stocks-compound-2026-10-11',4,false]]){
  const active=[id,step,Array.from({length:8},(_,i)=>i===0?{v:{contentRevision:revision}}:i===1?{c:1}:{})];
  if(id===484&&revision===COMPOUND_NOTES_REVISION)active[2][step]={v:{exerciseKind:lesson(id).steps[step].activity.kind}};
  const snapshot={...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed,passedExams,sessions:[active]};
  const remote=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot,null,100))));
  const app=mount(remote.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,restart?0:step);
  assert.deepEqual(app.saved.completed,completed);assert.deepEqual(app.saved.passedExams,passedExams);
  const draft=app.saved.sessions.find(s=>s[0]===id);
  if(restart){assert.equal(draft[2][0].v.contentRevision,COMPOUND_NOTES_REVISION);assert.ok(draft[2].every(s=>!s.p&&s.c===undefined));}
  else assert.deepEqual(draft,active);
 }
});
test('moved calculator is rendered after teaching, preserves drafts on return and ignores returns from another account',()=>{
 const id=483,active=[id,2,Array.from({length:8},(_,i)=>i===0?{v:{contentRevision:'stocks-compound-2026-10-11'}}:{})];
 const snapshot={...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},sessions:[active],completed:Object.fromEntries(Array.from({length:34},(_,i)=>[450+i,{firstTry:4}])),passedExams:{45:{best:10,attempts:1,passed:true},46:{best:10,attempts:1,passed:true},47:{best:10,attempts:1,passed:true}}};
 let opened;
 const app=mount(snapshot,null,{render(){},reset(){},open(kind,options){opened={kind,...options};return true;}});
 openLesson(app,id);
 assert.match(app.main.querySelector('#br-activity').innerHTML,/data-growth-lab=/);
 const before=structuredClone(app.saved.sessions);app.click({growthTool:'inflation'});
 assert.equal(opened.kind,'inflation');assert.equal(app.main.dataset.view,'lab');assert.deepEqual(app.saved.sessions,before);
 opened.onReturn();assert.equal(app.course.reportContext().stepIndex,2);assert.deepEqual(app.saved.sessions,before);
 app.click({growthTool:'inflation'});app.course.restore(emptySnapshot());opened.onReturn();assert.equal(app.main.dataset.view,'map');
});
