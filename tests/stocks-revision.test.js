import test from 'node:test';
import {packedEditorial as packed,editorialDrafts as packedSteps} from './editorial-drafts.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mount,openLesson,openExam,lessons,exams} from './current-course-harness.js';
import {TRACKS,LEGACY_TRACKS} from '../src/tracks.js';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {createGameCatalog,emptyGame,applyGameCommand} from '../src/game-domain.js';
const outline=JSON.parse(readFileSync(new URL('../src/content/stocks-outline-v2.json',import.meta.url)));
const stocks=TRACKS[0],current=stocks.lessonIds.map(id=>lessons[id]);
const pending=(id,step=0)=>({id,step,order:[0,1,2,3,4,5,6,7,8,9],drafts:packedSteps(exams[id]),submitted:false});
const completed=Object.fromEntries(current.map(l=>[l.id,{firstTry:0}]));
const passedExams=Object.fromEntries(stocks.groupIds.map(id=>[id,{best:8,attempts:1,passed:true}]));

test('the 500 current titles match the approved 50-world index exactly',()=>{
 assert.equal(current.length,500);assert.equal(outline.worlds.length,50);
 assert.deepEqual(current.map(l=>l.title),outline.worlds.flatMap(w=>w.lessons.map(l=>l.title)));
 for(const [i,l] of current.entries()){
  assert.equal(l.id,450+i);assert.equal(l.steps.length,[453,462,471].includes(l.id)?10:8);
  for(let step=0;step<l.steps.length;step+=2){assert.equal(l.steps[step].type,'learn');assert.notEqual(l.steps[step+1].type,'learn');assert.ok(l.steps[step].body.length>60);}
  assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);
  assert.doesNotMatch(JSON.stringify(l),/undefined|\{[a-d]\}|TODO|cuaderno de Marina/);
  for(const n of l.steps.filter(s=>s.type==='numeric')){assert.ok(n.body.length>35);assert.ok(Number.isFinite(n.answer));}
 }
});
test('all 500 lessons render every explanation and accept their authored answers without changing another completion',()=>{
 for(const l of current){
  const app=mount({...emptySnapshot(),group:Math.floor(l.id/10),completed,passedExams,sessions:[[l.id,0,packedSteps(l)]],activeId:l.id,activeByTrack:{stocks:l.id}});
  openLesson(app,l.id);
  for(const [i,s] of l.steps.entries()){
   assert.equal(app.main.dataset.view,'lesson',`Lesson ${l.id}, step ${i}`);
   if(s.explore)for(let option=0;option<s.explore.options.length;option++)app.click({explore:String(option)});
   if(s.type==='numeric')app.setNumber(String(s.answer).replace('.',','));
   if(s.type!=='learn'){app.click({check:''});assert.equal(app.saved.sessions.find(x=>x[0]===l.id)[2][i].p,1,`Lesson ${l.id}, answer ${i}`);}
   app.click({next:''});
  }
  assert.equal(app.main.dataset.view,'success');assert.equal(app.saved.completed[l.id].firstTry,l.steps.filter(s=>s.type!=='learn').length);
  assert.equal(app.saved.sessions.some(x=>x[0]===l.id),false);
  assert.equal(Object.keys(app.saved.completed).length,500);
 }
});
test('all 50 exams accept all ten answers and continue only to their next stock world',()=>{
 for(const id of stocks.groupIds){
  const e=exams[id],exam=pending(id),app=mount({...emptySnapshot(),group:id,completed,passedExams,exam,examSessions:{stocks:exam}});
  assert.equal(e.steps.length,10);assert.deepEqual(e.steps.map(s=>s.reviewLesson),stocks.lessonIds.filter(i=>Math.floor(i/10)===id));
  openExam(app,id);
  for(const s of e.steps){app.setNumber(s.type==='numeric'?String(s.answer).replace('.',','):null);app.click({examNext:''});}
  assert.equal(app.saved.exam.score,10,`Exam ${id}`);assert.equal(app.main.dataset.view,'exam-result');
  const next=stocks.groupIds[stocks.groupIds.indexOf(id)+1];
  if(next===undefined)assert.doesNotMatch(app.main.innerHTML,/data-group=/);else assert.match(app.main.innerHTML,new RegExp(`data-group="${next}"`));
 }
});
test('old completions, old paid world skips and old intro choice cannot unlock different lessons',()=>{
 const old={version:5,page:'profile',group:34,introSkipped:true,completed:Object.fromEntries(LEGACY_TRACKS[0].lessonIds.map(id=>[id,{firstTry:4}])),passedExams:Object.fromEntries(LEGACY_TRACKS[0].groupIds.map(id=>[id,{best:10,attempts:1,passed:true}])),sessions:[[349,3,lessons[349].steps.map(packed)]],activeId:349,exam:pending(34,3)};
 const oldEnvelope=makeEnvelope(old,null,100),merged=mergeProgress(oldEnvelope,makeEnvelope(emptySnapshot(),null,200));
 const app=mount(merged.snapshot,LEGACY_TRACKS[0].groupIds);app.click({nav:'map'});
 assert.match(app.main.innerHTML,/data-skip-intro/);assert.match(app.main.innerHTML,/data-detail="450"/);assert.doesNotMatch(app.main.innerHTML,/data-detail="0"/);
 assert.equal(app.saved.archivedExamSessions[34].step,3);assert.equal(app.saved.sessions[0][0],349);
 assert.match(app.main.innerHTML,/Acciones: 0 de 500 puntos, 0 de 50 exámenes aprobados/);
 openLesson(app,450);assert.equal(app.course.reportContext().stepIndex,0);assert.equal(app.saved.completed[450],undefined);
 app.click({nav:'map'});app.click({detail:'460'});assert.doesNotMatch(app.main.innerHTML,/data-start="460"/);
 assert.equal(Object.keys(app.saved.completed).length,250);assert.equal(Object.keys(app.saved.passedExams).length,25);
});
test('switching back to Acciones never reactivates an unfinished historical lesson',()=>{
 const app=mount({...emptySnapshot(),sessions:[[18,3,lessons[18].steps.map(packed)]],completed:{0:{firstTry:4}}});
 app.click({track:'etfs'});app.click({track:'stocks'});
 assert.equal(app.saved.activeId,null);assert.equal(app.saved.group,45);assert.equal(app.saved.sessions[0][0],18);
 assert.match(app.main.innerHTML,/Acciones: 0 de 500 puntos, 0 de 50 exámenes aprobados/);
});
test('free first-world skip uses current IDs, opens point 11 and does not approve its exam',async()=>{
 const app=mount(),skipped=[];
 app.window.virutaGame={getView:()=>({canSpend:true,canPlay:true,skippedWorldIds:skipped}),skipWorld:async id=>skipped.push(id)};
 app.click({skipIntro:''});await new Promise(r=>setImmediate(r));
 assert.equal(app.saved.mapTarget,'br-point-460');assert.equal(app.saved.introSkipped,false);assert.deepEqual(app.saved.completed,{});assert.deepEqual(app.saved.passedExams,{});
 assert.deepEqual(skipped,[45]);openLesson(app,460);app.click({nav:'map'});app.click({examDetail:'45'});assert.doesNotMatch(app.main.innerHTML,/data-exam-start/);
 app.click({nav:'map'});app.click({group:'47'});app.click({detail:'470'});assert.doesNotMatch(app.main.innerHTML,/data-start="470"/);
});
test('current drafts survive background sync and a round trip across devices; historical drafts stay historical',()=>{
 const l=lessons[451],drafts=l.steps.map(()=>({}));drafts[0]={v:{contentRevision:l.editorialRevision}};drafts[3]={n:'5,5'};
 const snapshot={...emptySnapshot(),completed:{0:{firstTry:4},450:{firstTry:4}},sessions:[[0,3,lessons[0].steps.map(packed)],[451,3,drafts]],activeId:451,activeByTrack:{stocks:451},archivedExamSessions:{0:pending(0,2)}};
 const cloud=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(snapshot))));
 const app=mount(cloud.snapshot);openLesson(app,451);app.setNumber('7,5');app.course.mergeAchievements({...cloud.snapshot,introSkipped:true});app.course.flushInputs();
 assert.equal(app.saved.sessions.find(s=>s[0]===451)[2][3].n,'7,5');assert.equal(app.saved.archivedExamSessions[0].step,2);assert.equal(app.saved.sessions.find(s=>s[0]===0)[0],0);
 const again=mergeProgress(cloud,makeEnvelope(app.saved,cloud,cloud.modifiedAt+100));assert.equal(again.snapshot.activeId,451);assert.equal(again.snapshot.archivedExamSessions[0].step,2);
});
test('new rewards have new identities and legacy rewards remain available for clients already open',()=>{
 const catalog=createGameCatalog({lessons,exams});
 assert.ok(catalog['lesson-450']);assert.ok(catalog['lesson-0']);assert.ok(catalog['exam-45']);assert.ok(catalog['exam-0']);
 const previous={...emptyGame(),gems:375,completedLessons:250,badges:['world-0']};
 const reward=applyGameCommand(previous,{kind:'lesson',target:'lesson-450'},{day:'2026-10-08',entry:catalog['lesson-450'],existingClaims:['lesson-0']});
 assert.equal(reward.state.gems,385);assert.deepEqual(reward.claims.map(c=>c.id),['lesson-450']);assert.deepEqual(reward.state.badges,['world-0']);
});

