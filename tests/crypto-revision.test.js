import test from 'node:test';
import {packedEditorial as packed,editorialDrafts} from './editorial-drafts.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount,openLesson,openExam,lessons,exams} from './current-course-harness.js';
import {TRACKS,LEGACY_TRACKS} from '../src/tracks.js';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {createGameCatalog,emptyGame,applyGameCommand} from '../src/game-domain.js';
const outline=JSON.parse(readFileSync(new URL('../src/content/crypto-outline-v2.json',import.meta.url)));
const crypto=TRACKS[2],current=crypto.lessonIds.map(id=>lessons[id]);
const clientCatalog=JSON.parse(readFileSync(new URL('../src/content/game-catalog.json',import.meta.url)));
const pending=(id,step=0)=>({id,step,order:[0,1,2,3,4,5,6,7,8,9],drafts:editorialDrafts(exams[id]),submitted:false});
const completed=Object.fromEntries(current.map(l=>[l.id,{firstTry:0}]));
const passedExams=Object.fromEntries(crypto.groupIds.map(id=>[id,{best:8,attempts:1,passed:true}]));

test('the shipped client catalogue can reward every new Cripto lesson and exam while retaining old claims',()=>{
 for(const l of current){
  assert.equal(clientCatalog['lesson-'+l.id]?.kind,'lesson',`Missing lesson ${l.id}`);
  for(const [i,s] of l.steps.entries())if(s.type!=='learn')assert.equal(clientCatalog[`answer-${l.id}-${i}`]?.kind,'answer');
 }
 for(const id of crypto.groupIds){assert.equal(clientCatalog['exam-'+id]?.bonusId,'world-'+id);assert.equal(clientCatalog['badge-world-'+id]?.requiredClaim,'world-'+id);}
 for(const id of LEGACY_TRACKS[2].lessonIds)assert.equal(clientCatalog['lesson-'+id]?.kind,'lesson');
 for(const id of [1150,1449]){
  const answer=applyGameCommand(emptyGame(),{kind:'answer',target:`answer-${id}-1`,attemptId:'new-'+id,correct:true},{day:'2026-10-08',entry:clientCatalog[`answer-${id}-1`]});
  assert.equal(answer.state.gems,201);
  const lesson=applyGameCommand(answer.state,{kind:'lesson',target:'lesson-'+id},{day:'2026-10-08',entry:clientCatalog['lesson-'+id]});
  assert.equal(lesson.state.gems,211);
 }
});

test('the 300 current titles match the approved 30-world index exactly',()=>{
 assert.equal(current.length,300);assert.equal(outline.worlds.length,30);
 assert.deepEqual(current.map(l=>l.title),outline.worlds.flatMap(w=>w.lessons.map(l=>l.title)));
 for(const [i,l] of current.entries()){
  assert.equal(l.id,1150+i);assert.equal(l.steps.length,8);
  for(let step=0;step<8;step+=2){assert.equal(l.steps[step].type,'learn');assert.notEqual(l.steps[step+1].type,'learn');assert.ok(l.steps[step].body.length>100);}
  assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);
  assert.doesNotMatch(JSON.stringify(l),/undefined|\{[a-d]\}|TODO|cuaderno de Marina/);
  for(const n of l.steps.filter(s=>s.type==='numeric')){assert.ok(n.body.length>35);assert.ok(Number.isFinite(n.answer));assert.equal(n.calculator,true);}
 }
});
test('all 300 lessons render every explanation and accept their authored answers without changing another completion',()=>{
 for(const l of current){
  const app=mount({...emptySnapshot(),track:'crypto',group:Math.floor(l.id/10),completed,passedExams,sessions:[[l.id,0,editorialDrafts(l)]],activeId:l.id,activeByTrack:{crypto:l.id}});
  openLesson(app,l.id);
  for(const [i,s] of l.steps.entries()){
   assert.equal(app.main.dataset.view,'lesson',`Lesson ${l.id}, step ${i}`);
   if(s.explore)for(let option=0;option<s.explore.options.length;option++)app.click({explore:String(option)});
   if(s.type==='numeric')app.setNumber(String(s.answer).replace('.',','));
   if(s.type!=='learn'){app.click({check:''});assert.equal(app.saved.sessions.find(x=>x[0]===l.id)[2][i].p,1,`Lesson ${l.id}, answer ${i}`);}
   app.click({next:''});
  }
  assert.equal(app.main.dataset.view,'success');assert.equal(app.saved.completed[l.id].firstTry,4);
  assert.equal(app.saved.sessions.some(x=>x[0]===l.id),false);
  assert.equal(Object.keys(app.saved.completed).length,300);
 }
});
test('all 30 exams accept all ten answers and continue only to their next Cripto world',()=>{
 for(const id of crypto.groupIds){
  const e=exams[id],exam=pending(id),app=mount({...emptySnapshot(),track:'crypto',group:id,completed,passedExams,exam,examSessions:{crypto:exam}});
  assert.equal(e.steps.length,10);assert.deepEqual(e.steps.map(s=>s.reviewLesson),crypto.lessonIds.filter(i=>Math.floor(i/10)===id));
  openExam(app,id);
  for(const s of e.steps){app.setNumber(s.type==='numeric'?String(s.answer).replace('.',','):null);app.click({examNext:''});}
  assert.equal(app.saved.exam.score,10,`Exam ${id}`);assert.equal(app.main.dataset.view,'exam-result');
  const next=crypto.groupIds[crypto.groupIds.indexOf(id)+1];
  if(next===undefined)assert.doesNotMatch(app.main.innerHTML,/data-group=/);else assert.match(app.main.innerHTML,new RegExp(`data-group="${next}"`));
 }
});

test('historical Cripto progress, exams, drafts and paid skips cannot unlock the rebuilt course',()=>{
 const legacy=LEGACY_TRACKS.find(t=>t.id==='crypto');
 const old={version:5,track:'crypto',page:'map',group:44,mapTarget:'br-point-449',completed:Object.fromEntries(legacy.lessonIds.map(id=>[id,{firstTry:4}])),passedExams:Object.fromEntries(legacy.groupIds.map(id=>[id,{best:10,attempts:1,passed:true}])),sessions:[[449,3,lessons[449].steps.map(packed)]],activeId:449,activeByTrack:{crypto:449},exam:pending(44,3),examSessions:{crypto:pending(44,3)}};
 const migrated=mergeProgress(null,makeEnvelope(old,null,100)).snapshot,app=mount(migrated,legacy.groupIds);
 assert.equal(migrated.group,115);assert.equal(migrated.activeId,null);assert.equal(migrated.exam,null);
 assert.equal(migrated.archivedExamSessions[44].step,3);assert.equal(migrated.sessions[0][0],449);
 assert.match(app.main.innerHTML,/Cripto: 0 de 300 puntos, 0 de 30 exámenes aprobados/);
 assert.match(app.main.innerHTML,/data-detail="1150"/);assert.doesNotMatch(app.main.innerHTML,/data-skip-intro/);
 openLesson(app,1150);assert.equal(app.course.reportContext().stepIndex,0);
 app.click({nav:'map'});app.click({detail:'1160'});assert.doesNotMatch(app.main.innerHTML,/data-start="1160"/);
 app.click({nav:'map'});app.click({track:'stocks'});app.click({track:'crypto'});assert.equal(app.saved.activeId,1150);
 assert.equal(Object.keys(app.saved.completed).length,100);assert.equal(Object.keys(app.saved.passedExams).length,10);
});
test('new Cripto drafts and historical drafts survive merging across devices independently',()=>{
 const currentId=1158,numberStep=lessons[currentId].steps.findIndex(s=>s.type==='numeric');
 assert.ok(numberStep>=1);
 const drafts=editorialDrafts(lessons[currentId]);drafts[numberStep]={n:'5,5'};
 const data={...emptySnapshot(),track:'crypto',group:115,completed:{150:{firstTry:4},...Object.fromEntries(Array.from({length:8},(_,i)=>[1150+i,{firstTry:4}]))},sessions:[[150,3,lessons[150].steps.map(packed)],[currentId,numberStep,drafts]],activeId:currentId,activeByTrack:{crypto:currentId},archivedExamSessions:{15:pending(15,2)}};
 const cloud=mergeProgress(null,makeEnvelope(data)),app=mount(cloud.snapshot);
 openLesson(app,currentId);app.setNumber('7,5');app.course.mergeAchievements(cloud.snapshot);app.course.flushInputs();
 assert.equal(app.saved.sessions.find(s=>s[0]===currentId)[2][numberStep].n,'7,5');assert.equal(app.saved.archivedExamSessions[15].step,2);
 const again=mergeProgress(cloud,makeEnvelope(app.saved,cloud,cloud.modifiedAt+100));
 assert.equal(again.snapshot.activeId,currentId);assert.equal(again.snapshot.archivedExamSessions[15].step,2);assert.equal(again.snapshot.sessions.find(s=>s[0]===150)[0],150);
});
test('Cripto rewards use new IDs while preserving historical claims, balances and badges',()=>{
 const catalog=createGameCatalog({lessons,exams}),previous={...emptyGame(),gems:375,completedLessons:100,badges:['world-15']};
 assert.ok(catalog['lesson-150']);assert.ok(catalog['lesson-1150']);assert.ok(catalog['exam-115']);
 const reward=applyGameCommand(previous,{kind:'lesson',target:'lesson-1150'},{day:'2026-10-08',entry:catalog['lesson-1150'],existingClaims:['lesson-150']});
 assert.equal(reward.state.gems,385);assert.deepEqual(reward.claims.map(c=>c.id),['lesson-1150']);assert.deepEqual(reward.state.badges,['world-15']);
});
test('crypto calculations use the correct bases, units and security limits',()=>{
 for(const [id,answer] of [[1282,80],[1295,62.5],[1235,33.33],[1199,38],[1345,4],[1439,200]])assert.equal(lessons[id].steps.find(s=>s.type==='numeric')?.answer,answer,`Lesson ${id} preserves its meaningful calculation`);
 for(const id of crypto.groupIds)assert.doesNotMatch(JSON.stringify(exams[id]),/precio de la acción|La afirmación es correcta en cualquier empresa/);
 assert.match(lessons[1334].steps[0].body,/no reduce a la mitad tus monedas/i);
 assert.match(lessons[1384].steps[0].body,/mantiene la posibilidad de gastar/);
 assert.match(lessons[1352].steps[0].body,/No es por sí sola todo el mecanismo de consenso/);
 assert.match(lessons[1446].steps[0].body,/No toda persona con USDC/);
});


