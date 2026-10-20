import {beforeOpening,beforeOpeningFile} from './opening-test-utils.js';
import {beforeCompoundNotes} from './compound-notes-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson,openExam} from './current-course-harness.js';
import {validateActivity} from '../src/exercise-formats.js';
import {calculateCompound,calculateCagr,calculateFees,calculateInflation} from '../src/lab-calculators.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rawHash=path=>createHash('sha256').update(beforeOpeningFile(path)).digest('hex');
const course=JSON.parse(read('src/content/stocks-curriculum-v2.json'));
course.lessons=course.lessons.map(beforeCompoundNotes);
const baseline=JSON.parse(read('tests/fixtures/stocks-compound-baseline.json'));
const revised=course.lessons.filter(lesson=>lesson.id>=480&&lesson.id<=489);
const exam=course.exams.find(exam=>exam.id===48);
const REVISION='stocks-compound-2026-10-11';
const kind=step=>step.activity?.kind||step.type;
const widgets=revised.flatMap(lesson=>lesson.steps.flatMap((step,index)=>step.growthLab?[{lesson:lesson.id,index,...step.growthLab}]:[]));
const calculators={compound:calculateCompound,cagr:calculateCagr,fees:calculateFees,inflation:calculateInflation};

test('the compound revision preserves points 1–30; the separately authorised later clarity revision preserves the index and rewards',()=>{
 assert.equal(baseline.lessons.length,500);assert.equal(baseline.exams.length,50);
 for(const expected of baseline.lessons.filter(lesson=>lesson.id<490)){
  const lesson=beforeOpening(course.lessons.find(lesson=>lesson.id===expected.id));
  if(expected.id>=480&&expected.id<=489)assert.notEqual(hash(lesson),expected.sha256,`Point not revised: ${expected.id}`);
  else assert.equal(hash(lesson),expected.sha256,`Unrelated point changed: ${expected.id}`);
 }
 for(const expected of baseline.exams.filter(exam=>exam.id<49)){
  const actual=course.exams.find(exam=>exam.id===expected.id);
  if(expected.id===48)assert.notEqual(hash(actual),expected.sha256);
  else assert.equal(hash(actual),expected.sha256,`Unrelated exam changed: ${expected.id}`);
 }
 assert.equal(hash(course.groups),baseline.groups);
 assert.equal(rawHash('src/content/stocks-outline-v2.json'),baseline.outline);
 assert.equal(hash(course.lessons.map(({id,title,short,prerequisites})=>({id,title,short,prerequisites}))),baseline.identity);
 assert.equal(rawHash('src/content/game-catalog.json'),baseline.rewardCatalog);
 for(const [name,expected] of Object.entries(baseline.otherPaths))assert.equal(rawHash(`src/content/${name}.json`),expected,`Other path changed: ${name}`);
});

test('world four pairs each task with teaching, keeps reward positions and varies neighbouring activities',()=>{
 assert.equal(revised.length,10);
 let previous;
 for(const lesson of revised){
  assert.equal(lesson.editorialRevision,REVISION);
  assert.equal(lesson.steps.length,8,`Reward positions changed: ${lesson.id}`);
  assert.deepEqual(lesson.steps.flatMap((step,index)=>step.type==='learn'?[]:[index]),[1,3,5,7]);
  const formats=lesson.steps.filter(step=>step.type!=='learn').map(kind);
  assert.ok(new Set(formats).size>=3,`Not enough variety: ${lesson.id}/${formats}`);
  if(previous)assert.notDeepEqual(formats,previous,`Repeated adjacent structure: ${lesson.id}`);
  previous=formats;
  for(let index=0;index<8;index+=2){
   const teaching=lesson.steps[index],practice=lesson.steps[index+1];
   assert.equal(teaching.type,'learn');
   assert.ok(teaching.body.trim().length>100,`Thin explanation: ${lesson.id}/${index}`);
   assert.ok(teaching.takeaway?.trim().length>15,`Missing key idea: ${lesson.id}/${index}`);
   assert.ok(practice.explanation?.trim().length>30,`Missing reasoned feedback: ${lesson.id}/${index+1}`);
   if(practice.activity)assert.equal(validateActivity(practice.activity),true,`Invalid interaction: ${lesson.id}/${index+1}`);
  }
 }
 assert.equal(exam.editorialRevision,REVISION);
 assert.equal(exam.steps.length,10);
 assert.deepEqual(exam.steps.map(step=>step.reviewLesson),revised.map(lesson=>lesson.id));
 for(const step of exam.steps){
  const lesson=revised.find(lesson=>lesson.id===step.reviewLesson);
  assert.ok(!lesson.steps.some(practice=>practice.type!=='learn'&&practice.body===step.body),`Copied exam question: ${step.reviewLesson}`);
 }
});

test('the lessons include usable CAGR and compound scenarios, including fifteen and thirty years',()=>{
 assert.ok(widgets.filter(widget=>widget.kind==='compound').length>=3);
 assert.ok(widgets.filter(widget=>widget.kind==='cagr').length>=2);
 assert.ok(widgets.some(widget=>widget.kind==='fees'));
 assert.ok(widgets.some(widget=>widget.kind==='inflation'));
 assert.ok(widgets.some(widget=>widget.kind==='compound'&&widget.compareYears?.includes(15)&&widget.compareYears?.includes(30)));
 for(const widget of widgets){
  assert.equal(widget.index%2,0,'Exploration belongs in teaching, without charging attempts or earning rewards');
  assert.ok(calculators[widget.kind],`Unsupported calculator: ${widget.kind}`);
  assert.ok(widget.title?.trim().length>3);
  assert.ok(widget.prompt?.trim().length>15);
  assert.equal(calculators[widget.kind](widget.values).ok,true,`Invalid initial scenario: ${widget.lesson}/${widget.index}`);
  for(const years of widget.compareYears||[])assert.equal(calculators[widget.kind]({...widget.values,years}).ok,true,`Invalid comparison: ${widget.lesson}/${years}`);
 }
 const text=revised.flatMap(lesson=>lesson.steps).map(step=>[step.body,step.takeaway,step.explanation].filter(Boolean).join(' ')).join('\n');
 assert.match(text,/Laboratorio/);
 assert.match(text,/CAGR/);
 assert.match(text,/15 años/);
 assert.match(text,/30 años/);
});

test('the authored arithmetic uses complete cash returns, successive changes and exact real-return adjustment',()=>{
 const answer=(id,index)=>revised.find(lesson=>lesson.id===id).steps[index].answer;
 assert.equal(answer(480,3),(530+10-500)/500*100,'Dividends count in the total return');
 assert.equal(answer(482,1),200*1.25*.8,'The second percentage applies to the updated balance');
 assert.equal(answer(484,3),Number(((112/108-1)*100).toFixed(2)),'Real return divides growth factors');
 assert.equal(answer(485,5),Number((500*1.1**2-(500+50*2)).toFixed(2)),'Compare reinvestment with principal plus withdrawn gains');
 for(const widget of widgets.filter(widget=>widget.kind==='cagr')){
  const teaching=revised.find(lesson=>lesson.id===widget.lesson).steps[widget.index];
  assert.doesNotMatch(teaching.body+' '+widget.prompt,/La curva que ves|obtienes una línea de crecimiento|La curva es el crecimiento/,'CAGR displays endpoints, not a historical price curve');
 }
});

const session=(id,revision)=>[id,3,Array.from({length:8},(_,index)=>index===0?{v:{contentRevision:revision}}:index===3?{c:1}:{})];
const completed=()=>Object.fromEntries(Array.from({length:50},(_,index)=>[450+index,{firstTry:4}]));
const passed=()=>Object.fromEntries(Array.from({length:5},(_,index)=>[45+index,{best:10,attempts:1,passed:true}]));

test('only incompatible world-four drafts restart after cloud sync, with approved results preserved',()=>{
 const old='stocks-progressive-2026-10-10';
 for(const [id,revision,restart] of [[479,old,false],[480,old,true],[489,old,true],[490,course.lessons.find(lesson=>lesson.id===490).editorialRevision,false],[480,REVISION,false]]){
  const active=session(id,revision);
  const snapshot={...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed:completed(),passedExams:passed(),sessions:[active]};
  const cloud=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot,null,100))));
  const app=mount(cloud.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,restart?0:3,`Wrong draft migration: ${id}/${revision}`);
  const draft=app.saved.sessions.find(draft=>draft[0]===id);
  if(restart){
   assert.equal(draft[2][0].v.contentRevision,REVISION);
   assert.ok(draft[2].every(step=>step.c===undefined&&!step.p));
  }else assert.deepEqual(draft,active);
  assert.deepEqual(app.saved.completed,snapshot.completed);
  assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
 }
});

test('the revised world-four exam discards incompatible answers without deleting its passed history',()=>{
 const draft={id:48,step:3,order:Array.from({length:10},(_,index)=>index),submitted:false,drafts:Array.from({length:10},(_,index)=>index===0?{v:{contentRevision:'stocks-progressive-2026-10-10'}}:{c:1})};
 const snapshot={...emptySnapshot(),group:48,exam:draft,examSessions:{stocks:draft},completed:completed(),passedExams:passed()};
 const app=mount(snapshot);app.window.virutaAttemptId=()=>'10000000-0000-4000-8000-000000000001';
 openExam(app,48);
 assert.equal(app.saved.exam.step,0);
 assert.equal(app.saved.exam.drafts[0].v.contentRevision,REVISION);
 assert.ok(app.saved.exam.drafts.every(step=>step.c===undefined));
 assert.deepEqual(app.saved.completed,snapshot.completed);
 assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
});

test('opening the full calculator returns to the same teaching screen without saving experimental money as progress',()=>{
 const widget=widgets.find(widget=>widget.kind==='compound');
 assert.ok(widget);
 const active=session(widget.lesson,REVISION);active[1]=widget.index;
 const snapshot={...emptySnapshot(),activeId:widget.lesson,activeByTrack:{stocks:widget.lesson},completed:completed(),passedExams:passed(),sessions:[active]};
 let opened;
 const laboratory={render(){},reset(){},open(kind,options){opened={kind,...options};return true;}};
 const app=mount(snapshot,null,laboratory);
 const experimental={...widget.values,initial:123456.789};
 app.window.OchavoGrowthLab.readValues=()=>experimental;
 openLesson(app,widget.lesson);
 assert.match(app.main.querySelector('#br-activity').innerHTML,/data-growth-lab=/,'The course renderer must actually include the interactive chart');
 assert.match(app.main.querySelector('#br-activity').innerHTML,/data-growth-tool="compound"/);
 const before=JSON.parse(JSON.stringify(app.saved.sessions));
 app.click({growthTool:widget.kind});
 assert.equal(app.main.dataset.view,'lab');
 assert.equal(opened.kind,widget.kind);
 assert.deepEqual(opened.values,experimental);
 assert.deepEqual(app.saved.sessions,before);
 assert.doesNotMatch(JSON.stringify(app.saved),/123456\.789/);
 opened.onReturn();
 assert.equal(app.main.dataset.view,'lesson');
 assert.equal(app.course.reportContext().stepIndex,widget.index);
 assert.deepEqual(app.saved.sessions,before);
 assert.deepEqual(app.saved.completed,snapshot.completed);
 assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
});

test('a calculator return from a previous account cannot reopen its lesson in a new session',()=>{
 const widget=widgets.find(widget=>widget.kind==='cagr');
 assert.ok(widget);
 const active=session(widget.lesson,REVISION);active[1]=widget.index;
 const snapshot={...emptySnapshot(),activeId:widget.lesson,activeByTrack:{stocks:widget.lesson},completed:completed(),passedExams:passed(),sessions:[active]};
 let resume;
 const app=mount(snapshot,null,{render(){},reset(){},open(_kind,{onReturn}){resume=onReturn;return true;}});
 openLesson(app,widget.lesson);
 app.click({growthTool:widget.kind});
 assert.equal(typeof resume,'function');
 app.course.restore(emptySnapshot());
 resume();
 assert.equal(app.main.dataset.view,'map');
 assert.equal(app.course.reportContext().lessonId,-1);
});
