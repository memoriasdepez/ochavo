import {beforeOpening,beforeOpeningFile} from './opening-test-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CHALLENGE_REVISION} from '../scripts/stocks-editorial/challenge-constants.mjs';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson,openExam,lessons,exams} from './current-course-harness.js';
import {validateActivity} from '../src/exercise-formats.js';
import {parseAuthoring,compileRevision} from '../scripts/course-authoring.mjs';
import {refineStocks} from '../scripts/stocks-editorial/refine.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const baseline=JSON.parse(read('tests/fixtures/stocks-difficulty-baseline.json'));
const compoundBaseline=JSON.parse(read('tests/fixtures/stocks-compound-baseline.json'));
// The user superseded this difficulty stage with clearer, more varied practice.
// Keep testing the historical authoring stage, without imposing its close
// distractors and exact wording on the new published content.
const published=JSON.parse(read('src/content/stocks-curriculum-v2.json'));
const records=parseAuthoring(Array.from({length:5},(_,i)=>read(`src/content/stocks-v2-authoring/part-${i+1}.txt`)),500);
const course=refineStocks(compileRevision({outline:JSON.parse(read('src/content/stocks-outline-v2.json')),records,start:450,sources:published.sources}),records,{clarity:false});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rawHash=path=>createHash('sha256').update(beforeOpeningFile(path)).digest('hex');
const item=(kind,id)=>course[kind==='lesson'?'lessons':'exams'].find(item=>item.id===id);
const exercises=course.lessons.slice(40).flatMap(lesson=>lesson.steps.flatMap((step,index)=>step.type==='learn'||step.type==='numeric'?[]:[{id:lesson.id,index,step}]));
const kind=step=>step.activity?.kind||step.type;
// The user subsequently authorised a full rewrite of points 31–40 and exam 48.
// Keep every other guarantee from the difficulty-only revision intact.
const isCompoundRevision=(kind,id)=>kind==='lesson'?id>=480&&id<=489:id===48;

test('points 1–30, their three exams, the index and every learning objective remain identical to the published version',()=>{
 for(const expected of compoundBaseline.lessons.filter(item=>item.id<480))assert.equal(hash(item('lesson',expected.id)),expected.sha256,`Unchanged opening lesson ${expected.id}`);
 for(const expected of compoundBaseline.exams.filter(item=>item.id<48))assert.equal(hash(item('exam',expected.id)),expected.sha256,`Unchanged opening exam ${expected.id}`);
 assert.equal(hash(course.lessons.map(({id,title,short,prerequisites})=>({id,title,short,prerequisites}))),baseline.identity);
 assert.equal(hash(course.groups),baseline.groups);
 assert.equal(hash(JSON.parse(read('src/content/stocks-outline-v2.json'))),baseline.outline);
 for(const expected of baseline.metadata.filter(expected=>!isCompoundRevision('lesson',expected.id))){
  const {steps,editorialRevision,...metadata}=item('lesson',expected.id);
  assert.equal(hash(metadata),expected.sha256,`Metadata changed in ${expected.id}`);
 }
});

test('prior explanations and numerical exercises remain identical outside the separately authorised world-four rewrite',()=>{
 assert.equal(baseline.numeric.length,227);
 for(const expected of baseline.teachings.filter(expected=>!isCompoundRevision('lesson',expected.id)))assert.equal(hash(item('lesson',expected.id).steps.filter(step=>step.type==='learn')),expected.sha256,`Teaching changed in ${expected.id}`);
 for(const expected of baseline.numeric.filter(expected=>!isCompoundRevision(expected.kind,expected.id)))assert.equal(hash(item(expected.kind,expected.id).steps[expected.index]),expected.sha256,`Numeric changed in ${expected.kind} ${expected.id}/${expected.index}`);
});

test('all qualitative challenges from point 41 and their exam questions have been rewritten without changing reward slots',()=>{
 assert.equal(exercises.length,1696);
 assert.equal(baseline.qualitative.length,2103);
 for(const expected of baseline.qualitative){
  const step=item(expected.kind,expected.id).steps[expected.index];
  assert.ok(!['numeric','learn'].includes(step.type),`Question became numerical in ${expected.id}/${expected.index}`);
  assert.notEqual(hash(step),expected.sha256,`Unrevised question ${expected.kind} ${expected.id}/${expected.index}`);
  assert.ok(step.explanation?.trim().length>30,`Missing reasoned feedback ${expected.id}/${expected.index}`);
 }
 assert.equal(rawHash('src/content/game-catalog.json'),baseline.rewardCatalog);
 for(const [name,expected] of Object.entries(baseline.otherPaths))assert.equal(rawHash('src/content/'+name+'.json'),expected,`Unrelated path changed: ${name}`);
});

test('new interactions are usable, spread through the path and keep adjacent points varied',()=>{
 const added=new Map(['reverse','repair','all','diagram'].map(format=>[format,new Set()]));
 let previous=null;
 for(const lesson of course.lessons.slice(40)){
  assert.equal(lesson.editorialRevision,CHALLENGE_REVISION);
  assert.equal(lesson.steps.length,8);
  const sequence=lesson.steps.filter(step=>step.type!=='learn').map(kind);
  assert.ok(new Set(sequence).size>=3,`${lesson.id}: ${sequence}`);
  if(previous)assert.notDeepEqual(sequence,previous,`Adjacent repetitive sequence at ${lesson.id}`);
  previous=sequence;
  for(const [index,step] of lesson.steps.entries()){
   if(step.type==='learn')continue;
   assert.equal(lesson.steps[index-1].type,'learn');
   const a=step.activity;
   // A concrete case can retain two deliberately close interpretations;
   // general questions and reverse questions need a wider comparison.
   if(!a&&step.type==='choice')assert.ok(step.options.length>=3||(lesson.id>=700&&index===3&&step.options.length===2),`Incomplete qualitative choice ${lesson.id}/${index}`);
   if(!a)continue;
   assert.equal(validateActivity(a),true,`${lesson.id}/${index}`);
   if(added.has(a.kind))added.get(a.kind).add(Math.floor(lesson.id/10));
   if(a.kind==='reverse')assert.ok(a.response?.trim().length>30,`Missing reverse answer ${lesson.id}`);
   if(a.kind==='repair')for(const row of a.rows){
    assert.ok(row.label.includes(row.wrongWord),`Unmarked fragment ${lesson.id}`);
    assert.ok(row.options.length>=3,`Only one possible replacement ${lesson.id}`);
    assert.ok(new Set(row.options.filter(option=>option!==row.wrongWord)).size>=2,`Only one replacement differs from the marked error ${lesson.id}`);
   }
   if(a.kind==='all'){
    assert.ok(a.options.length===4||(lesson.id>=700&&index===1&&a.options.length===3),`Incomplete multi-select ${lesson.id}/${index}`);
    assert.equal(a.answers.length,2,`Multi-select should choose two supported claims ${lesson.id}`);
   }
   if(['choice','reverse','intruder','clues'].includes(a.kind))assert.ok(a.options.length>=3||(lesson.id>=700&&index===3&&a.kind==='clues'&&a.options.length===2),`Incomplete comparison ${lesson.id}/${index}`);
  }
 }
 for(const [format,worlds] of added)assert.ok(worlds.size>=10,`${format} appears in only ${worlds.size} worlds`);
 for(const exam of course.exams.slice(4)){
  assert.equal(exam.editorialRevision,CHALLENGE_REVISION);
  for(const step of exam.steps){
   assert.equal(step.activity,undefined,'Exams must retain their supported controls');
   assert.ok(!lessons[step.reviewLesson].steps.some(practice=>practice.type!=='learn'&&practice.body===step.body),`Copied exam prompt ${exam.id}`);
  }
 }
});

const session=(id,revision)=>[id,3,Array.from({length:8},(_,i)=>i===0?{v:{contentRevision:revision}}:i===3?{c:1}:{})];
const examDraft=(id,revision)=>({id,step:3,order:Array.from({length:10},(_,i)=>i),submitted:false,drafts:Array.from({length:10},(_,i)=>i===0?{v:{contentRevision:revision}}:{c:1})});
const passed=()=>Object.fromEntries(Array.from({length:5},(_,i)=>[45+i,{best:10,attempts:1,passed:true}]));
const completed=()=>Object.fromEntries(Array.from({length:50},(_,i)=>[450+i,{firstTry:4}]));

test('only revised drafts restart, while approved progress and a draft inside points 1–30 survive cloud sync',()=>{
 const old='stocks-progressive-2026-10-10';
 // Cloud merge retains only the active replay of an already approved point.
 // Test each active replay independently, rather than expecting an inactive
 // completed replay to survive the normal completed-session cleanup.
 for(const id of [470,490]){
  const active=session(id,old);
  const snapshot={...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed:completed(),passedExams:passed(),sessions:[active]};
  const cloud=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot,null,100))));
  const app=mount(cloud.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,id===490?0:3);
  const draft=app.saved.sessions.find(item=>item[0]===id);
  if(id===490){
   assert.equal(draft[2][0].v.contentRevision,lessons[id].editorialRevision);
   assert.ok(draft[2].every(d=>d.c===undefined&&!d.p));
  }else assert.deepEqual(draft,active);
  assert.deepEqual(app.saved.completed,snapshot.completed);
  assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
 }
});

test('revised exams clear incompatible answers while the third exam and passed exam history remain intact',()=>{
 const old='stocks-progressive-2026-10-10';
 const keep=examDraft(47,old),reset=examDraft(49,old);
 for(const [exam,shouldRestart] of [[keep,false],[reset,true]]){
  const snapshot={...emptySnapshot(),group:exam.id,exam,examSessions:{stocks:exam},completed:completed(),passedExams:passed()};
  const app=mount(snapshot);app.window.virutaAttemptId=()=>'10000000-0000-4000-8000-000000000001';
  openExam(app,exam.id);
  assert.equal(app.saved.exam.step,shouldRestart?0:3);
  assert.equal(app.saved.exam.drafts[0].v.contentRevision,exams[exam.id].editorialRevision);
  if(shouldRestart)assert.ok(app.saved.exam.drafts.every(draft=>draft.c===undefined));
  assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
 }
});
