import test from 'node:test';
import assert from 'node:assert/strict';
import {createPurchasesController} from '../src/purchases.js';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const account=uid=>({uid,emailVerified:true,getIdToken:async()=>`fixture-${uid}`});
const plus={identifier:'viruta_plus_monthly',priceString:'11,99 €',price:11.99,currencyCode:'EUR',productCategory:'SUBSCRIPTION',productType:'AUTO_RENEWABLE_SUBSCRIPTION',subscriptionPeriod:'P1M'};
const pack={identifier:'viruta_lives_5',priceString:'1,49 €',price:1.49,currencyCode:'EUR',productCategory:'NON_SUBSCRIPTION',productType:'CONSUMABLE',subscriptionPeriod:null};
const server=()=>({commerce:{premiumUntilMs:0,store:null,environment:null,paidGranted:0,paidConsumed:0,paidLives:0},serverTimeMs:1});
const memoryStorage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

function fixture(options={}) {
  let active=account('A'),sdkUid=null,listener=null;
  const calls=[],views=[],errors=[],synced=[],opened=[];
  const f={calls,views,errors,synced,opened,online:true,response:server(),serverError:null,fetchHook:null,products:[plus,pack],purchaseHook:null,restoreHook:null,confirmedTransactions:new Set(),refundedTransactions:new Set(),lastTransaction:null,info:{entitlements:{active:{viruta_plus:{isActive:true}}},managementURL:null},setUser(user){active=user;},emit(info){listener?.(info);},confirmPurchase(id=f.lastTransaction?.transactionIdentifier){f.confirmedTransactions.add(id);}};
  let purchaseSequence=0;
  f.sdk={
    async setLogLevel(value){calls.push(['log',value]);},
    async configure(value){calls.push(['configure',value]);sdkUid=value.appUserID;},
    async logIn(value){calls.push(['login',value]);sdkUid=value.appUserID;return {customerInfo:f.info};},
    async getAppUserID(){return {appUserID:sdkUid};},
    async addCustomerInfoUpdateListener(value){listener=value;return 'listener';},
    async removeCustomerInfoUpdateListener(value){calls.push(['removeListener',value]);listener=null;return {wasRemoved:true};},
    async getProducts(value){calls.push(['products',value]);return {products:f.products.filter(product=>value.type===product.productCategory)};},
    async getCustomerInfo(){calls.push(['customerInfo']);return {customerInfo:f.info};},
    async purchaseStoreProduct(value){calls.push(['purchase',value,sdkUid]);const before=f.response.commerce.paidGranted,priorGem=f.response.gemGrants?.find(item=>item.productId===value.product.identifier)?.granted||0;f.lastTransaction={transactionIdentifier:'fixture-order-'+(++purchaseSequence),productIdentifier:value.product.identifier};if(f.purchaseHook)await f.purchaseHook();if(f.response.commerce.paidGranted>before||(f.response.gemGrants?.find(item=>item.productId===value.product.identifier)?.granted||0)>priorGem)f.confirmPurchase();return {customerInfo:f.info,productIdentifier:value.product.identifier,transaction:f.lastTransaction};},
    async restorePurchases(){calls.push(['restore',sdkUid]);if(f.restoreHook)await f.restoreHook();return {customerInfo:f.info};}
  };
  f.controller=createPurchasesController({storage:memoryStorage(),platform:{isNativePlatform:()=>true,getPlatform:()=>options.store||'android'},env:{VITE_REVENUECAT_ANDROID_KEY:'goog_fixtureAndroid',VITE_REVENUECAT_IOS_KEY:'appl_fixtureIos',VITE_BILLING_API_URL:'https://billing.example.invalid/billing'},getUser:()=>active,loadSDK:async()=>{calls.push(['load']);return f.sdk;},isOnline:()=>f.online,
    fetch:async(url,request)=>{calls.push(['fetch',url,request]);if(f.fetchHook)await f.fetchHook();return {ok:!f.serverError,json:async()=>{if(f.serverError)return {error:{code:f.serverError}};const response=structuredClone(f.response),selector=JSON.parse(request.body).purchase;if(selector&&!response.purchaseConfirmation){const refunded=f.refundedTransactions.has(selector.transactionId),confirmed=f.confirmedTransactions.has(selector.transactionId)&&!refunded;response.purchaseConfirmation={...selector,confirmed,status:refunded?'refunded':confirmed?'confirmed':'pending'};}return response;}};},
    onChange:view=>views.push(view),onError:error=>errors.push(error),onSynced:async value=>synced.push(value),openURL:async url=>opened.push(url),...options});
  f.select=async(user=active)=>{active=user;return f.controller.select(user);};
  return f;
}

test('web and missing configuration never load the SDK or launch fake checkout',async()=>{
  for(const overrides of [{platform:{isNativePlatform:()=>false,getPlatform:()=>'web'}},{env:{}},{env:{VITE_REVENUECAT_ANDROID_KEY:'test_fixture',VITE_BILLING_API_URL:'https://billing.example.invalid'}}]) {
    const f=fixture(overrides);await f.select();
    await f.controller.subscribe();await f.controller.purchaseLives();await f.controller.restore();await f.controller.refresh();
    assert.equal(f.calls.length,0);assert.equal(f.controller.getView().canPurchase,false);
    assert.equal(f.controller.getView().subscriptionPrice,null);assert.equal(f.synced.length,0);
  }
});

test('guest, unverified and anonymous users cannot initialize RevenueCat or buy',async()=>{
  const f=fixture();
  for(const user of [null,{...account('A'),emailVerified:false},{...account('A'),isAnonymous:true}]) {
    await f.select(user);await f.controller.subscribe();await f.controller.restore();
    assert.equal(f.controller.getView().canPurchase,false);
  }
  assert.equal(f.calls.length,0);
});

for(const store of ['android','ios'])test(`${store} configures verified UID, displays store prices and ignores local entitlement hints`,async()=>{
  const f=fixture({store});const view=await f.select();
  const configuration=f.calls.find(c=>c[0]==='configure')[1];
  assert.equal(configuration.appUserID,'A');assert.equal(configuration.apiKey,store==='android'?'goog_fixtureAndroid':'appl_fixtureIos');
  assert.equal(view.subscriptionPrice,'11,99 €');assert.equal(view.livesPrice,'1,49 €');assert.equal(view.canPurchase,true);
  assert.equal('premium' in view,false);assert.equal('paidLives' in view,false);
  assert.equal(f.synced[0].commerce.premiumUntilMs,0);
  const request=f.calls.find(c=>c[0]==='fetch')[2];
  assert.deepEqual(JSON.parse(request.body),{action:'sync'});assert.equal(request.headers.Authorization,'Bearer fixture-A');
  assert.equal(request.credentials,'omit');assert.equal(request.redirect,'error');
});

test('each product uses its exact displayed store object; backend confirmation controls balances',async()=>{
  const f=fixture();await f.select();
  f.purchaseHook=async()=>{f.response.commerce={...f.response.commerce,paidGranted:5,paidLives:5};};
  await f.controller.purchaseLives();
  assert.equal(f.calls.find(c=>c[0]==='purchase')[1].product,pack);
  assert.equal(f.synced.at(-1).commerce.paidLives,5);
  assert.equal(f.controller.getView().status,'ready');
  await f.controller.subscribe();
  assert.equal(f.calls.filter(c=>c[0]==='purchase')[1][1].product,plus);
  assert.equal(f.controller.getView().paidLives,undefined);
});

test('a deleted account fails server preflight before opening the store',async()=>{
  const f=fixture();await f.select();f.serverError='account/deletion-pending';
  await f.controller.purchaseLives();
  assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  assert.equal(f.controller.getView().status,'deletion-pending');
  assert.equal(f.controller.getView().canPurchase,false);
});

test('revoked or unverified Auth rejected by server cannot reach the payment sheet',async()=>{
  for(const code of ['billing/unauthenticated','billing/verification-required']) {
    const f=fixture();await f.select();f.serverError=code;await f.controller.subscribe();
    assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.controller.getView().status,'unverified');assert.equal(f.controller.getView().canPurchase,false);
  }
});

test('receipt identity conflict after restoration preserves the helpful account message',async()=>{
  const f=fixture();await f.select();f.restoreHook=async()=>{f.serverError='billing/identity-conflict';};
  const count=f.synced.length;await f.controller.restore();
  assert.equal(f.synced.length,count+1);assert.equal(f.controller.getView().status,'error');assert.match(f.controller.getView().message,/otra cuenta/);
});

test('purchase cancellation is a normal result with no post-purchase grant or error alert',async()=>{
  const f=fixture();await f.select();f.purchaseHook=async()=>{throw {code:'1'};};
  const count=f.synced.length;const view=await f.controller.subscribe();
  assert.equal(view.status,'cancelled');assert.equal(view.busy,false);assert.equal(view.canSubscribe,true);
  assert.equal(f.synced.length,count+1); // Read-only server preflight, not a purchase grant.
  assert.equal(f.synced.at(-1).commerce.premiumUntilMs,0);assert.equal(f.errors.length,0);
});

test('pending store payment grants nothing and blocks another payment until checked',async()=>{
  const f=fixture();await f.select();f.purchaseHook=async()=>{throw {code:'20'};};
  const view=await f.controller.purchaseLives();
  assert.equal(view.status,'pending');assert.equal(view.canPurchase,false);assert.match(view.message,/pendiente/);
  await f.controller.purchaseLives();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  assert.equal(f.synced.at(-1).commerce.paidLives,0);assert.equal(f.errors.length,0);
});

test('a lost backend response after store purchase is retried without a second payment',async()=>{
  const f=fixture();await f.select();
  f.purchaseHook=async()=>{f.fetchHook=async()=>{throw Error('lost response');};};
  await f.controller.purchaseLives();
  assert.equal(f.controller.getView().status,'pending');assert.match(f.controller.getView().message,/No repitas el pago/);
  assert.equal(f.synced.at(-1).commerce.paidLives,0);
  f.fetchHook=null;f.response.commerce={...f.response.commerce,paidGranted:5,paidLives:5};
  await f.controller.refresh();
  assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);assert.equal(f.synced.at(-1).commerce.paidLives,5);
});

test('restoration calls the store and server, without replacing spent consumable lives',async()=>{
  const f=fixture();await f.select();
  f.response.commerce={...f.response.commerce,paidGranted:10,paidConsumed:8,paidLives:2};
  const view=await f.controller.restore();
  assert.equal(f.calls.filter(c=>c[0]==='restore').length,1);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  assert.equal(f.synced.at(-1).commerce.paidLives,2);assert.match(view.message,/ya gastadas/);
});

test('account switch during payment serializes SDK identity and discards the previous result',async()=>{
  const f=fixture();await f.select();const gate=deferred();f.purchaseHook=()=>gate.promise;
  const payment=f.controller.purchaseLives();await tick();
  assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  const newSelection=f.select(account('B'));await tick();
  assert.equal(f.calls.filter(c=>c[0]==='login').length,0);
  const syncedBefore=f.synced.length;gate.resolve();await payment;await newSelection;
  assert.deepEqual(f.calls.filter(c=>c[0]==='login').map(c=>c[1]),[{appUserID:'B'}]);
  assert.equal(f.synced.length,syncedBefore+1);assert.equal(f.synced.at(-1).uid,'B');
  assert.equal(f.calls.find(c=>c[0]==='purchase')[2],'A');assert.equal(f.controller.getView().canPurchase,true);
});

test('account changes during Firebase-token retrieval prevent sending that token',async()=>{
  const f=fixture();await f.select();const gate=deferred();
  const user={...account('A'),getIdToken:()=>gate.promise};f.setUser(user);
  const before=f.calls.filter(c=>c[0]==='fetch').length;
  const refresh=f.controller.refresh();await tick();f.setUser(account('B'));gate.resolve('fixture-stale-A');await refresh;
  assert.equal(f.calls.filter(c=>c[0]==='fetch').length,before);assert.equal(f.controller.getView().canPurchase,false);
});

test('signout clears prices immediately, creates no anonymous RevenueCat customer and ignores hints',async()=>{
  const f=fixture();await f.select();const count=f.calls.length;await f.select(null);
  f.emit({entitlements:{active:{viruta_plus:{}}}});await tick();
  assert.equal(f.calls.length,count);assert.equal(f.controller.getView().subscriptionPrice,null);
  await f.select(account('B'));assert.equal(f.calls.filter(c=>c[0]==='configure').length,1);
  assert.deepEqual(f.calls.filter(c=>c[0]==='login').map(c=>c[1].appUserID),['B']);
});

test('customer-info listener requests server sync only and never trusts its entitlements',async()=>{
  const f=fixture();await f.select();const syncedBefore=f.synced.length,infoBefore=f.calls.filter(c=>c[0]==='customerInfo').length;
  f.emit({entitlements:{active:{viruta_plus:{expirationDate:'2099-01-01'}}}});await tick();
  assert.equal(f.synced.length,syncedBefore+1);assert.equal(f.synced.at(-1).commerce.premiumUntilMs,0);
  assert.equal(f.calls.filter(c=>c[0]==='customerInfo').length,infoBefore);
});

test('duplicate button taps do not enqueue additional purchases',async()=>{
  const f=fixture();await f.select();const gate=deferred();f.purchaseHook=()=>gate.promise;
  const first=f.controller.subscribe();await tick();await f.controller.subscribe();await f.controller.purchaseLives();
  assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);gate.resolve();await first;
});

test('missing products have no substitute price and cannot be bought',async()=>{
  const f=fixture();f.products=[];await f.select();
  assert.equal(f.controller.getView().subscriptionPrice,null);assert.equal(f.controller.getView().livesPrice,null);
  await f.controller.subscribe();await f.controller.purchaseLives();
  assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
});

test('offline never launches billing and a malformed server response cannot confirm benefits',async()=>{
  const f=fixture();f.online=false;await f.select();await f.controller.subscribe();assert.equal(f.calls.length,0);
  f.online=true;f.response.commerce.paidLives=500;await f.controller.refresh();
  assert.equal(f.synced.length,0);assert.equal(f.controller.getView().status,'error');assert.equal(f.controller.getView().canPurchase,false);
});

test('manage opens the official store page; disposal removes the listener and prevents work',async()=>{
  const f=fixture({store:'ios'});f.info.managementURL='https://untrusted.example.invalid';await f.select();await f.controller.manage();
  assert.deepEqual(f.opened,['https://apps.apple.com/account/subscriptions']);
  await f.controller.dispose();const count=f.calls.length;f.emit({});await f.controller.refresh();await tick();
  assert.equal(f.calls.length,count);assert.equal(f.calls.filter(c=>c[0]==='removeListener').length,1);
});

test('native can manage a confirmed web subscription without redirecting to a different store',async()=>{
  const f=fixture({store:'ios'});f.response.commerce.store='rc_billing';await f.select();
  assert.equal(f.controller.getView().canManage,false);await f.controller.manage();assert.equal(f.opened.length,0);
  f.info.managementURL='https://api.revenuecat.com/rcbilling/v1/customerportal/txRcb123/portal';await f.controller.refresh();await f.controller.manage();
  assert.deepEqual(f.opened,[f.info.managementURL]);assert.equal(f.controller.getView().native,true);assert.equal(f.controller.getView().web,false);
});

test('explicit wrong billing environment is rejected on native before receiving benefits',async()=>{
  const f=fixture();f.response.billingEnvironment='sandbox';await f.select();await f.controller.subscribe();
  assert.equal(f.synced.length,0);assert.equal(f.controller.getView().canPurchase,false);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
});

test('native preflight avoids another subscription and management follows the confirmed store',async()=>{
  for(const [store,target] of [['app_store','https://apps.apple.com/account/subscriptions'],['play_store','https://play.google.com/store/account/subscriptions'],['rc_billing',null]]){
    const f=fixture();await f.select();f.response.commerce={...f.response.commerce,store,premiumUntilMs:100};await f.controller.subscribe();
    assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.match(f.controller.getView().message,/Ya tienes una suscripción activa/);await f.controller.manage();assert.deepEqual(f.opened,target?[target]:[]);
  }
});

test('native purchase receipt latency keeps successful but unchanged server responses pending',async()=>{
  const f=fixture();await f.select();await f.controller.purchaseLives();await f.controller.refresh();await f.controller.purchaseLives();
  assert.equal(f.controller.getView().status,'pending');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  f.response.commerce={...f.response.commerce,paidGranted:5,paidLives:5};f.confirmPurchase();await f.controller.refresh();assert.equal(f.controller.getView().status,'ready');
});

const gemCatalogue=[{productId:'ochavo_gems_200',gems:200},{productId:'ochavo_gems_600',gems:600},{productId:'ochavo_gems_1500',gems:1500}];
const gemPack=(productId,type='CONSUMABLE')=>({...pack,identifier:productId,productType:type,priceString:productId==='ochavo_gems_200'?'1,99 €':productId==='ochavo_gems_600'?'4,99 €':'9,99 €'});
const gemServer=()=>({...server(),billingEnvironment:'production',gems:{schemaVersion:1,revision:3,environment:'production',granted:600,consumed:100,balance:500},gemProducts:gemCatalogue.map(item=>({...item})),gemGrants:gemCatalogue.map(item=>({productId:item.productId,granted:item.gems===600?600:0}))});
const addGems=(f,gems,productId=gemCatalogue.find(item=>item.gems===gems).productId)=>{const wallet=f.response.gems;f.response.gems={...wallet,revision:wallet.revision+1,granted:wallet.granted+gems,balance:Math.max(0,wallet.granted+gems-wallet.consumed)};f.response.gemGrants=f.response.gemGrants.map(item=>item.productId===productId?{...item,granted:item.granted+gems}:item);};

for(const store of ['android','ios'])test(`${store} exposes only server-approved gem products with exact SDK prices and validated wallet`,async()=>{
  const f=fixture({store});f.response=gemServer();const chosen=gemPack('ochavo_gems_600',store==='android'?'UNKNOWN':'CONSUMABLE');
  f.products.push(gemPack('ochavo_gems_200'),chosen,gemPack('ochavo_gems_1500'));
  f.response.gemProducts=f.response.gemProducts.filter(item=>item.productId==='ochavo_gems_600');
  const view=await f.select();
  assert.equal(view.canPurchaseGems,true);assert.deepEqual(view.gemProducts,[{productId:'ochavo_gems_600',gems:600,price:'4,99 €',currencyCode:'EUR',canPurchase:true}]);
  assert.deepEqual(view.trustedGems,f.response.gems);view.trustedGems.balance=999999;assert.equal(f.controller.getView().trustedGems.balance,500);assert.deepEqual(view.trustedGemGrants,f.response.gemGrants);view.trustedGemGrants[0].granted=999999;assert.equal(f.controller.getView().trustedGemGrants[0].granted,0);
  const query=f.calls.find(c=>c[0]==='products'&&c[1].type==='NON_SUBSCRIPTION')[1];assert.deepEqual(query.productIdentifiers,['viruta_lives_5','ochavo_gems_600']);
  f.purchaseHook=async()=>addGems(f,600);await f.controller.purchaseGems('ochavo_gems_600');
  assert.equal(f.calls.find(c=>c[0]==='purchase')[1].product,chosen);assert.equal(f.controller.getView().trustedGems.balance,1100);assert.equal(f.controller.getView().status,'ready');
  await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
});

test('legacy backend, absent wallet and absent catalogue never enable gem checkout',async()=>{
  for(const variant of ['legacy','wallet-only','catalogue-only','no-grant-counters']){
    const f=fixture();f.products.push(gemPack('ochavo_gems_200'));
    if(variant!=='legacy'){f.response=gemServer();if(variant==='wallet-only')delete f.response.gemProducts;else if(variant==='no-grant-counters')delete f.response.gemGrants;else {delete f.response.gems;delete f.response.gemGrants;}}
    await f.select();await f.controller.purchaseGems('ochavo_gems_200');
    assert.equal(f.controller.getView().canPurchaseGems,false);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.controller.getView().canPurchaseLives,true);
  }
});

test('gem preflight rechecks catalogue, account and environment before opening payment',async()=>{
  for(const change of [f=>f.response.gemProducts=[],f=>f.serverError='account/deletion-pending',f=>f.response.gems.environment='sandbox',f=>f.response.gemProducts[0].gems=1500]){
    const f=fixture();f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();change(f);const count=f.synced.length;
    await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.controller.getView().canPurchaseGems,false);
    if(f.response.gemProducts.length)assert.equal(f.synced.length,count);
  }
});

test('gem pending marker is saved before checkout and survives reload without a second charge',async()=>{
  const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();
  f.purchaseHook=async()=>{assert.equal(storage.values.size,1);f.fetchHook=async()=>{throw Error('lost confirmation');};};
  await f.controller.purchaseGems('ochavo_gems_200');await f.controller.purchaseLives();await f.controller.purchaseGems('ochavo_gems_200');
  assert.equal(f.controller.getView().status,'pending');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  const raw=[...storage.values.values()][0],saved=JSON.parse(raw),{startedAtMs,operationId,...marker}=saved;assert.deepEqual(marker,{schemaVersion:2,kind:'gems',productId:'ochavo_gems_200',store:'play_store',phase:'received',transactionId:'fixture-order-1'});assert.ok(Number.isSafeInteger(startedAtMs));assert.match(operationId,/^[\da-f-]{36}$/);assert.doesNotMatch(raw,/token|receipt|fixture-A/);
  await f.controller.dispose();const reload=fixture({storage});reload.response=gemServer();reload.products.push(gemPack('ochavo_gems_200'));await reload.select();
  await reload.controller.purchaseGems('ochavo_gems_200');await reload.controller.restore();assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(reload.controller.getView().status,'pending');
  reload.response.gems.revision=4;await reload.controller.refresh();assert.equal(reload.controller.getView().status,'pending');
  addGems(reload,200);reload.confirmPurchase(saved.transactionId);await reload.controller.refresh();assert.equal(reload.controller.getView().status,'ready');assert.equal(storage.values.size,0);assert.equal(reload.controller.getView().trustedGems.balance,700);
});

test('gem cancellation clears its pre-checkout marker and grants no gems',async()=>{
  const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();
  f.purchaseHook=async()=>{assert.equal(storage.values.size,1);throw {userCancelled:true};};
  await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'cancelled');assert.equal(storage.values.size,0);assert.equal(f.controller.getView().trustedGems.balance,500);assert.equal(f.errors.length,0);
});

test('gem waits and balances are isolated when switching accounts during checkout',async()=>{
  const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();const gate=deferred();f.purchaseHook=()=>gate.promise;
  const buying=f.controller.purchaseGems('ochavo_gems_200');await tick();await f.controller.purchaseGems('ochavo_gems_600');await f.controller.purchaseLives();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  const next=f.select(account('B'));assert.equal(f.controller.getView().trustedGems,null);gate.resolve();await buying;await next;
  assert.equal(f.synced.at(-1).uid,'B');assert.equal(f.controller.getView().canPurchaseGems,true);assert.match([...storage.values.keys()][0],/:A$/);
  await f.select(account('A'));assert.equal(f.controller.getView().status,'pending');assert.equal(f.controller.getView().canPurchaseGems,false);
  f.setUser(account('B'));assert.equal(f.controller.getView().trustedGems,null);assert.deepEqual(f.controller.getView().gemProducts,[]);
});

test('stale or contradictory gem revisions never reach the balance consumer',async()=>{
  for(const changes of [{revision:2},{revision:3,granted:800,balance:700}]){
    const f=fixture();f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();const count=f.synced.length;Object.assign(f.response.gems,changes);
    await f.controller.refresh();assert.equal(f.synced.length,count);assert.equal(f.controller.getView().status,'error');assert.equal(f.controller.getView().trustedGems.balance,500);assert.equal(f.controller.getView().canPurchaseGems,false);
  }
});

test('restoring spent gem packs uses the server wallet and never restocks spent currency',async()=>{
  const f=fixture();f.response=gemServer();f.response.gems={...f.response.gems,granted:600,consumed:550,balance:50};f.products.push(gemPack('ochavo_gems_600'));await f.select();
  f.info.nonSubscriptionTransactions=[{productIdentifier:'ochavo_gems_600',transactionIdentifier:'sdk-hint'}];await f.controller.restore();
  assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.controller.getView().trustedGems.balance,50);assert.match(f.controller.getView().message,/gemas ya gastadas no se reponen/);
});

test('a grant from a different gem SKU cannot release another pending checkout',async()=>{
  const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'),gemPack('ochavo_gems_600'));await f.select();await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'pending');
  addGems(f,600);await f.controller.refresh();assert.equal(f.controller.getView().trustedGems.granted,1200);assert.equal(f.controller.getView().status,'pending');assert.equal(storage.values.size,1);await f.controller.purchaseGems('ochavo_gems_600');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  addGems(f,200);f.confirmPurchase();await f.controller.refresh();assert.equal(f.controller.getView().status,'ready');assert.equal(storage.values.size,0);assert.equal(f.controller.getView().trustedGemGrants.find(item=>item.productId==='ochavo_gems_200').granted,200);
});

test('same revision cannot silently move a gem grant from one SKU to another',async()=>{
  const f=fixture();f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();const count=f.synced.length;
  f.response.gemGrants=[{productId:'ochavo_gems_200',granted:600}];await f.controller.refresh();assert.equal(f.synced.length,count);assert.equal(f.controller.getView().status,'error');assert.equal(f.controller.getView().trustedGemGrants.find(item=>item.productId==='ochavo_gems_600').granted,600);
});

test('every checkout needs durable storage: missing, denied, failed writes and false readback stop the SDK before charging',async()=>{
  const broken=[()=>null,()=>({...memoryStorage(),getItem(){throw Error('denied');}}),()=>({...memoryStorage(),setItem(){throw Error('quota');}}),()=>({...memoryStorage(),setItem(){}}),()=>{const backing=memoryStorage();let written=false;return {...backing,setItem(key,value){backing.setItem(key,value);written=true;},getItem(key){if(written)throw Error('readback denied');return backing.getItem(key);}};}];
  for(const kind of ['subscription','lives','gems'])for(const makeStorage of broken){
    const storage=makeStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();const buy=controller=>kind==='subscription'?controller.subscribe():kind==='lives'?controller.purchaseLives():controller.purchaseGems('ochavo_gems_200');await buy(f.controller);
    assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0,kind);assert.equal(f.controller.getView().canPurchase,false);assert.equal(f.controller.getView().status,'pending');
    await f.controller.dispose();const reload=fixture({storage});reload.response=gemServer();reload.products.push(gemPack('ochavo_gems_200'));await reload.select();await buy(reload.controller);assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0,kind+' after reload');
  }
});

test('every pre-checkout guard is already durably readable while the payment sheet is running',async()=>{
  for(const kind of ['subscription','lives','gems']){
    const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();f.purchaseHook=async()=>{const marker=JSON.parse([...storage.values.values()][0]);assert.equal(marker.kind,kind);assert.equal(marker.phase,'started');assert.equal(marker.schemaVersion,2);assert.equal(marker.store,'play_store');throw {userCancelled:true};};
    await (kind==='subscription'?f.controller.subscribe():kind==='lives'?f.controller.purchaseLives():f.controller.purchaseGems('ochavo_gems_200'));assert.equal(f.controller.getView().status,'cancelled');assert.equal(storage.values.size,0);
  }
});

test('failure to persist the returned receipt leaves the started guard intact after reload and prevents a second charge',async()=>{
  const backing=memoryStorage();let writes=0;const storage={...backing,setItem(key,value){if(++writes>1)throw Error('quota');backing.setItem(key,value);}};
  const f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();f.purchaseHook=async()=>addGems(f,200);await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);assert.equal(f.controller.getView().status,'pending');assert.equal(JSON.parse([...backing.values.values()][0]).phase,'started');
  const reload=fixture({storage});reload.response=structuredClone(f.response);reload.products.push(gemPack('ochavo_gems_200'));await reload.select();await reload.controller.purchaseGems('ochavo_gems_200');assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(reload.controller.getView().trustedGems.balance,700);assert.match(reload.controller.getView().message,/comprobante.*Ayuda/);
});

test('failed durable removal preserves the confirmed receipt guard instead of allowing another bill',async()=>{
  const backing=memoryStorage(),storage={...backing,removeItem(){}};const f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();f.purchaseHook=async()=>addGems(f,200);await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'pending');assert.equal(backing.values.size,1);await f.controller.purchaseLives();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  const reload=fixture({storage});reload.response=structuredClone(f.response);reload.products.push(gemPack('ochavo_gems_200'));reload.confirmPurchase('fixture-order-1');await reload.select();await reload.controller.purchaseGems('ochavo_gems_200');assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(reload.controller.getView().status,'pending');
});

test('exact receipt confirms a gem purchase despite an older same-SKU refund leaving the net balance unchanged',async()=>{
  const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_600'));await f.select();f.purchaseHook=async()=>{f.response.gems.revision++;f.confirmPurchase();};
  await f.controller.purchaseGems('ochavo_gems_600');assert.equal(f.controller.getView().status,'ready');assert.equal(f.controller.getView().trustedGems.balance,500);assert.equal(storage.values.size,0);
  const selector=f.calls.filter(c=>c[0]==='fetch').map(c=>JSON.parse(c[2].body)).find(body=>body.purchase)?.purchase;assert.deepEqual(selector,{productId:'ochavo_gems_600',transactionId:'fixture-order-1',store:'play_store'});
});

test('another transaction for the same SKU never confirms this checkout from counters alone',async()=>{
  const f=fixture();f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();await f.controller.purchaseGems('ochavo_gems_200');addGems(f,200);await f.controller.refresh();assert.equal(f.controller.getView().trustedGems.balance,700);assert.equal(f.controller.getView().status,'pending');await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  f.confirmPurchase();await f.controller.refresh();assert.equal(f.controller.getView().status,'ready');
});

test('missing or mismatched SDK receipt cannot release the started guard even if the server wallet grows',async()=>{
  for(const receipt of [null,{transactionIdentifier:'fixture-order-1',productIdentifier:'ochavo_gems_600'}]){
    const f=fixture();f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();const purchase=f.sdk.purchaseStoreProduct;f.sdk.purchaseStoreProduct=async value=>({...await purchase(value),transaction:receipt});f.purchaseHook=async()=>addGems(f,200);
    await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'pending');assert.match(f.controller.getView().message,/comprobante/);await f.controller.refresh();assert.equal(f.controller.getView().status,'pending');assert.equal(f.controller.getView().trustedGems.balance,700);assert.match(f.controller.getView().message,/Ayuda/);await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  }
});

test('wrong server receipt cannot confirm checkout; an exact explicit refund clears it without celebrating a purchase',async()=>{
  const storage=memoryStorage(),f=fixture({storage});f.response=gemServer();f.products.push(gemPack('ochavo_gems_200'));await f.select();await f.controller.purchaseGems('ochavo_gems_200');const count=f.synced.length;
  f.response.purchaseConfirmation={productId:'ochavo_gems_200',transactionId:'another-order',store:'play_store',confirmed:true,status:'confirmed'};await f.controller.refresh();assert.equal(f.synced.length,count);assert.equal(storage.values.size,1);assert.equal(f.controller.getView().canPurchase,false);
  delete f.response.purchaseConfirmation;f.refundedTransactions.add('fixture-order-1');await f.controller.refresh();assert.equal(f.controller.getView().status,'ready');assert.equal(storage.values.size,0);assert.match(f.controller.getView().message,/devolución/);assert.doesNotMatch(f.controller.getView().message,/Compra comprobada/);
});

test('Android and iOS can explicitly close only a started consumable after an explicit environment handshake',async()=>{
  for(const store of ['android','ios'])for(const environment of ['production',undefined]){
    const storage=memoryStorage(),key='ochavo:billing-pending:v1:unconfigured:production:A',marker={schemaVersion:2,kind:'lives',productId:'viruta_lives_5',store:store==='android'?'play_store':'app_store',phase:'started',startedAtMs:1,operationId:'interrupted-native'};
    storage.setItem(key,JSON.stringify(marker));const f=fixture({storage,store});f.response.billingEnvironment=environment;await f.select();
    assert.equal(f.controller.getView().interruptedPurchase.operationId,marker.operationId);const before=structuredClone(f.response);
    await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});
    assert.equal(storage.getItem(key)===null,environment==='production');assert.equal(f.controller.getView().canPurchase,environment==='production');assert.deepEqual(f.response,before);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  }
});
