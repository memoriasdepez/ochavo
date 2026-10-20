import {beforeDepth} from './depth-test-utils.js';
import {beforeSecondCatalog} from './second-corrections-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {OPENING_CHANGED_IDS,OPENING_RESTART_IDS,OPENING_REVISION} from '../scripts/stocks-editorial/opening-edits.mjs';
import {applyMatchArrow,matchArrowsMarkup} from '../src/match-arrows.js';
import {emptySnapshot,sanitizeSnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {mount,openLesson} from './current-course-harness.js';
const read=file=>JSON.parse(readFileSync(new URL('../'+file,import.meta.url)));
const course=read('src/content/stocks-curriculum-v2.json');
const baseline=read('tests/fixtures/stocks-opening-0314-baseline.json');
const lesson=id=>course.lessons.find(l=>l.id===id);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const changedScreens={450:[0,6],451:[0],452:[2,3],453:[0],454:[2],455:[0,2,4],457:[0,1,4,5,6],458:[0,4,6]};
const snapshot=(id,index,length=lesson(id).steps.length,revision=lesson(id).editorialRevision)=>({...emptySnapshot(),activeId:id,activeByTrack:{stocks:id},group:45,
 completed:Object.fromEntries(Array.from({length:10},(_,i)=>[450+i,{firstTry:i===1?3:4}])),passedExams:{45:{best:9,passed:true,attempts:2}},
 sessions:[[id,index,Array.from({length},(_,i)=>i===0?{v:{contentRevision:revision}}:i===index?{c:1}: {})]]});

test('only the requested opening screens change; all other points, exams, identities and old rewards are exact',()=>{
 for(const old of baseline.lessons){
  const current=beforeDepth(lesson(old.id));
  assert.equal(hash([current.id,current.title,current.short,current.prerequisites]),old.identity);
  if(!OPENING_CHANGED_IDS.includes(old.id))assert.equal(hash(current),old.sha256,`Unrelated point ${old.id}`);
  else for(const [i,expected] of old.steps.entries())if(!changedScreens[old.id].includes(i))assert.equal(hash(current.steps[i]),expected,`Unrequested screen ${old.id}/${i}`);
 }
 for(const old of baseline.exams)assert.equal(hash(course.exams.find(e=>e.id===old.id)),old.sha256);
 assert.equal(hash(course.groups),baseline.groups);
 const catalog=JSON.parse(beforeSecondCatalog(JSON.stringify(read('src/content/game-catalog.json'))));
 assert.deepEqual(catalog['answer-453-9'],{kind:'answer',amount:1});
 delete catalog['answer-453-9'];assert.deepEqual(catalog,baseline.catalog);
});

test('removals, named concepts and supplied explanations reach the intended screens',()=>{
 assert.doesNotMatch(lesson(450).steps[0].body,/No tienes que trabajar allí/);
 assert.doesNotMatch(lesson(451).steps[0].body,/Mira qué has recibido/);
 for(const [id,i,phrase] of [[450,6,'cómo funciona la empresa'],[452,2,'alineación de intereses'],[452,3,'cantidad de acciones que posee'],[453,0,'ampliación de capital'],[454,2,'50,10 €'],[455,0,'pizza'],[455,2,'Solo han cambiado de dueño'],[455,4,'25 acciones en total'],[457,0,'consejo de administración'],[457,6,'no significa que vayas a cobrar todos los años'],[458,0,'pero no más'],[458,4,'120.000 €'],[458,6,'¿qué pasaría si perdiera']])assert.ok(lesson(id).steps[i].body.includes(phrase),`${id}/${i}`);
 assert.ok(lesson(457).steps[4].body.includes('GOOGL')&&lesson(457).steps[4].body.includes('GOOG'));
 assert.equal(lesson(457).steps[4].sources[0].checkedAt,'2026-10-12');
 assert.equal(lesson(457).steps[5].pairs.length,4);
});

test('the added pair explains dilution before comparing a smaller share of a larger business',()=>{
 const l=lesson(453);assert.equal(l.steps.length,10);assert.equal(l.steps[8].type,'learn');assert.equal(l.steps[9].type,'choice');
 assert.match(l.steps[8].body,/dilución del accionista/);assert.match(l.steps[8].body,/divides tus acciones entre el total/);
 assert.deepEqual(l.steps[9].figure.rows,[['Sin ampliación; menos crecimiento','10','2','200 €'],['Con ampliación; más crecimiento','20','2','600 €']]);
 assert.equal(2/10*200,40);assert.equal(2/20*600,60);assert.equal(l.steps[9].answer,1);
 assert.equal(l.steps[9].calculator,true);assert.match(l.steps[9].body,/hipotéticos/);
});

test('four arrows can be selected, corrected and reassigned without duplicate destinations',()=>{
 const s=lesson(457).steps[1],d={vars:{},matches:{}};
 const markup=matchArrowsMarkup(s,d,[2,0,3,1]);assert.equal((markup.match(/data-match-left=/g)||[]).length,4);assert.equal((markup.match(/data-match-right=/g)||[]).length,4);
 for(let i=0;i<4;i++){assert.ok(applyMatchArrow(s,d,'left',i));assert.ok(applyMatchArrow(s,d,'right',i));}
 assert.deepEqual(d.matches,{0:'0',1:'1',2:'2',3:'3'});
 applyMatchArrow(s,d,'left',0);applyMatchArrow(s,d,'right',2);
 assert.equal(d.matches[0],'2');assert.equal(d.matches[2],undefined);
 const before=JSON.stringify(d);assert.equal(applyMatchArrow(s,d,'right',4),false);assert.equal(JSON.stringify(d),before);
 assert.match(matchArrowsMarkup(s,d,[2,0,3,1],true),/disabled/);
});

test('the actual lesson controls keep incomplete arrows unscored and save four correct relations',()=>{
 const app=mount(snapshot(457,1));openLesson(app,457);
 assert.match(app.main.querySelector('#br-activity').innerHTML,/data-match-left="3"/);
 app.click({check:''});assert.equal(app.saved.sessions[0][2][1].a,undefined);
 for(let i=0;i<4;i++){app.click({matchLeft:String(i)});app.click({matchRight:String(i)});}
 assert.deepEqual(app.saved.sessions[0][2][1].m,{0:'0',1:'1',2:'2',3:'3'});
 assert.equal(sanitizeSnapshot(app.saved).sessions[0][2][1].v.matchFocus,3);
 app.click({check:''});assert.equal(app.saved.sessions[0][2][1].p,1);app.click({next:''});assert.equal(app.course.reportContext().stepIndex,2);
});

test('ten-screen attempts survive sanitizing, resume and device merge; other points stay bounded',()=>{
 const original=snapshot(453,9);original.sessions[0][2][9]={c:1,q:'10000000-0000-4000-8000-000000000001'};
 const first=makeEnvelope(original,null,100),remote=mergeProgress(null,JSON.parse(JSON.stringify(first)));
 assert.equal(remote.snapshot.sessions[0][2].length,10);assert.equal(remote.snapshot.sessions[0][1],9);
 const app=mount(remote.snapshot);openLesson(app,453);assert.equal(app.course.reportContext().stepIndex,9);assert.match(app.main.innerHTML,/10 de 10|10 \/ 10/);
 app.course.mergeAchievements(remote.snapshot);app.course.flushInputs();
 const merged=mergeProgress(first,makeEnvelope(app.saved,first,200));assert.equal(merged.snapshot.sessions[0][2][9].q,original.sessions[0][2][9].q);
 assert.deepEqual(merged.snapshot.completed,original.completed);assert.deepEqual(merged.snapshot.passedExams,original.passedExams);
 assert.equal(sanitizeSnapshot(snapshot(454,9,10)).sessions.length,0);
 assert.equal(sanitizeSnapshot({...emptySnapshot(),completed:{453:{firstTry:5},454:{firstTry:5}}}).completed[453].firstTry,5);
 let accessed=false;const unsafe={get length(){accessed=true;return 10;}};
 sanitizeSnapshot({...emptySnapshot(),sessions:[[453,9,unsafe]]});assert.equal(accessed,false);
});

test('only incompatible drafts restart and completed history stays intact',()=>{
 for(const id of OPENING_CHANGED_IDS){
  const old=snapshot(id,3,8,'stocks-clear-2026-10-09'),app=mount(old);openLesson(app,id);
  assert.equal(app.course.reportContext().stepIndex,OPENING_RESTART_IDS.includes(id)?0:3,`Restart scope ${id}`);
  assert.deepEqual(app.saved.completed,old.completed);assert.deepEqual(app.saved.passedExams,old.passedExams);
  if(OPENING_RESTART_IDS.includes(id))assert.equal(app.saved.sessions[0][2][0].v.contentRevision,OPENING_REVISION);
 }
});
