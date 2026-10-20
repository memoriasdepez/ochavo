import {GAME_CONFIG,emptyGame,validateGame,emptyCommerce,validateCommerce,emptyGemCommerce,validateGemCommerce,isPremium,currentGame,dayKeyAt,dayOrdinal,dayWindow,claimIdsFor,normalizeCommand,sameCommand,newAttemptId,gameError,validateSkippedWorlds} from './game-domain.js';

export const gameStorageKey=uid=>'brote.progress.v1.game.'+(uid?'account.'+encodeURIComponent(uid):'guest');
const clone=value=>structuredClone(value);
/** Storage follows localStorage plus optional async setItem/removeItem/flush (Preferences). */
export function createGameStore({storage,backend=null,catalog={},config=GAME_CONFIG,now=()=>Date.now(),isOnline=()=>true,onView=()=>{},onStatus=()=>{},onEvent=()=>{},withLock}={}){
  if(!storage)throw Error('Falta el almacenamiento del juego.');
  let owner=null,verified=false,ready=false,epoch=0,status='loading',record=null,tail=Promise.resolve();
  let commerce=emptyCommerce(),commerceGems=emptyGemCommerce(),commerceConfirmed=false,gemsConfirmed=false,commerceRequest=0;
  // Retain the historical field name so existing account caches keep their format.
  const fresh=()=>({schema:1,state:emptyGame(config),receipts:{},knownClaims:[],skippedWorldIds:[],pending:null,guestId:newAttemptId()});
  const read=uid=>{
    if(!uid)throw gameError('auth-required','Inicia sesión con tu cuenta para continuar.');
    const raw=storage.getItem(gameStorageKey(uid));if(raw===null)return null;
    try{
      const value=JSON.parse(raw);
      if(value?.schema!==1||!value.receipts||typeof value.receipts!=='object'||Array.isArray(value.receipts)||typeof value.guestId!=='string')throw Error('format');
      value.skippedWorldIds=validateSkippedWorlds(value.skippedWorldIds);value.state=validateGame(value.state,config);if(value.pending)normalizeCommand(value.pending);
      // Protected purchase counters are never imported or written to the offline cache.
      delete value.commerce;delete value.commerceGems;
      if(!Array.isArray(value.knownClaims))value.knownClaims=[];return value;
    }catch(cause){throw Object.assign(gameError('storage-invalid','No se pudo leer la copia del juego. No la sustituiremos por un monedero vacío.'),{cause});}
  };
  const persist=async(uid,value)=>{if(!uid)throw gameError('auth-required','Inicia sesión con tu cuenta para continuar.');await storage.setItem(gameStorageKey(uid),JSON.stringify(value));if(storage.flush)await storage.flush();};
  const queue=task=>{const request=tail.then(task);tail=request.catch(()=>{});return request;};
  const lock=withLock||((name,task)=>globalThis.navigator?.locks?globalThis.navigator.locks.request(name,task):task());
  function achievements(state){
    return Object.values(catalog).filter(e=>e.kind==='badge').map(e=>{
      const current=e.metric==='cases'?state.completedCases.length:e.metric==='streak'?state.bestStreak:e.metric==='referrals'?state.referralCount:e.metric==='world'?(state.passedExamIds.includes(e.requiredClaim.replace('world-','exam-'))?1:0):state.completedLessons;
      return {id:e.badgeId,current:Math.min(current,e.threshold),target:e.threshold,earned:state.badges.includes(e.badgeId),reward:e.amount};
    });
  }
  function getView(){
    const day=dayKeyAt(now(),config.timeZone);let state=record?.state||emptyGame(config);
    try{state=currentGame(state,day,config);}catch{}
    if(!owner||!verified)state={...emptyGame(config),gems:0,lives:0};
    const usable=ready&&!!owner&&verified&&isOnline()&&!['storage-error','deletion-pending','loading','saving','error','pending'].includes(status);
    const streak=state.lastOpenDay&&dayOrdinal(day)-dayOrdinal(state.lastOpenDay)>1?0:state.streak;
    const trusted=!!owner&&verified&&isOnline()&&commerceConfirmed;
    const premium=trusted&&isPremium(commerce,now()),paidLives=trusted?commerce.paidLives:0;
    const trustedGems=!!owner&&verified&&isOnline()&&gemsConfirmed,paidGems=trustedGems?commerceGems.balance:0;
    const lifetimePremium=premium&&commerce.lifetimePremium===true;
    const paidPremiumUntilMs=trusted?(commerce.lifetimePremium?commerce.paidPremiumUntilMs:commerce.premiumUntilMs):0;
    return {...clone(state),gems:state.gems+paidGems,earnedGems:state.gems,paidGems,gemsConfirmed:trustedGems,gemDebt:trustedGems?Math.max(0,commerceGems.consumed-commerceGems.granted):0,skippedWorldIds:owner&&verified?[...(record?.skippedWorldIds||[])]:[],owner,status,day,nextReset:dayWindow(day,config.timeZone).endAt,streak,premium,lifetimePremium,paidSubscriptionActive:paidPremiumUntilMs>now(),paidPremiumUntilMs,paidLives,totalLives:state.lives+paidLives,premiumUntilMs:trusted?commerce.premiumUntilMs:0,commerceStore:trusted?commerce.store:null,commerceConfirmed:trusted,canPlay:usable&&(premium||state.lives+paidLives>0),canSpend:usable,canPractice:ready&&!!owner&&verified,achievements:achievements(state),pending:!!record?.pending};
  }
  function notify(next=status){status=next;onStatus(status);onView(getView());}
  function failure(error,generation){
    if(generation!==epoch)return;
    const business=String(error?.code).startsWith('game/')&&!['game/storage-write','game/storage-invalid','game/not-configured','game/calendar-unavailable','game/calendar-invalid','game/update-required','game/identity-changed'].includes(error.code);
    notify(error?.code==='account/deletion-pending'?'deletion-pending':String(error?.code).startsWith('game/storage')?'storage-error':!isOnline()?'offline':business?'saved':'error');
  }
  const assertIdentity=(generation,uid)=>{if(generation!==epoch||owner!==uid)throw gameError('identity-changed','La cuenta cambió. La operación no se trasladó a la nueva cuenta.');};
  const assertAccess=()=>{
    if(!owner)throw gameError('auth-required','Inicia sesión con tu cuenta para continuar.');
    if(!verified)throw gameError('verification-required','Verifica tu correo para continuar con esta cuenta.');
    if(!ready)throw gameError('not-ready','Espera a recuperar el juego.');
  };
  async function select(user){
    const generation=++epoch;owner=!user?.isAnonymous&&typeof user?.uid==='string'&&user.uid?user.uid:null;verified=!!owner&&!!user?.emailVerified;ready=false;record=null;commerce=emptyCommerce();commerceGems=emptyGemCommerce();commerceConfirmed=gemsConfirmed=false;++commerceRequest;notify('loading');
    const uid=owner;
    if(!uid||!verified){notify(uid?'unverified':'signed-out');return getView();}
    try{
      if(storage.flush)await storage.flush();assertIdentity(generation,uid);
      record=read(uid)||fresh();
      if(isOnline()){
        if(!backend)throw gameError('not-configured','La conexión del juego no está configurada.');
        const [state,funds,skipped,gemFunds]=await Promise.all([backend.read(uid),backend.readCommerce?backend.readCommerce(uid):null,backend.readSkips?backend.readSkips(uid):[],backend.readGemCommerce?backend.readGemCommerce(uid):null]);assertIdentity(generation,uid);record.state=state;record.skippedWorldIds=validateSkippedWorlds(skipped);commerce=validateCommerce(funds);commerceGems=validateGemCommerce(gemFunds);commerceConfirmed=gemsConfirmed=true;await persist(uid,record);
      }
      assertIdentity(generation,uid);ready=true;notify(!isOnline()?'offline':record.pending?'pending':'saved');return getView();
    }catch(error){failure(error,generation);throw error;}
  }
  async function dispatch(raw){
    assertAccess();
    const command=normalizeCommand(raw),generation=epoch,uid=owner;
    return queue(()=>lock('viruta-game-'+gameStorageKey(uid),async()=>{
      assertIdentity(generation,uid);
      assertAccess();
      if(!isOnline()){notify('offline');throw gameError('offline','Conecta a internet para confirmar esta operación. Puedes consultar las explicaciones disponibles.');}
      if(status==='deletion-pending')throw Object.assign(Error('La cuenta está en proceso de borrado.'),{code:'account/deletion-pending'});
      let active=read(uid)||record||fresh();
      if(active.pending&&!sameCommand(active.pending,command))throw gameError('pending-operation','Hay una operación pendiente. Reinténtala antes de hacer otra compra o entrega.');
      notify('saving');
      try{
        // Persist the intent before a remote mutation. A lost response retains the same attempt ID.
        active.pending=command;
        try{await persist(uid,active);}catch(cause){throw Object.assign(gameError('storage-write','No se pudo guardar el intento en este dispositivo.'),{cause});}
        assertIdentity(generation,uid);
        record=active;notify('saving');
        const result=await backend.commit(uid,command);
        active.state=result.state;active.pending=null;if(result.skippedWorldIds)active.skippedWorldIds=validateSkippedWorlds(result.skippedWorldIds);
        active.knownClaims=[...new Set([...active.knownClaims,...claimIdsFor(command,result.state,result.receipt?.day||dayKeyAt(now(),config.timeZone),catalog[command.target])])];
        // Always finish the originating account's durable cache, never the newly selected account.
        try{await persist(uid,active);}catch(cause){
          active.pending=command;
          if(generation===epoch)record=active;
          throw Object.assign(gameError('storage-write','La operación pudo guardarse, pero falta confirmar su copia local. Reintenta el mismo intento.'),{cause});
        }
        assertIdentity(generation,uid);record=active;if(uid&&result.commerce){commerce=validateCommerce(result.commerce);commerceConfirmed=true;}if(uid&&result.commerceGems){commerceGems=validateGemCommerce(result.commerceGems);gemsConfirmed=true;}++commerceRequest;
        // A decorative observer cannot fail a durably confirmed game transaction.
        try{onEvent({owner:uid,receipt:clone(result.receipt),duplicate:result.duplicate===true});}catch{}
        notify('saved');
        return result;
      }catch(error){
        // Business validation failures have not mutated the wallet and should not block all future actions.
        if(String(error?.code).startsWith('game/')&&!['game/storage-write','game/identity-changed','game/offline'].includes(error.code)){
          active.pending=null;
          if(uid&&isOnline()){try{active.state=await backend.read(uid);if(backend.readSkips)active.skippedWorldIds=validateSkippedWorlds(await backend.readSkips(uid));if(backend.readGemCommerce){const funds=await backend.readGemCommerce(uid);assertIdentity(generation,uid);commerceGems=validateGemCommerce(funds);gemsConfirmed=true;}}catch{if(generation===epoch){commerceGems=emptyGemCommerce();gemsConfirmed=false;}}}
          try{await persist(uid,active);}catch{}
          if(generation===epoch)record=active;
        }
        failure(error,generation);throw error;
      }
    }));
  }
  const claimLesson=id=>dispatch({kind:'lesson',target:'lesson-'+id});
  const claimBadge=id=>dispatch({kind:'badge',target:'badge-'+id});
  async function awardAchievements(){
    assertAccess();
    const results=[];
    for(const badge of getView().achievements)if(!badge.earned&&badge.current>=badge.target)results.push(await claimBadge(badge.id));
    return results;
  }
  async function reconcileProgress(snapshot={}){
    assertAccess();
    const results=[];
    for(const id of Object.keys(snapshot.completed||{}))if(/^\d+$/.test(id)&&catalog['lesson-'+id]&&!record.knownClaims.includes('lesson-'+id))results.push(await claimLesson(+id));
    for(const [id,value] of Object.entries(snapshot.passedExams||{}))if(/^\d+$/.test(id)&&catalog['exam-'+id]&&(value?.passed===true||value?.best>=8)&&!record.state.passedExamIds.includes('exam-'+id))results.push(await dispatch({kind:'exam-credit',target:'exam-'+id}));
    for(const id of Object.keys(snapshot.completedCases||{}))if(getView().premium&&!record.state.completedCases.includes(id))results.push(await dispatch({kind:'case-complete',target:'complete-'+id}));
    results.push(...await awardAchievements());return results;
  }
  async function retry(){
    if(!owner||!verified)return select(owner?{uid:owner,emailVerified:verified}:null);
    const uid=owner;
    if(storage.flush)await storage.flush();
    if(owner!==uid)throw gameError('identity-changed','La cuenta cambió. Reintenta desde la cuenta abierta.');
    if(!ready){
      await select({uid,emailVerified:true});
      if(owner!==uid)throw gameError('identity-changed','La cuenta cambió. Reintenta desde la cuenta abierta.');
      const recovered=read(uid);if(recovered?.pending)return dispatch(recovered.pending);
      return getView();
    }
    const cached=read(uid);if(cached?.pending)return dispatch(cached.pending);
    return select({uid,emailVerified:true});
  }
  // Older integrations receive a clear rejection; no legacy anonymous data is read or removed.
  async function importGuest(){
    throw Object.assign(Error('El progreso de invitado ya no se puede importar.'),{code:'account/guest-disabled'});
  }
  const finishGuestImport=importGuest;
  async function openApp(){
    if(ready&&record?.state.lastOpenDay===dayKeyAt(now(),config.timeZone)&&!record.pending){notify(status);return {state:clone(record.state),receipt:null,duplicate:true};}
    return dispatch({kind:'open'});
  }
  async function refreshCommerce(){
    const uid=owner,generation=epoch,request=++commerceRequest;
    commerceConfirmed=gemsConfirmed=false;notify(status);
    if(!uid||!verified||!isOnline()){commerce=emptyCommerce();commerceGems=emptyGemCommerce();return getView();}
    if(!backend?.readCommerce)throw gameError('not-configured','Las compras todavía no están configuradas.');
    try{
      const [funds,gemFunds]=await Promise.all([backend.readCommerce(uid),backend.readGemCommerce?backend.readGemCommerce(uid):null]);assertIdentity(generation,uid);
      if(request===commerceRequest){commerce=validateCommerce(funds);commerceGems=validateGemCommerce(gemFunds);commerceConfirmed=gemsConfirmed=true;notify(status);}
      return getView();
    }catch(error){if(generation===epoch&&request===commerceRequest){commerce=emptyCommerce();commerceGems=emptyGemCommerce();commerceConfirmed=gemsConfirmed=false;notify(status);}throw error;}
  }
  async function flushLocal(){try{if(storage.flush)await storage.flush();return true;}catch{notify('storage-error');return false;}}
  async function pause(){ready=false;commerceConfirmed=gemsConfirmed=false;++epoch;await tail;return flushLocal();}
  async function forget(uid){
    if(typeof uid!=='string'||!uid)throw gameError('identity','Falta la cuenta que se debe olvidar.');
    if(owner===uid){ready=false;++epoch;record=null;commerce=emptyCommerce();commerceGems=emptyGemCommerce();commerceConfirmed=gemsConfirmed=false;notify('loading');}
    await tail;await storage.removeItem(gameStorageKey(uid));if(storage.flush)await storage.flush();return true;
  }
  return {select,getView,refreshCommerce,retry,flushLocal,pause,forget,importGuest,finishGuestImport,reconcileProgress,awardAchievements,claimLesson,claimBadge,openApp,
    guestAvailable:()=>false,
    answer:({lessonId,stepId,attemptId,correct})=>dispatch({kind:'answer',target:`answer-${lessonId}-${stepId}`,attemptId,correct}),
    gradeExam:({examId,attemptId,wrongCount,passed})=>dispatch({kind:'exam',target:'exam-'+examId,attemptId,wrongCount,passed}),
    skipWorld:worldId=>dispatch({kind:'skip-world',target:'skip-world-'+worldId}),
    buyLife:({requestId}={})=>dispatch({kind:'refill',attemptId:requestId||newAttemptId()}),
    unlockCase:({caseId,requestId}={})=>dispatch({kind:'case',target:caseId,attemptId:requestId||''}),
    completeCase:caseId=>dispatch({kind:'case-complete',target:'complete-'+caseId}),
    claimReferral:receiptId=>dispatch({kind:'referral',target:receiptId})};
}
