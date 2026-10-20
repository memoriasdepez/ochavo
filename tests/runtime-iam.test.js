import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {RUNTIME_ACCOUNTS,planRuntimeIAM,applyRuntimeIAM,addRuntimeGrants,parseIAMArguments,safeIAMFailure} from '../work/payments/runtime-iam.mjs';
import {PROJECT_ID,SECRET_NAMES,createGoogleClients,openLocalStore} from '../work/payments/store-server-secrets.mjs';

const number='123456789',now=()=>1_700_000_000_000;
const email=id=>`${id}@${PROJECT_ID}.iam.gserviceaccount.com`,member=id=>'serviceAccount:'+email(id);
const condition={expression:'request.time < timestamp("2030-01-01T00:00:00Z")',title:'Existing condition',description:'Keep all fields',location:'fixture'};
const basePolicy=()=>({version:3,etag:'fixture-etag',bindings:[{role:'roles/viewer',members:['group:fixture@example.invalid'],condition}],auditConfigs:[{service:'allServices',auditLogConfigs:[{logType:'ADMIN_READ',exemptedMembers:['user:fixture@example.invalid']}]}]});
function fixture(){
  const f={calls:[],mutations:[],record:null,accounts:{},policies:Object.fromEntries(['project',...SECRET_NAMES].map(scope=>[scope,basePolicy()])),actAs:true,hook:async()=>null,saveHook:async()=>{},serviceState:'ENABLED'};
  const invoke=async(kind,method,resource,body,options)=>{
    const call={kind,method,resource,body,options};f.calls.push(call);const intercepted=await f.hook(call);if(intercepted)return intercepted;
    if(kind==='projects'&&method==='GET')return {status:200,body:{projectId:PROJECT_ID,projectNumber:number,lifecycleState:'ACTIVE'}};
    if(kind==='serviceUsage')return {status:200,body:{name:resource.slice(1),state:f.serviceState}};
    if(['functionsV1','functionsV2'].includes(kind))return {status:200,body:{functions:[]}};
    if(kind==='run')return {status:200,body:{services:[]}};
    if(kind==='eventarc')return {status:200,body:{triggers:[]}};
    if(kind==='iam'){
      if(resource.endsWith(':testIamPermissions'))return {status:200,body:{permissions:f.actAs?['iam.serviceAccounts.actAs']:[]}};
      if(method==='GET'){const found=Object.values(f.accounts).find(account=>resource.endsWith('/'+account.email));return {status:found?200:404,body:structuredClone(found||{})};}
      assert.equal(resource,`/projects/${PROJECT_ID}/serviceAccounts`);assert.ok(RUNTIME_ACCOUNTS.some(value=>value.id===body.accountId));
      assert.equal(f.record.journal.find(entry=>entry.id==='account:'+body.accountId)?.phase,'started');
      f.mutations.push(call);const account={projectId:PROJECT_ID,email:email(body.accountId),uniqueId:String(100000+f.mutations.length),name:`projects/${PROJECT_ID}/serviceAccounts/${email(body.accountId)}`};f.accounts[body.accountId]=account;return {status:200,body:structuredClone(account)};
    }
    const scope=kind==='projects'?'project':SECRET_NAMES.find(name=>resource.includes('/secrets/'+name+':'));
    assert.ok(scope,'fixed scope only');
    if(resource.endsWith(':getIamPolicy'))return {status:200,body:structuredClone(f.policies[scope])};
    assert.ok(resource.endsWith(':setIamPolicy'));assert.equal(f.record.journal.find(entry=>entry.id==='policy:'+scope)?.phase,'started');
    assert.equal(body.policy.etag,f.policies[scope].etag);f.mutations.push(call);f.policies[scope]={...structuredClone(body.policy),etag:'updated-'+f.mutations.length};return {status:200,body:structuredClone(f.policies[scope])};
  };
  f.clients=Object.fromEntries(['projects','secrets','iam','serviceUsage','functionsV1','functionsV2','run','eventarc'].map(kind=>[kind,{get:(resource,options)=>invoke(kind,'GET',resource,undefined,options),post:(resource,body,options)=>invoke(kind,'POST',resource,body,options)}]));
  f.saveRecord=async value=>{await f.saveHook(value);f.record=structuredClone(value);};
  f.plan=extra=>planRuntimeIAM({clients:f.clients,record:f.record,saveRecord:f.saveRecord,now,...extra});
  f.apply=extra=>applyRuntimeIAM({clients:f.clients,record:f.record,approvedDigest:f.record?.planDigest,saveRecord:f.saveRecord,now,...extra});
  return f;
}

test('plan is read-only and names only reviewed accounts, grants, secret resources and inventory coverage',async()=>{
  const f=fixture(),result=await f.plan();assert.equal(result.state,'PLAN_READY_NOT_APPLIED');assert.equal(f.mutations.length,0);assert.equal(result.accountsToCreate.length,3);assert.equal(result.grantsToAdd.project.length,6);
  assert.deepEqual(result.inventory.pubsub.projectGrants,[]);assert.equal(result.inventory.computeRemovalEligible,false);assert.match(result.inventory.coverage,/cloud-run-services-europe-west1/);
  assert.deepEqual(f.record.plan.policies.project,basePolicy());assert.deepEqual(f.record.journal,[]);
  for(const call of f.calls){assert.equal(call.options.retries,0);assert.deepEqual(call.options.retryCodes,[]);assert.equal(call.options.redirect,'error');assert.deepEqual(call.options.skipLog,{body:true,resBody:true,queryParams:true});assert.doesNotMatch(call.resource,/:access|:enable|keys|setIamPolicy/);}
  assert.deepEqual(f.calls.find(call=>call.resource.endsWith(':getIamPolicy')&&call.kind==='projects').body,{options:{requestedPolicyVersion:3}});
  assert.equal(f.calls.find(call=>call.kind==='secrets').options.queryParams['options.requestedPolicyVersion'],3);
  const expected=JSON.parse(await readFile(new URL('../work/payments/runtime-iam-plan.json',import.meta.url),'utf8'));
  assert.deepEqual(RUNTIME_ACCOUNTS.map(value=>({accountId:value.id,displayName:value.displayName,projectRoles:[...value.roles],secretAccess:[...value.secrets]})),expected.accounts.map(({accountId,displayName,projectRoles,secretAccess})=>({accountId,displayName,projectRoles,secretAccess})));
});

test('apply requires exact approval and adds only fixed runtime accounts/grants with durable journal and no operator/Compute/PubSub changes',async()=>{
  const f=fixture();await f.plan();await assert.rejects(f.apply({approvedDigest:'a'.repeat(64)}),{code:'PLAN_APPROVAL_REQUIRED'});assert.equal(f.mutations.length,0);
  const result=await f.apply();assert.equal(result.state,'RUNTIME_GRANTS_VERIFIED_NOT_DEPLOYED');assert.equal(result.purchasesEnabled,false);assert.equal(result.cleanupRunInvoker,'PENDING_RESOLVED_SERVICE');assert.equal(f.mutations.length,7);
  assert.equal(f.record.journal.length,7);assert.ok(f.record.journal.every(entry=>entry.phase==='confirmed'));
  for(const value of Object.values(f.policies)){assert.equal(value.version,3);assert.deepEqual(value.bindings[0],basePolicy().bindings[0]);assert.deepEqual(value.auditConfigs,basePolicy().auditConfigs);}
  for(const call of f.mutations){assert.doesNotMatch(JSON.stringify(call.body),/compute@|gcp-sa-pubsub|roles\/iam|roles\/run.invoker|Owner|Editor/);}
  assert.equal(f.policies[SECRET_NAMES[1]].bindings.at(-1).members.length,1);assert.equal(f.policies[SECRET_NAMES[1]].bindings.at(-1).members[0],member('ochavo-billing-cleanup'));
  assert.equal(f.policies[SECRET_NAMES[2]].bindings.at(-1).members[0],member('ochavo-billing-webhook'));
  await f.apply();assert.equal(f.mutations.length,7,'confirmed rerun performs no write');
  f.actAs=false;const lacking=await f.apply();assert.ok(Object.values(lacking.actAs).every(value=>value===false));assert.equal(f.mutations.length,7,'missing actAs is reported, never granted');
});

test('current etag, members, complete conditions and auditConfigs are preserved after unrelated concurrent additions',async()=>{
  const f=fixture();await f.plan();f.policies.project.etag='newer-etag';f.policies.project.bindings.push({role:'roles/datastore.user',members:['serviceAccount:unrelated@example.invalid']});f.policies.project.auditConfigs.push({service:'storage.googleapis.com',auditLogConfigs:[{logType:'DATA_WRITE'}]});
  await f.apply();const project=f.mutations.find(call=>call.resource===`/projects/${PROJECT_ID}:setIamPolicy`);
  assert.equal(project.body.policy.etag,'newer-etag');assert.ok(project.body.policy.bindings.find(value=>value.role==='roles/datastore.user').members.includes('serviceAccount:unrelated@example.invalid'));assert.equal(project.body.policy.auditConfigs.length,2);assert.deepEqual(project.body.policy.bindings[0].condition,condition);
});

test('etag conflicts stop without automatic retry and require a new reviewed plan',async()=>{
  const f=fixture();await f.plan();let attempts=0;f.hook=async call=>{if(call.resource===`/projects/${PROJECT_ID}:setIamPolicy`){attempts++;return {status:409,body:{error:{message:'FIXTURE_PRIVATE'}}};}};
  await assert.rejects(f.apply(),{code:'IAM_CONFLICT_REPLAN_REQUIRED'});assert.equal(f.record.journal.at(-1).phase,'conflict');assert.equal(attempts,1);
  await assert.rejects(f.apply(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(attempts,1);
  f.hook=async()=>null;const oldDigest=f.record.planDigest;await f.plan();assert.notEqual(f.record.planDigest,oldDigest);assert.equal(f.record.history.length,1);await f.apply();assert.equal(f.mutations.filter(call=>call.kind==='iam').length,3);
});

test('Google policy set ordering is immaterial, but lost unrelated grants after an uncertain write require review',async()=>{
  const f=fixture();await f.plan();
  f.hook=async call=>{
    if(call.resource.endsWith(':getIamPolicy')){
      const scope=call.kind==='projects'?'project':SECRET_NAMES.find(name=>call.resource.includes('/secrets/'+name+':'));
      const body=structuredClone(f.policies[scope]);body.bindings.reverse();for(const binding of body.bindings)binding.members.reverse();body.auditConfigs.reverse();return {status:200,body};
    }
  };
  await f.apply();assert.equal(f.mutations.length,7);
  const lost=fixture();await lost.plan();let attempts=0;
  lost.hook=async call=>{if(call.resource===`/projects/${PROJECT_ID}:setIamPolicy`){attempts++;lost.policies.project={...structuredClone(call.body.policy),etag:'lost-response',bindings:call.body.policy.bindings.slice(1)};throw Error('network');}};
  await assert.rejects(lost.apply(),{code:'REQUEST_OUTCOME_UNKNOWN'});await assert.rejects(lost.apply(),{code:'POST_WRITE_POLICY_CHANGED_REVIEW_REQUIRED'});assert.equal(attempts,1);
});

test('unconditional policies returned as version 1 still confirm exact additions while every set requests version 3',async()=>{
  const f=fixture();for(const scope of Object.keys(f.policies))f.policies[scope]={version:1,etag:'initial',bindings:[]};await f.plan();
  f.hook=async call=>{
    if(call.resource.endsWith(':getIamPolicy')){
      const scope=call.kind==='projects'?'project':SECRET_NAMES.find(name=>call.resource.includes('/secrets/'+name+':'));
      return {status:200,body:{...structuredClone(f.policies[scope]),version:1}};
    }
  };
  const result=await f.apply();assert.equal(result.state,'RUNTIME_GRANTS_VERIFIED_NOT_DEPLOYED');assert.ok(f.mutations.filter(call=>call.resource.endsWith(':setIamPolicy')).every(call=>call.body.policy.version===3));
});

test('an ambiguous mutation is never repeated; a read can confirm its effect before continuing',async()=>{
  const f=fixture();await f.plan();let attempts=0;
  f.hook=async call=>{if(call.resource===`/projects/${PROJECT_ID}:setIamPolicy`){attempts++;if(attempts===1){f.policies.project={...structuredClone(call.body.policy),etag:'applied-but-response-lost'};throw Error('FIXTURE_TOKEN');}}};
  await assert.rejects(f.apply(),error=>{assert.equal(error.code,'REQUEST_OUTCOME_UNKNOWN');assert.doesNotMatch(JSON.stringify(safeIAMFailure(error)),/FIXTURE_TOKEN/);return true;});assert.equal(f.record.journal.at(-1).phase,'started');
  await assert.rejects(f.plan(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});await f.apply();assert.equal(attempts,1);assert.ok(f.record.journal.every(entry=>entry.phase==='confirmed'));
  const absent=fixture();await absent.plan();let posts=0;absent.hook=async call=>{if(call.kind==='iam'&&call.method==='POST'&&!call.resource.endsWith('testIamPermissions')){posts++;throw Error('lost');}};
  await assert.rejects(absent.apply(),{code:'REQUEST_OUTCOME_UNKNOWN'});await assert.rejects(absent.apply(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(posts,1);
});

test('record failure before mutation prevents it; record failure after mutation keeps a recoverable started operation',async()=>{
  const f=fixture();await f.plan();f.saveHook=async record=>{if(record.journal.length)throw Error('disk full');};await assert.rejects(f.apply(),{code:'LOCAL_RECORD_FAILED'});assert.equal(f.mutations.length,0);
  const after=fixture();await after.plan();after.saveHook=async record=>{if(record.journal[0]?.phase==='confirmed')throw Error('disk lost');};await assert.rejects(after.apply(),{code:'LOCAL_RECORD_FAILED'});assert.equal(after.record.journal[0].phase,'started');assert.equal(after.mutations.length,1);
  after.saveHook=async()=>{};await after.apply();assert.equal(after.mutations.filter(call=>call.kind==='iam').length,3,'does not recreate the first account');
});

test('wrong project, stale/tampered plan, replaced accounts and unexpected runtime grants fail closed',async()=>{
  const f=fixture();await assert.rejects(f.plan({projectId:'other'}),{code:'INVALID_TARGET'});assert.equal(f.calls.length,0);
  f.hook=async call=>call.kind==='projects'&&call.method==='GET'?{status:200,body:{projectId:'other',projectNumber:number}}:null;await assert.rejects(f.plan(),{code:'INVALID_REMOTE_PROJECT'});assert.equal(f.mutations.length,0);
  const old=fixture();await old.plan();await assert.rejects(old.apply({now:()=>now()+86400001}),{code:'PLAN_EXPIRED_REVIEW_REQUIRED'});assert.equal(old.mutations.length,0);
  const tampered=fixture();await tampered.plan();tampered.record.plan.intent[0].roles.push('roles/owner');await assert.rejects(tampered.apply(),{code:'INVALID_LOCAL_RECORD'});assert.equal(tampered.mutations.length,0);
  for(const binding of [{role:'roles/owner',members:[member('ochavo-billing-read')]},{role:'roles/datastore.user',members:[member('ochavo-billing-read')],condition}]){
    const broad=fixture();broad.policies.project.bindings.push(binding);await assert.rejects(broad.plan(),error=>/RUNTIME_GRANT_REQUIRES_REVIEW/.test(error.code));assert.equal(broad.mutations.length,0);
  }
  const replaced=fixture();await replaced.plan();await replaced.apply();await replaced.plan();replaced.accounts['ochavo-billing-read'].uniqueId='999999';await assert.rejects(replaced.apply(),{code:'ACCOUNT_IDENTITY_CHANGED_REVIEW_REQUIRED'});
});

test('inventory reports Compute/PubSub exact conditional grants, pagination, disabled APIs and incomplete coverage without mutating',async()=>{
  const f=fixture(),compute=number+'-compute@developer.gserviceaccount.com';f.policies.project.bindings.push({role:'roles/run.invoker',members:['serviceAccount:'+compute],condition},{role:'roles/iam.serviceAccountTokenCreator',members:[`serviceAccount:service-${number}@gcp-sa-pubsub.iam.gserviceaccount.com`]});
  f.hook=async call=>{
    if(call.kind==='functionsV1')return {status:200,body:call.options.queryParams.pageToken?{functions:[]}:{functions:[{name:`projects/${PROJECT_ID}/locations/us-east1/functions/other`,serviceAccountEmail:compute}],nextPageToken:'fixture-token'}};
    if(call.kind==='eventarc')return {status:200,body:{triggers:[],unreachable:['other-region']}};
    if(call.kind==='run')return {status:403,body:{error:{message:'PRIVATE_ERROR'}}};
  };
  const result=await f.plan();assert.equal(result.inventory.compute.projectGrants[0].condition.description,condition.description);assert.equal(result.inventory.pubsub.projectGrants[0].role,'roles/iam.serviceAccountTokenCreator');assert.equal(result.inventory.lists[0].computeUses.length,1);assert.equal(result.inventory.lists.find(value=>value.kind==='eventarc').state,'INCOMPLETE');assert.equal(result.inventory.lists.find(value=>value.kind==='run').state,'INCOMPLETE');assert.equal(f.mutations.length,0);assert.doesNotMatch(JSON.stringify(result),/fixture-token|PRIVATE_ERROR/);
  const disabled=fixture();disabled.serviceState='DISABLED';const second=await disabled.plan();assert.ok(second.inventory.lists.every(value=>value.state==='DISABLED'));assert.equal(disabled.calls.filter(call=>['functionsV1','functionsV2','run','eventarc'].includes(call.kind)).length,0);
});

test('grant merge preserves full unrelated bindings, rejects invalid etag/v3 and cannot select arbitrary secrets',()=>{
  for(const value of [{...basePolicy(),etag:''},{...basePolicy(),version:1}])assert.throws(()=>addRuntimeGrants(value,'project'));
  assert.throws(()=>addRuntimeGrants(basePolicy(),'ARBITRARY_SECRET'));
  const merged=addRuntimeGrants(basePolicy(),'project');assert.deepEqual(merged.bindings[0],basePolicy().bindings[0]);assert.deepEqual(addRuntimeGrants(merged,'project'),merged);
  assert.deepEqual(parseIAMArguments(['plan']),{mode:'plan'});assert.deepEqual(parseIAMArguments(['apply','--approve-plan','a'.repeat(64)]),{mode:'apply',approvedDigest:'a'.repeat(64)});
  for(const args of [[],['apply'],['plan','--project','other'],['apply','--force'],['plan','--dry-run']])assert.throws(()=>parseIAMArguments(args),{code:'INVALID_ARGUMENTS'});
  assert.deepEqual(safeIAMFailure(Object.assign(Error('PRIVATE'),{code:'PRIVATE'})),{state:'FAILED',httpStatus:0});
});

test('IAM clients have fixed Google origins and silence Firebase before any auth or API setup',async()=>{
  const constructed=[],logs=[],logger={debug:value=>logs.push(value),log:value=>logs.push(value)};
  const clients=await createGoogleClients({includeRuntimeIAM:true,env:{},load:name=>{
    if(name.endsWith('/logger'))return {logger};assert.equal(logger.silent,true);
    if(name.endsWith('/auth'))return {getProjectDefaultAccount:()=>({user:{},tokens:{}})};
    if(name.endsWith('/requireAuth'))return {requireAuth:async()=>{logger.debug('FIXTURE_TOKEN');logger.log('FIXTURE_SECRET');return 'fixture';}};
    if(name.endsWith('/apiv2'))return {Client:class{constructor(options){constructed.push(options);}}};assert.fail('unexpected import');
  }});
  assert.deepEqual(logs,[]);assert.equal(Object.keys(clients).length,8);assert.deepEqual(constructed.map(value=>value.urlPrefix),['https://cloudresourcemanager.googleapis.com','https://secretmanager.googleapis.com','https://serviceusage.googleapis.com','https://iam.googleapis.com','https://cloudfunctions.googleapis.com','https://cloudfunctions.googleapis.com','https://run.googleapis.com','https://eventarc.googleapis.com']);
  await assert.rejects(createGoogleClients({includeRuntimeIAM:'https://other.invalid',load:()=>assert.fail('must reject before import')}),{code:'INVALID_CLIENT_SELECTION'});
  for(const env of [{GOOGLE_APPLICATION_CREDENTIALS:'private'},{FIREBASE_TOKEN:'private'},{FIRESTORE_EMULATOR_HOST:'localhost:8080'}])await assert.rejects(createGoogleClients({includeRuntimeIAM:true,env,load:()=>assert.fail('must reject before import')}),{code:'UNEXPECTED_AUTH_ENVIRONMENT'});
});

test('IAM file scope has its own lock/journal and cannot read secret source',async t=>{
  const parent=fileURLToPath(new URL('../work/payments/',import.meta.url)),root=await mkdtemp(path.join(parent,'iam-test-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(parent));assert.ok(path.basename(root).startsWith('iam-test-'));await rm(root,{recursive:true,force:true});});
  await mkdir(path.join(root,'work/payments'),{recursive:true});const local=await openLocalStore(root,'runtime-iam');
  try{assert.equal(local.readSource,undefined);assert.equal(await local.readRecord(),null);await local.saveRecord({fixture:'x'.repeat(70000)});assert.equal((await local.readRecord()).fixture.length,70000);await assert.rejects(openLocalStore(root,'runtime-iam'),{code:'LOCAL_LOCK_REQUIRES_REVIEW'});}finally{await local.close();}
});
