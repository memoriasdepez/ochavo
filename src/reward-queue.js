export const rewardStorageKey=uid=>'brote.progress.v1.rewards.account.'+encodeURIComponent(uid);
const fresh=()=>({version:1,seen:[],gems:0,badges:[]});
const copy=value=>structuredClone(value);

/** Presentation of confirmed rewards only. The server remains the wallet;
 * collecting a chest acknowledges its display, never grants money again. */
export function createRewardMotion({storage=null,present=()=>{},clear=()=>{},onChange=()=>{},onError=()=>{}}={}){
 let owner=null,epoch=0,home=false,state=fresh(),active=null,invalid=false,tail=Promise.resolve();
 const emit=()=>{if(active)present(copy(active));else clear();onChange();};
 const persist=(value=state,uid=owner)=>{
  if(!storage||!uid||invalid)return Promise.resolve();
  const encoded=JSON.stringify(value);
  const request=tail.then(async()=>{await storage.setItem(rewardStorageKey(uid),encoded);await storage.flush?.();});
  tail=request.catch(()=>{});return request;
 };
 function next(){
  if(!owner||!home||active||invalid)return false;
  if(state.badges.length)active={kind:'badge',id:state.badges[0],remaining:state.badges.length+(state.gems?1:0),saving:false};
  else if(state.gems)active={kind:'gems',phase:'closed',gems:state.gems,remaining:1,saving:false};
  else return false;
  emit();return true;
 }
 function setOwner(uid){
  uid=typeof uid==='string'&&uid?uid:null;if(uid===owner)return false;
  ++epoch;owner=uid;home=false;active=null;state=fresh();invalid=false;clear();
  if(uid&&storage){try{
   const raw=storage.getItem(rewardStorageKey(uid));
   if(raw){const saved=JSON.parse(raw);
    if(saved?.version!==1||!Number.isSafeInteger(saved.gems)||saved.gems<0||!Array.isArray(saved.seen)||saved.seen.length>10000||!saved.seen.every(id=>typeof id==='string'&&id.length<=200)||!Array.isArray(saved.badges)||saved.badges.length>512||!saved.badges.every(id=>typeof id==='string'&&/^[a-z0-9-]{1,80}$/.test(id)))throw Error('No se pudo leer la cola de recompensas.');
    state={version:1,seen:[...new Set(saved.seen)],gems:saved.gems,badges:[...new Set(saved.badges)]};
   }
  }catch(error){invalid=true;onError(error);}}
  onChange();return true;
 }
 function receive(event){
  const r=event?.receipt;
  if(!owner||invalid||event.owner!==owner||event.duplicate||typeof r?.id!=='string'||r.id.length>200||state.seen.includes(r.id))return false;
  const gems=Number.isSafeInteger(r.gemDelta)&&r.gemDelta>0?r.gemDelta:0;
  const badge=r.kind==='badge'&&typeof r.target==='string'&&/^badge-[a-z0-9-]{1,80}$/.test(r.target)?r.target.slice(6):null;
  if(!gems&&!badge)return false;
  if(!Number.isSafeInteger(state.gems+gems))return false;
  state.seen.push(r.id);state.seen=state.seen.slice(-10000);state.gems+=gems;
  if(badge&&!state.badges.includes(badge))state.badges.push(badge);
  void persist().catch(onError);onChange();return true;
 }
 function setHome(value){home=value===true;if(!home&&active){active=null;emit();}}
 function reset(){++epoch;home=false;active=null;clear();}
 function openChest(){if(!home||active?.kind!=='gems'||active.phase!=='closed'||active.saving)return false;active.phase='open';emit();return true;}
 async function advance(){
  if(!home||!active||active.saving||active.kind==='gems'&&active.phase!=='open')return false;
  const ticket=epoch,uid=owner,current=active;current.saving=true;current.error='';emit();
  // Receipts may arrive during a native write. Keep them in memory; persist a
  // candidate without the acknowledged reward before releasing the display.
  const candidate=copy(state);
  if(current.kind==='badge')candidate.badges=candidate.badges.filter(id=>id!==current.id);
  else candidate.gems=Math.max(0,candidate.gems-current.gems);
  try{await persist(candidate,uid);}catch(error){
   if(ticket===epoch&&uid===owner&&active===current){current.saving=false;current.error='No se pudo guardar. Pulsa CONTINUAR para reintentarlo.';emit();}onError(error);return false;
  }
  if(ticket!==epoch||uid!==owner||!home||active!==current)return false;
  if(current.kind==='badge')state.badges=state.badges.filter(id=>id!==current.id);
  else state.gems=Math.max(0,state.gems-current.gems);
  // Persist any receipts added while the acknowledgement was being written.
  await persist().catch(onError);
  if(ticket!==epoch||uid!==owner||!home||active!==current)return false;
  active=null;emit();next();return true;
 }
 function wallet(view){
  if(!owner||view?.owner!==owner||invalid)return view;
  const held=Math.min(state.gems,Math.max(0,view.earnedGems??view.gems??0));
  return {...view,gems:Math.max(0,(view.gems??0)-held),earnedGems:Math.max(0,(view.earnedGems??view.gems??0)-held),pendingRewardGems:state.gems};
 }
 async function forget(uid){if(owner===uid){reset();state=fresh();owner=null;onChange();}await tail;if(storage){await storage.removeItem(rewardStorageKey(uid));await storage.flush?.();}}
 return {receive,setOwner,setHome,reset,showPending:next,openChest,continue:advance,wallet,forget,
  getView:()=>active?copy(active):null,pending:()=>({gems:state.gems,badges:[...state.badges]}),flush:()=>tail};
}
