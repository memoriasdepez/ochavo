import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {fullCourseTestData} from './course-fixture.js';
import {TRACKS,LESSON_COUNT,WORLD_COUNT} from '../src/tracks.js';
import {emptySnapshot,sanitizeSnapshot} from '../src/progress.js';
import {createCourseContent} from '../src/course-content.js';
import {emptyGame,applyGameCommand} from '../src/game-domain.js';
import * as formats from '../src/exercise-formats.js';
import * as charts from '../src/technical-charts.js';
import {calculate,renderCalculator,mountCalculator} from '../src/exercise-calculator.js';

const root=new URL('../',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
const data=fullCourseTestData(),lessons=JSON.parse(data['br-invest-lessons']),exams=JSON.parse(data['br-exams']),course=JSON.parse(data['br-course']);
const technical=TRACKS.find(t=>t.id==='technical'),current=technical.lessonIds.map(id=>lessons[id]);
const catalog=JSON.parse(read('src/content/game-catalog.json'));
const source=read('src/course.js'),mainSource=read('src/main.js');
const editorialBaseline=JSON.parse(read('tests/fixtures/reasoning-revision-baseline.json'));
const copy=value=>JSON.parse(JSON.stringify(value));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const draft=()=>({choice:null,selected:[],order:[],matches:{},vars:{},number:'',attempts:0,passed:false,hinted:false});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('the fourth path retains stable IDs and rewards while hiding the redundant third world',()=>{
 assert.equal(LESSON_COUNT,1750);assert.equal(WORLD_COUNT,175);assert.equal(current.length,290);
 assert.deepEqual(technical.lessonIds,Array.from({length:300},(_,i)=>1450+i).filter(id=>id<1470||id>=1480));
 assert.deepEqual(technical.groupIds,Array.from({length:30},(_,i)=>145+i).filter(id=>id!==147));
 // All active pathways are now revised. Historical curricula must stay byte-identical.
 assert.equal(hash(lessons.slice(0,450)),editorialBaseline.historicalLessons);
 assert.equal(hash(exams.slice(0,45)),editorialBaseline.historicalExams);
 assert.equal(hash(course.groups.slice(0,145)),'aa13e62403e59f1b8db3c2f41e1038c17535f3c154ac5d1e8772e78845a66f92');
 const historical=Object.entries(catalog).filter(([key])=>{
  if(['answer-453-9','answer-462-9','answer-471-9'].includes(key))return false; // Separately requested fifth exercises in points 4, 13 and 22.
  const study=key.match(/^(?:case-|complete-case-)(\d+)$/);if(study)return Number(study[1])<=45;
  const lesson=key.match(/^(?:lesson-|answer-)(\d+)/);if(lesson)return Number(lesson[1])<1450;
  const world=key.match(/^(?:exam-|skip-world-|badge-world-)(\d+)$/);return !world||Number(world[1])<145;
 }).sort(([a],[b])=>a<b?-1:a>b?1:0);
 assert.equal(historical.length,7789);
 assert.equal(hash(historical),'2161dff5ee5d0f12b66a0102628adb1b2c0e4517dc174b9b48da0041ada328b2');
 for(const [i,l] of current.entries()){
  assert.equal(l.id,technical.lessonIds[i]);assert.equal(l.steps.length,8);
  assert.deepEqual(l.prerequisites,i?[technical.lessonIds[i-1]]:[]);
  assert.deepEqual(l.steps.map(s=>s.type==='learn'),[true,false,true,false,true,false,true,false]);
  assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3);
  assert.equal(catalog['lesson-'+l.id]?.kind,'lesson');
  for(const step of [1,3,5,7])assert.equal(catalog[`answer-${l.id}-${step}`]?.kind,'answer');
 }
 for(const id of technical.groupIds){
  assert.equal(exams[id].steps.length,10);
  assert.deepEqual([...exams[id].steps.map(s=>s.reviewLesson)].sort((a,b)=>a-b),technical.lessonIds.filter(l=>Math.floor(l/10)===id));
  assert.equal(catalog['exam-'+id]?.bonusId,'world-'+id);assert.equal(catalog['badge-world-'+id]?.requiredClaim,'world-'+id);
  assert.equal(catalog['skip-world-'+id]?.previousWorldId,technical.groupIds[technical.groupIds.indexOf(id)-1]??-1);assert.equal(catalog['skip-world-'+id]?.cost,200);
 }
 for(const id of [1450,1749]){
  const reward=applyGameCommand({...emptyGame(),gems:375,badges:['world-45']},{kind:'lesson',target:'lesson-'+id},{day:'2026-10-09',entry:catalog['lesson-'+id],existingClaims:['lesson-450']});
  assert.equal(reward.state.gems,385);assert.deepEqual(reward.state.badges,['world-45']);assert.deepEqual(reward.claims.map(c=>c.id),['lesson-'+id]);
 }
});

function mount(snapshot={...emptySnapshot(),track:'technical',group:145},admitted=true){
 const handlers={},windowHandlers={},nodes=new Map(),requests=[],observers=[];let saved=null,footerTop=6000;
 const node=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},getBoundingClientRect(){return selector==='[data-path-sentinel]'?{top:footerTop,bottom:footerTop+72}:{top:0,bottom:100};},insertAdjacentHTML(_p,text){this.innerHTML+=text;}});
  return nodes.get(selector);
 };
 const main=node('#br-main');
 const worlds={insertAdjacentHTML(position,markup){const closing=main.innerHTML.indexOf('</div><div class="br-path-loader"'),opening=main.innerHTML.indexOf('<div class="br-worlds">')+'<div class="br-worlds">'.length,i=position==='afterbegin'?opening:closing;main.innerHTML=main.innerHTML.slice(0,i)+markup+main.innerHTML.slice(i);}};
 main.querySelector=selector=>selector==='.br-worlds'?worlds:['#br-number','#br-viz-output'].includes(selector)?null:node(selector);main.querySelectorAll=()=>[];
 const rootNode={querySelector:node,querySelectorAll:()=>[],contains:()=>true,addEventListener:(type,handler)=>handlers[type]=handler};
 const metadata=Object.fromEntries([...read('index.html').matchAll(/<script[^>]*id="(br-[^"]+)"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>[m[1],m[2]]));
 const content=createCourseContent({course:JSON.parse(metadata['br-course']),lessons:JSON.parse(metadata['br-invest-lessons']),exams:JSON.parse(metadata['br-exams']),fetchFile:async url=>{requests.push(url);return {ok:true,json:async()=>JSON.parse(read('public'+url))};}});
 class Observer{constructor(callback){this.callback=callback;this.connected=false;observers.push(this);}observe(target){this.target=target;this.connected=true;}disconnect(){this.connected=false;}}
 const window={scrollY:0,innerHeight:844,addEventListener(type,handler){(windowHandlers[type]??=[]).push(handler);},OchavoCourseContent:content,OchavoExercises:formats,OchavoCandles:charts,OchavoCalculator:{render:renderCalculator},OchavoPreview:{freeExplore:true},virutaAccess:{canLearn:()=>admitted},virutaAttemptId:()=> '10000000-0000-4000-8000-000000000001',broteStore:{getSnapshot:()=>copy(snapshot),save:p=>{saved=copy(p);return true;}}};
 vm.runInNewContext(source,{window,document:{getElementById:id=>id==='brote-preview'?rootNode:metadata[id]?{textContent:metadata[id]}:null},TextEncoder,IntersectionObserver:Observer,requestAnimationFrame:fn=>fn()});
 return {main,content,requests,course:window.BroteCourse,get saved(){return saved;},set admitted(value){admitted=value;},get worlds(){return [...main.innerHTML.matchAll(/<section class="br-world [^"]*" id="br-world-(\d+)"/g)].map(m=>+m[1]);},
  nearEnd(){footerTop=744;window.scrollY+=1000;for(const fn of windowHandlers.scroll||[])fn({type:'scroll'});const o=observers.findLast(o=>o.connected);o?.callback([{isIntersecting:true,target:o.target}]);},
  notify(){const o=observers.findLast(o=>o.connected);o?.callback([{isIntersecting:true,target:o.target}]);},
  click(dataset){const button={dataset,disabled:false,closest(){return this;},hasAttribute:a=>Object.hasOwn(dataset,a.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))};handlers.click({target:button});}
 };
}

test('technical content is loaded in pairs only after scrolling and keeps the existing authentication gate',async()=>{
 const app=mount();await settle();assert.deepEqual(app.worlds,[145,146]);assert.equal(app.requests.length,2);
 app.notify();app.notify();await settle();assert.equal(app.requests.length,2);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[145,146,148,149]);assert.equal(app.requests.length,4);
 app.notify();await settle();assert.equal(app.requests.length,4);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[145,146,148,149,150,151]);assert.equal(app.requests.length,6);
 app.click({nav:'map'});await settle();assert.deepEqual(app.worlds,[145,146]);assert.equal(app.requests.length,6,'Downloaded worlds should remain cached');
 const locked=mount(undefined,false);await settle();assert.equal(locked.main.dataset.view,'locked');assert.equal(locked.main.innerHTML,'');assert.equal(locked.requests.length,0);
 locked.click({start:'1450'});assert.equal(locked.main.dataset.view,'locked');assert.equal(locked.saved,null);
 assert.doesNotMatch(source,/OchavoPreview|freeExplore/,'Production must never contain the trial unlock bypass');
 assert.doesNotMatch(mainSource,/technical-independent-preview|ta-free-explore|\.\.\/preview\/runtime/);
});

test('technical progression starts at its first point and requires its own completed world and exam',async()=>{
 const app=mount();await settle();app.click({detail:'1450'});assert.equal(app.main.dataset.view,'lesson');assert.equal(app.course.reportContext().stepIndex,0);
 app.click({nav:'map'});app.click({detail:'1451'});assert.doesNotMatch(app.main.innerHTML,/data-start="1451"/);
 app.click({nav:'map'});app.click({detail:'1460'});assert.doesNotMatch(app.main.innerHTML,/data-start="1460"/,'Even a stray trial flag cannot unlock world 2');
 const completed=Object.fromEntries(Array.from({length:10},(_,i)=>[1450+i,{firstTry:4}]));
 const waiting=mount({...emptySnapshot(),track:'technical',group:145,completed});await settle();waiting.click({detail:'1460'});assert.doesNotMatch(waiting.main.innerHTML,/data-start="1460"/);
 waiting.click({nav:'map'});waiting.click({examDetail:'145'});assert.match(waiting.main.innerHTML,/data-exam-start="145"/);
 const passed=mount({...emptySnapshot(),track:'technical',group:146,completed,passedExams:{145:{best:8,attempts:1,passed:true}}});await settle();passed.click({detail:'1460'});assert.match(passed.main.innerHTML,/data-start="1460"/);
 const last=mount({...emptySnapshot(),track:'technical',group:174,mapTarget:'br-point-1749'});await settle();assert.deepEqual(last.worlds,[173,174]);assert.equal(last.requests.length,2);
});

function enterActivity(a,d){
 formats.activityMarkup(a,d);
 if(a.rows)for(const [i,r] of a.rows.entries()){
  if(a.kind==='classify'){formats.activityAction(a,d,'focus',i);formats.activityAction(a,d,'bucket',r.answer);}
  else if(a.kind==='truth')formats.activityAction(a,d,'row',r.answer,i);
  else formats.activityInput(a,d,'row',String(r.answer),i);
 }
 else if(['all','grid','differences'].includes(a.kind))for(const i of a.answers)formats.activityAction(a,d,'toggle',i);
 else if(a.kind==='sort')for(const [target,i] of a.answer.entries())formats.activityAction(a,d,'drop',d.order.indexOf(i),target);
 else if(a.kind==='build')for(const i of a.answer)formats.activityAction(a,d,'append',i);
 else if(a.kind==='short')formats.activityInput(a,d,typeof a.answer==='number'?'number':'word',String(a.answer));
 else if(a.kind==='slider')formats.activityInput(a,d,'slider',String(a.answer));
 else if(a.kind==='interval')a.answer.forEach((i,k)=>formats.activityInput(a,d,'row',String(i),k));
 else if(a.kind==='allocate')a.answer.forEach((count,i)=>{for(let n=0;n<count;n++)formats.activityAction(a,d,'plus',i);});
 else formats.activityAction(a,d,'choose',a.answer);
}
test('authored technical interactions render, accept controls and survive account progress sanitization',()=>{
 const previous=globalThis.window;globalThis.window={OchavoCandles:charts};let checked=0;
 try{for(const l of current)for(const [step,s] of l.steps.entries())if(s.activity){
  const d=draft(),a=formats.activeActivity(s,d);assert.equal(a,s.activity);assert.equal(formats.activityAnswered(a,d),false);
  const html=formats.activityMarkup(a,d);assert.doesNotMatch(html,/NaN|undefined/);if(a.kind==='hotspot'&&a.candles)assert.match(html,/data-ta-chart/);
  enterActivity(a,d);assert.equal(formats.activityCorrect(a,d),true,`${l.id}/${step}`);
  const packed={c:d.choice,s:d.selected,o:d.order,m:d.matches,n:d.number,v:d.vars};
  const sessions=[[l.id,step,Array.from({length:8},(_,i)=>i===step?packed:{})]];
  const restored=sanitizeSnapshot({...emptySnapshot(),track:'technical',group:Math.floor(l.id/10),sessions,activeId:l.id,activeByTrack:{technical:l.id}}).sessions[0][2][step];
  const recovered={...draft(),choice:restored.c??null,selected:restored.s||[],order:restored.o||[],matches:restored.m||{},number:restored.n||'',vars:restored.v||{}};
  assert.equal(formats.activeActivity(s,recovered),a);assert.equal(formats.activityCorrect(a,recovered),true,`Restored ${l.id}/${step}`);checked++;
 }}finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous;}
 assert.ok(checked>=60);
});

test('candles, OHLC bars and logarithmic charts draw different valid representations of the same prices',()=>{
 const f={kind:'candles',candles:[{o:9,h:12,l:8,c:10,v:100},{o:18,h:22,l:16,c:20,v:100},{o:36,h:44,l:32,c:40,v:100}],labels:['Lun','Mar','Mié'],values:[10,20,40],caption:'Control',timeframe:'Un día por periodo',index:2};
 const attrs=tag=>Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
 const ys=html=>[...html.matchAll(/<circle\b[^>]*>/g)].map(m=>attrs(m[0])).filter(a=>(a.class||'').split(' ').includes('ta-price-dot')).map(a=>Number(a.cy));
 const linear=ys(charts.render({...f,lineMode:true})),log=ys(charts.render({...f,lineMode:true,scale:'log'}));
 assert.equal(linear.length,3);assert.equal(log.length,3);assert.ok(Math.abs((log[0]-log[1])-(log[1]-log[2]))<1e-9);
 assert.ok(Math.abs((linear[1]-linear[2])-2*(linear[0]-linear[1]))<1e-9);
 const bars=charts.render({...f,barMode:true});assert.equal((bars.match(/class="ta-ohlc-bar/g)||[]).length,3);
 for(const part of ['open','range','close'])assert.equal((bars.match(new RegExp('class="ta-ohlc-'+part+'"','g'))||[]).length,3);
 const candles=charts.render(f);assert.equal((candles.match(/class="ta-candle /g)||[]).length,3);assert.doesNotMatch(candles,/ta-price-line/);
 const pending=charts.render({...f,provisionalIndex:2});assert.match(pending,/ta-provisional/);assert.match(pending,/Precio actual/);
 const inspector=pending.match(/class="ta-chart-inspector"[^>]*>([\s\S]*?)<\/dl>/)?.[1];assert.ok(inspector);assert.doesNotMatch(inspector,/Cierre/);
 for(const html of [bars,candles,pending])assert.doesNotMatch(html,/NaN|Infinity/);
});

test('the embedded calculator supplies a numeric activity through input without submitting or modifying rewards',()=>{
 assert.equal(calculate('(50 − 40) ÷ 40 × 100'),25);assert.equal(calculate('1,5 + 2,25'),3.75);
 for(const expression of ['window.location','2; alert(1)','1/0','2**3'])assert.throws(()=>calculate(expression));
 const handlers={},a=current[16].steps[1].activity,d=draft(),events=[];
 assert.equal(a.kind,'slider');d.vars.exerciseKind=a.kind;
 const response={type:'range',min:String(a.min),max:String(a.max),step:String(a.step),disabled:false,value:'0',focus(){},dispatchEvent(e){events.push(e.type);formats.activityInput(a,d,'slider',this.value);}};
 const field={value:'(50 - 40) / 40 * 100'},status={textContent:''},use={disabled:true};
 const box={querySelector:selector=>selector==='.ta-calculator-expression'?field:selector==='[role="status"]'?status:use,closest:()=>({querySelector:()=>response})};
 mountCalculator({addEventListener:(type,handler)=>handlers[type]=handler});
 const click=(key,isUse=false)=>handlers.click({target:{closest(){return {dataset:{taCalcKey:key},closest:()=>box,hasAttribute:()=>isUse};}}});
 click('=');assert.match(status.textContent,/25/);assert.equal(use.disabled,false);assert.equal(formats.activityAnswered(a,d),false);
 click('',true);assert.deepEqual(events,['input']);assert.equal(formats.activityCorrect(a,d),true);assert.equal(d.passed,false);assert.equal(d.attempts,0);
 field.value='26';click('=');click('',true);assert.equal(response.value,'25');assert.equal(events.length,1,'Off-step values cannot be copied into the slider');
 response.disabled=true;field.value='30';click('=');assert.equal(use.disabled,true);click('',true);assert.equal(response.value,'25');
 assert.match(renderCalculator(),/maxlength="160"/);assert.match(mainSource,/mountCalculator/);assert.match(mainSource,/mountInspection/);
});
