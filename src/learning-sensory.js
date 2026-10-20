export const SENSORY_KEY='ochavo.sensory.v1';
export const CUE_KINDS=Object.freeze(['correct','chest','badge']);

/** Device preference only; never writes progress, rewards or analytics. */
export function createLearningSensory({driver,storage,doc=globalThis.document,native=false,now=()=>Date.now()}={}){
  let muted=!native,lastKind=null,lastAt=-Infinity;
  const listeners=new Set();
  try{const saved=JSON.parse(storage?.getItem(SENSORY_KEY)||'null');if(typeof saved?.muted==='boolean')muted=saved.muted;}catch{/* A missing preference keeps the safe default. */}
  const getView=()=>({muted,native,web:!native});
  function stop(){lastKind=null;lastAt=-Infinity;try{Promise.resolve(driver?.stop?.()).catch(()=>{});}catch{/* Decorative feedback never interrupts learning. */}}
  function setMuted(value){
    muted=value===true;if(muted)stop();
    try{Promise.resolve(storage?.setItem(SENSORY_KEY,JSON.stringify({muted}))).catch(()=>{});}catch{/* Retain this session's preference even if storage is unavailable. */}
    for(const listener of listeners)listener(getView());return getView();
  }
  function prime(){if(muted||doc?.hidden)return;try{Promise.resolve(driver?.prime?.()).catch(()=>{});}catch{}}
  function play(kind){
    if(muted||doc?.hidden||!CUE_KINDS.includes(kind))return false;
    const at=now();if(kind===lastKind&&at-lastAt<100)return false;
    lastKind=kind;lastAt=at;
    try{Promise.resolve(driver?.play?.(kind,{enabled:true,haptics:true})).catch(()=>{});}catch{/* An unavailable speaker must not delay Continue. */}
    return true;
  }
  const onHidden=()=>{if(doc?.hidden)stop();};
  const onGesture=event=>{if(event.isTrusted!==false)prime();};
  doc?.addEventListener?.('visibilitychange',onHidden);
  doc?.addEventListener?.('pointerdown',onGesture,{capture:true,passive:true});
  doc?.addEventListener?.('keydown',onGesture,{capture:true});
  return {getView,setMuted,prime,play,stop,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    dispose(){stop();listeners.clear();doc?.removeEventListener?.('visibilitychange',onHidden);doc?.removeEventListener?.('pointerdown',onGesture,true);doc?.removeEventListener?.('keydown',onGesture,true);}};
}

/** No navigator.vibrate fallback: browsers cannot check the phone's ringer mode. */
export function createWebCueDriver({AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext,fetch=globalThis.fetch,doc=globalThis.document}={}){
  let context=null,generation=0;
  const buffers=new Map(),sources=new Set();
  function ensureContext(){if(!context&&AudioContext)context=new AudioContext();return context;}
  function load(kind){
    if(!buffers.has(kind))buffers.set(kind,(async()=>{
      const response=await fetch('/sounds/'+kind+'.wav');if(!response.ok)throw Error('Sound unavailable');
      return ensureContext().decodeAudioData(await response.arrayBuffer());
    })().catch(error=>{buffers.delete(kind);throw error;}));
    return buffers.get(kind);
  }
  function prime(){
    const ctx=ensureContext();if(!ctx)return;
    void ctx.resume().catch(()=>{});
    for(const kind of CUE_KINDS)void load(kind).catch(()=>{});
  }
  async function play(kind){
    if(!CUE_KINDS.includes(kind)||doc?.hidden)return false;
    const ticket=++generation,ctx=ensureContext();if(!ctx)return false;
    await ctx.resume();const buffer=await load(kind);
    if(ticket!==generation||doc?.hidden||ctx.state!=='running')return false;
    for(const previous of sources){try{previous.stop();}catch{}}
    sources.clear();
    const source=ctx.createBufferSource();source.buffer=buffer;source.connect(ctx.destination);
    sources.add(source);source.onended=()=>{sources.delete(source);source.disconnect();};source.start();return true;
  }
  function stop(){generation++;for(const source of sources){try{source.stop();}catch{}}sources.clear();}
  return {prime,play,stop};
}
