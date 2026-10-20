// Ordinary AdSense display unit, in the result content (never an overlay).
// https://support.google.com/adsense/answer/9183363
// https://support.google.com/adsense/answer/1346295
// https://developers.google.com/funding-choices/fc-api-docs
const HOSTS=new Set(['ochavo.app','www.ochavo.app','brote-62d26.web.app','brote-62d26.firebaseapp.com']);
const GOOGLE_CMP=300, GOOGLE_VENDOR=755;
const READY_TIMEOUT=5000, FILL_TIMEOUT=8000;
const issue=code=>Object.assign(new Error('La publicidad no está disponible.'),{code:'ads/'+code});

/** No CMP script is injected here. Google Privacy & messaging must be deployed
 * separately. An analytics checkbox is deliberately not an input to this gate.
 * Unknown region, stub, missing consent, UI open and CMP errors all fail closed.
 * This is a conservative loading gate; Google still interprets the complete TC
 * string for all purposes, vendors, restrictions and permitted ad treatments. */
export function createGoogleWebConsent({window:win=globalThis.window,onChange=()=>{},onError=()=>{}}={}){
  let generation=0,started=false,gppStarted=false,allowed=false,required=false,listener=null,gppListener=null;
  let region,euConsent=false,gppClear=false;
  const emit=value=>{if(allowed!==value){allowed=value;try{onChange(value);}catch{}}};
  const report=()=>{try{onError(issue('cmp-unavailable'));}catch{}};
  const remove=id=>{try{if(id!==null&&id!==undefined)win?.__tcfapi?.('removeEventListener',2,()=>{},id);}catch{}};
  const removeGpp=id=>{try{if(id!==null&&id!==undefined)win?.__gpp?.('removeEventListener',()=>{},id);}catch{}};
  const evaluate=()=>emit(win?.navigator?.globalPrivacyControl!==true&&(region===true?euConsent:region===false&&gppClear));
  function beginGpp(){
    if(gppStarted||typeof win?.__gpp!=='function')return;
    gppStarted=true;const current=generation;
    try{win.__gpp('addEventListener',(event,success)=>{
      if(current!==generation){removeGpp(event?.listenerId);return;}
      if(event?.listenerId!==undefined)gppListener=event.listenerId;
      const ping=event?.pingData;
      // gdprApplies:false does not waive US/Canadian or other regional rules.
      // Support only GPP's explicit "no section applies" signal here. Regions
      // with applicable sections remain blocked pending their complete handling.
      gppClear=success===true&&ping?.cmpId===GOOGLE_CMP&&ping.cmpStatus==='loaded'
        &&ping.signalStatus==='ready'&&['hidden','disabled'].includes(ping.cmpDisplayStatus)
        &&Array.isArray(ping.applicableSections)&&ping.applicableSections.length===1&&ping.applicableSections[0]===-1;
      evaluate();
    });}catch{gppStarted=false;gppClear=false;evaluate();report();}
  }
  function begin(){
    if(!win?.googlefc?.callbackQueue)return;
    beginGpp();
    if(started||typeof win.__tcfapi!=='function')return;
    started=true;const current=generation;
    try{win.__tcfapi('ping',2,ping=>{
      if(current!==generation)return;
      if(ping?.cmpId!==GOOGLE_CMP||ping.cmpLoaded!==true||ping.cmpStatus!=='loaded'||typeof ping.gdprApplies!=='boolean'){started=false;region=undefined;evaluate();return;}
      required=ping.gdprApplies;
      win.__tcfapi('addEventListener',2,(data,success)=>{
        if(current!==generation){remove(data?.listenerId);return;}
        if(data?.listenerId!==undefined)listener=data.listenerId;
        const loaded=success===true&&data?.cmpId===GOOGLE_CMP&&data.cmpStatus==='loaded';
        if(typeof data?.gdprApplies==='boolean')required=data.gdprApplies;
        const final=['tcloaded','useractioncomplete'].includes(data?.eventStatus);
        const consent=typeof data?.tcString==='string'&&data.tcString.length>0
          &&data.purpose?.consents?.[1]===true&&data.vendor?.consents?.[GOOGLE_VENDOR]===true
          &&data.publisher?.restrictions?.[1]?.[GOOGLE_VENDOR]!==0;
        region=loaded&&typeof data.gdprApplies==='boolean'?data.gdprApplies:undefined;
        euConsent=loaded&&final&&consent;
        evaluate();
      });
    });}catch{started=false;region=undefined;evaluate();report();}
  }
  function ready(){begin();evaluate();return allowed;}
  function reset(){generation++;remove(listener);removeGpp(gppListener);listener=null;gppListener=null;started=false;gppStarted=false;region=undefined;euConsent=false;gppClear=false;emit(false);}
  function privacyOptions(){
    const queue=win?.googlefc?.callbackQueue;
    if(!queue||typeof queue.push!=='function')return false;
    reset();const current=generation;
    try{queue.push({CONSENT_DATA_READY:()=>{
      if(current!==generation)return;
      try{win.googlefc.showRevocationMessage();}catch{report();}
    }});return true;}catch{report();return false;}
  }
  return {ready,privacyOptions,reset,get privacyRequired(){begin();return required;}};
}

export function createWebAds({enabled=false,approved=false,clientId='',slotId='',testMode=true,cmpReady,
  getContainer=()=>null,getPremium=()=>false,isActive=()=>false,
  window:win=globalThis.window,document:doc=globalThis.document,onError=()=>{}}={}){
  const configured=enabled===true&&approved===true&&/^ca-pub-\d{16}$/.test(clientId)&&/^\d{1,20}$/.test(slotId);
  let generation=0,ready=false,loaded=false,loading=null,pending=null,script=null,loadFailed=false,currentSlot=null;
  const served=new WeakSet();
  const schedule=(fn,ms)=>(win?.setTimeout||globalThis.setTimeout).call(win,fn,ms);
  const clear=id=>(win?.clearTimeout||globalThis.clearTimeout).call(win,id);
  const report=code=>{try{onError(issue(code));}catch{}};
  const cmp=createGoogleWebConsent({window:win,onError,onChange:allowed=>{if(!allowed)reset();else void prepare();}});
  const consentReady=typeof cmpReady==='function'?cmpReady:cmp.ready;
  function eligible(){
    try{return configured&&!!doc&&win?.location?.protocol==='https:'&&!win.location.port
      &&HOSTS.has(win.location.hostname)&&isActive()===true&&getPremium()!==true&&consentReady()===true;}
    catch{return false;}
  }
  function removeSlot(slot=currentSlot){
    if(!slot)return;
    slot.observer?.disconnect();slot.section.remove();slot.container.hidden=true;
    if(currentSlot===slot)currentSlot=null;
  }
  function reset(){
    generation++;ready=false;
    if(loading)loading.finish(false);
    if(pending)pending.finish(false);
    removeSlot();
  }
  function consent(){return eligible();}
  function prepare(){
    if(!eligible()||loadFailed)return Promise.resolve(false);
    // Test mode is a local labelled placeholder, never a request for real ads.
    if(testMode===true||loaded){ready=true;return Promise.resolve(true);}
    if(loading)return loading.promise;
    if(script)return Promise.resolve(false);
    // Another installation could enable Auto ads or use different consent and
    // account settings. Do not silently adopt it or inject a second library.
    if(doc.querySelector?.('script[src*="pagead/js/adsbygoogle.js"]')){report('existing-script');return Promise.resolve(false);}
    const current=generation;let resolve;
    const promise=new Promise(done=>{resolve=done;});
    const task={promise,finished:false,timer:null,finish(value){
      if(task.finished)return;task.finished=true;clear(task.timer);
      if(loading===task)loading=null;resolve(value);
    }};
    loading=task;
    task.timer=schedule(()=>{loadFailed=true;task.finish(false);},READY_TIMEOUT);
    try{
      win.adsbygoogle=win.adsbygoogle||[];
      script=doc.createElement('script');script.async=true;script.crossOrigin='anonymous';
      script.src='https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client='+clientId;
      script.onload=()=>{
        loaded=true;
        if(task.finished||current!==generation||!eligible())return;
        ready=true;task.finish(true);
      };
      script.onerror=()=>{loadFailed=true;report('load');task.finish(false);};
      doc.head.appendChild(script);
    }catch{loadFailed=true;report('load');task.finish(false);}
    return promise;
  }
  function showResultAd(){
    // Completion is never held behind SDK readiness, ad blocking or no fill.
    // The controller calls once for a user-triggered result; never refresh a slot.
    if(!ready||!eligible()||pending||doc.visibilityState==='hidden')return Promise.resolve(false);
    let container;try{container=getContainer();}catch{return Promise.resolve(false);}
    if(!container||container.isConnected!==true||served.has(container))return Promise.resolve(false);
    removeSlot();served.add(container);const current=generation;
    const section=doc.createElement('section');section.className='och-result-ad-content';section.setAttribute('aria-label','Publicidad');
    const label=doc.createElement('small');label.className='och-ad-label';label.textContent='Publicidad';section.appendChild(label);
    container.appendChild(section);container.hidden=false;
    // AdSense cannot lay out a responsive unit in a zero-width/hidden result.
    if(!(container.getBoundingClientRect?.().width>0)){section.remove();container.hidden=true;return Promise.resolve(false);}
    const slot={container,section,observer:null};currentSlot=slot;
    if(testMode===true){
      const sample=doc.createElement('p');sample.textContent='Espacio de publicidad de prueba';section.appendChild(sample);
      return Promise.resolve(true);
    }
    const task={finished:false,timer:null,finish(shown){
      if(task.finished)return;task.finished=true;clear(task.timer);slot.observer?.disconnect();
      if(!shown)removeSlot(slot);if(pending===task)pending=null;
    }};pending=task;
    const valid=()=>!task.finished&&current===generation&&eligible()&&container.isConnected===true&&getContainer()===container;
    try{
      const ins=doc.createElement('ins');ins.className='adsbygoogle';ins.style.display='block';
      ins.setAttribute('data-ad-client',clientId);ins.setAttribute('data-ad-slot',slotId);
      ins.setAttribute('data-ad-format','auto');ins.setAttribute('data-full-width-responsive','true');section.appendChild(ins);
      if(typeof win.MutationObserver!=='function'){task.finish(false);return Promise.resolve(false);}
      slot.observer=new win.MutationObserver(()=>{
        try{if(!valid()){task.finish(false);return;}
          const status=ins.getAttribute('data-ad-status');
          if(status==='unfilled')task.finish(false);else if(status==='filled')task.finish(true);
        }catch{task.finish(false);}
      });
      slot.observer.observe(ins,{attributes:true,attributeFilter:['data-ad-status']});
      task.timer=schedule(()=>task.finish(false),FILL_TIMEOUT);
      // The SDK is already loaded. There is never a queued late request waiting
      // for its script; no names, emails, lesson IDs or account IDs are sent.
      win.adsbygoogle.push({});
    }catch{report('slot');task.finish(false);return Promise.resolve(false);}
    // Requested does not promise a filled impression. Inline advertisements do
    // not delay Continue; fill/no-fill cleanup happens independently afterwards.
    return Promise.resolve(true);
  }
  function privacyOptions(){reset();return configured&&cmp.privacyOptions();}
  return {prepare,consent,showResultAd,showInterstitial:showResultAd,privacyOptions,reset,configured,
    get available(){return ready&&eligible();},
    get privacyRequired(){return configured&&cmp.privacyRequired;}};
}
