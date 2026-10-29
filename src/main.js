import {createIcons,Lock,Route,BookOpen,FlaskConical,ChartNoAxesCombined,Layers,Blocks,UserRound,BriefcaseBusiness,Store,Globe,Repeat,Scale,ChartPie,Network,KeyRound,CircleDollarSign,Vote,Building2,Landmark,ShieldCheck,Coins,Monitor,Factory,Play,Search,ChartColumnIncreasing,Trophy,Flag,ChevronRight,Check,Sprout,Hourglass,FastForward,Gem,ChartCandlestick,Receipt,Server,Settings,Puzzle,Laptop,Flame,Zap,Cpu,Palette,ShoppingBasket,House,Plane,CreditCard,Fuel,Warehouse,Pill,FileSearch,MousePointer2,ArrowLeftRight,Map,CalendarDays,Languages,Filter,Leaf,ListChecks,PieChart,RefreshCw,Split,Mail} from 'lucide';
import {onIdTokenChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,updateProfile,signOut,reload,getIdToken,getIdTokenResult,EmailAuthProvider,reauthenticateWithCredential,deleteUser} from 'firebase/auth';
import {createCloud} from './cloud.js';
import {createWelcomeController} from './welcome.js';
import {createGameBackend} from './game-backend.js';
import {createGameStore} from './game-store.js';
import {newAttemptId} from './game-domain.js';
import {createReferralBackend} from './referrals.js';
import {mountSocialUI} from './social-ui.js';
import {createPromotions} from './promotions.js';
import './promo.css';
import {createCommunicationPreferences} from './communication-preferences.js';
import {browserAnalytics} from './web-analytics.js';
import {mountPrivacyUI} from './privacy-ui.js';
import {createCourseContent} from './course-content.js';
import {createLaboratory} from './laboratory.js';
import {renderGrowthLab,installGrowthLab,readGrowthLabValues} from './growth-lab.js';
import {createPurchasesController} from './purchases.js';
import {createCaseAccess} from './case-access.js';
import {createLessonAds} from './ads.js';
import {readAdsConfiguration} from './ads-config.js';
import {createAndroidAds} from './ads-android.js';
import {createWebAds} from './ads-web.js';
import './ads.css';
import gameCatalog from './content/game-catalog.json';
import './social.css';
import {createProgressStore} from './sync.js';
import {learningAccess} from './access.js';
import {progressMessages as messages,disconnectedProgressStatus} from './progress-status.js';
import {mountAccountUI} from './account-ui.js';
import {PASSWORD_REQUIREMENTS_TEXT, passwordRequirementMessage} from './password-policy.js';
import {mountProductUI} from './product-ui.js';
import {createFeedbackBackend} from './feedback.js';
import {mountFeedbackUI} from './feedback-ui.js';
import './feedback.css';
import {BUSINESS} from './business.js';
import {deleteAccountWithProgress} from './delete-account.js';
import {ensureVerifiedSession,createSessionRecovery,prepareSignOut} from './session-recovery.js';
import {createAuthLifecycle,isAndroidNative,isNativeMobile,mountNativeLifecycle} from './native.js';
import './course.css';
import './exercise-formats.css';
import * as exerciseFormats from './exercise-formats.js';
import * as matchArrows from './match-arrows.js';
import './match-arrows.css';
import {mountLearningMotion} from './motion.js';
import './motion.css';
import {createLearningSensory,createWebCueDriver} from './learning-sensory.js';
import {nativeSensory} from './sensory-native.js';
import {mountSensoryControls} from './sensory-ui.js';
import './sensory.css';
import './app.css';
import './account.css';
import './product-ui.css';
import './privacy.css';
// Visual overrides must follow every base layout stylesheet.
import './path-theme.css';
import './personality.css';
import './laboratory.css';
import './growth-lab.css';
import './technical-charts.css';
import * as technicalCharts from './technical-charts.js';
import {renderCalculator,mountCalculator} from './exercise-calculator.js';
import '@fontsource-variable/nunito';

window.lucide={createIcons:options=>createIcons({...options,icons:{Lock,Route,BookOpen,FlaskConical,ChartNoAxesCombined,Layers,Blocks,UserRound,BriefcaseBusiness,Store,Globe,Repeat,Scale,ChartPie,Network,KeyRound,CircleDollarSign,Vote,Building2,Landmark,ShieldCheck,Coins,Monitor,Factory,Play,Search,ChartColumnIncreasing,Trophy,Flag,ChevronRight,Check,Sprout,Hourglass,FastForward,Gem,ChartCandlestick,Receipt,Server,Settings,Puzzle,Laptop,Flame,Zap,Cpu,Palette,ShoppingBasket,House,Plane,CreditCard,Fuel,Warehouse,Pill,FileSearch,MousePointer2,ArrowLeftRight,Map,CalendarDays,Languages,Filter,Leaf,ListChecks,PieChart,RefreshCw,Split,Mail,Chip:Cpu}})};
const android=isAndroidNative();
const nativeMobile=isNativeMobile();
const platformName=android?'Android':nativeMobile?'iOS':'Web';
if(nativeMobile)document.documentElement.classList.add('br-native');
let progressStorage=localStorage,storageError=null,nativeOnline=null;
if(nativeMobile){
  try{
    const [{Preferences},{createNativeProgressStorage}]=await Promise.all([import('@capacitor/preferences'),import('./native-storage.js')]);
    progressStorage=await createNativeProgressStorage({preferences:Preferences,fallback:localStorage});
  }catch(error){storageError=error;}
}
let cloud=null,cloudError=null;
try{cloud=createCloud();}catch(error){cloudError=error;}
const view={ready:false,configured:!!cloud,emulator:!!cloud?.emulator,user:null,status:'loading',statusText:'Recuperando tu progreso…',busy:false};
let privacyUI=null,feedbackUI=null;
const feedbackBackend=cloud?createFeedbackBackend({db:cloud.db,getUser:()=>cloud.auth.currentUser,isOnline:()=>nativeOnline??navigator.onLine}):null;
window.OchavoFeedback={open:()=>feedbackUI?.open()};
const communications=cloud?createCommunicationPreferences(cloud.db):null;
const analytics=browserAnalytics({enabled:!nativeMobile&&!import.meta.env.DEV&&!cloud?.emulator&&['ochavo.app','www.ochavo.app','brote-62d26.web.app','brote-62d26.firebaseapp.com'].includes(location.hostname),id:import.meta.env.VITE_WEB_ANALYTICS_ID});
window.OchavoAnalytics=analytics;
let ui=null,productUI=null,nativeLifecycle=null,identity=null,social=null,store=null,gameSelecting=false,reconciling=null,authSelectionPending=false,selectionGeneration=0,lastAccess='',recoveringSession=null,signingOut=false;
const welcome=createWelcomeController({backend:cloud?.welcome,storage:progressStorage});
const gameBackend=cloud?createGameBackend(cloud.db):null;
const referrals=cloud?createReferralBackend(cloud.db):null;
const promotions=cloud&&!nativeMobile?createPromotions({db:cloud.db,getUser:()=>cloud.auth.currentUser}):null;
const sensory=createLearningSensory({driver:nativeMobile?nativeSensory:createWebCueDriver(),storage:localStorage,native:nativeMobile});
const sensoryControls=mountSensoryControls({root:document.querySelector('#brote-preview'),controller:sensory});
const motion=mountLearningMotion({root:document.querySelector('#brote-preview'),groups:JSON.parse(document.querySelector('#br-course').textContent).groups,
  storage:progressStorage,sensory,onChange:()=>social?.update(),onError:()=>social?.notify('No se pudo guardar la presentación de una recompensa. Tu saldo sigue protegido en tu cuenta.')});
window.OchavoMotion=motion;
const gameStore=createGameStore({storage:progressStorage,backend:gameBackend,catalog:gameCatalog,isOnline:()=>nativeOnline??navigator.onLine,onView:game=>{motion.setOwner(game.owner);social?.update();window.BroteCourse?.refreshPremium?.();window.BroteCourse?.refreshWorldSkips?.();maybePresentRewards();},onEvent:event=>motion.receive(event)});
const visibleGame={...gameStore,getView:()=>motion.wallet(gameStore.getView())};
const caseAccess=createCaseAccess({db:cloud?.db,getUser:()=>view.user,getGame:()=>gameStore.getView()});
window.virutaCaseAccess=caseAccess;
const purchases=createPurchasesController({auth:cloud?.auth,db:cloud?.db,getUser:()=>cloud?.auth.currentUser||null,
  onChange:()=>{social?.update();window.BroteCourse?.refreshSocial();},
  onSynced:async()=>{if(gameSelecting)return;await gameStore.retry();await reconcileGame();},onError:error=>social?.notify(error.message)});
const adConfig=readAdsConfiguration(import.meta.env);
const adOwner=()=>accessState().canLearn?view.user?.uid:null;
const adPremium=()=>gameStore.getView().premium===true;
const adAdapter=android?createAndroidAds({...adConfig.android,getPremium:adPremium,isActive:()=>Boolean(adOwner())}):!nativeMobile?createWebAds({...adConfig.web,
  getPremium:adPremium,isActive:()=>Boolean(adOwner())&&['ochavo.app','www.ochavo.app','brote-62d26.web.app','brote-62d26.firebaseapp.com'].includes(location.hostname),
  getContainer:()=>document.getElementById('ochavo-result-ad')
}):null;
const lessonAds=createLessonAds({adapter:adAdapter,getPremium:adPremium,getOwner:adOwner,storage:progressStorage,consent:()=>adAdapter?.consent()===true});
let adCompletion=Promise.resolve(false),adResultGeneration=0;
window.virutaGame=visibleGame;window.virutaAttemptId=newAttemptId;
let deleteLinkPending=new URLSearchParams(location.search).get('cuenta')==='eliminar';
const lock=locked=>{document.querySelector('#br-main').inert=locked;document.querySelector('.br-nav').inert=locked;document.querySelector('.br-phone .br-brand').disabled=locked;document.querySelector('#br-main').setAttribute('aria-busy',String(locked));};
const accessState=()=>learningAccess({configured:!!cloud,ready:view.ready,user:view.user,currentUser:cloud?.auth.currentUser,owner:store?.getOwner(),status:view.status,busy:view.busy,selecting:gameSelecting,pending:authSelectionPending});
window.virutaAccess={canLearn:()=>accessState().canLearn};
function renderAccess(access){
  document.querySelector('.br-phone').hidden=!access.canLearn;
  document.querySelector('.br-phone').inert=!access.canLearn||Boolean(window.BroteCourse?.isBusy());
  document.querySelector('#br-auth-gate').hidden=access.canLearn;
  const signup=document.querySelector('#br-auth-signup'),login=document.querySelector('#br-auth-login'),verify=document.querySelector('#br-auth-verify'),retry=document.querySelector('#br-auth-retry');
  signup.hidden=login.hidden=['unverified','blocked','unavailable'].includes(access.mode);
  signup.disabled=login.disabled=access.mode!=='signed-out'||!ui;
  verify.hidden=!['unverified','blocked'].includes(access.mode);verify.disabled=view.busy||!ui;
  verify.textContent=access.mode==='blocked'?'Revisar mi cuenta':'Confirmar mi correo';
  retry.hidden=access.mode!=='unavailable';
  document.querySelector('#br-auth-status').textContent={
    'signed-out':'Regístrate o inicia sesión para entrar.',loading:'Comprobando tu sesión…',
    unverified:'Tu cuenta está creada. Confirma tu correo para empezar. Si no lo encuentras, revisa spam o correo no deseado.',
    blocked:'Esta cuenta está eliminada o su eliminación está en curso.',
    unavailable:view.statusText||'No se pudo conectar con el servicio de cuentas. Vuelve a intentarlo.'
  }[access.mode]||'';
  const key=access.canLearn?'open:'+view.user.uid:access.mode;
  if(key!==lastAccess){
    adResultGeneration++;lessonAds.reset();adAdapter?.reset();
    if(lastAccess.startsWith('open:')&&key!==lastAccess){motion.reset();social?.reset();privacyUI?.reset();feedbackUI?.reset();window.OchavoLaboratory?.reset();caseAccess.clear();window.BroteCourse?.clearPremium?.();}
    lastAccess=key;window.BroteCourse?.refreshAccess?.();
    if(access.canLearn)void adAdapter?.prepare();
  }
}
function update(){
  const access=accessState();
  renderAccess(access);ui?.update({...view,accessRequired:!access.canLearn,authLoading:access.mode==='loading'});lock(!access.canLearn||Boolean(window.BroteCourse?.isBusy()));
  if(view.ready&&!view.busy){
    void nativeLifecycle?.resumeIfPending();
    if(ui&&productUI){
      if(deleteLinkPending){
        deleteLinkPending=false;
        const url=new URL(location.href);url.searchParams.delete('cuenta');history.replaceState(null,'',url.pathname+url.search+url.hash);
        ui.requestDeletion();
      }else if(access.canLearn)productUI.maybeWelcome();
    }
  }
  maybePresentRewards();
}
function maybePresentRewards(){
  const home=accessState().canLearn&&document.getElementById('br-main').dataset.view==='map';
  motion.setHome(home);
  if(!home||gameSelecting||view.busy||reconciling||window.BroteCourse?.hasPendingAnswers?.())return;
  const game=gameStore.getView();if(game.status!=='saved'||game.pending)return;
  // Never cover account/cookie/purchase dialogs with another modal.
  if(document.querySelector('dialog[open]:not(.och-reward-screen)'))return;
  motion.showPending();
}
window.OchavoRewards={onPage:maybePresentRewards};
document.addEventListener('close',event=>{
  if(event.target.matches?.('dialog:not(.och-reward-screen)'))maybePresentRewards();
},true);
store=createProgressStore({
  storage:progressStorage,backend:cloud?.backend,isOnline:()=>nativeOnline??navigator.onLine,
  // Account selection and a cold start always open Aprende. Keep every saved
  // draft and path; background merges below must not interrupt current navigation.
  onRestore:snapshot=>window.BroteCourse?.restore({...snapshot,page:'map'}),
  onMerge:snapshot=>window.BroteCourse?.mergeAchievements(snapshot),
  onStatus:status=>{view.status=status;view.statusText=messages[status]||messages.error;view.ready=!['loading','storage-invalid','update-required'].includes(status);update();}
});
window.broteStore=store;
social=mountSocialUI({game:visibleGame,store,cases:JSON.parse(document.querySelector('#br-cases').textContent),groups:JSON.parse(document.querySelector('#br-course').textContent).groups,getUser:()=>view.user,onAccount:()=>ui?.open(),onLogout:()=>ui?.logout(),onRetrySync:recoverSession,onPreferences:()=>privacyUI?.open(),referrals,onReconcile:reconcileGame,purchases,promotions,isNative:nativeMobile,sensory,onProfile:()=>sensoryControls.refresh()});
window.virutaSocial=social;
window.virutaReconcile=reconcileGame;
window.virutaLessonCompleted=result=>{
  const owner=adOwner(),token=++adResultGeneration,previous=adCompletion;
  adCompletion=(async()=>{try{
    await previous;
    if(!owner||adOwner()!==owner||await store.flushLocal?.()===false||adOwner()!==owner)return false;
    void analytics.track(result.kind==='exam'?'exam_complete':'lesson_complete',result);
    const queued=await lessonAds.afterCompletion({...result,allowAd:token===adResultGeneration});
    // Web uses a regular labeled display unit inside this result. Android waits
    // for Continue so celebrations and the saved learning summary remain visible.
    if(queued&&!nativeMobile&&adOwner()===owner&&token===adResultGeneration)return await lessonAds.showPending();
    return queued;
  }catch{return false;}})();
  return adCompletion;
};
window.virutaContinueAfterLesson=async()=>{
  // Inline web advertising and the disabled iOS adapter must never delay exit.
  if(!android)return false;
  const owner=adOwner(),token=adResultGeneration;
  await adCompletion;
  if(!owner||adOwner()!==owner||token!==adResultGeneration)return false;
  return await lessonAds.showPending();
};
window.virutaLeaveResult=()=>{adResultGeneration++;lessonAds.discardPending();adAdapter?.reset();void adAdapter?.prepare();};
window.OchavoExercises=exerciseFormats;
window.OchavoMatchArrows=matchArrows;
window.OchavoCandles=technicalCharts;technicalCharts.mountInspection(document.querySelector('#brote-preview'));
window.OchavoCalculator={render:renderCalculator};mountCalculator(document.querySelector('#brote-preview'));
window.OchavoGrowthLab={render:renderGrowthLab,readValues:readGrowthLabValues};
installGrowthLab(document.querySelector('#brote-preview'),{canUse:()=>window.virutaAccess.canLearn()&&!window.BroteCourse?.isBusy()});
window.OchavoLaboratory=createLaboratory({
  main:document.getElementById('br-main'),
  canUse:()=>window.virutaAccess.canLearn()&&!window.BroteCourse?.isBusy(),
  onIcons:()=>window.lucide.createIcons({attrs:{width:20,height:20}}),
  mascot:()=>'<div class="br-mascot" aria-hidden="true"><div class="br-leaf"></div><div class="br-leaf other"></div><div class="br-seed"><span class="br-mouth"></span></div></div>'
});
window.OchavoCourseContent=createCourseContent({
  course:JSON.parse(document.getElementById('br-course').textContent),
  lessons:JSON.parse(document.getElementById('br-invest-lessons').textContent),
  exams:JSON.parse(document.getElementById('br-exams').textContent)
});
await import('./course.js');
async function reconcileGame(){
 if(reconciling)return reconciling;
 if(!gameStore.getView().canSpend)return;
 reconciling=(async()=>{try{await gameStore.openApp();await gameStore.reconcileProgress(store.getSnapshot());await social.refreshReferrals();social.update();window.BroteCourse?.refreshSocial();}catch(e){social.notify(readableError(e).message);}finally{reconciling=null;maybePresentRewards();}})();
 return reconciling;
}
async function selectStores(user){
 const generation=++selectionGeneration;
 motion.setOwner(user?.emailVerified&&!user?.isAnonymous?user.uid:null);motion.reset();
 gameSelecting=true;caseAccess.clear();window.BroteCourse?.clearPremium?.();social.reset();update();
 if(user?.emailVerified){
  try{await ensureVerifiedSession({user,getUser:()=>cloud.auth.currentUser,getTokenResult:getIdTokenResult,refreshToken:getIdToken});}
  catch(error){if(generation===selectionGeneration){gameSelecting=false;view.ready=false;view.status='error';view.statusText=readableError(error).message;update();}throw error;}
  if(generation!==selectionGeneration)return;
 }
 try{await purchases.select(user).catch(error=>social.notify(error.message||'No se pudieron actualizar tus compras.'));if(generation!==selectionGeneration)return;const result=await Promise.allSettled([store.select(user),gameStore.select(user)]);if(result[0].status==='rejected')throw result[0].reason;if(result[1].status==='fulfilled')await reconcileGame();else social.notify(readableError(result[1].reason).message);}
 finally{if(generation===selectionGeneration){gameSelecting=false;update();social.update();}}
}
async function resumeGame(){if(!accessState().canLearn||gameSelecting||view.busy||window.BroteCourse?.isBusy()||window.BroteCourse?.hasPendingAnswers()||social?.busy())return;try{await purchases.refresh();await gameStore.retry();await reconcileGame();}catch{social.update();}}
const combinedStore={...store,pause:async()=>{await Promise.all([store.pause(),gameStore.pause()]);},select:selectStores,forget:async uid=>{await purchases.forget(uid);await gameStore.forget(uid);await store.forget(uid);await motion.forget(uid);await welcome.forget(uid);if(await lessonAds.forget(uid)===false)throw Error('No se pudo borrar el contador local de anuncios.');},flushLocal:async()=>{const values=await Promise.all([store.flushLocal?.(),gameStore.flushLocal()]);await motion.flush();return values.every(x=>x!==false);},retry:async()=>{await store.retry();await resumeGame();}};

const sessionRecovery=createSessionRecovery({getUser:()=>cloud?.auth.currentUser,reloadUser:reload,refreshToken:getIdToken,retryProgress:()=>store.retry(),retryGame:async()=>{await gameStore.retry();await reconcileGame();}});
function recoverSession(){
 if(recoveringSession)return recoveringSession;
 if(!cloud)return Promise.reject(Error('El servicio de cuentas no está disponible. Vuelve a intentarlo.'));
 const user=cloud.auth.currentUser;
 window.BroteCourse?.flushInputs();
 recoveringSession=(async()=>{
  try{
   const result=await sessionRecovery.recover();
   if(!result.verified)throw Object.assign(Error('Confirma tu correo antes de continuar.'),{code:'account/verification-required'});
   if(result.progress.status==='fulfilled'){await store.flush();await store.flushLocal();}
   if(cloud.auth.currentUser!==user)throw Object.assign(Error('La cuenta cambió. Vuelve a intentarlo.'),{code:'account/identity-changed'});
   if(result.progress.status==='rejected')throw result.progress.reason;
   if(result.game.status==='rejected')throw result.game.reason;
   if(view.status!=='saved')throw Error(messages[view.status]||messages.error);
   const game=gameStore.getView();
   if(!game.canSpend||game.pending)throw Error('El progreso está guardado, pero falta confirmar tus vidas. Reintenta la sincronización.');
   return {message:'Tu progreso está sincronizado. Ya puedes continuar.'};
  }catch(error){throw readableError(error);}
  finally{recoveringSession=null;if(cloud.auth.currentUser===user){view.user=user;authSelectionPending=false;}else authSelectionPending=true;update();if(authSelectionPending)void applyPendingIdentity();}
 })();
 return recoveringSession;
}
async function logoutSession(){
 if(signingOut)return {message:'Cerrando sesión.'};
 if(!cloud)return {message:'No hay una sesión abierta.'};
 signingOut=true;
 try{
  await prepareSignOut({getUser:()=>cloud.auth.currentUser,flushInputs:()=>window.BroteCourse?.flushInputs(),flushProgressLocal:()=>store.flushLocal(),flushGameLocal:()=>gameStore.flushLocal(),flushProgress:()=>store.flush()});
  view.busy=true;update();
  await signOut(cloud.auth);
  view.user=null;authSelectionPending=false;caseAccess.clear();social.reset();
  // Selecting the signed-out state invalidates old callbacks without deleting either account cache.
  await selectStores(null);
  return {message:'Sesión cerrada. La copia de tu progreso permanece en este dispositivo.'};
 }catch(error){throw readableError(error);}
 finally{signingOut=false;view.busy=false;update();if(cloud?.auth.currentUser!==view.user){authSelectionPending=true;void applyPendingIdentity();}}
}


function sessionError(error){view.ready=false;view.status=error?.code==='storage/read-failed'?'storage-invalid':'error';view.statusText=messages[view.status]||'No se pudo recuperar tu sesión. Recarga para volver a intentarlo.';update();}
async function applyPendingIdentity(){if(!authSelectionPending||view.busy||window.BroteCourse?.isBusy()||social?.busy())return;authSelectionPending=false;await identity?.select(cloud.auth.currentUser).catch(sessionError);}
window.virutaAfterAction=async()=>{await applyPendingIdentity();maybePresentRewards();};
if(cloud)identity=createAuthLifecycle({
  getUser:()=>cloud.auth.currentUser,reloadUser:reload,refreshToken:user=>getIdToken(user,true),
  selectUser:selectStores,isBusy:()=>view.busy||window.BroteCourse?.isBusy()||social?.busy(),
  onUser:user=>{view.user=user;},onReady:update
});

function readableError(e){
  const codes={
    'account/deletion-pending':messages['deletion-pending'],
    'account/identity-changed':'La cuenta ha cambiado. Vuelve a intentarlo con la cuenta abierta.',
    'account/verification-required':'La sesión todavía no confirma tu correo. Revisa la verificación y vuelve a intentarlo.',
    'storage/write-failed':'No se pudo guardar en este dispositivo. Reintenta antes de cerrar sesión para conservar tu progreso.',
    'permission-denied':'No se pudo confirmar el acceso a tu cuenta. Reintenta la sincronización; si continúa, cierra sesión y vuelve a entrar.',
    'firestore/permission-denied':'No se pudo confirmar el acceso a tu cuenta. Reintenta la sincronización; si continúa, cierra sesión y vuelve a entrar.',
    'auth/invalid-credential':'El correo o la contraseña no son correctos.',
    'auth/user-not-found':'El correo o la contraseña no son correctos.',
    'auth/wrong-password':'El correo o la contraseña no son correctos.',
    'auth/invalid-email':'Revisa el formato del correo.',
    'auth/email-already-in-use':'No se ha podido crear la cuenta. Prueba a iniciar sesión o a recuperar tu contraseña.',
    'auth/weak-password':PASSWORD_REQUIREMENTS_TEXT,
    'auth/password-does-not-meet-requirements':PASSWORD_REQUIREMENTS_TEXT,
    'auth/too-many-requests':'Se han hecho varios intentos. Espera un poco y vuelve a probar.',
    'auth/network-request-failed':'No hay conexión con el servicio. Revisa internet y vuelve a intentarlo.',
    'auth/requires-recent-login':'Vuelve a iniciar sesión antes de continuar.',
    'auth/user-disabled':'Esta cuenta está desactivada.',
    'auth/operation-not-allowed':'El registro todavía no está habilitado.',
    'auth/unauthorized-continue-uri':'La dirección de la app todavía no está autorizada para los correos.'
  };
  return new Error(codes[e?.code]||(e?.code?'No se ha podido completar la operación. Vuelve a intentarlo.':e?.message||'Vuelve a intentarlo.'));
}
window.virutaOperationError=error=>readableError(error).message;
async function action(fn,{requiresAccountService=true}={}){
  if(requiresAccountService&&!cloud)throw new Error('Las cuentas todavía no están activadas.');
  if(window.BroteCourse?.isBusy()||social.busy())throw Error('Espera a que termine la operación actual.');
  window.BroteCourse?.flushInputs();
  view.busy=true;update();
  try{return await fn();}catch(e){throw readableError(e);}
  finally{
    view.busy=false;
    // Token changes during an account operation are applied once it has settled.
    if(identity){authSelectionPending=false;await identity.select(cloud.auth.currentUser).catch(sessionError);}
    update();
  }
}
// Real emails must return to the authorized public app, including from a local preview.
const linkOptions=()=>({url:cloud.emulator?location.origin:BUSINESS.siteUrl,handleCodeInApp:false});
ui=mountAccountUI({
  onOpenInfo:section=>productUI?.open(section),
  onSignup:({displayName,email,password,newsletter=false})=>action(async()=>{
    const passwordError = passwordRequirementMessage(password);
    if(passwordError)throw Error(passwordError);
    const {user}=await createUserWithEmailAndPassword(cloud.auth,email.trim(),password);
    if(displayName.trim())await updateProfile(user,{displayName:displayName.trim().slice(0,80)});
    view.user=user;
    let preferenceWarning='';
    try{await communications.write(user,newsletter,'registration');}
    catch{preferenceWarning=' No se pudo guardar tu elección de correos. Revísala desde Perfil → Privacidad y correos.';}
    void analytics.track('sign_up');
    try{await sendEmailVerification(user,linkOptions());return {message:cloud.emulator?'Cuenta de prueba creada. Este modo no envía correos reales.':'Cuenta creada. Revisa tu correo, incluida la carpeta de spam, y confirma la dirección para entrar en Ochavo.'+preferenceWarning};}
    catch(e){return {message:`Tu cuenta se ha creado, pero no se ha enviado el correo de confirmación. ${readableError(e).message} Usa «Reenviar correo» para volver a intentarlo.`};}
  }),
  onLogin:({email,password})=>action(async()=>{await signInWithEmailAndPassword(cloud.auth,email.trim(),password);void analytics.track('login');return {message:'Has iniciado sesión.'};}),
  onReset:email=>action(async()=>{
    try{await sendPasswordResetEmail(cloud.auth,email.trim(),linkOptions());}catch(e){if(e.code!=='auth/user-not-found')throw e;}
    return {message:cloud.emulator?'Recuperación simulada. Este modo de prueba no envía correos reales.':'Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña. Revisa también la carpeta de spam.'};
  }),
  onLogout:logoutSession,
  onResendVerification:()=>action(async()=>{await sendEmailVerification(cloud.auth.currentUser,linkOptions());return {message:cloud.emulator?'Confirmación simulada. Este modo de prueba no envía correos reales.':'Correo enviado. Revisa también spam, abre el enlace y después pulsa «Ya he verificado mi correo».'};}),
  onRefreshVerification:()=>action(async()=>{
    const user=await identity.refresh();
    if(!user)throw Error('La sesión ha cambiado. Revisa la cuenta abierta antes de continuar.');
    return {message:user.emailVerified?'Correo confirmado. Tu progreso se sincronizará con tu cuenta.':'La confirmación aún no aparece. Abre el enlace recibido por correo.'};
  }),
  onRetrySync:recoverSession,
  onDeleteAccount:password=>action(()=>deleteAccountWithProgress({
    user:cloud.auth.currentUser,
    authenticate:user=>reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,password)),
    removeProgress:async uid=>{await cloud.backend.remove(uid);await cloud.welcome.remove(uid);await feedbackBackend.remove(uid);await gameBackend.remove(uid);await referrals.remove(uid);},deleteIdentity:deleteUser,
    getCurrentUser:()=>cloud.auth.currentUser,store:combinedStore
  }))
});
productUI=mountProductUI({
  claimWelcome:uid=>welcome.claim(uid),getWelcomeOwner:()=>accessState().canLearn?view.user?.uid:null,
  onOpenAccount:()=>ui.open(),onDeleteAccount:()=>ui.requestDeletion(),
  onReport:()=>feedbackUI?.open(),
  getContext:()=>({appVersion:BUSINESS.appVersion,platform:platformName})
});
feedbackUI=mountFeedbackUI({getUser:()=>cloud?.auth.currentUser||null,
  getContext:()=>({...window.BroteCourse?.reportContext(),appVersion:BUSINESS.appVersion,platform:platformName}),
  isBusy:()=>view.busy||gameSelecting||Boolean(window.BroteCourse?.isBusy()),
  onSend:report=>feedbackBackend.send(report)});
privacyUI=mountPrivacyUI({analytics,communications,ads:adAdapter,getUser:()=>cloud?.auth.currentUser||null,onPrivacy:()=>productUI.open('privacy')});
const privacyButton=document.createElement('button');privacyButton.type='button';privacyButton.className='br-link';privacyButton.textContent='Privacidad y correos';privacyButton.addEventListener('click',()=>void privacyUI.open());document.querySelector('#br-auth-help').after(privacyButton);

document.querySelector('#br-auth-signup').addEventListener('click',()=>ui.open('signup'));
document.querySelector('#br-auth-login').addEventListener('click',()=>ui.open('login'));
document.querySelector('#br-auth-verify').addEventListener('click',()=>ui.open());
document.querySelector('#br-auth-help').addEventListener('click',()=>productUI.open('help'));
document.querySelector('#br-auth-retry').addEventListener('click',()=>location.reload());
update();
if(nativeMobile){
  try{
    nativeLifecycle=await mountNativeLifecycle({
      store:combinedStore,getCourse:()=>window.BroteCourse,isBusy:()=>view.busy||!view.ready||gameSelecting||window.BroteCourse?.isBusy()||social.busy(),
      onResume:async()=>{await identity?.refresh({background:true});await resumeGame();},
      onConnection:status=>{
        nativeOnline=Boolean(status.connected);
        social.update();window.BroteCourse?.refreshSocial();
        if(!nativeOnline&&view.ready&&view.user?.emailVerified){view.status=disconnectedProgressStatus(view.status);view.statusText=messages[view.status];update();}
      }
    });
  }catch{view.statusText='No se pudo preparar la navegación de la app. Vuelve a abrirla.';update();}
}
if(storageError){
  // Never select an empty fallback after a failed native read: it could replace saved data.
  view.ready=false;view.status='storage-error';view.statusText='No se pudo recuperar el progreso de este dispositivo. Vuelve a abrir la app para reintentarlo.';update();
  const retry=document.createElement('button');retry.type='button';retry.className='br-account-button';retry.textContent='Volver a abrir la app';retry.addEventListener('click',()=>location.reload());document.querySelector('#br-sync-slot').append(retry);
}else if(cloud){
  if(cloud.emulator){const notice=document.createElement('p');notice.className='br-dev-notice';notice.textContent='Prueba local · cuentas y correos simulados';document.querySelector('.br-phone').prepend(notice);}
  try{
    await cloud.persistence;
    onIdTokenChanged(cloud.auth,user=>{if(recoveringSession||signingOut){if(user!==view.user)authSelectionPending=true;return;}if(view.busy||window.BroteCourse?.isBusy()||social?.busy()){authSelectionPending=true;update();return;}void identity.select(user).catch(sessionError);},sessionError);
  }catch{view.ready=false;view.status='error';view.statusText=nativeMobile?'No se pudo guardar tu sesión en este dispositivo. Vuelve a abrir la app para reintentarlo.':'El navegador no permite guardar la sesión. Revisa su configuración y recarga.';update();}
}else{await selectStores(null);view.statusText='El servicio de cuentas no está disponible. Vuelve a intentarlo para acceder a Ochavo.';update();}

if(!nativeMobile){
  window.addEventListener('online',()=>{if(cloud?.auth.currentUser?.emailVerified)store.retry();void resumeGame();});
  window.addEventListener('offline',()=>{social.update();window.BroteCourse?.refreshSocial();if(view.ready&&view.user?.emailVerified){view.status=disconnectedProgressStatus(view.status);view.statusText=messages[view.status];update();}});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){window.BroteCourse?.flushInputs();store.flush();gameStore.flushLocal();}else{void identity?.refresh({background:true}).catch(()=>{});if(cloud?.auth.currentUser?.emailVerified)store.retry();void resumeGame();}});
  window.addEventListener('beforeunload',event=>{if(store.hasPending()){event.preventDefault();event.returnValue='';}});
}

setInterval(()=>{social.update();window.BroteCourse?.refreshPremium?.();const g=gameStore.getView();if(g.lastOpenDay!==g.day&&!gameSelecting&&!view.busy&&!window.BroteCourse?.isBusy()&&g.canSpend)void reconcileGame();},30000);
