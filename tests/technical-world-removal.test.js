import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {buildTechnical} from '../scripts/technical-authoring/build-300.mjs';
import {buildPublishedTechnical} from '../scripts/build-technical-curriculum.mjs';
import {TRACKS,LEGACY_TRACKS,ALL_TRACKS,LESSON_COUNT,WORLD_COUNT,ACTIVE_LESSON_COUNT,ACTIVE_WORLD_COUNT,isArchivedLesson,isArchivedWorld,trackForLesson,trackForExam,lessonNumber,worldNumber} from '../src/tracks.js';
import {emptySnapshot,sanitizeSnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {createGameCatalog,emptyGame,applyGameCommand,validateSkippedWorlds} from '../src/game-domain.js';
import {badgeCatalog} from '../src/badges.js';

const technical=TRACKS.find(t=>t.id==='technical'),retired=LEGACY_TRACKS.find(t=>t.id==='technical');
const raw=buildTechnical(),published=buildPublishedTechnical();
const byId=(items,id)=>items.find(item=>item.id===id);
const range=(start,count)=>Array.from({length:count},(_,i)=>start+i);

test('retiring the duplicate world changes display order without reusing any lesson or world ID',()=>{
 assert.equal(technical.count,290);assert.equal(technical.groupCount,29);
 assert.deepEqual(technical.lessonIds,[...range(1450,20),...range(1480,270)]);
 assert.deepEqual(technical.groupIds,[145,146,...range(148,27)]);
 assert.equal(ACTIVE_LESSON_COUNT,1290);assert.equal(ACTIVE_WORLD_COUNT,129);
 assert.equal(LESSON_COUNT,1750);assert.equal(WORLD_COUNT,175);
 const allLessons=ALL_TRACKS.flatMap(t=>t.lessonIds),allWorlds=ALL_TRACKS.flatMap(t=>t.groupIds);
 assert.equal(new Set(allLessons).size,1750);assert.equal(allLessons.length,1750);
 assert.equal(new Set(allWorlds).size,175);assert.equal(allWorlds.length,175);
 assert.equal(technical.lessonIds[technical.lessonIds.indexOf(1469)+1],1480);
 assert.equal(lessonNumber(1469),20);assert.equal(lessonNumber(1480),21);assert.equal(lessonNumber(1749),290);
 assert.equal(worldNumber(146),2);assert.equal(worldNumber(148),3);assert.equal(worldNumber(174),29);
 assert.deepEqual(retired.lessonIds,range(1470,10));assert.deepEqual(retired.groupIds,[147]);assert.equal(retired.retired,true);
 for(const id of range(1470,10)){assert.equal(isArchivedLesson(id),true);assert.equal(trackForLesson(id).id,'technical');assert.equal(lessonNumber(id),id-1450+1);}
 assert.equal(isArchivedWorld(147),true);assert.equal(trackForExam(147).archived,true);assert.equal(worldNumber(147),3);
});

test('publication keeps the withdrawn authoring intact and adjusts only the active seam and exam labels',()=>{
 assert.equal(published.lessons.length,300);assert.equal(published.groups.length,30);assert.equal(published.exams.length,30);
 assert.deepEqual(published.groups,raw.groups);
 for(const original of raw.lessons){
  const current=byId(published.lessons,original.id);
  if(original.id===1480){assert.deepEqual(current.prerequisites,[1469]);assert.deepEqual({...current,prerequisites:original.prerequisites},original);}
  else assert.deepEqual(current,original);
 }
 assert.deepEqual(byId(published.exams,147),byId(raw.exams,147));
 assert.deepEqual(byId(published.lessons,1479).prerequisites,[1478]);
 for(const [index,id]of technical.groupIds.entries()){
  const exam=byId(published.exams,id),original=byId(raw.exams,id);
  assert.ok(exam.title.startsWith(`Examen ${index+1} · `));
  assert.deepEqual({...exam,title:original.title},original);
 }
});

test('completed withdrawn points, pending answers, exam history and earned badges remain attached to their old IDs',()=>{
 const pendingExam={id:147,step:3,order:range(0,10),drafts:Array.from({length:10},()=>({n:'12'})),submitted:false};
 const old={...emptySnapshot(),track:'technical',group:147,mapTarget:'br-point-1474',completed:{1469:{firstTry:3},1470:{firstTry:4},1480:{firstTry:2}},passedExams:{146:{best:8,attempts:1,passed:true},147:{best:9,attempts:1,passed:true}},sessions:[[1474,5,Array.from({length:8},()=>({n:'15'}))]],activeId:1474,activeByTrack:{technical:1474},exam:pendingExam,examSessions:{technical:pendingExam}};
 const clean=sanitizeSnapshot(old),merged=mergeProgress(null,makeEnvelope(old,null,100)).snapshot;
 for(const snapshot of [clean,merged]){
  assert.deepEqual(snapshot.completed,old.completed);assert.deepEqual(snapshot.passedExams,old.passedExams);
  assert.deepEqual(snapshot.sessions,old.sessions);assert.deepEqual(snapshot.archivedExamSessions[147],pendingExam);
  assert.equal(snapshot.activeId,null);assert.equal(snapshot.activeByTrack.technical,undefined);assert.equal(snapshot.exam,null);assert.equal(snapshot.mapTarget,'br-point-1480');assert.equal(snapshot.group,148);
 }
 assert.deepEqual(validateSkippedWorlds([146,147,148]),[146,147,148]);
 const badges=badgeCatalog(Array.from({length:175},()=>({short:'Mundo'}))),historic=badges.find(b=>b.id==='world-147');
 assert.equal(historic.mark,'03');assert.match(historic.description,/mundo 3/);
 const catalog=createGameCatalog(published),wallet={...emptyGame(),gems:421,badges:['world-147'],passedExamIds:['exam-147'],passedExams:1,completedLessons:5};
 const repeated=applyGameCommand(wallet,{kind:'lesson',target:'lesson-1470'},{day:'2026-10-09',entry:catalog['lesson-1470'],existingClaims:['lesson-1470']});
 assert.equal(repeated.state.gems,421);assert.deepEqual(repeated.state.badges,['world-147']);assert.equal(repeated.state.completedLessons,5);assert.deepEqual(repeated.claims,[]);
});

test('the reward catalogue only changes the next active skip prerequisite and does not grant anything for removal',()=>{
 const current=createGameCatalog(published),before=createGameCatalog(raw);
 // Reconstruct the published technical chain before retirement; all reward definitions are unchanged.
 for(const id of range(145,30))before['skip-world-'+id]={kind:'skip-world',worldId:id,previousWorldId:id===145?-1:id-1,cost:200,amount:0};
 assert.deepEqual(Object.keys(current).sort(),Object.keys(before).sort());
 const changed=Object.keys(before).filter(key=>JSON.stringify(before[key])!==JSON.stringify(current[key]));
 assert.deepEqual(changed,['skip-world-148']);
 assert.deepEqual(current['skip-world-147'],{kind:'skip-world',worldId:147,previousWorldId:146,cost:200,amount:0});
 assert.deepEqual(current['skip-world-148'],{kind:'skip-world',worldId:148,previousWorldId:146,cost:200,amount:0});
 const entry=current['skip-world-148'],wallet={...emptyGame(),gems:200,passedExamIds:['exam-146'],passedExams:1};
 const skipped=applyGameCommand(wallet,{kind:'skip-world',target:'skip-world-148'},{day:'2026-10-09',entry});
 assert.equal(skipped.state.gems,0);assert.deepEqual(skipped.skippedWorldIds,[148]);assert.deepEqual(skipped.state.passedExamIds,['exam-146']);
 assert.equal(skipped.state.completedLessons,0);assert.deepEqual(skipped.state.badges,[]);assert.equal(skipped.receipt.rewardAmount,0);assert.equal(skipped.receipt.bonusAmount,0);
 assert.throws(()=>applyGameCommand({...emptyGame(),gems:200},{kind:'skip-world',target:'skip-world-148'},{day:'2026-10-09',entry}),{code:'game/world-locked'});
});

test('profile calls withdrawn technical progress history without saying the active path restarts',()=>{
 const source=readFileSync(new URL('../src/social-ui.js',import.meta.url),'utf8');
 const start=source.indexOf(' function historyMarkup(p){'),end=source.indexOf(' function profile(){',start);
 assert.ok(start>=0&&end>start);
 const history=vm.runInNewContext('('+source.slice(start,end).trim()+')',{LEGACY_TRACKS,esc:value=>String(value),trackNames:{stocks:'Acciones',etfs:'ETFs',crypto:'Cripto',technical:'Análisis técnico'}});
 const html=history({completed:{1470:{firstTry:4}},passedExams:{147:{passed:true}}});
 assert.match(html,/Contenido retirado de Análisis técnico/);assert.match(html,/1 lecciones completadas · 1 mundos superados/);
 assert.match(html,/el avance del resto del camino sigue guardado/);assert.doesNotMatch(html,/Empezamos el nuevo recorrido desde cero/);
 assert.equal(history({completed:{},passedExams:{}}),'');
});
