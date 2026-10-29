import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {orderNotes,ORDER_NOTES_REVISION} from '../scripts/stocks-editorial/order-notes.mjs';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
import {editorialDrafts} from './editorial-drafts.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url));
const course=JSON.parse(read('src/content/stocks-curriculum-v2.json')),baseline=JSON.parse(read('tests/fixtures/stocks-order-notes-0354-baseline.json'));
const lesson=id=>course.lessons.find(l=>l.id===id),compact=s=>s.replace(/\s+/g,' ').trim();
const hash=b=>createHash('sha256').update(b).digest('hex');

test('only the three requested points change; other 497 points, exams, identities and all other tracks/rewards are exact',()=>{
 assert.deepEqual({...course,lessons:[]},{...baseline.course,lessons:[]});
 for(const old of baseline.course.lessons){
  const current=lesson(old.id);
  if(!orderNotes[old.id]){assert.deepEqual(current,old,'Unrequested '+old.id);continue;}
  const indexes=Object.keys(orderNotes[old.id]).map(Number).concat(old.id===504?[5,7]:[]);
  for(let i=0;i<old.steps.length;i++)if(!indexes.includes(i))assert.deepEqual(current.steps[i],old.steps[i],`${old.id}/${i+1}`);
  const restored=structuredClone(current);restored.steps=old.steps;restored.summary=old.summary;restored.editorialRevision=old.editorialRevision;
  if(old.sources)restored.sources=old.sources;
  assert.deepEqual(restored,old,'Unrequested metadata '+old.id);
 }
 for(const [file,expected] of Object.entries(baseline.otherFiles))assert.equal(hash(read('src/content/'+file)),expected,file);
});

test('all nine requested texts retain exact words and emphasis with explicit paragraph breaks and coherent visual labels',()=>{
 for(const [id,edits] of Object.entries(orderNotes))for(const [index,text] of Object.entries(edits)){
  const current=lesson(Number(id)).steps[index];assert.equal(compact(current.body),compact(text));
  if(text.includes('\n\n'))assert.match(current.body,/\n\n/);
  for(const p of current.body.split('\n\n'))assert.equal((p.match(/\*\*/g)||[]).length%2,0);
 }
 assert.deepEqual(lesson(504).steps[2].figure.rows.map(r=>r[1]),['9 €','8,50 €']);
 assert.match(lesson(504).steps[4].title,/caída breve/);assert.match(lesson(504).steps[6].title,/subidas/);
 assert.equal(lesson(507).steps[4].realExample,undefined);assert.equal(lesson(507).steps[4].sources,undefined);
 assert.equal(lesson(504).summary,lesson(504).steps[0].body);assert.equal(lesson(507).summary,lesson(507).steps[0].body);
});

const completed=Object.fromEntries(baseline.course.lessons.slice(0,50).map(l=>[l.id,{firstTry:4}]));
const passedExams=Object.fromEntries(baseline.course.exams.slice(0,5).map(e=>[e.id,{best:9,attempts:1,passed:true}]));
function snapshot(id,index=0,revision=lesson(id).editorialRevision){return {...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed:Object.fromEntries(baseline.course.lessons.filter(l=>l.id<id).map(l=>[l.id,{firstTry:4}])),passedExams,sessions:[[id,index,lesson(id).steps.map((_,i)=>i===0?{v:{contentRevision:revision}}:{})]]};}

test('new stop exercises grade reasoning and actual trailing levels; wrong orders or guaranteed-price answers fail',()=>{
 const l=lesson(504);assert.equal(l.steps[5].type,'order');assert.deepEqual(l.steps[5].answer,[1,2,0]);
 assert.match(l.steps[5].body,/10,90 €.*13 €/);assert.equal(l.steps[7].type,'choice');assert.equal(l.steps[7].answer,1);
 assert.equal(20*(1-.1),18);assert.match(l.steps[7].options[1].text,/mantiene en 18 €.*sin asegurar/);
 assert.equal(l.steps[7].calculator,true);
 for(const [index,wrong] of [[5,{o:[1,0,2]}],[7,{c:2}],[7,{c:0}]]){
  const input=snapshot(504,index),drafts=editorialDrafts(l);Object.assign(drafts[index],wrong);input.sessions=[[504,index,drafts]];
  const app=mount(input);openLesson(app,504);app.click({check:''});
  assert.equal(app.saved.sessions[0][2][index].a,1);assert.equal(app.saved.sessions[0][2][index].p,undefined);
  assert.match(app.main.querySelector('#br-feedback').innerHTML,/is-error/);
 }
});

test('the three lessons finish with all four correct answers through the actual engine and preserve existing results',()=>{
 for(const id of [504,505,507]){
  const l=lesson(id),input=snapshot(id);input.sessions=[[id,0,editorialDrafts(l)]];
  const app=mount(input);openLesson(app,id);
  for(const step of l.steps){if(step.type!=='learn')app.click({check:''});app.click({next:''});}
  assert.equal(app.main.dataset.view,'success',String(id));assert.equal(app.saved.completed[id].firstTry,4);
  assert.deepEqual(app.saved.passedExams,input.passedExams);
  for(const [key,value] of Object.entries(completed))assert.deepEqual(app.saved.completed[key],value);
 }
});

test('only the changed stop draft restarts; text-only drafts and completed progress survive cloud roundtrip',()=>{
 for(const id of [504,505,507]){
  const old=baseline.course.lessons.find(l=>l.id===id),input=snapshot(id,6,old.editorialRevision);
  input.sessions[0][2][7]={q:'10000000-0000-4000-8000-000000000001'};
  const remote=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(input,null,100))));
  const app=mount(remote.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,id===504?0:6);
  assert.deepEqual(app.saved.completed,input.completed);assert.deepEqual(app.saved.passedExams,input.passedExams);
  if(id===504){assert.equal(app.saved.sessions[0][2][0].v.contentRevision,ORDER_NOTES_REVISION);assert.ok(app.saved.sessions[0][2].every(d=>!d.q));}
  else assert.deepEqual(app.saved.sessions,input.sessions);
 }
 const app=mount(snapshot(504,6));openLesson(app,504);assert.match(app.main.innerHTML,/<em>stop dinámico<\/em>/);
});
