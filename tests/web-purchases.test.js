import test from 'node:test';
import assert from 'node:assert/strict';
import {createWebPurchasesSDK} from '../src/web-purchases.js';
import {createPurchasesController} from '../src/purchases.js';

const account=uid=>({uid,emailVerified:true,getIdToken:async()=>`fixture-${uid}`});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const product=(kind)=>({identifier:kind==='subscription'?'viruta_plus_monthly':'viruta_lives_5',productType:kind,period:kind==='subscription'?{number:1,unit:'month'}:null,price:{formattedPrice:kind==='subscription'?'9,99 €':'1,49 €',currency:'EUR',amountMicros:kind==='subscription'?9990000:1490000}});
const response=environment=>({billingEnvironment:environment,commerce:{premiumUntilMs:0,store:null,environment:null,paidGranted:0,paidConsumed:0,paidLives:0},serverTimeMs:1});
const memoryStorage=()=>{const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
const memoryLocks=()=>{const held=new Set();return {request(name,options,callback){assert.deepEqual(options,{mode:'exclusive',ifAvailable:true});if(held.has(name))return Promise.resolve().then(()=>callback(null));held.add(name);return Promise.resolve().then(()=>callback({name})).finally(()=>held.delete(name));}};};

async function fixture({environment='production',serverEnvironment=environment,project='ochavo-billing-test',sdkSandbox=environment==='sandbox',storage=memoryStorage(),locks=memoryLocks()}={}){
  const f={active:account('A'),calls:[],synced:[],opened:[],errors:[],packages:[{identifier:'monthly',product:product('subscription')},{identifier:'life_pack',product:product('consumable')}],response:response(serverEnvironment),info:{managementURL:null,entitlements:{active:{viruta_plus:{}}}},purchaseHook:null,serverError:null,serverHook:null,confirmedTransactions:new Set(),refundedTransactions:new Set(),lastTransaction:null,confirmPurchase(id=f.lastTransaction?.storeTransactionId){f.confirmedTransactions.add(id);}};
  let purchaseSequence=0;
  let uid=null;
  const instance={getAppUserId:()=>uid,isSandbox:()=>sdkSandbox,
    async changeUser(value){f.calls.push(['changeUser',value]);uid=value;return f.info;},
    async getOfferings(value){f.calls.push(['offerings',value]);return {current:{availablePackages:f.packages}};},
    async getCustomerInfo(){f.calls.push(['info',uid]);return f.info;},
    async purchase(value){f.calls.push(['purchase',value,uid]);const productId=value.rcPackage.product.identifier,before=f.response.commerce.paidGranted,priorGem=f.response.gemGrants?.find(item=>item.productId===productId)?.granted||0;f.lastTransaction={storeTransactionId:'web-order-'+(++purchaseSequence),productIdentifier:productId,purchaseDate:new Date()};if(f.purchaseHook)await f.purchaseHook();if(f.response.commerce.paidGranted>before||(f.response.gemGrants?.find(item=>item.productId===productId)?.granted||0)>priorGem)f.confirmPurchase();return {customerInfo:f.info,storeTransaction:f.lastTransaction};}
  };
  f.sdk=await createWebPurchasesSDK({environment,loadModule:async()=>({LogLevel:{Silent:0},Purchases:{setLogLevel:value=>f.calls.push(['log',value]),configure:value=>{f.calls.push(['configure',value]);uid=value.appUserId;return instance;}}})});
  f.controller=createPurchasesController({platform:{isNativePlatform:()=>false,getPlatform:()=>'web'},env:{VITE_REVENUECAT_WEB_KEY:environment==='sandbox'?'rcb_sb_fixture':'rcb_fixture',VITE_BILLING_ENVIRONMENT:environment,VITE_FIREBASE_PROJECT_ID:project,VITE_BILLING_API_URL:'https://billing.example.invalid/billing'},loadSDK:async()=>f.sdk,storage,locks,getUser:()=>f.active,isOnline:()=>true,
    fetch:async(url,request)=>{f.calls.push(['fetch',url,request]);if(f.serverHook)await f.serverHook();return {ok:!f.serverError,json:async()=>{if(f.serverError)return {error:{code:f.serverError}};const response=structuredClone(f.response),selector=JSON.parse(request.body).purchase;if(selector&&!response.purchaseConfirmation){const refunded=f.refundedTransactions.has(selector.transactionId),confirmed=f.confirmedTransactions.has(selector.transactionId)&&!refunded;response.purchaseConfirmation={...selector,confirmed,status:refunded?'refunded':confirmed?'confirmed':'pending'};}return response;}};},onSynced:value=>f.synced.push(value),onError:error=>f.errors.push(error),openURL:url=>f.opened.push(url)});
  f.select=async(user=f.active)=>{f.active=user;return f.controller.select(user);};
  return f;
}

test('web SDK uses verified UID, EUR provider prices and disables optional analytics',async()=>{
  const f=await fixture();const view=await f.select();
  assert.equal(view.web,true);assert.equal(view.native,false);assert.equal(view.environment,'production');assert.equal(view.canSubscribe,true);assert.equal(view.subscriptionPrice,'9,99 €');assert.equal(view.livesPrice,'1,49 €');
  assert.deepEqual(f.calls.find(c=>c[0]==='configure')[1],{apiKey:'rcb_fixture',appUserId:'A',flags:{autoCollectUTMAsMetadata:false,collectAnalyticsEvents:false}});
  assert.deepEqual(f.calls.filter(c=>c[0]==='offerings'),[['offerings',{currency:'EUR'}]]);
  assert.equal(f.synced[0].commerce.premiumUntilMs,0);assert.equal(view.premium,undefined);
});

test('web checkout receives the original package and only the server confirms paid lives',async()=>{
  const f=await fixture();await f.select();
  f.purchaseHook=async()=>{f.response.commerce={...f.response.commerce,store:'rc_billing',paidGranted:5,paidLives:5};};
  await f.controller.purchaseLives();
  const call=f.calls.find(c=>c[0]==='purchase');
  assert.equal(call[1].rcPackage,f.packages[1]);assert.equal(call[1].selectedLocale,'es');assert.equal(call[2],'A');
  assert.equal(f.synced.at(-1).commerce.paidLives,5);assert.equal(f.controller.getView().paidLives,undefined);
  await f.controller.restore();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);assert.equal(f.synced.at(-1).commerce.paidLives,5);
});

test('web and sandbox require an explicit matching server environment before checkout',async()=>{
  for(const serverEnvironment of ['sandbox',null,undefined]){
    const f=await fixture();f.response.billingEnvironment=serverEnvironment;await f.select();await f.controller.subscribe();
    assert.equal(f.controller.getView().canPurchase,false);assert.equal(f.synced.length,0);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  }
  const f=await fixture({environment:'sandbox',serverEnvironment:'production'});await f.select();assert.equal(f.synced.length,0);assert.equal(f.controller.getView().canPurchase,false);
  const isolated=await fixture({environment:'sandbox'});await isolated.select();assert.equal(isolated.controller.getView().canPurchase,true);assert.equal(isolated.controller.getView().environment,'sandbox');
  const publicProject=await fixture({environment:'sandbox',project:'brote-62d26'});await publicProject.select();assert.equal(publicProject.calls.length,0);
});

test('SDK sandbox mismatch and unverified users cannot load a usable checkout',async()=>{
  const wrongSDK=await fixture({sdkSandbox:true});await wrongSDK.select();assert.equal(wrongSDK.synced.length,0);assert.equal(wrongSDK.controller.getView().canPurchase,false);
  const f=await fixture();for(const user of [null,{...account('A'),emailVerified:false},{...account('A'),isAnonymous:true}])await f.select(user);assert.equal(f.calls.length,0);
});

test('ambiguous packages, yearly plans and nonconsumable life packs are unavailable',async()=>{
  for(const mutate of [f=>f.packages.push(f.packages[0]),f=>f.packages[0].product.period={number:1,unit:'year'},f=>f.packages[0].product.price.amountMicros=NaN]){
    const f=await fixture();mutate(f);await f.select();assert.equal(f.controller.getView().canSubscribe,false);await f.controller.subscribe();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  }
  const f=await fixture();f.packages[1].product.productType='non_consumable';await f.select();assert.equal(f.controller.getView().canPurchaseLives,false);
});

test('web account switch waits for checkout and cannot carry its result into another UID',async()=>{
  const f=await fixture();await f.select();const gate=deferred();f.purchaseHook=()=>gate.promise;
  const payment=f.controller.subscribe();await tick();const next=f.select(account('B'));await tick();
  assert.equal(f.calls.filter(c=>c[0]==='changeUser').length,0);const count=f.synced.length;gate.resolve();await payment;await next;
  assert.equal(f.calls.find(c=>c[0]==='purchase')[2],'A');assert.equal(f.synced.length,count+1);assert.equal(f.synced.at(-1).uid,'B');assert.equal(f.calls.filter(c=>c[0]==='configure').length,1);
  await f.select(null);assert.equal(f.controller.getView().subscriptionPrice,null);
});

test('web cancellations and pending payments map SDK errorCode without granting benefits',async()=>{
  for(const [errorCode,status] of [[1,'cancelled'],[20,'pending']]){
    const f=await fixture();await f.select();f.purchaseHook=async()=>{throw {errorCode};};await f.controller.subscribe();
    assert.equal(f.controller.getView().status,status);assert.equal(f.synced.at(-1).commerce.premiumUntilMs,0);assert.equal(f.errors.length,0);
  }
});

test('web successful checkout with lost verification blocks duplicate payment until rechecked',async()=>{
  const f=await fixture();await f.select();f.purchaseHook=async()=>{f.serverHook=async()=>{throw Error('network');};};
  await f.controller.subscribe();await f.controller.subscribe();assert.equal(f.controller.getView().status,'pending');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  f.serverHook=null;f.response.commerce.premiumUntilMs=100;await f.controller.refresh();assert.equal(f.controller.getView().status,'ready');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
});

test('unchanged successful reconciliation stays pending until the server observes the purchase',async()=>{
  for(const kind of ['subscription','lives']){
    const f=await fixture();await f.select();const buy=()=>kind==='subscription'?f.controller.subscribe():f.controller.purchaseLives();
    await buy();assert.equal(f.controller.getView().status,'pending');assert.match(f.controller.getView().message,/No repitas el pago/);
    await f.controller.refresh();await f.controller.restore();await buy();assert.equal(f.controller.getView().status,'pending');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
    await f.select(null);await f.select(account('B'));assert.equal(f.controller.getView().status,'ready');await f.select(account('A'));assert.equal(f.controller.getView().status,'pending');
    f.response.commerce=kind==='subscription'?{...f.response.commerce,premiumUntilMs:100}:{...f.response.commerce,paidGranted:5,paidLives:5};
    f.confirmPurchase();await f.controller.refresh();assert.equal(f.controller.getView().status,'ready');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  }
});

test('web preflight blocks a duplicate subscription from every supported store even with stale UI',async()=>{
  for(const store of ['app_store','play_store','rc_billing']){
    const f=await fixture();await f.select();assert.equal(f.controller.getView().canSubscribe,true);
    f.response.commerce={...f.response.commerce,store,premiumUntilMs:100};await f.controller.subscribe();
    assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.controller.getView().status,'ready');assert.match(f.controller.getView().message,/Ya tienes una suscripción activa/);
  }
});

test('deleted account is blocked before web payment, and management needs a validated portal',async()=>{
  const f=await fixture();await f.select();assert.equal(f.controller.getView().canManage,false);
  f.serverError='account/deletion-pending';await f.controller.subscribe();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  f.serverError=null;f.info.managementURL='https://api.revenuecat.com/rcbilling/v1/customerportal/txRcb123/portal';await f.controller.refresh();await f.controller.manage();assert.deepEqual(f.opened,[f.info.managementURL]);
  f.info.managementURL='https://evil.invalid/checkout';await f.controller.refresh();assert.equal(f.controller.getView().canManage,false);
});

test('pending guard survives page reload for its UID and clears only on the expected server grant',async()=>{
  const storage=memoryStorage();const f=await fixture({storage});await f.select();
  f.purchaseHook=async()=>{f.serverHook=async()=>{assert.equal(storage.values.size,1);};};
  await f.controller.purchaseLives();await f.select(null);await f.controller.dispose();
  const [key,raw]=[...storage.values][0],saved=JSON.parse(raw),{startedAtMs,operationId,...marker}=saved;assert.match(key,/:production:A$/);assert.deepEqual(marker,{schemaVersion:2,kind:'lives',productId:'viruta_lives_5',store:'rc_billing',phase:'received',transactionId:'web-order-1'});assert.ok(Number.isSafeInteger(startedAtMs));assert.match(operationId,/^[\da-f-]{36}$/);assert.doesNotMatch(raw,/token|receipt|fixture-A/);
  const reload=await fixture({storage});await reload.select();await reload.controller.purchaseLives();await reload.controller.restore();
  assert.equal(reload.controller.getView().status,'pending');assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(reload.synced.at(-1).commerce.paidLives,0);
  await reload.select(account('B'));assert.equal(reload.controller.getView().canPurchaseLives,true);
  await reload.select(account('A'));assert.equal(reload.controller.getView().canPurchaseLives,false);
  reload.response.commerce={...reload.response.commerce,paidGranted:5,paidLives:5};reload.confirmPurchase(saved.transactionId);await reload.controller.refresh();assert.equal(storage.values.size,0);assert.equal(reload.controller.getView().status,'ready');
});

test('pending storage is isolated by Firebase project and payment environment',async()=>{
  const storage=memoryStorage(),f=await fixture({storage});await f.select();await f.controller.subscribe();
  const otherProject=await fixture({storage,project:'other-test-project'});await otherProject.select();assert.equal(otherProject.controller.getView().canSubscribe,true);
  const sandbox=await fixture({storage,environment:'sandbox'});await sandbox.select();assert.equal(sandbox.controller.getView().canSubscribe,true);
  const same=await fixture({storage});await same.select();assert.equal(same.controller.getView().status,'pending');
  same.response.commerce.premiumUntilMs=100;await same.controller.refresh();assert.equal(storage.values.size,0);
});

test('corrupt markers cannot grant benefits or silently allow another payment',async()=>{
  for(const raw of ['invalid JSON','{}','null',JSON.stringify({schemaVersion:1,kind:'lives',expectedGranted:-1}),JSON.stringify({schemaVersion:1,kind:'lives',expectedGranted:Number.MAX_SAFE_INTEGER+1})]){
    const storage=memoryStorage();storage.setItem('ochavo:billing-pending:v1:ochavo-billing-test:production:A',raw);
    const f=await fixture({storage});await f.select();await f.controller.subscribe();await f.controller.restore();
    assert.equal(f.controller.getView().status,'pending');assert.match(f.controller.getView().message,/Contacta desde Ayuda/);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.synced.at(-1).commerce.paidLives,0);
    await f.select(account('B'));assert.equal(f.controller.getView().canPurchase,true);
  }
});

test('storage errors preserve the in-memory wait without crashing or granting anything',async()=>{
  const storage={getItem(){throw Error('denied');},setItem(){throw Error('quota');},removeItem(){throw Error('denied');}};
  const f=await fixture({storage});await f.select();await f.controller.purchaseLives();await f.controller.refresh();assert.equal(f.controller.getView().status,'pending');assert.equal(f.synced.at(-1).commerce.paidLives,0);
  assert.throws(()=>f.controller.forget('A'),/denied/);
});

test('account deletion forget removes only the requested pending marker and memory',async()=>{
  const storage=memoryStorage(),f=await fixture({storage});await f.select();await f.controller.purchaseLives();await f.select(account('B'));await f.controller.subscribe();assert.equal(storage.values.size,2);
  f.controller.forget('A');assert.equal(storage.values.size,1);assert.match([...storage.values.keys()][0],/:B$/);
  await f.select(account('A'));assert.equal(f.controller.getView().canPurchase,true);await f.select(account('B'));assert.equal(f.controller.getView().status,'pending');
});

const gemCatalogue=[{productId:'ochavo_gems_200',gems:200},{productId:'ochavo_gems_600',gems:600},{productId:'ochavo_gems_1500',gems:1500}];
const withGems=(f,{granted=0,consumed=0,revision=0}={})=>{
  f.response.gems={schemaVersion:1,revision,environment:f.response.billingEnvironment,granted,consumed,balance:Math.max(0,granted-consumed)};
  f.response.gemProducts=gemCatalogue.map(item=>({...item}));
  f.response.gemGrants=gemCatalogue.map((item,index)=>({productId:item.productId,granted:index===0?granted:0}));
  f.packages.push(...gemCatalogue.map((item,index)=>({identifier:'gem_pack_'+item.gems,product:{identifier:item.productId,productType:'consumable',period:null,price:{formattedPrice:['1,99 €','4,99 €','9,99 €'][index],currency:'EUR',amountMicros:[1990000,4990000,9990000][index]}}})));
  return f;
};

test('web gem checkout uses the exact provider package displayed and only the server grants currency',async()=>{
  const f=withGems(await fixture());const view=await f.select();assert.equal(view.canPurchaseGems,true);assert.deepEqual(view.gemProducts.map(item=>[item.productId,item.gems,item.price]),[['ochavo_gems_200',200,'1,99 €'],['ochavo_gems_600',600,'4,99 €'],['ochavo_gems_1500',1500,'9,99 €']]);
  f.purchaseHook=async()=>{f.response.gems={...f.response.gems,revision:1,granted:1500,balance:1500};f.response.gemGrants=f.response.gemGrants.map(item=>({...item,granted:item.productId==='ochavo_gems_1500'?1500:0}));};
  await f.controller.purchaseGems('ochavo_gems_1500');const call=f.calls.find(c=>c[0]==='purchase');assert.equal(call[1].rcPackage,f.packages[4]);assert.equal(call[1].selectedLocale,'es');assert.equal(call[2],'A');assert.equal(f.controller.getView().trustedGems.balance,1500);assert.equal(f.synced.at(-1).gems.granted,1500);
  await f.controller.restore();assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);assert.equal(f.controller.getView().trustedGems.balance,1500);
});

test('web gem catalogues reject ambiguous, nonconsumable, wrong quantity and unavailable provider packages',async()=>{
  for(const mutate of [f=>f.packages.push(f.packages[2]),f=>f.packages[2].product.productType='non_consumable',f=>f.packages[2].product.price.amountMicros=NaN,f=>f.packages=f.packages.filter(item=>item.product.identifier!=='ochavo_gems_200')]){
    const f=withGems(await fixture());mutate(f);await f.select();assert.equal(f.controller.getView().gemProducts.some(item=>item.productId==='ochavo_gems_200'),false);await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  }
  const f=withGems(await fixture());f.response.gemProducts[0].gems=1500;await f.select();await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.synced.length,0);assert.equal(f.controller.getView().canPurchaseGems,false);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
});

test('web pending gem checkout is scoped by UID, Firebase project and billing environment across reloads',async()=>{
  const storage=memoryStorage(),f=withGems(await fixture({storage}));await f.select();await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'pending');assert.equal(storage.values.size,1);await f.controller.dispose();
  const reload=withGems(await fixture({storage}));await reload.select();await reload.controller.purchaseGems('ochavo_gems_200');assert.equal(reload.controller.getView().status,'pending');assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0);
  const otherProject=withGems(await fixture({storage,project:'other-test-project'}));await otherProject.select();assert.equal(otherProject.controller.getView().canPurchaseGems,true);
  const sandbox=withGems(await fixture({storage,environment:'sandbox'}));await sandbox.select();assert.equal(sandbox.controller.getView().canPurchaseGems,true);
  await reload.select(account('B'));assert.equal(reload.controller.getView().canPurchaseGems,true);await reload.select(account('A'));assert.equal(reload.controller.getView().canPurchaseGems,false);
  reload.response.gems={...reload.response.gems,revision:1,granted:200,balance:200};reload.response.gemGrants[0].granted=200;reload.confirmPurchase('web-order-1');await reload.controller.refresh();assert.equal(reload.controller.getView().status,'ready');assert.equal(storage.values.size,0);assert.equal(reload.controller.getView().trustedGems.balance,200);
});

test('web gem wallet from another payment environment never reaches the game consumer or checkout',async()=>{
  for(const environment of ['production','sandbox']){
    const f=withGems(await fixture({environment}));f.response.gems.environment=environment==='production'?'sandbox':'production';await f.select();await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.synced.length,0);assert.equal(f.controller.getView().trustedGems,null);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
  }
});

test('corrupt gem pending markers fail closed without leaking across accounts',async()=>{
  for(const marker of [{kind:'gems',productId:'other',expectedGranted:200,expectedRevision:1},{kind:'gems',productId:'ochavo_gems_200',expectedGranted:199,expectedRevision:1},{kind:'gems',productId:'ochavo_gems_200',expectedGranted:200,expectedRevision:0},{kind:'gems',productId:'ochavo_gems_200',expectedGranted:200,expectedRevision:1.5}]){
    const storage=memoryStorage();storage.setItem('ochavo:billing-pending:v1:ochavo-billing-test:production:A',JSON.stringify({schemaVersion:1,...marker}));const f=withGems(await fixture({storage}));await f.select();await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'pending');assert.match(f.controller.getView().message,/Contacta desde Ayuda/);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
    await f.select(account('B'));assert.equal(f.controller.getView().canPurchaseGems,true);
  }
});

test('web never opens checkout when the durable marker cannot be read or verified after writing',async()=>{
  for(const kind of ['subscription','lives','gems'])for(const fault of ['read','write','readback']){
    const storage={...memoryStorage(),...(fault==='read'?{getItem(){throw Error('denied');}}:fault==='write'?{setItem(){throw Error('quota');}}:{setItem(){}})};
    const f=withGems(await fixture({storage}));await f.select();await (kind==='subscription'?f.controller.subscribe():kind==='lives'?f.controller.purchaseLives():f.controller.purchaseGems('ochavo_gems_200'));
    assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(f.controller.getView().canPurchase,false);assert.equal(f.controller.getView().status,'pending');
  }
});

test('normalized web transaction confirms only its exact receipt, including a simultaneous same-SKU refund',async()=>{
  const f=withGems(await fixture(),{granted:200,revision:1});await f.select();f.purchaseHook=async()=>{f.response.gems.revision++;f.confirmPurchase();};
  await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().status,'ready');assert.equal(f.controller.getView().trustedGems.balance,200);
  const selector=f.calls.filter(c=>c[0]==='fetch').map(c=>JSON.parse(c[2].body)).find(body=>body.purchase)?.purchase;assert.deepEqual(selector,{productId:'ochavo_gems_200',transactionId:'web-order-1',store:'rc_billing'});
  const pending=withGems(await fixture());await pending.select();await pending.controller.purchaseGems('ochavo_gems_200');pending.response.gems={...pending.response.gems,revision:1,granted:200,balance:200};pending.response.gemGrants[0].granted=200;await pending.controller.refresh();assert.equal(pending.controller.getView().status,'pending');assert.equal(pending.controller.getView().trustedGems.balance,200);
  pending.confirmPurchase();await pending.controller.refresh();assert.equal(pending.controller.getView().status,'ready');
});

test('web payment without a returned receipt keeps an explicit recovery guard after reload',async()=>{
  const storage=memoryStorage(),f=withGems(await fixture({storage}));await f.select();f.purchaseHook=async()=>{throw {errorCode:20};};await f.controller.purchaseGems('ochavo_gems_200');assert.equal(JSON.parse([...storage.values.values()][0]).phase,'started');await f.controller.dispose();
  const reload=withGems(await fixture({storage}),{granted:200,revision:1});await reload.select();await reload.controller.purchaseGems('ochavo_gems_200');assert.equal(reload.calls.filter(c=>c[0]==='purchase').length,0);assert.equal(reload.controller.getView().status,'pending');assert.match(reload.controller.getView().message,/comprobante.*Ayuda/);assert.equal(reload.controller.getView().trustedGems.balance,200);
});

test('one browser lock rejects another tab immediately and is released after cancellation',async()=>{
  const storage=memoryStorage(),locks=memoryLocks(),first=withGems(await fixture({storage,locks})),second=withGems(await fixture({storage,locks}));await first.select();await second.select();const gate=deferred();first.purchaseHook=async()=>{await gate.promise;throw {errorCode:1};};
  const opening=first.controller.purchaseGems('ochavo_gems_200');await tick();await second.controller.purchaseGems('ochavo_gems_200');assert.equal(first.calls.filter(c=>c[0]==='purchase').length,1);assert.equal(second.calls.filter(c=>c[0]==='purchase').length,0);assert.match(second.controller.getView().message,/otra compra abierta/);
  gate.resolve();await opening;assert.equal(storage.values.size,0);await second.controller.refresh();second.purchaseHook=async()=>{second.response.gems={...second.response.gems,revision:1,granted:200,balance:200};second.response.gemGrants[0].granted=200;};await second.controller.purchaseGems('ochavo_gems_200');assert.equal(second.calls.filter(c=>c[0]==='purchase').length,1);assert.equal(second.controller.getView().status,'ready');
});

test('web without cross-tab locking fails closed with an upgrade explanation and never opens payment',async()=>{
  const f=withGems(await fixture({locks:null}));await f.select();await f.controller.subscribe();await f.controller.purchaseLives();await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.controller.getView().canPurchase,false);assert.match(f.controller.getView().message,/actualiza tu navegador/);assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
});

const pendingKey='ochavo:billing-pending:v1:ochavo-billing-test:production:A';
const interruptedMarker=(overrides={})=>({schemaVersion:2,kind:'gems',productId:'ochavo_gems_200',store:'rc_billing',phase:'started',startedAtMs:1,operationId:'interrupted-fixture',...overrides});
const seedInterrupted=(storage,overrides={})=>{const marker=interruptedMarker(overrides);storage.setItem(pendingKey,JSON.stringify(marker));return marker;};

test('explicit dismissal after reloading a started consumable rechecks the server, keeps benefits unchanged and enables checkout',async()=>{
  for(const kind of ['gems','lives']){
    const storage=memoryStorage(),marker=seedInterrupted(storage,kind==='lives'?{kind,productId:'viruta_lives_5'}:{});
    const f=withGems(await fixture({storage}),{granted:200,consumed:70,revision:1});await f.select();
    assert.equal(f.controller.getView().canPurchase,false);assert.deepEqual(f.controller.getView().interruptedPurchase,{operationId:marker.operationId,kind});
    const before=structuredClone(f.response),count=f.synced.length;
    const view=await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});
    assert.equal(view.canPurchase,true);assert.equal(view.interruptedPurchase,null);assert.equal(storage.getItem(pendingKey),null);
    assert.equal(f.synced.length,count+1);assert.deepEqual(f.response,before);assert.deepEqual(view.trustedGems,before.gems);
    assert.match(view.message,/no cancela ni devuelve ningún cargo/);assert.doesNotMatch(view.message,/Compra comprobada|Compra confirmada/);
    assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
    const request=f.calls.filter(c=>c[0]==='fetch').at(-1)[2];assert.deepEqual(JSON.parse(request.body),{action:'sync'});
    f.purchaseHook=async()=>{throw {errorCode:1};};await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,1);
  }
});

test('dismissal requires explicit review and never releases received, legacy, subscription or unreadable markers',async()=>{
  const raws=[JSON.stringify(interruptedMarker({phase:'received',transactionId:'paid-receipt'})),JSON.stringify({schemaVersion:1,kind:'lives',expectedGranted:5}),JSON.stringify({schemaVersion:1,kind:'subscription'}),JSON.stringify(interruptedMarker({kind:'subscription',productId:'viruta_plus_monthly'})),'broken',JSON.stringify(interruptedMarker({transactionId:'present-but-started'}))];
  for(const raw of raws){
    const storage=memoryStorage();storage.setItem(pendingKey,raw);const f=withGems(await fixture({storage}));await f.select();
    assert.equal(f.controller.getView().interruptedPurchase,null);
    await f.controller.closeInterruptedPurchase({operationId:'interrupted-fixture',reviewed:true});assert.equal(storage.getItem(pendingKey),raw);assert.equal(f.controller.getView().canPurchase,false);
  }
  const storage=memoryStorage(),marker=seedInterrupted(storage),f=withGems(await fixture({storage}));await f.select();const count=f.synced.length;
  for(const reviewed of [undefined,false,'true'])await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed});
  assert.equal(f.synced.length,count);assert.ok(storage.getItem(pendingKey));assert.equal(f.controller.getView().canPurchase,false);
});

test('a checkout alive in another tab owns the lock and cannot be dismissed',async()=>{
  const storage=memoryStorage(),locks=memoryLocks(),first=withGems(await fixture({storage,locks})),second=withGems(await fixture({storage,locks}));await first.select();const gate=deferred();
  first.purchaseHook=async()=>{await gate.promise;throw {errorCode:1};};const buying=first.controller.purchaseGems('ochavo_gems_200');await tick();await second.select();
  const raw=storage.getItem(pendingKey),marker=JSON.parse(raw),count=second.synced.length;
  await second.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});assert.equal(storage.getItem(pendingKey),raw);assert.equal(second.synced.length,count);assert.match(second.controller.getView().message,/otra compra abierta/);
  gate.resolve();await buying;
});

test('dismissal holds the exclusive lock through server sync and concurrent dismissals do not queue',async()=>{
  const storage=memoryStorage(),locks=memoryLocks(),marker=seedInterrupted(storage),first=withGems(await fixture({storage,locks})),second=withGems(await fixture({storage,locks}));await first.select();await second.select();const gate=deferred();first.serverHook=()=>gate.promise;
  const closing=first.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});await tick();
  await second.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});assert.ok(storage.getItem(pendingKey));assert.match(second.controller.getView().message,/otra compra abierta/);
  await first.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});gate.resolve();await closing;
  assert.equal(storage.getItem(pendingKey),null);assert.equal(first.controller.getView().canPurchase,true);
});

test('changing a marker during sync or after opening its review preserves the entire replacement',async()=>{
  for(const timing of ['before','during'])for(const replacement of [interruptedMarker({operationId:'another-attempt'}),interruptedMarker({phase:'received',transactionId:'late-receipt'}),interruptedMarker({startedAtMs:2})]){
    const storage=memoryStorage(),marker=seedInterrupted(storage),f=withGems(await fixture({storage}));await f.select();const raw=JSON.stringify(replacement);
    if(timing==='before')storage.setItem(pendingKey,raw);else f.serverHook=async()=>storage.setItem(pendingKey,raw);
    await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});
    assert.equal(storage.getItem(pendingKey),raw);assert.equal(f.controller.getView().canPurchase,false);
  }
});

test('account replacement, verification loss or a new session during dismissal cannot clear the marker',async()=>{
  for(const replacement of [account('B'),{...account('A'),emailVerified:false},account('A'),null]){
    const storage=memoryStorage(),marker=seedInterrupted(storage),f=withGems(await fixture({storage}));await f.select();const gate=deferred();f.serverHook=()=>gate.promise;
    const closing=f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});await tick();f.active=replacement;gate.resolve();await closing;
    assert.ok(storage.getItem(pendingKey));assert.doesNotMatch(f.controller.getView().message,/Intento cerrado/);
  }
});

test('server rejection, wrong environment and failed storage reads/removal keep interrupted attempts blocked',async()=>{
  for(const fault of ['deletion','auth','verification','environment','network','read','remove','readback','no-lock']){
    const backing=memoryStorage(),storage={...backing},marker=seedInterrupted(storage),f=withGems(await fixture({storage,...(fault==='no-lock'?{locks:null}:{})}));await f.select();const raw=backing.getItem(pendingKey);
    if(fault==='deletion')f.serverError='account/deletion-pending';if(fault==='auth')f.serverError='billing/unauthenticated';if(fault==='verification')f.serverError='billing/verification-required';if(fault==='environment')f.response.billingEnvironment='sandbox';if(fault==='network')f.serverHook=async()=>{throw Error('offline');};
    if(fault==='read')storage.getItem=()=>{throw Error('denied');};if(fault==='remove')storage.removeItem=()=>{throw Error('denied');};if(fault==='readback')storage.removeItem=()=>{};
    await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});assert.equal(backing.getItem(pendingKey),raw,fault);assert.equal(f.controller.getView().canPurchase,false,fault);assert.doesNotMatch(f.controller.getView().message,/Intento cerrado/,fault);
  }
});

test('dismissal only affects the current project, environment and UID marker',async()=>{
  const storage=memoryStorage(),marker=seedInterrupted(storage),raw=storage.getItem(pendingKey),others=[pendingKey.replace(':A',':B'),pendingKey.replace(':production:',':sandbox:'),pendingKey.replace(':ochavo-billing-test:',':other-project:')];for(const key of others)storage.setItem(key,raw);
  const f=withGems(await fixture({storage}));await f.select(account('B'));await f.controller.closeInterruptedPurchase({operationId:'different',reviewed:true});assert.equal(storage.getItem(pendingKey),raw);
  await f.select(account('A'));await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});assert.equal(storage.getItem(pendingKey),null);for(const key of others)assert.equal(storage.getItem(key),raw);
});

test('an unreadable removal result does not report successful dismissal or release the in-memory guard',async()=>{
  const backing=memoryStorage();let removed=false;const storage={...backing,removeItem(key){backing.removeItem(key);removed=true;},getItem(key){if(removed)throw Error('read failed');return backing.getItem(key);}};
  const marker=seedInterrupted(storage),f=withGems(await fixture({storage}));await f.select();await f.controller.closeInterruptedPurchase({operationId:marker.operationId,reviewed:true});
  assert.equal(backing.getItem(pendingKey),null);assert.equal(f.controller.getView().canPurchase,false);assert.doesNotMatch(f.controller.getView().message,/Intento cerrado/);
  await f.controller.purchaseGems('ochavo_gems_200');assert.equal(f.calls.filter(c=>c[0]==='purchase').length,0);
});
