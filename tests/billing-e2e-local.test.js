import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PROJECT,assertLocalUrl,localClient,makeIdentity,validateAccount,createVerifiedLocalAccount,signInLocal,gameSeedRecords,decodeFirestore,summarizeEconomy,observeLocal,compareEconomy,receiptFingerprint,validateLabel} from '../scripts/billing-e2e-tools.mjs';
import {emptyGame,emptyCommerce,emptyGemCommerce,dayWindow} from '../src/game-domain.js';
import {encodeFirestoreValue} from '../scripts/seed-game-catalog.mjs';

const now=Date.parse('2026-10-07T12:00:00Z');
const document=data=>data?{fields:encodeFirestoreValue(data).mapValue.fields}:null;
const gemReceipt=(id='txn200',gems=200,active=true)=>({key:receiptFingerprint('sandbox:rc_billing:'+id),active,lives:0,gems,productId:'ochavo_gems_'+gems,unitGems:gems,quantity:1});
const lifeReceipt=(id='txn5',active=true)=>({key:receiptFingerprint('sandbox:rc_billing:'+id),active,lives:5});
function economy({earned=200,granted=0,consumed=0,receipts=[],paidGranted=0,paidConsumed=0,premiumUntilMs=0,revision=0}={}){
  return summarizeEconomy({game:{...emptyGame(),gems:earned},commerceGems:{...emptyGemCommerce(),environment:'sandbox',revision,granted,consumed,balance:Math.max(0,granted-consumed)},commerce:{...emptyCommerce(),environment:'sandbox',revision,paidGranted,paidConsumed,paidLives:Math.max(0,paidGranted-paidConsumed),premiumUntilMs},receipts},now);
}
const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});

test('QA destinations are fixed to demo-brote on explicit loopback ports',()=>{
  for(const url of ['http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-brote-key','http://127.0.0.1:9099/emulator/v1/projects/demo-brote/oobCodes','http://127.0.0.1:8080/v1/projects/demo-brote/databases/(default)/documents:commit'])assert.doesNotThrow(()=>assertLocalUrl(url));
  for(const url of ['https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-brote-key','http://127.0.0.1:8080/v1/projects/brote-62d26/databases/(default)/documents:commit','http://localhost:8080/v1/projects/demo-brote/databases/(default)/documents:commit','http://127.0.0.1:8081/v1/projects/demo-brote/databases/(default)/documents:commit','http://127.0.0.1:8080@evil.invalid/v1/projects/demo-brote/databases/(default)/documents:commit','http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=demo-brote-key','http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=real-key'])assert.throws(()=>assertLocalUrl(url));
});

test('seeding admits only config/calendar/catalog before issuing any request',async()=>{
  const calls=[],client=localClient(async(url,options)=>{calls.push({url,options});return response({});});
  for(const path of ['users/A/game/main','users/A/commerceGems/main','users/A/commerce/main','users/A/promotions/lifetime','gameCatalog/id/other'])await assert.rejects(()=>client.seed([{path,data:{gems:900}}]),/nunca monederos/);
  assert.equal(calls.length,0);
  const records=gameSeedRecords({'lesson-0':{kind:'lesson',amount:10}},now);
  assert.equal(records.length,5);
  assert.equal(await client.seed(records),5);
  assert.equal(calls.length,1);assert.equal(calls[0].options.redirect,'error');
  const writes=JSON.parse(calls[0].options.body).writes;
  assert.ok(writes.every(item=>item.update.name.startsWith('projects/demo-brote/databases/(default)/documents/game')));
  assert.equal(writes[0].update.fields.welcomeGems.integerValue,'200');
  for(const item of writes.filter(item=>item.update.name.includes('/gameDays/')))assert.ok(item.update.fields.startAt.timestampValue&&item.update.fields.endAt.timestampValue);
  assert.deepEqual(records.filter(item=>item.path.startsWith('gameDays/')).map(item=>item.data.dayKey),['2026-10-06','2026-10-07','2026-10-08']);
});

test('calendar includes DST-length days with real timestamps, not map placeholders',()=>{
  const records=gameSeedRecords({},Date.parse('2026-10-25T12:00:00Z'));
  const transition=records.find(item=>item.path==='gameDays/2026-10-25').data;
  assert.equal(Date.parse(transition.endAt.$timestamp)-Date.parse(transition.startAt.$timestamp),25*3600000);
  assert.equal(dayWindow(transition.dayKey).ordinal,transition.ordinal);
});

test('each prepared account uses a new synthetic address and never persists tokens',async()=>{
  const identity=makeIdentity(now),other=makeIdentity(now),calls=[];
  assert.notEqual(identity.email,other.email);assert.notEqual(identity.runId,other.runId);
  const client={auth:async(method,input)=>{
    calls.push({method,input});
    if(method==='accounts:signUp')return {localId:'UID_new',idToken:'old-token-private',refreshToken:'private-refresh-token'};
    if(method==='accounts:signInWithPassword')return {localId:'UID_new',idToken:'fresh-token-private'};
    if(method==='accounts:lookup')return {users:[{localId:'UID_new',email:identity.email,emailVerified:true}]};
    return {};
  },oobs:async()=>({oobCodes:[{email:'someone-else@ochavo.invalid',requestType:'VERIFY_EMAIL',oobCode:'wrong'},{email:identity.email,requestType:'PASSWORD_RESET',oobCode:'also-wrong'},{email:identity.email,requestType:'VERIFY_EMAIL',oobCode:'right-local-code'}]})};
  const account=await createVerifiedLocalAccount(client,{identity,now});
  assert.equal(account.projectId,PROJECT);assert.equal(account.emailVerified,true);
  assert.doesNotMatch(JSON.stringify(account),/token|refreshToken|right-local-code/i);
  assert.equal(account.providerEndToEndPurchaseTested,false);
  assert.deepEqual(calls.map(item=>item.method),['accounts:signUp','accounts:sendOobCode','accounts:update','accounts:signInWithPassword','accounts:lookup']);
  assert.equal(calls[2].input.oobCode,'right-local-code');assert.equal(calls[4].input.idToken,'fresh-token-private');
});

test('a duplicate sign-up does not reuse a user and invalid local verification fails',async()=>{
  const calls=[],identity=makeIdentity(now),client={auth:async method=>{calls.push(method);throw Error('Duplicate synthetic account.');}};
  await assert.rejects(()=>createVerifiedLocalAccount(client,{identity,now}));assert.deepEqual(calls,['accounts:signUp']);
  const account={schemaVersion:1,projectId:PROJECT,purpose:'sandbox-payment-e2e',...identity,uid:'A',emailVerified:true};
  assert.throws(()=>validateAccount({...account,projectId:'brote-62d26'}));
  assert.throws(()=>validateAccount({...account,email:'real@example.com'}));
  await assert.rejects(()=>signInLocal(account,{auth:async method=>method==='accounts:signInWithPassword'?{localId:'A',idToken:'private'}:{users:[{localId:'A',email:account.email,emailVerified:false}]}}),/no está verificada/);
});

test('provider bodies, exceptions and tokens cannot leak through request errors',async()=>{
  const client=localClient(async()=>response({secret:'should-not-print',idToken:'secret-token'},403));
  await assert.rejects(()=>client.auth('accounts:signUp',{}),error=>/HTTP 403/.test(error.message)&&!/should-not-print|secret-token/.test(error.message));
  const failed=localClient(async()=>{throw Error('secret-token in network exception');});
  await assert.rejects(()=>failed.auth('accounts:signUp',{}),error=>!error.message.includes('secret-token'));
});

test('read APIs cannot mutate wallets, and receipt listing stays in local demo with bounded pagination',async()=>{
  const calls=[],client=localClient(async(url,options)=>{calls.push({url,options});return response(url.includes('pageToken=')?{documents:[document(lifeReceipt())]}:{documents:[document(gemReceipt())],nextPageToken:'next/opaque'});});
  assert.throws(()=>client.document('users/A/commercePurchases/id','private'),/fuera de la economía/);
  const docs=await client.receipts('A');assert.equal(docs.length,2);
  assert.ok(calls.every(item=>item.options.method==='GET'&&item.url.startsWith('http://127.0.0.1:8080/v1/projects/demo-brote/')));
  assert.ok(calls[1].url.includes('pageToken=next%2Fopaque'));
});

test('observation reads owner wallets and administrative receipts without writing or retaining Auth tokens',async()=>{
  const identity=makeIdentity(now),account={schemaVersion:1,projectId:PROJECT,purpose:'sandbox-payment-e2e',...identity,uid:'QA_UID',emailVerified:true},requests=[];
  const client={auth:async method=>method==='accounts:signInWithPassword'?{localId:account.uid,idToken:'unprinted-private-token'}:{users:[{localId:account.uid,email:account.email,emailVerified:true}]},document:async(path,token)=>{
    requests.push({path,token});
    return path.endsWith('game/main')?document(emptyGame()):path.endsWith('commerceGems/main')?document({...emptyGemCommerce(),environment:'sandbox',granted:200,balance:200}):path.endsWith('commerce/main')?document({...emptyCommerce(),environment:'sandbox'}):null;
  },receipts:async uid=>{assert.equal(uid,account.uid);return [document(gemReceipt())];}};
  const result=await observeLocal(account,client,now);
  assert.equal(result.earnedGems,200);assert.equal(result.paidGems,200);assert.equal(result.gems,400);
  assert.ok(requests.every(item=>item.path.startsWith('users/QA_UID/')&&item.token==='unprinted-private-token'));
  assert.doesNotMatch(JSON.stringify(result),/token|password|email/i);
});

test('Firestore value decoding validates integers and preserves ledger scalar types',()=>{
  const data={quantity:1,active:true,key:'abc',optional:null,items:[200,'text'],updatedAt:{$timestamp:'2026-10-07T12:00:00.000Z'}};
  assert.deepEqual(decodeFirestore(encodeFirestoreValue(data)),{...data,updatedAt:'2026-10-07T12:00:00.000Z'});
  assert.throws(()=>decodeFirestore({integerValue:'9007199254740993'}));
});

test('real server receipt fingerprints are compared, never balances alone',()=>{
  const before=economy(),after=economy({granted:200,receipts:[gemReceipt()]});
  assert.equal(compareEconomy(before,after,{expect:'purchase',amount:200,receiptKey:'sandbox:rc_billing:txn200'}).passed,true);
  assert.equal(compareEconomy(before,after,{expect:'purchase',amount:200,receiptKey:'sandbox:rc_billing:another-transaction'}).passed,false);
  assert.throws(()=>compareEconomy(before,after,{expect:'purchase',amount:200}),/comprobante/);
  assert.throws(()=>receiptFingerprint('production:rc_billing:txn200'));
  assert.equal(receiptFingerprint(gemReceipt().key),gemReceipt().key);
});

test('purchase, free-first spending, refund debt and later purchase yield the expected matrix',()=>{
  const receipt=gemReceipt(),base=economy(),bought=economy({granted:200,receipts:[receipt]}),spentFree=economy({earned:0,granted:200,receipts:[receipt]}),spentPaid=economy({earned:0,granted:200,consumed:200,receipts:[receipt]}),refunded=economy({earned:0,consumed:200,receipts:[{...receipt,active:false}]}),next=economy({earned:0,granted:600,consumed:200,receipts:[{...receipt,active:false},gemReceipt('txn600',600)]});
  const checks=[compareEconomy(base,bought,{expect:'purchase',amount:200,receiptKey:receipt.key}),compareEconomy(bought,spentFree,{expect:'spend',amount:200}),compareEconomy(spentFree,spentPaid,{expect:'spend',amount:200}),compareEconomy(spentPaid,refunded,{expect:'refund',amount:200,receiptKey:receipt.key}),compareEconomy(refunded,next,{expect:'purchase',amount:600,receiptKey:'sandbox:rc_billing:txn600'})];
  assert.ok(checks.every(result=>result.passed));assert.ok(checks.every(result=>result.providerEndToEndPurchaseTested===false));
  assert.equal(refunded.gemDebt,200);assert.equal(next.paidGems,400);
  const withEarned=economy({earned:37,granted:200,consumed:200,receipts:[receipt]}),refundKeepsEarned=economy({earned:37,consumed:200,receipts:[{...receipt,active:false}]});
  assert.equal(compareEconomy(withEarned,refundKeepsEarned,{expect:'refund',amount:200,receiptKey:receipt.key}).passed,true);
});

test('mixed spend consumes only the paid remainder and catches wrong free-first order',()=>{
  const receipt=gemReceipt(),before=economy({earned:7,granted:200,receipts:[receipt]}),after=economy({earned:0,granted:200,consumed:13,receipts:[receipt]});
  assert.equal(compareEconomy(before,after,{expect:'spend',amount:20}).passed,true);
  const wrong=economy({earned:7,granted:200,consumed:20,receipts:[receipt]});
  assert.equal(compareEconomy(before,wrong,{expect:'spend',amount:20}).passed,false);
});

test('restore/retry accepts revision increments but rejects replenishment of consumed benefits',()=>{
  const receipt=gemReceipt(),before=economy({granted:200,consumed:20,receipts:[receipt]}),after=economy({granted:200,consumed:20,receipts:[receipt],revision:4});
  assert.equal(compareEconomy(before,after,{expect:'unchanged'}).passed,true);
  assert.equal(compareEconomy(before,economy({granted:200,consumed:0,receipts:[receipt]}),{expect:'unchanged'}).passed,false);
});

test('life purchase and Plus have separate comparison contracts',()=>{
  const before=economy(),after=economy({paidGranted:5,receipts:[lifeReceipt()]});
  assert.equal(compareEconomy(before,after,{expect:'lives-purchase',amount:5,receiptKey:lifeReceipt().key}).passed,true);
  assert.equal(compareEconomy(before,economy({premiumUntilMs:now+100000}),{expect:'premium-active'}).passed,true);
  assert.equal(compareEconomy(before,before,{expect:'premium-active'}).passed,false);
});

test('observer rejects production, mismatched balances, duplicate receipts and altered package quantities',()=>{
  assert.throws(()=>summarizeEconomy({commerceGems:{...emptyGemCommerce(),environment:'production'}}),/fuera de sandbox/);
  assert.throws(()=>summarizeEconomy({commerceGems:{...emptyGemCommerce(),environment:'sandbox',granted:200,balance:200},receipts:[]}),/no coinciden/);
  assert.throws(()=>economy({granted:400,receipts:[gemReceipt(),gemReceipt()]}),/duplicado/);
  assert.throws(()=>economy({granted:201,receipts:[{...gemReceipt(),gems:201}]}),/Cantidad/);
});

test('helpers and evidence are excluded from a deployable build and Vite cannot serve the local account directory',()=>{
  const vite=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8'),ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  assert.match(vite,/\*\*\/work\/billing-local\/\*\*/);assert.match(ignore,/\/work\/billing-local\//);
  for(const name of ['billing-e2e-seed.mjs','billing-e2e-observe.mjs','billing-e2e-tools.mjs']){
    const source=readFileSync(new URL('../scripts/'+name,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\.secret\.local|config\.json|GOOGLE_APPLICATION_CREDENTIALS|https:\/\/api\.revenuecat|firebase\.googleapis/);
  }
  for(const label of ['../account','account','unsafe/label',''])assert.throws(()=>validateLabel(label));
  assert.equal(validateLabel('compra-200'),'compra-200');
});
