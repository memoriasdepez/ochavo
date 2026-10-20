import {fullCourseTestData} from './course-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {emptySnapshot} from '../src/progress.js';
import * as exerciseFormats from '../src/exercise-formats.js';

const source=readFileSync(new URL('../src/course.js',import.meta.url),'utf8');
// Cached previous-revision clients retain their exercise and wallet contracts.
// The current revision is exercised separately in stocks-revision.test.js.
const data=fullCourseTestData({previousRevision:true});
const lessons=JSON.parse(data['br-invest-lessons']),exams=JSON.parse(data['br-exams']);
const copy=value=>JSON.parse(JSON.stringify(value));
const settle=()=>new Promise(resolve=>setImmediate(resolve));

// Exercise the actual engine and click handlers. DOM layout and the two durable stores are adapters.
function mount(snapshot=emptySnapshot(),{admitted=true,accessHelper=true,useFormats=false}={}){
  const handlers={},nodes=new Map(),calls=[],afterAction=[];
  let saved=null,attempted=null,saveOK=true,flush=async()=>true,answer=async()=>{},exam=async()=>{},loadCase=async()=>{},nextId=0;
  const node=selector=>{
    if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},insertAdjacentHTML(_position,value){this.innerHTML+=value;}});
    return nodes.get(selector);
  };
  const main=node('#br-main');
  main.querySelector=selector=>['#br-number','#br-viz-output'].includes(selector)?null:node(selector);
  main.querySelectorAll=()=>[];
  const root={inert:false,querySelector:node,querySelectorAll:()=>[],contains:()=>true,addEventListener:(type,handler)=>{handlers[type]=handler;}};
  const window={...(accessHelper?{virutaAccess:{canLearn:()=>admitted}}:{}),
    ...(useFormats?{OchavoExercises:exerciseFormats}:{}),
    broteStore:{getSnapshot:()=>copy(snapshot),save:p=>{attempted=copy(p);if(saveOK)saved=copy(p);return saveOK;},flushLocal:()=>flush()},
    virutaAttemptId:()=>`10000000-0000-4000-8000-${String(++nextId).padStart(12,'0')}`,
    virutaGame:{getView:()=>({canPlay:true,canSpend:true,pending:false,premium:true,unlockedCases:[]}),
      answer:async command=>{calls.push({kind:'answer',...copy(command)});await answer(command);},
      gradeExam:async command=>{calls.push({kind:'exam',...copy(command)});await exam(command);}},
    virutaCaseAccess:{load:metadata=>{calls.push({kind:'case',id:metadata.id});return loadCase(metadata);}},
    virutaSocial:{update(){},render(){},lives(){throw Error('Unexpected lives dialog');}},
    virutaAfterAction:()=>afterAction.push(window.BroteCourse.isBusy()),
  };
  vm.runInNewContext(source,{window,document:{getElementById:id=>id==='brote-preview'?root:data[id]?{textContent:data[id]}:null},TextEncoder,requestAnimationFrame:callback=>callback()});
  return {course:window.BroteCourse,main,root,calls,afterAction,node,window,
    get saved(){return saved;},get attempted(){return attempted;},
    set saveOK(value){saveOK=value;},set flush(value){flush=value;},set answer(value){answer=value;},set exam(value){exam=value;},set loadCase(value){loadCase=value;},
    set admitted(value){admitted=value;},event(type,event){handlers[type](event);},
    click(dataset){const button={dataset,disabled:false,closest(){return this;},hasAttribute:attribute=>Object.hasOwn(dataset,attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))};handlers.click({target:button});},
  };
}

test('free introductory shortcut opens point 7 with no game command, reward, completed lesson or passed exam',async()=>{
  const app=mount();assert.match(app.main.innerHTML,/Estas seis lecciones/);assert.match(app.main.innerHTML,/data-skip-intro/);
  app.click({skipIntro:''});await settle();
  assert.equal(app.saved.introSkipped,true);assert.equal(app.saved.mapTarget,'br-point-6');assert.deepEqual(app.saved.completed,{});assert.deepEqual(app.saved.passedExams,{});assert.deepEqual(app.calls,[]);
  assert.doesNotMatch(app.main.innerHTML,/data-skip-intro/);assert.match(app.main.innerHTML,/6 saltadas/);
  openLesson(app,6);assert.equal(app.course.reportContext().lessonId,6);
  app.click({exit:''});openLesson(app,3);assert.equal(app.course.reportContext().lessonId,3);
  app.click({exit:''});app.click({detail:'7'});assert.doesNotMatch(app.main.innerHTML,/data-start="7"/);
  app.click({nav:'map'});app.click({track:'etfs'});assert.doesNotMatch(app.main.innerHTML,/data-skip-intro/);
  app.click({detail:'101'});assert.doesNotMatch(app.main.innerHTML,/data-start="101"/);
});

test('intro skip is restored per account and remote synchronization preserves a current lesson draft',async()=>{
  const app=mount({...emptySnapshot(),introSkipped:true});openLesson(app,6);const before=JSON.stringify(app.saved.sessions);
  app.course.mergeAchievements({...app.saved,introSkipped:false});assert.equal(app.course.reportContext().lessonId,6);
  app.click({exit:''});assert.equal(app.saved.introSkipped,true);assert.equal(JSON.stringify(app.saved.sessions),before);
  app.course.restore(emptySnapshot());assert.match(app.main.innerHTML,/data-skip-intro/);app.click({detail:'6'});assert.doesNotMatch(app.main.innerHTML,/data-start="6"/);
});

test('first exam still requires points 7–10; skipping never opens world 2 or approves the exam',()=>{
  const intro={...emptySnapshot(),introSkipped:true};
  const app=mount(intro);app.click({examDetail:'0'});assert.doesNotMatch(app.main.innerHTML,/data-exam-start/);assert.match(app.main.innerHTML,/puntos 7–10/);
  app.course.restore({...intro,completed:Object.fromEntries([6,7,8,9].map(id=>[id,{firstTry:4}]))});app.click({examDetail:'0'});assert.match(app.main.innerHTML,/data-exam-start="0"/);
  app.click({nav:'map'});app.click({detail:'10'});assert.doesNotMatch(app.main.innerHTML,/data-start="10"/);
});

for(const failure of ['save','flush'])test(`a failed ${failure} keeps the free skip available and cannot mark the introduction skipped`,async()=>{
  const app=mount();if(failure==='save')app.saveOK=false;else app.flush=async()=>false;
  app.click({skipIntro:''});await settle();assert.match(app.main.innerHTML,/data-skip-intro/);assert.deepEqual(app.calls,[]);
  if(app.saved)assert.equal(app.saved.introSkipped,false);
});

test('a delayed introductory skip cannot unlock lessons for another account',async()=>{
  const app=mount();let finish;app.flush=()=>new Promise(resolve=>finish=resolve);app.click({skipIntro:''});
  app.course.restore(emptySnapshot());finish(true);await settle();assert.match(app.main.innerHTML,/data-skip-intro/);
  app.click({detail:'6'});assert.doesNotMatch(app.main.innerHTML,/data-start="6"/);
});

function openLesson(app,id){
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
  if(!app.main.innerHTML.includes(`data-exam-detail="${id}"`))app.click({group:String(id)});
  assert.ok(app.main.innerHTML.includes(`data-exam-detail="${id}"`));
  app.click({examDetail:String(id)});
  assert.ok(app.main.innerHTML.includes(`data-exam-start="${id}"`));
  app.click({examStart:String(id)});
}

function lessonFixture(){
  const lesson=lessons[0],step=lesson.steps.findIndex(s=>s.type==='choice');assert.ok(step>=0);
  const drafts=lesson.steps.map(()=>({}));drafts[step]={c:(lesson.steps[step].answer+1)%lesson.steps[step].options.length};
  return {lesson,step,snapshot:{...emptySnapshot(),sessions:[[lesson.id,step,drafts]],activeId:lesson.id}};
}
function correctDraft(step){
  if(step.type==='choice')return {c:step.answer};
  if(step.type==='multi')return {s:step.answers};
  if(step.type==='match')return {m:Object.fromEntries(step.pairs.map((_,i)=>[i,String(i)]))};
  if(step.type==='order')return {o:step.answer};
  if(step.type==='numeric')return {n:String(step.answer).replace('.',',')};
  throw Error(`Unexpected exam step: ${step.type}`);
}
function examFixture(){
  const exam=exams[0],drafts=exam.steps.map(correctDraft),attemptId='20000000-0000-4000-8000-000000000001';
  return {...emptySnapshot(),completed:Object.fromEntries(Array.from({length:10},(_,id)=>[id,{firstTry:4}])),exam:{id:exam.id,step:9,order:exam.steps.map((_,i)=>i),drafts,submitted:false,attemptId}};
}

test('mistake motion waits for its debit; correct motion is immediate and never replayed on restore or incomplete answers',async()=>{
 const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot),motion=[];
 app.window.OchavoMotion={answer:good=>motion.push(good)};openLesson(app,lesson.id);
 app.answer=async()=>{throw Error('lost acknowledgement');};app.click({check:''});await settle();assert.deepEqual(motion,[]);
 app.answer=async()=>{};app.click({check:''});await settle();assert.deepEqual(motion,[false]);
 app.course.restore(app.saved);assert.deepEqual(motion,[false]);openLesson(app,lesson.id);
 app.click({option:String(lesson.steps[step].answer)});app.click({check:''});await settle();assert.deepEqual(motion,[false,true]);
 app.click({check:''});await settle();assert.deepEqual(motion,[false,true]);
 const fresh=mount();fresh.window.OchavoMotion={answer:good=>motion.push(good)};openLesson(fresh,0);fresh.click({next:''});fresh.click({check:''});await settle();assert.deepEqual(motion,[false,true]);
});
test('exam celebrations reflect this confirmed attempt, not a previous passing result',async()=>{
 const snapshot=examFixture(),app=mount(snapshot),motion=[];app.window.OchavoMotion={milestone:kind=>motion.push(kind)};
 openExam(app,0);app.exam=async()=>{throw Error('lost result');};app.click({examNext:''});await settle();assert.deepEqual(motion,[]);
 app.exam=async()=>{};app.click({examNext:''});await settle();assert.deepEqual(motion,['exam']);
 app.course.restore(app.saved);assert.deepEqual(motion,['exam']);
 const failed=examFixture();failed.passedExams={0:{passed:true,best:10,attempts:1}};
 failed.exam.drafts=exams[0].steps.map(s=>s.type==='choice'?{c:(s.answer+1)%s.options.length}:correctDraft(s));
 // Make at least three answers incorrect, including any non-choice exercises.
 for(let i=0;i<3;i++){const s=exams[0].steps[i];failed.exam.drafts[i]=s.type==='choice'?{c:(s.answer+1)%s.options.length}:s.type==='numeric'?{n:'999999'}:s.type==='multi'?{s:[(s.answers[0]+1)%s.options.length]}:s.type==='order'?{o:[...s.answer].reverse()}:{m:Object.fromEntries(s.pairs.map((_,j)=>[j,String((j+1)%s.pairs.length)]))};}
 const other=mount(failed);other.window.OchavoMotion={milestone:kind=>motion.push(kind)};openExam(other,0);other.click({examNext:''});await settle();assert.deepEqual(motion,['exam']);
});
test('finishing a point celebrates once and keeps its next button available immediately',async()=>{
 const lesson=lessons[0],drafts=lesson.steps.map(()=>({p:1,a:1})),snapshot={...emptySnapshot(),sessions:[[0,lesson.steps.length-1,drafts]],activeId:0};
 const app=mount(snapshot),motion=[];app.window.OchavoMotion={milestone:kind=>motion.push(kind)};openLesson(app,0);app.click({next:''});await settle();
 assert.deepEqual(motion,['point']);assert.ok(app.saved.completed[0]);assert.ok(app.main.innerHTML.includes('data-start="1"'));
 app.course.restore(app.saved);assert.deepEqual(motion,['point']);
});

test('a new-format answer keeps its durable UUID across a lost acknowledgement and confirms once retried',async()=>{
 const lesson=lessons[0],step=1,a=lesson.steps[step].activity;
 assert.equal(a.kind,'clues');
 const snapshot={...emptySnapshot(),sessions:[[0,step,lesson.steps.map(()=>({}))]],activeId:0};
 const app=mount(snapshot,{useFormats:true});let acknowledged=false;
 app.answer=async()=>{if(!acknowledged)throw Error('Lost acknowledgement');};
 openLesson(app,0);
 assert.ok(app.node('#br-activity').innerHTML.includes('data-exercise-kind="clues"'));
 app.click({ex:'choose',exValue:String(a.answer)});app.click({check:''});await settle();await settle();
 assert.equal(app.calls.length,1);assert.equal(app.calls[0].correct,true);
 const first=app.saved.sessions.find(s=>s[0]===0)[2][step];
 assert.equal(first.v.exerciseKind,'clues');assert.equal(first.q,app.calls[0].attemptId);assert.equal(first.p,undefined);
 acknowledged=true;app.click({check:''});await settle();await settle();
 assert.equal(app.calls.length,2);assert.equal(app.calls[1].attemptId,app.calls[0].attemptId);
 const confirmed=app.saved.sessions.find(s=>s[0]===0)[2][step];assert.equal(confirmed.p,1);assert.equal(confirmed.q,undefined);
});

for(const status of ['error','loading','saving','pending','offline']){
 test(`an unavailable ${status} wallet with five lives opens recovery rather than a life purchase`,async()=>{
  const {lesson,snapshot}=lessonFixture(),app=mount(snapshot);let lives=0,recovery=0;
  app.window.virutaGame.getView=()=>({canPlay:false,canSpend:false,pending:false,premium:false,lives:5,totalLives:5,status});
  app.window.virutaSocial.lives=()=>lives++;app.window.virutaSocial.recovery=()=>recovery++;
  openLesson(app,lesson.id);app.click({check:''});await settle();
  assert.equal(recovery,1);assert.equal(lives,0);assert.equal(app.calls.length,0);
 });
}
test('a confirmed zero balance offers lives but an unavailable zero balance requires recovery',async()=>{
 const {lesson,snapshot}=lessonFixture(),app=mount(snapshot);let lives=0,recovery=0,usable=true;
 app.window.virutaGame.getView=()=>({canPlay:false,canSpend:usable,pending:false,premium:false,lives:0,totalLives:0,status:usable?'saved':'error'});
 app.window.virutaSocial.lives=()=>lives++;app.window.virutaSocial.recovery=()=>recovery++;
 openLesson(app,lesson.id);app.click({check:''});await settle();assert.equal(lives,1);assert.equal(recovery,0);
 usable=false;app.click({check:''});await settle();assert.equal(lives,1);assert.equal(recovery,1);assert.equal(app.calls.length,0);
});
test('starting an exam with an unavailable balance offers session recovery and keeps its saved answers',()=>{
 const snapshot=examFixture(),app=mount(snapshot);let recovery=0;
 app.window.virutaGame.getView=()=>({canPlay:false,canSpend:false,lives:5,totalLives:5,status:'error'});
 app.window.virutaSocial.recovery=()=>recovery++;
 openExam(app,0);assert.equal(recovery,1);assert.equal(app.calls.length,0);
 app.window.virutaGame.getView=()=>({canPlay:true,canSpend:true,pending:false,lives:5,totalLives:5,status:'saved'});
 app.click({examStart:'0'});assert.equal(app.saved.exam.step,9);assert.deepEqual(app.saved.exam.drafts,snapshot.exam.drafts);
});

for(const mode of ['save','flush']){
  test(`a lesson ${mode} failure cannot charge a life and retries the original durable attempt`,async()=>{
    const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot);openLesson(app,lesson.id);
    if(mode==='save')app.saveOK=false;else app.flush=async()=>false;
    app.click({check:''});await settle();
    const first=app.attempted.sessions.find(s=>s[0]===lesson.id)[2][step];
    assert.match(first.q,/^[\da-f-]{36}$/);assert.equal(app.calls.length,0);
    assert.equal(app.course.isBusy(),false);assert.equal(app.root.inert,false);
    assert.match(app.node('#br-feedback').innerHTML,/No hemos descontado vidas/);
    assert.deepEqual(app.afterAction,[false],'Deferred identity processing happens after the busy guard clears');
    app.saveOK=true;app.flush=async()=>true;app.click({check:''});await settle();
    assert.equal(app.calls.length,1);assert.equal(app.calls[0].attemptId,first.q);assert.equal(app.calls[0].correct,false);
    const final=app.saved.sessions.find(s=>s[0]===lesson.id)[2][step];
    assert.equal(final.a,1);assert.equal(final.q,undefined);assert.deepEqual(app.afterAction,[false,false]);
  });

  test(`an exam ${mode} failure preserves its answers and cannot charge before durable submission`,async()=>{
    const initial=examFixture(),app=mount(initial);openExam(app,0);
    if(mode==='save')app.saveOK=false;else app.flush=async()=>false;
    app.click({examNext:''});await settle();
    assert.equal(app.calls.length,0);assert.equal(app.attempted.exam.pendingSubmit,true);assert.equal(app.attempted.exam.submitted,false);
    assert.equal(app.attempted.exam.attemptId,initial.exam.attemptId);assert.deepEqual(app.attempted.exam.drafts,initial.exam.drafts);
    assert.deepEqual(app.attempted.passedExams,{});assert.match(app.node('#br-feedback').innerHTML,/No hemos descontado vidas/);
    app.saveOK=true;app.flush=async()=>true;app.click({examNext:''});await settle();
    assert.equal(app.calls.length,1);assert.equal(app.calls[0].attemptId,initial.exam.attemptId);assert.equal(app.calls[0].wrongCount,0);
    assert.equal(app.saved.exam.submitted,true);assert.equal(app.saved.exam.pendingSubmit,false);assert.equal(app.saved.passedExams[0].attempts,1);
    assert.deepEqual(app.afterAction,[false,false]);
  });
}

test('a lost answer acknowledgement retains its UUID and does not mark the exercise checked until retry confirms it',async()=>{
  const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot);openLesson(app,lesson.id);
  app.answer=async()=>{throw Error('Response lost');};app.click({check:''});await settle();
  const pending=app.saved.sessions.find(s=>s[0]===lesson.id)[2][step];
  assert.ok(pending.q);assert.equal(pending.a,undefined);assert.equal(app.calls.length,1);
  app.answer=async()=>{};app.click({check:''});await settle();
  assert.equal(app.calls.length,2);assert.equal(app.calls[0].attemptId,app.calls[1].attemptId);
  assert.equal(app.saved.sessions.find(s=>s[0]===lesson.id)[2][step].a,1);
});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};

test('a correct answer shows feedback and permits Continue before local flush or server acknowledgement',async()=>{
 const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot),local=deferred(),remote=deferred(),motion=[];
 snapshot.sessions[0][2][step]={c:lesson.steps[step].answer};app.course.restore(snapshot);openLesson(app,lesson.id);
 app.flush=()=>local.promise;app.answer=()=>remote.promise;app.window.OchavoMotion={answer:good=>motion.push(good)};
 app.click({check:''});
 assert.deepEqual(motion,[true]);assert.equal(app.course.isBusy(),false);assert.equal(app.node('.br-phone').inert,false);
 assert.match(app.node('#br-feedback').innerHTML,/Así encajan las piezas/);assert.match(app.node('#br-actions').innerHTML,/data-next/);
 const pending=app.saved.sessions[0][2][step];assert.ok(pending.q);assert.equal(pending.p,undefined);assert.equal(app.calls.length,0);
 app.click({check:''});assert.deepEqual(motion,[true],'duplicate clicks do not replay or submit twice');
 app.click({next:''});assert.equal(app.course.reportContext().stepIndex,step+1);
 local.resolve(true);await settle();assert.equal(app.calls.length,1);assert.equal(app.calls[0].stepId,step);
 remote.resolve();await settle();assert.equal(app.course.reportContext().stepIndex,step+1);
 const confirmed=app.saved.sessions[0][2][step];assert.equal(confirmed.p,1);assert.equal(confirmed.q,undefined);assert.deepEqual(motion,[true]);
});

test('rapid correct answers are confirmed in order without blocking questions or completing the lesson early',async()=>{
 const lesson=lessons[0],steps=lesson.steps.map((s,i)=>s.type!=='learn'?i:-1).filter(i=>i>=0),remote=deferred();
 const drafts=lesson.steps.map(s=>s.type==='learn'?{p:1}:correctDraft(s));
 const app=mount({...emptySnapshot(),sessions:[[lesson.id,steps[0],drafts]],activeId:lesson.id});
 let first=true;app.answer=async()=>{if(first){first=false;await remote.promise;}};openLesson(app,lesson.id);
 for(let i=steps[0];i<lesson.steps.length;i++){
  if(lesson.steps[i].type!=='learn')app.click({check:''});
  assert.equal(app.course.isBusy(),false);app.click({next:''});
 }
 await settle();assert.equal(app.calls.length,1);assert.equal(app.saved.completed[lesson.id],undefined);
 assert.equal(app.main.dataset.view,'lesson');assert.equal(app.course.isBusy(),true,'only final completion waits for rewards still pending');
 remote.resolve();await settle();await settle();
 assert.equal(app.main.dataset.view,'success');assert.ok(app.saved.completed[lesson.id]);
 assert.deepEqual(app.calls.map(c=>c.stepId),steps);assert.equal(new Set(app.calls.map(c=>c.attemptId)).size,steps.length);
});

test('a lost correct acknowledgement preserves the UUID, retry action and unconfirmed progress after navigating',async()=>{
 const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot),remote=deferred();
 snapshot.sessions[0][2][step]={c:lesson.steps[step].answer};app.course.restore(snapshot);openLesson(app,lesson.id);
 app.answer=async()=>{await remote.promise;throw Error('Lost correct acknowledgement');};
 app.click({check:''});app.click({next:''});remote.resolve();await settle();
 const first=app.saved.sessions[0][2][step];assert.ok(first.q);assert.equal(first.p,undefined);
 app.click({prev:''});assert.match(app.node('#br-actions').innerHTML,/Reintentar comprobación/);
 app.answer=async()=>{};app.click({check:''});await settle();
 assert.equal(app.calls.length,2);assert.equal(app.calls[1].attemptId,first.q);assert.equal(app.saved.sessions[0][2][step].p,1);
});

test('late correct confirmation cannot touch a new account or replay its feedback',async()=>{
 const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot),remote=deferred(),motion=[];
 snapshot.sessions[0][2][step]={c:lesson.steps[step].answer};app.course.restore(snapshot);openLesson(app,lesson.id);
 app.answer=()=>remote.promise;app.window.OchavoMotion={answer:good=>motion.push(good)};
 app.click({check:''});await settle();app.course.restore(emptySnapshot());const before=copy(app.saved);
 remote.resolve();await settle();assert.deepEqual(app.saved,before);assert.deepEqual(motion,[true]);
 assert.equal(app.main.dataset.view,'map');assert.equal(app.course.hasPendingAnswers(),false);
});

test('background progress merges preserve a pending correct session after leaving its lesson',async()=>{
 const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot),remote=deferred();
 snapshot.sessions[0][2][step]={c:lesson.steps[step].answer};app.course.restore(snapshot);openLesson(app,lesson.id);
 app.answer=()=>remote.promise;app.click({check:''});app.click({exit:''});await settle();
 app.course.mergeAchievements(emptySnapshot());remote.resolve();await settle();openLesson(app,lesson.id);
 assert.equal(app.saved.sessions.find(s=>s[0]===lesson.id)[2][step].p,1);
});

test('several fast answers survive a lost first acknowledgement and retry in their original order',async()=>{
 const lesson=lessons[0],steps=lesson.steps.map((s,i)=>s.type!=='learn'?i:-1).filter(i=>i>=0);
 const drafts=lesson.steps.map(s=>s.type==='learn'?{p:1}:correctDraft(s)),remote=deferred();
 const app=mount({...emptySnapshot(),sessions:[[lesson.id,steps[0],drafts]],activeId:lesson.id});
 app.answer=async()=>{await remote.promise;throw Error('Lost first acknowledgement');};openLesson(app,lesson.id);
 for(let i=steps[0];i<lesson.steps.length;i++){
  if(lesson.steps[i].type!=='learn')app.click({check:''});
  if(i<lesson.steps.length-1)app.click({next:''});
 }
 remote.resolve();await settle();await settle();assert.equal(app.calls.length,1);
 const pending=app.saved.sessions[0][2];const ids=steps.map(i=>pending[i].q);
 assert.ok(ids.every(Boolean));assert.ok(steps.every(i=>pending[i].p===undefined));
 app.answer=async()=>{};app.click({check:''});app.click({next:''});await settle();await settle();
 assert.equal(app.main.dataset.view,'success');assert.ok(app.saved.completed[lesson.id]);
 assert.deepEqual(app.calls.slice(1).map(c=>c.attemptId),ids);
});

test('reopening a lesson confirms its earlier durable answer before deleting the session at completion',async()=>{
 const lesson=lessons[0],step=lesson.steps.findIndex(s=>s.type!=='learn');
 const drafts=lesson.steps.map(s=>s.type==='learn'?{p:1}:{...correctDraft(s),p:1,a:1});
 const id='30000000-0000-4000-8000-000000000001';drafts[step]={...correctDraft(lesson.steps[step]),q:id};
 const app=mount({...emptySnapshot(),sessions:[[lesson.id,lesson.steps.length-1,drafts]],activeId:lesson.id});openLesson(app,lesson.id);
 app.click({next:''});await settle();assert.equal(app.calls.length,1);assert.equal(app.calls[0].attemptId,id);
 assert.equal(app.calls[0].stepId,step);assert.equal(app.main.dataset.view,'success');assert.ok(app.saved.completed[lesson.id]);
});

const fullCase=JSON.parse(readFileSync(new URL('../src/content/cases-stocks.json',import.meta.url),'utf8')).cases[0];

for(const mode of ['missing','denied','throwing','truthy']){
  test(`course access fails closed with a ${mode} admission helper`,async()=>{
    const app=mount(emptySnapshot(),{admitted:false,accessHelper:mode!=='missing'});
    if(mode==='throwing')app.window.virutaAccess.canLearn=()=>{throw Error('Session unavailable');};
    if(mode==='truthy')app.window.virutaAccess.canLearn=()=> 'yes';
    app.course.refreshAccess();
    assert.equal(app.main.dataset.view,'locked');assert.equal(app.main.innerHTML,'');
    for(const dataset of [{nav:'library'},{nav:'lab'},{lab:'compound'},{track:'etfs'},{detail:'0'},{start:'0'},{examDetail:'0'},{examStart:'0'},{next:''},{check:''}])app.click(dataset);
    assert.equal(await app.course.startCase(fullCase.id),false);
    assert.equal(app.course.backToPath(),false);assert.equal(app.course.flushInputs(),false);
    assert.equal(app.saved,null);assert.deepEqual(app.calls,[]);assert.equal(app.main.dataset.view,'locked');
    assert.equal(app.node('.br-nav').hidden,true);
  });
}

test('an account snapshot hydrates while access is blocked and becomes visible only after admission',()=>{
  const {lesson,step,snapshot}=lessonFixture(),app=mount(emptySnapshot(),{admitted:false});
  app.course.restore(snapshot);assert.equal(app.main.dataset.view,'locked');assert.equal(app.saved,null);
  app.admitted=true;app.course.refreshAccess();openLesson(app,lesson.id);
  assert.equal(app.saved.sessions[0][1],step);assert.deepEqual(app.saved.sessions[0][2][step],snapshot.sessions[0][2][step]);
});

test('logout blocks stale DOM input, Enter, navigation, native back and progress writes immediately',()=>{
  const {lesson,snapshot}=lessonFixture(),app=mount(snapshot);openLesson(app,lesson.id);
  const saved=copy(app.saved);app.admitted=false;
  const target={id:'br-number',value:'999',dataset:{}};
  app.event('input',{target});app.event('change',{target});
  app.event('change',{target:{value:'1',dataset:{match:'0'}}});
  app.event('input',{target:{value:'1000',dataset:{viz:'capital'}}});
  app.event('keydown',{target,key:'Enter',preventDefault(){throw Error('Blocked key must not submit');}});
  app.click({option:'0'});app.click({check:''});app.click({nav:'lab'});
  assert.equal(app.course.backToPath(),false);assert.equal(app.course.flushInputs(),false);
  assert.deepEqual(app.saved,saved);assert.deepEqual(app.calls,[]);assert.equal(app.main.dataset.view,'locked');
});

test('revocation during durable save prevents the answer command from being sent and keeps the gate interactive',async()=>{
  const {lesson,snapshot}=lessonFixture(),app=mount(snapshot),pending=deferred();openLesson(app,lesson.id);
  app.flush=()=>pending.promise;app.click({check:''});
  assert.equal(app.course.isBusy(),true);app.admitted=false;app.course.refreshAccess();pending.resolve(true);await settle();
  assert.deepEqual(app.calls,[]);assert.equal(app.course.isBusy(),false);assert.equal(app.main.dataset.view,'locked');
  assert.equal(app.node('.br-phone').inert,true);assert.equal(app.root.inert,false,'The sibling account gate must remain usable');
});

test('saving status updates cannot enable editing an answer while its durable submission is pending',async()=>{
  const {lesson,snapshot}=lessonFixture(),app=mount(snapshot),pending=deferred();openLesson(app,lesson.id);
  app.flush=()=>pending.promise;app.click({check:''});const before=copy(app.saved);
  const target={id:'br-number',value:'999',dataset:{}};
  app.event('input',{target});app.event('change',{target});
  app.event('change',{target:{value:'1',dataset:{match:'0'}}});
  app.event('keydown',{target,key:'Enter',preventDefault(){throw Error('Busy submission must not submit twice');}});
  app.click({option:'0'});assert.deepEqual(app.saved,before);
  pending.resolve(true);await settle();assert.equal(app.calls.length,1);
});

test('a late answer from account A cannot change account B after restore',async()=>{
  const {lesson,snapshot}=lessonFixture(),app=mount(snapshot),pending=deferred();openLesson(app,lesson.id);
  app.answer=()=>pending.promise;app.click({check:''});await settle();assert.equal(app.calls.length,1);
  app.admitted=false;app.course.refreshAccess();app.course.restore(emptySnapshot());
  app.admitted=true;app.course.refreshAccess();const before=copy(app.saved);
  pending.resolve();await settle();assert.deepEqual(app.saved,before);
  assert.equal(app.course.isBusy(),false);assert.equal(app.main.dataset.view,'map');
  app.course.flushInputs();assert.deepEqual(app.saved.sessions,[]);assert.deepEqual(app.saved.completed,{});
});

test('an exam result from a revoked session cannot complete the newly selected account',async()=>{
  const app=mount(examFixture()),pending=deferred();openExam(app,0);
  app.exam=()=>pending.promise;app.click({examNext:''});await settle();assert.equal(app.calls[0].kind,'exam');
  app.admitted=false;app.course.refreshAccess();app.course.restore(emptySnapshot());app.admitted=true;app.course.refreshAccess();
  const before=copy(app.saved);pending.resolve();await settle();assert.deepEqual(app.saved,before);
  app.course.flushInputs();assert.deepEqual(app.saved.passedExams,{});assert.equal(app.saved.exam,null);
});

test('revoking and readmitting a session without restore still invalidates its pending operation',async()=>{
  const {lesson,step,snapshot}=lessonFixture(),app=mount(snapshot),pending=deferred();openLesson(app,lesson.id);
  app.answer=()=>pending.promise;app.click({check:''});await settle();
  app.admitted=false;app.course.refreshAccess();app.admitted=true;app.course.refreshAccess();pending.resolve();await settle();
  app.course.flushInputs();const draft=app.saved.sessions.find(s=>s[0]===lesson.id)[2][step];
  assert.equal(draft.a,undefined);assert.ok(draft.q,'The old attempt remains recoverable instead of being silently accepted');
});

test('protected case loading cannot cross a session change or make the blocked phone interactive',async()=>{
  const app=mount(),pending=deferred();app.loadCase=()=>pending.promise;
  const loading=app.course.startCase(fullCase.id),rejected=assert.rejects(loading,/sesión ha cambiado/);
  assert.equal(app.calls[0].kind,'case');app.admitted=false;app.course.refreshAccess();app.course.restore(emptySnapshot());
  pending.resolve(fullCase);await rejected;
  assert.equal(app.main.dataset.view,'locked');assert.equal(app.saved,null);assert.equal(app.course.isBusy(),false);
  assert.equal(app.node('.br-phone').inert,true);assert.equal(app.root.inert,false);
  app.admitted=true;app.course.refreshAccess();assert.equal(app.main.dataset.view,'map');
});

test('locking clears an already opened case so readmission requires a fresh protected read',async()=>{
  const app=mount();app.loadCase=async()=>fullCase;assert.equal(await app.course.startCase(fullCase.id),true);
  assert.equal(app.main.dataset.view,'case-lesson');app.admitted=false;app.course.refreshAccess();
  app.admitted=true;app.course.refreshAccess();assert.equal(app.main.dataset.view,'cases');
  assert.equal(await app.course.startCase(fullCase.id),true);assert.equal(app.calls.filter(c=>c.kind==='case').length,2);
});
