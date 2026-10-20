// Google Mobile Ads runs only in the Android adapter selected by the host app.
// Importing this module does not import, initialize or contact an advertising SDK.
export const ANDROID_ADMOB_TEST_APP_ID='ca-app-pub-3940256099942544~3347511713';
export const ANDROID_ADMOB_TEST_INTERSTITIAL_ID='ca-app-pub-3940256099942544/1033173712';
const TEST_PUBLISHER='ca-app-pub-3940256099942544';
const MAX_READY_AGE_MS=55*60*1000;

export const isAdMobAppId=value=>typeof value==='string'&&/^ca-app-pub-\d{16}~\d{10}$/.test(value);
export const isAdMobInterstitialId=value=>typeof value==='string'&&/^ca-app-pub-\d{16}\/\d{10}$/.test(value);
export function validateAndroidAdConfig({enabled=false,adUnitId='',testMode=false}={}){
  if(enabled!==true)return false;
  if(testMode===true)return true;
  return isAdMobInterstitialId(adUnitId)&&!adUnitId.startsWith(TEST_PUBLISHER);
}

/**
 * One instance per app launch, selected only on Android. isActive must return
 * true only for the current signed-in, verified account. Call reset whenever
 * that account changes or loses access. UMP consent belongs to the installation,
 * so account changes invalidate cached ads without erasing the privacy choice.
 */
export function createAndroidAds({
  enabled=false,adUnitId='',testMode=false,getPremium=()=>true,isActive=()=>false,
  onError=()=>{},loadPlugin=()=>import('@capacitor-community/admob'),
}={}){
  const configured=validateAndroidAdConfig({enabled,adUnitId,testMode});
  const unit=testMode===true?ANDROID_ADMOB_TEST_INTERSTITIAL_ID:adUnitId;
  let generation=0,moduleFlight=null,sdkFlight=null,listenersFlight=null;
  let consentFlight=null,consentChecked=false,consentInfo=null,privacyFlight=null;
  let prepareFlight=null,prepareGeneration=-1,ready=null,presentation=null;

  const report=error=>{try{onError(error);}catch{/* Diagnostics cannot interrupt a lesson. */}};
  const active=()=>{try{return configured&&isActive()===true;}catch{return false;}};
  const eligible=()=>{try{return active()&&getPremium()===false;}catch{return false;}};
  const current=token=>token===generation&&eligible()&&!privacyFlight;
  const permitted=()=>eligible()&&!privacyFlight&&consentChecked&&consentInfo?.canRequestAds===true;
  const usable=()=>!!ready&&ready.generation===generation&&Date.now()-ready.loadedAt<MAX_READY_AGE_MS&&permitted();

  function plugin(){
    if(!moduleFlight){
      const pending=Promise.resolve().then(loadPlugin).then(module=>{
        if(!module?.AdMob||!module?.InterstitialAdPluginEvents)throw new Error('Android ad plugin is unavailable.');
        return module;
      });
      moduleFlight=pending;
      pending.catch(()=>{if(moduleFlight===pending)moduleFlight=null;});
    }
    return moduleFlight;
  }

  async function obtainConsent(module,token){
    if(consentChecked)return consentInfo?.canRequestAds===true;
    if(consentFlight)return consentFlight;
    const pending=(async()=>{
      if(!current(token))return false;
      consentInfo=null;
      let info=await module.AdMob.requestConsentInfo();
      if(info?.status==='REQUIRED'){
        if(!current(token)||!info.isConsentFormAvailable)return false;
        info=await module.AdMob.showConsentForm();
      }
      consentInfo=info;
      consentChecked=true;
      return info?.canRequestAds===true;
    })();
    consentFlight=pending;
    try{return await pending;}finally{if(consentFlight===pending)consentFlight=null;}
  }

  function finishPresentation(success,error){
    const showing=presentation;
    if(!showing)return;
    presentation=null;
    if(error)report(error);
    showing.resolve(success&&showing.shown&&current(showing.generation));
    // This only preloads. The next even completion is still the only show trigger.
    if(eligible())void prepare();
  }

  async function installListeners(module){
    if(listenersFlight)return listenersFlight;
    const pending=(async()=>{
      const handles=[];
      try{
        const events=module.InterstitialAdPluginEvents;
        handles.push(await module.AdMob.addListener(events.Showed,()=>{if(presentation)presentation.shown=true;}));
        handles.push(await module.AdMob.addListener(events.Dismissed,()=>finishPresentation(true)));
        handles.push(await module.AdMob.addListener(events.FailedToShow,error=>finishPresentation(false,error)));
      }catch(error){
        await Promise.allSettled(handles.map(handle=>handle.remove()));
        throw error;
      }
    })();
    listenersFlight=pending;
    try{await pending;}catch(error){if(listenersFlight===pending)listenersFlight=null;throw error;}
  }

  async function initialize(module,token){
    if(!current(token)||!permitted())return;
    if(!sdkFlight){
      const pending=Promise.resolve(module.AdMob.initialize());
      sdkFlight=pending;
      pending.catch(()=>{if(sdkFlight===pending)sdkFlight=null;});
    }
    await sdkFlight;
    if(!current(token)||!permitted())return;
    await installListeners(module);
  }

  function prepare(){
    if(!eligible()||privacyFlight||presentation)return Promise.resolve(false);
    if(usable())return Promise.resolve(true);
    ready=null;
    const token=generation;
    if(prepareFlight){
      if(prepareGeneration===token)return prepareFlight;
      // The native cache is shared. Wait for a previous account's request before
      // replacing it, otherwise a late result could overwrite the current ad.
      return prepareFlight.then(()=>current(token)?prepare():false);
    }
    const pending=(async()=>{
      try{
        const module=await plugin();
        if(!current(token)||!await obtainConsent(module,token)||!current(token))return false;
        // UMP must finish before Mobile Ads SDK initialization or any ad load.
        await initialize(module,token);
        if(!current(token)||!permitted())return false;
        const result=await module.AdMob.prepareInterstitial({adId:unit,isTesting:testMode===true});
        if(!current(token)||!permitted())return false;
        if(result?.adUnitId&&result.adUnitId!==unit)return false;
        ready={generation:token,loadedAt:Date.now(),module};
        return true;
      }catch(error){report(error);return false;}
    })();
    prepareFlight=pending;
    prepareGeneration=token;
    pending.finally(()=>{if(prepareFlight===pending){prepareFlight=null;prepareGeneration=-1;}});
    return pending;
  }

  function showInterstitial(){
    // No asynchronous loading is started from this method. If not ready at the
    // natural break, the opportunity is skipped rather than shown mid-lesson.
    if(presentation||!usable())return Promise.resolve(false);
    const ad=ready;
    ready=null;
    let resolve;
    const result=new Promise(done=>{resolve=done;});
    const showing={generation,shown:false,resolve};
    presentation=showing;
    try{
      Promise.resolve(ad.module.AdMob.showInterstitial({adId:unit})).catch(error=>{
        if(presentation!==showing)return;
        if(showing.shown){report(error);return;} // Wait for dismissal if still visible.
        finishPresentation(false,error);
      });
    }catch(error){finishPresentation(false,error);}
    // Deliberately no timeout: advancing underneath a visible native ad could
    // expose a different lesson when it closes. Dismissal/failure owns release.
    return result;
  }

  function privacyOptions(){
    if(!active()||presentation)return Promise.resolve(false);
    if(privacyFlight)return privacyFlight;
    generation++;
    ready=null;
    consentChecked=false;
    const pending=(async()=>{
      try{
        const module=await plugin();
        if(consentFlight)await consentFlight;
        if(!active())return false;
        const result=await module.AdMob.showPrivacyOptionsForm();
        consentInfo=typeof result?.canRequestAds==='boolean'?result:await module.AdMob.requestConsentInfo();
        consentChecked=true;
        return true;
      }catch(error){consentInfo=null;consentChecked=false;report(error);return false;}
    })();
    privacyFlight=pending;
    pending.finally(()=>{
      if(privacyFlight===pending)privacyFlight=null;
      if(eligible())void prepare();
    });
    return pending;
  }

  function reset(){generation++;ready=null;}
  return {
    prepare,showInterstitial,privacyOptions,reset,consent:permitted,
    get configured(){return configured;},
    get ready(){return usable()&&!presentation;},
    get privacyRequired(){return active()&&consentInfo?.privacyOptionsRequirementStatus==='REQUIRED';},
  };
}
