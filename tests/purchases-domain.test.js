import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GEM_PURCHASE_PRODUCTS,purchaseConfiguration,findPurchaseProduct,purchaseFailure,storeManagementURL,verifiedPurchaseUser,validateBillingResponse} from '../src/purchases-domain.js';

const native=store=>({isNativePlatform:()=>true,getPlatform:()=>store});
const env={VITE_REVENUECAT_ANDROID_KEY:'goog_fixtureAndroid',VITE_REVENUECAT_IOS_KEY:'appl_fixtureIos',VITE_BILLING_API_URL:'https://billing.example.invalid/billing'};
const subscription={identifier:'viruta_plus_monthly',priceString:'12,49 €',price:12.49,currencyCode:'EUR',productCategory:'SUBSCRIPTION',productType:'AUTO_RENEWABLE_SUBSCRIPTION',subscriptionPeriod:'P1M'};
const lives={identifier:'viruta_lives_5',priceString:'MX$19.00',price:19,currencyCode:'MXN',productCategory:'NON_SUBSCRIPTION',productType:'CONSUMABLE',subscriptionPeriod:null};

test('native stores use their own public key; web, wrong platform and Test Store fail closed',()=>{
  assert.equal(purchaseConfiguration(native('android'),env).key,env.VITE_REVENUECAT_ANDROID_KEY);
  assert.equal(purchaseConfiguration(native('ios'),env).key,env.VITE_REVENUECAT_IOS_KEY);
  for(const platform of [native('desktop'),{isNativePlatform:()=>false,getPlatform:()=>'android'}])assert.equal(purchaseConfiguration(platform,env).configured,false);
  for(const key of ['test_fixture','sk_secret','appl_otherstore',''])assert.equal(purchaseConfiguration(native('android'),{...env,VITE_REVENUECAT_ANDROID_KEY:key}).configured,false);
  for(const endpoint of ['http://billing.example.invalid/billing','https://secret@example.invalid/billing','https://billing.example.invalid/?token=secret',''])assert.equal(purchaseConfiguration(native('android'),{...env,VITE_BILLING_API_URL:endpoint}).configured,false);
});

test('web uses RevenueCat Billing keys and sandbox is isolated from the public Firebase project',()=>{
  const platform={isNativePlatform:()=>false,getPlatform:()=>'web'};
  const webEnv={...env,VITE_REVENUECAT_WEB_KEY:'rcb_fixturePublic',VITE_FIREBASE_PROJECT_ID:'brote-62d26'};
  assert.equal(purchaseConfiguration(platform,webEnv).configured,true);
  assert.equal(purchaseConfiguration(platform,webEnv).web,true);
  for(const key of ['rcb_sb_fixture','test_fixture','sk_live_secret','strp_fixture','goog_fixture'])assert.equal(purchaseConfiguration(platform,{...webEnv,VITE_REVENUECAT_WEB_KEY:key}).configured,false);
  const sandbox={...webEnv,VITE_BILLING_ENVIRONMENT:'sandbox',VITE_REVENUECAT_WEB_KEY:'rcb_sb_fixture'};
  for(const project of [undefined,'','brote-62d26'])assert.equal(purchaseConfiguration(platform,{...sandbox,VITE_FIREBASE_PROJECT_ID:project}).configured,false);
  assert.equal(purchaseConfiguration(platform,{...sandbox,VITE_FIREBASE_PROJECT_ID:'ochavo-billing-test'}).configured,true);
  assert.equal(purchaseConfiguration(platform,{...sandbox,VITE_FIREBASE_PROJECT_ID:'ochavo-billing-test',VITE_REVENUECAT_WEB_KEY:'rcb_live'}).configured,false);
  assert.equal(purchaseConfiguration(platform,{...webEnv,VITE_BILLING_ENVIRONMENT:'unknown'}).configured,false);
});

test('buying requires a verified non-anonymous Firebase UID and token provider',()=>{
  const user={uid:'uid',emailVerified:true,getIdToken:async()=>''};
  assert.equal(verifiedPurchaseUser(user),true);
  for(const candidate of [null,{...user,uid:''},{...user,emailVerified:false},{...user,isAnonymous:true},{...user,getIdToken:undefined}])assert.equal(verifiedPurchaseUser(candidate),false);
});

test('HTTP billing is limited to the explicit web-only local sandbox with all development gates',()=>{
  const platform={isNativePlatform:()=>false,getPlatform:()=>'web'};
  const local={DEV:true,VITE_USE_EMULATORS:'true',VITE_BILLING_ENVIRONMENT:'sandbox',VITE_FIREBASE_PROJECT_ID:'demo-brote',VITE_REVENUECAT_WEB_KEY:'rcb_sb_fixture',VITE_BILLING_API_URL:'http://127.0.0.1:5001/demo-brote/europe-west1/billing'};
  assert.equal(purchaseConfiguration(platform,local).configured,true);
  assert.equal(purchaseConfiguration(platform,{...local,VITE_BILLING_API_URL:local.VITE_BILLING_API_URL.replace('127.0.0.1','localhost')}).configured,true);
  for(const changes of [{DEV:false},{DEV:'true'},{DEV:undefined},{VITE_USE_EMULATORS:'false'},{VITE_USE_EMULATORS:true},{VITE_BILLING_ENVIRONMENT:'production'},{VITE_FIREBASE_PROJECT_ID:'brote-62d26'},{VITE_FIREBASE_PROJECT_ID:'other-demo'},{VITE_REVENUECAT_WEB_KEY:'rcb_production'}]){
    assert.equal(purchaseConfiguration(platform,{...local,...changes}).configured,false,JSON.stringify(changes));
  }
  for(const endpoint of [
    'http://127.0.0.1:5002/demo-brote/europe-west1/billing','http://127.0.0.2:5001/demo-brote/europe-west1/billing','http://localhost.evil.invalid:5001/demo-brote/europe-west1/billing',
    'http://127.0.0.1:5001/brote-62d26/europe-west1/billing','http://127.0.0.1:5001/demo-brote/europe-west1/revenuecatWebhook',
    local.VITE_BILLING_API_URL+'/',local.VITE_BILLING_API_URL+'?x=1',local.VITE_BILLING_API_URL+'#x',local.VITE_BILLING_API_URL.replace('http://','http://user@'),
    local.VITE_BILLING_API_URL.replace('/demo-brote/','/ignored/../demo-brote/'),local.VITE_BILLING_API_URL.replace('127.0.0.1','2130706433')
  ])assert.equal(purchaseConfiguration(platform,{...local,VITE_BILLING_API_URL:endpoint}).configured,false,endpoint);
  for(const store of ['android','ios'])assert.equal(purchaseConfiguration(native(store),{...env,...local}).configured,false);
});

test('prices are exact localized store strings; no target-price fallback or wrong product type',()=>{
  assert.equal(findPurchaseProduct([subscription],'subscription'),subscription);
  assert.equal(findPurchaseProduct([lives],'lives').priceString,'MX$19.00');
  for(const product of [{...subscription,priceString:''},{...subscription,subscriptionPeriod:'P1Y'},{...subscription,productType:'PREPAID_SUBSCRIPTION'},{...subscription,identifier:'other_monthly'},{...subscription,currencyCode:''}])assert.equal(findPurchaseProduct([product],'subscription'),null);
  assert.equal(findPurchaseProduct([{...lives,productType:'NON_CONSUMABLE'}],'lives'),null);
  assert.equal(findPurchaseProduct([],'subscription'),null);
});

test('one monthly Android base plan is accepted but ambiguous matching plans are not guessed',()=>{
  const base={...subscription,identifier:'viruta_plus_monthly:monthly'};
  assert.equal(findPurchaseProduct([base],'subscription'),base);
  assert.equal(findPurchaseProduct([base,{...base,identifier:'viruta_plus_monthly:other'}],'subscription'),null);
});

test('RevenueCat cancellation and pending-payment codes are distinct without exposing raw messages',()=>{
  assert.equal(purchaseFailure({code:1}).status,'cancelled');
  assert.equal(purchaseFailure({userCancelled:true}).status,'cancelled');
  assert.equal(purchaseFailure({code:'20'}).status,'pending');
  assert.equal(purchaseFailure({userInfo:{readableErrorCode:'PAYMENT_PENDING_ERROR'}}).status,'pending');
  assert.equal(purchaseFailure({code:'13'}).code,'billing/receipt-owner');
  assert.equal(purchaseFailure({code:'account/deletion-pending'}).status,'deletion-pending');
  assert.doesNotMatch(purchaseFailure({message:'secret or account data'}).message,/secret/);
  assert.equal(purchaseFailure({errorCode:1}).status,'cancelled');
  assert.equal(purchaseFailure({errorCode:20}).status,'pending');
  assert.equal(purchaseFailure({errorCode:10}).status,'offline');
  assert.equal(purchaseFailure({errorCode:5}).status,'unavailable');
});

test('subscription management can only open the official subscription pages',()=>{
  assert.equal(storeManagementURL('https://evil.invalid','ios'),'https://apps.apple.com/account/subscriptions');
  assert.equal(storeManagementURL('javascript:alert(1)','android'),'https://play.google.com/store/account/subscriptions');
  assert.equal(storeManagementURL('https://play.google.com/store/account/subscriptions?sku=x','ios'),'https://play.google.com/store/account/subscriptions?sku=x');
  assert.equal(storeManagementURL('https://play.google.com.evil.invalid/store/account/subscriptions','android'),'https://play.google.com/store/account/subscriptions');
});

test('web management permits only known RevenueCat portal routes, also on native devices',()=>{
  for(const value of ['https://api.revenuecat.com/rcbilling/v1/customerportal/txRcb123/portal','https://billing.revenuecat.com/app123/sub123?token=fixture']){
    assert.equal(storeManagementURL(value,'web'),value);
    assert.equal(storeManagementURL(value,'android'),value);
  }
  for(const value of ['https://billing.revenuecat.com.evil.invalid/app/sub','https://api.revenuecat.com/rcbilling/v1/customerportal/tx/portal?redirect=https://evil.invalid','https://billing.revenuecat.com/app/sub?redirect=https://evil.invalid','https://billing.revenuecat.com:8443/app/sub','https://billing.revenuecat.com/app/sub#redirect','https://secret@billing.revenuecat.com/app/sub','https://pay.rev.cat/checkout','javascript:alert(1)'])assert.equal(storeManagementURL(value,'web'),null);
  assert.equal(storeManagementURL(null,'web'),null);
});

test('malformed commerce is never passed as a confirmed server result',()=>{
  const value={commerce:{premiumUntilMs:0,paidGranted:10,paidConsumed:7,paidLives:3},serverTimeMs:1};
  assert.equal(validateBillingResponse(value),value);
  const refunded={...value,commerce:{...value.commerce,paidGranted:0,paidConsumed:7,paidLives:0}};
  assert.equal(validateBillingResponse(refunded),refunded);
  for(const commerce of [{...value.commerce,paidLives:100},{...value.commerce,paidConsumed:-1},{...value.commerce,premiumUntilMs:null}])assert.throws(()=>validateBillingResponse({...value,commerce}),{code:'billing/invalid-response'});
});

test('native projects retain bank-authentication return mode and the iOS purchase capability',()=>{
  const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
  assert.match(manifest,/android:launchMode="(?:standard|singleTop)"/);
  const project=readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj',import.meta.url),'utf8');
  assert.match(project,/com\.apple\.InAppPurchase = \{\s*enabled = 1;/);
});

test('approved gem SKUs select one exact localized price and no quantity or price fallback',()=>{
  for(const productId of Object.keys(GEM_PURCHASE_PRODUCTS)){
    const product={...lives,identifier:productId,priceString:'¥320',price:320,currencyCode:'JPY'};
    assert.equal(findPurchaseProduct([product],productId),product);
    assert.equal(findPurchaseProduct([product,{...product}],productId),null);
    for(const changes of [{identifier:productId+':variant'},{identifier:'ochavo_gems_999'},{currencyCode:'eur'},{price:NaN},{priceString:''},{productType:'NON_CONSUMABLE'},{subscriptionPeriod:'P1M'}])assert.equal(findPurchaseProduct([{...product,...changes}],productId),null);
  }
  assert.equal(findPurchaseProduct([lives],'not-approved'),null);
});

test('Android one-time consumables rely on their approved SKU and category when subtype is unknown',()=>{
  for(const kind of ['lives','ochavo_gems_200']){
    const base={...lives,identifier:kind==='lives'?lives.identifier:kind};
    for(const productType of ['UNKNOWN','INAPP',null,undefined]){
      const product={...base,productType};
      assert.equal(findPurchaseProduct([product],kind,{store:'android'}),product);
      assert.equal(findPurchaseProduct([product],kind,{store:'ios'}),null);
      assert.equal(findPurchaseProduct([product],kind,{store:'web'}),null);
      assert.equal(findPurchaseProduct([{...product,productCategory:'SUBSCRIPTION'}],kind,{store:'android'}),null);
    }
    assert.equal(findPurchaseProduct([{...base,productType:'NON_CONSUMABLE'}],kind,{store:'android'}),null);
  }
});

const gemResponse=()=>({commerce:{premiumUntilMs:0,paidGranted:0,paidConsumed:0,paidLives:0},serverTimeMs:1,billingEnvironment:'production',gems:{schemaVersion:1,revision:3,environment:'production',granted:600,consumed:100,balance:500},gemProducts:Object.entries(GEM_PURCHASE_PRODUCTS).map(([productId,gems])=>({productId,gems})),gemGrants:[{productId:'ochavo_gems_600',granted:600}]});

test('optional gem wallet validates revisions, refund debt and exact counter-derived balance',()=>{
  const value=gemResponse();assert.equal(validateBillingResponse(value),value);
  const refund={...value,gems:{...value.gems,granted:0,consumed:100,balance:0},gemGrants:[]};
  assert.equal(validateBillingResponse(refund),refund);
  for(const changes of [{schemaVersion:2},{revision:-1},{revision:1.5},{environment:'test'},{granted:Infinity},{consumed:-1},{balance:600},{balance:Number.MAX_SAFE_INTEGER+1}])assert.throws(()=>validateBillingResponse({...value,gems:{...value.gems,...changes}}),{code:'billing/invalid-response'});
  assert.throws(()=>validateBillingResponse({...value,gems:null}),{code:'billing/invalid-response'});
});

test('gem catalogue accepts only the three approved SKU quantities without duplicates',()=>{
  const value=gemResponse();assert.equal(validateBillingResponse({...value,gemProducts:[]}).gemProducts.length,0);
  for(const catalogue of [null,{},[{productId:'ochavo_gems_999',gems:999}],[{productId:'ochavo_gems_200',gems:1500}],[{productId:['ochavo_gems_200'],gems:200}],[{productId:'ochavo_gems_200',gems:'200'}],[value.gemProducts[0],value.gemProducts[0]],[...value.gemProducts,value.gemProducts[0]]])assert.throws(()=>validateBillingResponse({...value,gemProducts:catalogue}),{code:'billing/invalid-response'});
});

test('gem grant counters are unique approved SKUs and sum exactly to the verified wallet grant',()=>{
  const value=gemResponse();assert.equal(validateBillingResponse(value),value);
  for(const grants of [null,{},[{productId:'other',granted:600}],[{productId:'ochavo_gems_200',granted:-1}],[{productId:'ochavo_gems_200',granted:600.5}],[{productId:'ochavo_gems_200',granted:Number.MAX_SAFE_INTEGER+1}],[],[value.gemGrants[0],value.gemGrants[0]],[{productId:'ochavo_gems_200',granted:200},{productId:'ochavo_gems_600',granted:600}]])assert.throws(()=>validateBillingResponse({...value,gemGrants:grants}),{code:'billing/invalid-response'});
  const legacy={...value};delete legacy.gemGrants;assert.equal(validateBillingResponse(legacy),legacy);
  const noWallet={...value};delete noWallet.gems;assert.throws(()=>validateBillingResponse(noWallet),{code:'billing/invalid-response'});
});

test('exact purchase confirmation validates product, store, reference and status without trusting a boolean alone',()=>{
  const value=gemResponse(),purchaseConfirmation={productId:'ochavo_gems_200',transactionId:'fixture-order-1',store:'play_store',confirmed:true,status:'confirmed'};
  assert.equal(validateBillingResponse({...value,purchaseConfirmation}).purchaseConfirmation,purchaseConfirmation);
  assert.equal(validateBillingResponse({...value,purchaseConfirmation:{...purchaseConfirmation,confirmed:false,status:'refunded'}}).purchaseConfirmation.status,'refunded');
  for(const changes of [{productId:'other'},{productId:'viruta_plus_monthly'},{store:'test_store'},{transactionId:''},{transactionId:'invalid reference'},{transactionId:'line\nbreak'},{status:'unverified'},{confirmed:false},{confirmed:'true'}])assert.throws(()=>validateBillingResponse({...value,purchaseConfirmation:{...purchaseConfirmation,...changes}}),{code:'billing/invalid-response'});
  assert.match(purchaseFailure({code:'billing/receipt-missing'}).message,/comprobante.*Ayuda/);
});
