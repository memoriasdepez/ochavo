import test from 'node:test';
import {beforeClearWriting} from './clear-writing-utils.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {evaluateGrowthLab,renderGrowthLab} from '../src/growth-lab.js';
import {mount,openLesson} from './current-course-harness.js';
import {RISK_NOTES_REVISION} from '../scripts/stocks-editorial/risk-notes.mjs';
const read=f=>JSON.parse(readFileSync(new URL('../'+f,import.meta.url)));
const course=read('src/content/stocks-curriculum-v2.json'),old=read('tests/fixtures/stocks-risk-notes-0352-baseline.json');
course.lessons=course.lessons.map(beforeClearWriting);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const l=id=>course.lessons.find(l=>l.id===id);
const changes={490:[0,4,6],491:[0],492:[2,6],493:[6],494:[0,4,5,6,7],495:[2,6],497:[0,2,6],498:[0,4,6]};
test('risk explanation changes preserve other points, every exam, identity and reward; only two mismatched practices change',()=>{
 for(const before of old.lessons){const now=l(before.id);
  assert.equal(hash([now.id,now.title,now.short,now.prerequisites]),before.identity);
  if(!changes[now.id])assert.equal(hash(now),before.hash,`Unrequested ${now.id}`);
  else for(let i=0;i<8;i++)if(!changes[now.id].includes(i))assert.equal(hash(now.steps[i]),before.steps[i],`${now.id}/${i}`);
 }
 for(const before of old.exams)assert.equal(hash(course.exams.find(e=>e.id===before.id)),before.hash);
 assert.equal(hash(course.groups),old.groups);assert.equal(hash(read('src/content/game-catalog.json')),old.catalog);
 assert.equal(hash(l(496)),old.lessons.find(x=>x.id===496).hash);
 assert.equal(l(494).steps[5].type,'order');assert.deepEqual(l(494).steps[5].answer,[1,2,0]);
 assert.equal(l(494).steps[7].type,'choice');assert.equal(l(494).steps[7].answer,2);
 assert.match(l(494).steps[5].body,/cobrará.*clientes.*dos meses.*semana próxima/);
 assert.match(l(494).steps[7].options[2].text,/efectivo.*fechas.*intereses/);
});
test('recovery widget handles real percentage bases and complete loss without NaN, Infinity or year presets',()=>{
 const config=l(493).steps[6].growthLab;
 assert.equal(config.kind,'recovery');assert.match(l(493).steps[6].body,/Laboratorio.*Después de una caída/);
 for(const [loss,gain] of [[0,0],[20,25],[25,100/3],[50,100],[80,400]]){
  const model=evaluateGrowthLab(config,{lossPercent:loss});assert.equal(model.result.ok,true);
  assert.ok(Math.abs(model.result.requiredGain-gain)<1e-9);assert.equal(model.result.remainingPercent,100-loss);assert.deepEqual(model.comparisons,[]);
  const html=renderGrowthLab({...config,values:{lossPercent:loss}});assert.doesNotMatch(html,/data-growth-years|Infinity|NaN|undefined/);assert.match(html,/data-growth-tool="recovery"/);
 }
 const zero=evaluateGrowthLab(config,{lossPercent:100});assert.equal(zero.result.recoverable,false);assert.equal(zero.result.requiredGain,null);
 assert.match(renderGrowthLab({...config,values:{lossPercent:100}}),/Ninguna subida porcentual sobre cero/);
 for(const lossPercent of [-1,101,'',NaN])assert.equal(evaluateGrowthLab(config,{lossPercent}).result.ok,false);
 assert.ok(Math.abs(evaluateGrowthLab(config,{lossPercent:'12,5'}).result.requiredGain-100/7)<1e-9);
});
const completed=Object.fromEntries(Array.from({length:50},(_,i)=>[450+i,{firstTry:4}]));
const passedExams=Object.fromEntries(Array.from({length:5},(_,i)=>[45+i,{best:9,passed:true,attempts:1}]));
function snapshot(id,index,revision=l(id).editorialRevision){return {...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},completed,passedExams,sessions:[[id,index,Array.from({length:8},(_,i)=>i===0?{v:{contentRevision:revision}}:{})]]};}
test('only the old bankruptcy draft restarts while compatible accounts retain results, pending identifiers and positions',()=>{
 for(const id of Object.keys(changes).map(Number)){
  const before=old.before.find(x=>x.id===id),input=snapshot(id,6,before.editorialRevision);input.sessions[0][2][7]={q:'10000000-0000-4000-8000-000000000001'};
  const cloud=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(input,null,100))));
  const app=mount(cloud.snapshot);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,id===494?0:6);
  assert.deepEqual(app.saved.completed,completed);assert.deepEqual(app.saved.passedExams,passedExams);
  if(id===494){assert.equal(app.saved.sessions[0][2][0].v.contentRevision,RISK_NOTES_REVISION);assert.ok(app.saved.sessions[0][2].every(s=>!s.q&&!s.p));}
  else assert.deepEqual(app.saved.sessions,input.sessions);
 }
});
test('recovery opens inline and in Laboratory with local values, returns to 44/7 and cannot return after an account change',()=>{
 const input=snapshot(493,6);let opened;
 const app=mount(input,null,{render(){},reset(){},open(kind,options){opened={kind,...options};return true;}});openLesson(app,493);
 assert.match(app.main.querySelector('#br-activity').innerHTML,/data-growth-field="lossPercent"/);
 app.window.OchavoGrowthLab.readValues=()=>({lossPercent:80});const before=structuredClone(app.saved.sessions);
 app.click({growthTool:'recovery'});assert.equal(opened.kind,'recovery');assert.deepEqual(opened.values,{lossPercent:80});assert.equal(app.main.dataset.view,'lab');
 assert.deepEqual(app.saved.sessions,before);assert.doesNotMatch(JSON.stringify(app.saved),/lossPercent/);
 opened.onReturn();assert.equal(app.course.reportContext().stepIndex,6);assert.deepEqual(app.saved.sessions,before);
 app.click({growthTool:'recovery'});app.course.restore(emptySnapshot());opened.onReturn();assert.equal(app.main.dataset.view,'map');
});
