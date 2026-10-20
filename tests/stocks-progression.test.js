import {beforeMarketEdits,beforeMarketCatalog} from './market-edits-utils.js';
import {beforeOpening,beforeOpeningFile} from './opening-test-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptySnapshot} from '../src/progress.js';
import {mount,openLesson,lessons} from './current-course-harness.js';
import {lateNumericIds} from '../scripts/stocks-editorial/worlds-26-50.mjs';
import {investigations} from '../scripts/stocks-editorial/late-investigations.mjs';
import {lateEvidenceOptions,lateEvidenceReasons} from '../scripts/stocks-editorial/late-evidence-options.mjs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const course=JSON.parse(read('src/content/stocks-curriculum-v2.json'));course.lessons=course.lessons.map(beforeMarketEdits);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const normalize=text=>text.toLocaleLowerCase('es').normalize('NFKC').replace(/\s+/g,' ').trim();
const words=text=>normalize(text).match(/[\p{L}\p{N}]+/gu)||[];
const segmenter=new Intl.Segmenter('es',{granularity:'sentence'});
const sentences=text=>[...segmenter.segment(text)].map(item=>normalize(item.segment)).filter(text=>words(text).length>=8);

test('the twenty approved introductory points and their exams remain byte-for-byte identical',()=>{
 assert.equal(hash(course.lessons.slice(0,20).map(beforeOpening)),'251089624511820e72a490a56d8fa6d7a368c1872bfe4f50779e901a3a8dfad6');
 assert.equal(hash(course.exams.slice(0,2)),'b6105f567a4f57562ce0a389e0fef689b1bb676cb4cdb4c314ff75f3cb5ff187');
 assert.equal(hash(course.lessons.map(lesson=>[lesson.id,lesson.title,lesson.prerequisites])),'f2df262716f59f81f47d75532d48cdd05f5711c478e565edc78fdf963967486f');
 assert.equal(hash(course.groups),'1a6acf43c79b4164ee4298c8a586483a201318403c00086b1aca9017abd0036e');
});

test('rewriting teaching does not change any registered reward or shortcut',()=>{
 assert.equal(createHash('sha256').update(beforeOpeningFile('src/content/game-catalog.json')).digest('hex'),'3ce5b7b8c6d6e5d9753c3f796df1be40eac1a7dbc9c64582febdb30b963f1365');
});

test('later evidence options cover only their own objective, with a reason for each incomplete offer',()=>{
 const ids=course.lessons.filter(lesson=>lesson.id>=700&&!lateNumericIds.has(lesson.id)).map(lesson=>lesson.id);
 assert.equal(ids.length,166);
 assert.deepEqual(Object.keys(lateEvidenceOptions).map(Number),ids);
 assert.deepEqual(Object.keys(lateEvidenceReasons).map(Number),ids);
 for(const id of ids){
  const wrong=lateEvidenceOptions[id],reasons=lateEvidenceReasons[id];
  assert.equal(wrong.length,2,id);assert.equal(reasons.length,2,id);
  assert.equal(new Set([investigations[id].evidence,...wrong]).size,3,id);
  assert.ok(reasons.every(reason=>reason.length>30),id);
  // Retain validation of the original evidence source. The subsequent
  // challenge revision supplies new alternatives and formats; grading every
  // real interaction is covered by exercise-formats and stocks-revision.
 }
});

test('points 21–500 never teach the same long sentence on two different screens',()=>{
 for(const lesson of course.lessons.slice(20)){
  const seen=new Map();
  const teaching=lesson.steps.filter(step=>step.type==='learn');
  assert.equal(new Set(teaching.map(step=>normalize(step.takeaway))).size,4,`${lesson.id}: repeated key ideas`);
  for(const [index,step] of teaching.entries()){
   for(const sentence of sentences(step.body)){
    assert.ok(!seen.has(sentence)||seen.get(sentence)===index,`${lesson.id}: screens ${seen.get(sentence)} and ${index} repeat: ${sentence}`);
    seen.set(sentence,index);
   }
   assert.doesNotMatch(step.body,/La siguiente situación cambia el contexto\. Aplica esta distinción|Para pasar de una interpretación a una comprobación, busca los datos|Una conclusión y la evidencia que la respalda son cosas distintas/);
  }
 }
});

test('the opening market points advance through negotiation and financing instead of sharing a case',()=>{
 const negotiation=course.lessons[20],financing=course.lessons[21];
 const text=negotiation.steps.map(step=>step.body).join('\n');
 assert.doesNotMatch(text,/mercado primario|mercado secundario|financia.*fábrica|está emitiendo/i);
 assert.match(text,/contraparte/);
 assert.match(text,/oferta.*retira|retira.*oferta/s);
 assert.match(text,/motivos|necesidades/);
 assert.ok(negotiation.steps[3].figure?.rows?.length,'Offers must remain visible in the exercise that refers to them');
 const finance=financing.steps.map(step=>step.body).join('\n');
 for(const pattern of [/primario/,/secundario/,/salida a bolsa/,/beneficio/,/folleto/])assert.match(finance,pattern);
 assert.equal(course.exams[2].steps[0].reviewLesson,470);
 assert.equal(course.exams[2].steps[1].reviewLesson,471);
});

test('only changed drafts restart; approved world-two attempts and all earned progress survive',()=>{
 const session=(id,revision)=>[id,3,Array.from({length:8},(_,index)=>index===0?{v:{contentRevision:revision}}:index===3?{c:1}: {})];
 const completed=Object.fromEntries(Array.from({length:20},(_,index)=>[450+index,{firstTry:4}]));
 const passedExams={45:{best:10,attempts:1,passed:true},46:{best:9,attempts:2,passed:true}};
 const snapshot={...emptySnapshot(),track:'stocks',activeByTrack:{stocks:470},activeId:470,completed,passedExams,
  sessions:[session(465,'stocks-clear-2026-10-10'),session(470,'stocks-clear-2026-10-10')]};
 const app=mount(snapshot);openLesson(app,470);
 assert.equal(app.course.reportContext().stepIndex,0);
 const changed=app.saved.sessions.find(item=>item[0]===470),unchanged=app.saved.sessions.find(item=>item[0]===465);
 assert.equal(changed[2][0].v.contentRevision,lessons[470].editorialRevision);
 assert.equal(changed[2][3].c,undefined);
 assert.equal(unchanged[1],3);
 assert.equal(unchanged[2][3].c,1);
 assert.deepEqual(app.saved.completed,completed);
 assert.deepEqual(app.saved.passedExams,passedExams);
});

test('updated teaching does not repeat the first takeaway in a permanent story banner',()=>{
 const snapshot={...emptySnapshot(),completed:Object.fromEntries(Array.from({length:20},(_,index)=>[450+index,{firstTry:4}])),
  passedExams:{45:{best:10,attempts:1,passed:true},46:{best:10,attempts:1,passed:true}}};
 const app=mount(snapshot);openLesson(app,470);
 assert.doesNotMatch(app.main.innerHTML,/br-story-compact/);
 assert.match(app.main.innerHTML,/Una operación necesita un acuerdo/);
 app.click({next:'true'});
 assert.doesNotMatch(app.main.innerHTML,/br-story-compact/);
 const preserved=mount();openLesson(preserved,450);
 assert.match(preserved.main.innerHTML,/br-story-compact/);
});
