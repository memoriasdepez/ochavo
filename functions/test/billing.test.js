import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseProviderSnapshot,reconcileCommerce,reconcileGemCommerce,emptyGemCommerce,validateGemPacks,parseSyncRequest,validatePurchaseSelector,emptyCommerce,verifyWebhook,fingerprint,BILLING_ORIGINS,assertBillingEnvironment,billingOrigins} from '../billing-domain.js';
import {createBillingService,createRevenueCat,shouldRunBillingCleanup,SYNC_LEASE_MS,DELETE_CONFIRM_DELAY_MS,MAX_SYNC_LEASES} from '../billing-service.js';
const now=1801656000000,iso=ms=>new Date(ms).toISOString();
function input(){return {uid:'A',now,customer:{subscriber:{original_app_user_id:'A',entitlements:{viruta_plus:{product_identifier:'viruta_plus_monthly',expires_date:iso(now+10000)}},subscriptions:{viruta_plus_monthly:{expires_date:iso(now+10000),store:'play_store',is_sandbox:false,ownership_type:'PURCHASED',refunded_at:null}}}},purchases:[{id:'purchase1',product_id:'prod',customer_id:'A',original_customer_id:'A',store_purchase_identifier:'GPA.123',quantity:1,purchased_at:now-1000,store:'play_store',environment:'production',status:'owned'}],subscriptions:[{id:'sub1',product_id:'monthly',customer_id:'A',original_customer_id:'A',store:'play_store',environment:'production',gives_access:true,ownership:'purchased',current_period_ends_at:now+10000,status:'active',entitlements:{items:[{lookup_key:'viruta_plus'}],next_page:null}}],products:{prod:{store_identifier:'viruta_lives_5',type:'consumable'},monthly:{store_identifier:'viruta_plus_monthly',type:'subscription'}}};}
function fixture(){
  const data=new Map();let generation=0,providerCalls=0,currentTime=now;const versions=new Map();
  const snapshot=key=>({exists:data.has(key),data:()=>structuredClone(data.get(key)),ref:ref(key)});
  function ref(path){return {path,get:async()=>snapshot(path),set:async v=>{data.set(path,structuredClone(v));versions.set(path,++generation);}};}
  const db={doc:ref,collection:path=>({path,collection:true}),runTransaction:async fn=>{
    for(let n=0;n<20;n++){
      const reads=new Map(),writes=[];const result=await fn({get:async target=>{
        if(target.collection)return {docs:[...data.keys()].filter(k=>k.startsWith(target.path+'/')).map(k=>{reads.set(k,versions.get(k)||0);return snapshot(k);})};
        reads.set(target.path,versions.get(target.path)||0);return snapshot(target.path);
      },set:(target,value)=>writes.push([target.path,value]),delete:target=>writes.push([target.path,undefined])});
      if([...reads].some(([k,v])=>(versions.get(k)||0)!==v))continue;
      for(const [k,v] of writes){if(v===undefined)data.delete(k);else data.set(k,structuredClone(v));versions.set(k,++generation);}return result;
    }throw Error('contention');
  },recursiveDelete:async target=>{for(const key of data.keys())if(key.startsWith(target.path+'/')){data.delete(key);versions.set(key,++generation);}},batch:()=>{const deletes=[];return {delete:r=>deletes.push(r.path),commit:async()=>deletes.forEach(k=>{data.delete(k);versions.set(k,++generation);})};}};
  let source=parseProviderSnapshot(input());
  const auth={getUser:async uid=>({uid,emailVerified:true}),verifyIdToken:async token=>({uid:token,email_verified:true})};
  const provider={snapshot:async()=>{providerCalls++;return source;},deleteCustomer:async()=>true};
  const service=createBillingService({db,auth,provider,serverTimestamp:()=>currentTime,now:()=>currentTime});
  return {data,db,auth,provider,service,set source(v){source=v;},get providerCalls(){return providerCalls;},get currentTime(){return currentTime;},set currentTime(value){currentTime=value;}};
}
async function finishCleanup(f,uid='A'){
  await assert.rejects(f.service.cleanup(uid),{code:'billing/deletion-pending'});
  f.currentTime+=DELETE_CONFIRM_DELAY_MS;await f.service.cleanup(uid);
}
test('canonical SKU, environment and original UID gate subscription and consumables',()=>{
  const x=input(),s=parseProviderSnapshot(x);assert.equal(s.premiumUntilMs,now+10000);assert.equal(s.purchases[0].lives,5);
  x.purchases[0].environment='sandbox';assert.equal(parseProviderSnapshot(x).purchases.length,0);
  x.subscriptions[0].environment='sandbox';assert.equal(parseProviderSnapshot(x).premiumUntilMs,0);
  x.customer.subscriber.original_app_user_id='B';assert.throws(()=>parseProviderSnapshot(x),{code:'billing/identity-conflict'});
});
test('cancel auto-renew retains access; refund and missing entitlement revoke it',()=>{
  const x=input();x.customer.subscriber.subscriptions.viruta_plus_monthly.unsubscribe_detected_at=iso(now);assert.equal(parseProviderSnapshot(x).premiumUntilMs,now+10000);
  x.customer.subscriber.subscriptions.viruta_plus_monthly.refunded_at=iso(now);assert.equal(parseProviderSnapshot(x).premiumUntilMs,0);
  x.customer.subscriber.subscriptions.viruta_plus_monthly.refunded_at=null;x.subscriptions[0].entitlements.items=[];assert.equal(parseProviderSnapshot(x).premiumUntilMs,0);
});
test('pending/unpaid, unknown product and family shared subscriptions never grant',()=>{
  const x=input();x.purchases[0].status='pending';x.subscriptions[0].ownership='family_shared';
  const s=parseProviderSnapshot(x);assert.equal(s.premiumUntilMs,0);assert.equal(reconcileCommerce(null,s).commerce.paidLives,0);
  x.products.prod.store_identifier='not_our_product';assert.equal(parseProviderSnapshot(x).purchases.length,0);
});
test('ledger is idempotent, handles refund after spend as debt and does not reset consumed',()=>{
  const s=parseProviderSnapshot(input()),first=reconcileCommerce(null,s);
  const used={...first.commerce,paidConsumed:3,paidLives:2};
  assert.equal(reconcileCommerce(used,s,first.ledger).commerce.paidLives,2);
  const refunded=reconcileCommerce(used,{...s,purchases:s.purchases.map(p=>({...p,active:false}))},first.ledger);
  assert.equal(refunded.commerce.paidGranted,0);assert.equal(refunded.commerce.paidConsumed,3);assert.equal(refunded.commerce.paidLives,0);
  const repurchase=reconcileCommerce(refunded.commerce,{...s,purchases:[{...s.purchases[0],key:'new'}]},refunded.ledger);
  assert.equal(repurchase.commerce.paidLives,2);
});
test('webhook checks raw bytes, timestamp and constant-length signature; malformed signature fails safely',()=>{
  const raw=Buffer.from('{"event":{}}'),secret='secret-'.repeat(8),t=Math.floor(now/1000),sig=createHmac('sha256',secret).update(t+'.').update(raw).digest('hex');
  assert.equal(verifyWebhook(raw,`t=${t},v1=${sig}`,secret,now),true);
  assert.equal(verifyWebhook(Buffer.from('{}'),`t=${t},v1=${sig}`,secret,now),false);
  assert.equal(verifyWebhook(raw,`t=${t},v1=x`,secret,now),false);assert.equal(verifyWebhook(raw,`t=${t},v1=${sig}`,secret,now+301000),false);
});
test('authenticated sync cannot choose a different UID and rechecks verified current Auth user',async()=>{
  const f=fixture();assert.equal(await f.service.authenticate('Bearer A'),'A');
  await assert.rejects(f.service.authenticate(''),{code:'billing/unauthenticated'});
  f.auth.getUser=async()=>({emailVerified:false});await assert.rejects(f.service.authenticate('Bearer A'),{code:'billing/verification-required'});
  f.auth.getUser=async()=>{throw Error('deleted');};await assert.rejects(f.service.authenticate('Bearer A'),{code:'billing/unauthenticated'});
});
test('repeated and simultaneous server sync credit the same transaction only once',async()=>{
  const f=fixture();await Promise.allSettled([f.service.sync('A'),f.service.sync('A')]);await f.service.sync('A');
  assert.equal(f.data.get('users/A/commerce/main').paidLives,5);
  assert.equal([...f.data.keys()].filter(k=>k.startsWith('billingTransactions/')).length,1);
});
test('same purchase cannot credit another UID, including transfer or restore',async()=>{
  const f=fixture();await f.service.sync('A');await assert.rejects(f.service.sync('B'),{code:'billing/identity-conflict'});
  assert.equal(f.data.has('users/B/commerce/main'),false);
});
test('delayed snapshot cannot overwrite newer refund, marker wins during network request',async()=>{
  const f=fixture();await f.service.sync('A');let release,begun;const began=new Promise(r=>begun=r),old=parseProviderSnapshot(input());
  f.provider.snapshot=()=>{begun();return new Promise(r=>release=r);};const slow=f.service.sync('A');await began;
  f.provider.snapshot=async()=>({...old,purchases:[]});await f.service.sync('A');release(old);await assert.rejects(slow,{code:'billing/sync-superseded'});
  assert.equal(f.data.get('users/A/commerce/main').paidLives,0);
  f.data.set('accountDeletions/A',{deletedAt:now});await assert.rejects(f.service.sync('A'),{code:'account/deletion-pending'});
});
test('cleanup removes private commerce, retains non-replay transaction tombstone and other UID',async()=>{
  const f=fixture();await f.service.sync('A');f.data.set('users/B/commerce/main',emptyCommerce());
  await assert.rejects(f.service.cleanup('A'),{code:'account/deletion-marker-required'});
  f.data.set('accountDeletions/A',{});await finishCleanup(f);await finishCleanup(f);
  assert.equal([...f.data.keys()].some(k=>k.startsWith('users/A/commerce')),false);assert.equal(f.data.has('users/B/commerce/main'),true);
  assert.ok([...f.data.keys()].some(k=>k.startsWith('billingTransactions/')));
});
test('REST adapter refuses external pagination before sending secret, and provider errors do not grant',async()=>{
  let calls=0;const rc=createRevenueCat({secret:'secret',publicKey:'rcb_fixture',projectId:'project',fetchImpl:async()=>{calls++;return {ok:true,json:async()=>calls===1?input().customer:{items:[],next_page:'https://evil.invalid/page'}};}});
  await assert.rejects(rc.snapshot('A'),{code:'billing/provider-unavailable'});assert.equal(calls,2);
});
test('superseded refund webhook cannot seal a receipt when a newer sync fails',async()=>{
  const f=fixture();await f.service.sync('A');let release,begun;const began=new Promise(r=>begun=r),old=parseProviderSnapshot(input());
  const event={id:'refund-event',type:'CANCELLATION',app_user_id:'A'};const raw=Buffer.from(JSON.stringify({event})),secret='long-signing-secret-for-unit-tests',t=Math.floor(now/1000);
  const signature=`t=${t},v1=${createHmac('sha256',secret).update(t+'.').update(raw).digest('hex')}`;
  f.provider.snapshot=()=>{begun();return new Promise(r=>release=r);};const webhook=f.service.webhook({raw,secret,signature});await began;
  f.provider.snapshot=async()=>{throw Object.assign(Error('outage'),{code:'billing/provider-unavailable',status:503});};await assert.rejects(f.service.sync('A'));
  release({...old,purchases:[],premiumUntilMs:0});await assert.rejects(webhook,{code:'billing/sync-superseded'});
  assert.equal([...f.data.keys()].some(k=>k.startsWith('billingWebhookEvents/')),false);
  f.provider.snapshot=async()=>({...old,purchases:[],premiumUntilMs:0});await f.service.webhook({raw,secret,signature});
  assert.equal(f.data.get('users/A/commerce/main').paidLives,0);assert.equal(f.data.get('users/A/commerce/main').premiumUntilMs,0);
  const calls=f.providerCalls;await f.service.webhook({raw,secret,signature});assert.equal(f.providerCalls,calls);
});
test('provider delete uses only cleanup v2 secret, accepts404, and retries failures after local cleanup',async()=>{
  let calls=0;const provider=createRevenueCat({cleanupSecret:'private-cleanup-v2',projectId:'project',fetchImpl:async(url,options)=>{calls++;assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer private-cleanup-v2');assert.equal(new URL(url).pathname,'/v2/projects/project/customers/A');return {ok:false,status:404};}});
  await provider.deleteCustomer('A');await provider.deleteCustomer('A');assert.equal(calls,2);
  const f=fixture();await f.service.sync('A');f.data.set('accountDeletions/A',{});let tries=0;
  f.provider.deleteCustomer=async()=>{if(++tries===1)throw Error('provider unavailable');};
  await assert.rejects(f.service.cleanup('A'));assert.equal(f.data.has('users/A/commerce/main'),false);await finishCleanup(f);assert.equal(tries,3);assert.equal(f.data.has('accountDeletions/A'),true);
});
test('201st legitimate purchase is credited without an arbitrary history ceiling',()=>{
  const x=input();x.purchases=Array.from({length:201},(_,i)=>({...x.purchases[0],store_purchase_identifier:'GPA.'+i}));
  assert.equal(reconcileCommerce(null,parseProviderSnapshot(x)).commerce.paidLives,1005);
});

function addWeb(x,{environment='production',expiry=now+20000,status='owned'}={}){
  x.subscriptions.push({...structuredClone(x.subscriptions[0]),id:'subWeb',product_id:'monthlyWeb',store:'rc_billing',environment,current_period_ends_at:expiry});
  x.purchases.push({...x.purchases[0],id:'purchaseWeb',product_id:'prodWeb',store:'rc_billing',store_purchase_identifier:'txRcb123',environment,status});
  x.products.monthlyWeb={store_identifier:'viruta_plus_monthly',type:'subscription'};
  x.products.prodWeb={store_identifier:'viruta_lives_5',type:'one_time',one_time:{is_consumable:true}};
  return x;
}
test('web and native purchases share a wallet; repeated sync and web refund retain native balance',async()=>{
  const x=addWeb(input()),f=fixture();f.source=parseProviderSnapshot(x);
  let wallet=await f.service.sync('A');assert.equal(wallet.paidLives,10);assert.equal(wallet.store,'rc_billing');assert.equal(wallet.premiumUntilMs,now+20000);
  f.data.set('users/A/commerce/main',{...wallet,paidConsumed:3,paidLives:7});
  wallet=await f.service.sync('A');assert.equal(wallet.paidLives,7);
  x.purchases[1].status='refunded';x.subscriptions[1].gives_access=false;f.source=parseProviderSnapshot(x);
  wallet=await f.service.sync('A');assert.equal(wallet.paidGranted,5);assert.equal(wallet.paidConsumed,3);assert.equal(wallet.paidLives,2);assert.equal(wallet.store,'play_store');assert.equal(wallet.premiumUntilMs,now+10000);
  assert.equal([...f.data.keys()].filter(k=>k.startsWith('billingTransactions/')).length,2);
});
test('the same SKU in another store or sandbox cannot overwrite a production entitlement',()=>{
  const x=addWeb(input(),{environment:'sandbox',expiry:now+50000});
  x.customer.subscriber.subscriptions.viruta_plus_monthly={store:'rc_billing',is_sandbox:true,refunded_at:iso(now)};
  const live=parseProviderSnapshot(x);assert.equal(live.store,'play_store');assert.equal(live.premiumUntilMs,now+10000);assert.equal(live.purchases.length,1);
  x.customer.subscriber.subscriptions.viruta_plus_monthly.refunded_at=null;
  const sandbox=parseProviderSnapshot({...x,environment:'sandbox'});assert.equal(sandbox.store,'rc_billing');assert.equal(sandbox.purchases.length,1);
  assert.throws(()=>reconcileCommerce(reconcileCommerce(null,live).commerce,sandbox),{code:'billing/environment-conflict'});
});
test('Apple, Google and Web Billing each remain eligible; direct Stripe Billing and test store do not',()=>{
  for(const store of ['app_store','play_store','rc_billing']){
    const x=input();x.subscriptions[0].store=store;x.purchases[0].store=store;
    assert.equal(parseProviderSnapshot(x).store,store);assert.equal(parseProviderSnapshot(x).purchases.length,1);
  }
  for(const store of ['stripe','test_store','promotional','external']){
    const x=input();x.subscriptions[0].store=store;x.purchases[0].store=store;
    const snapshot=parseProviderSnapshot(x);assert.equal(snapshot.premiumUntilMs,0);assert.equal(snapshot.purchases.length,0);
  }
});
test('web identity transfer, nonconsumable lives and unconfirmed access cannot grant benefits',()=>{
  const x=addWeb(input());x.subscriptions[1].original_customer_id='B';assert.throws(()=>parseProviderSnapshot(x),{code:'billing/identity-conflict'});
  x.subscriptions[1].original_customer_id='A';x.purchases[1].original_customer_id='B';assert.throws(()=>parseProviderSnapshot(x),{code:'billing/identity-conflict'});
  x.purchases[1].original_customer_id='A';x.products.prodWeb.one_time.is_consumable=false;assert.throws(()=>parseProviderSnapshot(x),{code:'billing/configuration'});
  x.products.prodWeb.one_time.is_consumable=true;x.subscriptions[1].gives_access=false;x.purchases[1].status='pending';
  const wallet=reconcileCommerce(null,parseProviderSnapshot(x)).commerce;assert.equal(wallet.paidLives,5);assert.equal(wallet.premiumUntilMs,now+10000);
});
test('verified grace extends only the matching store and environment, cancellation does not end a paid period',()=>{
  const x=input();x.subscriptions[0].status='in_grace_period';x.subscriptions[0].current_period_ends_at=now-1000;
  x.customer.subscriber.subscriptions.viruta_plus_monthly.grace_period_expires_date=iso(now+8000);
  assert.equal(parseProviderSnapshot(x).premiumUntilMs,now+8000);
  x.customer.subscriber.subscriptions.viruta_plus_monthly.store='rc_billing';assert.equal(parseProviderSnapshot(x).premiumUntilMs,now-1000);
  x.subscriptions[0].gives_access=false;assert.equal(parseProviderSnapshot(x).premiumUntilMs,0);
  x.subscriptions[0].gives_access=true;x.subscriptions[0].status='active';x.subscriptions[0].auto_renewal_status='will_not_renew';x.subscriptions[0].current_period_ends_at=now+10000;
  assert.equal(parseProviderSnapshot(x).premiumUntilMs,now+10000);
});
test('REST adapter verifies every page of cross-store purchases, subscriptions and linked entitlements',async()=>{
  const x=addWeb(input()),calls=[],base='/v2/projects/project',customers=base+'/customers/A';
  const web=structuredClone(x.subscriptions[1]);web.entitlements={items:[{lookup_key:'unrelated'}],next_page:base+'/subscriptions/subWeb/entitlements?starting_after=other'};
  const responses=new Map([
    ['/v1/subscribers/A',x.customer],
    [customers+'/purchases?limit=100',{items:[x.purchases[0]],next_page:customers+'/purchases?starting_after=purchase1'}],
    [customers+'/purchases?starting_after=purchase1',{items:[x.purchases[1]],next_page:null}],
    [customers+'/subscriptions?limit=100',{items:[x.subscriptions[0]],next_page:customers+'/subscriptions?starting_after=sub1'}],
    [customers+'/subscriptions?starting_after=sub1',{items:[web],next_page:null}],
    [base+'/subscriptions/subWeb/entitlements?starting_after=other',{items:[{lookup_key:'viruta_plus'}],next_page:null}],
    ...Object.entries(x.products).map(([id,product])=>[base+'/products/'+id,product]),
  ]);
  const provider=createRevenueCat({secret:'private-v2',publicKey:'rcb_fixture',projectId:'project',now:()=>now,fetchImpl:async(url,options)=>{
    const key=url.pathname+url.search;calls.push(key);assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,key.startsWith('/v1/')?'Bearer rcb_fixture':'Bearer private-v2');assert.ok(responses.has(key),key);
    return {ok:true,json:async()=>structuredClone(responses.get(key))};
  }});
  const snapshot=await provider.snapshot('A');assert.equal(snapshot.store,'rc_billing');assert.equal(snapshot.premiumUntilMs,now+20000);assert.equal(snapshot.purchases.length,2);assert.equal(calls.length,10);
});
test('missing or external subscription pages fail without erasing the existing wallet',async()=>{
  for(const nextPage of ['https://example.invalid/subscriptions',undefined]){
    let calls=0;const rc=createRevenueCat({secret:'v2',publicKey:'rcb_fixture',projectId:'project',fetchImpl:async url=>{
      calls++;return {ok:true,json:async()=>url.pathname.startsWith('/v1/')?input().customer:url.pathname.endsWith('/purchases')?{items:[],next_page:null}:{items:[],next_page:nextPage}};
    }});
    const f=fixture();await f.service.sync('A');f.provider.snapshot=uid=>rc.snapshot(uid);
    await assert.rejects(f.service.sync('A'),{code:'billing/provider-unavailable'});assert.equal(f.data.get('users/A/commerce/main').paidLives,5);assert.equal(calls,3);
  }
});
test('web domain allowlist remains exact and sandbox cannot run against live Firebase outside emulators',()=>{
  for(const origin of ['https://ochavo.app','https://www.ochavo.app','https://brote-62d26.web.app'])assert.equal(BILLING_ORIGINS.has(origin),true);
  for(const origin of ['http://ochavo.app','https://ochavo.app.evil.invalid','https://evil.ochavo.app','null'])assert.equal(BILLING_ORIGINS.has(origin),false);
  assert.doesNotThrow(()=>assertBillingEnvironment({firebaseProjectId:'brote-62d26',environment:'production'}));
  assert.throws(()=>assertBillingEnvironment({firebaseProjectId:'brote-62d26',environment:'sandbox'}),{code:'billing/environment-conflict'});
  assert.doesNotThrow(()=>assertBillingEnvironment({firebaseProjectId:'brote-62d26',environment:'sandbox',emulator:true}));
  assert.doesNotThrow(()=>assertBillingEnvironment({firebaseProjectId:'ochavo-isolated-test',environment:'sandbox'}));
});
test('sandbox allows only this test project Hosting domains and emulator-only local development',()=>{
  const project='ochavo-isolated-test',sandbox=billingOrigins({firebaseProjectId:project,environment:'sandbox'});
  for(const domain of ['web.app','firebaseapp.com'])assert.equal(sandbox.has(`https://${project}.${domain}`),true);
  for(const origin of ['https://other-test.web.app','https://ochavo-isolated-test.web.app.evil.invalid','https://ochavo-isolated-test.web.app:443','http://ochavo-isolated-test.web.app','http://localhost:5173','http://127.0.0.1:5173'])assert.equal(sandbox.has(origin),false);
  const live=billingOrigins({firebaseProjectId:project,environment:'production'});assert.deepEqual(live,BILLING_ORIGINS);
  const emulator=billingOrigins({firebaseProjectId:project,environment:'sandbox',emulator:true});
  assert.equal(emulator.has('http://localhost:5173'),true);assert.equal(emulator.has('http://127.0.0.1:5173'),true);
  for(const origin of ['http://localhost:3000','http://127.0.0.2:5173','http://user@localhost:5173','http://localhost:5173/','null'])assert.equal(emulator.has(origin),false);
  assert.equal(billingOrigins({emulator:'true'}).has('http://localhost:5173'),false);
});
test('invalid or untrusted project identifiers cannot add a CORS origin',()=>{
  for(const firebaseProjectId of [undefined,null,'','short','UPPERCASE','x'.repeat(31),'-ochavo','ochavo-','*.web.app','ochavo.test','ochavo/path','https://ochavo','user@ochavo','ochavo:443','ochavo?x=1','ochavo#fragment']){
    assert.deepEqual(billingOrigins({firebaseProjectId,environment:'sandbox'}),BILLING_ORIGINS,String(firebaseProjectId));
  }
  assert.deepEqual(billingOrigins({firebaseProjectId:'brote-62d26',environment:'sandbox'}),BILLING_ORIGINS);
});

function addGems(x,{productId='fixture_gems_250',gems=250,quantity=1,store='rc_billing',environment='production',transaction='gem-transaction-1',status='owned'}={}){
  x.gemPacks=[...(x.gemPacks||[]).filter(pack=>pack.productId!==productId),{productId,gems}];
  const rcId='rc_'+productId;
  x.products[rcId]={store_identifier:productId,type:store==='rc_billing'?'one_time':'consumable',one_time:{is_consumable:true}};
  x.purchases.push({...x.purchases[0],product_id:rcId,store,environment,quantity,status,store_purchase_identifier:transaction});
  return x;
}

test('gem catalog is server configuration, starts disabled and rejects ambiguous or invalid benefits',()=>{
  assert.deepEqual(validateGemPacks(),[]);assert.deepEqual(validateGemPacks('[]'),[]);
  assert.deepEqual(validateGemPacks('[{"productId":"fixture_gems_250","gems":250}]'),[{productId:'fixture_gems_250',gems:250}]);
  for(const invalid of ['invalid','{}',null,[{productId:'viruta_lives_5',gems:250}],[{productId:'viruta_plus_monthly',gems:250}],[{productId:'../outside',gems:250}],[{productId:'a',gems:0}],[{productId:'a',gems:-1}],[{productId:'a',gems:2.5}],[{productId:'a',gems:1000001}],[{productId:'a',gems:250,price:1}],[{productId:'a',gems:250},{productId:'a',gems:500}]])assert.throws(()=>validateGemPacks(invalid),{code:'billing/configuration'});
  const x=addGems(input());x.gemPacks=[];
  const snapshot=parseProviderSnapshot(x);assert.equal(snapshot.purchases.length,1);assert.deepEqual(snapshot.gemProducts,[]);
});

test('verified consumable gems use configured benefits and quantity for each store, never provider metadata',()=>{
  for(const store of ['play_store','app_store','rc_billing']){
    const x=addGems(input(),{store,quantity:2});x.purchases[1].gems=999999;x.products.rc_fixture_gems_250.gems=999999;
    const snapshot=parseProviderSnapshot(x),purchase=snapshot.purchases[1];
    assert.equal(purchase.gems,500);assert.equal(purchase.lives,0);assert.equal(purchase.productId,'fixture_gems_250');assert.equal(purchase.quantity,2);
    const lives=reconcileCommerce(null,snapshot);assert.equal(lives.commerce.paidLives,5);assert.equal(reconcileGemCommerce(null,snapshot,lives.ledger).balance,500);
    x.purchases[1].status='pending';const pending=parseProviderSnapshot(x);assert.equal(reconcileGemCommerce(null,pending,reconcileCommerce(null,pending).ledger).balance,0);
    x.purchases[1].status='owned';x.purchases[1].environment='sandbox';assert.equal(parseProviderSnapshot(x).purchases.length,1);
    x.purchases[1].environment='production';x.products.rc_fixture_gems_250.type='subscription';assert.throws(()=>parseProviderSnapshot(x),{code:'billing/configuration'});
  }
});

test('gem ownership, invalid transaction quantity and duplicate transaction benefits fail closed',()=>{
  for(const values of [{quantity:0},{quantity:101},{quantity:1.2},{purchased_at:-1},{purchased_at:now+300001},{store_purchase_identifier:''}]){
    const x=addGems(input());Object.assign(x.purchases[1],values);assert.throws(()=>parseProviderSnapshot(x),{code:'billing/provider-unavailable'});
  }
  const x=addGems(input());x.purchases[1].original_customer_id='B';assert.throws(()=>parseProviderSnapshot(x),{code:'billing/identity-conflict'});
  x.purchases[1].original_customer_id='A';x.purchases[1].store='play_store';x.purchases[1].store_purchase_identifier=x.purchases[0].store_purchase_identifier;
  assert.throws(()=>parseProviderSnapshot(x),{code:'billing/provider-unavailable'});
});

test('mixed purchase sync returns separate gems, preserving legacy Plus, lives and earned gems',async()=>{
  const f=fixture(),x=addGems(input());f.source=parseProviderSnapshot(x);f.data.set('users/A/game/main',{gems:200});
  const result=await f.service.syncBalances('A');
  assert.equal(result.commerce.paidLives,5);assert.equal(result.commerce.premiumUntilMs,now+10000);assert.equal(result.gems.balance,250);
  assert.deepEqual(result.gemProducts,[{productId:'fixture_gems_250',gems:250}]);
  assert.deepEqual(result.gemGrants,[{productId:'fixture_gems_250',granted:250}]);
  assert.equal(f.data.get('users/A/game/main').gems,200);
  assert.equal(f.data.get('users/A/commerce/main').gems,undefined);
  assert.equal(f.data.get('users/A/commerceGems/main').granted,250);
  assert.equal((await f.service.sync('A')).paidLives,5); // Internal callers retain their existing API.
});

test('gem retries, restores and concurrent syncs cannot mint the same transaction twice',async()=>{
  const f=fixture();f.source=parseProviderSnapshot(addGems(input(),{quantity:2}));
  await Promise.allSettled([f.service.syncBalances('A'),f.service.syncBalances('A')]);
  const first=await f.service.syncBalances('A');assert.equal(first.gems.granted,500);
  await f.db.doc('users/A/commerceGems/main').set({...first.gems,consumed:230,balance:270});
  const restored=await f.service.syncBalances('A');assert.equal(restored.gems.granted,500);assert.equal(restored.gems.consumed,230);assert.equal(restored.gems.balance,270);
  assert.equal([...f.data.keys()].filter(key=>key.startsWith('billingTransactions/')).length,2);
  await assert.rejects(f.service.syncBalances('B'),{code:'billing/identity-conflict'});assert.equal(f.data.has('users/B/commerceGems/main'),false);
});

test('gem refunds preserve spent debt and earned rewards; future purchases do not erase debt',async()=>{
  const f=fixture(),x=addGems(input());f.source=parseProviderSnapshot(x);f.data.set('users/A/game/main',{gems:700});
  const first=await f.service.syncBalances('A');await f.db.doc('users/A/commerceGems/main').set({...first.gems,consumed:200,balance:50});
  x.purchases[1].status='refunded';f.source=parseProviderSnapshot(x);
  const refunded=await f.service.syncBalances('A');assert.equal(refunded.gems.granted,0);assert.equal(refunded.gems.consumed,200);assert.equal(refunded.gems.balance,0);
  addGems(x,{transaction:'gem-transaction-2'});f.source=parseProviderSnapshot(x);
  const purchasedAgain=await f.service.syncBalances('A');assert.equal(purchasedAgain.gems.granted,250);assert.equal(purchasedAgain.gems.consumed,200);assert.equal(purchasedAgain.gems.balance,50);
  assert.equal(purchasedAgain.commerce.paidLives,5);assert.equal(f.data.get('users/A/game/main').gems,700);
});

test('retired or edited sold gem packages cannot silently revoke or increase previous benefits',async()=>{
  const f=fixture(),x=addGems(input());f.source=parseProviderSnapshot(x);await f.service.syncBalances('A');
  x.gemPacks=[];f.source=parseProviderSnapshot(x);await assert.rejects(f.service.syncBalances('A'),{code:'billing/configuration'});
  assert.equal(f.data.get('users/A/commerceGems/main').granted,250);
  x.gemPacks=[{productId:'fixture_gems_250',gems:500}];f.source=parseProviderSnapshot(x);await assert.rejects(f.service.syncBalances('A'),{code:'billing/invalid-ledger'});
  assert.equal(f.data.get('users/A/commerceGems/main').granted,250);
  x.purchases=x.purchases.slice(0,1);f.source=parseProviderSnapshot(x);await assert.rejects(f.service.syncBalances('A'),{code:'billing/configuration'});
  assert.equal(f.data.get('users/A/commerce/main').paidLives,5);
});

test('gem consumption during provider lookup is retained and older snapshots cannot reverse a refund',async()=>{
  const f=fixture(),source=parseProviderSnapshot(addGems(input()));f.source=source;
  const first=await f.service.syncBalances('A');let resolve,begun;const ready=new Promise(r=>begun=r);
  f.provider.snapshot=()=>{begun();return new Promise(r=>resolve=r);};const pending=f.service.syncBalances('A');await ready;
  await f.db.doc('users/A/commerceGems/main').set({...first.gems,consumed:200,balance:50});resolve(source);
  assert.equal((await pending).gems.balance,50);
  let release,start;const started=new Promise(r=>start=r);f.provider.snapshot=()=>{start();return new Promise(r=>release=r);};const old=f.service.syncBalances('A');await started;
  f.provider.snapshot=async()=>({...source,purchases:source.purchases.map(p=>p.gems?{...p,active:false}:p)});await f.service.syncBalances('A');release(source);
  await assert.rejects(old,{code:'billing/sync-superseded'});assert.equal(f.data.get('users/A/commerceGems/main').balance,0);
});

test('deletion wins during gem verification and cleanup retains global non-replay ownership',async()=>{
  const f=fixture(),source=parseProviderSnapshot(addGems(input()));f.source=source;await f.service.syncBalances('A');
  let release,start;const started=new Promise(r=>start=r);f.provider.snapshot=()=>{start();return new Promise(r=>release=r);};const pending=f.service.syncBalances('A');await started;
  f.data.set('accountDeletions/A',{});release(source);await assert.rejects(pending,{code:'account/deletion-pending'});
  await finishCleanup(f);await finishCleanup(f);assert.equal(f.data.has('users/A/commerceGems/main'),false);
  assert.equal([...f.data.keys()].filter(key=>key.startsWith('billingTransactions/')).length,2);
});

test('sandbox gems and malformed balances cannot contaminate a production wallet',()=>{
  const live=parseProviderSnapshot(addGems(input())),ledger=reconcileCommerce(null,live).ledger;
  const gems=reconcileGemCommerce(null,live,ledger);
  assert.throws(()=>reconcileGemCommerce(gems,{...live,environment:'sandbox'},ledger),{code:'billing/environment-conflict'});
  for(const changes of [{consumed:-1},{balance:251},{revision:1.5},{schemaVersion:2},{granted:NaN}])assert.throws(()=>reconcileGemCommerce({...gems,...changes},live,ledger),{code:'billing/invalid-ledger'});
  assert.deepEqual(reconcileGemCommerce(null,{...live,gemProducts:[]},[]),{...emptyGemCommerce(),revision:1});
});

test('gem refund webhooks use the provider snapshot once and never event-supplied quantities',async()=>{
  const f=fixture(),x=addGems(input());f.source=parseProviderSnapshot(x);await f.service.syncBalances('A');
  x.purchases[1].status='refunded';f.source=parseProviderSnapshot(x);
  const event={id:'gems-refund',type:'CANCELLATION',app_user_id:'A',gems:999999},raw=Buffer.from(JSON.stringify({event})),secret='long-signing-secret-for-unit-tests',t=Math.floor(now/1000);
  const signature=`t=${t},v1=${createHmac('sha256',secret).update(t+'.').update(raw).digest('hex')}`;
  await f.service.webhook({raw,secret,signature});assert.equal(f.data.get('users/A/commerceGems/main').balance,0);
  const calls=f.providerCalls;await f.service.webhook({raw,secret,signature});assert.equal(f.providerCalls,calls);
});

test('confirmed gem catalog example has the approved immutable package benefits',()=>{
  const catalog=validateGemPacks(readFileSync(new URL('../gem-packs.example.json',import.meta.url),'utf8'));
  assert.deepEqual(catalog,[{productId:'ochavo_gems_200',gems:200},{productId:'ochavo_gems_600',gems:600},{productId:'ochavo_gems_1500',gems:1500}]);
  const x=input();for(const pack of catalog)addGems(x,{...pack,transaction:pack.productId});
  const snapshot=parseProviderSnapshot(x),lives=reconcileCommerce(null,snapshot);
  assert.equal(lives.commerce.paidLives,5);assert.equal(reconcileGemCommerce(null,snapshot,lives.ledger).granted,2300);
});

test('REST adapter forwards server gem catalog and verifies store product type before granting',async()=>{
  const x=addGems(input(),{productId:'ochavo_gems_200',gems:200}),base='/v2/projects/project',customer=base+'/customers/A';
  const values=new Map([
    ['/v1/subscribers/A',x.customer],[customer+'/purchases',{items:x.purchases,next_page:null}],
    [customer+'/subscriptions',{items:x.subscriptions,next_page:null}],
    ...Object.entries(x.products).map(([id,product])=>[base+'/products/'+id,product]),
  ]);
  const provider=createRevenueCat({secret:'v2',publicKey:'rcb_fixture',projectId:'project',gemPacks:x.gemPacks,now:()=>now,fetchImpl:async url=>{
    assert.ok(values.has(url.pathname));return {ok:true,json:async()=>structuredClone(values.get(url.pathname))};
  }});
  const snapshot=await provider.snapshot('A');assert.equal(snapshot.purchases.find(p=>p.gems).gems,200);
  values.set(base+'/products/rc_ochavo_gems_200',{store_identifier:'ochavo_gems_200',type:'non_consumable'});
  await assert.rejects(provider.snapshot('A'),{code:'billing/configuration'});
});

test('RevenueCat HMAC retry signs the same raw event with a fresh delivery timestamp',()=>{
  const raw=Buffer.from('{"event":{"id":"unchanged-event","event_timestamp_ms":1801656000000}}'),secret='long-signing-secret-for-unit-tests';
  const sign=timestamp=>`t=${timestamp},v1=${createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex')}`;
  assert.equal(verifyWebhook(raw,sign(Math.floor(now/1000)),secret,now+600000),false);
  assert.equal(verifyWebhook(raw,sign(Math.floor((now+600000)/1000)),secret,now+600000),true);
});

test('server gem grants are per configured SKU, exclude refunded receipts and cannot be advanced by another pack',async()=>{
  const f=fixture(),x=addGems(input(),{productId:'ochavo_gems_200',gems:200});
  x.gemPacks.push({productId:'ochavo_gems_600',gems:600});f.source=parseProviderSnapshot(x);
  let result=await f.service.syncBalances('A');assert.deepEqual(result.gemGrants,[{productId:'ochavo_gems_200',granted:200},{productId:'ochavo_gems_600',granted:0}]);
  addGems(x,{productId:'ochavo_gems_600',gems:600,transaction:'gem-600'});f.source=parseProviderSnapshot(x);
  result=await f.service.syncBalances('A');assert.deepEqual(result.gemGrants,[{productId:'ochavo_gems_200',granted:200},{productId:'ochavo_gems_600',granted:600}]);
  x.purchases[1].status='refunded';f.source=parseProviderSnapshot(x);
  result=await f.service.syncBalances('A');assert.deepEqual(result.gemGrants,[{productId:'ochavo_gems_200',granted:0},{productId:'ochavo_gems_600',granted:600}]);
  assert.equal(result.gems.granted,600);
});

test('sync request accepts only a bounded exact receipt selector, never client amounts or identity',()=>{
  const purchase={productId:'ochavo_gems_200',transactionId:'txRcb123',store:'rc_billing'};
  assert.equal(parseSyncRequest({action:'sync'}),null);
  assert.deepEqual(parseSyncRequest({action:'sync',purchase}),purchase);
  for(const body of [null,[],{action:'buy'},{action:'sync',uid:'B'},{action:'sync',gems:200},{action:'sync',purchase:null},{action:'sync',purchase:{...purchase,gems:200}}])assert.throws(()=>parseSyncRequest(body),{code:'billing/invalid-request'});
  for(const changes of [{transactionId:''},{transactionId:'x'.repeat(256)},{transactionId:'tx\n123'},{transactionId:' tx123'},{store:'stripe'},{store:'test_store'},{productId:'viruta_plus_monthly'},{productId:'../other'}])assert.throws(()=>validatePurchaseSelector({...purchase,...changes}),{code:'billing/invalid-request'});
});

test('receipt confirmation is exact across all allowed stores and never writes raw transaction IDs',async()=>{
  for(const store of ['rc_billing','app_store','play_store']){
    const f=fixture(),purchase={productId:'ochavo_gems_200',transactionId:'receipt-'+store,store};
    f.source=parseProviderSnapshot(addGems(input(),{productId:purchase.productId,gems:200,transaction:purchase.transactionId,store}));
    let result=await f.service.syncBalances('A',purchase);
    assert.deepEqual(result.purchaseConfirmation,{...purchase,confirmed:true,status:'confirmed'});assert.equal(result.gems.balance,200);
    result=await f.service.syncBalances('A',purchase);assert.equal(result.gems.balance,200);assert.equal(result.purchaseConfirmation.confirmed,true);
    assert.equal(JSON.stringify([...f.data.values()]).includes(purchase.transactionId),false);
    assert.equal((await f.service.syncBalances('A')).purchaseConfirmation,undefined);
  }
});

test('another transaction of the same SKU or another SKU cannot confirm a pending purchase',async()=>{
  const f=fixture(),x=addGems(input(),{productId:'ochavo_gems_200',gems:200,transaction:'other-purchase'});
  addGems(x,{productId:'ochavo_gems_600',gems:600,transaction:'different-pack'});f.source=parseProviderSnapshot(x);
  const purchase={productId:'ochavo_gems_200',transactionId:'still-pending',store:'rc_billing'};
  const result=await f.service.syncBalances('A',purchase);
  assert.equal(result.gems.balance,800);assert.deepEqual(result.purchaseConfirmation,{...purchase,confirmed:false,status:'pending'});
});

test('a new receipt confirms when simultaneous refund of the same SKU keeps its net grant unchanged',async()=>{
  const f=fixture(),x=addGems(input(),{productId:'ochavo_gems_200',gems:200,transaction:'old-purchase'});f.source=parseProviderSnapshot(x);
  const before=await f.service.syncBalances('A');x.purchases[1].status='refunded';
  addGems(x,{productId:'ochavo_gems_200',gems:200,transaction:'new-purchase'});f.source=parseProviderSnapshot(x);
  const result=await f.service.syncBalances('A',{productId:'ochavo_gems_200',transactionId:'new-purchase',store:'rc_billing'});
  assert.deepEqual(result.gemGrants,before.gemGrants);assert.equal(result.gems.balance,200);assert.equal(result.purchaseConfirmation.status,'confirmed');
  const refund=await f.service.syncBalances('A',{productId:'ochavo_gems_200',transactionId:'old-purchase',store:'rc_billing'});
  assert.equal(refund.purchaseConfirmation.status,'refunded');assert.equal(refund.purchaseConfirmation.confirmed,false);
});

test('receipt product, store, environment and user must match the server evidence',async()=>{
  const f=fixture(),x=addGems(input(),{productId:'ochavo_gems_200',gems:200,transaction:'exact-purchase'});f.source=parseProviderSnapshot(x);
  const purchase={productId:'ochavo_gems_200',transactionId:'exact-purchase',store:'rc_billing'};
  for(const changes of [{productId:'ochavo_gems_600'},{productId:'viruta_lives_5'},{store:'app_store'}]){
    const result=await f.service.syncBalances('A',{...purchase,...changes});assert.equal(result.purchaseConfirmation.status,'pending');
  }
  await assert.rejects(f.service.syncBalances('B',purchase),{code:'billing/identity-conflict'});
  const isolated=fixture();x.purchases[1].environment='sandbox';isolated.source=parseProviderSnapshot(x);
  const result=await isolated.service.syncBalances('A',purchase);assert.equal(result.purchaseConfirmation.status,'pending');assert.equal(result.gems.balance,0);
});

test('exact life receipts confirm without changing historical ledger schema',async()=>{
  const f=fixture(),purchase={productId:'viruta_lives_5',transactionId:'GPA.123',store:'play_store'};
  const result=await f.service.syncBalances('A',purchase);assert.equal(result.purchaseConfirmation.status,'confirmed');assert.equal(result.commerce.paidLives,5);
  const key=fingerprint('production:play_store:GPA.123');assert.deepEqual(f.data.get('users/A/commercePurchases/'+key),{key,active:true,lives:5});
});

test('missing, pending and unknown-status receipts stay pending rather than being called refunded',async()=>{
  const f=fixture(),x=addGems(input(),{productId:'ochavo_gems_200',gems:200,transaction:'pending-receipt'});
  const purchase={productId:'ochavo_gems_200',transactionId:'pending-receipt',store:'rc_billing'};
  f.source=parseProviderSnapshot(x);await f.service.syncBalances('A',purchase);
  for(const status of ['pending','unknown','refunded']){
    x.purchases[1].status=status;f.source=parseProviderSnapshot(x);const result=await f.service.syncBalances('A',purchase);
    assert.equal(result.purchaseConfirmation.status,status==='refunded'?'refunded':'pending');assert.equal(result.purchaseConfirmation.confirmed,false);assert.equal(result.gems.balance,0);
  }
  x.purchases=x.purchases.slice(0,1);f.source=parseProviderSnapshot(x);
  const missing=await f.service.syncBalances('A',purchase);assert.equal(missing.purchaseConfirmation.status,'pending');
});

test('deletion or superseding sync cannot return a stale receipt confirmation',async()=>{
  const f=fixture(),source=parseProviderSnapshot(addGems(input(),{productId:'ochavo_gems_200',gems:200,transaction:'receipt'}));
  const purchase={productId:'ochavo_gems_200',transactionId:'receipt',store:'rc_billing'};
  let release,start;const started=new Promise(r=>start=r);f.provider.snapshot=()=>{start();return new Promise(r=>release=r);};
  const pending=f.service.syncBalances('A',purchase);await started;
  f.provider.snapshot=async()=>({...source,purchases:[]});await f.service.syncBalances('A');release(source);
  await assert.rejects(pending,{code:'billing/sync-superseded'});
  f.data.set('accountDeletions/A',{});await assert.rejects(f.service.syncBalances('A',purchase),{code:'account/deletion-pending'});
});

test('public V1 reads preserve original identity and exact grace with sandbox header while V2 stays read-only',async()=>{
  for(const environment of ['production','sandbox']){
    const x=input(),publicKey=environment==='sandbox'?'rcb_sb_fixture':'rcb_fixture';
    x.environment=environment;x.purchases[0].environment=environment;x.subscriptions[0].environment=environment;
    x.subscriptions[0].status='in_grace_period';x.subscriptions[0].current_period_ends_at=now-1000;
    const detail=x.customer.subscriber.subscriptions.viruta_plus_monthly;
    detail.is_sandbox=environment==='sandbox';detail.grace_period_expires_date=iso(now+20000);
    const seen=[];const provider=createRevenueCat({secret:'private-read-v2',publicKey,cleanupSecret:'not-for-reading',projectId:'project',environment,now:()=>now,fetchImpl:async(url,options)=>{
      const v1=url.pathname.startsWith('/v1/');seen.push(url.pathname);
      assert.equal(options.headers.Authorization,'Bearer '+(v1?publicKey:'private-read-v2'));
      assert.equal(options.headers['X-Is-Sandbox'],v1?String(environment==='sandbox'):undefined);
      assert.equal(options.headers['X-Platform'],undefined);assert.equal(options.redirect,'error');
      const body=v1?x.customer:url.pathname.endsWith('/purchases')?{items:x.purchases,next_page:null}:url.pathname.endsWith('/subscriptions')?{items:x.subscriptions,next_page:null}:x.products[url.pathname.split('/').at(-1)];
      assert.ok(body);return {ok:true,json:async()=>structuredClone(body)};
    }});
    assert.equal((await provider.snapshot('A')).premiumUntilMs,now+20000);assert.equal(seen[0],'/v1/subscribers/A');
    detail.refunded_at=iso(now);assert.equal((await provider.snapshot('A')).premiumUntilMs,0);
    x.customer.subscriber.original_app_user_id='B';await assert.rejects(provider.snapshot('A'),{code:'billing/identity-conflict'});
  }
});

test('missing, private or cross-environment public keys fail before any provider call',async()=>{
  let calls=0;
  for(const [environment,publicKey] of [['production',undefined],['production','sk_fixture'],['production','rcb_sb_fixture'],['sandbox','rcb_fixture'],['unknown','rcb_fixture']]){
    const provider=createRevenueCat({secret:'read-v2',publicKey,environment,projectId:'project',fetchImpl:async()=>{calls++;throw Error('must not connect');}});
    await assert.rejects(provider.snapshot('A'),{code:'billing/configuration'});
  }
  const readOnly=createRevenueCat({secret:'read-v2',publicKey:'rcb_fixture',projectId:'project',fetchImpl:async()=>{calls++;}});
  await assert.rejects(readOnly.deleteCustomer('A'),{code:'billing/configuration'});assert.equal(calls,0);
});

test('accepted async deletion200/202 retries until404 across restarts and keeps deletion tombstones',async()=>{
  for(const accepted of [200,202]){
    const f=fixture();await f.service.sync('A');f.data.set('accountDeletions/A',{deletedAt:now});
    const responses=[['GET',200],['DELETE',accepted],['GET',200],['DELETE',500],['GET',404],['GET',404]];
    const create=()=>createRevenueCat({cleanupSecret:'cleanup-only-v2',secret:'read-not-used',publicKey:'rcb_notUsed',projectId:'project',fetchImpl:async(url,options)=>{
      const [method,status]=responses.shift();assert.equal(options.method,method);assert.equal(new URL(url).origin,'https://api.revenuecat.com');
      assert.equal(new URL(url).pathname,'/v2/projects/project/customers/A');assert.equal(options.headers.Authorization,'Bearer cleanup-only-v2');
      assert.equal(options.headers['X-Is-Sandbox'],undefined);assert.equal(options.redirect,'error');
      return {status,ok:status>=200&&status<300,json:async()=>({id:'A',project_id:'project'})};
    }});
    for(const code of ['billing/deletion-pending','billing/provider-unavailable']){
      f.provider.deleteCustomer=uid=>create().deleteCustomer(uid);await assert.rejects(f.service.cleanup('A'),{code});
      assert.equal(f.data.has('accountDeletions/A'),true);assert.equal(f.data.has('users/A/commerce/main'),false);
      assert.ok([...f.data.keys()].some(key=>key.startsWith('billingTransactions/')));
    }
    f.provider.deleteCustomer=uid=>create().deleteCustomer(uid);await finishCleanup(f);
    assert.equal(responses.length,0);assert.equal(f.data.has('accountDeletions/A'),true);
  }
});

test('cleanup confirms racing DELETE404 but rejects aliased identity or foreign project before deleting',async()=>{
  let methods=[];
  const provider=createRevenueCat({cleanupSecret:'cleanup-v2',projectId:'project',fetchImpl:async(url,options)=>{
    methods.push(options.method);return options.method==='GET'?{ok:true,status:200,json:async()=>({id:'A',project_id:'project'})}:{ok:false,status:404};
  }});
  assert.equal(await provider.deleteCustomer('A'),true);assert.deepEqual(methods,['GET','DELETE']);
  for(const customer of [{id:'B',project_id:'project'},{id:'A',project_id:'other-project'}]){
    methods=[];const other=createRevenueCat({cleanupSecret:'cleanup-v2',projectId:'project',fetchImpl:async(url,options)=>{methods.push(options.method);return {ok:true,status:200,json:async()=>customer};}});
    await assert.rejects(other.deleteCustomer('A'),{code:'billing/identity-conflict'});assert.deepEqual(methods,['GET']);
  }
});

test('deployed function metadata separates read, webhook and cleanup credentials',async()=>{
  const {billing,revenuecatWebhook,billingAccountDeleted}=await import('../index.js');
  const secrets=handler=>handler.__endpoint.secretEnvironmentVariables.map(item=>item.key);
  assert.deepEqual(secrets(billing),['REVENUECAT_SECRET_API_KEY_V2']);
  assert.deepEqual(secrets(revenuecatWebhook),['REVENUECAT_SECRET_API_KEY_V2','REVENUECAT_WEBHOOK_SIGNING_SECRET']);
  assert.deepEqual(secrets(billingAccountDeleted),['REVENUECAT_SECRET_API_KEY_CLEANUP_V2']);
  assert.equal(billingAccountDeleted.__endpoint.eventTrigger.retry,true);
  assert.equal(billingAccountDeleted.__endpoint.eventTrigger.eventType,'google.cloud.firestore.document.v1.written');
});

test('each deployed function uses its dedicated same-project identity and the IAM plan matches its secrets',async()=>{
  const handlers=await import('../index.js');
  const plan=JSON.parse(readFileSync(new URL('../../work/payments/runtime-iam-plan.json',import.meta.url),'utf8'));
  assert.equal(plan.projectId,'brote-62d26');assert.equal(plan.secretRoleScope,'individual-secret-only');assert.equal(plan.createKeys,false);assert.equal(plan.enablePurchases,false);
  assert.equal(Object.hasOwn(plan,'changeDefaultComputeAccount'),false);
  assert.deepEqual(plan.defaultComputeAccount.automaticCliProjectRolesOnFirstEventDeploy,['roles/run.invoker','roles/eventarc.eventReceiver']);
  assert.equal(plan.defaultComputeAccount.prePostPolicyDiffRequired,true);assert.equal(plan.defaultComputeAccount.automaticRemoval,false);
  assert.equal(plan.iamPolicyUpdates.requestedPolicyVersion,3);assert.equal(plan.iamPolicyUpdates.preserveCurrentEtag,true);assert.equal(plan.iamPolicyUpdates.restoreWholeOldPolicy,false);
  const oldConfig=process.env.FIREBASE_CONFIG;
  try{
    for(const projectId of ['brote-62d26','demo-brote']){
      process.env.FIREBASE_CONFIG=JSON.stringify({projectId});
      const addresses=new Set();
      for(const account of plan.accounts){
        const endpoint=handlers[account.function].__endpoint,expression=endpoint.serviceAccountEmail;
        assert.equal(expression.runtimeValue(),`${account.accountId}@${projectId}.iam.gserviceaccount.com`);
        assert.match(expression.toCEL(),/params\.PROJECT_ID/);
        addresses.add(expression.runtimeValue());
        assert.deepEqual(endpoint.secretEnvironmentVariables.map(item=>item.key),account.secretAccess);
        assert.equal(account.projectRoles.includes('roles/secretmanager.secretAccessor'),false);
        assert.equal(account.projectRoles.some(role=>['roles/owner','roles/editor','roles/firebase.admin','roles/iam.serviceAccountTokenCreator'].includes(role)),false);
      }
      assert.equal(addresses.size,3);
    }
  }finally{if(oldConfig===undefined)delete process.env.FIREBASE_CONFIG;else process.env.FIREBASE_CONFIG=oldConfig;}
  for(const account of plan.accounts){
    const cleanup=account.function==='billingAccountDeleted';
    assert.equal(account.projectRoles.includes('roles/firebaseauth.viewer'),!cleanup);
    assert.equal(account.projectRoles.includes('roles/datastore.user'),true);
    assert.equal(account.projectRoles.includes('roles/eventarc.eventReceiver'),cleanup);
    if(cleanup)assert.deepEqual(account.runInvoker,{role:'roles/run.invoker',targetFunction:'billingAccountDeleted',scope:'resolved-target-service-only'});
  }
});

test('cleanup completes without any Firebase Auth capability',async()=>{
  const f=fixture();await f.db.doc('accountDeletions/A').set({deletedAt:now});
  let clock=now;
  const backend=createBillingService({db:f.db,provider:f.provider,serverTimestamp:()=>clock,now:()=>clock});
  await assert.rejects(backend.cleanup('A'),{code:'billing/deletion-pending'});
  clock+=DELETE_CONFIRM_DELAY_MS;
  await backend.cleanup('A');
  assert.equal(f.data.has('users/A/commerceSync/main'),false);
  assert.equal(f.data.has('accountDeletions/A'),true);
});

test('cleanup cannot finish before an in-flight get-or-create returns and late completion schedules recheck',async()=>{
  const f=fixture(),source=parseProviderSnapshot(input());let release,start,remoteExists=false,deleteCalls=0;
  const started=new Promise(r=>start=r);f.provider.snapshot=async()=>{start();await new Promise(r=>release=r);remoteExists=true;return source;};
  f.provider.deleteCustomer=async()=>{deleteCalls++;remoteExists=false;return true;};
  const running=f.service.sync('A');await started;await f.db.doc('accountDeletions/A').set({deletedAt:now});
  await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});assert.equal(deleteCalls,0);
  const oldMarker=structuredClone(f.data.get('accountDeletions/A'));release();await assert.rejects(running,{code:'account/deletion-pending'});
  const updatedMarker=structuredClone(f.data.get('accountDeletions/A'));assert.equal(shouldRunBillingCleanup(oldMarker,updatedMarker),true);
  assert.equal(updatedMarker.billingRecheckCounter,1);assert.equal(remoteExists,true);
  await finishCleanup(f);assert.equal(remoteExists,false);assert.equal(deleteCalls,2);
  assert.equal(f.data.has('users/A/commerceSync/main'),false);assert.deepEqual(f.data.get('accountDeletions/A'),updatedMarker);
});

test('concurrent read leases survive another read failure and timeout does not release its barrier',async()=>{
  const f=fixture(),source=parseProviderSnapshot(input()),releases=[],started=[];let deleteCalls=0;
  f.provider.snapshot=()=>new Promise((resolve,reject)=>{releases.push({resolve,reject});started.shift()?.();});
  const start=()=>new Promise(resolve=>started.push(resolve));
  let began=start();const first=f.service.sync('A');const firstFailure=assert.rejects(first,/timeout/);await began;
  began=start();const second=f.service.sync('A');await began;
  assert.equal(Object.keys(f.data.get('users/A/commerceSync/main').leases).length,2);
  releases[0].reject(Error('fetch timeout'));await firstFailure;
  assert.equal(Object.keys(f.data.get('users/A/commerceSync/main').leases).length,2);
  await f.db.doc('accountDeletions/A').set({deletedAt:now});f.provider.deleteCustomer=async()=>{deleteCalls++;return true;};
  releases[1].resolve(source);await assert.rejects(second,{code:'account/deletion-pending'});
  assert.deepEqual(Object.keys(f.data.get('users/A/commerceSync/main').leases),['1']);
  await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});assert.equal(deleteCalls,0);
  f.currentTime+=SYNC_LEASE_MS;await finishCleanup(f);assert.equal(deleteCalls,2);
});

test('orphan lease expiry requires two later absence observations across process restarts',async()=>{
  const f=fixture();let calls=0;f.provider.deleteCustomer=async()=>{calls++;return true;};
  await f.db.doc('users/A/commerceSync/main').set({generation:1,leases:{1:now+SYNC_LEASE_MS}});
  await f.db.doc('accountDeletions/A').set({deletedAt:now});
  await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});assert.equal(calls,0);
  f.currentTime+=SYNC_LEASE_MS;
  await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});assert.equal(calls,1);
  const restarted=createBillingService({db:f.db,auth:f.auth,provider:f.provider,serverTimestamp:()=>f.currentTime,now:()=>f.currentTime});
  await assert.rejects(restarted.cleanup('A'),{code:'billing/deletion-pending'});assert.equal(calls,1);
  f.currentTime+=DELETE_CONFIRM_DELAY_MS;await restarted.cleanup('A');assert.equal(calls,2);
  assert.equal(f.data.has('users/A/commerceSync/main'),false);assert.equal(f.data.has('accountDeletions/A'),true);
});

test('completion after expired lease and final cleanup reopens only cleanup, never commerceSync from finally',async()=>{
  const f=fixture(),source=parseProviderSnapshot(input());let release,start,remoteExists=false;
  const started=new Promise(r=>start=r);f.provider.snapshot=async()=>{start();await new Promise(r=>release=r);remoteExists=true;return source;};
  f.provider.deleteCustomer=async()=>{remoteExists=false;return true;};
  const running=f.service.sync('A');await started;await f.db.doc('accountDeletions/A').set({deletedAt:now});
  f.currentTime+=SYNC_LEASE_MS;await finishCleanup(f);
  assert.equal(f.data.has('users/A/commerceSync/main'),false);
  const oldMarker=structuredClone(f.data.get('accountDeletions/A'));release();await assert.rejects(running,{code:'account/deletion-pending'});
  assert.equal(remoteExists,true);assert.equal(f.data.has('users/A/commerceSync/main'),false);
  const lateMarker=structuredClone(f.data.get('accountDeletions/A'));assert.equal(shouldRunBillingCleanup(oldMarker,lateMarker),true);
  await finishCleanup(f);assert.equal(remoteExists,false);assert.equal(f.data.has('users/A/commerceSync/main'),false);
  assert.equal(shouldRunBillingCleanup(lateMarker,f.data.get('accountDeletions/A')),false);
});

test('read completion during the final remote check invalidates that absence observation',async()=>{
  const f=fixture(),source=parseProviderSnapshot(input());let readRelease,readStart,checkRelease,checkStart;
  const readStarted=new Promise(r=>readStart=r);f.provider.snapshot=async()=>{readStart();await new Promise(r=>readRelease=r);return source;};
  const running=f.service.sync('A');await readStarted;await f.db.doc('accountDeletions/A').set({deletedAt:now});
  f.currentTime+=SYNC_LEASE_MS;await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});
  f.currentTime+=DELETE_CONFIRM_DELAY_MS;const checkStarted=new Promise(r=>checkStart=r);
  f.provider.deleteCustomer=async()=>{checkStart();await new Promise(r=>checkRelease=r);return true;};
  const cleanup=f.service.cleanup('A');await checkStarted;readRelease();await assert.rejects(running,{code:'account/deletion-pending'});
  checkRelease();await assert.rejects(cleanup,{code:'billing/deletion-pending'});
  assert.equal(f.data.get('users/A/commerceSync/main').remoteAbsentAtMs,undefined);
  f.provider.deleteCustomer=async()=>true;await finishCleanup(f);
});

test('sync leases are bounded and expired entries are pruned before another read starts',async()=>{
  const f=fixture(),leases=Object.fromEntries(Array.from({length:MAX_SYNC_LEASES},(_,i)=>[String(i+1),now+SYNC_LEASE_MS]));
  await f.db.doc('users/A/commerceSync/main').set({generation:MAX_SYNC_LEASES,leases});
  await assert.rejects(f.service.sync('A'),{code:'billing/sync-busy'});assert.equal(f.providerCalls,0);
  f.currentTime+=SYNC_LEASE_MS;await f.service.sync('A');assert.equal(f.providerCalls,1);
  assert.equal(f.data.get('users/A/commerceSync/main').generation,MAX_SYNC_LEASES+1);assert.deepEqual(f.data.get('users/A/commerceSync/main').leases,{});
});

test('cleanup trigger ignores marker deletion, unrelated updates and its own unchanged marker',()=>{
  assert.equal(shouldRunBillingCleanup(undefined,{deletedAt:now}),true);
  assert.equal(shouldRunBillingCleanup({deletedAt:now},undefined),false);
  assert.equal(shouldRunBillingCleanup({deletedAt:now},{deletedAt:now,unrelated:true}),false);
  assert.equal(shouldRunBillingCleanup({billingRecheckCounter:1},{billingRecheckCounter:1,billingRecheckAt:now+1}),false);
  assert.equal(shouldRunBillingCleanup({billingRecheckCounter:1},{billingRecheckCounter:2}),true);
});

test('reappearing customer or failed remote check invalidates the earlier404 before final cleanup',async()=>{
  const f=fixture();await f.db.doc('accountDeletions/A').set({deletedAt:now});
  await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});f.currentTime+=DELETE_CONFIRM_DELAY_MS;
  f.provider.deleteCustomer=async()=>{throw Object.assign(Error('DELETE accepted202'),{code:'billing/deletion-pending'});};
  await assert.rejects(f.service.cleanup('A'),{code:'billing/deletion-pending'});
  assert.equal(f.data.get('users/A/commerceSync/main').remoteAbsentAtMs,undefined);
  f.provider.deleteCustomer=async()=>true;
  await finishCleanup(f);assert.equal(f.data.has('users/A/commerceSync/main'),false);
});
