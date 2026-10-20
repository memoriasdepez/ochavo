export const GEM_PURCHASE_PRODUCTS = Object.freeze({ochavo_gems_200:200,ochavo_gems_600:600,ochavo_gems_1500:1500});
export const PURCHASE_PRODUCTS = Object.freeze({subscription:'viruta_plus_monthly',lives:'viruta_lives_5',entitlement:'viruta_plus',gems:GEM_PURCHASE_PRODUCTS});

export const purchaseError = (code,message) => Object.assign(new Error(message),{code:code.includes('/')?code:'billing/'+code});

export function verifiedPurchaseUser(user) {
  return !!(user && typeof user.uid==='string' && user.uid.trim() && user.emailVerified===true && !user.isAnonymous && typeof user.getIdToken==='function');
}

export function purchaseConfiguration(platform,env={}) {
  const native=platform?.isNativePlatform?.()===true && ['android','ios'].includes(platform?.getPlatform?.());
  const web=platform?.isNativePlatform?.()===false && platform?.getPlatform?.()==='web';
  const store=native?platform.getPlatform():web?'web':null;
  const environment=String(env.VITE_BILLING_ENVIRONMENT||'production');
  const sandbox=environment==='sandbox';
  // Sandbox receipts must never touch the wallets or accounts in the public app.
  const isolatedSandbox=sandbox && typeof env.VITE_FIREBASE_PROJECT_ID==='string' && !!env.VITE_FIREBASE_PROJECT_ID.trim() && env.VITE_FIREBASE_PROJECT_ID!=='brote-62d26';
  const environmentOK=environment==='production'||isolatedSandbox;
  const key=String(store==='android'?env.VITE_REVENUECAT_ANDROID_KEY||'':store==='ios'?env.VITE_REVENUECAT_IOS_KEY||'':web?env.VITE_REVENUECAT_WEB_KEY||'':'').trim();
  let endpoint=null;
  try {
    const url=new URL(env.VITE_BILLING_API_URL);
    const localSandbox=web && env.DEV===true && env.VITE_USE_EMULATORS==='true' && sandbox && env.VITE_FIREBASE_PROJECT_ID==='demo-brote'
      && ['http://127.0.0.1:5001/demo-brote/europe-west1/billing','http://localhost:5001/demo-brote/europe-west1/billing'].includes(env.VITE_BILLING_API_URL);
    if((url.protocol==='https:'||localSandbox) && !url.username && !url.password && !url.hash && !url.search)endpoint=url.href;
  } catch {}
  // Production native builds must never silently use RevenueCat's Test Store.
  const validKey=store==='android'?/^goog_[A-Za-z0-9]+$/.test(key):store==='ios'?/^appl_[A-Za-z0-9]+$/.test(key):web?(sandbox?/^rcb_sb_[A-Za-z0-9_.-]+$/.test(key):/^rcb_(?!sb_)[A-Za-z0-9_.-]+$/.test(key)):false;
  return {native,web,store,environment,key:validKey?key:null,endpoint,configured:(native||web)&&environmentOK&&validKey&&!!endpoint};
}

export function findPurchaseProduct(products,kind,{store=null}={}) {
  const wanted=Object.hasOwn(GEM_PURCHASE_PRODUCTS,kind)?kind:kind==='subscription'||kind==='lives'?PURCHASE_PRODUCTS[kind]:null;
  if(!wanted)return null;
  const matches=(Array.isArray(products)?products:[]).filter(product=>{
    if(!product || typeof product.identifier!=='string')return false;
    const idOK=product.identifier===wanted || kind==='subscription' && product.identifier.startsWith(wanted+':');
    const priceOK=typeof product.priceString==='string' && product.priceString.trim().length>0 && product.priceString.length<=80 && Number.isFinite(product.price) && product.price>=0 && /^[A-Z]{3}$/.test(product.currencyCode);
    // Google Play reports one-time products by category. Its productType may be
    // UNKNOWN/INAPP even for a consumable. Accept only the exact approved SKU,
    // the non-subscription category and no subscription period in that case.
    // Apple and Web Billing explicitly distinguish consumable products.
    const consumableType=product.productType==='CONSUMABLE'||store==='android'&&[undefined,null,'UNKNOWN','INAPP'].includes(product.productType);
    const oneTimeCategory=product.productCategory==='NON_SUBSCRIPTION'||store==='android'&&product.productCategory==='INAPP';
    const kindOK=kind==='subscription'
      ?product.productCategory==='SUBSCRIPTION' && product.productType==='AUTO_RENEWABLE_SUBSCRIPTION' && product.subscriptionPeriod==='P1M'
      :oneTimeCategory && consumableType && !product.subscriptionPeriod;
    return idOK && priceOK && kindOK;
  });
  // An ambiguous Play base-plan configuration must be corrected in the store.
  return matches.length===1?matches[0]:null;
}

export function purchaseFailure(error) {
  const code=String(error?.code??error?.errorCode??'');
  const readable=String(error?.userInfo?.readableErrorCode||error?.readableErrorCode||'');
  if(code==='1'||readable==='PURCHASE_CANCELLED_ERROR'||error?.userCancelled===true)return {status:'cancelled',code:'billing/cancelled',message:'Has cancelado la compra.'};
  if(code==='20'||readable==='PAYMENT_PENDING_ERROR')return {status:'pending',code:'billing/pending',message:'La tienda indica que el pago está pendiente. No hemos añadido ventajas. Puedes comprobarlo de nuevo más tarde.'};
  if(code==='account/deletion-pending')return {status:'deletion-pending',code,message:'Esta cuenta está eliminada o en proceso de eliminación. No se pueden realizar compras con ella.'};
  if(code==='billing/identity-changed')return {status:'identity-changed',code,message:'La cuenta ha cambiado. La operación no se trasladó a la nueva cuenta.'};
  if(['10','35','billing/offline'].includes(code))return {status:'offline',code:'billing/offline',message:'Conecta a internet para consultar la tienda y confirmar las compras.'};
  if(['7','13','billing/receipt-owner','billing/identity-conflict'].includes(code))return {status:'error',code:'billing/receipt-owner',message:'Esta compra está vinculada a otra cuenta. Entra en la cuenta con la que se realizó o contacta con ayuda.'};
  if(['11','23','billing/not-configured','billing/environment-mismatch'].includes(code))return {status:'not-configured',code:'billing/not-configured',message:'Las compras estarán disponibles cuando terminemos de activar el servicio.'};
  if(['billing/unverified','billing/unauthenticated','billing/verification-required'].includes(code))return {status:'unverified',code,message:'Entra en tu cuenta y verifica el correo antes de comprar o restaurar.'};
  if(code==='5'||code==='billing/product-unavailable')return {status:'unavailable',code:'billing/product-unavailable',message:'Este producto todavía no está disponible en tu tienda. No se ha iniciado ninguna compra.'};
  if(code==='billing/sync-pending')return {status:'pending',code,message:'Falta confirmar la compra con el servidor. No repitas el pago: usa «Comprobar compras» cuando recuperes la conexión.'};
  if(code==='billing/pending-storage')return {status:'pending',code,message:'Hay un recordatorio de compra pendiente que no podemos leer. No repitas el pago. Contacta desde Ayuda para que comprobemos el cobro antes de volver a comprar.'};
  if(code==='billing/receipt-missing')return {status:'pending',code,message:'La operación se inició, pero no recibimos el comprobante de la tienda. No repitas el pago sin revisar los cargos. Usa «Comprobar compras» y «Revisar intento interrumpido», o contacta desde Ayuda.'};
  if(code==='billing/review-required')return {status:'pending',code,message:'Antes de cerrar el intento, revisa los cargos y los correos de compra y confirma que quieres cerrarlo.'};
  if(code==='billing/attempt-changed')return {status:'pending',code,message:'El intento ha cambiado o ya tiene un comprobante. No lo hemos cerrado. Usa «Comprobar compras» para revisar su estado.'};
  if(code==='billing/checkout-busy')return {status:'pending',code,message:'Hay otra compra abierta en una pestaña de esta cuenta. Termina esa operación y usa «Comprobar compras» antes de iniciar otra.'};
  if(code==='billing/checkout-lock-unavailable')return {status:'unavailable',code,message:'Actualiza tu navegador o usa uno que permita bloquear compras simultáneas entre pestañas para comprar de forma segura.'};
  return {status:'error',code:code.startsWith('billing/')?code:'billing/store-error',message:'No se pudo completar la comprobación. No hemos añadido ventajas sin confirmar. Inténtalo de nuevo desde «Comprobar compras».'};
}

export function storeManagementURL(value,store) {
  try {
    const url=new URL(value);
    const nativePortal=(url.hostname==='apps.apple.com' && url.pathname==='/account/subscriptions') || (url.hostname==='play.google.com' && url.pathname==='/store/account/subscriptions');
    // RevenueCat's customer portal manages an existing subscription. Never accept
    // arbitrary URLs, checkout links, custom redirect hosts or a supplied return URL.
    const rcPortal=(url.hostname==='api.revenuecat.com' && /^\/rcbilling\/v1\/customerportal\/[A-Za-z0-9_-]+\/portal\/?$/.test(url.pathname) && !url.search)
      || (url.hostname==='billing.revenuecat.com' && /^\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) && [...url.searchParams.keys()].every(key=>key==='token'));
    if(url.protocol==='https:' && !url.username && !url.password && !url.port && !url.hash && (nativePortal||rcPortal))return url.href;
  } catch {}
  return store==='ios'?'https://apps.apple.com/account/subscriptions':store==='android'?'https://play.google.com/store/account/subscriptions':null;
}

export function validateBillingResponse(value) {
  const commerce=value?.commerce;
  const counts=['paidGranted','paidConsumed','paidLives'];
  if(!commerce || !Number.isFinite(value.serverTimeMs) || value.serverTimeMs<0 || !Number.isFinite(commerce.premiumUntilMs) || commerce.premiumUntilMs<0 || counts.some(key=>!Number.isSafeInteger(commerce[key])||commerce[key]<0) || commerce.paidLives!==Math.max(0,commerce.paidGranted-commerce.paidConsumed))throw purchaseError('invalid-response','No se pudo verificar la respuesta del servicio de compras.');
  if(value.gems!==undefined) {
    const gems=value.gems;
    if(!gems||gems.schemaVersion!==1||!Number.isSafeInteger(gems.revision)||gems.revision<0||!['production','sandbox'].includes(gems.environment)||['granted','consumed','balance'].some(key=>!Number.isSafeInteger(gems[key])||gems[key]<0)||gems.balance!==Math.max(0,gems.granted-gems.consumed))throw purchaseError('invalid-response','No se pudo verificar el saldo de gemas.');
  }
  if(value.gemProducts!==undefined) {
    const catalogue=value.gemProducts;
    if(!Array.isArray(catalogue)||catalogue.length>Object.keys(GEM_PURCHASE_PRODUCTS).length)throw purchaseError('invalid-response','No se pudo verificar el catálogo de gemas.');
    const seen=new Set();
    for(const product of catalogue) {
      if(!product||typeof product.productId!=='string'||!Object.hasOwn(GEM_PURCHASE_PRODUCTS,product.productId)||product.gems!==GEM_PURCHASE_PRODUCTS[product.productId]||seen.has(product.productId))throw purchaseError('invalid-response','No se pudo verificar el catálogo de gemas.');
      seen.add(product.productId);
    }
  }
  if(value.gemGrants!==undefined) {
    if(!value.gems||!Array.isArray(value.gemGrants)||value.gemGrants.length>Object.keys(GEM_PURCHASE_PRODUCTS).length)throw purchaseError('invalid-response','No se pudieron verificar los abonos de gemas.');
    const seen=new Set();let total=0;
    for(const grant of value.gemGrants) {
      if(!grant||typeof grant.productId!=='string'||!Object.hasOwn(GEM_PURCHASE_PRODUCTS,grant.productId)||seen.has(grant.productId)||!Number.isSafeInteger(grant.granted)||grant.granted<0)throw purchaseError('invalid-response','No se pudieron verificar los abonos de gemas.');
      seen.add(grant.productId);total+=grant.granted;
    }
    if(!Number.isSafeInteger(total)||total!==value.gems.granted)throw purchaseError('invalid-response','Los abonos de gemas no coinciden con el saldo confirmado.');
  }
  if(value.purchaseConfirmation!==undefined){
    const receipt=value.purchaseConfirmation;
    const validProduct=receipt?.productId===PURCHASE_PRODUCTS.lives||Object.hasOwn(GEM_PURCHASE_PRODUCTS,receipt?.productId);
    if(!receipt||!validProduct||!['app_store','play_store','rc_billing'].includes(receipt.store)||typeof receipt.transactionId!=='string'||!/^[!-~]{1,255}$/.test(receipt.transactionId)||!['confirmed','refunded','pending'].includes(receipt.status)||receipt.confirmed!==(receipt.status==='confirmed'))throw purchaseError('invalid-response','No se pudo verificar el comprobante de esta compra.');
  }
  return value;
}
