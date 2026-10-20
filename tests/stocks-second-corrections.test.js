import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SECOND_CORRECTIONS_IDS,SECOND_CORRECTIONS_REVISION} from '../scripts/stocks-editorial/second-corrections.mjs';
import {emptySnapshot,sanitizeSnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
import {editorialDrafts} from './editorial-drafts.js';
import {activityCorrect,activityAnswered,validateActivity,activityMarkup} from '../src/exercise-formats.js';
import {beforeLessonNotes} from './lesson-notes-utils.js';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const course=read('src/content/stocks-curriculum-v2.json'),baseline=read('tests/fixtures/stocks-second-0330-baseline.json');
course.lessons=course.lessons.map(beforeLessonNotes);
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const lesson=id=>course.lessons.find(l=>l.id===id);
const snapshot=(id,index=0,revision=lesson(id).editorialRevision,length=lesson(id).steps.length)=>({...emptySnapshot(),group:46,
 completed:{...Object.fromEntries(Array.from({length:20},(_,i)=>[450+i,{firstTry:4}])),950:{firstTry:3}},passedExams:{45:{best:8,passed:true,attempts:2}},activeId:id,activeByTrack:{stocks:id},
 sessions:[[id,index,Array.from({length},(_,i)=>i===0?{v:{contentRevision:revision}}:{})]]});

test('only Acciones 11–15 change, with unchanged identities, exams and old rewards',()=>{
 for(const old of baseline.lessons){const l=lesson(old.id);if(!SECOND_CORRECTIONS_IDS.includes(old.id))assert.equal(hash(l),old.hash,`Unrelated point ${old.id-449}`);}
 for(const e of baseline.exams)assert.equal(hash(course.exams.find(x=>x.id===e.id)),e.hash);
 assert.equal(hash(course.groups),baseline.groups);
 const catalog=read('src/content/game-catalog.json');assert.deepEqual(catalog['answer-462-9'],{kind:'answer',amount:1});
 delete catalog['answer-462-9'];delete catalog['answer-471-9'];assert.deepEqual(catalog,baseline.catalog);
 for(const id of [463,464])for(let i=0;i<8;i++)if(!(id===463&&[4,5].includes(i))&&!(id===464&&[4,5,6].includes(i)))assert.equal(hash(lesson(id).steps[i]),baseline.lessons.find(l=>l.id===id).steps[i],`Unrequested ${id}/${i}`);
});
test('points 11–13 teach useful new distinctions with three or more actual formats',()=>{
 const checks=[[460,/comisiones/,/ganancia pendiente/,/equilibrio/],[461,/bases distintas/,/cuánto beneficio dejaba/,/probabilidad/],[462,/porcentaje de reparto/,/extraordinario/,/25 años seguidos/,/50 años seguidos/]];
 for(const [id,...patterns] of checks){const l=lesson(id),text=l.steps.filter(s=>s.type==='learn').map(s=>s.body).join('\n');for(const pattern of patterns)assert.match(text,pattern);assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);}
 assert.match(lesson(462).steps[4].body,/Que una empresa no reparta dividendos no significa que sea una mala inversión/);
 assert.match(lesson(464).steps[6].body,/Esto se conoce como volatilidad/);
 assert.equal(lesson(464).steps[6].figure.rows.at(-1)[1],lesson(464).steps[6].figure.rows.at(-1)[2]);
});
test('the fifth dividend exercise actively reconciles value instead of inventing free wealth',()=>{
 const l=lesson(462);assert.equal(l.steps.length,10);assert.equal(l.steps[8].type,'learn');
 assert.match(l.steps[8].body,/fecha exdividendo/);assert.match(l.steps[8].body,/aumentos, no solo años pagando/);assert.match(l.steps[8].body,/otros.*|historial/);
 assert.equal(l.steps[8].sources.length,3);for(const source of l.steps[8].sources){assert.equal(source.checkedAt,'2026-10-13');assert.ok(source.period);}
 const a=l.steps[9].activity;validateActivity(a);assert.equal(a.kind,'allocate');assert.deepEqual(a.answer,[18,2]);
 assert.equal(a.tokenUnit,'1 €');assert.ok(lesson(462).steps[3].activity.response.includes('40 %'));
 const draft={vars:{exerciseAlloc:[20,0]},selected:[],matches:{},order:[],choice:null,number:''};
 assert.equal(activityAnswered(a,draft),true);assert.equal(activityCorrect(a,draft),false);
 draft.vars.exerciseAlloc=[18,1];assert.equal(activityAnswered(a,draft),false);
 draft.vars.exerciseAlloc=[18,2];assert.equal(activityCorrect(a,draft),true);
 assert.match(activityMarkup(a,draft),/Reparte|fichas|alloc/);
});
test('tax receipt requires gross, withholding, net and qualified final-tax interpretation',()=>{
 const l=lesson(463),a=l.steps[5].activity;assert.match(l.steps[4].body,/Cuando una empresa te paga dividendos/);assert.match(l.steps[4].body,/anticipo del impuesto/);assert.match(l.steps[4].body,/ficticia del 20 %/);
 validateActivity(a);assert.equal(a.kind,'diagram');assert.deepEqual(a.rows.map(r=>r.answer),[1,2,1]);
 assert.equal(a.rows[0].options[a.rows[0].answer],'30 €');assert.equal(a.rows[1].options[a.rows[1].answer],'120 €');
 assert.equal(l.steps[5].calculator,true);assert.equal(lesson(464).steps[5].activity.kind,'repair');
});
test('ten-screen dividend drafts and five first-try results survive sanitization, engine and device merge',()=>{
 const l=lesson(462),input=snapshot(462,9);input.completed[462].firstTry=5;input.sessions[0][2][9]={v:{exerciseKind:'allocate',exerciseAlloc:[18,2]},q:'10000000-0000-4000-8000-000000000001'};
 const first=makeEnvelope(input,null,100),merged=mergeProgress(null,JSON.parse(JSON.stringify(first)));
 assert.equal(merged.snapshot.sessions[0][2].length,10);assert.equal(merged.snapshot.sessions[0][1],9);assert.equal(merged.snapshot.completed[462].firstTry,5);
 const app=mount(merged.snapshot);openLesson(app,462);assert.equal(app.course.reportContext().stepIndex,9);assert.match(app.main.innerHTML,/10 \/ 10/);assert.match(app.main.querySelector('#br-activity').innerHTML,/Abrir calculadora/);
 const again=mergeProgress(first,makeEnvelope(merged.snapshot,first,200));assert.deepEqual(again.snapshot.sessions,input.sessions);
 assert.equal(sanitizeSnapshot(snapshot(461,9,SECOND_CORRECTIONS_REVISION,10)).sessions.length,0);
 const complete=mount({...snapshot(462),sessions:[[462,0,editorialDrafts(l)]]});openLesson(complete,462);
 for(const s of l.steps){if(s.type!=='learn')complete.click({check:''});complete.click({next:''});}
 assert.equal(complete.main.dataset.view,'success');assert.equal(complete.saved.completed[462].firstTry,5);assert.match(complete.main.innerHTML,/5 \/ 5/);
});
test('only incompatible 11–15 attempts restart and no completion, exam or other path is erased',()=>{
 for(const id of SECOND_CORRECTIONS_IDS){const old=snapshot(id,5,'stocks-clear-2026-10-10',8),app=mount(old);openLesson(app,id);assert.equal(app.course.reportContext().stepIndex,0);assert.deepEqual(app.saved.completed,old.completed);assert.deepEqual(app.saved.passedExams,old.passedExams);assert.equal(app.saved.sessions[0][2][0].v.contentRevision,SECOND_CORRECTIONS_REVISION);}
 const id=465,old=snapshot(id,3),app=mount(old);openLesson(app,id);assert.equal(app.course.reportContext().stepIndex,3);
});
