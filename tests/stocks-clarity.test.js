import {beforeOpening,beforeOpeningFile} from './opening-test-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CLARITY_REVISION} from '../scripts/stocks-editorial/clarity-constants.mjs';
import {IDENTIFICATION_REVISION} from '../scripts/stocks-editorial/real-examples.mjs';
import {validateActivity,activityAnswered,activityCorrect} from '../src/exercise-formats.js';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson,openExam} from './current-course-harness.js';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rawHash=path=>createHash('sha256').update(beforeOpeningFile(path)).digest('hex');
const baseline=JSON.parse(read('tests/fixtures/stocks-clarity-baseline.json'));
const course=JSON.parse(read('src/content/stocks-curriculum-v2.json'));
const revised=course.lessons.slice(40);
const formats=step=>step.activity?.kind||step.type;
const norm=value=>value.normalize('NFKC').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
const lessonById=id=>course.lessons.find(lesson=>lesson.id===id);

test('clarity changes only points 41–500 and their exams, preserving all forty approved points byte-for-byte',()=>{
 assert.equal(revised.length,460);
 assert.equal(course.lessons.length,500);assert.equal(course.exams.length,50);
 for(const old of baseline.lessons){
  const lesson=beforeOpening(lessonById(old.id));
  if(old.id<490)assert.equal(hash(lesson),old.sha256,`Protected point changed: ${old.id}`);
  else {assert.equal(lesson.editorialRevision,lesson.id===501?IDENTIFICATION_REVISION:CLARITY_REVISION);assert.notEqual(hash(lesson),old.sha256,`Point not revised: ${old.id}`);}
 }
 for(const old of baseline.exams){
  const exam=course.exams.find(exam=>exam.id===old.id);
  if(old.id<49)assert.equal(hash(exam),old.sha256,`Protected exam changed: ${old.id}`);
  else {assert.equal(exam.editorialRevision,CLARITY_REVISION);assert.notEqual(hash(exam),old.sha256,`Exam not revised: ${old.id}`);}
 }
 assert.equal(hash(course.groups),baseline.groups);
 assert.equal(hash(course.lessons.map(({id,title,short,prerequisites})=>({id,title,short,prerequisites}))),baseline.identity);
 assert.equal(rawHash('src/content/stocks-outline-v2.json'),baseline.outline);
 assert.equal(rawHash('src/content/game-catalog.json'),baseline.rewardCatalog);
 for(const [name,expected] of Object.entries(baseline.otherPaths))assert.equal(rawHash('src/content/'+name+'.json'),expected,`Unrelated content changed: ${name}`);
});

test('revised practice keeps stable reward positions and meaningful variation between neighbouring points',()=>{
 let previous;
 const use=new Map();
 for(const lesson of revised){
  assert.equal(lesson.steps.length,8);
  assert.deepEqual(lesson.steps.map(step=>step.type==='learn'),[true,false,true,false,true,false,true,false]);
  const sequence=lesson.steps.filter(step=>step.type!=='learn').map(formats);
  assert.ok(new Set(sequence).size>=3,`${lesson.id}: ${sequence}`);
  if(previous)assert.notDeepEqual(sequence,previous,`Adjacent repeated sequence ${lesson.id}`);
  previous=sequence;
  for(const [index,step] of lesson.steps.entries()){
   assert.ok(step.body?.trim().length>10,`Missing context: ${lesson.id}/${index}`);
   if(step.type==='learn'){assert.ok(step.takeaway?.trim().length>10);continue;}
   use.set(formats(step),(use.get(formats(step))||0)+1);
   assert.ok(step.explanation?.trim().length>25,`Missing learning feedback: ${lesson.id}/${index}`);
   if(step.activity)assert.equal(validateActivity(step.activity),true,`${lesson.id}/${index}`);
   if(step.type==='match'){
    assert.equal(new Set(step.pairs.map(pair=>norm(pair.right))).size,step.pairs.length,`Ambiguous identical matching destinations: ${lesson.id}/${index}`);
   }
   const options=step.activity?.options||step.options?.map(option=>option.text);
   if(options)assert.equal(new Set(options.map(norm)).size,options.length,`Duplicate answer option: ${lesson.id}/${index}`);
   assert.doesNotMatch(step.activity?.prompt||step.body,/qué revisión contiene las piezas necesarias|conserva una condición pendiente|qué plan permite contrastar el alcance|segundo informe se propone/i,`Retired abstract wrapper: ${lesson.id}/${index}`);
  }
 }
 assert.ok(use.size>=12,`Too few supported dynamics across 460 points: ${[...use.keys()]}`);
 const visualWorlds=new Set(revised.filter(lesson=>lesson.steps.some(step=>step.figure)).map(lesson=>Math.floor(lesson.id/10)));
 assert.ok(visualWorlds.size>=30,`Visual resources absent from most worlds: ${visualWorlds.size}`);
});

test('figures use complete labelled data and the exam refers to the ten taught objectives',()=>{
 const checkFigure=(figure,where)=>{
  assert.ok(figure.caption?.trim().length>6,`Unlabelled resource: ${where}`);
  if(figure.kind==='table'){
   assert.ok(figure.headers.length>=2&&figure.rows.length>=1,where);
   for(const row of figure.rows)assert.equal(row.length,figure.headers.length,`Incomplete table: ${where}`);
  }else if(figure.kind==='flow')assert.ok(figure.items.length>=2,where);
  else if(figure.kind==='bars'){
   assert.equal(figure.labels.length,figure.values.length,where);
   assert.ok(figure.values.every(Number.isFinite),where);
   assert.ok(typeof figure.unit==='string',where);
  }else assert.fail(`Unknown figure format: ${where}/${figure.kind}`);
 };
 for(const lesson of revised)for(const [index,step] of lesson.steps.entries())if(step.figure)checkFigure(step.figure,`${lesson.id}/${index}`);
 for(const exam of course.exams.slice(4)){
  assert.equal(exam.steps.length,10);
  assert.deepEqual(exam.steps.map(step=>step.reviewLesson),Array.from({length:10},(_,i)=>exam.id*10+i));
  for(const [index,step] of exam.steps.entries()){
   assert.equal(step.activity,undefined,'Exams use the existing supported answer controls');
   assert.ok(!lessonById(step.reviewLesson).steps.some(practice=>practice.type!=='learn'&&practice.body===step.body),`Copied exam practice: ${exam.id}/${index}`);
   if(step.figure)checkFigure(step.figure,`Exam ${exam.id}/${index}`);
  }
 }
});

test('new activity controls reject incomplete and incorrect answers without awarding anything themselves',()=>{
 const tested=new Set();
 for(const lesson of revised)for(const step of lesson.steps){
  const a=step.activity;if(!a||tested.has(a.kind))continue;tested.add(a.kind);
  const draft={choice:null,selected:[],order:[],matches:{},number:'',vars:{exerciseKind:a.kind}};
  assert.equal(activityAnswered(a,draft),false,`${a.kind}: an untouched control must not count as answered`);
  if(a.rows)draft.matches=Object.fromEntries(a.rows.map((row,i)=>[i,String(row.answer)]));
  else if(a.answers)draft.selected=[...a.answers];
  else if(['sort','build'].includes(a.kind)){draft.order=[...a.answer];draft.vars.exerciseTouched=1;}
  else if(a.kind==='allocate')draft.vars.exerciseAlloc=[...a.answer];
  else if(a.kind==='interval')draft.matches={0:String(a.answer[0]),1:String(a.answer[1])};
  else if(a.kind==='slider'){draft.number=String(a.answer);draft.vars.exerciseTouched=1;}
  else if(a.kind==='short'){if(typeof a.answer==='number')draft.number=String(a.answer);else draft.vars.exerciseText=a.answer;}
  else draft.choice=a.answer;
  assert.equal(activityCorrect(a,draft),true,`${a.kind}: the authored answer must work`);
  if(a.rows)draft.matches[0]=String((a.rows[0].answer+1)%a.rows[0].options.length);
  else if(a.answers){const wrong=a.options.findIndex((_,i)=>!a.answers.includes(i));if(wrong>=0)draft.selected=[wrong];else draft.selected=[];}
  else if(['sort','build'].includes(a.kind))[draft.order[0],draft.order[1]]=[draft.order[1],draft.order[0]];
  else if(a.kind==='allocate'){draft.vars.exerciseAlloc[0]++;}
  else if(a.kind==='interval')draft.matches={0:String(a.answer[1]),1:String(a.answer[0])};
  else if(a.kind==='slider')draft.number=String(a.answer===a.max?a.min:a.max);
  else if(a.kind==='short'){draft.number='999999999';draft.vars.exerciseText='respuesta equivocada';}
  else draft.choice=(a.answer+1)%a.options.length;
  assert.equal(activityCorrect(a,draft),false,`${a.kind}: a wrong response must be rejected`);
 }
 assert.ok(tested.size>=8);
});

const session=(id,revision)=>[id,3,Array.from({length:8},(_,index)=>index===0?{v:{contentRevision:revision}}:index===3?{c:1}:{})];
test('cloud progress keeps completions and compatible drafts, and restarts only newly incompatible practice',()=>{
 const completed=Object.fromEntries(course.lessons.map(lesson=>[lesson.id,{firstTry:4}]));
 const passedExams=Object.fromEntries(course.exams.map(exam=>[exam.id,{best:10,attempts:1,passed:true}]));
 for(const [id,revision,restart] of [[479,'stocks-progressive-2026-10-10',false],[489,'stocks-compound-2026-10-11',false],[490,'stocks-challenges-2026-10-11',true],[700,'stocks-challenges-2026-10-11',true],[949,CLARITY_REVISION,false]]){
  const active=session(id,revision);
  const snapshot={...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed,passedExams,sessions:[active]};
  const merged=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot,null,100))));
  const app=mount(merged.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,restart?0:3,`${id}/${revision}`);
  const saved=app.saved.sessions.find(draft=>draft[0]===id);
  if(restart){assert.equal(saved[2][0].v.contentRevision,CLARITY_REVISION);assert.ok(saved[2].every(draft=>draft.c===undefined&&!draft.p));}
  else assert.deepEqual(saved,active);
  assert.deepEqual(app.saved.completed,completed);
  assert.deepEqual(app.saved.passedExams,passedExams);
 }
 for(const id of [48,49,94]){
  const revision=id===48?'stocks-compound-2026-10-11':'stocks-challenges-2026-10-11';
  const exam={id,step:3,order:Array.from({length:10},(_,i)=>i),submitted:false,drafts:Array.from({length:10},(_,i)=>i===0?{v:{contentRevision:revision}}:{c:1})};
  const app=mount({...emptySnapshot(),group:id,exam,examSessions:{stocks:exam},completed,passedExams});
  app.window.virutaAttemptId=()=>'10000000-0000-4000-8000-000000000001';openExam(app,id);
  assert.equal(app.saved.exam.step,id===48?3:0);
  assert.deepEqual(app.saved.completed,completed);assert.deepEqual(app.saved.passedExams,passedExams);
 }
});
