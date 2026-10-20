import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createLessonAds,lessonAdsStorageKey} from '../src/ads.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('iOS sync excludes the Android-only ad SDK but retains account and purchase plugins',()=>{
 const config=JSON.parse(read('capacitor.config.json'));
 assert.ok(!config.ios.includePlugins.includes('@capacitor-community/admob'));
 for(const p of ['@capacitor/preferences','@capacitor/network','@capacitor/app','@revenuecat/purchases-capacitor'])assert.ok(config.ios.includePlugins.includes(p));
});
test('Android defers SDK measurement and identifies its app from the generated resource',()=>{const manifest=read('android/app/src/main/AndroidManifest.xml');assert.match(manifest,/APPLICATION_ID[^\n]+@string\/ochavo_admob_app_id/);assert.match(manifest,/DELAY_APP_MEASUREMENT_INIT[^\n]+true/);});
test('result exits invalidate late ad requests; no banners are placed in exercises',()=>{
 const course=read('src/course.js'),main=read('src/main.js');
 assert.equal((course.match(/id="ochavo-result-ad"/g)||[]).length,2);
 assert.match(course,/\['success','exam-result'\].includes\(previousPage\)&&\(previousPage!==state.page\|\|!canLearn\(\)\)\)window.virutaLeaveResult/);
 assert.ok(course.indexOf('window.virutaLeaveResult?.();',course.indexOf('function render(){'))<course.indexOf("main.dataset.view='content-loading'"));
 assert.match(main,/allowAd:token===adResultGeneration/);
 assert.match(main,/adResultGeneration\+\+;lessonAds.discardPending/);
 assert.match(main,/if\(await lessonAds.forget\(uid\)===false\)throw/);
});

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const result=id=>({kind:'lesson',attemptId:String(id)});
function mountAdCallbacks({android=false,nativeMobile=android,storage=new Map()}={}){
 let owner='alice',flush=async()=>true,show=async()=>true,shown=0,showRequests=0,prepared=0;
 const writes=[],events=[];
 const adapter={consent:()=>true,showInterstitial:async()=>{shown++;return show();},reset(){},prepare:async()=>{prepared++;return true;}};
 const lessonAds=createLessonAds({adapter,getOwner:()=>owner,consent:()=>true,storage:{
  getItem:key=>storage.get(key)??null,setItem:(key,value)=>{writes.push(key);storage.set(key,value);},removeItem:key=>storage.delete(key)
 }});
 const present=lessonAds.showPending;
 lessonAds.showPending=()=>{showRequests++;return present();};
 const context={window:{},adOwner:()=>owner,adCompletion:Promise.resolve(false),adResultGeneration:0,android,nativeMobile,
  store:{flushLocal:()=>flush()},analytics:{track:(...args)=>events.push(args)},lessonAds,adAdapter:adapter};
 const source=read('src/main.js'),start=source.indexOf('window.virutaLessonCompleted=result=>{'),end=source.indexOf('window.OchavoExercises=',start);
 assert.ok(start>=0&&end>start);
 vm.runInNewContext(source.slice(start,end),context);
 return {complete:context.window.virutaLessonCompleted,continue:context.window.virutaContinueAfterLesson,leave:context.window.virutaLeaveResult,
  setFlush:fn=>{flush=fn;},setShow:fn=>{show=fn;},setOwner:value=>{owner=value;context.window.virutaLeaveResult();},
  storage,writes,events,get shown(){return shown;},get showRequests(){return showRequests;},get prepared(){return prepared;},
  count:user=>JSON.parse(storage.get(lessonAdsStorageKey(user)))?.completed};
}

test('actual Android wiring waits for the saved result and presents only after Continue',async()=>{
 const app=mountAdCallbacks({android:true});
 await app.complete(result(1));await app.continue();assert.equal(app.shown,0);
 const flush=deferred(),started=deferred(),dismiss=deferred();
 app.setFlush(()=>{started.resolve();return flush.promise;});app.setShow(()=>dismiss.promise);
 const completed=app.complete(result(2));await started.promise;
 const continued=app.continue();let exited=false;continued.then(()=>{exited=true;});
 assert.equal(app.shown,0);assert.equal(app.count('alice'),1);
 flush.resolve(true);await completed;
 await new Promise(setImmediate);
 assert.equal(app.shown,1);assert.equal(exited,false);
 dismiss.resolve(true);assert.equal(await continued,true);
 app.leave();assert.equal(app.count('alice'),2);
});

test('web Continue never waits for storage or advertising and cancelled results still count',async()=>{
 const app=mountAdCallbacks();await app.complete(result(1));
 const flush=deferred(),started=deferred();app.setFlush(()=>{started.resolve();return flush.promise;});
 const completed=app.complete(result(2));await started.promise;
 try{assert.equal(await Promise.race([app.continue().then(()=>true),new Promise(resolve=>setImmediate(()=>resolve(false)))]),true);}
 finally{app.leave();flush.resolve(true);}
 assert.equal(await completed,false);assert.equal(app.count('alice'),2);assert.equal(app.shown,0);
});

test('iOS has no ad presentation and does not wait for a saved-result callback',async()=>{
 const app=mountAdCallbacks({nativeMobile:true}),flush=deferred(),started=deferred();
 app.setFlush(()=>{started.resolve();return flush.promise;});
 const completed=app.complete(result(1));await started.promise;
 try{assert.equal(await Promise.race([app.continue().then(()=>true),new Promise(resolve=>setImmediate(()=>resolve(false)))]),true);}
 finally{flush.resolve(true);}
 await completed;assert.equal(app.shown,0);assert.equal(app.showRequests,0);
});

test('a completion saved after account change cannot write or show for the new account',async()=>{
 const app=mountAdCallbacks({android:true}),flush=deferred(),started=deferred();
 await app.complete(result(1));app.setFlush(()=>{started.resolve();return flush.promise;});
 const completed=app.complete(result(2));await started.promise;
 const continued=app.continue();app.setOwner('bob');flush.resolve(true);
 assert.equal(await completed,false);assert.equal(await continued,false);
 assert.equal(app.storage.has(lessonAdsStorageKey('bob')),false);assert.equal(app.shown,0);
 assert.equal(app.events.length,1);
});

test('Continue from a cancelled result does not consume a later result opportunity',async()=>{
 const app=mountAdCallbacks({android:true}),flush=deferred(),started=deferred();
 await app.complete(result(1));app.setFlush(()=>{started.resolve();return flush.promise;});
 const completed=app.complete(result(2));await started.promise;
 const continued=app.continue();app.leave();
 app.setFlush(async()=>true);const next=app.complete(result(3));flush.resolve(true);
 await completed;assert.equal(await continued,false);await next;
 assert.equal(app.showRequests,0);assert.equal(app.count('alice'),3);
 await app.complete(result(4));assert.equal(await app.continue(),true);assert.equal(app.shown,1);
});

test('actual course Continue releases its busy state and applies deferred auth after an ad',async()=>{
 const source=read('src/course.js'),start=source.indexOf("root.addEventListener('click',async e=>{"),end=source.indexOf(" if(b.hasAttribute('data-content-retry'))",start);
 const ad=deferred();let handler,busy=false,afterAction=0;
 const button={disabled:false,dataset:{nav:'map'},matches:()=>true,closest(){return this;}};
 const context={root:{contains:()=>true,addEventListener:(_,fn)=>{handler=fn;}},main:{contains:()=>true},state:{page:'success'},
  canLearn:()=>true,render(){},gameBusy:false,accessGeneration:1,accessCurrent:()=>false,
  setCourseBusy:value=>{busy=value;},window:{virutaContinueAfterLesson:()=>ad.promise,virutaAfterAction:()=>{afterAction++;}}};
 vm.runInNewContext(source.slice(start,end)+'});',context);
 const clicked=handler({target:button});assert.equal(busy,true);
 ad.resolve(false);await clicked;
 assert.equal(busy,false);assert.equal(afterAction,1);
});
