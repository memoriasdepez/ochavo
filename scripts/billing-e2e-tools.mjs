/** Local QA only. This module never reads provider keys or calls a production service. */
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GAME_CONFIG,dayKeyAt,dayWindow,emptyGame,validateGame,validateCommerce,validateGemCommerce,validateSkippedWorlds} from '../src/game-domain.js';
import {GEM_PURCHASE_PRODUCTS,PURCHASE_PRODUCTS} from '../src/purchases-domain.js';
import {encodeFirestoreValue} from './seed-game-catalog.mjs';

export const PROJECT='demo-brote';
const AUTH='http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const OOBS='http://127.0.0.1:9099/emulator/v1/projects/demo-brote/oobCodes';
const FIRESTORE='http://127.0.0.1:8080/v1/projects/demo-brote/databases/(default)/documents';
const ROOT=fileURLToPath(new URL('../',import.meta.url));
const SAFE_ID=/^[A-Za-z0-9_-]{1,128}$/;
const SAFE_LABEL=/^[A-Za-z0-9_-]{1,48}$/;
const AUTH_METHODS=new Set(['accounts:signUp','accounts:sendOobCode','accounts:update','accounts:signInWithPassword','accounts:lookup']);
const fail=message=>{throw new Error(message);};

export function assertLocalUrl(value){
  let url;try{url=new URL(value);}catch{fail('La herramienta solo admite los emuladores locales de demo-brote.');}
  if(url.username||url.password||url.hash)fail('Destino local no permitido.');
  const auth=url.origin==='http://127.0.0.1:9099'&&(
    url.href===OOBS||url.pathname.startsWith('/identitytoolkit.googleapis.com/v1/')&&AUTH_METHODS.has(url.pathname.slice('/identitytoolkit.googleapis.com/v1/'.length))&&url.search==='?key=demo-brote-key');
  const firestore=url.origin==='http://127.0.0.1:8080'&&(url.pathname===new URL(FIRESTORE).pathname+':commit'||url.pathname.startsWith(new URL(FIRESTORE).pathname+'/'));
  if(!auth&&!firestore)fail('La herramienta solo admite los emuladores locales de demo-brote.');
  return url;
}

export function localClient(fetchImpl=fetch){
  async function json(url,{method='GET',body,token,missing=false}={}){
    assertLocalUrl(url);
    let response;try{response=await fetchImpl(url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(10000)});}catch{fail('No se pudo conectar con el emulador local. No se imprimen tokens ni respuestas.');}
    if(missing&&response.status===404)return null;
    if(!response.ok)fail('El emulador local rechazó la operación (HTTP '+response.status+'). No se imprimen tokens ni respuestas.');
    try{return await response.json();}catch{fail('El emulador devolvió una respuesta incompleta.');}
  }
  return {
    auth:(method,body)=>{if(!AUTH_METHODS.has(method))fail('Operación de Auth local no permitida.');return json(AUTH+'/'+method+'?key=demo-brote-key',{method:'POST',body});},
    oobs:()=>json(OOBS),
    document:(relative,token)=>{if(!/^users\/[A-Za-z0-9_-]{1,128}\/(game\/(main|skips)|commerce\/main|commerceGems\/main)$/.test(relative))fail('Lectura local fuera de la economía permitida.');return json(FIRESTORE+'/'+relative,{token,missing:true});},
    async receipts(uid){
      if(!SAFE_ID.test(uid))fail('UID local no válido.');
      let pageToken='',documents=[];
      for(let page=0;page<20;page++){
        const response=await json(FIRESTORE+'/users/'+uid+'/commercePurchases?pageSize=500'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''),{token:'owner'});
        documents.push(...(response.documents||[]));pageToken=response.nextPageToken||'';
        if(!pageToken)return documents;
      }
      fail('El historial local supera el límite de lectura. No se ha truncado la evidencia.');
    },
    async seed(records){
      if(!Array.isArray(records)||records.some(record=>!/^game(Config|Catalog|Days)\/[A-Za-z0-9_-]+$/.test(record.path)))fail('Solo se pueden sembrar configuración, calendario y catálogo; nunca monederos o ventajas.');
      const prefix='projects/demo-brote/databases/(default)/documents';
      for(let index=0;index<records.length;index+=400){
        const writes=records.slice(index,index+400).map(record=>({update:{name:prefix+'/'+record.path,fields:encodeFirestoreValue(record.data).mapValue.fields}}));
        await json(FIRESTORE+':commit',{method:'POST',token:'owner',body:{writes}});
      }
      return records.length;
    }
  };
}

export function makeIdentity(now=Date.now()){
  const nonce=randomUUID().replaceAll('-','');
  return {runId:new Date(now).toISOString().replace(/[:.]/g,'-')+'-'+nonce,email:'qa-pagos-'+nonce+'@ochavo.invalid',password:'LocalQA2026!'+randomBytes(16).toString('hex')};
}
export function validateAccount(account){
  if(account?.schemaVersion!==1||account.projectId!==PROJECT||account.purpose!=='sandbox-payment-e2e'||!SAFE_ID.test(account.runId||'')||!SAFE_ID.test(account.uid||'')||!/^qa-pagos-[a-f0-9]{32}@ochavo\.invalid$/.test(account.email||'')||!/^LocalQA2026![a-f0-9]{32}$/.test(account.password||'')||account.emailVerified!==true)fail('El archivo no es una cuenta ficticia verificada de demo-brote.');
  return account;
}
export async function signInLocal(account,client){
  validateAccount(account);
  const login=await client.auth('accounts:signInWithPassword',{email:account.email,password:account.password,returnSecureToken:true});
  if(login.localId!==account.uid||typeof login.idToken!=='string'||!login.idToken)fail('La identidad local no coincide con esta ejecución.');
  const lookup=await client.auth('accounts:lookup',{idToken:login.idToken});
  if(lookup.users?.length!==1||lookup.users[0].localId!==account.uid||lookup.users[0].email!==account.email||lookup.users[0].emailVerified!==true)fail('La cuenta ficticia local todavía no está verificada.');
  return login.idToken;
}
export async function createVerifiedLocalAccount(client,{identity=makeIdentity(),now=Date.now()}={}){
  if(!SAFE_ID.test(identity.runId)||!/^qa-pagos-[a-f0-9]{32}@ochavo\.invalid$/.test(identity.email)||!/^LocalQA2026![a-f0-9]{32}$/.test(identity.password))fail('Identidad ficticia no válida.');
  // Never reuse an old user: a duplicate or failed sign-up must stop this run.
  const signup=await client.auth('accounts:signUp',{email:identity.email,password:identity.password,returnSecureToken:true});
  if(!SAFE_ID.test(signup.localId||'')||typeof signup.idToken!=='string'||!signup.idToken)fail('Auth local no devolvió una identidad válida.');
  await client.auth('accounts:sendOobCode',{requestType:'VERIFY_EMAIL',idToken:signup.idToken});
  const codes=await client.oobs(),code=codes.oobCodes?.filter(item=>item.email===identity.email&&item.requestType==='VERIFY_EMAIL').at(-1);
  if(typeof code?.oobCode!=='string'||!code.oobCode)fail('No se encontró la verificación en Auth Emulator.');
  await client.auth('accounts:update',{oobCode:code.oobCode});
  const account={schemaVersion:1,projectId:PROJECT,purpose:'sandbox-payment-e2e',...identity,uid:signup.localId,emailVerified:true,createdAt:new Date(now).toISOString(),providerEndToEndPurchaseTested:false};
  await signInLocal(account,client); // A fresh token is required after verification; never persist it.
  return account;
}

export function gameSeedRecords(catalog,now=Date.now()){
  if(!catalog||typeof catalog!=='object'||Array.isArray(catalog)||Object.keys(catalog).some(id=>!SAFE_ID.test(id)))fail('Catálogo local no válido.');
  // Three days permit midnight checks without provisioning years of unused data.
  const today=dayKeyAt(now),ordinal=dayWindow(today).ordinal;
  const days=[-1,0,1].map(offset=>{
    const day=new Date((ordinal+offset)*86400000).toISOString().slice(0,10),window=dayWindow(day);
    return {path:'gameDays/'+day,data:{dayKey:day,ordinal:window.ordinal,startAt:{$timestamp:new Date(window.startAt).toISOString()},endAt:{$timestamp:new Date(window.endAt).toISOString()}}};
  });
  return [{path:'gameConfig/economy',data:GAME_CONFIG},...days,...Object.entries(catalog).map(([id,data])=>({path:'gameCatalog/'+id,data}))];
}
export function decodeFirestore(value){
  if(value===null||value===undefined)return null;
  if(Object.hasOwn(value,'stringValue'))return value.stringValue;
  if(Object.hasOwn(value,'booleanValue'))return value.booleanValue;
  if(Object.hasOwn(value,'integerValue')){const n=Number(value.integerValue);if(!Number.isSafeInteger(n))fail('Entero no válido en el emulador.');return n;}
  if(Object.hasOwn(value,'doubleValue'))return value.doubleValue;
  if(Object.hasOwn(value,'nullValue'))return null;
  if(Object.hasOwn(value,'timestampValue'))return value.timestampValue;
  if(Object.hasOwn(value,'arrayValue'))return (value.arrayValue.values||[]).map(decodeFirestore);
  if(Object.hasOwn(value,'mapValue'))return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decodeFirestore(item)]));
  fail('Campo de Firestore local no compatible.');
}
const decodeDocument=document=>document?decodeFirestore({mapValue:{fields:document.fields||{}}}):null;
export function summarizeEconomy({game=null,commerce=null,commerceGems=null,skips=null,receipts=[]},now=Date.now()){
  const earned=game?validateGame(game):emptyGame(),lives=validateCommerce(commerce),gems=validateGemCommerce(commerceGems);
  if(commerce&&commerce.environment!=='sandbox'||commerceGems&&commerceGems.environment!=='sandbox')fail('La observación contiene compras fuera de sandbox.');
  const seen=new Set(),ledger=receipts.map(receipt=>{
    if(typeof receipt.key!=='string'||!/^[a-f0-9]{64}$/.test(receipt.key)||seen.has(receipt.key)||typeof receipt.active!=='boolean')fail('Comprobante local no válido o duplicado.');
    seen.add(receipt.key);
    if(receipt.gems!==undefined){
      if(!Object.hasOwn(GEM_PURCHASE_PRODUCTS,receipt.productId)||receipt.unitGems!==GEM_PURCHASE_PRODUCTS[receipt.productId]||!Number.isSafeInteger(receipt.quantity)||receipt.quantity<1||receipt.quantity>100||receipt.gems!==receipt.unitGems*receipt.quantity||receipt.lives!==0)fail('Cantidad o producto incorrectos en el comprobante de gemas.');
    }else if(!Number.isSafeInteger(receipt.lives)||receipt.lives<5||receipt.lives>500||receipt.lives%5!==0||receipt.productId!==undefined&&receipt.productId!==PURCHASE_PRODUCTS.lives)fail('Comprobante de vidas no válido.');
    return {key:receipt.key,productId:receipt.productId||PURCHASE_PRODUCTS.lives,active:receipt.active,gems:receipt.gems||0,lives:receipt.lives,quantity:receipt.quantity||receipt.lives/5};
  }).sort((a,b)=>a.key.localeCompare(b.key));
  const granted=ledger.reduce((sum,item)=>sum+(item.active?item.gems:0),0),lifeGranted=ledger.reduce((sum,item)=>sum+(item.active?item.lives:0),0);
  if(granted!==gems.granted||lifeGranted!==lives.paidGranted)fail('El saldo y sus comprobantes locales no coinciden; espera a que termine la sincronización y repite la lectura.');
  return {earnedStored:!!game,earnedGems:earned.gems,paidGems:gems.balance,gems:earned.gems+gems.balance,gemGranted:gems.granted,gemConsumed:gems.consumed,gemDebt:Math.max(0,gems.consumed-gems.granted),gemRevision:gems.revision,dailyLives:earned.lives,paidLives:lives.paidLives,totalLives:earned.lives+lives.paidLives,paidLifeGranted:lives.paidGranted,paidLifeConsumed:lives.paidConsumed,commerceRevision:lives.revision,premiumUntilMs:lives.premiumUntilMs,premiumActive:lives.premiumUntilMs>now,skippedWorldIds:validateSkippedWorlds(skips?.worldIds||[]),receipts:ledger};
}
export async function observeLocal(account,client,now=Date.now()){
  const token=await signInLocal(account,client),base='users/'+account.uid+'/';
  const [game,commerce,commerceGems,skips,receipts]=await Promise.all([client.document(base+'game/main',token),client.document(base+'commerce/main',token),client.document(base+'commerceGems/main',token),client.document(base+'game/skips',token),client.receipts(account.uid)]);
  return summarizeEconomy({game:decodeDocument(game),commerce:decodeDocument(commerce),commerceGems:decodeDocument(commerceGems),skips:decodeDocument(skips),receipts:receipts.map(decodeDocument)},now);
}

export function receiptFingerprint(value){
  if(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))return value;
  if(typeof value!=='string'||!/^sandbox:(rc_billing|app_store|play_store):[\x21-\x7E]{1,255}$/.test(value))fail('Usa el hash del comprobante o sandbox:rc_billing:ID_TRANSACCION exacto del SDK.');
  return createHash('sha256').update(value).digest('hex');
}

export function compareEconomy(before,after,{expect,amount=0,receiptKey=null}={}){
  if(!['unchanged','purchase','spend','refund','lives-purchase','premium-active'].includes(expect)||!Number.isSafeInteger(amount)||amount<0)fail('Comparación local no válida.');
  if(receiptKey)receiptKey=receiptFingerprint(receiptKey);
  const checks=[],check=(name,actual,expected)=>checks.push({name,passed:JSON.stringify(actual)===JSON.stringify(expected),expected,actual});
  const same=keys=>keys.forEach(key=>check(key,after[key],before[key]));
  check('earned-state-persisted-before',before.earnedStored,true);
  check('earned-state-persisted-after',after.earnedStored,true);
  check('balance-derived',after.paidGems,Math.max(0,after.gemGranted-after.gemConsumed));
  check('total-derived',after.gems,after.earnedGems+after.paidGems);
  if(expect==='purchase'||expect==='refund'){
    if(!amount||!receiptKey)fail('Compra/devolución requieren importe de gemas y el comprobante sandbox exacto.');
    same(['earnedGems','gemConsumed','paidLifeGranted','paidLifeConsumed','premiumUntilMs']);
    check('gemGranted',after.gemGranted,before.gemGranted+(expect==='purchase'?amount:-amount));
    const old=before.receipts.find(item=>item.key===receiptKey),current=after.receipts.find(item=>item.key===receiptKey);
    check('receipt-amount',current?.gems,amount);check('receipt-active',current?.active,expect==='purchase');
    check('receipt-was-active',old?.active??false,expect==='refund');
  }else if(expect==='spend'){
    if(!amount)fail('El gasto requiere una cantidad positiva.');
    const fromEarned=Math.min(amount,before.earnedGems),fromPaid=amount-fromEarned;
    check('sufficient-funds',before.gems>=amount,true);
    check('earned-first',after.earnedGems,before.earnedGems-fromEarned);
    check('purchased-consumption',after.gemConsumed,before.gemConsumed+fromPaid);
    same(['gemGranted','paidLifeGranted','paidLifeConsumed','premiumUntilMs','receipts']);
  }else if(expect==='lives-purchase'){
    if(amount!==5||!receiptKey)fail('La compra de vidas requiere cantidad 5 y comprobante exacto.');
    same(['earnedGems','gemGranted','gemConsumed','paidLifeConsumed','premiumUntilMs']);
    check('paidLifeGranted',after.paidLifeGranted,before.paidLifeGranted+5);
    const current=after.receipts.find(item=>item.key===receiptKey);
    check('receipt-lives',current?.lives,5);check('receipt-active',current?.active,true);
    check('receipt-was-active',before.receipts.find(item=>item.key===receiptKey)?.active??false,false);
  }else if(expect==='premium-active'){
    same(['earnedGems','gemGranted','gemConsumed','paidLifeGranted','paidLifeConsumed','receipts']);check('premium-active',after.premiumActive,true);
  }else same(['earnedGems','gemGranted','gemConsumed','paidLifeGranted','paidLifeConsumed','premiumUntilMs','skippedWorldIds','receipts']);
  return {passed:checks.every(item=>item.passed),checks,providerEndToEndPurchaseTested:false,note:'Comparación de datos locales. La compra SDK y la evidencia del proveedor se validan por separado.'};
}

async function safeRunDirectory(runId,{create=false}={}){
  if(!SAFE_ID.test(runId||''))fail('Identificador de ejecución no válido.');
  let folder=ROOT;
  for(const part of ['work','billing-local','e2e',runId]){
    folder=path.join(folder,part);
    if(create)await mkdir(folder).catch(error=>{if(error.code!=='EEXIST')throw error;});
    const stat=await lstat(folder);if(stat.isSymbolicLink()||!stat.isDirectory())fail('El destino local no puede ser un enlace o archivo.');
  }
  return folder;
}
export async function writeRunFile(runId,name,value){
  if(name!=='account.json'&&!/^[A-Za-z0-9_-]{1,48}\.json$/.test(name))fail('Nombre de evidencia no válido.');
  const folder=await safeRunDirectory(runId,{create:true});
  await writeFile(path.join(folder,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  return path.join(folder,name);
}
export async function readRunFile(runId,name){
  if(name!=='account.json'&&!/^[A-Za-z0-9_-]{1,48}\.json$/.test(name))fail('Nombre de evidencia no válido.');
  const filename=path.join(await safeRunDirectory(runId),name),stat=await lstat(filename);
  if(stat.isSymbolicLink()||!stat.isFile()||stat.nlink!==1||stat.size>1000000)fail('Archivo local inesperado.');
  try{return JSON.parse(await readFile(filename,'utf8'));}catch{fail('No se pudo leer la evidencia local.');}
}
export async function readLocalCatalog(){return JSON.parse(await readFile(new URL('../src/content/game-catalog.json',import.meta.url),'utf8'));}
export function validateLabel(label){if(!SAFE_LABEL.test(label||'')||label==='account')fail('Etiqueta de observación no válida.');return label;}
