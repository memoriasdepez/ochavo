import {billingError,emptyCommerce,fingerprint,safeUid,parseProviderSnapshot,reconcileCommerce,reconcileGemCommerce,validateGemPacks,validatePurchaseSelector,purchaseConfirmation,verifyWebhook} from './billing-domain.js';

// Longer than the deployed function's 60s limit and individual fetch's 15s timeout.
export const SYNC_LEASE_MS=120000,DELETE_CONFIRM_DELAY_MS=60000,MAX_SYNC_LEASES=32;
function syncState(value){
  const state=value||{},generation=state.generation??0,leases=state.leases??{};
  if(!Number.isSafeInteger(generation)||generation<0||!leases||typeof leases!=='object'||Array.isArray(leases)||Object.keys(leases).length>MAX_SYNC_LEASES||Object.entries(leases).some(([key,expires])=>!/^\d+$/.test(key)||!Number.isSafeInteger(expires)||expires<0))throw billingError('billing/invalid-ledger','La comprobación de compras necesita revisión.',503);
  return {...state,generation,leases:{...leases}};
}
const deletionEpoch=marker=>{
  const value=marker?.billingRecheckCounter??0;
  if(!Number.isSafeInteger(value)||value<0)throw billingError('billing/invalid-ledger','El registro de borrado necesita revisión.',503);
  return value;
};
export function shouldRunBillingCleanup(before,after){return Boolean(after)&&(!before||deletionEpoch(before)!==deletionEpoch(after));}

/** REST calls stay on the fixed RevenueCat origin; pagination never forwards secrets elsewhere. */
export function createRevenueCat({secret,publicKey,cleanupSecret,projectId,environment='production',gemPacks=[],fetchImpl=fetch,now=()=>Date.now()}){
  const gemProducts=validateGemPacks(gemPacks);
  async function get(path){
    const url=new URL(path,'https://api.revenuecat.com');
    if(url.origin!=='https://api.revenuecat.com'||url.username||url.password||url.hash||!url.pathname.startsWith('/v'))throw billingError('billing/provider-unavailable','Respuesta no válida del proveedor.',503);
    const legacy=url.pathname.startsWith('/v1/');
    let response;try{response=await fetchImpl(url,{headers:{Authorization:'Bearer '+(legacy?publicKey:secret),Accept:'application/json',...(legacy?{'X-Is-Sandbox':String(environment==='sandbox')}:{})},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw billingError('billing/provider-unavailable','No se pudo conectar con la tienda. Reinténtalo.',503);}
    if(!response.ok)throw billingError('billing/provider-unavailable','La tienda no ha confirmado las compras. Reinténtalo.',503);
    try{return await response.json();}catch{throw billingError('billing/provider-unavailable','La tienda devolvió una respuesta incompleta.',503);}
  }
  async function list(prefix,firstPage=null){
    let path=firstPage?firstPage.next_page:prefix+'?limit=100',items=firstPage?[...firstPage.items]:[];const seen=new Set();
    while(path){
      const url=new URL(path,'https://api.revenuecat.com');
      if(url.origin!=='https://api.revenuecat.com'||url.pathname!==prefix||seen.has(url.href))throw billingError('billing/provider-unavailable','No se pudo verificar todo el historial.',503);
      seen.add(url.href);const page=await get(path);
      if(!Array.isArray(page.items)||!(page.next_page===null||typeof page.next_page==='string'))throw billingError('billing/provider-unavailable','Historial de compras incompleto.',503);
      items.push(...page.items);path=page.next_page;
    }
    return items;
  }
  return {async deleteCustomer(uid){
    if(!cleanupSecret||!projectId||!safeUid(uid))throw billingError('billing/configuration','Falta configurar la supresión en el proveedor.',503);
    const url=`https://api.revenuecat.com/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(uid)}`;
    const request=async method=>{try{return await fetchImpl(url,{method,headers:{Authorization:'Bearer '+cleanupSecret,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw billingError('billing/provider-unavailable','La supresión en el proveedor se reintentará.',503);}};
    // DELETE is asynchronous. A later GET404, or DELETE404, confirms completion;
    // accepted200/202 must retry without removing the account deletion tombstone.
    const current=await request('GET');
    if(current.status===404)return true;
    if(!current.ok)throw billingError('billing/provider-unavailable','La supresión en el proveedor se reintentará.',503);
    let customer;try{customer=await current.json();}catch{throw billingError('billing/provider-unavailable','No se pudo comprobar la cuenta que se quiere eliminar.',503);}
    if(customer?.id!==uid||customer.project_id!==projectId)throw billingError('billing/identity-conflict','La cuenta del proveedor no coincide con la solicitud de borrado.',409);
    const response=await request('DELETE');
    if(response.status===404)return true;
    if(response.status===200||response.status===202)throw billingError('billing/deletion-pending','El proveedor está procesando la supresión. Se comprobará de nuevo.',503);
    throw billingError('billing/provider-unavailable','La supresión en el proveedor se reintentará.',503);
  },async snapshot(uid){
    const publicKeyPattern=environment==='sandbox'?/^rcb_sb_[A-Za-z0-9_.-]+$/:environment==='production'?/^rcb_(?!sb_)[A-Za-z0-9_.-]+$/:null;
    if(!secret||!publicKeyPattern?.test(publicKey)||!projectId||!safeUid(uid))throw billingError('billing/configuration','Las compras todavía no están activadas.',503);
    const customer=await get('/v1/subscribers/'+encodeURIComponent(uid));
    const projectPrefix=`/v2/projects/${encodeURIComponent(projectId)}`,prefix=`${projectPrefix}/customers/${encodeURIComponent(uid)}`;
    const purchases=await list(prefix+'/purchases'),subscriptions=await list(prefix+'/subscriptions');
    for(const subscription of subscriptions){
      if(typeof subscription.id!=='string'||!subscription.id||subscription.id.length>255||!Array.isArray(subscription.entitlements?.items)||!(subscription.entitlements.next_page===null||typeof subscription.entitlements.next_page==='string'))throw billingError('billing/provider-unavailable','Historial de suscripciones incompleto.',503);
      const items=await list(`${projectPrefix}/subscriptions/${encodeURIComponent(subscription.id)}/entitlements`,subscription.entitlements);
      subscription.entitlements={...subscription.entitlements,items,next_page:null};
    }
    const products={};
    for(const id of new Set([...purchases,...subscriptions].map(p=>p.product_id).filter(id=>id!==null))){
      if(typeof id!=='string'||!id||id.length>255)throw billingError('billing/provider-unavailable','Producto no válido.',503);
      products[id]=await get(`${projectPrefix}/products/${encodeURIComponent(id)}`);
    }
    return parseProviderSnapshot({uid,customer,purchases,subscriptions,products,environment,now:now(),gemPacks:gemProducts});
  }};
}

/** Admin Firestore adapter; no client values are accepted as purchase evidence. */
export function createBillingService({db,auth,provider,serverTimestamp,now=()=>Date.now()}){
  const ref=(uid,path)=>db.doc(`users/${uid}/${path}`),marker=uid=>db.doc(`accountDeletions/${uid}`);
  const assertUser=async uid=>{let user;try{user=await auth.getUser(uid);}catch{throw billingError('billing/unauthenticated','Vuelve a acceder a tu cuenta.',401);}if(user.disabled||!user.emailVerified)throw billingError('billing/verification-required','Verifica tu correo antes de comprar.',403);return user;};
  async function authenticate(header){
    const token=/^Bearer ([^ ]+)$/.exec(header||'')?.[1];let decoded;
    try{if(!token)throw Error();decoded=await auth.verifyIdToken(token,true);}catch{throw billingError('billing/unauthenticated','Vuelve a acceder a tu cuenta.',401);}
    if(!safeUid(decoded.uid)||decoded.email_verified!==true)throw billingError('billing/verification-required','Verifica tu correo antes de comprar.',403);
    await assertUser(decoded.uid);return decoded.uid;
  }
  async function syncBalances(uid,purchase){
    const selector=validatePurchaseSelector(purchase);
    await assertUser(uid);
    // Reserve both the snapshot generation and a durable barrier before get-or-create I/O.
    const generation=await db.runTransaction(async tx=>{
      if((await tx.get(marker(uid))).exists)throw billingError('account/deletion-pending','La cuenta está eliminada o en proceso de borrado.',409);
      const state=syncState((await tx.get(ref(uid,'commerceSync/main'))).data()),next=state.generation+1;
      const leases=Object.fromEntries(Object.entries(state.leases).filter(([,expires])=>expires>now()));
      if(!Number.isSafeInteger(next)||Object.keys(leases).length>=MAX_SYNC_LEASES)throw billingError('billing/sync-busy','Hay comprobaciones pendientes. Espera un momento y reinténtalo.',503);
      leases[String(next)]=now()+SYNC_LEASE_MS;
      tx.set(ref(uid,'commerceSync/main'),{...state,generation:next,leases,updatedAt:serverTimestamp()});return next;
    });
    let providerCompleted=false;
    try{
      const snapshot=await provider.snapshot(uid);providerCompleted=true;
      return await db.runTransaction(async tx=>{
      if((await tx.get(marker(uid))).exists)throw billingError('account/deletion-pending','La cuenta está eliminada o en proceso de borrado.',409);
      const control=await tx.get(ref(uid,'commerceSync/main')),wallet=await tx.get(ref(uid,'commerce/main')),gemWallet=await tx.get(ref(uid,'commerceGems/main'));
      if(control.data()?.generation!==generation)throw billingError('billing/sync-superseded','Hay otra comprobación en curso. Reintenta la sincronización.',503);
      const purchases=await tx.get(db.collection(`users/${uid}/commercePurchases`));
      const current=purchases.docs.map(d=>d.data());
      const known=new Map(current.map(p=>[p.key,p]));
      const reconciled=reconcileCommerce(wallet.data(),snapshot,current);
      const gems=reconcileGemCommerce(gemWallet.data(),snapshot,reconciled.ledger);
      const gemProducts=validateGemPacks(snapshot.gemProducts||[]),grantsByProduct=new Map(gemProducts.map(pack=>[pack.productId,0]));
      for(const purchase of reconciled.ledger)if(purchase.active&&purchase.gems&&grantsByProduct.has(purchase.productId))grantsByProduct.set(purchase.productId,grantsByProduct.get(purchase.productId)+purchase.gems);
      const gemGrants=[...grantsByProduct].map(([productId,granted])=>({productId,granted}));
      const claims=[];
      for(const purchase of snapshot.purchases){
        if(known.has(purchase.key))continue;
        const target=db.doc('billingTransactions/'+purchase.key),existing=await tx.get(target);
        if(existing.exists&&existing.data().ownerHash!==fingerprint(uid))throw billingError('billing/identity-conflict','Esta transacción ya está asociada a otra cuenta.',409);
        claims.push({target,purchase,exists:existing.exists});
      }
      for(const {target,exists} of claims)if(!exists)tx.set(target,{ownerHash:fingerprint(uid),createdAt:serverTimestamp()});
      for(const purchase of reconciled.ledger){
        const previous=known.get(purchase.key);
        if(!previous||previous.active!==purchase.active)tx.set(ref(uid,'commercePurchases/'+purchase.key),purchase);
      }
      tx.set(ref(uid,'commerce/main'),{...reconciled.commerce,updatedAt:serverTimestamp()});
      tx.set(ref(uid,'commerceGems/main'),{...gems,updatedAt:serverTimestamp()});
      return {commerce:reconciled.commerce,gems,gemProducts,gemGrants,...(selector?{purchaseConfirmation:purchaseConfirmation(snapshot,selector)}:{})};
      });
    }finally{
      await db.runTransaction(async tx=>{
        const deleted=await tx.get(marker(uid)),control=await tx.get(ref(uid,'commerceSync/main'));
        // Do not recreate commerceSync after completed cleanup. A late completion
        // schedules another cleanup through the marker, using no cleanup credential.
        if(control.exists&&(providerCompleted||deleted.exists)){
          const state=syncState(control.data());
          if(providerCompleted)delete state.leases[String(generation)];
          // A network error does not prove that RevenueCat stopped get-or-create.
          if(deleted.exists){delete state.remoteAbsentAtMs;delete state.remoteConfirmAfterMs;delete state.cleanupEpoch;}
          tx.set(control.ref,{...state,updatedAt:serverTimestamp()});
        }
        if(deleted.exists){
          const next=deletionEpoch(deleted.data())+1;
          if(!Number.isSafeInteger(next))throw billingError('billing/invalid-ledger','El registro de borrado necesita revisión.',503);
          tx.set(deleted.ref,{...deleted.data(),billingRecheckCounter:next,billingRecheckAt:serverTimestamp()});
        }
      });
    }
  }
  // Preserve the existing internal API used by hooks and native billing tests.
  async function sync(uid){return (await syncBalances(uid)).commerce;}
  async function webhook({raw,signature,secret}){
    if(!verifyWebhook(raw,signature,secret,now()))throw billingError('billing/invalid-signature','Firma no válida.',401);
    let body;try{body=JSON.parse(raw.toString('utf8'));}catch{throw billingError('billing/invalid-event','Evento no válido.');}
    const event=body?.event;if(!event||typeof event.id!=='string'||event.id.length>255)throw billingError('billing/invalid-event','Evento no válido.');
    if(event.type==='TEST')return {ignored:true};
    const ids=event.type==='TRANSFER'?[...(event.transferred_from||[]),...(event.transferred_to||[])]:[event.app_user_id];
    if(ids.length>20)throw billingError('billing/invalid-event','Demasiadas identidades.');
    for(const uid of new Set(ids.filter(safeUid))){
      const receipt=db.doc('billingWebhookEvents/'+fingerprint(event.id+':'+uid));
      if((await receipt.get()).exists)continue;
      try{await sync(uid);}catch(error){if(!['account/deletion-pending','billing/unauthenticated','billing/verification-required'].includes(error.code))throw error;}
      await receipt.set({processedAt:serverTimestamp()});
    }
    return {received:true};
  }
  async function cleanup(uid){
    const pending=()=>billingError('billing/deletion-pending','Hay comprobaciones de borrado pendientes. Se reintentará.',503);
    const checkBarrier=async tx=>{
      const deleted=await tx.get(marker(uid));
      if(!deleted.exists)throw billingError('account/deletion-marker-required','Falta el marcador de borrado.',409);
      const state=syncState((await tx.get(ref(uid,'commerceSync/main'))).data()),epoch=deletionEpoch(deleted.data());
      if(Object.values(state.leases).some(expires=>expires>now()))throw pending();
      return {state,epoch};
    };
    const barrier=await db.runTransaction(checkBarrier);
    if(barrier.state.cleanupEpoch===barrier.epoch&&barrier.state.remoteConfirmAfterMs>now())throw pending();
    if(typeof provider?.deleteCustomer!=='function')throw billingError('billing/configuration','Falta configurar la supresión en el proveedor.',503);
    for(const name of ['commercePurchases'])await db.recursiveDelete(db.collection(`users/${uid}/${name}`));
    const batch=db.batch();batch.delete(ref(uid,'commerce/main'));batch.delete(ref(uid,'commerceGems/main'));await batch.commit();
    try{await provider.deleteCustomer(uid);}catch(error){
      // A reappearing customer or failed check breaks the pair of404 observations.
      await db.runTransaction(async tx=>{
        const control=await tx.get(ref(uid,'commerceSync/main'));
        if(!control.exists)return;
        const state=syncState(control.data());
        delete state.remoteAbsentAtMs;delete state.remoteConfirmAfterMs;delete state.cleanupEpoch;
        tx.set(control.ref,{...state,updatedAt:serverTimestamp()});
      });
      throw error;
    }
    // Even404 is provisional: require a later404 beyond the settling interval.
    // Expiring a crashed process's lease never counts as provider deletion.
    const complete=await db.runTransaction(async tx=>{
      const {state,epoch}=await checkBarrier(tx);
      if(epoch!==barrier.epoch)throw pending();
      if(state.cleanupEpoch===epoch&&Number.isSafeInteger(state.remoteAbsentAtMs)&&Number.isSafeInteger(state.remoteConfirmAfterMs)&&state.remoteConfirmAfterMs<=now()){
        tx.delete(ref(uid,'commerceSync/main'));return true;
      }
      tx.set(ref(uid,'commerceSync/main'),{...state,leases:{},cleanupEpoch:epoch,remoteAbsentAtMs:now(),remoteConfirmAfterMs:now()+DELETE_CONFIRM_DELAY_MS,updatedAt:serverTimestamp()});return false;
    });
    if(!complete)throw pending();
  }
  return {authenticate,sync,syncBalances,webhook,cleanup};
}
