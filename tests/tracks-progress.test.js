import test from 'node:test';
import assert from 'node:assert/strict';
import {emptySnapshot,sanitizeSnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {TRACKS,trackForLesson,trackForExam,lessonNumber,worldNumber} from '../src/tracks.js';
const copy=v=>JSON.parse(JSON.stringify(v));
const session=(id,step=1)=>[id,step,Array.from({length:8},()=>({}))];
const exam=(id,step=1)=>({id,step,order:[0,1,2,3,4,5,6,7,8,9],drafts:Array.from({length:10},()=>({})),submitted:false});

test('expanded paths keep distinct stable IDs and consecutive visible numbering',()=>{
 assert.deepEqual(TRACKS.map(t=>[t.lessonIds.length,t.groupIds.length]),[[500,50],[200,20],[300,30],[290,29]]);
 assert.equal(new Set(TRACKS.flatMap(t=>t.lessonIds)).size,1290);
 for(const t of TRACKS){
  t.lessonIds.forEach((id,index)=>{assert.equal(trackForLesson(id).id,t.id);assert.equal(lessonNumber(id),index+1);});
  t.groupIds.forEach((id,index)=>{assert.equal(trackForExam(id).id,t.id);assert.equal(worldNumber(id),index+1);});
 }
});
test('1750 current and historical completions, 175 exams and 45 cases fit the cloud limit',()=>{
 const draft={c:2,s:[0,2],m:{0:'1',1:'0'},n:'1234,56',a:2,p:1,h:1,v:{explore:2},q:'10000000-0000-4000-8000-000000000001'};
 const input={...emptySnapshot(),track:'technical',group:174,mapTarget:'br-point-1749',
  completed:Object.fromEntries(Array.from({length:1750},(_,id)=>[id,{firstTry:id%5}])),
  passedExams:Object.fromEntries(Array.from({length:175},(_,id)=>[id,{best:8,attempts:1}])),
  completedCases:Object.fromEntries(Array.from({length:45},(_,id)=>['case-'+(id+1),{firstTry:3}])),
  sessions:[1149,1449,949,1749].map(id=>[id,7,Array.from({length:8},()=>draft)]),activeId:1749,activeByTrack:{stocks:949,etfs:1149,crypto:1449,technical:1749},
  exam:exam(174),examSessions:{stocks:exam(94),etfs:exam(114),crypto:exam(144),technical:exam(174)},archivedExamSessions:{34:exam(34)}};
 const envelope=makeEnvelope(input),restored=mergeProgress(null,JSON.parse(JSON.stringify(envelope))).snapshot;
 assert.equal(Object.keys(restored.completed).length,1750);assert.equal(Object.keys(restored.passedExams).length,175);assert.equal(Object.keys(restored.completedCases).length,45);
 assert.equal(restored.sessions.length,4);assert.equal(restored.exam.id,174);assert.equal(restored.group,174);assert.equal(restored.mapTarget,'br-point-1749');assert.equal(restored.archivedExamSessions[34].id,34);
 assert.ok(Buffer.byteLength(JSON.stringify(envelope),'utf8')<131072);
});
test('previous stock progress and drafts remain historical; current navigation starts from the new first world',()=>{
 const old={version:5,page:'map',group:4,introSkipped:true,mapTarget:'br-point-49',completed:Object.fromEntries(Array.from({length:49},(_,id)=>[id,{firstTry:4}])),sessions:[session(49,6)],activeId:49,passedExams:Object.fromEntries(Array.from({length:4},(_,id)=>[id,{best:9,attempts:2,passed:true}])),exam:exam(3,7)};
 const result=sanitizeSnapshot(old);
 assert.equal(result.track,'stocks');assert.equal(result.group,45);assert.equal(result.introSkipped,false);assert.equal(result.mapTarget,null);assert.equal(result.activeId,null);assert.equal(result.exam,null);
 assert.deepEqual(result.completed,old.completed);assert.deepEqual(result.sessions,old.sessions);assert.deepEqual(result.passedExams,old.passedExams);
 assert.equal(result.activeByTrack.stocks,undefined);assert.equal(result.archivedExamSessions[3].step,7);
 assert.deepEqual(mergeProgress(null,{schema:1,snapshot:old,modifiedAt:10,sessionTimes:{49:10},examTime:10}).snapshot,result);
});
test('all 200 original lesson and 20 exam achievements survive; all three previous paths become historical',()=>{
 const input={...emptySnapshot(),track:'crypto',group:19,mapTarget:'br-point-199',completed:Object.fromEntries(Array.from({length:200},(_,id)=>[id,{firstTry:id%5}])),passedExams:Object.fromEntries(Array.from({length:20},(_,id)=>[id,{best:8,attempts:1}])),sessions:[session(99),session(149),session(199)],activeId:199,activeByTrack:{stocks:99,etfs:149,crypto:199},exam:exam(19),examSessions:{stocks:exam(9),etfs:exam(14),crypto:exam(19)}};
 const restored=mergeProgress(null,JSON.parse(JSON.stringify(makeEnvelope(input)))).snapshot;
 assert.equal(Object.keys(restored.completed).length,200);assert.equal(Object.keys(restored.passedExams).length,20);assert.equal(restored.track,'crypto');assert.equal(restored.mapTarget,null);assert.equal(restored.exam,null);
 assert.deepEqual(Object.keys(restored.examSessions),[]);assert.equal(restored.archivedExamSessions[9].id,9);assert.equal(restored.archivedExamSessions[14].id,14);assert.equal(restored.archivedExamSessions[19].id,19);assert.equal(restored.sessions.length,3);
});
test('concurrent drafts and exams in different paths merge independently',()=>{
 const base=makeEnvelope({...emptySnapshot(),sessions:[session(450),session(950),session(1150)],activeId:450,activeByTrack:{stocks:450,etfs:950,crypto:1150},exam:exam(45),examSessions:{stocks:exam(45),etfs:exam(95),crypto:exam(115)}},null,100);
 const a=copy(base.snapshot);a.track='etfs';a.group=95;a.activeId=950;a.exam=exam(95,6);a.examSessions.etfs=a.exam;a.sessions.find(s=>s[0]===950)[1]=5;
 const b=copy(base.snapshot);b.track='crypto';b.group=115;b.activeId=1150;b.exam=exam(115,8);b.examSessions.crypto=b.exam;b.sessions.find(s=>s[0]===1150)[1]=7;
 const merged=mergeProgress(makeEnvelope(a,base,200),makeEnvelope(b,base,300));
 assert.equal(merged.snapshot.sessions.find(s=>s[0]===950)[1],5);assert.equal(merged.snapshot.sessions.find(s=>s[0]===1150)[1],7);
 assert.equal(merged.snapshot.examSessions.etfs.step,6);assert.equal(merged.snapshot.examSessions.crypto.step,8);assert.equal(merged.snapshot.examSessions.stocks.step,1);assert.equal(merged.snapshot.track,'crypto');assert.equal(merged.snapshot.exam.id,115);
});
test('clearing one path exam never erases another and a stale draft cannot resurrect it',()=>{
 const base=makeEnvelope({...emptySnapshot(),exam:exam(45),examSessions:{stocks:exam(45),etfs:exam(95)}},null,100);
 const p=copy(base.snapshot);p.exam=null;
 const merged=mergeProgress(base,makeEnvelope(p,base,200));
 assert.equal(merged.snapshot.exam,null);assert.equal(merged.snapshot.examSessions.etfs.id,95);assert.equal(merged.examTimes.stocks,200);
 assert.equal(mergeProgress(merged,base).snapshot.examSessions.stocks,undefined);
});
test('path bounds reject crossed navigation, invalid IDs and mismatched exam owners',()=>{
 const clean=sanitizeSnapshot({...emptySnapshot(),track:'etfs',group:115,mapTarget:'br-point-1159',activeId:1150,activeByTrack:{etfs:1150},sessions:[session(1150),session(1750)],exam:exam(115),examSessions:{etfs:exam(115),crypto:exam(115)}});
 assert.equal(clean.group,95);assert.equal(clean.mapTarget,null);assert.equal(clean.activeId,null);assert.equal(clean.exam,null);assert.equal(clean.examSessions.etfs,undefined);assert.equal(clean.examSessions.crypto.id,115);assert.equal(clean.sessions.length,1);
});

test('four-digit current map targets roundtrip while invalid and cross-path targets are removed',()=>{
 for(const [track,targets] of [['etfs',[999,1000,1149]],['crypto',[1150,1300,1449]],['technical',[1450,1600,1749]]])for(const lesson of targets){
  const result=mergeProgress(null,makeEnvelope({...emptySnapshot(),track,group:Math.floor(lesson/10),mapTarget:'br-point-'+lesson})).snapshot;
  assert.equal(result.mapTarget,'br-point-'+lesson);
 }
 for(const target of ['br-point-1450','br-point-001150','br-point-1150.5','br-point-99999999','br-point-1149'])assert.equal(sanitizeSnapshot({...emptySnapshot(),track:'crypto',mapTarget:target}).mapTarget,null);
});

test('technical drafts and exams merge independently from all existing paths',()=>{
 const base=makeEnvelope({...emptySnapshot(),sessions:[session(450),session(1450)],activeId:450,activeByTrack:{stocks:450,technical:1450},exam:exam(45),examSessions:{stocks:exam(45),technical:exam(145)}},null,100);
 const a=copy(base.snapshot);a.track='technical';a.group=145;a.activeId=1450;a.exam=exam(145,6);a.examSessions.technical=a.exam;a.sessions.find(s=>s[0]===1450)[1]=5;
 const b=copy(base.snapshot);b.sessions.find(s=>s[0]===450)[1]=7;b.exam=exam(45,8);b.examSessions.stocks=b.exam;
 const merged=mergeProgress(makeEnvelope(a,base,200),makeEnvelope(b,base,300));
 assert.equal(merged.snapshot.sessions.find(s=>s[0]===1450)[1],5);assert.equal(merged.snapshot.sessions.find(s=>s[0]===450)[1],7);
 assert.equal(merged.snapshot.examSessions.technical.step,6);assert.equal(merged.snapshot.examSessions.stocks.step,8);
 const cleared=copy(merged.snapshot);cleared.track='technical';cleared.group=145;cleared.exam=null;delete cleared.examSessions.technical;
 const afterClear=mergeProgress(merged,makeEnvelope(cleared,merged,400));
 assert.equal(afterClear.snapshot.examSessions.technical,undefined);assert.equal(afterClear.snapshot.examSessions.stocks.step,8);
 assert.equal(mergeProgress(afterClear,base).snapshot.examSessions.technical,undefined,'A stale technical exam must not reappear after being cleared');
});
