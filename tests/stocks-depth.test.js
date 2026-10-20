import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {depthGuides,extraRealExamples,depthFigures,illustratedPoints} from '../scripts/stocks-editorial/depth-teaching.mjs';
import {realExamples} from '../scripts/stocks-editorial/real-examples-data.mjs';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
import {beforeSecondCorrections,beforeSecondCatalog} from './second-corrections-utils.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url));
const course=JSON.parse(read('src/content/stocks-curriculum-v2.json'));course.lessons=course.lessons.map(beforeSecondCorrections);
const old=JSON.parse(read('tests/fixtures/stocks-depth-0320-baseline.json'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const words=s=>s.trim().split(/\s+/).length;
const lesson=p=>course.lessons[p-1];

test('development starts exactly at 53 and preserves every identity, answer, revision, exam and reward',()=>{
 assert.equal(course.lessons.length,500);assert.equal(Object.keys(depthGuides).length,448);
 for(const prior of old.lessons){
  const current=course.lessons.find(l=>l.id===prior.id);
  if(current.id<502)assert.equal(hash(current),prior.full,`Protected point ${current.id-449}`);
  assert.equal(hash([current.id,current.title,current.short,current.prerequisites,current.editorialRevision]),prior.identity);
  assert.equal(hash(current.steps.filter(s=>s.type!=='learn')),prior.exercises,`Exercise changed ${current.id}`);
 }
 for(const prior of old.exams)assert.equal(hash(course.exams.find(e=>e.id===prior.id)),prior.hash);
 assert.equal(hash(course.groups),old.groups);
 assert.equal(createHash('sha256').update(beforeSecondCatalog(read('src/content/game-catalog.json'))).digest('hex'),old.catalogHash);
 for(const [file,expected] of Object.entries(old.otherPaths))assert.equal(createHash('sha256').update(read('src/content/'+file+'.json')).digest('hex'),expected,file);
});

test('all 1792 teaching screens are developed, with individually authored explanations rather than repeated padding',()=>{
 const paragraphs=Object.values(depthGuides).flat();assert.equal(paragraphs.length,1344);assert.equal(new Set(paragraphs).size,1344);
 let previousWords=0,currentWords=0;
 for(const prior of old.lessons.filter(l=>l.id>=502)){
  const current=course.lessons.find(l=>l.id===prior.id),teaching=current.steps.filter(s=>s.type==='learn');
  for(let i=0;i<4;i++){
   assert.notEqual(teaching[i].body,prior.learn[i].body,`Unreviewed explanation ${current.id}/${i}`);
   assert.ok(words(teaching[i].body)>prior.learn[i].words,`Undeveloped explanation ${current.id}/${i}`);
   assert.ok(teaching[i].body.includes('\n\n'),'Readable paragraphs');
   assert.doesNotMatch(teaching[i].body,/TODO|undefined|NaN|\{[a-d]\}|en 1 años/);
   if(prior.learn[i].figure)assert.deepEqual(teaching[i].figure,prior.learn[i].figure,`Retained visual ${current.id}/${i}`);
   previousWords+=prior.learn[i].words;currentWords+=words(teaching[i].body);
  }
  assert.equal(current.summary,current.steps[0].body,'No duplicative introduction');
 }
 assert.ok(currentWords/previousWords>1.8,'The earlier terse explanations need substantive development');
 assert.ok(illustratedPoints.size>200&&illustratedPoints.size<400,'Illustrations are explicitly selected, not added to every point');
});

test('practical explanations specify the operation, economic meaning and documentation across the whole path',()=>{
 for(const [point,expressions] of [
  [53,[/no estás reservando/i,/cuántas acciones ofrecen/i]],
  [58,[/por cada euro recibes/i,/neto recibido/i]],
  [124,[/pago de la compra/i,/sustituir ese recurso/i]],
  [201,[/no significa que esa cantidad se haya pagado como dividendo/i]],
  [251,[/no basta con restar el porcentaje/i,/importe, fecha y tasa/i]],
  [366,[/no cancela necesariamente el contrato/i,/opciones de salida/i]],
  [413,[/compensación organiza información/i,/quién decide/i]],
  [466,[/derecho de cobro no equivale a efectivo/i,/qué queda retenido/i]],
  [491,[/créditos de un banco/i,/pregunta antes del indicador/i]],
  [500,[/comparar dos alternativas no obliga a escoger/i,/documentación priorizadas/i]],
 ]){
  const text=lesson(point).steps.filter(s=>s.type==='learn').map(s=>s.body).join('\n');
  for(const expression of expressions)assert.match(text,expression,`Point ${point}`);
 }
});

test('all previous real examples and visuals remain and the six new cases have dated primary evidence',()=>{
 for(const [point,slot,key,title,body,figure] of realExamples){
  const s=lesson(point).steps[slot];assert.ok(s.body.includes(body),`Prior real example lost ${point}`);
  assert.equal(s.realExample.title,title);if(figure)assert.deepEqual(s.figure,figure);
 }
 assert.equal(extraRealExamples.length,6);
 for(const e of extraRealExamples){
  const s=lesson(e.point).steps[e.slot];assert.ok(s.body.includes(e.body));assert.equal(s.type,'learn');
  assert.equal(e.source.checkedAt,'2026-10-13');assert.ok(e.source.period);
  assert.ok(['www.microsoft.com','www.sec.gov','ir.prologis.com'].includes(new URL(e.source.url).hostname));
  assert.ok(s.sources.some(source=>source.url===e.source.url));
  assert.equal(lesson(e.point).practiceContext,'simulation');
  if(e.figure){assert.deepEqual(s.figure,e.figure);assert.doesNotMatch(e.figure.caption,/fictici|simulad/);}
 }
 const rows=lesson(103).steps[0].figure.rows;assert.equal(281724-87831,193893);
 assert.deepEqual(rows.map(row=>row[1]),['281.724','87.831','193.893']);
 assert.match(lesson(103).steps[0].figure.headers[1],/millones de USD/);
 for(const [point,fig] of Object.entries(depthFigures)){
  const oldFig=old.lessons[Number(point)-1].learn[0].figure;
  assert.deepEqual(lesson(Number(point)).steps[0].figure,oldFig||fig);
 }
});

test('text-only development resumes existing drafts with answers and approved progress unchanged',()=>{
 const completed=Object.fromEntries(course.lessons.map(l=>[l.id,{firstTry:l.id===453?5:4}]));
 const passedExams=Object.fromEntries(course.exams.map(e=>[e.id,{best:9,passed:true,attempts:2}]));
 for(const point of [53,152,251,413,500]){
  const l=lesson(point),drafts=l.steps.map((_,i)=>i===0?{v:{contentRevision:l.editorialRevision}}:i===3?{c:1}:{});
  const snapshot={...emptySnapshot(),completed,passedExams,activeId:l.id,activeByTrack:{stocks:l.id},sessions:[[l.id,3,drafts]]};
  const merged=mergeProgress(null,makeEnvelope(snapshot,null,100));
  const app=mount(merged.snapshot);openLesson(app,l.id);
  assert.equal(app.course.reportContext().stepIndex,3);assert.equal(app.saved.sessions[0][2][3].c,1);
  assert.deepEqual(app.saved.completed,completed);assert.deepEqual(app.saved.passedExams,passedExams);
 }
});
