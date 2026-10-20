import {Capacitor} from '@capacitor/core';
import {PURCHASE_PRODUCTS,GEM_PURCHASE_PRODUCTS,purchaseError,verifiedPurchaseUser,purchaseConfiguration,findPurchaseProduct,purchaseFailure,storeManagementURL,validateBillingResponse} from './purchases-domain.js';
import {createWebPurchasesSDK} from './web-purchases.js';

const defaultLoadSDK=async()=> (await import('@revenuecat/purchases-capacitor')).Purchases;
const defaultOpenURL=url=>globalThis.window?.open(url,'_blank','noopener,noreferrer');
const defaultStorage=()=>{try{return {value:globalThis.localStorage||null,error:null};}catch(error){return {value:null,error};}};

/** The SDK supplies products and payment UI; only the billing server grants benefits. */
export function createPurchasesController({auth=null,getUser=()=>auth?.currentUser||null,onChange=()=>{},onError=()=>{},onSynced=async()=>{},platform=Capacitor,env=import.meta.env||{},loadSDK=null,storage=undefined,locks=globalThis.navigator?.locks||null,fetch:request=globalThis.fetch?.bind(globalThis),openURL=defaultOpenURL,isOnline=()=>globalThis.navigator?.onLine!==false}={}) {
  const config=purchaseConfiguration(platform,env);
  const persistence=storage===undefined?defaultStorage():{value:storage,error:null};
  const loadPurchasesSDK=loadSDK||(config.web?()=>createWebPurchasesSDK({environment:config.environment}):defaultLoadSDK);
  let user=null,epoch=0,busy=false,status='guest',message='',sdk=null,sdkUid=null,configuredSDK=false,listenerId=null,disposed=false;
  let subscription=null,lives=null,managementURL=null,confirmedStore=null,tail=Promise.resolve();
  let gemWallet=null,gemCatalogue=[],gemGrants=null;
  const gemPackages=new Map();
  // A UI-only receipt wait, scoped by UID and never used to grant any benefit.
  // Persist only this duplicate-payment guard, never tokens, receipts or benefits.
  const pendingPurchases=new Map();
  const pendingKey=uid=>'ochavo:billing-pending:v1:'+encodeURIComponent(env.VITE_FIREBASE_PROJECT_ID||'unconfigured')+':'+config.environment+':'+encodeURIComponent(uid);
  const markerProduct=kind=>kind==='subscription'?PURCHASE_PRODUCTS.subscription:kind==='lives'?PURCHASE_PRODUCTS.lives:null;
  const markerStore=()=>({android:'play_store',ios:'app_store',web:'rc_billing'})[config.store];
  const safeReference=value=>typeof value==='string'&&/^[!-~]{1,255}$/.test(value);
  const interruptedConsumable=value=>value?.schemaVersion===2&&['lives','gems'].includes(value.kind)&&value.phase==='started'&&!Object.hasOwn(value,'transactionId');
  function persistedMarker(value){
    if(value?.schemaVersion===2&&['subscription','lives','gems'].includes(value.kind)&&typeof value.productId==='string'&&safeReference(value.operationId)&&value.store===markerStore()&&['started','received'].includes(value.phase)&&Number.isSafeInteger(value.startedAtMs)&&value.startedAtMs>=0&&(value.kind==='gems'?Object.hasOwn(GEM_PURCHASE_PRODUCTS,value.productId):value.productId===markerProduct(value.kind))&&(value.phase==='started'&&!Object.hasOwn(value,'transactionId')||value.phase==='received'&&safeReference(value.transactionId)))return {...value};
    // Preserve legacy waits. New consumable checkouts always require an exact
    // SDK transaction reference and never resolve from aggregated balance alone.
    if(value?.schemaVersion===1&&value.kind==='subscription')return {kind:'subscription',legacy:true};
    if(value?.schemaVersion===1&&value.kind==='lives'&&Number.isSafeInteger(value.expectedGranted)&&value.expectedGranted>=5)return {kind:'lives',expectedGranted:value.expectedGranted,legacy:true};
    return null;
  }
  function usableStorage(){
    if(persistence.error||!persistence.value||!['getItem','setItem','removeItem'].every(key=>typeof persistence.value[key]==='function'))throw purchaseError('pending-storage','');
    return persistence.value;
  }
  function loadPending(uid,{force=false}={}){
    if(!force&&pendingPurchases.has(uid)&&pendingPurchases.get(uid).kind!=='unreadable')return;
    let raw;try{raw=usableStorage().getItem(pendingKey(uid));}catch{pendingPurchases.set(uid,{kind:'unreadable'});return;}
    if(raw===null||raw===undefined){pendingPurchases.delete(uid);return;}
    let value;try{if(typeof raw==='string'&&raw.length<=1024)value=persistedMarker(JSON.parse(raw));}catch{}
    pendingPurchases.set(uid,value||{kind:'unreadable'});
    return raw;
  }
  function savePending(uid,value){
    const pending={schemaVersion:2,...value};
    if(!persistedMarker(pending))throw purchaseError('pending-storage','');
    pendingPurchases.set(uid,pending);
    const raw=JSON.stringify(pending);
    try{
      const durable=usableStorage(),priorRaw=durable.getItem(pendingKey(uid));
      if(priorRaw!==null){let prior;try{prior=persistedMarker(JSON.parse(priorRaw));}catch{}if(!prior||prior.operationId!==pending.operationId){pendingPurchases.set(uid,prior||{kind:'unreadable'});throw pendingError(uid);}}
      durable.setItem(pendingKey(uid),raw);if(durable.getItem(pendingKey(uid))!==raw)throw purchaseError('pending-storage','');
    }
    catch(error){if(error?.code?.startsWith('billing/'))throw error;throw purchaseError('pending-storage','');}
  }
  function clearPending(uid){
    try{
      const durable=usableStorage(),expected=pendingPurchases.get(uid),priorRaw=durable.getItem(pendingKey(uid));
      if(priorRaw!==null&&expected?.operationId){let prior;try{prior=persistedMarker(JSON.parse(priorRaw));}catch{}if(!prior||prior.operationId!==expected.operationId){pendingPurchases.set(uid,prior||{kind:'unreadable'});throw pendingError(uid);}}
      durable.removeItem(pendingKey(uid));if(durable.getItem(pendingKey(uid))!==null)throw purchaseError('pending-storage','');
    }
    catch(error){if(error?.code?.startsWith('billing/'))throw error;throw purchaseError('pending-storage','');}
    pendingPurchases.delete(uid);
  }
  const pendingError=uid=>{const pending=pendingPurchases.get(uid);return purchaseError(pending?.kind==='unreadable'?'pending-storage':!pending?.legacy&&pending?.kind!=='subscription'&&pending?.phase==='started'?'receipt-missing':'sync-pending','');};
  const currentUser=()=>getUser();
  const eligible=()=>verifiedPurchaseUser(user)&&verifiedPurchaseUser(currentUser())&&currentUser().uid===user.uid;
  const queue=task=>{const pending=tail.then(task);tail=pending.catch(()=>{});return pending;};
  const snapshot=()=>({generation:epoch,uid:user?.uid||null});
  const isCurrent=ctx=>!disposed&&ctx.generation===epoch&&user?.uid===ctx.uid&&eligible();
  const assertCurrent=ctx=>{if(!isCurrent(ctx))throw purchaseError('identity-changed','La cuenta ha cambiado.');};

  function getView() {
    const missingWebLock=config.web&&config.configured&&eligible()&&typeof locks?.request!=='function';
    const available=config.configured&&eligible()&&!missingWebLock&&!busy&&!pendingPurchases.has(user?.uid)&&isOnline()&&['ready','cancelled','unavailable'].includes(status);
    const visibleWallet=eligible()?gemWallet:null;
    const gemProducts=visibleWallet?gemCatalogue.flatMap(item=>{const product=gemPackages.get(item.productId);return product?[{productId:item.productId,gems:item.gems,price:product.priceString,currencyCode:product.currencyCode,canPurchase:available}]:[];}):[];
    const pending=pendingPurchases.get(user?.uid);
    const interruptedPurchase=config.configured&&eligible()&&!missingWebLock&&!busy&&isOnline()&&status!=='deletion-pending'&&interruptedConsumable(pending)?{operationId:pending.operationId,kind:pending.kind}:null;
    return {status,busy,configured:config.configured,native:config.native,web:config.web,environment:config.environment,canPurchase:available&&!!(subscription||lives||gemProducts.length),canSubscribe:available&&!!subscription,canPurchaseLives:available&&!!lives,canPurchaseGems:available&&gemProducts.length>0,gemProducts,trustedGems:visibleWallet?{...visibleWallet}:null,trustedGemGrants:visibleWallet&&gemGrants?gemGrants.map(item=>({...item})):null,
      interruptedPurchase,
      subscriptionPrice:subscription?.priceString||null,livesPrice:lives?.priceString||null,message:missingWebLock?'Para comprar de forma segura, actualiza tu navegador o usa uno que permita bloquear compras simultáneas entre pestañas.':message,
      canManage:!!managementTarget()&&eligible()&&!busy,canRestore:config.configured&&eligible()&&!busy&&isOnline()&&status!=='deletion-pending',
      offerings:{subscription:subscription?{id:subscription.identifier,price:subscription.priceString,period:subscription.subscriptionPeriod}:null,lives:lives?{id:lives.identifier,price:lives.priceString}:null,gems:gemProducts.map(item=>({...item}))}};
  }
  const notify=()=>{if(!disposed)onChange(getView());};
  const managementTarget=()=>storeManagementURL(managementURL,({rc_billing:'web',app_store:'ios',play_store:'android'})[confirmedStore]||config.store);
  function unavailable() {
    if(!config.configured)return {status:'not-configured',message:'Las compras estarán disponibles cuando terminemos de activar el servicio.'};
    if(!eligible())return {status:user?'unverified':'guest',message:'Entra en tu cuenta y verifica el correo antes de comprar o restaurar.'};
    if(!isOnline())return {status:'offline',message:'Conecta a internet para consultar la tienda y confirmar las compras.'};
    return null;
  }
  function applyUnavailable() {
    const reason=unavailable();
    if(reason){status=reason.status;message=reason.message;notify();}
    return reason;
  }
  function fail(error,ctx) {
    if(!isCurrent(ctx))return getView();
    const failure=purchaseFailure(error);
    status=failure.status;message=failure.message;
    if(!['cancelled','pending'].includes(status))onError(purchaseError(failure.code,failure.message));
    return getView();
  }
  async function ensureSDK(ctx) {
    assertCurrent(ctx);
    if(!sdk)sdk=await loadPurchasesSDK();
    assertCurrent(ctx);
    if(!configuredSDK) {
      await sdk.setLogLevel({level:'ERROR'});
      assertCurrent(ctx);
      await sdk.configure({apiKey:config.key,appUserID:ctx.uid});
      configuredSDK=true;sdkUid=ctx.uid;
    } else if(sdkUid!==ctx.uid) {
      await sdk.logIn({appUserID:ctx.uid});sdkUid=ctx.uid;
    }
    assertCurrent(ctx);
    if(config.native&&listenerId===null)listenerId=await sdk.addCustomerInfoUpdateListener(()=>{
      // Payloads may be cached or refer to a previous SDK identity. They are hints only.
      if(!disposed&&!busy&&eligible()&&sdkUid===user.uid)void refresh({hintOnly:true});
    });
    assertCurrent(ctx);
    const identity=await sdk.getAppUserID();
    assertCurrent(ctx);
    if(identity?.appUserID!==ctx.uid)throw purchaseError('identity-changed','La identidad de la tienda no coincide con tu cuenta.');
  }
  async function syncBackend(ctx,{requireEnvironment=false}={}) {
    assertCurrent(ctx);
    loadPending(ctx.uid);
    if(!isOnline())throw purchaseError('offline','Sin conexión.');
    const token=await currentUser().getIdToken();
    assertCurrent(ctx);
    if(!token||!request)throw purchaseError('not-configured','Falta configurar el servicio de compras.');
    const waiting=pendingPurchases.get(ctx.uid),selector=waiting?.phase==='received'&&waiting.kind!=='subscription'?{productId:waiting.productId,transactionId:waiting.transactionId,store:waiting.store}:null;
    const response=await request(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'sync',...(selector?{purchase:selector}:{})}),credentials:'omit',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    assertCurrent(ctx);
    let data;
    try{data=await response.json();}catch{throw purchaseError('invalid-response','No se pudo leer la confirmación.');}
    assertCurrent(ctx);
    if(!response.ok)throw purchaseError(data?.error?.code||'server-error','No se pudo confirmar la operación con el servidor.');
    const result=validateBillingResponse(data);
    if(selector&&result.purchaseConfirmation&&['productId','transactionId','store'].some(key=>result.purchaseConfirmation[key]!==selector[key]))throw purchaseError('invalid-response','El comprobante confirmado no corresponde a esta operación.');
    // The public production app cannot accidentally grant or start sandbox sales.
    // Older native production backends are tolerated during a staged rollout;
    // web and every sandbox session require the explicit server handshake.
    if((requireEnvironment||config.web||config.environment==='sandbox'||result.billingEnvironment!==undefined)&&result.billingEnvironment!==config.environment)throw purchaseError('environment-mismatch','');
    if(result.gems&&result.gems.environment!==config.environment)throw purchaseError('environment-mismatch','');
    if(result.gems&&gemWallet&&(result.gems.revision<gemWallet.revision||result.gems.revision===gemWallet.revision&&['granted','consumed','balance'].some(key=>result.gems[key]!==gemWallet[key])))throw purchaseError('invalid-response','El saldo de gemas no coincide con su revisión confirmada.');
    if(result.gems&&gemWallet&&result.gems.revision===gemWallet.revision&&result.gemGrants&&gemGrants&&Object.keys(GEM_PURCHASE_PRODUCTS).some(productId=>(result.gemGrants.find(item=>item.productId===productId)?.granted||0)!==(gemGrants.find(item=>item.productId===productId)?.granted||0)))throw purchaseError('invalid-response','Los abonos de gemas no coinciden con su revisión confirmada.');
    confirmedStore=result.commerce.store;
    await onSynced({...result,uid:ctx.uid,isCurrent:()=>isCurrent(ctx)});
    assertCurrent(ctx);
    gemWallet=result.gems?{schemaVersion:1,revision:result.gems.revision,environment:result.gems.environment,granted:result.gems.granted,consumed:result.gems.consumed,balance:result.gems.balance}:null;
    gemGrants=result.gemGrants?result.gemGrants.map(item=>({productId:item.productId,granted:item.granted})):null;
    gemCatalogue=gemWallet&&gemGrants&&result.billingEnvironment===config.environment?(result.gemProducts||[]).map(item=>({productId:item.productId,gems:item.gems})):[];
    const pending=pendingPurchases.get(ctx.uid);
    if(pending&&(pending.kind==='subscription'?result.commerce.premiumUntilMs>result.serverTimeMs:pending.legacy&&pending.kind==='lives'?result.commerce.paidGranted>=pending.expectedGranted:pending.phase==='received'&&result.purchaseConfirmation&&['confirmed','refunded'].includes(result.purchaseConfirmation.status)))clearPending(ctx.uid);
    return result;
  }
  async function readProducts(ctx) {
    const [plus,pack]=await Promise.all([
      sdk.getProducts({productIdentifiers:[PURCHASE_PRODUCTS.subscription],type:'SUBSCRIPTION'}),
      sdk.getProducts({productIdentifiers:[PURCHASE_PRODUCTS.lives,...gemCatalogue.map(item=>item.productId)],type:'NON_SUBSCRIPTION'})
    ]);
    assertCurrent(ctx);
    subscription=findPurchaseProduct(plus?.products,'subscription',{store:config.store});
    lives=findPurchaseProduct(pack?.products,'lives',{store:config.store});
    gemPackages.clear();
    for(const item of gemCatalogue){const product=findPurchaseProduct(pack?.products,item.productId,{store:config.store});if(product)gemPackages.set(item.productId,product);}
  }
  async function confirmStoreOperation(ctx) {
    try{
      const result=await syncBackend(ctx);
      if(pendingPurchases.has(ctx.uid))throw pendingError(ctx.uid);
      return result;
    }
    catch(error){
      if(['account/deletion-pending','billing/identity-conflict','billing/unauthenticated','billing/verification-required','billing/pending-storage','billing/receipt-missing'].includes(error?.code))throw error;
      throw purchaseError('sync-pending','Falta confirmación.');
    }
  }
  async function readManagement(ctx) {
    const result=await sdk.getCustomerInfo();assertCurrent(ctx);
    managementURL=storeManagementURL(result?.customerInfo?.managementURL,null);
    // Do not read entitlement or nonSubscriptionTransactions to grant anything here.
  }
  function run(task,{phase='loading'}={}) {
    if(disposed)return Promise.resolve(getView());
    if(busy)return Promise.resolve({...getView(),message:'Espera a que termine la operación en curso.'});
    if(applyUnavailable())return Promise.resolve(getView());
    const ctx=snapshot();busy=true;status=phase;message=phase==='purchasing'?(config.web?'Completa el pago seguro en la ventana de compra.':'Completa la operación en tu tienda.'):'Comprobando las compras…';notify();
    return queue(async()=>{
      try {await ensureSDK(ctx);await task(ctx);}
      catch(error){fail(error,ctx);}
      finally {if(ctx.generation===epoch&&!disposed){busy=false;notify();}}
      return getView();
    });
  }
  function refresh({hintOnly=false}={}) {
    return run(async ctx=>{
      const refreshed=await syncBackend(ctx);
      if(!hintOnly){await readProducts(ctx);await readManagement(ctx);}
      assertCurrent(ctx);
      if(pendingPurchases.has(ctx.uid)){status='pending';message=purchaseFailure(pendingError(ctx.uid)).message;return;}
      status=subscription||lives||gemPackages.size?'ready':'unavailable';
      message=refreshed.purchaseConfirmation?.status==='refunded'?'La tienda ha confirmado la devolución de esta compra. Tu saldo refleja las ventajas que siguen disponibles.':subscription||lives||gemPackages.size?'Compras comprobadas. Tu cuenta muestra las ventajas confirmadas por el servidor.':'Los productos todavía no están disponibles en esta tienda.';
    });
  }
  function select(nextUser) {
    user=nextUser||null;++epoch;subscription=null;lives=null;managementURL=null;confirmedStore=null;gemWallet=null;gemCatalogue=[];gemGrants=null;gemPackages.clear();busy=false;
    // Deliberately never logOut(): RevenueCat would create an anonymous customer.
    // A verified selection uses logIn, serialised after any active payment operation.
    if(applyUnavailable())return Promise.resolve(getView());
    return refresh();
  }
  function purchase(kind,productId=null) {
    const product=kind==='subscription'?subscription:kind==='gems'?gemPackages.get(productId):lives;
    const view=getView(),allowed=kind==='subscription'?view.canSubscribe:kind==='gems'?view.gemProducts.some(item=>item.productId===productId&&item.canPurchase):view.canPurchaseLives;
    if(!allowed) {
      if(!product&&!busy&&!applyUnavailable()&&status!=='pending'&&status!=='deletion-pending'){status='unavailable';message=purchaseFailure(purchaseError('product-unavailable','')).message;notify();}
      return Promise.resolve(getView());
    }
    const checkout=async ctx=>{
      // Admin Auth + the deletion marker are checked before opening the payment sheet.
      // A cached Firebase token alone cannot establish that the account still exists.
      const before=await syncBackend(ctx);assertCurrent(ctx);
      if(pendingPurchases.has(ctx.uid))throw pendingError(ctx.uid);
      if(kind==='subscription'&&before.commerce.premiumUntilMs>before.serverTimeMs){
        await readManagement(ctx);assertCurrent(ctx);status='ready';
        message='Ya tienes una suscripción activa en esta cuenta. Puedes gestionarla desde donde la compraste. No hemos iniciado otro pago.';
        return;
      }
      const confirmedGem=kind==='gems'&&before.gems&&before.gemGrants&&before.billingEnvironment===config.environment?(before.gemProducts||[]).find(item=>item.productId===productId):null;
      if(kind==='gems'&&!confirmedGem)throw purchaseError('product-unavailable','');
      // The exact object whose price was displayed is passed back to the SDK.
      const expected={kind,productId:kind==='gems'?productId:markerProduct(kind),store:markerStore(),phase:'started',startedAtMs:Date.now(),operationId:crypto.randomUUID()};
      // Record every checkout before launching it. A browser close or process death
      // after payment must not lose the guard and accidentally offer a second bill.
      savePending(ctx.uid,expected);
      let purchased;
      try{purchased=await sdk.purchaseStoreProduct({product});}
      catch(error){const failure=purchaseFailure(error);if(['cancelled','unavailable','not-configured','unverified','deletion-pending'].includes(failure.status))clearPending(ctx.uid);throw error;}
      if(kind!=='subscription'){
        const transaction=purchased?.transaction;
        if(transaction?.productIdentifier!==expected.productId||!safeReference(transaction?.transactionIdentifier))throw purchaseError('receipt-missing','');
        savePending(ctx.uid,{...expected,phase:'received',transactionId:transaction.transactionIdentifier});
      }
      assertCurrent(ctx);
      status='confirming';message='La tienda ha respondido. Estamos comprobando la compra con el servidor.';notify();
      const confirmed=await confirmStoreOperation(ctx);
      await readManagement(ctx);
      assertCurrent(ctx);status='ready';message=confirmed.purchaseConfirmation?.status==='refunded'?'La tienda ha confirmado la devolución de esta compra. Tu saldo refleja las ventajas que siguen disponibles.':'Compra comprobada. Tu cuenta muestra las ventajas confirmadas por el servidor.';
    };
    return run(async ctx=>{
      if(!config.web)return checkout(ctx);
      if(typeof locks?.request!=='function')throw purchaseError('checkout-lock-unavailable','');
      // The browser lock spans preflight, persisted marker and the entire payment.
      // A second tab is rejected immediately instead of queueing another bill.
      return locks.request(pendingKey(ctx.uid),{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock)throw purchaseError('checkout-busy','');
        assertCurrent(ctx);return checkout(ctx);
      });
    },{phase:'purchasing'});
  }
  function restore() {
    return run(async ctx=>{
      await syncBackend(ctx);assertCurrent(ctx);
      await sdk.restorePurchases();assertCurrent(ctx);
      const restored=await confirmStoreOperation(ctx);
      await readManagement(ctx);assertCurrent(ctx);status='ready';
      message=restored.purchaseConfirmation?.status==='refunded'?'La tienda ha confirmado la devolución de esta compra. Las vidas y gemas ya gastadas no se reponen.':'Restauración comprobada. Las vidas y gemas ya gastadas no se reponen; tu saldo depende del registro confirmado de tu cuenta.';
    },{phase:'restoring'});
  }
  function closeInterruptedPurchase({operationId,reviewed=false}={}) {
    // This is an explicit dismissal of a local attempt, never a cancellation,
    // refund, receipt confirmation or benefit grant. A received receipt must stay.
    if(reviewed!==true||!safeReference(operationId))return Promise.resolve({...getView(),message:purchaseFailure(purchaseError('review-required','')).message});
    const identity=currentUser();
    const reviewedMarker=JSON.stringify(pendingPurchases.get(user?.uid));
    const assertRecoveryCurrent=ctx=>{assertCurrent(ctx);if(currentUser()!==identity)throw purchaseError('identity-changed','');};
    const closeAttempt=async ctx=>{
      assertRecoveryCurrent(ctx);
      const raw=loadPending(ctx.uid,{force:true}),pending=pendingPurchases.get(ctx.uid);
      if(pending?.kind==='unreadable')throw purchaseError('pending-storage','');
      if(!interruptedConsumable(pending)||pending.operationId!==operationId||JSON.stringify(pending)!==reviewedMarker)throw purchaseError('attempt-changed','');
      await syncBackend(ctx,{requireEnvironment:true});assertRecoveryCurrent(ctx);
      // Refresh products before removal: an SDK/network failure cannot leave a
      // dismissed attempt looking unresolved and invite another dismissal.
      await readProducts(ctx);assertRecoveryCurrent(ctx);
      const currentRaw=loadPending(ctx.uid,{force:true}),current=pendingPurchases.get(ctx.uid);
      if(current?.kind==='unreadable')throw purchaseError('pending-storage','');
      if(currentRaw!==raw||!interruptedConsumable(current)||current.operationId!==operationId)throw purchaseError('attempt-changed','');
      try {
        const durable=usableStorage();
        if(durable.getItem(pendingKey(ctx.uid))!==raw)throw purchaseError('attempt-changed','');
        durable.removeItem(pendingKey(ctx.uid));
        if(durable.getItem(pendingKey(ctx.uid))!==null)throw purchaseError('pending-storage','');
      } catch(error) {
        // A failed/uncertain removal keeps the in-memory guard too.
        if(error?.code?.startsWith('billing/'))throw error;
        throw purchaseError('pending-storage','');
      }
      pendingPurchases.delete(ctx.uid);status=subscription||lives||gemPackages.size?'ready':'unavailable';
      message='Intento cerrado en este dispositivo. Esto no cancela ni devuelve ningún cargo. Solo se mantienen las ventajas confirmadas por el servidor.';
    };
    return run(async ctx=>{
      if(!config.web)return closeAttempt(ctx);
      if(typeof locks?.request!=='function')throw purchaseError('checkout-lock-unavailable','');
      return locks.request(pendingKey(ctx.uid),{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock)throw purchaseError('checkout-busy','');
        assertCurrent(ctx);return closeAttempt(ctx);
      });
    });
  }
  async function manage() {
    if(!getView().canManage)return getView();
    const url=managementTarget();if(url)await openURL(url);
    return getView();
  }
  async function dispose() {
    disposed=true;++epoch;user=null;subscription=null;lives=null;gemWallet=null;gemCatalogue=[];gemGrants=null;gemPackages.clear();
    await tail;
    if(sdk&&listenerId!==null)await sdk.removeCustomerInfoUpdateListener({listenerToRemove:listenerId});
    listenerId=null;
  }
  function forget(uid){
    if(typeof uid!=='string'||!uid.trim())throw new Error('Falta la cuenta que se debe eliminar.');
    if(persistence.error)throw new Error('No se pudo eliminar el recordatorio local de compra.');
    // Account deletion must be able to report a failed removal instead of silently
    // claiming all of this account's local data was removed.
    persistence.value?.removeItem(pendingKey(uid));
    if(persistence.value&&persistence.value.getItem(pendingKey(uid))!==null)throw new Error('No se pudo eliminar el recordatorio local de compra.');
    pendingPurchases.delete(uid);
  }
  const initial=unavailable();if(initial){status=initial.status;message=initial.message;}
  return {getView,select,subscribe:()=>purchase('subscription'),purchaseLives:()=>purchase('lives'),purchaseGems:productId=>purchase('gems',productId),restore,refresh,closeInterruptedPurchase,manage,forget,dispose};
}
