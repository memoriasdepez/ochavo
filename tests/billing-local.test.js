import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,symlink,link,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {readdirRecursive} from 'firebase-tools/lib/fsAsync.js';
import {resolveConfig,isFileLoadingAllowed,normalizePath} from 'vite';
import viteConfig from '../vite.config.js';
import {createLocalBillingPlan,validateLocalSecrets,stageBackend,LOCAL_BILLING_PROJECT,LOCAL_BILLING_URL,LOCAL_SECRET_NAMES} from '../scripts/billing-local.mjs';
import {purchaseConfiguration} from '../src/purchases-domain.js';
import {validateProductionBillingConfiguration} from '../scripts/release-config.mjs';

const config={revenuecatProjectId:'ae1cdb17',webPublicKey:'rcb_sb_localFixture'};
test('local launcher isolates all existing production Firebase and purchase options',()=>{
  const plan=createLocalBillingPlan(config,{PATH:'kept',VITE_FIREBASE_PROJECT_ID:'brote-62d26',VITE_BILLING_ENVIRONMENT:'production',VITE_REVENUECAT_ANDROID_KEY:'goog_live',VITE_REVENUECAT_WEB_KEY:'rcb_live',REVENUECAT_WEB_PUBLIC_KEY:'rcb_live',REVENUECAT_SECRET_API_KEY_V1:'old-must-not-reach-web',REVENUECAT_SECRET_API_KEY_V2:'read-must-not-reach-web',REVENUECAT_SECRET_API_KEY_CLEANUP_V2:'write-must-not-reach-web',GOOGLE_APPLICATION_CREDENTIALS:'private.json',BILLING_GEM_PACKS:'untrusted-live-config'});
  assert.equal(plan.env.PATH,'kept');assert.equal(plan.env.VITE_FIREBASE_PROJECT_ID,'demo-brote');
  assert.equal(plan.env.REVENUECAT_SECRET_API_KEY_V1,undefined);assert.equal(plan.env.GOOGLE_APPLICATION_CREDENTIALS,undefined);
  assert.equal(plan.env.REVENUECAT_SECRET_API_KEY_V2,undefined);assert.equal(plan.env.REVENUECAT_SECRET_API_KEY_CLEANUP_V2,undefined);
  assert.equal(plan.env.REVENUECAT_WEB_PUBLIC_KEY,undefined);assert.equal(plan.params.REVENUECAT_WEB_PUBLIC_KEY,config.webPublicKey);
  assert.equal(plan.env.BILLING_GEM_PACKS,undefined);assert.equal(plan.params.BILLING_GEM_PACKS,'[]');
  assert.equal(plan.env.VITE_REVENUECAT_ANDROID_KEY,'');assert.equal(plan.env.VITE_REVENUECAT_IOS_KEY,'');assert.equal(plan.env.VITE_WEB_ANALYTICS_ID,'');
  assert.equal(plan.env.VITE_BILLING_API_URL,LOCAL_BILLING_URL);assert.equal(plan.params.BILLING_ENABLED,'true');assert.equal(plan.params.BILLING_ENVIRONMENT,'sandbox');
  const platform={isNativePlatform:()=>false,getPlatform:()=>'web'};
  assert.equal(purchaseConfiguration(platform,{...plan.env,DEV:true}).configured,true);
  assert.equal(purchaseConfiguration(platform,{...plan.env,DEV:false}).configured,false);
  assert.throws(()=>validateProductionBillingConfiguration(plan.env));
  assert.ok(plan.emulatorArgs.includes(LOCAL_BILLING_PROJECT));assert.ok(plan.emulatorArgs.includes('auth,firestore,functions'));
});

test('launcher rejects production keys, private keys and arbitrary destinations before starting anything',()=>{
  for(const changes of [{webPublicKey:''},{webPublicKey:'rcb_live'},{webPublicKey:'sk_private'},{webPublicKey:'test_mock'},{revenuecatProjectId:''},{revenuecatProjectId:'bad\nBILLING_ENVIRONMENT=production'},{endpoint:'https://live.invalid'}]){
    assert.throws(()=>createLocalBillingPlan({...config,...changes}));
  }
});

test('local gem catalog accepts only approved benefits and sends them only to the sandbox server',()=>{
  const example=JSON.parse(readFileSync(new URL('../scripts/billing-local.example.json',import.meta.url),'utf8'));
  const plan=createLocalBillingPlan({...example,webPublicKey:config.webPublicKey});
  assert.deepEqual(JSON.parse(plan.params.BILLING_GEM_PACKS),[{productId:'ochavo_gems_200',gems:200},{productId:'ochavo_gems_600',gems:600},{productId:'ochavo_gems_1500',gems:1500}]);
  assert.equal(JSON.stringify(plan.env).includes('ochavo_gems_200'),false);
  assert.equal(createLocalBillingPlan({...config,gemProducts:[]}).params.BILLING_GEM_PACKS,'[]');
  assert.deepEqual(JSON.parse(createLocalBillingPlan({...config,gemProducts:[example.gemProducts[1]]}).params.BILLING_GEM_PACKS),[example.gemProducts[1]]);
  for(const gemProducts of [[{productId:'ochavo_gems_200',gems:99999}],[{productId:'unknown',gems:200}],[{productId:'viruta_lives_5',gems:200}],[{productId:'ochavo_gems_200',gems:200,price:1.99}],[example.gemProducts[0],example.gemProducts[0]],{},'broken'])assert.throws(()=>createLocalBillingPlan({...config,gemProducts}));
});

test('local secrets validation never includes unrelated keys or exposes rejected values',()=>{
  const secretLines=LOCAL_SECRET_NAMES.map((key,index)=>`${key}=fixture-private-value-${index}`).join('\n');
  const result=validateLocalSecrets(secretLines+'\nUNRELATED_SECRET=not-copied\nREVENUECAT_SECRET_API_KEY_V1=old-must-not-be-copied\nREVENUECAT_WEB_PUBLIC_KEY=rcb_unrelated\n');
  assert.doesNotMatch(result,/UNRELATED_SECRET|not-copied|SECRET_API_KEY_V1|old-must-not-be-copied|REVENUECAT_WEB_PUBLIC_KEY/);
  assert.deepEqual(LOCAL_SECRET_NAMES,['REVENUECAT_SECRET_API_KEY_V2','REVENUECAT_SECRET_API_KEY_CLEANUP_V2','REVENUECAT_WEBHOOK_SIGNING_SECRET']);
  for(const key of LOCAL_SECRET_NAMES)assert.match(result,new RegExp('^'+key+'=','m'));
  assert.throws(()=>validateLocalSecrets('REVENUECAT_SECRET_API_KEY_V1=do-not-print'),error=>!error.message.includes('do-not-print'));
  for(const unsafe of ['"fixture-secret-with\\nnewline"','"fixture-secret-with spaces"','"fixture-secret-with#comment"'])assert.throws(()=>validateLocalSecrets(secretLines.replace('fixture-private-value-0',unsafe)));
});

async function fixture(t){
  const prefix=path.join(tmpdir(),'ochavo-billing-local-'),root=await mkdtemp(prefix);
  t.after(async()=>{
    const target=path.resolve(root);
    assert.ok(target.startsWith(path.resolve(prefix))&&path.dirname(target)===path.resolve(tmpdir()));
    await rm(target,{recursive:true,force:true});
  });
  await mkdir(path.join(root,'functions/node_modules'),{recursive:true});
  for(const name of ['index.js','billing-domain.js','billing-service.js','package.json'])await writeFile(path.join(root,'functions',name),'fixture-'+name);
  return root;
}

test('staging leaves production parameters intact and links only the expected dependency directory',async t=>{
  const root=await fixture(t),plan=createLocalBillingPlan({...config,gemProducts:[{productId:'ochavo_gems_200',gems:200}]}),production=path.join(root,'functions/.env.local');
  await writeFile(production,'BILLING_ENVIRONMENT=production\nBILLING_ENABLED=false\n');
  for(let i=0;i<2;i++)await stageBackend(plan,'fixture local secrets\n',{root});
  const stage=path.join(root,'work/billing-local/backend');
  assert.equal(await readFile(production,'utf8'),'BILLING_ENVIRONMENT=production\nBILLING_ENABLED=false\n');
  assert.match(await readFile(path.join(stage,'.env.local'),'utf8'),/BILLING_ENVIRONMENT=sandbox/);
  const stagedParams=parseEnv(await readFile(path.join(stage,'.env.local'),'utf8'));
  assert.deepEqual(JSON.parse(stagedParams.BILLING_GEM_PACKS),[{productId:'ochavo_gems_200',gems:200}]);
  assert.equal(stagedParams.BILLING_ENVIRONMENT,'sandbox');
  assert.equal(stagedParams.REVENUECAT_WEB_PUBLIC_KEY,config.webPublicKey);
  assert.equal(await realpath(path.join(stage,'node_modules')),await realpath(path.join(root,'functions/node_modules')));
});

test('staging refuses an existing parent junction before writing any backend files',async t=>{
  const root=await fixture(t),outside=path.join(root,'outside');
  await mkdir(outside);await mkdir(path.join(root,'work'));
  await symlink(outside,path.join(root,'work/billing-local'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>stageBackend(createLocalBillingPlan(config),'fixture',{root}),/enlace/);
  assert.deepEqual(await readdir(outside),[]);
});

test('staging validates a preexisting dependency junction before copying source or secrets',async t=>{
  const root=await fixture(t),stage=path.join(root,'work/billing-local/backend'),outside=path.join(root,'outside');
  await mkdir(stage,{recursive:true});await mkdir(outside);
  await symlink(outside,path.join(stage,'node_modules'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(()=>stageBackend(createLocalBillingPlan(config),'fixture',{root}),/destino inesperado/);
  assert.deepEqual(await readdir(stage),['node_modules']);assert.deepEqual(await readdir(outside),[]);
});

test('staging refuses a hard-linked secret target without overwriting the original',async t=>{
  const root=await fixture(t),stage=path.join(root,'work/billing-local/backend'),original=path.join(root,'keep.txt');
  await mkdir(stage,{recursive:true});await writeFile(original,'unchanged');await link(original,path.join(stage,'.secret.local'));
  await assert.rejects(()=>stageBackend(createLocalBillingPlan(config),'fixture',{root}),/compartido/);
  assert.equal(await readFile(original,'utf8'),'unchanged');assert.deepEqual(await readdir(stage),['.secret.local']);
});

test('staging rejects leftover environment files that could alter emulator configuration',async t=>{
  const root=await fixture(t),stage=path.join(root,'work/billing-local/backend');
  await mkdir(stage,{recursive:true});await writeFile(path.join(stage,'.env'),'BILLING_ENVIRONMENT=production');
  await assert.rejects(()=>stageBackend(createLocalBillingPlan(config),'fixture',{root}),/archivos inesperados/);
  assert.deepEqual(await readdir(stage),['.env']);
});

test('effective Vite file policy blocks payment secrets and backend files while serving app sources',async t=>{
  const root=await fixture(t),configured=viteConfig({mode:'billing-local'});
  const resolved=await resolveConfig({...configured,root,configFile:false},'serve','billing-local');
  for(const file of ['functions/.secret.local','functions/index.js','work/billing-local/backend/.secret.local','work/billing-local/config.json','.secret.local','.env.local']){
    assert.equal(isFileLoadingAllowed(resolved,normalizePath(path.join(root,file))),false,file);
  }
  assert.equal(isFileLoadingAllowed(resolved,normalizePath(path.join(root,'src/purchases-domain.js'))),true);
});

test('local emulator configuration binds only loopback and never references production source or Hosting',()=>{
  const local=JSON.parse(readFileSync(new URL('../firebase.billing-local.json',import.meta.url),'utf8'));
  assert.equal(local.functions[0].source,'work/billing-local/backend');assert.equal(local.hosting,undefined);
  for(const name of ['auth','firestore','functions'])assert.equal(local.emulators[name].host,'127.0.0.1');
  assert.equal(local.emulators.functions.port,5001);
  const ignored=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  assert.match(ignored,/^\.secret\.local$/m);assert.match(ignored,/^\/work\/billing-local\/$/m);
});

test('Firebase source packaging excludes local parameters, private keys and fixtures',async t=>{
  const root=await fixture(t),source=path.join(root,'functions');
  const privateFiles=['.env','.env.production','.env.local','.secret.local','.secret.local.backup','secret.pem','private.key','signing.p8','store.p12','firebase-service-account.json','firebase-serviceAccount.json','firebase-service_account.json','project-adminsdk-key.json','credentials.json','key.dpapi','app.jks','app.keystore','firebase-debug.log'];
  for(const file of privateFiles)await writeFile(path.join(source,file),'fixture-only-not-a-real-secret');
  await mkdir(path.join(source,'test'));await writeFile(path.join(source,'test/private-fixture.json'),'fixture');
  const deployment=JSON.parse(readFileSync(new URL('../functions/firebase.billing.json',import.meta.url),'utf8'));
  const files=await readdirRecursive({path:source,ignoreStrings:deployment.functions[0].ignore});
  assert.deepEqual(files.map(file=>path.relative(source,file.name)).sort(),['billing-domain.js','billing-service.js','index.js','package.json']);
});
