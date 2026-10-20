import {emptySnapshot,makeEnvelope,mergeProgress,sanitizeSnapshot} from './progress.js';

export function createProgressStore({storage,backend,onRestore=()=>{},onMerge=()=>{},onStatus=()=>{},isOnline=()=>true,delay=2500}) {
  let uid=null,verified=false,epoch=0,ready=false,timer=null,inFlight=null,dirty=false,data=makeEnvelope(emptySnapshot(),null,0),cacheOK=true;
  let engineData=data,localPending=false,localWrite=0,lastStatus='loading',deletionPending=false,updateRequired=false;
  const key=id=>{if(!id)throw Error('Falta la cuenta del progreso.');return 'brote.progress.v1.'+id;};
  const read=id=>{
    try{
      const raw=storage.getItem(key(id));if(raw===null||raw===undefined)return null;
      const v=JSON.parse(raw);
      if(!v?.data||v.data.schema!==1||![4,5].includes(v.data.snapshot?.version)||!v.data.snapshot.completed||typeof v.data.snapshot.completed!=='object')throw Error('Invalid local progress');
      return {data:mergeProgress(null,v.data),dirty:!!v.dirty};
    }catch(cause){throw Object.assign(Error('No se pudo leer la copia de tu progreso. Conservamos los datos del dispositivo.'),{code:'storage/read-failed',cause});}
  };
  const status=value=>{lastStatus=value;onStatus(['loading','signed-out','unverified'].includes(value)?value:!cacheOK?'storage-error':deletionPending?'deletion-pending':updateRequired?'update-required':localPending?'saving-local':value);};
  const failed=error=>{
    if(error?.code==='account/deletion-pending'){deletionPending=true;clearTimeout(timer);status('deletion-pending');}
    else if(error?.code==='progress/update-required'){updateRequired=true;clearTimeout(timer);status('update-required');}
    else status('error');
  };
  const persist=()=>{
    if(!uid||!verified)return;
    const generation=epoch,write=++localWrite;
    try{
      const result=storage.setItem(key(uid),JSON.stringify({data,dirty}));cacheOK=true;
      localPending=!!result&&typeof result.then==='function';
      if(localPending)Promise.resolve(result).then(()=>{
        if(generation!==epoch||write!==localWrite)return;
        localPending=false;cacheOK=true;status(lastStatus);
      },()=>{
        if(generation!==epoch||write!==localWrite)return;
        localPending=false;cacheOK=false;status(lastStatus);
      });
    }catch{localPending=false;cacheOK=false;}
  };
  async function flushLocal(){
    if(typeof storage.flush!=='function')return cacheOK;
    const generation=epoch,write=localWrite;
    try{
      await storage.flush();
      if(generation===epoch&&write===localWrite){localPending=false;cacheOK=true;status(lastStatus);}
      return true;
    }catch{
      if(generation===epoch&&write===localWrite){localPending=false;cacheOK=false;status(lastStatus);}
      return false;
    }
  }
  function schedule(){clearTimeout(timer);if(uid&&verified&&dirty&&ready&&!deletionPending&&!updateRequired&&isOnline())timer=setTimeout(()=>flush(),delay);}
  async function select(user){
    const id=!user?.isAnonymous&&typeof user?.uid==='string'&&user.uid?user.uid:null,isVerified=!!id&&!!user?.emailVerified;
    if(ready&&uid===id&&verified===isVerified)return;
    const generation=++epoch;clearTimeout(timer);ready=false;uid=id;verified=isVerified;dirty=false;cacheOK=true;localPending=false;deletionPending=false;updateRequired=false;
    data=makeEnvelope(emptySnapshot(),null,0);engineData=data;
    status('loading');onRestore(emptySnapshot());
    if(!uid||!verified){status(uid?'unverified':'signed-out');return;}
    let cached;try{cached=read(uid);}catch(error){status('storage-invalid');throw error;}
    data=cached?.data||makeEnvelope(emptySnapshot(),null,0);dirty=!!cached?.dirty;
    if(typeof storage.flush==='function'){await flushLocal();if(generation!==epoch)return;}
    if(!isOnline()){ready=true;engineData=data;onRestore(data.snapshot);status('offline');return;}
    try{
      const remote=await backend.read(uid);
      if(generation!==epoch)return;
      if(remote===null&&cached)dirty=true;
      data=mergeProgress(remote,data);engineData=data;ready=true;persist();onRestore(data.snapshot);status(dirty?'saving':'saved');schedule();
    }catch(error){if(generation!==epoch)return;ready=true;engineData=data;onRestore(data.snapshot);failed(error);}
  }
  function save(snapshot){
    if(!ready||!uid||!verified||updateRequired)return false;
    engineData=makeEnvelope(sanitizeSnapshot(snapshot),engineData);data=mergeProgress(data,engineData);dirty=true;persist();
    status(!isOnline()?'offline':'saving');schedule();return cacheOK;
  }
  async function flush(){
    clearTimeout(timer);
    if(!uid||!verified)return false;
    if(typeof storage.flush==='function'){
      const generation=epoch;await flushLocal();
      if(generation!==epoch)return false;
    }
    if(deletionPending){status('deletion-pending');return false;}
    if(updateRequired){status('update-required');return false;}
    if(!ready||!dirty)return ready&&!dirty;
    if(!isOnline()){status('offline');return false;}
    if(inFlight){const pending=inFlight;await pending;if(inFlight===pending)inFlight=null;return dirty?flush():true;}
    const generation=epoch,owner=uid,sending=structuredClone(data),sent=JSON.stringify(data);
    status('saving');
    const request=(async()=>{
      try{
        const committed=await backend.commit(owner,sending);
        if(generation!==epoch||deletionPending)return false;
        const changed=JSON.stringify(data)!==sent;
        data=mergeProgress(committed,data);dirty=changed;persist();onMerge(data.snapshot);status(dirty?'saving':'saved');return true;
      }catch(error){if(generation===epoch)failed(error);return false;}
    })();
    inFlight=request;
    const ok=await request;if(inFlight===request)inFlight=null;
    if(ok&&dirty)schedule();return ok;
  }
  async function retry(){
    if(!uid||!verified){status(uid?'unverified':'signed-out');return;}
    if(typeof storage.flush==='function')await flushLocal();
    else if(ready&&!cacheOK){persist();status(lastStatus);}
    if(deletionPending){status('deletion-pending');return;}
    if(!uid||!verified||!ready)return;
    if(!isOnline()){status('offline');return;}
    if(dirty&&!updateRequired){await flush();return;}
    const generation=epoch,owner=uid;
    try{const remote=await backend.read(owner);if(generation!==epoch||deletionPending)return;updateRequired=false;if(remote===null)dirty=true;data=mergeProgress(remote,data);persist();onMerge(data.snapshot);status(dirty?'saving':'saved');schedule();}
    catch(error){if(generation===epoch)failed(error);}
  }
  function guestAvailable(){return false;}
  // Kept as an explicit rejection for older UI integrations. Legacy copies stay untouched.
  async function importGuest(){
    throw Object.assign(Error('El progreso de invitado ya no se puede importar. Accede con tu cuenta para continuar.'),{code:'account/guest-disabled'});
  }
  async function pause(){clearTimeout(timer);ready=false;++epoch;await flushLocal();if(inFlight)await inFlight;}
  async function forget(id){
    if(typeof id!=='string'||!id)throw Error('Falta la cuenta cuya copia local se debe eliminar.');
    const ownsCurrent=uid===id;
    if(ownsCurrent){
      // Invalidate old callbacks before removing the account's local cache.
      clearTimeout(timer);ready=false;++epoch;++localWrite;dirty=false;localPending=false;
      data=makeEnvelope(emptySnapshot(),null,0);engineData=data;onRestore(data.snapshot);
    }
    const generation=epoch,pending=ownsCurrent?inFlight:null;
    try{
      if(pending)await pending;
      await storage.removeItem(key(id));
      if(typeof storage.flush==='function')await storage.flush();
      if(ownsCurrent&&uid===id&&generation===epoch)cacheOK=true;
      return true;
    }catch(cause){
      if(ownsCurrent&&uid===id&&generation===epoch){cacheOK=false;status('storage-error');}
      const error=new Error('No se pudo confirmar la eliminación de la copia de progreso de este dispositivo.',{cause});
      error.code='storage/delete-failed';
      throw error;
    }
  }
  return {select,save,flush,flushLocal,retry,importGuest,guestAvailable,pause,forget,getSnapshot:()=>structuredClone(data.snapshot),getOwner:()=>uid,isReady:()=>ready,hasPending:()=>dirty&&!!uid&&verified&&!deletionPending};
}
