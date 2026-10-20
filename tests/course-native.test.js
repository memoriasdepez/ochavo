import {fullCourseTestData} from './course-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptySnapshot} from '../src/progress.js';
import {trackForLesson,TRACKS as CURRENT_TRACKS,LEGACY_TRACKS} from '../src/tracks.js';

const source=readFileSync(new URL('../src/course.js',import.meta.url),'utf8');
const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
// Compatibility coverage for the previous course. Current 500-lesson coverage lives
// in stocks-revision.test.js and path-loading.test.js.
const TRACKS=[LEGACY_TRACKS[0],LEGACY_TRACKS[1],LEGACY_TRACKS[2]];
const data=fullCourseTestData({previousRevision:true});
const lessons=JSON.parse(data['br-invest-lessons']);
const exams=JSON.parse(data['br-exams']);
const copy=value=>JSON.parse(JSON.stringify(value));

// The engine renders real course content and handles real clicks; only DOM layout is stubbed.
function mount(snapshot=emptySnapshot(),skippedWorldIds=null,laboratory=null){
  const handlers={},nodes=new Map();
  let number=null,saved=null;
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){}});
    return nodes.get(selector);
  };
  const main=node('#br-main');
  main.querySelector=selector=>selector==='#br-number'?number:selector==='#br-viz-output'?null:node(selector);
  main.querySelectorAll=()=>[];
  const root={querySelector:node,querySelectorAll:()=>[],contains:()=>true,addEventListener:(type,handler)=>{handlers[type]=handler;}};
  const window={virutaAccess:{canLearn:()=>true},broteStore:{getSnapshot:()=>copy(snapshot),save:p=>{saved=copy(p);return true;}}};
  if(laboratory)window.OchavoLaboratory=laboratory;
  if(skippedWorldIds)window.virutaGame={getView:()=>({skippedWorldIds,canPlay:true})};
  vm.runInNewContext(source,{window,document:{getElementById:id=>id==='brote-preview'?root:{textContent:data[id]}},TextEncoder,requestAnimationFrame:callback=>callback()});
  return {course:window.BroteCourse,main,get saved(){return saved;},setNumber:value=>{number=value===null?null:{value};},click(dataset){
    const button={dataset,disabled:false,closest(){return this;},hasAttribute:attribute=>Object.hasOwn(dataset,attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))};
    handlers.click({target:button});
  }};
}

function selectTrack(app,id){
  if(app.main.dataset.view!=='map')app.click({nav:'map'});
  app.click({track:id});
}
function openLesson(app,id){
  if(app.main.dataset.view!=='map')app.click({nav:'map'});
  if(!app.main.innerHTML.includes(`data-detail="${id}"`))app.click({group:String(Math.floor(id/10))});
  assert.ok(app.main.innerHTML.includes(`data-detail="${id}"`));
  app.click({detail:String(id)});
  if(app.main.dataset.view==='detail'){
    assert.ok(app.main.innerHTML.includes(`data-start="${id}"`));
    app.click({start:String(id)});
  }
  assert.equal(app.main.dataset.view,'lesson');
}
function openExam(app,id){
  if(app.main.dataset.view!=='map')app.click({nav:'map'});
  if(!app.main.innerHTML.includes(`data-exam-detail="${id}"`))app.click({group:String(id)});
  assert.ok(app.main.innerHTML.includes(`data-exam-detail="${id}"`));
  app.click({examDetail:String(id)});
  assert.ok(app.main.innerHTML.includes(`data-exam-start="${id}"`));
  app.click({examStart:String(id)});
}

// Execute the actual main-store wiring rather than duplicate its restore policy.
// Firebase, account UI and native plugins are not needed for a course selection.
function accountProgressCallbacks(course){
  let callbacks;
  const start=mainSource.indexOf('store=createProgressStore({');
  const end=mainSource.indexOf('window.broteStore=store;',start);
  assert.ok(start>=0&&end>start);
  vm.runInNewContext(mainSource.slice(start,end),{
    window:{BroteCourse:course},cloud:null,progressStorage:{},nativeOnline:null,
    navigator:{onLine:true},view:{},messages:{},update(){},
    createProgressStore:options=>{callbacks=options;return {};},
  });
  return callbacks;
}

test('sign-in and a recovered session open Aprende while preserving the selected path and resumable work',()=>{
  const lesson=lessons[100],drafts=lesson.steps.map(()=>({}));drafts[1]={c:1};
  const exam={id:0,step:2,order:[9,8,7,6,5,4,3,2,1,0],drafts:exams[0].steps.map(()=>({c:1})),submitted:false};
  const snapshot={...emptySnapshot(),page:'profile',track:'etfs',group:10,introSkipped:true,
    completed:{0:{firstTry:3}},sessions:[[100,1,drafts]],activeId:100,activeByTrack:{etfs:100},
    examSessions:{stocks:exam},mapTarget:'br-point-100'};
  const original=copy(snapshot),app=mount(),callbacks=accountProgressCallbacks(app.course);
  callbacks.onRestore(snapshot);
  assert.equal(app.main.dataset.view,'map');assert.match(app.main.innerHTML,/data-detail="100"/);
  assert.deepEqual(snapshot,original,'opening Aprende does not rewrite stored navigation or progress');
  openLesson(app,100);
  assert.equal(app.saved.track,'etfs');assert.equal(app.saved.sessions[0][1],1);
  assert.equal(app.saved.sessions[0][2][1].c,1);assert.equal(app.saved.examSessions.stocks.step,2);
  assert.equal(app.saved.completed[0].firstTry,3);assert.equal(app.saved.introSkipped,true);
  callbacks.onRestore({...snapshot,page:'lab'});
  assert.equal(app.main.dataset.view,'map');openLesson(app,100);
  assert.equal(app.saved.sessions[0][2][1].c,1);
});

test('background synchronization keeps an active lesson and its uncommitted answer instead of applying the login landing page',()=>{
  const lesson=lessons.find(l=>l.steps.some(s=>s.type==='numeric'));
  const step=lesson.steps.findIndex(s=>s.type==='numeric'),drafts=lesson.steps.map(()=>({}));
  drafts[step]={n:'17'};
  const snapshot={...emptySnapshot(),page:'profile',completed:Object.fromEntries(Array.from({length:lesson.id},(_,id)=>[id,{firstTry:3}])),sessions:[[lesson.id,step,drafts]],activeId:lesson.id};
  const app=mount(),callbacks=accountProgressCallbacks(app.course);
  callbacks.onRestore(snapshot);assert.equal(app.main.dataset.view,'map');
  openLesson(app,lesson.id);app.setNumber('99');
  const incoming=copy(snapshot);incoming.sessions[0][2][step]={n:'45'};
  callbacks.onMerge(incoming);assert.equal(app.main.dataset.view,'lesson');app.course.flushInputs();
  assert.equal(app.saved.sessions[0][1],step);assert.equal(app.saved.sessions[0][2][step].n,'99');
});

test('idle path immediately adopts same-track drafts received from another device',()=>{
  const app=mount(),drafts=lessons[0].steps.map(()=>({}));drafts[1]={c:1};
  const remote={...emptySnapshot(),sessions:[[0,1,drafts]],activeId:0,activeByTrack:{stocks:0}};
  app.course.mergeAchievements(remote);openLesson(app,0);
  assert.equal(app.saved.sessions[0][1],1);assert.equal(app.saved.sessions[0][2][1].c,1);
  assert.equal(app.course.reportContext().stepIndex,1);
});
test('a remote same-track draft never replaces the answer currently being edited',()=>{
  const l=lessons.find(l=>l.steps.some(s=>s.type==='numeric')),step=l.steps.findIndex(s=>s.type==='numeric');
  const drafts=l.steps.map(()=>({}));drafts[step]={n:'17'};
  const initial={...emptySnapshot(),completed:Object.fromEntries(Array.from({length:l.id},(_,i)=>[i,{firstTry:3}])),sessions:[[l.id,step,drafts]],activeId:l.id};
  const app=mount(initial);openLesson(app,l.id);app.setNumber('99');
  const remote=copy(initial);remote.sessions[0][2][step]={n:'45'};app.course.mergeAchievements(remote);app.course.flushInputs();
  assert.equal(app.saved.sessions[0][2][step].n,'99');
});
test('feedback identifies the displayed question and shuffled source without including answers',()=>{
  const initial={...emptySnapshot(),completed:Object.fromEntries(Array.from({length:10},(_,i)=>[i,{firstTry:3}])),exam:{id:0,step:2,order:[9,8,7,6,5,4,3,2,1,0],drafts:exams[0].steps.map(()=>({c:1})),submitted:false}};
  const app=mount(initial);openExam(app,0);const c=app.course.reportContext();
  assert.equal(c.worldId,0);assert.equal(c.stepIndex,2);assert.equal(c.questionIndex,7);assert.equal(c.lessonId,-1);assert(!Object.hasOwn(c,'drafts'));assert(!Object.hasOwn(c,'answers'));assert(app.main.innerHTML.includes('data-report-problem'));
});

test('Android back captures an uncommitted number and retains the exact lesson step and other drafts',()=>{
  const lesson=lessons.find(l=>l.steps.some(s=>s.type==='numeric'));
  const step=lesson.steps.findIndex(s=>s.type==='numeric');
  const drafts=lesson.steps.map(()=>({}));drafts[0]={p:1};drafts[step]={n:'17'};
  const initial={...emptySnapshot(),completed:Object.fromEntries(Array.from({length:lesson.id},(_,id)=>[id,{firstTry:4}])),sessions:[[lesson.id,step,drafts]],activeId:lesson.id};
  const app=mount(initial);openLesson(app,lesson.id);
  assert.equal(app.main.dataset.view,'lesson');
  app.setNumber('1.234,5');
  assert.equal(app.course.backToPath(),true);
  assert.equal(app.main.dataset.view,'map');
  assert.equal(app.saved.sessions[0][1],step);
  assert.equal(app.saved.sessions[0][2][step].n,'1.234,5');
  assert.deepEqual(app.saved.sessions[0][2][0],{p:1});
  assert.equal(app.saved.activeId,lesson.id);
  assert.equal(app.saved.mapTarget,'br-point-'+lesson.id);
  openLesson(app,lesson.id);
  assert.equal(app.main.dataset.view,'lesson');
  assert.equal(app.saved.sessions[0][1],step);
  assert.equal(app.saved.sessions[0][2][step].n,'1.234,5');
});

test('Android back preserves a pending exam, shuffled order and answers without submitting it',()=>{
  const exam=exams[0],index=exam.steps.findIndex(s=>s.type==='numeric');
  assert.ok(index>=0);
  const order=[9,8,7,6,5,4,3,2,1,0],drafts=exam.steps.map(()=>({}));drafts[index]={n:'2'};
  const initial={...emptySnapshot(),completed:Object.fromEntries(Array.from({length:10},(_,id)=>[id,{firstTry:3}])),exam:{id:0,step:order.indexOf(index),order,drafts,submitted:false}};
  const app=mount(initial);openExam(app,0);app.setNumber('28,75');
  assert.equal(app.main.dataset.view,'exam');
  assert.equal(app.course.backToPath(),true);
  assert.equal(app.main.dataset.view,'map');
  assert.deepEqual(app.saved.exam.order,order);
  assert.equal(app.saved.exam.step,order.indexOf(index));
  assert.equal(app.saved.exam.drafts[index].n,'28,75');
  assert.equal(app.saved.exam.submitted,false);
  assert.deepEqual(app.saved.passedExams,{});
  assert.equal(app.saved.mapTarget,'br-exam-0');
  openExam(app,0);
  assert.equal(app.saved.exam.drafts[index].n,'28,75');
});

test('library, laboratory and their reading pages return to the path; the path reports the root',()=>{
  const app=mount();
  app.click({nav:'library'});assert.equal(app.main.dataset.view,'map');
  for(const page of ['lab','sources','glossary']){
    app.click({nav:page});assert.equal(app.main.dataset.view,page);
    assert.equal(app.course.backToPath(),true);assert.equal(app.main.dataset.view,'map');
  }
  assert.equal(app.course.backToPath(),false);
  assert.equal(app.saved.page,'map');
});

test('native back closes a laboratory calculator before leaving for Aprende',()=>{
  let tool=false,resets=0,renders=0;
  const laboratory={render(){renders++;},reset(){resets++;tool=false;},back(){if(!tool)return false;tool=false;return true;}};
  const app=mount(emptySnapshot(),null,laboratory);
  app.click({nav:'lab'});assert.equal(resets,1);assert.equal(renders,1);
  tool=true;
  assert.equal(app.course.backToPath(),true);
  assert.equal(app.main.dataset.view,'lab');assert.equal(tool,false);
  assert.equal(app.course.backToPath(),true);assert.equal(app.main.dataset.view,'map');
  app.click({nav:'lab'});assert.equal(resets,2);assert.equal(renders,2);
});

test('each path starts unlocked and retains its own lesson draft when switching and reopening',()=>{
  assert.equal(lessons.length,450,'Full curriculum must be generated before testing');
  const drafts=Array.from({length:8},()=>({}));drafts[1]={c:1};
  const app=mount({...emptySnapshot(),sessions:[[0,1,drafts]],activeId:0});
  selectTrack(app,'etfs');assert.equal(app.saved.track,'etfs');assert.match(app.main.innerHTML,/data-detail="100"/);
  app.click({detail:'101'});assert.equal(app.main.dataset.view,'detail');assert.doesNotMatch(app.main.innerHTML,/data-start="101"/);
  openLesson(app,100);assert.equal(app.main.dataset.view,'lesson');app.click({next:''});app.click({option:'1'});
  selectTrack(app,'crypto');assert.equal(app.saved.track,'crypto');assert.match(app.main.innerHTML,/data-detail="150"/);
  openLesson(app,150);app.click({next:''});app.click({option:'0'});
  selectTrack(app,'stocks');assert.equal(app.saved.activeId,0);assert.equal(app.saved.sessions.find(s=>s[0]===0)[2][1].c,1);
  assert.equal(app.saved.sessions.find(s=>s[0]===100)[2][1].c,1);assert.equal(app.saved.sessions.find(s=>s[0]===150)[2][1].c,0);
  const reopened=mount(app.saved);selectTrack(reopened,'etfs');assert.equal(reopened.saved.activeId,100);openLesson(reopened,100);assert.equal(reopened.saved.sessions.find(s=>s[0]===100)[1],1);
  assert.match(reopened.main.innerHTML,/ETFs · capítulo 1/);assert.doesNotMatch(reopened.main.innerHTML,/capítulo 101/);
});

test('exams in separate paths remain resumable without replacing one another',()=>{
  const pending=(id,step)=>({id,step,order:[0,1,2,3,4,5,6,7,8,9],drafts:Array.from({length:10},()=>({c:1})),submitted:false});
  const first=pending(0,2),second=pending(10,5);
  const completed=Object.fromEntries([...Array.from({length:10},(_,i)=>i),...Array.from({length:10},(_,i)=>100+i)].map(id=>[id,{firstTry:3}]));
  const app=mount({...emptySnapshot(),completed,exam:first,examSessions:{stocks:first,etfs:second}});
  selectTrack(app,'etfs');assert.equal(app.saved.exam.id,10);assert.equal(app.saved.exam.step,5);
  openExam(app,10);assert.equal(app.main.dataset.view,'exam');assert.match(app.main.innerHTML,/Examen 1 · ETFs/);
  selectTrack(app,'crypto');assert.equal(app.saved.exam,null);assert.equal(app.saved.examSessions.etfs.step,5);
  selectTrack(app,'stocks');assert.equal(app.saved.exam.id,0);assert.equal(app.saved.exam.step,2);assert.equal(app.saved.examSessions.etfs.id,10);
});

test('stocks checkpoint 50 gates point 51 but does not gate the other paths',()=>{
  const completed=Object.fromEntries(Array.from({length:50},(_,id)=>[id,{firstTry:3}]));
  const passedExams=Object.fromEntries(Array.from({length:4},(_,id)=>[id,{best:8,attempts:1,passed:true}]));
  const blocked=mount({...emptySnapshot(),completed,passedExams});blocked.click({detail:'50'});assert.equal(blocked.main.dataset.view,'detail');assert.doesNotMatch(blocked.main.innerHTML,/data-start="50"/);
  selectTrack(blocked,'etfs');openLesson(blocked,100);assert.equal(blocked.main.dataset.view,'lesson');
  const open=mount({...emptySnapshot(),completed,passedExams:{...passedExams,4:{best:8,attempts:1,passed:true}}});openLesson(open,50);assert.equal(open.main.dataset.view,'lesson');assert.match(open.main.innerHTML,/capítulo 51/);
});

test('library is scoped to the chosen path and the last exam never jumps to another path',()=>{
  const app=mount();selectTrack(app,'etfs');app.click({nav:'library'});assert.match(app.main.innerHTML,/data-detail="100"/);assert.doesNotMatch(app.main.innerHTML,/data-detail="0"/);
  const last={id:44,step:9,order:[0,1,2,3,4,5,6,7,8,9],drafts:Array.from({length:10},()=>({})),submitted:true,score:8};
  const end=mount({...emptySnapshot(),track:'crypto',group:44,exam:last,examSessions:{crypto:last}});end.click({examDetail:'44'});assert.match(end.main.innerHTML,/data-exam-result/);end.click({examResult:''});assert.equal(end.main.dataset.view,'exam-result');assert.doesNotMatch(end.main.innerHTML,/data-group=/);assert.match(end.main.innerHTML,/Examen 10/);assert.match(end.main.innerHTML,/punto 100/);
});

for(const [track,oldStart,oldCount,oldWorldStart,bridgeWorld,nextWorld,nextId,number] of [
  ['stocks',0,100,0,9,20,200,101],['etfs',100,50,10,14,35,350,51],['crypto',150,50,15,19,40,400,51]
])test(`${track}: the old final exam unlocks its own extension and library in narrative order`,()=>{
  const completed=Object.fromEntries(Array.from({length:oldCount},(_,i)=>[oldStart+i,{firstTry:4}]));
  const passedExams=Object.fromEntries(Array.from({length:oldCount/10-1},(_,i)=>[oldWorldStart+i,{best:8,attempts:1,passed:true}]));
  const initial={...emptySnapshot(),track,group:bridgeWorld,completed,passedExams};
  const blocked=mount(initial);blocked.click({detail:String(nextId)});
  assert.doesNotMatch(blocked.main.innerHTML,new RegExp(`data-start="${nextId}"`));
  assert.match(blocked.main.innerHTML,new RegExp(`Aprueba el examen ${oldCount/10}`));
  const exam={id:bridgeWorld,step:9,order:[0,1,2,3,4,5,6,7,8,9],drafts:Array.from({length:10},()=>({})),submitted:true,score:8};
  const app=mount({...initial,passedExams:{...passedExams,[bridgeWorld]:{best:8,attempts:1,passed:true}},exam,examSessions:{[track]:exam}});
  app.click({examDetail:String(bridgeWorld)});app.click({examResult:''});
  assert.match(app.main.innerHTML,new RegExp(`data-group="${nextWorld}"`));
  app.click({group:String(nextWorld)});openLesson(app,nextId);
  assert.match(app.main.innerHTML,new RegExp(`capítulo ${number}`));
  app.click({nav:'library'});app.click({libraryGroup:String(nextWorld)});
  assert.match(app.main.innerHTML,new RegExp(`data-detail="${nextId}"`));
});

test('every added lesson renders all explanations and exercises and records a completed review',()=>{
  const completed=Object.fromEntries(lessons.map(l=>[l.id,{firstTry:0}]));
  const passedExams=Object.fromEntries(exams.map(e=>[e.id,{best:8,attempts:1,passed:true}]));
  const packed=s=>s.type==='choice'?{c:s.answer}:s.type==='multi'?{s:s.answers}:s.type==='numeric'?{n:String(s.answer).replace('.',',')}:s.type==='order'?{o:s.answer}:s.type==='match'?{m:Object.fromEntries(s.pairs.map((_,i)=>[i,String(i)]))}:{};
  for(const l of lessons.slice(200)){
    const track=trackForLesson(l.id).id;
    const app=mount({...emptySnapshot(),track,group:Math.floor(l.id/10),completed,passedExams,sessions:[[l.id,0,l.steps.map(packed)]],activeId:l.id,activeByTrack:{[track]:l.id}});
    openLesson(app,l.id);
    for(const [i,s] of l.steps.entries()){
      assert.equal(app.main.dataset.view,'lesson',`Lesson ${l.id} step ${i}`);
      if(s.explore)for(let option=0;option<s.explore.options.length;option++)app.click({explore:String(option)});
      if(s.type==='numeric')app.setNumber(String(s.answer).replace('.',','));
      if(s.type!=='learn'){
        app.click({check:''});
        assert.equal(app.saved.sessions.find(x=>x[0]===l.id)[2][i].p,1,`Answer not accepted: ${l.id}/${i}`);
      }
      app.click({next:''});
    }
    assert.equal(app.main.dataset.view,'success',`Lesson ${l.id} result`);
    assert.equal(app.saved.completed[l.id].firstTry,4);
    assert.equal(app.saved.sessions.some(x=>x[0]===l.id),false);
  }
});

test('each path initially shows two worlds and every world retains its own ordered lesson IDs',()=>{
  for(const track of TRACKS){
    const app=mount({...emptySnapshot(),track:track.id,group:track.groupStart});
    const ids=[...app.main.innerHTML.matchAll(/data-detail="(\d+)"/g)].map(x=>+x[1]);
    assert.deepEqual(ids,track.lessonIds.slice(0,20));
    const worlds=[...app.main.innerHTML.matchAll(/data-exam-detail="(\d+)"/g)].map(x=>+x[1]);
    assert.deepEqual(worlds,track.groupIds.slice(0,2));
    app.click({nav:'library'});
    assert.equal(app.main.dataset.view,'map');
    assert.deepEqual([...app.main.innerHTML.matchAll(/data-exam-detail="(\d+)"/g)].map(x=>+x[1]),track.groupIds.slice(0,2));
    for(const world of track.groupIds){
      app.click({group:String(world)});
      const section=app.main.innerHTML.split(`id="br-world-${world}"`)[1].split('</section>')[0];
      assert.deepEqual([...section.matchAll(/data-detail="(\d+)"/g)].map(x=>+x[1]),track.lessonIds.filter(id=>Math.floor(id/10)===world));
    }
  }
});

test('all added exams accept their authored answers and continue within the same path',()=>{
  const completed=Object.fromEntries(lessons.map(l=>[l.id,{firstTry:4}]));
  const passedExams=Object.fromEntries(exams.map(e=>[e.id,{best:8,attempts:1,passed:true}]));
  const packed=s=>s.type==='choice'?{c:s.answer}:s.type==='multi'?{s:s.answers}:s.type==='numeric'?{n:String(s.answer).replace('.',',')}:s.type==='order'?{o:s.answer}:{m:Object.fromEntries(s.pairs.map((_,i)=>[i,String(i)]))};
  for(const e of exams.slice(20)){
    const track=TRACKS.find(t=>t.groupIds.includes(e.id));
    const exam={id:e.id,step:0,order:e.steps.map((_,i)=>i),drafts:e.steps.map(packed),submitted:false};
    const app=mount({...emptySnapshot(),track:track.id,group:e.id,completed,passedExams,exam,examSessions:{[track.id]:exam}});
    openExam(app,e.id);
    for(const s of e.steps){
      assert.equal(app.main.dataset.view,'exam');
      app.setNumber(s.type==='numeric'?String(s.answer).replace('.',','):null);
      app.click({examNext:''});
    }
    assert.equal(app.main.dataset.view,'exam-result',`Exam ${e.id} result`);
    assert.equal(app.saved.exam.score,10,`Exam ${e.id} answers`);
    assert.equal(app.saved.passedExams[e.id].best,10);
    const next=track.groupIds[track.groupIds.indexOf(e.id)+1];
    if(next===undefined)assert.doesNotMatch(app.main.innerHTML,/data-group=/);
    else assert.match(app.main.innerHTML,new RegExp(`data-group="${next}"`));
  }
});

for(const t of TRACKS)test(t.id+': a paid skip opens the next first lesson without faking completed work',()=>{
 const first=t.groupIds[0],second=t.groupIds[1],app=mount(emptySnapshot(),[first]);selectTrack(app,t.id);
 assert.ok(app.main.innerHTML.includes('mundo saltado'));
 app.click({detail:String(second*10)});assert.ok(app.main.innerHTML.includes('data-start="'+second*10+'"'));
 app.click({nav:'map'});app.click({examDetail:String(first)});
 assert.ok(!app.main.innerHTML.includes('data-exam-start="'+first+'"'));
 app.click({nav:'map'});app.click({detail:String(t.lessonIds[0])});assert.ok(app.main.innerHTML.includes('data-start="'+t.lessonIds[0]+'"'));
 assert.deepEqual(app.saved?.completed||{},{});assert.deepEqual(app.saved?.passedExams||{},{});
});
test('skip can open the existing stocks extension after stable world ID 9',()=>{
 const app=mount(emptySnapshot(),Array.from({length:10},(_,i)=>i));
 app.click({detail:'200'});assert.ok(app.main.innerHTML.includes('data-start="200"'));
});
