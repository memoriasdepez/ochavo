/** Pure economy. Learning is client-attested; balances and one-time claims are not merged. */
import {WORLD_COUNT,TRACKS,CASE_IDS,ALL_TRACKS,FREE_INTRO_WORLD_ID} from './tracks.js';
export const GAME_CONFIG = Object.freeze({version:2,timeZone:'Europe/Madrid',dailyLives:5,welcomeGems:200,worldSkipCost:200,refillCost:20,caseCost:100,answerReward:1,lessonReward:10,examReward:30,worldReward:50,badgeReward:10,caseReward:10,referralReward:30,dailyReward:2,streakRewards:{3:5,7:20,30:50}});
const DAY=86400000;
export const gameError=(code,message)=>Object.assign(new Error(message),{code:'game/'+code});
const integer=(x,min=0,max=10000000)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
const safeId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,160}$/.test(x);
export const newAttemptId=()=>globalThis.crypto.randomUUID();
// Commerce is supplied only by the server backend, never imported from guest storage.
export const emptyCommerce=()=>({schemaVersion:1,revision:0,premiumUntilMs:0,store:'',environment:'production',paidGranted:0,paidConsumed:0,paidLives:0});
// Purchased gems stay in their own server ledger. Refunds retain consumed debt.
export const emptyGemCommerce=()=>({schemaVersion:1,revision:0,environment:'production',granted:0,consumed:0,balance:0});
export function validateGemCommerce(value){
  if(!value)return emptyGemCommerce();
  const out={};for(const key of Object.keys(emptyGemCommerce()))out[key]=value[key];
  if(out.schemaVersion!==1||!['production','sandbox'].includes(out.environment)
    ||!['revision','granted','consumed','balance'].every(k=>Number.isSafeInteger(out[k])&&out[k]>=0)
    ||out.balance!==Math.max(0,out.granted-out.consumed))throw gameError('invalid-commerce','No se pudo verificar el saldo de gemas compradas.');
  return out;
}
export const LIFETIME_PREMIUM_UNTIL_MS=253402300799000;
export function validateCommerce(value){
  if(!value)return emptyCommerce();
  const out={};for(const key of Object.keys(emptyCommerce()))out[key]=value[key];
  if(out.schemaVersion!==1||!['production','sandbox'].includes(out.environment)||!['','app_store','play_store','rc_billing'].includes(out.store)
    ||!['revision','premiumUntilMs','paidGranted','paidConsumed','paidLives'].every(k=>Number.isSafeInteger(out[k])&&out[k]>=0)
    ||out.paidLives!==Math.max(0,out.paidGranted-out.paidConsumed))throw gameError('invalid-commerce','No se pudo verificar el saldo de compras.');
  // These derived fields exist only in server-confirmed responses, never in the billing document.
  if(value.lifetimePremium===true){
    if(out.premiumUntilMs!==LIFETIME_PREMIUM_UNTIL_MS||!Number.isSafeInteger(value.paidPremiumUntilMs)||value.paidPremiumUntilMs<0)throw gameError('invalid-commerce','No se pudo verificar el acceso promocional.');
    out.lifetimePremium=true;out.paidPremiumUntilMs=value.paidPremiumUntilMs;
  }
  return out;
}
/** Combine independent, protected server documents; a billing refresh cannot erase this grant. */
export function effectiveCommerce(billing,grant){
  const funds=validateCommerce(billing?{...billing,lifetimePremium:false}:null);
  if(!grant)return funds;
  const grantedAt=typeof grant.grantedAt?.toMillis==='function'?grant.grantedAt.toMillis():grant.grantedAt;
  if(grant.schemaVersion!==1||!/^[a-f0-9]{64}$/.test(grant.codeHash)||!Number.isFinite(grantedAt)||grantedAt<=0)throw gameError('invalid-commerce','No se pudo verificar el acceso promocional.');
  return {...funds,paidPremiumUntilMs:funds.premiumUntilMs,premiumUntilMs:LIFETIME_PREMIUM_UNTIL_MS,lifetimePremium:true};
}
export const isPremium=(commerce,now=Date.now())=>!!commerce&&commerce.premiumUntilMs>now;
export function dayKeyAt(now=Date.now(),timeZone=GAME_CONFIG.timeZone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
  const get=t=>parts.find(p=>p.type===t).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function dayOrdinal(day){
  if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw gameError('invalid-day','Fecha de juego no válida.');
  const stamp=Date.parse(day+'T00:00:00Z');
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==day)throw gameError('invalid-day','Fecha de juego no válida.');
  return stamp/DAY;
}
function midnight(day,timeZone){
  const nominal=dayOrdinal(day)*DAY;
  let result=nominal;
  const fmt=new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let n=0;n<4;n++){
    const p=Object.fromEntries(fmt.formatToParts(new Date(result)).filter(v=>v.type!=='literal').map(v=>[v.type,+v.value]));
    const local=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const next=result+(nominal-local);if(next===result)break;result=next;
  }
  return result;
}
export function dayWindow(now=Date.now(),timeZone=GAME_CONFIG.timeZone){
  const dayKey=typeof now==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(now)?now:dayKeyAt(now,timeZone);
  const ordinal=dayOrdinal(dayKey),next=new Date((ordinal+1)*DAY).toISOString().slice(0,10);
  return {dayKey,ordinal,startAt:midnight(dayKey,timeZone),endAt:midnight(next,timeZone)};
}
export function emptyGame(config=GAME_CONFIG){return {schemaVersion:1,revision:0,gems:config.welcomeGems,lives:config.dailyLives,lifeDay:'',lastOpenDay:'',streak:0,bestStreak:0,unlockedCases:[],completedCases:[],badges:[],completedLessons:0,passedExams:0,passedExamIds:[],referralCount:0,lastEventId:''};}
export function validateGame(value,config=GAME_CONFIG){
  if(!value||value.schemaVersion!==1)throw gameError('invalid-state','No se pudo leer el estado del juego.');
  const out={};
  for(const key of Object.keys(emptyGame(config)))out[key]=structuredClone(value[key]);
  for(const key of ['revision','gems','streak','bestStreak','completedLessons','passedExams','referralCount'])if(!integer(out[key]))throw gameError('invalid-state','El estado del juego contiene un valor no válido.');
  if(!integer(out.lives,0,config.dailyLives))throw gameError('invalid-state','El número de vidas no es válido.');
  for(const key of ['lifeDay','lastOpenDay'])if(out[key]!=='')dayOrdinal(out[key]);
  for(const key of ['unlockedCases','completedCases','badges','passedExamIds'])if(!Array.isArray(out[key])||out[key].length>WORLD_COUNT+30||out[key].some(x=>!safeId(x))||new Set(out[key]).size!==out[key].length)throw gameError('invalid-state','Los logros guardados no son válidos.');
  if(typeof out.lastEventId!=='string'||out.lastEventId.length>180)throw gameError('invalid-state','La última operación no es válida.');
  return out;
}
export function currentGame(state,day,config=GAME_CONFIG){
  const next=validateGame(state,config),ordinal=dayOrdinal(day);
  if(next.lifeDay&&ordinal<dayOrdinal(next.lifeDay))throw gameError('clock','La fecha del dispositivo ha retrocedido. Revisa la hora antes de continuar.');
  if(next.lifeDay!==day){next.lifeDay=day;next.lives=config.dailyLives;}
  return next;
}
export function normalizeCommand(input){
  if(!input||!['open','answer','answer-credit','lesson','exam','exam-credit','refill','case','case-complete','badge','referral','skip-world','import-debit'].includes(input.kind))throw gameError('invalid-action','Operación de juego no válida.');
  const kind=input.kind,target=input.target||'',attemptId=input.attemptId||'';
  if(target&&!safeId(target))throw gameError('invalid-action','Identificador no válido.');
  if(attemptId&&!safeId(attemptId))throw gameError('invalid-action','Identificador de intento no válido.');
  if(['answer','exam','refill','import-debit'].includes(kind)&&!attemptId)throw gameError('invalid-action','Conserva un identificador para este intento.');
  if(['answer','answer-credit','lesson','exam','exam-credit','case','case-complete','badge','referral','skip-world'].includes(kind)&&!target)throw gameError('invalid-action','Falta identificar el logro o el caso.');
  const command={kind,target,attemptId,correct:input.correct===true,wrongCount:input.wrongCount??0,passed:input.passed===true,amount:input.amount??0};
  if(!integer(command.wrongCount,0,10)||!integer(command.amount))throw gameError('invalid-action','El resultado de la operación no es válido.');
  return command;
}
export function eventIdFor(command,day){
  const c=normalizeCommand(command);
  if(c.kind==='open')return 'open-'+day;
  if(c.attemptId)return 'attempt-'+c.attemptId;
  if(['answer','exam','refill','import-debit'].includes(c.kind))return 'attempt-'+c.attemptId;
  return c.kind+'-'+c.target;
}
export function sameCommand(a,b){return JSON.stringify(normalizeCommand(a))===JSON.stringify(normalizeCommand(b));}
export function claimIdsFor(command,state,day,entry){
  const c=normalizeCommand(command),ids=[];
  if(c.kind==='open'){
    ids.push('open-'+day);
    const streak=state.lastOpenDay===day?state.streak:state.lastOpenDay&&dayOrdinal(day)-dayOrdinal(state.lastOpenDay)===1?state.streak+1:1;
    if([3,7,30].includes(streak))ids.push('streak-'+streak);
  }
  if((c.kind==='answer'&&c.correct)||c.kind==='answer-credit')ids.push(c.target);
  if(['lesson','badge','case-complete','skip-world'].includes(c.kind))ids.push(c.target);
  if((c.kind==='exam'&&c.passed)||c.kind==='exam-credit'){ids.push(c.target);if(entry?.bonusId)ids.push(entry.bonusId);}
  if(c.kind==='referral')ids.push('referral-'+c.target);
  return ids;
}
function checkEntry(c,entry){
  const expected=c.kind==='exam-credit'?'exam':c.kind==='answer-credit'?'answer':c.kind;
  if(!entry||entry.kind!==expected)throw gameError('unknown-reward','Este ejercicio, logro o caso no está en el catálogo.');
}
/** existingClaims is authoritative in a transaction, receipts make retries idempotent. */
export function applyGameCommand(previous,raw,{day,config=GAME_CONFIG,entry=null,existingClaims=[],existingEvent=null,referralVerified=false,commerce=null,commerceGems=null,now=Date.now(),skippedWorldIds=[]}={}){
  const command=normalizeCommand(raw),id=eventIdFor(command,day),state=currentGame(previous,day,config);
  const funds=validateCommerce(commerce),premium=isPremium(funds,now);
  const gemFunds=validateGemCommerce(commerceGems);
  const spendGems=(cost,message)=>{
    const earned=Math.min(cost,state.gems),paid=cost-earned;
    if(paid>gemFunds.balance)throw gameError('insufficient-gems',message);
    state.gems-=earned;gemFunds.consumed+=paid;gemFunds.balance=Math.max(0,gemFunds.granted-gemFunds.consumed);
    if(!Number.isSafeInteger(gemFunds.consumed))throw gameError('balance-limit','El saldo supera el límite admitido.');
  };
  const spendLives=count=>{
    if(premium)return;
    const daily=Math.min(count,state.lives),paid=Math.min(count-daily,funds.paidLives);
    state.lives-=daily;funds.paidConsumed+=paid;funds.paidLives-=paid;
  };
  if(existingEvent){
    if(!sameCommand(existingEvent,command))throw gameError('attempt-conflict','Ese intento ya corresponde a otra operación.');
    return {state:validateGame(previous,config),commerce:funds,commerceGems:gemFunds,receipt:structuredClone(existingEvent),claims:[],duplicate:true,skippedWorldIds:validateSkippedWorlds(skippedWorldIds)};
  }
  const skipped=validateSkippedWorlds(skippedWorldIds),claimed=new Set(existingClaims),grants=[];
  const grant=(claimId,amount)=>{if(!claimed.has(claimId)){grants.push({id:claimId,amount});state.gems+=amount;return true;}return false;};
  const beforeGems=state.gems,beforeLives=state.lives;
  if(command.kind==='open'){
    if(state.lastOpenDay!==day){state.streak=state.lastOpenDay&&dayOrdinal(day)-dayOrdinal(state.lastOpenDay)===1?state.streak+1:1;state.lastOpenDay=day;state.bestStreak=Math.max(state.bestStreak,state.streak);}
    grant('open-'+day,previous.lastOpenDay===''?0:config.dailyReward);
    if(Object.hasOwn(config.streakRewards,state.streak))grant('streak-'+state.streak,config.streakRewards[state.streak]);
  }else if(command.kind==='answer'||command.kind==='answer-credit'){
    checkEntry(command,entry);
    if(command.kind==='answer'&&!premium&&state.lives+funds.paidLives<1)throw gameError('no-lives','No quedan vidas. Puedes recargar o volver tras el reinicio diario.');
    if(command.correct||command.kind==='answer-credit')grant(command.target,entry.amount);else spendLives(1);
  }else if(command.kind==='exam'||command.kind==='exam-credit'){
    checkEntry(command,entry);
    if(command.kind==='exam'){
      if(!premium&&state.lives+funds.paidLives<1)throw gameError('no-lives','Necesitas al menos una vida para entregar o repetir el examen.');
      if(command.wrongCount>entry.questions||command.passed!==(entry.questions-command.wrongCount>=entry.passCount))throw gameError('invalid-result','La nota y el resultado del examen no coinciden.');
      spendLives(command.wrongCount);
    }
    if(command.passed||command.kind==='exam-credit'){if(grant(command.target,entry.amount)){state.passedExams++;state.passedExamIds.push(command.target);}grant(entry.bonusId,entry.bonusAmount);}
  }else if(command.kind==='lesson'){
    checkEntry(command,entry);if(grant(command.target,entry.amount))state.completedLessons++;
   }else if(command.kind==='skip-world'){
    checkEntry(command,entry);
    const expectedCost=entry.worldId===FREE_INTRO_WORLD_ID?0:config.worldSkipCost;
    if(command.attemptId||!Number.isSafeInteger(entry.worldId)||command.target!=='skip-world-'+entry.worldId||entry.cost!==expectedCost||entry.amount!==0)throw gameError('invalid-action','No se pudo verificar el precio de este salto.');
    if(skipped.includes(entry.worldId)||claimed.has(command.target))throw gameError('world-skipped','Este mundo ya está saltado.');
    if(state.passedExamIds.includes('exam-'+entry.worldId))throw gameError('world-complete','Ya has aprobado el examen de este mundo.');
    if(entry.previousWorldId!==-1&&!skipped.includes(entry.previousWorldId)&&!state.passedExamIds.includes('exam-'+entry.previousWorldId))throw gameError('world-locked','Llega primero a este mundo para poder saltarlo.');
    spendGems(entry.cost,'Necesitas 200 gemas para saltar este mundo.');
    skipped.push(entry.worldId);grant(command.target,0);
  }else if(command.kind==='refill'){
    if(state.lives>=config.dailyLives)throw gameError('lives-full','Ya tienes las cinco vidas disponibles.');
    spendGems(config.refillCost,'No hay gemas suficientes para recargar.');state.lives=config.dailyLives;
  }else if(command.kind==='case'){
    throw gameError('premium-required','Los casos prácticos están incluidos en Ochavo Plus.');
  }else if(command.kind==='case-complete'){
    checkEntry(command,entry);
    if(!premium)throw gameError('premium-required','Necesitas una suscripción activa para completar este caso.');
    if(grant(command.target,entry.amount))state.completedCases.push(entry.caseId);
  }else if(command.kind==='badge'){
    checkEntry(command,entry);
    const count=entry.metric==='cases'?state.completedCases.length:entry.metric==='streak'?state.bestStreak:entry.metric==='referrals'?state.referralCount:state.completedLessons;
    if(entry.requiredClaim?!claimed.has(entry.requiredClaim):count<entry.threshold)throw gameError('badge-locked','Todavía no se cumple el requisito de esta insignia.');
    if(grant(command.target,entry.amount))state.badges.push(entry.badgeId);
  }else if(command.kind==='referral'){
    if(!referralVerified)throw gameError('referral-unverified','La invitación todavía no tiene una acreditación verificada.');
    if(grant('referral-'+command.target,config.referralReward))state.referralCount++;
  }else if(command.kind==='import-debit'){
    // Imports may burn past expenditure. They never accept a client-provided credit.
    state.gems-=Math.min(command.amount,state.gems);
  }
  if(!integer(state.gems))throw gameError('balance-limit','El saldo supera el límite admitido.');
  state.revision++;state.lastEventId=id;
  const candidates=claimIdsFor(command,previous,day,entry),primary=grants.find(g=>g.id===candidates[0]),secondary=grants.find(g=>g.id===candidates[1]);
  const receipt={...command,id,day,revision:state.revision,gemDelta:state.gems-beforeGems,lifeDelta:state.lives-beforeLives,rewardId:primary?.id||'',rewardAmount:primary?.amount||0,bonusId:secondary?.id||'',bonusAmount:secondary?.amount||0};
  return {state,commerce:funds,commerceGems:gemFunds,receipt,claims:grants,duplicate:false,skippedWorldIds:skipped};
}
export function createGameCatalog({lessons=[],exams=[],caseIds=CASE_IDS,config=GAME_CONFIG}={}){
  const catalog={};
  for(const track of ALL_TRACKS)for(const [index,worldId] of track.groupIds.entries())catalog['skip-world-'+worldId]={kind:'skip-world',worldId,previousWorldId:index?track.groupIds[index-1]:(track.previousWorldId??-1),cost:worldId===FREE_INTRO_WORLD_ID?0:config.worldSkipCost,amount:0};
  for(const l of lessons){catalog['lesson-'+l.id]={kind:'lesson',amount:config.lessonReward};l.steps.forEach((s,i)=>{if(s.type!=='learn')catalog[`answer-${l.id}-${i}`]={kind:'answer',amount:config.answerReward};});}
  for(const e of exams)catalog['exam-'+e.id]={kind:'exam',amount:config.examReward,bonusId:'world-'+e.id,bonusAmount:config.worldReward,questions:10,passCount:8};
  for(const [i,id] of caseIds.entries()){if(!safeId(id))throw gameError('invalid-case','El caso necesita un identificador estable.');const world=/^case-[1-9][0-9]*$/.test(id)?Number(id.slice(5))-1:i;catalog[id]={kind:'case',cost:config.caseCost,requiredClaim:'exam-'+world};catalog['complete-'+id]={kind:'case-complete',caseId:id,amount:config.caseReward};}
  const badge=(id,metric,threshold,requiredClaim='')=>catalog['badge-'+id]={kind:'badge',badgeId:id,metric,threshold,requiredClaim,amount:config.badgeReward};
  badge('first-lesson','lessons',1);for(const n of [10,50,100,200])badge('lessons-'+n,'lessons',n);
  for(let i=0;i<WORLD_COUNT;i++)badge('world-'+i,'world',1,'world-'+i);
  for(const n of [3,7,30])badge('streak-'+n,'streak',n);
  for(const n of [1,5,20])badge('cases-'+n,'cases',n);
  for(const n of [1,3,10])badge('invite-'+n,'referrals',n);
  return catalog;
}

/** Separate from learning progress: a purchased shortcut never claims a passed exam. */
export function validateSkippedWorlds(value=[]){
 const ids=new Set(ALL_TRACKS.flatMap(t=>t.groupIds));
 if(!Array.isArray(value)||value.length>WORLD_COUNT||value.some(id=>!Number.isSafeInteger(id)||!ids.has(id))||new Set(value).size!==value.length)throw gameError('invalid-state','No se pudieron verificar los mundos saltados.');
 return [...value];
}
