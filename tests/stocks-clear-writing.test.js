import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {clearIntroductions,readableParagraphs} from '../scripts/stocks-editorial/clear-writing.mjs';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const course=read('src/content/stocks-curriculum-v2.json'),old=read('tests/fixtures/stocks-clear-writing-baseline.json');
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const compact=t=>t.replace(/\s+/g,' ').trim();
const omitTeaching=l=>{const copy=structuredClone(l);delete copy.summary;for(const s of copy.steps)if(s.type==='learn')delete s.body;return copy;};

test('style pass preserves all 490 identities, questions, answers, exercises, sources and visual tools and every exam/reward',()=>{
 for(const previous of old.before){const now=course.lessons.find(l=>l.id===previous.id);
  assert.deepEqual(omitTeaching(now),omitTeaching(previous),`Only teaching prose may change in point ${now.id-449}`);
  if(now.summary!==previous.summary)assert.equal(now.summary,now.steps[0].body,'Summary mirrors explanation, never new curriculum metadata');
 }
 assert.equal(hash(course.exams),old.exams);assert.equal(hash(course.groups),old.groups);assert.equal(hash(read('src/content/game-catalog.json')),old.catalog);
});
test('points 11–49 retain every word and punctuation; long requested text in 24/1 gains paragraph breaks',()=>{
 let changed=0;
 for(const previous of old.before.filter(l=>l.id<499)){const now=course.lessons.find(l=>l.id===previous.id);
  for(let i=0;i<now.steps.length;i++)if(now.steps[i].type==='learn'){
   assert.equal(compact(now.steps[i].body),compact(previous.steps[i].body),`${now.id-449}/${i+1} wording`);
   if(now.steps[i].body!==previous.steps[i].body)changed++;
  }
 }
 assert.ok(changed>20);const spread=course.lessons.find(l=>l.id===473).steps[0].body;
 assert.match(spread,/\n\n/);assert.match(spread,/diferencial o spread/);
});
test('every point 50–500 has an individually authored entry and retained practice context, including advanced analysis',()=>{
 assert.equal(Object.keys(clearIntroductions).length,451);assert.equal(new Set(Object.values(clearIntroductions)).size,451);
 for(const previous of old.before.filter(l=>l.id>=499)){const now=course.lessons.find(l=>l.id===previous.id);
  assert.notEqual(compact(now.steps[0].body),compact(previous.steps[0].body),`Missing revised introduction ${now.id-449}`);
  assert.ok(now.steps[0].body.length>=previous.steps[0].body.length-50);
  for(const s of now.steps.filter(s=>s.type==='learn'))assert.doesNotMatch(s.body,/undefined|\[object Object\]|NaN/);
 }
 const receivables=course.lessons.find(l=>l.id===594).steps[2].body;
 assert.match(receivables,/saldo de clientes pendientes de cobro/);assert.doesNotMatch(receivables,/Un aumento de clientes significa/);
 assert.match(course.lessons.find(l=>l.id===849).steps[0].body,/permanencia de clientes.*compras adicionales.*coste/s);
});
test('paragraph formatting preserves decimal examples, bold spans and wording, and is stable on rebuild',()=>{
 const input='**Una explicación larga. '+('Esta frase desarrolla la misma idea sin cerrar el énfasis. '.repeat(7))+'** Después hay un ejemplo de 50,10 € y 4,76 %. '+('Una segunda parte explica sus consecuencias. '.repeat(9));
 const output=readableParagraphs(input);assert.equal(compact(output),compact(input));assert.equal(readableParagraphs(output),output);
 for(const p of output.split('\n\n'))assert.equal((p.match(/\*\*/g)||[]).length%2,0);
 assert.match(output,/50,10 € y 4,76 %/);
 for(const l of course.lessons.filter(l=>l.id>=460))for(const s of l.steps.filter(s=>s.type==='learn')){
  assert.equal(readableParagraphs(s.body),s.body,`Unstable ${l.id}`);
  for(const p of s.body.split('\n\n'))assert.equal((p.match(/\*\*/g)||[]).length%2,0,`Broken emphasis ${l.id}`);
 }
});
test('compatible drafts, progress, rewards and pending attempts survive the style pass and cloud roundtrip',()=>{
 for(const point of [24,50,53,100,200,300,400,500]){
  const id=point+449,previous=old.before.find(l=>l.id===id);
  const snapshot={...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed:Object.fromEntries(Array.from({length:point-1},(_,i)=>[450+i,{firstTry:4}])),passedExams:Object.fromEntries(Array.from({length:Math.floor((point-1)/10)},(_,i)=>[45+i,{best:9,passed:true,attempts:1}])),sessions:[[id,2,Array.from({length:previous.steps.length},(_,i)=>i===0?{v:{contentRevision:previous.editorialRevision}}:i===3?{q:'10000000-0000-4000-8000-000000000001'}:{})]]};
  const cloud=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot,null,100))));
  const app=mount(cloud.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,2);assert.deepEqual(app.saved.sessions,snapshot.sessions);
  assert.deepEqual(app.saved.completed,snapshot.completed);assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
 }
});
