import {createHash} from 'node:crypto';
import {open,lstat,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {localClient,validateAccount,signInLocal,observeLocal} from '../../scripts/billing-e2e-tools.mjs';

export const QA=Object.freeze({project:'demo-brote',providerProject:'projae1cdb17',app:'app767d968a5c',
  billing:'http://127.0.0.1:5001/demo-brote/europe-west1/billing',
  runs:Object.freeze(['2026-10-07T12-06-11-268Z-bac0a155bf5846d79cdc6a68ce7cdc2e','2026-10-07T12-32-25-414Z-1525bef21de24f8aa1b98a54c04fd01a']),
  uids:Object.freeze(['5qB4NOCWfklxtHnnBRqRS9nyEhLp','EKww9fU3aFcwKgO85QtIM89iT6m3']),
  receiptHashes:Object.freeze({ochavo_gems_600:'70fbf2f7c199f0fc342fa9e706d8b26c90688702d5bc02608bac8e19f7e17ada',ochavo_gems_1500:'b23cb7b03559e7b5bb2ed6aabeac88b2d22fafb586b3663ef1f6864769d9a5bb'})});
const ROOT=fileURLToPath(new URL('../../',import.meta.url));
const providerOrigin='https://api.revenuecat.com',prefix='/v2/projects/'+QA.providerProject;
const purchasePath=prefix+'/customers/'+QA.uids[0]+'/purchases';
const authPrefix='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/';
const firestorePrefix='/v1/projects/demo-brote/databases/(default)/documents/users/';
class QAError extends Error{constructor(code,status=0){super(code);this.code=code;this.status=Number.isInteger(status)&&status>=100&&status<=599?status:0;}}
const fail=(code,status)=>{throw new QAError(code,status);};
export const safeFailure=error=>({passed:false,code:error instanceof QAError?error.code:'QA_FAILED',httpStatus:error instanceof QAError?error.status:0});
const digest=receipt=>createHash('sha256').update('sandbox:rc_billing:'+receipt).digest('hex');

export function validateQAAccounts(accounts){
  if(!Array.isArray(accounts)||accounts.length!==2)fail('INVALID_QA_ACCOUNTS');
  for(let i=0;i<2;i++){
    const account=validateAccount(accounts[i]),nonce=QA.runs[i].split('-').at(-1);
    if(account.uid!==QA.uids[i]||account.runId!==QA.runs[i]||account.email!==`qa-pagos-${nonce}@ochavo.invalid`)fail('INVALID_QA_IDENTITY');
  }
  return accounts;
}
export function validateQAToken(token,expectedUid){
  let value;try{value=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString('utf8'));}catch{fail('INVALID_EMULATOR_TOKEN');}
  if(!QA.uids.includes(expectedUid)||value.aud!==QA.project||value.iss!=='https://securetoken.google.com/'+QA.project||value.sub!==expectedUid||value.user_id!==expectedUid||value.email_verified!==true)fail('INVALID_EMULATOR_TOKEN');
  return token;
}
function checkedURL(value){let url;try{url=new URL(value);}catch{fail('INVALID_DESTINATION');}if(url.username||url.password||url.hash)fail('INVALID_DESTINATION');return url;}
export function providerURL(value){
  const url=checkedURL(new URL(value,providerOrigin).href);
  if(url.origin!==providerOrigin)fail('INVALID_PROVIDER_DESTINATION');
  if(url.pathname===purchasePath){
    const keys=[...url.searchParams.keys()];
    if(new Set(keys).size!==keys.length||keys.some(key=>!['environment','limit','starting_after'].includes(key))||(url.searchParams.has('environment')&&url.searchParams.get('environment')!=='sandbox')||(url.searchParams.has('limit')&&url.searchParams.get('limit')!=='100')||(url.searchParams.has('starting_after')&&!/^[A-Za-z0-9_-]{1,255}$/.test(url.searchParams.get('starting_after'))))fail('INVALID_PROVIDER_QUERY');
    url.searchParams.set('environment','sandbox');url.searchParams.set('limit','100');
  }else if(!new RegExp('^'+prefix+'/products/[A-Za-z0-9_-]{1,255}$').test(url.pathname)||url.search)fail('INVALID_PROVIDER_DESTINATION');
  return url;
}

/** Reject every production Firebase route and every mutation except local sign-in/lookup/sync. */
export function guardedFetch(fetchImpl,secret,receiptHash=digest){
  return async(value,options={})=>{
    const url=checkedURL(value),method=options.method||'GET',headers=new Headers(options.headers),authorization=headers.get('Authorization')||'';
    if(options.redirect!=='error')fail('REDIRECTS_FORBIDDEN');
    if(url.origin===providerOrigin){
      if(method!=='GET'||providerURL(url.href).href!==url.href||authorization!=='Bearer '+secret)fail('INVALID_PROVIDER_REQUEST');
    }else if(url.href.startsWith(authPrefix)){
      if(method!=='POST'||url.search!=='?key=demo-brote-key'||!['accounts:signInWithPassword','accounts:lookup'].includes(url.pathname.slice('/identitytoolkit.googleapis.com/v1/'.length)))fail('INVALID_LOCAL_AUTH_REQUEST');
      let body;try{body=JSON.parse(options.body);}catch{fail('INVALID_LOCAL_AUTH_REQUEST');}
      if(url.pathname.endsWith('accounts:lookup')){
        const token=body.idToken;let valid=false;
        for(const uid of QA.uids){try{validateQAToken(token,uid);valid=true;}catch{}}
        if(!valid)fail('INVALID_EMULATOR_TOKEN');
      }else if(!QA.runs.some(run=>body.email===`qa-pagos-${run.split('-').at(-1)}@ochavo.invalid`)||!/^LocalQA2026![a-f0-9]{32}$/.test(body.password||'')||body.returnSecureToken!==true)fail('INVALID_QA_IDENTITY');
    }else if(url.origin==='http://127.0.0.1:8080'){
      const match=new RegExp('^'+firestorePrefix.replaceAll('(','\\(').replaceAll(')','\\)')+'('+QA.uids.join('|')+')/(game/(?:main|skips)|commerce/main|commerceGems/main|commercePurchases)$').exec(url.pathname);
      if(method!=='GET'||!match)fail('INVALID_FIRESTORE_REQUEST');
      if(match[2]==='commercePurchases'){
        if(authorization!=='Bearer owner'||url.searchParams.get('pageSize')!=='500'||[...url.searchParams.keys()].some(key=>!['pageSize','pageToken'].includes(key)))fail('INVALID_FIRESTORE_REQUEST');
      }else{if(url.search)fail('INVALID_FIRESTORE_REQUEST');validateQAToken(authorization.replace(/^Bearer /,''),match[1]);}
    }else if(url.href===QA.billing){
      if(method!=='POST')fail('INVALID_BILLING_REQUEST');
      const token=authorization.replace(/^Bearer /,'');let valid=false;
      for(const uid of QA.uids){try{validateQAToken(token,uid);valid=true;}catch{}}
      if(!valid)fail('INVALID_EMULATOR_TOKEN');
      let body;try{body=JSON.parse(options.body);}catch{fail('INVALID_BILLING_REQUEST');}
      if(body.action!=='sync'||Object.keys(body).some(key=>!['action','purchase'].includes(key)))fail('INVALID_BILLING_REQUEST');
      if(body.purchase){const p=body.purchase;if(Object.keys(p).sort().join(',')!=='productId,store,transactionId'||p.store!=='rc_billing'||!Object.hasOwn(QA.receiptHashes,p.productId)||typeof p.transactionId!=='string'||receiptHash(p.transactionId)!==QA.receiptHashes[p.productId])fail('UNEXPECTED_RECEIPT');}
    }else fail('INVALID_DESTINATION');
    try{return await fetchImpl(url.href,options);}catch{fail('NETWORK_FAILED');}
  };
}

export async function selectReceipt(secret,request,receiptHash=digest){
  if(typeof secret!=='string'||!/^sk_[A-Za-z0-9_.-]{12,4093}$/.test(secret))fail('INVALID_READ_KEY');
  const get=async value=>{
    const url=providerURL(value),response=await request(url.href,{method:'GET',headers:{Authorization:'Bearer '+secret,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
    if(response.status!==200)fail('PROVIDER_READ_FAILED',response.status);
    try{return await response.json();}catch{fail('PROVIDER_JSON_INVALID');}
  };
  const purchases=[],seen=new Set();let next=purchasePath+'?environment=sandbox&limit=100';
  for(let page=0;next&&page<10;page++){
    const url=providerURL(next);if(url.pathname!==purchasePath||seen.has(url.href))fail('INVALID_PAGINATION');seen.add(url.href);
    const response=await get(url.href);
    if(!Array.isArray(response.items)||response.items.length>100||!(response.next_page===null||typeof response.next_page==='string'))fail('INVALID_PROVIDER_PAGE');
    purchases.push(...response.items);next=response.next_page;
  }
  if(next)fail('TOO_MANY_PROVIDER_PAGES');
  const candidates=[],products=new Map();
  for(const purchase of purchases){
    if(purchase.customer_id!==QA.uids[0]||purchase.original_customer_id!==QA.uids[0]||purchase.environment!=='sandbox'||purchase.store!=='rc_billing')fail('UNEXPECTED_PROVIDER_IDENTITY');
    if(purchase.status!=='owned')continue;
    if(typeof purchase.store_purchase_identifier!=='string'||!/^txRcb[A-Za-z0-9_-]{1,249}$/.test(purchase.store_purchase_identifier)||purchase.quantity!==1||!Number.isSafeInteger(purchase.purchased_at)||!/^prod[A-Za-z0-9_-]{1,251}$/.test(purchase.product_id))fail('INVALID_PROVIDER_PURCHASE');
    if(!products.has(purchase.product_id))products.set(purchase.product_id,await get(prefix+'/products/'+purchase.product_id));
    const product=products.get(purchase.product_id);
    if(product.id!==purchase.product_id||product.app_id!==QA.app||!(product.type==='consumable'||product.type==='one_time'&&product.one_time?.is_consumable===true))fail('UNEXPECTED_PRODUCT_APP');
    if(!Object.hasOwn(QA.receiptHashes,product.store_identifier))continue;
    if(receiptHash(purchase.store_purchase_identifier)!==QA.receiptHashes[product.store_identifier])fail('UNEXPECTED_RECEIPT');
    candidates.push({productId:product.store_identifier,transactionId:purchase.store_purchase_identifier,store:'rc_billing'});
  }
  const selected=candidates.find(item=>item.productId==='ochavo_gems_600')||candidates.find(item=>item.productId==='ochavo_gems_1500');
  if(!selected)fail('NO_APPROVED_ACTIVE_RECEIPT');return selected;
}
const invariants=economy=>Object.fromEntries(['earnedStored','earnedGems','paidGems','gems','gemGranted','gemConsumed','gemDebt','dailyLives','paidLives','totalLives','paidLifeGranted','paidLifeConsumed','premiumUntilMs','skippedWorldIds','receipts'].map(key=>[key,economy[key]]));
function checkBaseline(first,second){
  if(!first.earnedStored||first.earnedGems!==0||first.paidGems!==1900||first.gems!==1900||first.gemGranted!==2100||first.gemConsumed!==200||first.premiumActive!==false||!second.earnedStored||second.earnedGems!==180||second.paidGems!==0||second.gems!==180||second.premiumActive!==false)fail('BASELINE_CHANGED');
}

// Hash/transport injection is only for synthetic tests; main accepts no arguments or overrides.
export async function runReceiptQA({accounts,secret,fetchImpl=fetch,now=()=>Date.now(),receiptHash=digest}={}){
  validateQAAccounts(accounts);
  const request=guardedFetch(fetchImpl,secret,receiptHash),client=localClient(request);
  const before=[];for(const account of accounts)before.push(await observeLocal(account,client,now()));
  checkBaseline(...before);
  const receipt=await selectReceipt(secret,request,receiptHash);
  const key=receiptHash(receipt.transactionId);
  if(!before[0].receipts.some(item=>item.key===key&&item.active&&item.productId===receipt.productId)||before[1].receipts.some(item=>item.key===key))fail('BASELINE_RECEIPT_MISMATCH');
  const tokens=[];for(const account of accounts)tokens.push(validateQAToken(await signInLocal(account,client),account.uid));
  const sync=async(index,purchase)=>{
    const response=await request(QA.billing,{method:'POST',headers:{Authorization:'Bearer '+tokens[index],'Content-Type':'application/json'},body:JSON.stringify({action:'sync',...(purchase?{purchase}:{})}),redirect:'error',signal:AbortSignal.timeout(45000)});
    if(response.status!==200)fail('BILLING_SYNC_FAILED',response.status);
    let body;try{body=await response.json();}catch{fail('BILLING_JSON_INVALID');}
    if(body.billingEnvironment!=='sandbox'||body.gems?.environment!=='sandbox'||body.commerce?.environment!=='sandbox')fail('UNEXPECTED_BILLING_ENVIRONMENT');
    if(body.gems.granted!==before[index].gemGranted||body.gems.consumed!==before[index].gemConsumed||body.gems.balance!==before[index].paidGems)fail('BILLING_BALANCE_CHANGED');
    return body;
  };
  // Confirm the local server's sandbox handshake before sending any exact receipt.
  await sync(0);await sync(1);
  const verify=async(index,confirmed,status)=>{
    const response=await sync(index,receipt),proof=response.purchaseConfirmation;
    if(proof?.productId!==receipt.productId||proof.transactionId!==receipt.transactionId||proof.store!=='rc_billing'||proof.confirmed!==confirmed||proof.status!==status)fail('PURCHASE_PROOF_MISMATCH');
    const after=await observeLocal(accounts[index],client,now());
    if(JSON.stringify(invariants(after))!==JSON.stringify(invariants(before[index])))fail('ECONOMY_CHANGED');
  };
  await verify(0,true,'confirmed');await verify(0,true,'confirmed');await verify(1,false,'pending');
  // Recheck the first wallet after cross-account presentation as well.
  const final=await observeLocal(accounts[0],client,now());
  if(JSON.stringify(invariants(final))!==JSON.stringify(invariants(before[0])))fail('ECONOMY_CHANGED');
  return {passed:true,environment:'sandbox',ownReceiptReplay:{attempts:2,confirmed:true,unchanged:true,earnedGems:0,paidGems:1900,totalGems:1900},foreignReceipt:{confirmed:false,status:'pending',unchanged:true,earnedGems:180,paidGems:0,totalGems:180},providerMutations:0,purchasesCreated:0};
}

async function readFixedFile(relative){
  const base=path.resolve(ROOT),resolved=await realpath(base);
  if(resolved.toLowerCase()!==base.toLowerCase())fail('UNSAFE_LOCAL_PATH');
  let target=base;const parts=relative.split('/');
  for(let i=0;i<parts.length;i++){
    target=path.join(target,parts[i]);const info=await lstat(target);
    if(info.isSymbolicLink()||(i<parts.length-1?!info.isDirectory():!info.isFile()||info.nlink!==1||info.size>65536))fail('UNSAFE_LOCAL_PATH');
  }
  const file=await open(target,constants.O_RDONLY|(constants.O_NOFOLLOW||0));
  try{const info=await file.stat(),current=await lstat(target);if(info.ino!==current.ino||info.dev!==current.dev||info.nlink!==1||info.size>65536)fail('UNSAFE_LOCAL_PATH');return await file.readFile('utf8');}finally{await file.close();}
}
export function parseReadKey(source){
  const name='REVENUECAT_SECRET_API_KEY_V2';
  if(typeof source!=='string'||source.split(/\r?\n/).filter(line=>new RegExp('^\\s*(?:export\\s+)?'+name+'\\s*=').test(line)).length!==1)fail('INVALID_READ_KEY');
  const value=parseEnv(source)[name];if(typeof value!=='string'||!/^sk_[A-Za-z0-9_.-]{12,4093}$/.test(value))fail('INVALID_READ_KEY');return value;
}
async function main(){
  const emit=process.stdout.write.bind(process.stdout);
  for(const method of ['log','info','warn','error','debug','trace','dir'])console[method]=()=>{};
  process.emitWarning=()=>{};
  try{
    if(process.argv.length!==2)fail('NO_ARGUMENTS_ALLOWED');
    const accounts=[];for(const run of QA.runs)accounts.push(JSON.parse(await readFixedFile(`work/billing-local/e2e/${run}/account.json`)));
    validateQAAccounts(accounts);
    const secret=parseReadKey(await readFixedFile('functions/.secret.local'));
    emit(JSON.stringify(await runReceiptQA({accounts,secret}))+'\n');
  }catch(error){emit(JSON.stringify(safeFailure(error))+'\n');process.exitCode=1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
