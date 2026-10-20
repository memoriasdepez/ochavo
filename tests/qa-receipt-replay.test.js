import test from 'node:test';
import assert from 'node:assert/strict';
import {QA,guardedFetch,providerURL,parseReadKey,validateQAAccounts,validateQAToken,runReceiptQA,safeFailure} from '../work/payments/qa-receipt-replay.mjs';
import {emptyGame,emptyCommerce,emptyGemCommerce} from '../src/game-domain.js';
import {encodeFirestoreValue} from '../scripts/seed-game-catalog.mjs';

const secret='sk_fixture_read_only_secret',rawReceipt='txRcbfixtureOnlyNeverReal';
const token=uid=>'e30.'+Buffer.from(JSON.stringify({aud:QA.project,iss:'https://securetoken.google.com/'+QA.project,sub:uid,user_id:uid,email_verified:true})).toString('base64url')+'.fixture';
const accounts=QA.uids.map((uid,index)=>({schemaVersion:1,projectId:QA.project,purpose:'sandbox-payment-e2e',uid,runId:QA.runs[index],email:`qa-pagos-${QA.runs[index].split('-').at(-1)}@ochavo.invalid`,password:'LocalQA2026!'+'a'.repeat(32),emailVerified:true}));
const receiptHash=value=>{assert.equal(value,rawReceipt);return QA.receiptHashes.ochavo_gems_600;};
function fixture(){
  const f={calls:[],syncs:[],overridePurchase:{},overrideProduct:{},duplicateCredit:false,foreignCredit:false,handshakeProduction:false,nextPage:null};
  const receipt=(productId,gems)=>({key:QA.receiptHashes[productId],productId,active:true,gems,unitGems:gems,quantity:1,lives:0});
  const records=QA.uids.map((uid,index)=>({game:{...emptyGame(),gems:index?180:0,lives:index?4:5},commerce:{...emptyCommerce(),environment:'sandbox',paidConsumed:index?1:0},gems:{...emptyGemCommerce(),environment:'sandbox',granted:index?0:2100,consumed:index?0:200,balance:index?0:1900},receipts:index?[]:[receipt('ochavo_gems_600',600),receipt('ochavo_gems_1500',1500)]}));
  const json=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>structuredClone(body)});
  const doc=data=>data?json({fields:encodeFirestoreValue(data).mapValue.fields}):json({},404);
  const fetchImpl=async(url,options)=>{
    f.calls.push({url,options});const u=new URL(url),body=options.body?JSON.parse(options.body):null;
    if(u.origin==='https://api.revenuecat.com'){
      assert.equal(options.method,'GET');
      if(u.pathname.endsWith('/purchases'))return json({items:[{customer_id:QA.uids[0],original_customer_id:QA.uids[0],environment:'sandbox',store:'rc_billing',status:'owned',quantity:1,product_id:'prodFixture',purchased_at:1801656000000,store_purchase_identifier:rawReceipt,...f.overridePurchase}],next_page:f.nextPage});
      assert.equal(u.pathname,`/v2/projects/${QA.providerProject}/products/prodFixture`);return json({id:'prodFixture',app_id:QA.app,store_identifier:'ochavo_gems_600',type:'one_time',one_time:{is_consumable:true},...f.overrideProduct});
    }
    if(u.origin==='http://127.0.0.1:9099'){
      if(u.pathname.endsWith('accounts:signInWithPassword')){const account=accounts.find(a=>a.email===body.email);assert.ok(account);return json({localId:account.uid,idToken:token(account.uid)});}
      const account=accounts.find(a=>token(a.uid)===body.idToken);assert.ok(account);return json({users:[{localId:account.uid,email:account.email,emailVerified:true}]});
    }
    if(u.origin==='http://127.0.0.1:8080'){
      assert.equal(options.method,'GET');const index=QA.uids.findIndex(uid=>u.pathname.includes('/users/'+uid+'/'));assert.ok(index>=0);const r=records[index];
      if(u.pathname.endsWith('/game/main'))return doc(r.game);
      if(u.pathname.endsWith('/commerce/main'))return doc(r.commerce);
      if(u.pathname.endsWith('/commerceGems/main'))return doc(r.gems);
      if(u.pathname.endsWith('/game/skips'))return doc(null);
      assert.ok(u.pathname.endsWith('/commercePurchases'));return json({documents:r.receipts.map(data=>({fields:encodeFirestoreValue(data).mapValue.fields}))});
    }
    assert.equal(url,QA.billing);const index=QA.uids.findIndex(uid=>options.headers.Authorization==='Bearer '+token(uid));assert.ok(index>=0);
    f.syncs.push({index,purchase:!!body.purchase});const r=records[index];r.gems.revision++;
    if(body.purchase&&((index===0&&f.duplicateCredit)||(index===1&&f.foreignCredit))){r.gems.granted+=600;r.gems.balance+=600;}
    return json({billingEnvironment:f.handshakeProduction?'production':'sandbox',gems:r.gems,commerce:r.commerce,...(body.purchase?{purchaseConfirmation:{...body.purchase,confirmed:index===0,status:index===0?'confirmed':'pending'}}:{})});
  };
  f.run=()=>runReceiptQA({accounts,secret,fetchImpl,receiptHash,now:()=>1801656000000});return f;
}
test('fixed fake identities, sandbox tokens and read-only key parsing reject substitutions',()=>{
  assert.equal(validateQAAccounts(accounts),accounts);assert.equal(parseReadKey('REVENUECAT_SECRET_API_KEY_V2='+secret),secret);
  for(const index of [0,1]){const changed=structuredClone(accounts);changed[index].uid='differentUID';assert.throws(()=>validateQAAccounts(changed));}
  assert.throws(()=>parseReadKey('REVENUECAT_SECRET_API_KEY_CLEANUP_V2='+secret));
  assert.throws(()=>parseReadKey('REVENUECAT_SECRET_API_KEY_V2='+secret+'\nREVENUECAT_SECRET_API_KEY_V2='+secret));
  assert.throws(()=>validateQAToken(token(QA.uids[0]),QA.uids[1]));
});
test('transport refuses production, provider mutation, redirects, foreign app route and arbitrary receipts',async()=>{
  let calls=0;const request=guardedFetch(async()=>{calls++;},secret);
  for(const [url,options] of [
    ['https://europe-west1-brote-62d26.cloudfunctions.net/billing',{method:'POST'}],
    ['http://127.0.0.1:5001/brote-62d26/europe-west1/billing',{method:'POST'}],
    [`https://api.revenuecat.com/v2/projects/${QA.providerProject}/customers/${QA.uids[0]}/purchases?environment=sandbox&limit=100`,{method:'DELETE'}],
    ['http://127.0.0.1:8080/v1/projects/demo-brote/databases/(default)/documents:commit',{method:'POST'}],
    [QA.billing,{method:'POST',headers:{Authorization:'Bearer '+token(QA.uids[0])},body:JSON.stringify({action:'sync',purchase:{productId:'ochavo_gems_600',transactionId:rawReceipt,store:'rc_billing'}})}],
  ])await assert.rejects(request(url,{redirect:'error',...options}));
  assert.equal(calls,0);
  for(const url of ['https://evil.invalid/purchases',`/v2/projects/other/customers/${QA.uids[0]}/purchases`,`/v2/projects/${QA.providerProject}/customers/${QA.uids[0]}/purchases?environment=production`])assert.throws(()=>providerURL(url));
});
test('exact receipt replay twice and cross-account rejection preserve both economies despite revision increments',async()=>{
  const f=fixture(),result=await f.run();assert.equal(result.passed,true);assert.deepEqual(f.syncs,[{index:0,purchase:false},{index:1,purchase:false},{index:0,purchase:true},{index:0,purchase:true},{index:1,purchase:true}]);
  assert.equal(result.ownReceiptReplay.paidGems,1900);assert.equal(result.foreignReceipt.earnedGems,180);assert.equal(result.foreignReceipt.paidGems,0);
  for(const privateValue of [secret,rawReceipt,...QA.uids,...QA.runs,...accounts.map(a=>a.password),...QA.uids.map(token)])assert.equal(JSON.stringify(result).includes(privateValue),false);
  assert.equal(f.calls.some(call=>call.options.method==='DELETE'),false);assert.equal(f.calls.some(call=>call.url.includes(':commit')),false);
});
test('foreign environment, UID, app or pagination stop before billing receives a receipt',async()=>{
  for(const override of [{environment:'production'},{customer_id:QA.uids[1]},{original_customer_id:QA.uids[1]},{store:'play_store'}]){const f=fixture();f.overridePurchase=override;await assert.rejects(f.run());assert.equal(f.syncs.length,0);}
  const app=fixture();app.overrideProduct={app_id:'otherApp'};await assert.rejects(app.run());assert.equal(app.syncs.length,0);
  const page=fixture();page.nextPage='https://evil.invalid/steal';await assert.rejects(page.run());assert.equal(page.calls.some(call=>call.url.includes('evil.invalid')),false);
  const handshake=fixture();handshake.handshakeProduction=true;await assert.rejects(handshake.run(),{code:'UNEXPECTED_BILLING_ENVIRONMENT'});assert.equal(handshake.syncs.some(call=>call.purchase),false);
});
test('duplicate credit or cross-account credit fails QA and failure output never includes arbitrary errors',async()=>{
  const own=fixture();own.duplicateCredit=true;await assert.rejects(own.run(),{code:'BILLING_BALANCE_CHANGED'});
  const other=fixture();other.foreignCredit=true;await assert.rejects(other.run(),{code:'BILLING_BALANCE_CHANGED'});
  assert.deepEqual(safeFailure(Object.assign(Error(rawReceipt),{code:secret})),{passed:false,code:'QA_FAILED',httpStatus:0});
});
