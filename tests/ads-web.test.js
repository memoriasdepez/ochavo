import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebAds,createGoogleWebConsent} from '../src/ads-web.js';

function node(tag){return {tag,children:[],attrs:{},style:{},hidden:false,isConnected:true,
  appendChild(child){this.children.push(child);child.parent=this;return child;},
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.isConnected=false;},
  setAttribute(key,value){this.attrs[key]=value;},getAttribute(key){return this.attrs[key]??null;},
  getBoundingClientRect(){return {width:320};}};}
function fixture(options={}){
  const timers=new Map(),scripts=[],calls=[],observers=[];let id=0,premium=false,active=true,consent=true,container=node('div');container.hidden=true;
  const window={location:{protocol:'https:',hostname:'ochavo.app',port:''},adsbygoogle:{push:value=>calls.push(value)},
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),
    MutationObserver:class{constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}observe(target){this.target=target;}disconnect(){this.disconnected=true;}}};
  const document={head:{appendChild:script=>scripts.push(script)},visibilityState:'visible',createElement:node,querySelector:()=>null};
  const ads=createWebAds({enabled:true,approved:true,clientId:'ca-pub-1234567890123456',slotId:'1234567890',testMode:false,window,document,
    getContainer:()=>container,isActive:()=>active,getPremium:()=>premium,cmpReady:()=>consent,...options});
  return {ads,window,document,timers,scripts,calls,observers,get container(){return container;},
    setContainer:v=>container=v,setPremium:v=>premium=v,setActive:v=>active=v,setConsent:v=>consent=v,
    expire(){for(const [key,fn] of [...timers]){timers.delete(key);fn();}},
    fill(status){const observer=observers.at(-1);observer.target.setAttribute('data-ad-status',status);observer.callback();},
    async ready(){const loading=ads.prepare();scripts[0].onload();assert.equal(await loading,true);}};
}

test('default, unapproved, malformed, local and insecure configurations never load an ad script',async()=>{
  for(const options of [{enabled:false},{approved:false},{clientId:''},{clientId:'ca-pub-1'},{slotId:''},{slotId:'anything'},{enabled:'true'}]){
    const f=fixture(options);assert.equal(await f.ads.prepare(),false);assert.equal(await f.ads.showResultAd(),false);assert.equal(f.scripts.length,0);assert.equal(f.container.hidden,true);
  }
  for(const [hostname,protocol,port] of [['localhost','https:',''],['ochavo.app.evil.example','https:',''],['ochavo.app','http:',''],['ochavo.app','https:','5173']]){
    const f=fixture();Object.assign(f.window.location,{hostname,protocol,port});assert.equal(await f.ads.prepare(),false);assert.equal(f.calls.length,0);
  }
  assert.equal(await createWebAds().prepare(),false);
});

test('premium, inactive and missing CMP permission block SDK loading',async()=>{
  for(const key of ['setPremium','setActive','setConsent']){
    const f=fixture();f[key](key==='setPremium');assert.equal(await f.ads.prepare(),false);assert.equal(f.scripts.length,0);
  }
});

test('preparing the SDK never queues ads; a timeout cannot trigger a late result ad',async()=>{
  const f=fixture();const prepared=f.ads.prepare();assert.equal(f.scripts.length,1);
  assert.equal(await f.ads.showResultAd(),false);assert.equal(f.calls.length,0);
  f.expire();assert.equal(await prepared,false);f.scripts[0].onload();assert.equal(f.ads.available,false);assert.equal(f.calls.length,0);assert.equal(f.container.hidden,true);
});

test('request is inline, labelled, nonblocking and contains only publisher/slot fields',async()=>{
  const f=fixture();await f.ready();assert.equal(await f.ads.showInterstitial(),true);
  assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0],{});assert.equal(f.container.hidden,false);
  const section=f.container.children[0],label=section.children[0],ins=section.children[1];
  assert.equal(section.tag,'section');assert.equal(section.attrs['aria-label'],'Publicidad');assert.equal(label.textContent,'Publicidad');
  assert.equal(ins.tag,'ins');assert.equal(ins.className,'adsbygoogle');assert.equal(ins.style.display,'block');
  assert.deepEqual(ins.attrs,{'data-ad-client':'ca-pub-1234567890123456','data-ad-slot':'1234567890','data-ad-format':'auto','data-full-width-responsive':'true'});
  f.fill('filled');f.expire();assert.equal(f.container.hidden,false);assert.equal(await f.ads.showResultAd(),false);assert.equal(f.calls.length,1);
});

test('no fill and watchdog remove empty slots without refresh or late callbacks',async()=>{
  for(const action of ['no-fill','timeout']){
    const f=fixture();await f.ready();assert.equal(await f.ads.showResultAd(),true);
    if(action==='no-fill')f.fill('unfilled');else f.expire();
    assert.equal(f.container.hidden,true);assert.equal(f.container.children.length,0);assert.equal(f.observers[0].disconnected,true);
    f.fill('filled');assert.equal(f.container.hidden,true);assert.equal(await f.ads.showResultAd(),false);assert.equal(f.calls.length,1);
  }
});

test('session changes, Plus and consent withdrawal cannot start an ad after loading',async()=>{
  for(const change of [f=>f.ads.reset(),f=>f.setPremium(true),f=>f.setConsent(false),f=>f.setActive(false)]){
    const f=fixture();const prepared=f.ads.prepare();change(f);f.scripts[0].onload();f.expire();assert.equal(await prepared,false);
    assert.equal(f.ads.available,false);assert.equal(await f.ads.showResultAd(),false);assert.equal(f.calls.length,0);
  }
});

test('reset removes ad content and stale fill cannot show it in another result',async()=>{
  const f=fixture();await f.ready();await f.ads.showResultAd();const old=f.container;f.ads.reset();f.setContainer(node('div'));f.container.hidden=true;
  f.fill('filled');assert.equal(old.children.length,0);assert.equal(old.hidden,true);assert.equal(f.container.hidden,true);
  assert.equal(await f.ads.showResultAd(),false);assert.equal(await f.ads.prepare(),true);assert.equal(await f.ads.showResultAd(),true);
  assert.equal(f.scripts.length,1);assert.equal(f.calls.length,2);
});

test('requests require an attached, visible, positive-width active result',async()=>{
  for(const change of [f=>f.setContainer(null),f=>f.container.isConnected=false,f=>f.container.getBoundingClientRect=()=>({width:0}),f=>f.document.visibilityState='hidden']){
    const f=fixture();await f.ready();change(f);assert.equal(await f.ads.showResultAd(),false);assert.equal(f.calls.length,0);
  }
});

test('SDK errors and foreign installations fail closed',async()=>{
  const f=fixture();const prepared=f.ads.prepare();f.scripts[0].onerror();assert.equal(await prepared,false);assert.equal(await f.ads.showResultAd(),false);
  const other=fixture();other.document.querySelector=()=>({});assert.equal(await other.ads.prepare(),false);assert.equal(other.scripts.length,0);
});

test('test mode is a labelled local placeholder and makes no Google requests',async()=>{
  const f=fixture({testMode:true});assert.equal(await f.ads.prepare(),true);assert.equal(await f.ads.showResultAd(),true);
  assert.equal(f.scripts.length,0);assert.equal(f.calls.length,0);assert.equal(f.container.children[0].children[1].textContent,'Espacio de publicidad de prueba');
  f.ads.reset();assert.equal(f.container.hidden,true);
});

function cmpFixture(){
  let callback,gppCallback,revoked=0;const queued=[],removed=[],gppRemoved=[];
  const ping={cmpId:300,cmpLoaded:true,cmpStatus:'loaded',gdprApplies:true};
  const win={googlefc:{callbackQueue:{push:v=>queued.push(v)},showRevocationMessage:()=>revoked++},__tcfapi(command,version,cb,id){
    assert.equal(version,2);if(command==='ping')cb(ping);if(command==='addEventListener')callback=cb;if(command==='removeEventListener')removed.push(id);
  },__gpp(command,cb,id){if(command==='addEventListener')gppCallback=cb;if(command==='removeEventListener')gppRemoved.push(id);},navigator:{}};
  const cmp=createGoogleWebConsent({window:win});
  const data={cmpId:300,cmpStatus:'loaded',gdprApplies:true,eventStatus:'tcloaded',tcString:'test-consent',listenerId:7,purpose:{consents:{1:true}},vendor:{consents:{755:true}}};
  const gpp={cmpId:300,cmpStatus:'loaded',signalStatus:'ready',cmpDisplayStatus:'hidden',applicableSections:[-1]};
  return {cmp,win,ping,data,gpp,queued,removed,gppRemoved,revoked:()=>revoked,emit:(value=data,success=true)=>callback(value,success),
    emitGpp:(value=gpp,success=true)=>gppCallback({eventName:'signalStatus',listenerId:9,pingData:value},success)};
}

test('TCF rejects unknown, non-Google, stub, open UI, denied or incomplete consent',()=>{
  for(const patch of [{gdprApplies:undefined},{cmpId:42},{cmpLoaded:false},{cmpStatus:'stub'}]){
    const f=cmpFixture();Object.assign(f.ping,patch);assert.equal(f.cmp.ready(),false);
  }
  const f=cmpFixture();assert.equal(f.cmp.ready(),false);f.emit();assert.equal(f.cmp.ready(),true);
  for(const patch of [{eventStatus:'cmpuishown'},{gdprApplies:undefined},{tcString:''},{purpose:{}},{vendor:{}},{publisher:{restrictions:{1:{755:0}}}},{cmpStatus:'error'}]){
    f.emit({...f.data,...patch});assert.equal(f.cmp.ready(),false);
  }
  f.emit({...f.data,gdprApplies:false});assert.equal(f.cmp.ready(),false);assert.equal(f.cmp.privacyRequired,false);
  f.emit(f.data,false);assert.equal(f.cmp.ready(),false);
});

test('outside GDPR, absent or applicable GPP signals cannot authorize ads globally',()=>{
  const f=cmpFixture();f.cmp.ready();f.emit({...f.data,gdprApplies:false});assert.equal(f.cmp.ready(),false);
  for(const patch of [{cmpId:42},{cmpStatus:'stub'},{signalStatus:'not ready'},{cmpDisplayStatus:'visible'},
    {applicableSections:[]},{applicableSections:[0]},{applicableSections:[7]},{applicableSections:[8]},{applicableSections:[5]},
    {applicableSections:[-1,7]},{applicableSections:undefined}]){
    f.emitGpp({...f.gpp,...patch});assert.equal(f.cmp.ready(),false);
  }
  f.emitGpp();assert.equal(f.cmp.ready(),true);
  f.emitGpp({...f.gpp,applicableSections:[7]});assert.equal(f.cmp.ready(),false);
  f.emitGpp();assert.equal(f.cmp.ready(),true);
  f.emitGpp(f.gpp,false);assert.equal(f.cmp.ready(),false);
});

test('GPC vetoes loading and late GPP callbacks cannot undo reset',()=>{
  const f=cmpFixture();f.cmp.ready();f.emit();assert.equal(f.cmp.ready(),true);
  f.win.navigator.globalPrivacyControl=true;assert.equal(f.cmp.ready(),false);
  f.emit({...f.data,gdprApplies:false});f.emitGpp();assert.equal(f.cmp.ready(),false);
  f.win.navigator.globalPrivacyControl=false;assert.equal(f.cmp.ready(),true);
  f.cmp.reset();assert.deepEqual(f.gppRemoved,[9]);f.emitGpp();assert.equal(f.cmp.ready(),false);
});

test('revocation uses the CMP callback queue; stale events cannot restore consent',()=>{
  const f=cmpFixture();f.cmp.ready();f.emit();assert.equal(f.cmp.privacyOptions(),true);assert.deepEqual(f.removed,[7]);
  f.emit();assert.equal(f.cmp.ready(),false);f.queued[0].CONSENT_DATA_READY();assert.equal(f.revoked(),1);
  assert.equal(createGoogleWebConsent({window:{}}).privacyOptions(),false);
});
