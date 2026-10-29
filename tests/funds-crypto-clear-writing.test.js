import {beforeOrderNotesFile} from './order-notes-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {clearOpenings} from '../scripts/funds-crypto-editorial/clear-writing.mjs';
import {readableParagraphs} from '../scripts/stocks-editorial/clear-writing.mjs';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
import {editorialDrafts} from './editorial-drafts.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url));
const old=JSON.parse(read('tests/fixtures/funds-crypto-clear-writing-0353-baseline.json'));
const current=Object.fromEntries(['etfs','crypto'].map(t=>[t,JSON.parse(read('src/content/'+t+'-curriculum-v2.json'))]));
const hash=v=>createHash('sha256').update(v).digest('hex');
const compact=s=>s.replace(/\s+/g,' ').trim();
const withoutProse=l=>{const copy=structuredClone(l);delete copy.summary;for(const s of copy.steps)if(s.type==='learn')delete s.body;return copy;};

test('all 500 points retain curriculum, questions, answers, tools, figures, revision, metadata and every exam exactly',()=>{
 for(const track of ['etfs','crypto']){
  const previous=old.before[track],now=current[track];
  assert.deepEqual({...now,lessons:[]},{...previous,lessons:[]},track+' course structure and exams');
  for(const [i,l] of now.lessons.entries()){
   assert.deepEqual(withoutProse(l),withoutProse(previous.lessons[i]),track+' '+(i+1)+' nonprose fields');
   if(l.summary!==previous.lessons[i].summary)assert.equal(l.summary,l.steps[0].body);
  }
 }
 for(const [file,expected] of Object.entries(old.otherFiles))assert.equal(hash(beforeOrderNotesFile('src/content/'+file)),expected,'Unrelated '+file);
});

test('every topic has an individual plain-language orientation; generic wording changes without disclosing case answers',()=>{
 for(const [track,total] of [['etfs',200],['crypto',300]]){
  assert.equal(Object.keys(clearOpenings[track]).length,total);
  assert.equal(new Set(Object.values(clearOpenings[track])).size,total);
  for(const [i,l] of current[track].lessons.entries()){
   assert.ok(l.steps.some(s=>s.type==='learn'&&s.body.includes(clearOpenings[track][i+1])),`Missing individual orientation ${track}/${i+1}`);
   assert.ok(l.steps.some((s,j)=>s.type==='learn'&&compact(s.body)!==compact(old.before[track].lessons[i].steps[j].body)),`Formatting-only ${track}/${i+1}`);
   for(const s of l.steps.filter(s=>s.type==='learn'))assert.doesNotMatch(s.body,/Relaciona sus hechos con el mecanismo|Para contrastar una interpretación necesitas|conservar un nombre, una cantidad o un resultado aislado|cuaderno de Marina|undefined|NaN/);
  }
 }
});

test('technical prerequisites remain before the first question; examples are not removed or moved behind practice',()=>{
 assert.match(current.etfs.lessons[57].steps[0].body,/el rango es la distancia entre la mayor y la menor diferencia/);
 const seg=new Intl.Segmenter('es',{granularity:'sentence'});
 for(const point of [23,25,32,34,111,121,133,144,154,155,156,181,183,184,185,193,194,196,203,205,211,213,215,223,224,225,226,227,233,234,235,236,242,246,252,255,263,267,268,273,274,275,281,282,284,286,291,292,294,296]){
  const previous=old.before.crypto.lessons[point-1],now=current.crypto.lessons[point-1];
  const first=[...seg.segment(previous.steps[0].body)][0].segment.trim();
  assert.ok(compact(now.steps[0].body).includes(compact(first)),`Definition moved or removed at crypto ${point}`);
 }
 for(const track of ['etfs','crypto'])for(const [i,l] of current[track].lessons.entries())for(const [j,s] of l.steps.entries()){
  if(s.type!=='learn')continue;
  const prior=old.before[track].lessons[i].steps[j];
  for(const example of prior.body.split('\n\n').filter(p=>p.startsWith('Ejemplo explicado:')))assert.ok(compact(s.body).includes(compact(example)),`Worked example changed ${track}/${i+1}/${j+1}`);
 }
});

test('long paragraphs gain sentence breaks while numbers, emphasis and rendering remain well formed',()=>{
 let reformatted=0;
 for(const track of ['etfs','crypto'])for(const [i,l] of current[track].lessons.entries())for(const [j,s] of l.steps.entries())if(s.type==='learn'){
  assert.equal(readableParagraphs(s.body),s.body);
  if(s.body.split('\n\n').length>old.before[track].lessons[i].steps[j].body.split('\n\n').length)reformatted++;
  for(const p of s.body.split('\n\n')){assert.equal((p.match(/\*\*/g)||[]).length%2,0);assert.ok(p.length<900,`Unreadable paragraph ${track}/${i+1}/${j+1}`);}
 }
 assert.ok(reformatted>=10);
});

test('compatible ETF and Cripto attempts keep step, partial answers, history and pending reward identifiers across cloud sync',()=>{
 for(const [track,points] of [['etfs',[2,58,115,172,200]],['crypto',[2,75,137,185,235,294,300]]]){
  const start=track==='etfs'?950:1150,firstGroup=start/10;
  for(const point of points){
   const id=start+point-1,previous=old.before[track].lessons[point-1];
   const drafts=editorialDrafts(previous);drafts[3].q='10000000-0000-4000-8000-000000000001';
   const snapshot={...emptySnapshot(),track,group:Math.floor(id/10),activeId:id,activeByTrack:{[track]:id},completed:Object.fromEntries(Array.from({length:point-1},(_,i)=>[start+i,{firstTry:3}])),passedExams:Object.fromEntries(Array.from({length:Math.floor((point-1)/10)},(_,i)=>[firstGroup+i,{best:8,attempts:1,passed:true}])),sessions:[[id,2,drafts]]};
   const cloud=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot,null,100))));
   const app=mount(cloud.snapshot);openLesson(app,id);
   assert.equal(app.course.reportContext().stepIndex,2,`${track}/${point} restarted`);
   assert.deepEqual(app.saved.sessions,snapshot.sessions);assert.deepEqual(app.saved.completed,snapshot.completed);assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
  }
 }
});
