import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const BILLING={entitlement:'viruta_plus',monthly:'viruta_plus_monthly',lives:'viruta_lives_5',packSize:5};
export const billingError=(code,message,status=400)=>Object.assign(Error(message),{code,status});
export const fingerprint=value=>createHash('sha256').update(value).digest('hex');
export const safeUid=uid=>typeof uid==='string'&&uid.length>0&&uid.length<=128&&!uid.includes('/')&&!uid.startsWith('$RCAnonymousID:');
export const emptyCommerce=()=>({schemaVersion:1,revision:0,premiumUntilMs:0,store:'',environment:'production',paidGranted:0,paidConsumed:0,paidLives:0});
export const emptyGemCommerce=()=>({schemaVersion:1,revision:0,environment:'production',granted:0,consumed:0,balance:0});
const nonnegativeInteger=value=>Number.isSafeInteger(value)&&value>=0;
const gemProductId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(value);
/** Server configuration only. Prices are store-owned; no package is enabled by default. */
export function validateGemPacks(value=[]){
  let packs=value;
  if(typeof value==='string'){try{packs=JSON.parse(value);}catch{throw billingError('billing/configuration','El catálogo de gemas no es válido.',503);}}
  if(!Array.isArray(packs)||packs.length>20)throw billingError('billing/configuration','El catálogo de gemas no es válido.',503);
  const ids=new Set();
  return packs.map(pack=>{
    if(!pack||Object.keys(pack).some(key=>!['productId','gems'].includes(key))||!gemProductId(pack.productId)||[BILLING.monthly,BILLING.lives,BILLING.entitlement].includes(pack.productId)||ids.has(pack.productId)||!Number.isSafeInteger(pack.gems)||pack.gems<1||pack.gems>1000000)throw billingError('billing/configuration','Cada paquete necesita un identificador único y una cantidad de gemas válida.',503);
    ids.add(pack.productId);return {productId:pack.productId,gems:pack.gems};
  });
}
const time=value=>typeof value==='string'?Date.parse(value):NaN;
// Stripe processes the payment, but RevenueCat Web Billing reports rc_billing.
// Direct Stripe Billing (stripe) is a different integration and is not configured.
const stores=new Set(['play_store','app_store','rc_billing']);
/** A selector identifies a receipt to check; it never supplies purchase evidence. */
export function validatePurchaseSelector(value){
  if(value===undefined)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==3||Object.keys(value).some(key=>!['productId','transactionId','store'].includes(key))||!gemProductId(value.productId)||value.productId===BILLING.monthly||!stores.has(value.store)||typeof value.transactionId!=='string'||!/^[\x21-\x7E]{1,255}$/.test(value.transactionId))throw billingError('billing/invalid-request','El identificador de la compra no es válido.');
  return {productId:value.productId,transactionId:value.transactionId,store:value.store};
}
export function parseSyncRequest(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||body.action!=='sync'||Object.keys(body).some(key=>!['action','purchase'].includes(key)))throw billingError('billing/invalid-request','Solicitud no válida.');
  return validatePurchaseSelector(body.purchase);
}
export function purchaseConfirmation(snapshot,selector){
  if(!selector)return null;
  const key=fingerprint(`${snapshot.environment}:${selector.store}:${selector.transactionId}`);
  const record=snapshot.purchases.find(p=>p.key===key&&(p.productId||(p.lives>0?BILLING.lives:''))===selector.productId);
  const providerStatus=snapshot.purchaseStatuses?.find(item=>item.key===key)?.status;
  const status=record?.active?'confirmed':record&&providerStatus==='refunded'?'refunded':'pending';
  return {...selector,confirmed:status==='confirmed',status};
}
export const BILLING_ORIGINS=new Set(['https://localhost','capacitor://localhost','https://ochavo.app','https://www.ochavo.app','https://brote-62d26.web.app','https://brote-62d26.firebaseapp.com']);
export function billingOrigins({firebaseProjectId,environment,emulator=false}={}){
  const origins=new Set(BILLING_ORIGINS);
  // Firebase project IDs are bounded lowercase DNS labels. Derive only the two
  // exact Hosting origins of this isolated test project, never arbitrary hosts.
  if(environment==='sandbox'&&firebaseProjectId!=='brote-62d26'&&typeof firebaseProjectId==='string'&&/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(firebaseProjectId)){
    origins.add(`https://${firebaseProjectId}.web.app`);
    origins.add(`https://${firebaseProjectId}.firebaseapp.com`);
  }
  if(emulator===true){origins.add('http://127.0.0.1:5173');origins.add('http://localhost:5173');}
  return origins;
}
export function assertBillingEnvironment({firebaseProjectId,environment,emulator=false}){
  if(!['production','sandbox'].includes(environment)||environment==='sandbox'&&firebaseProjectId==='brote-62d26'&&!emulator)throw billingError('billing/environment-conflict','Las compras de prueba requieren un proyecto de pruebas independiente.',503);
}

/** Only an HTTPS response fetched with the server secret may enter this function. */
export function parseProviderSnapshot({uid,customer,purchases,subscriptions,products,environment='production',now=Date.now(),gemPacks=[]}){
  if(!safeUid(uid)||!['production','sandbox'].includes(environment))throw billingError('billing/configuration','Configuración de compras incompleta.',503);
  const subscriber=customer?.subscriber;
  if(!subscriber||!Array.isArray(purchases)||!Array.isArray(subscriptions)||!products)throw billingError('billing/provider-unavailable','No se pudieron verificar las compras.',503);
  if(subscriber.original_app_user_id!==uid)throw billingError('billing/identity-conflict','La compra pertenece a otra identidad. Accede con la cuenta original.',409);
  const gemProducts=validateGemPacks(gemPacks),gemCatalog=new Map(gemProducts.map(pack=>[pack.productId,pack.gems]));
  let premiumUntilMs=0,store='';
  // V1's dictionary has one value per SKU. V2 retains every subscription across
  // stores and environments, including when native and web use the same SKU.
  for(const subscription of subscriptions){
    const product=products[subscription.product_id],identifier=product?.store_identifier;
    if(typeof identifier!=='string'||identifier.split(':')[0]!==BILLING.monthly||!stores.has(subscription.store)||subscription.environment!==environment)continue;
    if(subscription.customer_id!==uid||subscription.original_customer_id!==uid)throw billingError('billing/identity-conflict','La suscripción pertenece a otra identidad. Accede con la cuenta original.',409);
    if(product.type!=='subscription')throw billingError('billing/configuration','El producto Plus debe ser una suscripción.',503);
    if(!Array.isArray(subscription.entitlements?.items)||subscription.entitlements.next_page)throw billingError('billing/provider-unavailable','No se pudieron verificar todas las ventajas de la suscripción.',503);
    if(subscription.gives_access!==true||subscription.ownership!=='purchased'||!subscription.entitlements.items.some(e=>e.lookup_key===BILLING.entitlement))continue;
    if(!Number.isSafeInteger(subscription.current_period_ends_at)||subscription.current_period_ends_at<0)throw billingError('billing/provider-unavailable','La tienda devolvió una suscripción incompleta.',503);
    // V2 gives_access is authoritative; V1 supplies the exact grace deadline,
    // but only when it refers to this store and environment, never another SKU copy.
    const detail=subscriber.subscriptions?.[identifier];
    const sameDetail=detail?.store===subscription.store&&detail.is_sandbox===(environment==='sandbox');
    if(sameDetail&&detail.refunded_at)continue;
    let expiry=subscription.current_period_ends_at;
    if(subscription.status==='in_grace_period'&&sameDetail)expiry=Math.max(expiry,time(detail.grace_period_expires_date)||0);
    if(expiry>premiumUntilMs){premiumUntilMs=expiry;store=subscription.store;}
  }
  const verified=new Map(),purchaseStatuses=new Map();
  for(const purchase of purchases){
    const product=products[purchase.product_id],identifier=product?.store_identifier;
    const unitGems=gemCatalog.get(identifier),isLives=identifier===BILLING.lives;
    if((!isLives&&!unitGems)||!stores.has(purchase.store)||purchase.environment!==environment)continue;
    if(purchase.customer_id!==uid||purchase.original_customer_id!==uid)throw billingError('billing/identity-conflict','Esta compra no pertenece a la cuenta original.',409);
    if(!(product.type==='consumable'||product.type==='one_time'&&product.one_time?.is_consumable===true))throw billingError('billing/configuration','El producto de vidas o gemas debe ser consumible.',503);
    if(typeof purchase.store_purchase_identifier!=='string'||!purchase.store_purchase_identifier||!Number.isSafeInteger(purchase.quantity)||purchase.quantity<1||purchase.quantity>100||!Number.isSafeInteger(purchase.purchased_at)||purchase.purchased_at<0||purchase.purchased_at>now+300000)throw billingError('billing/provider-unavailable','La tienda devolvió una compra incompleta.',503);
    const key=fingerprint(`${environment}:${purchase.store}:${purchase.store_purchase_identifier}`);
    const item=isLives?{key,active:purchase.status==='owned',lives:BILLING.packSize*purchase.quantity}
      :{key,active:purchase.status==='owned',lives:0,gems:unitGems*purchase.quantity,productId:identifier,unitGems,quantity:purchase.quantity};
    if(verified.has(key)&&JSON.stringify(verified.get(key))!==JSON.stringify(item))throw billingError('billing/provider-unavailable','La tienda devolvió una transacción incoherente.',503);
    verified.set(key,item);
    const status=purchase.status==='owned'?'confirmed':purchase.status==='refunded'?'refunded':'pending';
    if(purchaseStatuses.has(key)&&purchaseStatuses.get(key)!==status)throw billingError('billing/provider-unavailable','La tienda devolvió una transacción incoherente.',503);
    purchaseStatuses.set(key,status);
  }
  // Receipt statuses are transient server evidence, never fields of the wallet or ledger.
  return {premiumUntilMs,store,environment,purchases:[...verified.values()],gemProducts,purchaseStatuses:[...purchaseStatuses].map(([key,status])=>({key,status}))};
}

export function reconcileCommerce(previous,snapshot,ledger=[]){
  const old=previous||emptyCommerce(),records=new Map(ledger.map(r=>[r.key,{...r,active:false}]));
  if(old.revision>0&&old.environment!==snapshot.environment)throw billingError('billing/environment-conflict','No se pueden mezclar compras de prueba y de producción.',409);
  for(const record of snapshot.purchases){
    const previous=records.get(record.key);
    // A store transaction buys one immutable benefit, regardless of later catalog edits.
    if(previous&&(previous.lives!==record.lives||(previous.gems||0)!==(record.gems||0)||previous.productId!==record.productId||previous.unitGems!==record.unitGems||previous.quantity!==record.quantity))throw billingError('billing/invalid-ledger','Una transacción no puede cambiar de beneficio. Revisa el catálogo.',503);
    records.set(record.key,record);
  }
  const paidGranted=[...records.values()].reduce((n,r)=>n+(r.active?r.lives:0),0);
  const paidConsumed=old.paidConsumed;
  if(!Number.isSafeInteger(paidConsumed)||paidConsumed<0||!Number.isSafeInteger(paidGranted))throw billingError('billing/invalid-ledger','El registro de compras necesita revisión.',503);
  return {commerce:{...emptyCommerce(),revision:old.revision+1,premiumUntilMs:snapshot.premiumUntilMs,store:snapshot.store,environment:snapshot.environment,paidGranted,paidConsumed,paidLives:Math.max(0,paidGranted-paidConsumed)},ledger:[...records.values()]};
}

/** Purchased gems live separately from earned gems and from the legacy life wallet. */
export function reconcileGemCommerce(previous,snapshot,ledger=[]){
  const old=previous||emptyGemCommerce(),catalog=new Map(validateGemPacks(snapshot.gemProducts||[]).map(pack=>[pack.productId,pack.gems]));
  if(old.schemaVersion!==1||!['revision','granted','consumed','balance'].every(key=>nonnegativeInteger(old[key]))||old.balance!==Math.max(0,old.granted-old.consumed))throw billingError('billing/invalid-ledger','El saldo de gemas compradas necesita revisión.',503);
  if(old.revision>0&&old.environment!==snapshot.environment)throw billingError('billing/environment-conflict','No se pueden mezclar gemas de prueba y de producción.',409);
  let granted=0;
  for(const record of ledger){
    if(record.gems===undefined)continue; // Historical life receipts are unchanged.
    if(!nonnegativeInteger(record.gems)||record.gems===0||record.lives!==0||!Number.isSafeInteger(record.quantity)||record.quantity<1||record.quantity>100||!Number.isSafeInteger(record.unitGems)||record.unitGems<1||record.gems!==record.quantity*record.unitGems||typeof record.active!=='boolean')throw billingError('billing/invalid-ledger','El registro de gemas compradas necesita revisión.',503);
    // Keep retired SKUs in the server catalog. Removing a SKU is not a refund.
    if(catalog.get(record.productId)!==record.unitGems)throw billingError('billing/configuration','Conserva los identificadores y cantidades de los paquetes vendidos.',503);
    if(record.active)granted+=record.gems;
  }
  if(!nonnegativeInteger(granted)||!Number.isSafeInteger(old.revision+1))throw billingError('billing/invalid-ledger','El saldo de gemas compradas necesita revisión.',503);
  return {...emptyGemCommerce(),revision:old.revision+1,environment:snapshot.environment,granted,consumed:old.consumed,balance:Math.max(0,granted-old.consumed)};
}

export function verifyWebhook(raw,header,secret,now=Date.now()){
  if(!Buffer.isBuffer(raw)||raw.length>262144||typeof secret!=='string'||secret.length<24||typeof header!=='string')return false;
  const match=/^t=(\d{10,13}),v1=([a-f0-9]{64})$/.exec(header.replaceAll(' ',''));
  if(!match||Math.abs(now/1000-Number(match[1]))>300)return false;
  const expected=createHmac('sha256',secret).update(match[1]+'.').update(raw).digest();
  return timingSafeEqual(expected,Buffer.from(match[2],'hex'));
}
