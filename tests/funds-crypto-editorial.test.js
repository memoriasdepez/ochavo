import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileRevision,parseAuthoring,calculate} from '../scripts/course-authoring.mjs';
import {refineEtfs,refineFundsCrypto,REVISIONS,ETF_NUMERIC,CRYPTO_NUMERIC} from '../scripts/funds-crypto-editorial/refine.mjs';
import {ETF_CASES} from '../scripts/funds-crypto-editorial/etfs-cases.mjs';
import {ETF_TRANSFERS} from '../scripts/funds-crypto-editorial/etfs-transfers.mjs';
import {CRYPTO_CASES} from '../scripts/funds-crypto-editorial/crypto-cases.mjs';
import {CRYPTO_TRANSFER_LATE} from '../scripts/funds-crypto-editorial/crypto-transfer-late.mjs';
import {validateActivity,activityCorrect,activityAnswered} from '../src/exercise-formats.js';

const load=(track,parts,start)=>{
 const outline=JSON.parse(readFileSync(new URL(`../src/content/${track}-outline-v2.json`,import.meta.url),'utf8'));
 const records=parseAuthoring(Array.from({length:parts},(_,i)=>readFileSync(new URL(`../src/content/${track}-v2-authoring/part-${i+1}.txt`,import.meta.url),'utf8')),outline.worlds.length*10);
 return {outline,records,base:compileRevision({outline,records,start,sources:[]})};
};
const etf=load('etfs',2,950);
const result=refineEtfs(etf.base,etf.records);
const crypto=load('crypto',3,1150);
const cryptoResult=refineFundsCrypto(crypto.base,crypto.records,{track:'crypto',cases:CRYPTO_CASES,transfers:CRYPTO_TRANSFER_LATE});
const practice=lesson=>lesson.steps.filter(s=>s.type!=='learn');
const signature=lesson=>practice(lesson).map(s=>s.activity?.kind||s.type).join('/');
const draft=a=>({choice:a.answer??null,selected:a.answers||[],matches:Object.fromEntries((a.rows||[]).map((r,i)=>[i,String(r.answer)])),order:a.answer instanceof Array?a.answer:[],number:typeof a.answer==='number'?String(a.answer):'',vars:{exerciseKind:a.kind}});

test('all approved ETF identities and teaching/practice boundaries survive the editorial rewrite',()=>{
 assert.deepEqual(result.lessons.map(l=>l.title),etf.outline.worlds.flatMap(w=>w.lessons.map(l=>l.title)));
 assert.deepEqual(result.lessons.map(l=>l.id),Array.from({length:200},(_,i)=>950+i));
 for(const lesson of result.lessons){
  assert.equal(lesson.editorialRevision,REVISIONS.etfs);assert.equal(lesson.steps.length,8);
  assert.ok(new Set(practice(lesson).map(s=>s.activity?.kind||s.type)).size>=3,`ETF ${lesson.id} has three genuine interaction types`);
  for(let i=0;i<8;i+=2){assert.equal(lesson.steps[i].type,'learn');assert.ok(lesson.steps[i].body.length>100,lesson.id+': useful explanation '+i);assert.notEqual(lesson.steps[i+1].type,'learn');}
  assert.doesNotMatch(JSON.stringify(lesson),/undefined|\{[a-d]\}|cuaderno de Marina|Reconstruye la conclusión/);
 }
});
test('quantitative tasks are deliberately selected and not forced onto identity, documents or security',()=>{
 assert.equal(practice(result.lessons[3]).filter(s=>s.type==='numeric').length,0,'ETF definition is not multiplication practice');
 assert.equal(practice(result.lessons[8]).filter(s=>s.type==='numeric').length,0,'Product name is not a percentage drill');
 for(const l of result.lessons){assert.ok(practice(l).filter(s=>s.type==='numeric').length<=1);for(const s of practice(l).filter(s=>s.type==='numeric')){assert.ok(ETF_NUMERIC.has(l.id));assert.equal(s.calculator,true);if(s.calculation)assert.equal(s.answer,calculate(s.calculation.operation,s.calculation.operands));}}
 assert.equal(CRYPTO_NUMERIC.has(1181),false,'Public and private keys must not count compromised accounts');
 assert.equal(CRYPTO_NUMERIC.has(1152),false,'Network and project identities must not add unlike token units');
 const numericCount=result.lessons.flatMap(practice).filter(s=>s.type==='numeric').length;
 assert.ok(numericCount>=35&&numericCount<100,'Preserve useful calculations without imposing one on every lesson');
});
test('each ETF topic has an individually authored situation and check, and adjacent points change task sequences',()=>{
 assert.equal(ETF_CASES.length,200);assert.equal(new Set(ETF_CASES.map(c=>c.scene)).size,200);
 assert.equal(new Set(ETF_CASES.map(c=>c.check)).size,200);
 for(let i=1;i<result.lessons.length;i++)assert.notEqual(signature(result.lessons[i]),signature(result.lessons[i-1]),'Adjacent tasks '+result.lessons[i].id);
 for(const l of result.lessons.filter(l=>l.id>=960&&!ETF_NUMERIC.has(l.id))){const t=ETF_TRANSFERS[l.id];assert.ok(t);assert.notEqual(t.scene,ETF_CASES[l.id-950].scene);assert.ok(practice(l).some(s=>s.body.includes(t.scene)),'Independent counterexample in '+l.id);}
});
test('no main case answer is disclosed by an earlier reordered explanation',()=>{
 for(const l of result.lessons.filter(l=>l.id>=960)){
  const c=ETF_CASES[l.id-950],firstPractice=l.steps.findIndex(s=>s.type!=='learn'&&s.body.includes(c.scene));
  assert.ok(firstPractice>0);
  for(const s of l.steps.slice(0,firstPractice).filter(s=>s.type==='learn'))assert.ok(!s.body.includes(c.correct),`Answer leaked before ETF ${l.id} case`);
 }
});
test('every authored activity accepts the intended complete answer and rejects an altered answer',()=>{
 for(const l of result.lessons)for(const s of l.steps)if(s.activity){const a=s.activity;validateActivity(a,`ETF ${l.id}`);const d=draft(a);assert.ok(activityAnswered(a,d));assert.ok(activityCorrect(a,d));if(a.rows)d.matches[0]=String((a.rows[0].answer+1)%a.rows[0].options.length);else d.choice=(a.answer+1)%a.options.length;assert.equal(activityCorrect(a,d),false);}
});
test('ETF exams retain ten review targets, bounded calculation and varied correct positions',()=>{
 for(const exam of result.exams){assert.equal(exam.editorialRevision,REVISIONS.etfs);assert.equal(exam.steps.length,10);assert.deepEqual(exam.steps.map(s=>s.reviewLesson),Array.from({length:10},(_,i)=>exam.id*10+i));assert.ok(exam.steps.filter(s=>s.type==='numeric').length<=2);assert.ok(new Set(exam.steps.filter(s=>s.type==='choice').map(s=>s.answer)).size>1);}
});

test('Cripto preserves every identity, teaches before practice, and has at least three real formats per lesson',()=>{
 assert.deepEqual(cryptoResult.lessons.map(l=>l.title),crypto.outline.worlds.flatMap(w=>w.lessons.map(l=>l.title)));
 for(const [i,l] of cryptoResult.lessons.entries()){
  assert.equal(l.id,1150+i);assert.equal(l.editorialRevision,REVISIONS.crypto);assert.equal(l.steps.length,8);
  assert.ok(new Set(practice(l).map(s=>s.activity?.kind||s.type)).size>=3,'Cripto variety '+l.id);
  for(let j=0;j<8;j+=2){assert.equal(l.steps[j].type,'learn');assert.ok(l.steps[j].body.length>100,l.id+': explanation '+j);assert.notEqual(l.steps[j+1].type,'learn');}
  assert.ok(practice(l).filter(s=>s.type==='numeric').length<=1);
  for(const s of l.steps)if(s.activity){const a=s.activity;validateActivity(a,`Cripto ${l.id}`);const d=draft(a);assert.ok(activityAnswered(a,d));assert.ok(activityCorrect(a,d));if(a.rows)d.matches[0]=String((a.rows[0].answer+1)%a.rows[0].options.length);else d.choice=(a.answer+1)%a.options.length;assert.equal(activityCorrect(a,d),false);}
  if(i>0)assert.notEqual(signature(l),signature(cryptoResult.lessons[i-1]),'Adjacent Cripto tasks '+l.id);
  if(i>=10&&!CRYPTO_NUMERIC.has(l.id)){const t=CRYPTO_CASES[i].transfer||CRYPTO_TRANSFER_LATE[l.id];assert.ok(t);assert.notEqual(t.scene,CRYPTO_CASES[i].scene);assert.ok(practice(l).some(s=>s.body.includes(t.scene)));}
 }
});
test('Cripto removes decorative counting, retains genuine mathematical topics and balances exams',()=>{
 assert.equal(cryptoResult.lessons[31].steps.some(s=>s.type==='numeric'),false,'No exposed-key percentage in public/private key lesson');
 assert.equal(cryptoResult.lessons[2].steps.some(s=>s.type==='numeric'),false,'No sum of unrelated token units');
 for(const id of CRYPTO_NUMERIC){const l=cryptoResult.lessons[id-1150];assert.ok(l.steps.some(s=>s.type==='numeric'&&s.calculator),id+': meaningful calculation remains');}
 for(const exam of cryptoResult.exams){assert.equal(exam.steps.length,10);assert.equal(exam.editorialRevision,REVISIONS.crypto);assert.ok(exam.steps.filter(s=>s.type==='numeric').length<=2);assert.ok(new Set(exam.steps.filter(s=>s.type==='choice').map(s=>s.answer)).size>1);assert.deepEqual(exam.steps.map(s=>s.reviewLesson),Array.from({length:10},(_,i)=>exam.id*10+i));}
 for(const l of cryptoResult.lessons.filter(l=>l.id>=1160)){const c=CRYPTO_CASES[l.id-1150],firstPractice=l.steps.findIndex(s=>s.type!=='learn'&&s.body.includes(c.scene));for(const s of l.steps.slice(0,firstPractice).filter(s=>s.type==='learn'))assert.ok(!s.body.includes(c.correct),`Answer leaked before ${l.id}`);}
});
test('editorial exams assess a new task instead of copying a practice instruction',()=>{
 for(const curriculum of [result,cryptoResult])for(const exam of curriculum.exams)for(const step of exam.steps){
  const lesson=curriculum.lessons.find(l=>l.id===step.reviewLesson);
  assert.ok(!practice(lesson).some(p=>p.body===step.body),`Exam ${exam.id}, lesson ${lesson.id} repeats the exact practice task`);
  if(step.title==='Encuentra la idea que conecta los casos'){assert.match(step.body,/Situación A:/);assert.match(step.body,/Situación B:/);assert.equal(step.type,'choice');}
 }
});

