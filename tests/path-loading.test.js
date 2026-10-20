import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createCourseContent} from '../src/course-content.js';
import {emptySnapshot} from '../src/progress.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const data=Object.fromEntries([...html.matchAll(/<script[^>]*id="(br-[^"]+)"[^>]*>([\s\S]*?)<\/script>/g)].map(m=>[m[1],m[2]]));
const source=readFileSync(new URL('../src/course.js',import.meta.url),'utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const copy=value=>JSON.parse(JSON.stringify(value));
function mount(snapshot=emptySnapshot()){
 const handlers={},windowHandlers={},nodes=new Map(),requests=[],observers=[];let admitted=true,fetchHook=async()=>{},saved,footerTop=6000;
 const node=selector=>{
  if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){},getBoundingClientRect(){return selector==='[data-path-sentinel]'?{top:footerTop,bottom:footerTop+72}:{top:0,bottom:100};},insertAdjacentHTML(_position,text){this.innerHTML+=text;}});
  return nodes.get(selector);
 };
 const main=node('#br-main');
 const worlds={insertAdjacentHTML(position,markup){const closing=main.innerHTML.indexOf('</div><div class="br-path-loader"');const opening=main.innerHTML.indexOf('<div class="br-worlds">')+'<div class="br-worlds">'.length;const i=position==='afterbegin'?opening:closing;main.innerHTML=main.innerHTML.slice(0,i)+markup+main.innerHTML.slice(i);}};
 main.querySelector=selector=>selector==='.br-worlds'?worlds:['#br-number','#br-viz-output'].includes(selector)?null:node(selector);
 main.querySelectorAll=()=>[];
 const root={querySelector:node,querySelectorAll:()=>[],contains:()=>true,addEventListener:(type,handler)=>handlers[type]=handler};
 const content=createCourseContent({course:JSON.parse(data['br-course']),lessons:JSON.parse(data['br-invest-lessons']),exams:JSON.parse(data['br-exams']),fetchFile:async url=>{
  requests.push(url);await fetchHook(url);return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('../public'+url,import.meta.url),'utf8'))};
 }});
 class Observer{constructor(callback){this.callback=callback;this.connected=false;observers.push(this);}observe(target){this.target=target;this.connected=true;}disconnect(){this.connected=false;}}
 const window={scrollY:0,innerHeight:844,addEventListener(type,handler){(windowHandlers[type]??=[]).push(handler);},OchavoCourseContent:content,virutaAccess:{canLearn:()=>admitted},broteStore:{getSnapshot:()=>copy(snapshot),save:p=>{saved=copy(p);return true;}}};
 vm.runInNewContext(source,{window,document:{getElementById:id=>id==='brote-preview'?root:data[id]?{textContent:data[id]}:null},TextEncoder,IntersectionObserver:Observer,requestAnimationFrame:fn=>fn()});
 const currentObserver=()=>observers.findLast(o=>o.connected);
 const notify=observer=>{assert.ok(observer,'observer is attached');observer.callback([{isIntersecting:true,target:observer.target}]);};
 const scroll=(y,top=footerTop)=>{footerTop=top;window.scrollY=y;for(const handler of windowHandlers.scroll||[])handler({type:'scroll'});};
 return {course:window.BroteCourse,main,content,requests,get saved(){return saved;},get worlds(){return [...main.innerHTML.matchAll(/<section class="br-world [^"]*" id="br-world-(\d+)"/g)].map(m=>+m[1]);},
  set fetchHook(value){fetchHook=value;},set admitted(value){admitted=value;},
  get observer(){return currentObserver();},get scrollY(){return window.scrollY;},set footerTop(value){footerTop=value;},
  scroll,notify(observer=currentObserver()){notify(observer);},
  nearEnd(){const observer=currentObserver();scroll(window.scrollY+1000,window.innerHeight-100);if(observer)notify(observer);},
  rerender(){window.BroteCourse.mergeAchievements(copy(saved||snapshot));},
  click(dataset){const button={dataset,disabled:false,closest(){return this;},hasAttribute:attribute=>Object.hasOwn(dataset,attribute.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))};handlers.click({target:button});}
 };
}

test('first two worlds load; each scroll adds two in order without duplicate downloads',async()=>{
 const app=mount();assert.deepEqual(app.worlds,[45,46]);await settle();assert.equal(app.requests.length,2);
 app.nearEnd();app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48,49,50]);
 app.click({track:'etfs'});await settle();assert.deepEqual(app.worlds,[95,96]);
 app.click({track:'crypto'});await settle();assert.deepEqual(app.worlds,[115,116]);
 const count=app.requests.length;app.click({track:'stocks'});await settle();assert.deepEqual(app.worlds,[45,46]);assert.equal(app.requests.length,count);
});
test('initial or repeated observer notifications do not load worlds without a new downward scroll near the footer',async()=>{
 const app=mount();await settle();app.footerTop=744;
 app.notify();app.notify();await settle();assert.deepEqual(app.worlds,[45,46]);assert.equal(app.requests.length,2);
 app.scroll(0,744);app.notify();await settle();assert.deepEqual(app.worlds,[45,46]);
 app.scroll(100,6000);app.notify();await settle();assert.deepEqual(app.worlds,[45,46]);assert.equal(app.requests.length,2);
 app.scroll(50,744);app.notify();await settle();assert.deepEqual(app.worlds,[45,46]);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.notify();app.notify();app.scroll(app.scrollY,744);await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48,49,50]);assert.equal(app.requests.length,6);
});
test('notifications from a disconnected observer cannot extend the current pair',async()=>{
 const app=mount();await settle();const oldObserver=app.observer;
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.notEqual(app.observer,oldObserver);
 app.scroll(app.scrollY+100,6000);app.footerTop=744;
 app.notify(oldObserver);await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.notify();await settle();assert.deepEqual(app.worlds,[45,46,47,48,49,50]);assert.equal(app.requests.length,6);
});
test('a synchronization rerender preserves visible worlds and disarms loading until another downward scroll',async()=>{
 const app=mount();await settle();app.nearEnd();await settle();const oldObserver=app.observer;
 app.rerender();await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.footerTop=744;app.notify(oldObserver);app.notify();app.scroll(app.scrollY,744);await settle();
 assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48,49,50]);assert.equal(app.requests.length,6);
});
test('Aprende and returning from another page start with two worlds without discarding saved learning progress or cached content',async()=>{
 const drafts=Array.from({length:8},()=>({}));drafts[0]={v:{contentRevision:'stocks-clear-2026-10-09'}};drafts[1]={c:1,q:'10000000-0000-4000-8000-000000000002',v:{exerciseKind:'choice'}};
 const snapshot={...emptySnapshot(),introSkipped:true,mapTarget:'br-point-456',sessions:[[456,1,drafts]],activeId:456,activeByTrack:{stocks:456},completed:{7:{firstTry:3}}};
 const app=mount(snapshot);await settle();app.nearEnd();await settle();app.nearEnd();await settle();
 assert.deepEqual(app.worlds,[45,46,47,48,49,50]);assert.equal(app.requests.length,6);
 app.click({nav:'map'});await settle();assert.deepEqual(app.worlds,[45,46]);assert.equal(app.requests.length,6);
 assert.equal(app.saved.introSkipped,true);assert.deepEqual(app.saved.completed,snapshot.completed);assert.deepEqual(app.saved.sessions[0],snapshot.sessions[0]);
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,6);
 app.click({nav:'lab'});app.click({nav:'map'});await settle();assert.deepEqual(app.worlds,[45,46]);assert.equal(app.requests.length,6);
 assert.equal(app.saved.introSkipped,true);assert.deepEqual(app.saved.completed,snapshot.completed);assert.deepEqual(app.saved.sessions[0],snapshot.sessions[0]);
});
test('the manual footer button adds only one pair even without scrolling and idle observers do not append another',async()=>{
 const app=mount();await settle();app.footerTop=744;
 app.click({pathNext:''});await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
 app.notify();app.notify();await settle();assert.deepEqual(app.worlds,[45,46,47,48]);assert.equal(app.requests.length,4);
});
test('advanced users start near their saved point and can prepend earlier worlds without changing progress',async()=>{
 const snapshot={...emptySnapshot(),mapTarget:'br-point-550',mapTargets:{stocks:'br-point-550'}};
 const app=mount(snapshot);await settle();assert.deepEqual(app.worlds,[55,56]);assert.equal(app.requests.length,2);
 app.click({pathPrevious:''});await settle();assert.deepEqual(app.worlds,[53,54,55,56]);assert.equal(app.saved,undefined);
 app.click({pathPrevious:''});await settle();assert.deepEqual(app.worlds,[51,52,53,54,55,56]);
});
test('the last saved stocks point still opens two worlds and prepends previous pairs in track order',async()=>{
 const track=JSON.parse(data['br-course']).tracks.find(t=>t.id==='stocks'),ids=track.groupIds,target='br-point-'+track.lessonIds.at(-1);
 const snapshot={...emptySnapshot(),track:'stocks',mapTarget:target,mapTargets:{stocks:target}};
 const app=mount(snapshot);await settle();assert.deepEqual(app.worlds,ids.slice(-2));assert.equal(app.requests.length,2);
 app.click({pathPrevious:''});await settle();assert.deepEqual(app.worlds,ids.slice(-4));assert.equal(app.requests.length,4);assert.equal(app.saved,undefined);
 app.click({pathPrevious:''});await settle();assert.deepEqual(app.worlds,ids.slice(-6));assert.equal(app.requests.length,6);
 app.click({nav:'lab'});app.click({nav:'map'});await settle();assert.deepEqual(app.worlds,ids.slice(-2));assert.equal(app.requests.length,6);
 assert.equal(app.saved.mapTarget,target);assert.deepEqual(app.saved.completed,snapshot.completed);assert.deepEqual(app.saved.passedExams,snapshot.passedExams);
});
test('failed scrolling exposes retry and retries the failed pair instead of losing the path',async()=>{
 const app=mount();await settle();let fail=true;app.fetchHook=async()=>{if(fail)throw Error('offline');};
 app.nearEnd();await settle();assert.deepEqual(app.worlds,[45,46]);assert.match(app.main.querySelector('[data-path-sentinel]').innerHTML,/Reintentar carga/);
 fail=false;app.click({pathRetry:''});await settle();assert.deepEqual(app.worlds,[45,46,47,48]);
});
test('late content cannot append to another path or a different signed-in account',async()=>{
 const app=mount();await settle();let release;const pending=new Promise(resolve=>release=resolve);
 app.fetchHook=url=>/world-4[78]-/.test(url)?pending:Promise.resolve();app.nearEnd();app.click({track:'etfs'});await settle();
 release();await settle();assert.deepEqual(app.worlds,[95,96]);
 app.click({track:'stocks'});await settle();assert.deepEqual(app.worlds,[45,46]);
 let finish;const stalled=new Promise(resolve=>finish=resolve);app.fetchHook=()=>stalled;app.nearEnd();app.admitted=false;app.course.restore(emptySnapshot());
 finish();await settle();assert.equal(app.main.dataset.view,'locked');assert.equal(app.main.innerHTML,'');
 app.admitted=true;app.course.restore(emptySnapshot());await settle();assert.deepEqual(app.worlds,[45,46]);
});
test('an unloaded lesson shows loading and cannot render an exercise until its world is valid',async()=>{
 const app=mount();await settle();let release;app.fetchHook=()=>new Promise(resolve=>release=resolve);
 app.click({detail:'470'});assert.equal(app.main.dataset.view,'content-loading');assert.ok(!app.main.innerHTML.includes('data-start'));
 release();await settle();assert.equal(app.main.dataset.view,'detail');assert.ok(!app.main.innerHTML.includes('undefined'));
});

test('an existing lesson draft survives metadata hydration and opens at the same step after download',async()=>{
 const drafts=Array.from({length:8},()=>({}));drafts[0]={v:{contentRevision:JSON.parse(data['br-invest-lessons'])[550].editorialRevision}};drafts[1]={c:1,q:'10000000-0000-4000-8000-000000000001',v:{exerciseKind:'choice'}};
 const snapshot={...emptySnapshot(),completed:Object.fromEntries(Array.from({length:100},(_,id)=>[450+id,{firstTry:4}])),passedExams:Object.fromEntries(Array.from({length:10},(_,id)=>[45+id,{best:8,attempts:1,passed:true}])),mapTarget:'br-point-550',sessions:[[550,1,drafts]],activeId:550,activeByTrack:{stocks:550}};
 const app=mount(snapshot);await settle();assert.deepEqual(app.worlds,[55,56]);
 app.click({detail:'550'});assert.equal(app.main.dataset.view,'lesson');
 assert.equal(app.course.reportContext().stepIndex,1);
 assert.equal(app.saved.sessions[0][0],550);assert.equal(app.saved.sessions[0][1],1);assert.deepEqual(app.saved.sessions[0][2][1],drafts[1]);
});

test('an available unloaded point bypasses its repeated introduction only after a valid download',async()=>{
 const completed=Object.fromEntries(Array.from({length:20},(_,i)=>[450+i,{firstTry:4}]));
 const passedExams={45:{best:10,attempts:1,passed:true},46:{best:10,attempts:1,passed:true}};
 const app=mount({...emptySnapshot(),completed,passedExams,mapTarget:'br-point-450'});
 await settle();assert.deepEqual(app.worlds,[45,46]);let release;
 app.fetchHook=()=>new Promise(resolve=>release=resolve);
 app.click({detail:'470'});assert.equal(app.main.dataset.view,'content-loading');
 assert.equal(app.course.reportContext().stepIndex,-1);
 release();await settle();assert.equal(app.main.dataset.view,'lesson');
 assert.equal(app.course.reportContext().lessonId,470);assert.equal(app.course.reportContext().stepIndex,0);
 assert.equal(app.requests.length,3);assert.deepEqual(app.saved.completed,completed);
});

test('the last crypto lesson opens exactly its final pair and earlier pairs can be loaded',async()=>{
 const snapshot={...emptySnapshot(),track:'crypto',group:144,mapTarget:'br-point-1449'};
 const app=mount(snapshot);await settle();assert.deepEqual(app.worlds,[143,144]);assert.equal(app.requests.length,2);
 app.click({pathPrevious:''});await settle();assert.deepEqual(app.worlds,[141,142,143,144]);
 app.click({nav:'lab'});app.click({nav:'map'});await settle();assert.deepEqual(app.worlds,[143,144]);assert.equal(app.saved.mapTarget,'br-point-1449');
});
