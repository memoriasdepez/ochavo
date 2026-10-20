import {beforeDepth} from './depth-test-utils.js';
import {beforeOpening,beforeOpeningFile} from './opening-test-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {realExamples} from '../scripts/stocks-editorial/real-examples-data.mjs';
import {IDENTIFICATION_REVISION,exampleSources} from '../scripts/stocks-editorial/real-examples.mjs';
import {emptySnapshot} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
const read=file=>readFileSync(new URL('../'+file,import.meta.url));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const old=JSON.parse(read('tests/fixtures/stocks-real-examples-baseline.json'));
const course=JSON.parse(read('src/content/stocks-curriculum-v2.json'));
const lookup=id=>beforeDepth(course.lessons.find(l=>l.id===id));

test('real examples preserve the first 51 points, every other practice, all exams and the reward catalogue',()=>{
 for(const item of old.lessons){
  const lesson=beforeOpening(lookup(item.id));
  if(item.id<=500)assert.equal(hash(lesson),item.sha256,`Protected point ${item.id}`);
  if(item.id!==501)assert.equal(hash(lesson.steps.filter(s=>s.type!=='learn')),item.exercises,`Practice changed ${item.id}`);
  assert.equal(hash([lesson.id,lesson.title,lesson.short,lesson.prerequisites]),item.identity);
 }
 for(const item of old.exams)assert.equal(hash(course.exams.find(e=>e.id===item.id)),item.sha256,`Exam ${item.id}`);
 assert.equal(hash(course.groups),old.groups);
 for(const [file,expected] of Object.entries(old.otherPaths))assert.equal(createHash('sha256').update(beforeOpeningFile('src/content/'+file+'.json')).digest('hex'),expected,file);
});

test('the identification practice uses correct real ISINs and separates class, voting rights, market and currency',()=>{
 const lesson=lookup(501),fig=lesson.steps[0].figure;
 assert.equal(lesson.editorialRevision,IDENTIFICATION_REVISION);
 assert.deepEqual(lesson.steps.map(s=>s.type),['learn','match','learn','choice','learn','order','learn','choice']);
 assert.deepEqual(fig.rows,[['Alphabet A','GOOGL','US02079K3059','1 voto'],['Alphabet C','GOOG','US02079K1079','Sin voto ordinario']]);
 const validISIN=code=>{
  const expanded=[...code].map(c=>/\d/.test(c)?c:String(c.charCodeAt(0)-55)).join('');
  return [...expanded].reverse().reduce((sum,c,i)=>{let n=Number(c)*(i%2?2:1);return sum+(n>9?n-9:n);},0)%10===0;
 };
 assert.ok(fig.rows.every(row=>validISIN(row[2])));
 assert.match(lesson.steps[2].body,/diez votos/);
 assert.ok(lesson.steps[4].figure.rows.every(row=>row[1]==='US02079K3059'));
 assert.deepEqual(lesson.steps[5].answer,[2,0,1]);
 assert.deepEqual(lesson.steps[7].activity.answers,[0,2]);
 assert.equal(lesson.summary,lesson.steps[0].body,'No repeated introduction screen');
});

test('contextual examples cover all 45 remaining worlds with dated primary sources and labelled historical figures',()=>{
 assert.equal(realExamples.length,69);
 assert.equal(new Set([6,...realExamples.map(([p])=>Math.ceil(p/10))]).size,45);
 const places=new Set();
 for(const [point,slot,key,title,body,figure] of realExamples){
  assert.ok(point>=53&&point<=500);assert.ok(!places.has(`${point}/${slot}`));places.add(`${point}/${slot}`);
  const lesson=lookup(point+449),step=lesson.steps[slot];
  assert.equal(step.type,'learn');assert.ok(step.body.includes(body));assert.equal(step.realExample.title,title);
  assert.ok(step.sources.some(s=>s.url===exampleSources[key].url));assert.ok(step.sources.every(s=>s.period&&s.checkedAt==='2026-10-12'&&new URL(s.url).protocol==='https:'));
  assert.equal(lesson.practiceContext,'simulation');
  assert.equal(lesson.summary,lesson.steps[0].body);
  if(figure){assert.deepEqual(step.figure,figure);assert.doesNotMatch(figure.caption,/inventad|simulad/i);}
 }
 const ti=lookup(598).steps[4].figure;assert.deepEqual(ti.rows.map(r=>r[1]),['6.318','−4.820','1.498']);
 const airbnb=lookup(851).steps[4].figure;assert.deepEqual(airbnb.rows.map(r=>r[1]),['81.784','11.102']);
});

test('sources remain optional to open and simulated practice is clearly separate from the real example',()=>{
 const completed=Object.fromEntries(course.lessons.map(l=>[l.id,{firstTry:4}]));
 const passedExams=Object.fromEntries(course.exams.map(e=>[e.id,{best:10,attempts:1,passed:true}]));
 const app=mount({...emptySnapshot(),completed,passedExams});openLesson(app,501);
 assert.match(app.main.querySelector('#br-activity').innerHTML,/<details class="br-terms"><summary[^>]*>Ver fuentes del ejemplo real/);
 assert.match(app.main.querySelector('#br-activity').innerHTML,/US02079K3059/);
 app.click({next:''});assert.match(app.main.innerHTML,/Identificadores y clases reales/);
 openLesson(app,540);app.click({next:''});
 assert.match(app.main.innerHTML,/Práctica con un caso ficticio/);
});

test('only incompatible point-52 attempts restart while completed points, passed exams and compatible attempts survive',()=>{
 const completed={501:{firstTry:4}},passedExams={50:{best:9,passed:true,attempts:1}};
 for(const id of [501,540]){
  const drafts=Array.from({length:8},(_,i)=>i===0?{v:{contentRevision:'stocks-clarity-variety-2026-10-11'}}:i===3?{c:1}:{});
  const app=mount({...emptySnapshot(),completed,passedExams,activeId:id,activeByTrack:{stocks:id},sessions:[[id,3,drafts]],introSkipped:true},Array.from({length:50},(_,i)=>i+45));
  openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,id===501?0:3);
  assert.deepEqual(app.saved.completed,completed);assert.deepEqual(app.saved.passedExams,passedExams);
  assert.equal(app.saved.sessions.find(s=>s[0]===id)[2][0].v.contentRevision,lookup(id).editorialRevision);
 }
});
