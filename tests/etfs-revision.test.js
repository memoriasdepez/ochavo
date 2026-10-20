import test from 'node:test';
import {packedEditorial as packed,editorialDrafts} from './editorial-drafts.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount,openLesson,openExam,lessons,exams} from './current-course-harness.js';
import {TRACKS,LEGACY_TRACKS} from '../src/tracks.js';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {createGameCatalog,emptyGame,applyGameCommand} from '../src/game-domain.js';
const outline=JSON.parse(readFileSync(new URL('../src/content/etfs-outline-v2.json',import.meta.url)));
const etfs=TRACKS[1],current=etfs.lessonIds.map(id=>lessons[id]);
const pending=(id,step=0)=>({id,step,order:[0,1,2,3,4,5,6,7,8,9],drafts:editorialDrafts(exams[id]),submitted:false});
const completed=Object.fromEntries(current.map(l=>[l.id,{firstTry:0}]));
const passedExams=Object.fromEntries(etfs.groupIds.map(id=>[id,{best:8,attempts:1,passed:true}]));

test('the 200 current titles match the approved 20-world index exactly',()=>{
 assert.equal(current.length,200);assert.equal(outline.worlds.length,20);
 assert.deepEqual(current.map(l=>l.title),outline.worlds.flatMap(w=>w.lessons.map(l=>l.title)));
 for(const [i,l] of current.entries()){
  assert.equal(l.id,950+i);assert.equal(l.steps.length,8);
  for(let step=0;step<8;step+=2){assert.equal(l.steps[step].type,'learn');assert.notEqual(l.steps[step+1].type,'learn');assert.ok(l.steps[step].body.length>100);}
  assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);
  assert.doesNotMatch(JSON.stringify(l),/undefined|\{[a-d]\}|TODO|cuaderno de Marina/);
  for(const n of l.steps.filter(s=>s.type==='numeric')){assert.ok(n.body.length>35);assert.ok(Number.isFinite(n.answer));assert.equal(n.calculator,true);}
 }
});
test('all 200 lessons render every explanation and accept their authored answers without changing another completion',()=>{
 for(const l of current){
  const app=mount({...emptySnapshot(),track:'etfs',group:Math.floor(l.id/10),completed,passedExams,sessions:[[l.id,0,editorialDrafts(l)]],activeId:l.id,activeByTrack:{etfs:l.id}});
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
  assert.equal(Object.keys(app.saved.completed).length,200);
 }
});
test('all 20 exams accept all ten answers and continue only to their next ETF world',()=>{
 for(const id of etfs.groupIds){
  const e=exams[id],exam=pending(id),app=mount({...emptySnapshot(),track:'etfs',group:id,completed,passedExams,exam,examSessions:{etfs:exam}});
  assert.equal(e.steps.length,10);assert.deepEqual(e.steps.map(s=>s.reviewLesson),etfs.lessonIds.filter(i=>Math.floor(i/10)===id));
  openExam(app,id);
  for(const s of e.steps){app.setNumber(s.type==='numeric'?String(s.answer).replace('.',','):null);app.click({examNext:''});}
  assert.equal(app.saved.exam.score,10,`Exam ${id}`);assert.equal(app.main.dataset.view,'exam-result');
  const next=etfs.groupIds[etfs.groupIds.indexOf(id)+1];
  if(next===undefined)assert.doesNotMatch(app.main.innerHTML,/data-group=/);else assert.match(app.main.innerHTML,new RegExp(`data-group="${next}"`));
 }
});

test('historical ETF progress, exams, drafts and paid skips cannot unlock the rebuilt course',()=>{
 const legacy=LEGACY_TRACKS.find(t=>t.id==='etfs');
 const old={version:5,track:'etfs',page:'map',group:39,mapTarget:'br-point-399',completed:Object.fromEntries(legacy.lessonIds.map(id=>[id,{firstTry:4}])),passedExams:Object.fromEntries(legacy.groupIds.map(id=>[id,{best:10,attempts:1,passed:true}])),sessions:[[399,3,lessons[399].steps.map(packed)]],activeId:399,activeByTrack:{etfs:399},exam:pending(39,3),examSessions:{etfs:pending(39,3)}};
 const migrated=mergeProgress(null,makeEnvelope(old,null,100)).snapshot,app=mount(migrated,legacy.groupIds);
 assert.equal(migrated.group,95);assert.equal(migrated.activeId,null);assert.equal(migrated.exam,null);
 assert.equal(migrated.archivedExamSessions[39].step,3);assert.equal(migrated.sessions[0][0],399);
 assert.match(app.main.innerHTML,/ETFs: 0 de 200 puntos, 0 de 20 exámenes aprobados/);
 assert.match(app.main.innerHTML,/data-detail="950"/);assert.doesNotMatch(app.main.innerHTML,/data-skip-intro/);
 openLesson(app,950);assert.equal(app.course.reportContext().stepIndex,0);
 app.click({nav:'map'});app.click({detail:'960'});assert.doesNotMatch(app.main.innerHTML,/data-start="960"/);
 app.click({nav:'map'});app.click({track:'stocks'});app.click({track:'etfs'});assert.equal(app.saved.activeId,950);
 assert.equal(Object.keys(app.saved.completed).length,100);assert.equal(Object.keys(app.saved.passedExams).length,10);
});
test('new ETF drafts and historical drafts survive merging across devices independently',()=>{
 const drafts=editorialDrafts(lessons[951]);drafts[3]={n:'5,5'};
 const data={...emptySnapshot(),track:'etfs',group:95,completed:{100:{firstTry:4},950:{firstTry:4}},sessions:[[100,3,lessons[100].steps.map(packed)],[951,3,drafts]],activeId:951,activeByTrack:{etfs:951},archivedExamSessions:{10:pending(10,2)}};
 const cloud=mergeProgress(null,makeEnvelope(data)),app=mount(cloud.snapshot);
 openLesson(app,951);app.setNumber('7,5');app.course.mergeAchievements(cloud.snapshot);app.course.flushInputs();
 assert.equal(app.saved.sessions.find(s=>s[0]===951)[2][3].n,'7,5');assert.equal(app.saved.archivedExamSessions[10].step,2);
 const again=mergeProgress(cloud,makeEnvelope(app.saved,cloud,cloud.modifiedAt+100));
 assert.equal(again.snapshot.activeId,951);assert.equal(again.snapshot.archivedExamSessions[10].step,2);assert.equal(again.snapshot.sessions.find(s=>s[0]===100)[0],100);
});
test('ETF rewards use new IDs while preserving historical claims, balances and badges',()=>{
 const catalog=createGameCatalog({lessons,exams}),previous={...emptyGame(),gems:375,completedLessons:100,badges:['world-10']};
 assert.ok(catalog['lesson-100']);assert.ok(catalog['lesson-950']);assert.ok(catalog['exam-95']);
 const reward=applyGameCommand(previous,{kind:'lesson',target:'lesson-950'},{day:'2026-10-08',entry:catalog['lesson-950'],existingClaims:['lesson-100']});
 assert.equal(reward.state.gems,385);assert.deepEqual(reward.claims.map(c=>c.id),['lesson-950']);assert.deepEqual(reward.state.badges,['world-10']);
});
test('worked calculations cover total income, chained returns and withdrawals correctly',async()=>{
 const {calculate}=await import('../scripts/course-authoring.mjs');
 assert.equal(calculate('gain',[104,4,100]),8);assert.equal(calculate('linked',[20,-20]),-4);
 assert.equal(calculate('linked',[10,-5]),4.5);assert.equal(calculate('afterWithdrawal',[800,100,25]),875);
 const earlier=calculate('afterWithdrawal',[800,100,25]),later=calculate('afterWithdrawal',[1250,100,-20]);
 assert.equal(earlier,875);assert.equal(later,920);assert.notEqual(earlier,later);
});


