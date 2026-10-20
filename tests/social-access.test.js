import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {normalizePromoCode,PROMO_CODE_INPUT_MAX} from '../src/promotions.js';
import {gemShopMarkup} from '../src/gem-shop.js';
import {LEGACY_TRACKS,isArchivedWorld,worldNumber,trackForExam,FREE_INTRO_WORLD_ID} from '../src/tracks.js';
import {activeCases,orderedCases,caseHistory,caseWorldLabel} from '../src/case-catalog.js';

// Run the real controller with DOM/service adapters; no Firebase users or purchases.
const source=readFileSync(new URL('../src/social-ui.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export function mountSocialUI','function mountSocialUI');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};

function mount({admitted=true,helper=true,viewOverrides={},purchaseOverrides={},unifiedRecovery=false,promoEnabled=false,native=false,cases=[],snapshotOverrides={},groups=[]}={}){
  const nodes=new Map(),created=[],calls=[];
  let user={uid:'account-a',emailVerified:true,displayName:'Account A'},after=0;
  const operations={refill:async()=>{},purchase:async()=>({message:'Confirmed A'}),refresh:async()=>({message:'Compras comprobadas.'}),restore:async()=>({message:'Compras restauradas.'}),closeAttempt:async()=>({message:'Intento cerrado. Esto no cancela ni devuelve ningún cargo.'}),retry:async()=>{},recover:async()=>{},code:async()=>'AAAAAAAAAA',qualify:async()=>{},read:async()=>({receipts:[]}),claim:async()=>{}};
  class Node {
    constructor(){this.dataset={};this.innerHTML='';this.textContent='';this.open=false;this.disabled=false;this.isConnected=true;this.listeners={};this.attributes=new Map();this.children=[];this.classList={add(){},remove(){}};}
    querySelector(selector){return node(selector);}
    addEventListener(name,handler){this.listeners[name]=handler;}
    append(child){this.children.push(child);}
    after(){} before(){} insertBefore(){} insertAdjacentHTML(){}
    setAttribute(k,v){this.attributes.set(k,v);} removeAttribute(k){this.attributes.delete(k);}
    focus(){} closest(){return null;}
    showModal(){this.open=true;}
    close(){const wasOpen=this.open;this.open=false;if(wasOpen)this.listeners.close?.();}
  }
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,new Node());return nodes.get(selector);};
  const document={querySelector:node,querySelectorAll:()=>[],activeElement:null,createElement:()=>{const n=new Node();created.push(n);return n;}};
  const window={...(helper?{virutaAccess:{canLearn:()=>admitted}}:{}),virutaAfterAction:()=>{after++;},BroteCourse:{startCase:async id=>{calls.push(['case',id]);return true;}}};
  const context=vm.createContext({window,document,location:{search:''},URLSearchParams,requestAnimationFrame:fn=>fn(),setTimeout:()=>1,clearTimeout(){},navigator:{clipboard:{writeText:async()=>{calls.push('copy');}}},
    badgeCatalog:()=>[],badgeSVG:()=>'',earnedBadge:()=>false,badgeProgress:()=>0,GEM_SVG:'gem',HEART_SVG:'heart',FIRE_SVG:'fire',newAttemptId:()=>'attempt',normalizeInvite:s=>s,invitationURL:s=>'https://example.invalid/?invite='+s,BUSINESS:{siteUrl:'https://example.invalid'},
    LEGACY_TRACKS,isArchivedWorld,worldNumber,trackForExam,FREE_INTRO_WORLD_ID,activeCases,orderedCases,caseHistory,caseWorldLabel,normalizePromoCode,PROMO_CODE_INPUT_MAX,gemShopMarkup,mountPromotionsUI:()=>({markup:()=>'',update(){},reset(){},busy:()=>false,openRedeem:code=>{calls.push(['promo-open',code]);return true;}})});
  vm.runInContext(source+'\nglobalThis.mount=mountSocialUI;',context);
  const game={getView:()=>({owner:user?.uid,lives:3,totalLives:3,gems:50,streak:2,bestStreak:2,referralCount:0,canSpend:true,status:'saved',premium:false,...viewOverrides}),
    buyLife:async()=>{calls.push('refill');return operations.refill();},retry:async()=>{calls.push('retry');return operations.retry();},
    claimReferral:async id=>{calls.push('claim:'+id);return operations.claim(id);},awardAchievements:async()=>{calls.push('achievements');}};
  const api=context.mount({game,store:{getSnapshot:()=>({completed:{},passedExams:{},completedCases:{},...snapshotOverrides})},cases,groups,getUser:()=>user,promotions:promoEnabled?{}:null,isNative:native,
    onAccount:()=>{calls.push('account');},onReconcile:async()=>{calls.push('reconcile');},
    onLogout:async()=>{calls.push('logout');},onRetrySync:unifiedRecovery?async()=>{calls.push('recover');await operations.recover();}:undefined,
    referrals:{qualify:async()=>{calls.push('qualify');return operations.qualify();},read:async()=>{calls.push('read');return operations.read();},getCode:async()=>{calls.push('code');return operations.code();},attach:async()=>{calls.push('attach');}},
    purchases:{getView:()=>({canPurchase:true,canSubscribe:true,canPurchaseLives:true,...purchaseOverrides}),subscribe:async()=>{calls.push('purchase');return operations.purchase();},purchaseLives:async()=>{calls.push('purchase');return operations.purchase();},purchaseGems:async id=>{calls.push(['purchase-gems',id]);return operations.purchase();},refresh:async()=>{calls.push('refresh');return operations.refresh();},restore:async()=>{calls.push('restore');return operations.restore();},closeInterruptedPurchase:async input=>{calls.push(['close-attempt',input]);return operations.closeAttempt(input);},manage:async()=>{calls.push('manage');return {};}}});
  return {api,window,node,calls,operations,dialog:created.find(n=>n.className==='vr-dialog'),bar:created.find(n=>n.className==='vr-game-bar'),toast:created.find(n=>n.className==='vr-toast'),main:node('#br-main'),
    get after(){return after;},set admitted(value){admitted=value;},set user(value){user=value;},
    focus(action){const button=new Node();button.dataset.vr=action;document.activeElement=button;},
    click(action,value){const button=new Node();button.dataset={vr:action,value};button.closest=()=>button;node('#brote-preview').listeners.click({target:button});},
    revoke(){admitted=false;api.reset();node('#br-main').innerHTML='';node('#br-main').dataset.view='locked';}};
}

for(const helper of [false,true])test(`social entry points remain closed without admission (${helper?'denied':'missing helper'})`,async()=>{
  const app=mount({admitted:false,helper});
  assert.equal(app.api.render('profile'),false);assert.equal(app.api.render('cases'),false);
  app.api.lives();app.api.plus();
  for(const action of ['lives','plus','gems','streak','profile','case-filter','badge-filter','refill','subscribe','invite','attach-save','retry','copy','start-case','account'])app.click(action);
  await settle();assert.equal(app.main.innerHTML,'');assert.equal(app.dialog.open,false);assert.equal(app.dialog.innerHTML,'');assert.equal(app.bar.innerHTML,'');assert.deepEqual(app.calls,[]);
});

test('admitted account can render a profile and open its game details',()=>{
  const app=mount();app.api.render('profile');assert.match(app.main.innerHTML,/Account A/);
  app.click('lives');assert.equal(app.dialog.open,true);assert.match(app.dialog.innerHTML,/3 vidas disponibles/);
  app.click('close');assert.equal(app.dialog.open,false);
});

const caseFixture=(world,track,id)=>({world,track,id,title:'Caso '+id,company:'Empresa de prueba',summary:'Datos simulados para probar la navegación.',period:'2026',minutes:8,cover:{icon:'layers',color:'#387e86'},...(world>=45?{revision:'cases-2026-10',lessonIds:Array.from({length:10},(_,i)=>world*10+i),learningGoals:['Leer el caso','Aplicar lo aprendido']}:{})});
const visibleCaseFixtures=[...Array.from({length:14},(_,i)=>caseFixture(45+i,'stocks','stocks-v2-'+(i+1))),...Array.from({length:13},(_,i)=>caseFixture(95+i,'etfs','etfs-v2-'+(i+1))),caseFixture(148,'technical','technical-v2-3'),caseFixture(0,'stocks','stocks-1'),caseFixture(10,'etfs','etfs-1')];
const activeCards=app=>(app.main.innerHTML.split('<details class="vr-case-history"')[0].match(/data-vr="case"/g)||[]).length;

test('real case controller paginates 12 at a time and filters reset the visible range while history remains separate',async()=>{
 const app=mount({viewOverrides:{premium:true},cases:visibleCaseFixtures,snapshotOverrides:{completedCases:{'case-1':{firstTry:3}},caseSessions:[['case-11',1,Array.from({length:6},()=>({}))]]},groups:Array.from({length:175},(_,id)=>({title:'Tema '+id}))});
 app.api.render('cases');assert.equal(activeCards(app),12);assert.match(app.main.innerHTML,/28 casos · uno por mundo/);assert.match(app.main.innerHTML,/Tu historial de casos anteriores · 2/);
 app.click('more-cases');assert.equal(activeCards(app),24);assert.match(app.main.innerHTML,/24 de 28/);
 app.click('more-cases');assert.equal(activeCards(app),28);assert.doesNotMatch(app.main.innerHTML,/data-vr="more-cases"/);
 app.click('case-filter','etfs');assert.equal(activeCards(app),12);assert.match(app.main.innerHTML,/12 de 13/);
 const current=app.main.innerHTML.split('<details class="vr-case-history"')[0];assert.doesNotMatch(current,/data-value="stocks-v2-/);assert.match(current,/data-value="etfs-v2-1"/);
 app.click('case-filter','technical');assert.equal(activeCards(app),1);assert.match(app.main.innerHTML,/Análisis técnico · mundo 3/);assert.match(app.main.innerHTML,/Mundo 3 · Tema 148/);assert.doesNotMatch(app.main.innerHTML,/mundo 149/);
 app.click('case','technical-v2-3');assert.match(app.dialog.innerHTML,/Leer el caso/);assert.match(app.dialog.innerHTML,/data-value="technical-v2-3"/);
 app.click('start-case','technical-v2-3');await settle();assert.deepEqual(app.calls,[['case','technical-v2-3']]);
});

test('real case controller keeps free users behind Plus and never mixes historical completions into current cards',()=>{
 const locked=mount({cases:visibleCaseFixtures});locked.api.render('cases');assert.match(locked.main.innerHTML,/Ver Ochavo Plus/);assert.equal(activeCards(locked),0);
 const premium=mount({cases:visibleCaseFixtures,viewOverrides:{premium:true},snapshotOverrides:{completedCases:{'case-1':{firstTry:3}}}});premium.api.render('cases');
 const current=premium.main.innerHTML.split('<details class="vr-case-history"')[0];assert.doesNotMatch(current,/Caso completado/);assert.match(premium.main.innerHTML,/Tu historial de casos anteriores · 1/);
});

test('gem checkout uses its selected SKU, releases the web modal and never awards benefits in the UI',async()=>{
  const app=mount({purchaseOverrides:{web:true,gemProducts:[{productId:'ochavo_gems_600',gems:600,price:'4,99 €',canPurchase:true}]}}),pending=deferred();
  app.operations.purchase=()=>pending.promise;app.click('gems');assert.equal(app.dialog.open,true);assert.match(app.dialog.innerHTML,/600 gemas/);
  app.click('paid-gems','ochavo_gems_600');assert.equal(app.dialog.open,false);assert.equal(app.api.busy(),true);
  app.click('paid-gems','ochavo_gems_600');assert.deepEqual(app.calls,[['purchase-gems','ochavo_gems_600']]);
  pending.resolve({message:'Compra confirmada.'});await settle();assert.equal(app.dialog.open,true);assert.match(app.dialog.innerHTML,/Tus gemas, tus atajos/);assert.deepEqual(app.calls,[['purchase-gems','ochavo_gems_600']]);
});

test('checking or restoring purchases preserves each open purchase dialog without a focused launcher',async()=>{
  for(const [dialog,heading] of [['gems',/Tus gemas, tus atajos/],['lives',/3 vidas disponibles/],['plus',/Aprende con toda la libertad/]]){
    for(const [action,operation] of [['refresh-purchases','refresh'],['restore','restore']]){
      const app=mount(),pending=deferred();app.operations[operation]=()=>pending.promise;
      app.click(dialog);app.click(action);assert.equal(app.api.busy(),true);
      pending.resolve({message:'Compras actualizadas.'});await settle();
      assert.equal(app.dialog.open,true);assert.match(app.dialog.innerHTML,heading);
      assert.deepEqual(app.calls,[operation]);assert.equal(app.toast.textContent,'Compras actualizadas.');
    }
  }
});

test('purchase navigation uses the current dialog rather than its original focus-return target',async()=>{
  const app=mount();app.focus('gems');app.click('gems');app.click('plus');
  app.click('refresh-purchases');await settle();
  assert.match(app.dialog.innerHTML,/Aprende con toda la libertad/);assert.doesNotMatch(app.dialog.innerHTML,/Tus gemas, tus atajos/);
  app.click('gems');app.click('close');app.click('restore');await settle();
  assert.match(app.dialog.innerHTML,/Aprende con toda la libertad/);
});

test('a delayed close event from checkout cannot clear the reopened gem dialog context',async()=>{
  const app=mount({purchaseOverrides:{web:true}});
  app.click('gems');app.click('paid-gems','ochavo_gems_200');await settle();
  assert.equal(app.dialog.open,true);app.dialog.listeners.close();
  app.click('refresh-purchases');await settle();
  assert.match(app.dialog.innerHTML,/Tus gemas, tus atajos/);
  assert.deepEqual(app.calls,[['purchase-gems','ochavo_gems_200'],'refresh']);
});

test('a refresh completing after an account change cannot reopen the previous purchase dialog',async()=>{
  const app=mount(),pending=deferred();app.operations.refresh=()=>pending.promise;
  app.click('gems');app.click('refresh-purchases');app.revoke();
  app.user={uid:'account-b',emailVerified:true};app.admitted=true;
  pending.resolve({message:'Private result A'});await settle();
  assert.equal(app.dialog.open,false);assert.equal(app.dialog.innerHTML,'');assert.equal(app.toast.textContent,'');
});

test('gem purchase result does not leak after account change and lifetime Plus can still buy gem packs',async()=>{
  const app=mount({viewOverrides:{premium:true,lifetimePremium:true},purchaseOverrides:{web:true}}),pending=deferred();
  app.operations.purchase=()=>pending.promise;app.click('gems');app.click('paid-gems','ochavo_gems_200');
  assert.deepEqual(app.calls,[['purchase-gems','ochavo_gems_200']]);app.revoke();app.user={uid:'account-b',emailVerified:true};app.admitted=true;
  pending.resolve({message:'Private purchase A'});await settle();assert.equal(app.dialog.open,false);assert.equal(app.toast.textContent,'');
});
test('a stale gem purchase action opens recovery if the account balance is no longer confirmed',async()=>{
  for(const viewOverrides of [{canSpend:false},{pending:true}]){
    const app=mount({viewOverrides,purchaseOverrides:{web:true}});
    app.click('paid-gems','ochavo_gems_200');await settle();
    assert.deepEqual(app.calls,[]);assert.match(app.dialog.innerHTML,/confirmar|confirmando/);
  }
});

test('long coupons pasted into friend invitations open the Plus form intact without contacting referrals',async()=>{
 for(const prefix of ['OCHAVO','VIRUTA']){
  const app=mount({promoEnabled:true}),code=prefix+'-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF';
  app.click('attach');assert.match(app.dialog.innerHTML,/maxlength="160"/);assert.doesNotMatch(app.dialog.innerHTML,/placeholder="10 caracteres"/);
  app.node('#vr-invite-input').value=code;app.click('attach-save');await settle();
  assert.equal(app.dialog.open,false);assert.deepEqual(app.calls,[['promo-open',code]]);assert.equal(app.api.busy(),false);
 }
});
test('native and unavailable promotion services explain where to redeem a coupon without sending it as a referral',async()=>{
 for(const options of [{native:true,promoEnabled:true},{promoEnabled:false}]){
  const app=mount(options);app.click('attach');app.node('#vr-invite-input').value='OCHAVO-0123-4567-89AB-CDEF-0123-4567-89AB-CDEF';app.click('attach-save');await settle();
  assert.deepEqual(app.calls,[]);assert.equal(app.dialog.open,true);assert.match(app.node('.vr-dialog-message').textContent,/código promocional de Plus/);assert.match(app.node('.vr-dialog-message').textContent,/misma cuenta/);
 }
});
test('ten-character friend invitations still use the referral flow',async()=>{
 const app=mount({promoEnabled:true});app.click('attach');app.node('#vr-invite-input').value='ABCD234567';app.click('attach-save');await settle();
 assert.ok(app.calls.includes('attach'));assert.equal(app.calls.some(c=>Array.isArray(c)&&c[0]==='promo-open'),false);assert.equal(app.dialog.open,false);
});

test('a refill finishing after logout cannot reopen a dialog, show a toast or repaint the old profile',async()=>{
  const app=mount(),pending=deferred();app.operations.refill=()=>pending.promise;
  app.main.dataset.view='profile';app.api.render('profile');app.api.lives();app.click('refill');assert.equal(app.api.busy(),true);
  app.revoke();pending.resolve();await settle();
  assert.equal(app.dialog.open,false);assert.equal(app.dialog.innerHTML,'');assert.equal(app.main.innerHTML,'');assert.equal(app.bar.innerHTML,'');assert.equal(app.toast.textContent,'');
  assert.equal(app.api.busy(),false);assert.equal(app.after,1);
});

test('a purchase finishing after account replacement cannot reveal the previous result in the new account',async()=>{
  const app=mount(),pending=deferred();app.operations.purchase=()=>pending.promise;app.api.plus();app.click('subscribe');
  app.revoke();app.user={uid:'account-b',emailVerified:true,displayName:'Account B'};app.admitted=true;
  app.main.dataset.view='profile';app.api.render('profile');const before=app.main.innerHTML;
  pending.resolve({message:'Private result A'});await settle();
  assert.equal(app.dialog.open,false);assert.equal(app.toast.textContent,'');assert.equal(app.main.innerHTML,before);assert.match(before,/Account B/);
});

test('a stale failure after logout is not presented as an error in the next session',async()=>{
  const app=mount(),pending=deferred();app.operations.refill=()=>pending.promise;app.api.lives();app.click('refill');
  app.revoke();pending.reject(Error('Private account A failure'));await settle();
  assert.equal(app.toast.textContent,'');assert.equal(app.dialog.innerHTML,'');assert.equal(app.api.busy(),false);
});

test('the same UID represented by a new Auth object invalidates a pending invitation even without reset',async()=>{
  const app=mount(),pending=deferred();app.operations.code=()=>pending.promise;app.click('invite');
  app.user={uid:'account-a',emailVerified:true,displayName:'Reauthenticated'};pending.resolve('PRIVATECODE');await settle();
  assert.equal(app.dialog.open,false);assert.doesNotMatch(app.dialog.innerHTML,/PRIVATECODE/);
});

test('a retry cannot start reconciliation after its access was revoked',async()=>{
  const app=mount(),pending=deferred();app.operations.retry=()=>pending.promise;app.click('retry');app.revoke();pending.resolve();await settle();
  assert.deepEqual(app.calls,['retry']);assert.equal(app.toast.textContent,'');
});

test('referral reconciliation stops before reading or awarding when account selection changes',async()=>{
  const app=mount(),pending=deferred();app.operations.qualify=()=>pending.promise;
  const refreshing=app.api.refreshReferrals();app.revoke();app.user={uid:'account-b',emailVerified:true};pending.resolve();await refreshing;
  assert.deepEqual(app.calls,['qualify']);
});

test('referral rewards stop between awaits so receipts from A are never submitted to B',async()=>{
  const app=mount(),pending=deferred();app.operations.read=async()=>({receipts:['one','two']});app.operations.claim=()=>pending.promise;
  const refreshing=app.api.refreshReferrals();await settle();assert.deepEqual(app.calls,['qualify','read','claim:one']);
  app.revoke();app.user={uid:'account-b',emailVerified:true};pending.resolve();await refreshing;
  assert.deepEqual(app.calls,['qualify','read','claim:one']);
});


test('lifetime Plus shows a free access page without a price, renewal or purchase action',()=>{
 const app=mount({viewOverrides:{premium:true,lifetimePremium:true,paidSubscriptionActive:false}});
 app.api.render('profile');assert.match(app.main.innerHTML,/Plus, contigo de por vida/);assert.match(app.main.innerHTML,/Ver mi acceso/);
 app.api.plus();assert.match(app.dialog.innerHTML,/Gratis · Sin renovación ni cargos/);assert.doesNotMatch(app.dialog.innerHTML,/data-vr="subscribe"|renovación automática|vr-plan-price|Gestionar en/);
});

test('a previous paid subscription remains visible beside lifetime access so it can be cancelled',()=>{
 const app=mount({viewOverrides:{premium:true,lifetimePremium:true,paidSubscriptionActive:true,commerceStore:'play_store'}});
 app.api.plus();assert.match(app.dialog.innerHTML,/no cancela una suscripción de pago previa/);assert.match(app.dialog.innerHTML,/Gestionar en Google Play/);assert.doesNotMatch(app.dialog.innerHTML,/data-vr="subscribe"/);
});

test('web subscription management follows its purchase origin on either platform',async()=>{
 for(const native of [false,true]){
  const app=mount({native,viewOverrides:{premium:true,paidSubscriptionActive:true,commerceStore:'rc_billing'},purchaseOverrides:{canManage:true}});
  app.api.plus();assert.match(app.dialog.innerHTML,/Gestionar mi suscripción web/);assert.doesNotMatch(app.dialog.innerHTML,/Gestionar en Google Play|Gestionar en App Store/);
  app.click('manage');await settle();assert.deepEqual(app.calls,['manage']);
 }
 const missing=mount({viewOverrides:{premium:true,commerceStore:'rc_billing'},purchaseOverrides:{canManage:false}});
 missing.api.plus();assert.match(missing.dialog.innerHTML,/enlace de gestión que recibiste por correo/);assert.doesNotMatch(missing.dialog.innerHTML,/data-vr="manage"/);
});

test('sandbox checkouts are labelled and release the modal before opening payment controls',async()=>{
 for(const action of ['subscribe','paid-lives']){
  const app=mount({viewOverrides:{lives:0,totalLives:0},purchaseOverrides:{web:true,environment:'sandbox'}}),pending=deferred();
  app.operations.purchase=()=>{assert.equal(app.dialog.open,false);return pending.promise;};
  if(action==='subscribe')app.api.plus();else app.api.lives();
  assert.match(app.dialog.innerHTML,/Modo de prueba · sin cargos reales/);
  app.click(action);assert.equal(app.dialog.open,false);pending.resolve({message:'Pago de prueba confirmado'});await settle();
  assert.equal(app.dialog.open,true);assert.deepEqual(app.calls,['purchase']);
 }
 const normal=mount();normal.api.plus();assert.doesNotMatch(normal.dialog.innerHTML,/Modo de prueba/);
});

test('a stale purchase button cannot buy lives or a subscription after lifetime access activates',async()=>{
 const app=mount({viewOverrides:{premium:true,lifetimePremium:true}});
 app.click('subscribe');await settle();app.click('paid-lives');await settle();assert.equal(app.calls.includes('purchase'),false);assert.match(app.dialog.innerHTML,/Ochavo Plus de por vida/);
});

test('profile exposes logout directly and delegates it even when learning access is unavailable',async()=>{
 const app=mount();app.api.render('profile');
 assert.match(app.main.innerHTML,/data-vr="logout">Cerrar sesión/);
 app.admitted=false;app.click('logout');await settle();
 assert.deepEqual(app.calls,['logout']);
 app.user=null;app.click('logout');await settle();
 assert.deepEqual(app.calls,['logout'],'a stale button cannot log out a different anonymous state');
});

test('unconfirmed cached lives open recovery without offering refills or Plus',()=>{
 for(const status of ['loading','saving','pending','error','offline','storage-error']){
  const app=mount({viewOverrides:{lives:5,totalLives:5,canSpend:false,status,pending:status==='pending'}});
  app.api.lives();
  assert.equal(app.dialog.open,true);
  assert.match(app.dialog.innerHTML,/último saldo guardado/);
  assert.match(app.dialog.innerHTML,status==='loading'||status==='saving'||status==='pending'?/Estamos confirmando tu progreso/:/No hemos podido confirmar tu progreso/);
  assert.match(app.dialog.innerHTML,/data-vr="retry"/);
  assert.match(app.dialog.innerHTML,/data-vr="logout"/);
  assert.doesNotMatch(app.dialog.innerHTML,/data-vr="(?:plus|paid-lives|refill)"|vidas disponibles|9,99/);
 }
});

test('session recovery remains available before learning admission and uses the unified callback',async()=>{
 const app=mount({admitted:false,unifiedRecovery:true,viewOverrides:{canSpend:false,status:'error'}});
 app.api.recovery();assert.equal(app.dialog.open,true);
 app.click('retry');await settle();
 assert.deepEqual(app.calls,['recover']);
 assert.equal(app.dialog.open,true,'an unconfirmed result is not presented as successful');
 assert.equal(app.toast.textContent,'');
 app.click('logout');await settle();assert.deepEqual(app.calls,['recover','logout']);
 assert.equal(app.dialog.open,false);
});

test('successful recovery closes the failure dialog only after the game is usable',async()=>{
 const state={canSpend:false,status:'error'},app=mount({unifiedRecovery:true,viewOverrides:state});
 app.operations.recover=async()=>{state.canSpend=true;state.status='saved';};
 app.api.recovery();app.click('retry');await settle();
 assert.deepEqual(app.calls,['recover']);assert.equal(app.dialog.open,false);
 assert.match(app.toast.textContent,/Ya puedes continuar/);
});

test('a failed recovery keeps logout usable and never displays a refill offer',async()=>{
 const app=mount({unifiedRecovery:true,viewOverrides:{canSpend:false,status:'error'}});
 app.operations.recover=async()=>{throw Error('No se pudo confirmar la sesión.');};
 app.api.recovery();app.click('retry');await settle();
 assert.equal(app.api.busy(),false);assert.equal(app.dialog.open,true);
 assert.match(app.node('.vr-dialog-message').textContent,/confirmar la sesión/);
 assert.doesNotMatch(app.dialog.innerHTML,/data-vr="(?:refill|paid-lives|plus)"/);
 app.click('logout');await settle();assert.deepEqual(app.calls,['recover','logout']);
});

test('confirmed exhaustion still exposes the lives screen',()=>{
 const app=mount({viewOverrides:{lives:0,totalLives:0,canSpend:true,status:'saved'}});
 app.api.lives();assert.match(app.dialog.innerHTML,/0 vidas disponibles/);
 assert.match(app.dialog.innerHTML,/data-vr="refill"/);
 assert.doesNotMatch(app.dialog.innerHTML,/No hemos podido confirmar/);
});

test('profile distinguishes a synchronization failure, an in-flight save and offline access',()=>{
 for(const [status,heading] of [['error','Pendiente de sincronizar'],['saving','Estamos confirmando tu progreso'],['offline','Sin conexión']]){
  const app=mount({viewOverrides:{canSpend:false,status}});app.api.render('profile');
  assert.match(app.main.innerHTML,new RegExp(heading));
  assert.match(app.main.innerHTML,/Reintentar sincronización/);
  if(status!=='offline')assert.doesNotMatch(app.main.innerHTML,/Conecta para guardar|Reintentar conexión|necesitamos conexión/);
 }
});

test('each purchase dialog offers an explicit reviewed dismissal without calling checkout or granting benefits',async()=>{
 for(const [kind,heading] of [['gems',/Tus gemas, tus atajos/],['lives',/3 vidas disponibles/],['plus',/Aprende con toda la libertad/]]){
  const state={interruptedPurchase:{operationId:'attempt-1',kind:'gems'}},app=mount({purchaseOverrides:state});
  app.click(kind);assert.match(app.dialog.innerHTML,/Revisar intento interrumpido/);app.click('review-interrupted-purchase');
  assert.match(app.dialog.innerHTML,/no permite saber si hubo un cargo/);assert.match(app.dialog.innerHTML,/No cancela ni devuelve pagos y no añade gemas, vidas ni Plus/);
  assert.match(app.dialog.innerHTML,/data-vr="close-interrupted-purchase" disabled/);assert.deepEqual(app.calls,[]);
  app.click('close-interrupted-purchase');await settle();assert.deepEqual(app.calls,[]);assert.match(app.node('.vr-dialog-message').textContent,/marca la casilla/);
  const checkbox=app.node('#vr-reviewed-payment');checkbox.id='vr-reviewed-payment';checkbox.checked=true;app.dialog.listeners.change({target:checkbox});assert.equal(app.node('[data-vr="close-interrupted-purchase"]').disabled,false);
  app.operations.closeAttempt=async()=>{state.interruptedPurchase=null;return {message:'Intento cerrado. Esto no cancela ni devuelve ningún cargo.'};};
  app.click('close-interrupted-purchase');await settle();assert.equal(app.calls.length,1);assert.equal(app.calls[0][0],'close-attempt');assert.equal(app.calls[0][1].operationId,'attempt-1');assert.equal(app.calls[0][1].reviewed,true);
  assert.match(app.dialog.innerHTML,heading);assert.doesNotMatch(app.dialog.innerHTML,/Revisar intento interrumpido/);assert.match(app.toast.textContent,/no cancela ni devuelve/);
 }
});

test('keeping an interrupted purchase leaves the guard alone and returns to its original dialog',async()=>{
 const app=mount({purchaseOverrides:{interruptedPurchase:{operationId:'attempt-1',kind:'lives'}}});app.click('gems');app.click('review-interrupted-purchase');app.click('keep-interrupted-purchase');await settle();
 assert.deepEqual(app.calls,[]);assert.match(app.dialog.innerHTML,/Tus gemas, tus atajos/);assert.match(app.dialog.innerHTML,/Revisar intento interrumpido/);
 app.click('close-interrupted-purchase');await settle();assert.deepEqual(app.calls,[]);
 const normal=mount();normal.click('gems');assert.doesNotMatch(normal.dialog.innerHTML,/Revisar intento interrumpido/);normal.click('review-interrupted-purchase');assert.doesNotMatch(normal.dialog.innerHTML,/Antes de volver a comprar/);
});

test('review confirmation belongs to its original session, even when the new Auth object has the same UID',async()=>{
 const app=mount({purchaseOverrides:{interruptedPurchase:{operationId:'attempt-1',kind:'gems'}}});app.click('gems');app.click('review-interrupted-purchase');app.node('#vr-reviewed-payment').checked=true;
 app.user={uid:'account-a',emailVerified:true,displayName:'New session'};app.click('close-interrupted-purchase');await settle();assert.deepEqual(app.calls,[]);
});

test('a pending dismissal cannot be submitted twice or display an old result after logout',async()=>{
 const app=mount({purchaseOverrides:{interruptedPurchase:{operationId:'attempt-1',kind:'gems'}}}),pending=deferred();app.operations.closeAttempt=()=>pending.promise;
 app.click('gems');app.click('review-interrupted-purchase');app.node('#vr-reviewed-payment').checked=true;app.click('close-interrupted-purchase');app.click('close-interrupted-purchase');assert.equal(app.calls.length,1);
 app.revoke();pending.resolve({message:'Private old result'});await settle();assert.equal(app.toast.textContent,'');assert.equal(app.dialog.open,false);assert.equal(app.dialog.innerHTML,'');
});

test('failed dismissal is presented as unresolved and preserves the purchase dialog',async()=>{
 const app=mount({purchaseOverrides:{interruptedPurchase:{operationId:'attempt-1',kind:'gems'}}});app.operations.closeAttempt=async()=>({message:'Hay otra compra abierta en una pestaña de esta cuenta.'});
 app.click('gems');app.click('review-interrupted-purchase');app.node('#vr-reviewed-payment').checked=true;app.click('close-interrupted-purchase');await settle();
 assert.match(app.dialog.innerHTML,/Tus gemas, tus atajos/);assert.match(app.dialog.innerHTML,/Revisar intento interrumpido/);assert.match(app.toast.textContent,/otra compra abierta/);assert.equal(app.calls.length,1);
});
