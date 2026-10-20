import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {auditCloudBilling,summarizeAudit,openAuditStore,policyDiff,parseAuditArguments,safeAuditFailure} from '../work/payments/cloud-billing-audit.mjs';
import {PROJECT_ID,SECRET_NAMES} from '../work/payments/store-server-secrets.mjs';
const number='123456789',region='europe-west1',project=`projects/${PROJECT_ID}`,prefix=`${project}/locations/${region}`;
const definitions={billing:{account:'ochavo-billing-read',secrets:[SECRET_NAMES[0]]},revenuecatWebhook:{account:'ochavo-billing-webhook',secrets:[SECRET_NAMES[0],SECRET_NAMES[2]]},billingAccountDeleted:{account:'ochavo-billing-cleanup',secrets:[SECRET_NAMES[1]]}};
const operator='user:operator-private@example.invalid';
const initialPolicy=()=>({version:3,etag:'fixture-etag',bindings:[{role:'roles/viewer',members:[operator],condition:{expression:'true',title:'Keep condition',description:'Keep details'}}],auditConfigs:[{service:'allServices',auditLogConfigs:[{logType:'ADMIN_READ'}]}]});
const vars={BILLING_ENABLED:'false',BILLING_ENVIRONMENT:'production',REVENUECAT_PROJECT_ID:'projae1cdb17',PRIVATE_SETTING:'FIXTURE_SECRET_DO_NOT_SAVE'};
function fixture(){
  const f={calls:[],enabled:false,hook:async()=>null,projectPolicy:initialPolicy()};
  f.fn=id=>({name:`${prefix}/functions/${id}`,state:'ACTIVE',buildConfig:{runtime:'nodejs22'},serviceConfig:{serviceAccountEmail:`${definitions[id].account}@${PROJECT_ID}.iam.gserviceaccount.com`,service:`${prefix}/services/${id.toLowerCase()}`,minInstanceCount:0,maxInstanceCount:2,timeoutSeconds:60,availableMemory:'256Mi',environmentVariables:vars,secretEnvironmentVariables:definitions[id].secrets.map(secret=>({key:secret,secret,projectId:PROJECT_ID,version:'1'}))},...(id==='billingAccountDeleted'?{eventTrigger:{trigger:`${project}/locations/eur3/triggers/cleanup-123`,eventType:'google.cloud.firestore.document.v1.written',serviceAccountEmail:`ochavo-billing-cleanup@${PROJECT_ID}.iam.gserviceaccount.com`,retryPolicy:'RETRY_POLICY_RETRY',eventFilters:[{attribute:'database',value:'(default)'},{attribute:'document',value:'accountDeletions/{uid}',operator:'match-path-pattern'}]}}:{})});
  const request=async(kind,method,resource,body,options)=>{
    const call={kind,method,resource,body,options};f.calls.push(call);const altered=await f.hook(call);if(altered)return altered;
    if(kind==='projects'&&method==='GET')return {status:200,body:{projectId:PROJECT_ID,projectNumber:number,lifecycleState:'ACTIVE',parent:{type:'organization',id:'456'},owner:'PRIVATE_OWNER'}};
    if(resource===`/${project}:getIamPolicy`)return {status:200,body:structuredClone(f.projectPolicy)};
    if(kind==='secrets')return {status:200,body:initialPolicy()};
    if(kind==='serviceUsage')return {status:200,body:{name:resource.slice(1),state:f.enabled?'ENABLED':'DISABLED'}};
    if(resource.endsWith('/functions'))return {status:200,body:{functions:[]}};
    if(resource.endsWith('/services'))return {status:200,body:{services:[]}};
    if(resource.endsWith('/triggers'))return {status:200,body:{triggers:[]}};
    if(kind==='functionsV2')return {status:200,body:f.fn(resource.split('/').at(-1))};
    if(kind==='run'){
      const id=Object.keys(definitions).find(id=>resource.split('/').at(-1).split(':')[0]===id.toLowerCase()),definition=definitions[id];assert.ok(definition);
      if(resource.endsWith(':getIamPolicy'))return {status:200,body:{version:1,etag:'run-fixture',bindings:[{role:'roles/run.invoker',members:[id==='billingAccountDeleted'?`serviceAccount:ochavo-billing-cleanup@${PROJECT_ID}.iam.gserviceaccount.com`:'allUsers']}]}};
      return {status:200,body:{name:resource.slice(1),terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{serviceAccount:`${definition.account}@${PROJECT_ID}.iam.gserviceaccount.com`,timeout:'60s',scaling:{minInstanceCount:0,maxInstanceCount:2},containers:[{resources:{limits:{memory:'256Mi'}},env:[...Object.entries(vars).map(([name,value])=>({name,value})),...definition.secrets.map(name=>({name,valueSource:{secretKeyRef:{secret:`${project}/secrets/${name}`,version:'1'}}}))]}]}}};
    }
    if(kind==='eventarc')return {status:200,body:{name:resource.slice(1),serviceAccount:`ochavo-billing-cleanup@${PROJECT_ID}.iam.gserviceaccount.com`,eventFilters:[{attribute:'type',value:'google.cloud.firestore.document.v1.written'},...f.fn('billingAccountDeleted').eventTrigger.eventFilters],destination:{cloudRun:{service:'billingaccountdeleted',region}}}};
    assert.fail('Unexpected fixture route');
  };
  f.clients=Object.fromEntries(['projects','secrets','serviceUsage','functionsV1','functionsV2','run','eventarc'].map(kind=>[kind,{get:(resource,options)=>request(kind,'GET',resource,undefined,options),post:(resource,body,options)=>request(kind,'POST',resource,body,options)}]));
  f.run=extra=>auditCloudBilling({clients:f.clients,phase:'pre',...extra});return f;
}
test('pre audit captures full v3 policies and parent without any mutation, secret access or private stdout',async()=>{
  const f=fixture(),snapshot=await f.run(),summary=summarizeAudit(snapshot,'fixture');
  assert.deepEqual(snapshot.policies.project,initialPolicy());assert.deepEqual(snapshot.project.parent,{type:'organization',id:'456'});assert.equal(summary.parentPresent,true);assert.equal(summary.inheritanceAudited,false);
  assert.ok(Object.values(snapshot.apis).every(value=>value==='DISABLED'));assert.ok(Object.values(snapshot.inventories).every(value=>value.state==='DISABLED'));assert.equal(f.calls.filter(value=>value.kind.startsWith('functions')).length,0);
  assert.doesNotMatch(JSON.stringify(summary),/operator-private|PRIVATE_OWNER|fixture-etag|Keep details/);
  for(const call of f.calls){assert.ok(call.method==='GET'||call.method==='POST'&&call.resource===`/${project}:getIamPolicy`);assert.equal(call.options.retries,0);assert.deepEqual(call.options.retryCodes,[]);assert.equal(call.options.redirect,'error');assert.deepEqual(call.options.skipLog,{body:true,resBody:true,queryParams:true});assert.doesNotMatch(call.resource,/:access|:setIamPolicy|:enable|:generateServiceIdentity/);}
  assert.equal(f.calls.find(value=>value.kind==='projects'&&value.method==='POST').body.options.requestedPolicyVersion,3);assert.equal(f.calls.find(value=>value.kind==='secrets').options.queryParams['options.requestedPolicyVersion'],3);
});
test('post resolves multi-region trigger safely, checks accounts/limits/secret mounts and compares exact IAM grants privately',async()=>{
  const f=fixture(),baseline=await f.run();f.enabled=true;f.projectPolicy.bindings.push({role:'roles/pubsub.serviceAgent',members:[`serviceAccount:service-${number}@gcp-sa-pubsub.iam.gserviceaccount.com`]});
  const buildAccount=`${project}/serviceAccounts/${number}-compute@developer.gserviceaccount.com`;
  f.hook=async call=>call.kind==='functionsV2'&&!call.resource.endsWith('/functions')?{status:200,body:{...f.fn(call.resource.split('/').at(-1)),buildConfig:{runtime:'nodejs22',serviceAccount:buildAccount}}}:null;
  const snapshot=await f.run({phase:'post',baseline});assert.equal(snapshot.diff.project.added.length,1);assert.equal(snapshot.diff.project.removed.length,0);assert.ok(Object.values(snapshot.targets).every(target=>Object.values(target.checks).every(Boolean)));
  assert.ok(f.calls.some(value=>value.resource===`/${project}/locations/eur3/triggers/cleanup-123`));
  const summary=summarizeAudit(snapshot,'fixture');assert.equal(summary.diff.project.added,1);assert.doesNotMatch(JSON.stringify(snapshot),/FIXTURE_SECRET_DO_NOT_SAVE|PRIVATE_SETTING|PRIVATE_OWNER/);assert.doesNotMatch(JSON.stringify(summary),/operator-private|gcp-sa-pubsub|secretEnvironmentVariables/);
  const cleanup=snapshot.targets.billingAccountDeleted;assert.equal(cleanup.checks.cleanupPrivate,true);assert.equal(cleanup.checks.cleanupInvoker,true);assert.equal(cleanup.checks.cleanupNoProjectInvoker,true);
  assert.equal(cleanup.function.buildServiceAccount,buildAccount);assert.doesNotMatch(JSON.stringify(summary),/compute@developer/);
});
test('foreign project or resolved resources fail before following a foreign URL; malformed inputs and error bodies are sanitized',async()=>{
  const f=fixture();await assert.rejects(f.run({projectId:'foreign'}),{code:'INVALID_TARGET'});assert.equal(f.calls.length,0);
  const baseline=await f.run();f.enabled=true;f.hook=async call=>call.resource===`/${prefix}/functions/billing`?{status:200,body:{...f.fn('billing'),serviceConfig:{...f.fn('billing').serviceConfig,service:'projects/foreign/locations/europe-west1/services/foreign'}}}:null;
  await assert.rejects(f.run({phase:'post',baseline}),{code:'INVALID_RESOLVED_RESOURCE'});assert.equal(f.calls.some(call=>call.resource.includes('foreign')),false);
  const broken=fixture();broken.hook=async call=>call.kind==='secrets'?{status:403,body:{error:{message:'FIXTURE_SECRET'}}}:null;await assert.rejects(broken.run(),error=>{assert.doesNotMatch(JSON.stringify(safeAuditFailure(error)),/FIXTURE_SECRET/);return error.code==='REQUIRED_IAM_SNAPSHOT_INCOMPLETE';});
  assert.deepEqual(parseAuditArguments(['post','--baseline','runtime-before-cloud-deploy']),{phase:'post',baselineId:'runtime-before-cloud-deploy'});for(const args of [['post','--baseline','../secret'],['pre','--force'],['apply']])assert.throws(()=>parseAuditArguments(args));
});
test('duplicate secrets, extra secret volumes and inherited public project invoker cannot receive a passing check',async()=>{
  for(const failure of ['duplicates','volumes','public-project']){
    const f=fixture(),baseline=await f.run();f.enabled=true;
    if(failure==='public-project')f.projectPolicy.bindings.push({role:'roles/run.invoker',members:['allUsers']});
    else f.hook=async call=>{if(call.resource===`/${prefix}/functions/revenuecatWebhook`){const value=f.fn('revenuecatWebhook');if(failure==='duplicates')value.serviceConfig.secretEnvironmentVariables=[value.serviceConfig.secretEnvironmentVariables[0],value.serviceConfig.secretEnvironmentVariables[0]];else value.serviceConfig.secretVolumes=[{secret:'unexpected'}];return {status:200,body:value};}};
    const result=await f.run({phase:'post',baseline});if(failure==='public-project')assert.equal(result.targets.billingAccountDeleted.checks.cleanupPrivate,false);else assert.equal(result.targets.revenuecatWebhook.checks.secrets,false);
  }
});
test('the real Eventarc trigger and Cloud Run secret mounts must independently match, and project number aliases remain local',async()=>{
  for(const failure of ['trigger-filters','run-secrets','alias']){
    const f=fixture(),baseline=await f.run();f.enabled=true;
    f.hook=async call=>{
      if(failure==='trigger-filters'&&call.kind==='eventarc'&&call.resource.endsWith('/cleanup-123'))return {status:200,body:{name:call.resource.slice(1),serviceAccount:`ochavo-billing-cleanup@${PROJECT_ID}.iam.gserviceaccount.com`,eventFilters:[],destination:{cloudRun:{service:'billingaccountdeleted',region}}}};
      if(failure==='run-secrets'&&call.kind==='run'&&call.resource.endsWith('/revenuecatwebhook'))return {status:200,body:{name:call.resource.slice(1),template:{serviceAccount:`ochavo-billing-webhook@${PROJECT_ID}.iam.gserviceaccount.com`,containers:[{env:[{name:SECRET_NAMES[0],valueSource:{secretKeyRef:{secret:SECRET_NAMES[0],version:'1'}}},{name:SECRET_NAMES[0],valueSource:{secretKeyRef:{secret:SECRET_NAMES[0],version:'1'}}}]}]}}};
      if(failure==='alias'&&call.resource===`/${prefix}/functions/billing`)return {status:200,body:{...f.fn('billing'),name:f.fn('billing').name.replace(PROJECT_ID,number)}};
    };
    const result=await f.run({phase:'post',baseline});if(failure==='trigger-filters')assert.equal(result.targets.billingAccountDeleted.checks.triggerFilters,false);else if(failure==='run-secrets')assert.equal(result.targets.revenuecatWebhook.checks.runSecrets,false);else assert.equal(result.targets.billing.checks.active,true);
  }
});
test('inventory pagination and failures stay explicit and diff preserves full conditions/member identity',async()=>{
  const f=fixture();f.enabled=true;f.hook=async call=>{
    if(call.kind==='functionsV1')return {status:200,body:call.options.queryParams.pageToken?{functions:[]}:{functions:[{name:`${project}/locations/us-east1/functions/old`,environmentVariables:vars}],nextPageToken:'fixture-token'}};
    if(call.kind==='eventarc')return {status:200,body:{triggers:[],unreachable:['eur3']}};
    if(call.kind==='run')return {status:403,body:{error:{message:'PRIVATE_ERROR'}}};
  };
  const snapshot=await f.run();assert.equal(snapshot.inventories.functionsV1.items.length,1);assert.equal(snapshot.inventories.functionsV1.state,'COMPLETE');assert.equal(snapshot.inventories.run.state,'INCOMPLETE');assert.equal(snapshot.inventories.eventarc.state,'INCOMPLETE');assert.doesNotMatch(JSON.stringify(snapshot),/PRIVATE_ERROR|fixture-token|FIXTURE_SECRET/);
  const a=initialPolicy(),b=initialPolicy();b.bindings[0].condition.description='Changed description';const diff=policyDiff(a,b);assert.equal(diff.added.length,1);assert.equal(diff.removed.length,1);assert.equal(diff.removed[0].condition.description,'Keep details');
});
test('Eventarc Cloud Functions destination is exact, exclusive and never an arbitrary HTTP target',async()=>{
  const exact=`${prefix}/functions/billingAccountDeleted`;
  for(const [destination,valid] of [[{cloudFunction:exact},true],[{cloudFunction:exact.replace(PROJECT_ID,number)},true],[{cloudFunction:exact.replace(PROJECT_ID,'foreign')},false],[{cloudFunction:exact.replace('billingAccountDeleted','billing')},false],[{cloudFunction:exact,cloudRun:{service:'billingaccountdeleted',region}},false],[{httpEndpoint:{uri:'https://outside.invalid'}},false]]){
    const f=fixture(),baseline=await f.run();f.enabled=true;f.hook=async call=>call.kind==='eventarc'&&call.resource.endsWith('/cleanup-123')?{status:200,body:{name:call.resource.slice(1),serviceAccount:`ochavo-billing-cleanup@${PROJECT_ID}.iam.gserviceaccount.com`,eventFilters:[{attribute:'type',value:'google.cloud.firestore.document.v1.written'},...f.fn('billingAccountDeleted').eventTrigger.eventFilters],destination}}:null;
    const snapshot=await f.run({phase:'post',baseline});assert.equal(snapshot.targets.billingAccountDeleted.checks.triggerDestination,valid);assert.doesNotMatch(JSON.stringify(snapshot),/outside.invalid/);
    if(valid)assert.equal(snapshot.targets.billingAccountDeleted.trigger.destination.cloudFunction,destination.cloudFunction);
  }
});
test('snapshots use distinct exclusive private files and read the reviewed root baseline without overwriting it',async t=>{
  const parent=fileURLToPath(new URL('../work/payments/',import.meta.url)),root=await mkdtemp(path.join(parent,'audit-test-'));t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(parent));assert.ok(path.basename(root).startsWith('audit-test-'));await rm(root,{recursive:true,force:true});});
  await mkdir(path.join(root,'work/payments'),{recursive:true});const store=await openAuditStore(root),snapshot=await fixture().run(),a=await store.save(snapshot),before=await readFile(path.join(root,'work/payments/iam-snapshots',a.id+'.json'),'utf8'),b=await store.save(snapshot);assert.notEqual(a.id,b.id);assert.equal(await readFile(path.join(root,'work/payments/iam-snapshots',a.id+'.json'),'utf8'),before);assert.deepEqual(await store.readBaseline(a.id),snapshot);
  const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
  const plan={projectId:PROJECT_ID,projectNumber:number,policies:snapshot.policies,inventory:{fixture:true}},record={schemaVersion:1,projectId:PROJECT_ID,plan,planDigest:createHash('sha256').update(canonical(plan)).digest('hex')},filename=path.join(root,'work/payments/runtime-before-cloud-deploy.json');await writeFile(filename,JSON.stringify(record),{flag:'wx'});
  const original=await readFile(filename,'utf8'),loaded=await store.readBaseline('runtime-before-cloud-deploy');assert.deepEqual(loaded.policies,snapshot.policies);assert.equal(loaded.project.projectNumber,number);assert.equal(await readFile(filename,'utf8'),original);await assert.rejects(store.readBaseline('../functions/.secret.local'));
});
