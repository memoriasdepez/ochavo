import test from 'node:test';
import assert from 'node:assert/strict';
import {createAndroidAds,validateAndroidAdConfig,isAdMobAppId,isAdMobInterstitialId,ANDROID_ADMOB_TEST_APP_ID,ANDROID_ADMOB_TEST_INTERSTITIAL_ID} from '../src/ads-android.js';

const UNIT='ca-app-pub-1234567890123456/1234567890';
const events={Showed:'shown',Dismissed:'dismissed',FailedToShow:'failed'};
const allowed={status:'OBTAINED',canRequestAds:true,isConsentFormAvailable:true,privacyOptionsRequirementStatus:'REQUIRED'};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(overrides={}){
  const calls=[],listeners=new Map(),errors=[];
  let active=true,premium=false;
  const AdMob={
    requestConsentInfo:async()=>{calls.push('consent');return {...allowed};},
    showConsentForm:async()=>{calls.push('form');return {...allowed};},
    initialize:async()=>{calls.push('initialize');},
    addListener:async(name,callback)=>{listeners.set(name,callback);return {remove:async()=>listeners.delete(name)};},
    prepareInterstitial:async options=>{calls.push(['prepare',options]);return {adUnitId:options.adId};},
    showInterstitial:async options=>{calls.push(['show',options]);},
    showPrivacyOptionsForm:async()=>{calls.push('privacy');return {...allowed};},
    ...overrides,
  };
  const module={AdMob,InterstitialAdPluginEvents:events};
  const ads=createAndroidAds({enabled:true,adUnitId:UNIT,getPremium:()=>premium,isActive:()=>active,onError:error=>errors.push(error),loadPlugin:async()=>{calls.push('import');return module;}});
  return {ads,module,calls,errors,emit:(name,data)=>listeners.get(name)?.(data),setActive:value=>{active=value;},setPremium:value=>{premium=value;}};
}

test('Android identifiers are validated and Google test units require explicit test mode',()=>{
  assert.equal(isAdMobAppId(ANDROID_ADMOB_TEST_APP_ID),true);
  assert.equal(isAdMobInterstitialId(ANDROID_ADMOB_TEST_INTERSTITIAL_ID),true);
  assert.equal(isAdMobAppId(UNIT),false);
  assert.equal(isAdMobInterstitialId('ca-app-pub-123/123'),false);
  assert.equal(validateAndroidAdConfig(),false);
  assert.equal(validateAndroidAdConfig({enabled:'true',adUnitId:UNIT}),false);
  assert.equal(validateAndroidAdConfig({enabled:true,adUnitId:UNIT}),true);
  assert.equal(validateAndroidAdConfig({enabled:true,adUnitId:ANDROID_ADMOB_TEST_INTERSTITIAL_ID}),false);
  assert.equal(validateAndroidAdConfig({enabled:true,testMode:true}),true);
});

test('disabled, inactive and Plus adapters neither import nor initialize advertising',async()=>{
  let imports=0;
  const disabled=createAndroidAds({loadPlugin:()=>{imports++;}});
  assert.equal(await disabled.prepare(),false);
  assert.equal(await disabled.showInterstitial(),false);
  assert.equal(imports,0);
  const f=fixture();
  f.setActive(false);
  assert.equal(await f.ads.prepare(),false);
  f.setActive(true);f.setPremium(true);
  assert.equal(await f.ads.prepare(),false);
  assert.deepEqual(f.calls,[]);
});

test('UMP and required form finish before SDK initialization and ad loading',async()=>{
  const f=fixture({requestConsentInfo:async()=>{f.calls.push('consent');return {...allowed,status:'REQUIRED',canRequestAds:false};}});
  assert.equal(f.ads.consent(),false);
  assert.equal(await f.ads.prepare(),true);
  assert.deepEqual(f.calls.map(call=>Array.isArray(call)?call[0]:call),['import','consent','form','initialize','prepare']);
  assert.equal(f.ads.consent(),true);
  assert.equal(f.ads.privacyRequired,true);
  assert.equal(f.ads.ready,true);
});

test('denied or unavailable required consent cannot initialize or load ads',async()=>{
  for(const info of [{...allowed,canRequestAds:false},{...allowed,status:'REQUIRED',isConsentFormAvailable:false,canRequestAds:true}]){
    const f=fixture({requestConsentInfo:async()=>info});
    assert.equal(await f.ads.prepare(),false);
    assert.equal(f.calls.includes('initialize'),false);
    assert.equal(f.ads.consent(),false);
  }
});

test('native consent failure is fail-closed and can be retried without interrupting lessons',async()=>{
  let attempts=0;
  const f=fixture({requestConsentInfo:async()=>{if(++attempts===1)throw Error('UMP unavailable');return allowed;}});
  assert.equal(await f.ads.prepare(),false);
  assert.equal(f.ads.consent(),false);
  assert.equal(f.errors.length,1);
  assert.equal(await f.ads.prepare(),true);
});

test('preloading is single-flight and cannot show a late ad after a skipped opportunity',async()=>{
  const load=deferred();
  const f=fixture({prepareInterstitial:async options=>{f.calls.push(['prepare',options]);return load.promise;}});
  const first=f.ads.prepare(),second=f.ads.prepare();
  assert.equal(first,second);
  await tick();
  assert.equal(await f.ads.showInterstitial(),false);
  load.resolve({adUnitId:UNIT});
  assert.equal(await first,true);
  await tick();
  assert.equal(f.calls.filter(call=>call[0]==='show').length,0);
  assert.equal(f.calls.filter(call=>call[0]==='prepare').length,1);
});

test('show waits for actual display and dismissal, and rapid calls cannot show twice',async()=>{
  const f=fixture();
  await f.ads.prepare();
  let settled=false;
  const showing=f.ads.showInterstitial().then(result=>{settled=true;return result;});
  assert.equal(await f.ads.showInterstitial(),false);
  await tick();assert.equal(settled,false);
  f.emit('shown');
  await tick();assert.equal(settled,false);
  f.emit('dismissed');
  assert.equal(await showing,true);
  assert.equal(f.calls.filter(call=>call[0]==='show').length,1);
});

test('no-fill, SDK show rejection and native failure leave completion usable',async()=>{
  const noFill=fixture({prepareInterstitial:async()=>{throw Error('no fill');}});
  assert.equal(await noFill.ads.prepare(),false);
  assert.equal(await noFill.ads.showInterstitial(),false);
  const rejected=fixture({showInterstitial:async()=>{throw Error('not ready');}});
  await rejected.ads.prepare();
  assert.equal(await rejected.ads.showInterstitial(),false);
  const native=fixture();await native.ads.prepare();
  const showing=native.ads.showInterstitial();
  native.emit('failed',Error('native failure'));
  assert.equal(await showing,false);
});

test('cached ads are rechecked against Plus and active account at the exact break',async()=>{
  const f=fixture();await f.ads.prepare();
  f.setPremium(true);
  assert.equal(f.ads.consent(),false);
  assert.equal(await f.ads.showInterstitial(),false);
  f.setPremium(false);f.setActive(false);
  assert.equal(await f.ads.showInterstitial(),false);
  assert.equal(f.calls.filter(call=>call[0]==='show').length,0);
});

test('account reset invalidates late native preload and serializes its replacement',async()=>{
  const load=deferred();let loads=0;
  const f=fixture({prepareInterstitial:async()=>++loads===1?load.promise:{adUnitId:UNIT}});
  const old=f.ads.prepare();await tick();
  f.ads.reset();
  const replacement=f.ads.prepare();
  await tick();assert.equal(loads,1);
  load.resolve({adUnitId:UNIT});
  assert.equal(await old,false);
  assert.equal(await replacement,true);
  assert.equal(loads,2);
  assert.equal(f.calls.filter(call=>call==='consent').length,1);
  assert.equal(f.calls.filter(call=>call==='initialize').length,1);
});

test('losing account while the SDK loads prevents any ad request',async()=>{
  const init=deferred();
  const f=fixture({initialize:async()=>init.promise});
  const pending=f.ads.prepare();await tick();
  f.setActive(false);f.ads.reset();init.resolve();
  assert.equal(await pending,false);
  assert.equal(f.calls.filter(call=>call[0]==='prepare').length,0);
});

test('reset or a show promise rejection never releases navigation beneath a visible ad',async()=>{
  const nativeShow=deferred();
  const f=fixture({showInterstitial:()=>nativeShow.promise});
  await f.ads.prepare();
  let settled=false;
  const showing=f.ads.showInterstitial().then(result=>{settled=true;return result;});
  f.emit('shown');f.ads.reset();nativeShow.reject(Error('late bridge error'));
  await tick();assert.equal(settled,false);
  assert.equal(await f.ads.showInterstitial(),false);
  f.emit('dismissed');
  assert.equal(await showing,false);
});

test('privacy choices invalidate ready ads and use fresh UMP consent',async()=>{
  const privacy=deferred();
  const f=fixture({showPrivacyOptionsForm:()=>privacy.promise});
  await f.ads.prepare();
  const changing=f.ads.privacyOptions();
  assert.equal(f.ads.ready,false);
  assert.equal(f.ads.consent(),false);
  assert.equal(await f.ads.showInterstitial(),false);
  privacy.resolve({...allowed,canRequestAds:false});
  assert.equal(await changing,true);
  await tick();
  assert.equal(f.ads.consent(),false);
  assert.equal(f.ads.ready,false);
  assert.equal(f.calls.filter(call=>call[0]==='prepare').length,1);
});

test('privacy API void result triggers a fresh consent query and permitted preload',async()=>{
  const f=fixture({showPrivacyOptionsForm:async()=>undefined});
  await f.ads.prepare();
  assert.equal(await f.ads.privacyOptions(),true);
  await tick();
  assert.equal(f.calls.filter(call=>call==='consent').length,2);
  assert.equal(f.ads.ready,true);
});

test('explicit testing always uses the official Android demo unit',async()=>{
  const f=fixture();
  const ads=createAndroidAds({enabled:true,testMode:true,adUnitId:UNIT,getPremium:()=>false,isActive:()=>true,loadPlugin:async()=>f.module});
  assert.equal(await ads.prepare(),true);
  const options=f.calls.find(call=>call[0]==='prepare')[1];
  assert.equal(options.adId,ANDROID_ADMOB_TEST_INTERSTITIAL_ID);
  assert.equal(options.isTesting,true);
});
