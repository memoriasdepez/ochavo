import test from 'node:test';
import assert from 'node:assert/strict';
import {planCleanupInvoker,applyCleanupInvoker,safeInvokerFailure,parseInvokerArguments} from '../work/payments/ensure-cleanup-run-invoker.mjs';
const project='brote-62d26',number='123456789',account=`ochavo-billing-cleanup@${project}.iam.gserviceaccount.com`,member=`serviceAccount:${account}`;
const prefix=`projects/${project}/locations/europe-west1`,service=`${prefix}/services/billingaccountdeleted`,trigger=`projects/${project}/locations/europe-southwest1/triggers/cleanup-123`;
const filters=[{attribute:'database',value:'(default)'},{attribute:'document',value:'accountDeletions/{uid}',operator:'match-path-pattern'}];
function fixture(){
  const f={calls:[],writes:0,record:null,saveFails:false,writeMode:'ok',hook:()=>null};
  f.policy={version:3,etag:'original',bindings:[{role:'roles/run.viewer',members:['user:private-operator@example.invalid'],condition:{expression:'true',title:'Preserve',description:'All condition fields'}}],auditConfigs:[{service:'allServices',auditLogConfigs:[{logType:'ADMIN_READ'}]}]};
  const call=async(kind,method,resource,body,options)=>{
    const request={kind,method,resource,body,options};f.calls.push(request);const changed=f.hook(request);if(changed)return changed;
    if(kind==='projects'&&method==='GET')return {status:200,body:{projectId:project,projectNumber:number,lifecycleState:'ACTIVE'}};
    if(kind==='projects'&&method==='POST')return {status:200,body:{version:1,etag:'project',bindings:[]}};
    if(kind==='functionsV2')return {status:200,body:{name:`${prefix}/functions/billingAccountDeleted`,state:'ACTIVE',serviceConfig:{serviceAccountEmail:account,service},eventTrigger:{serviceAccountEmail:account,trigger,retryPolicy:'RETRY_POLICY_RETRY',eventType:'google.cloud.firestore.document.v1.written',eventFilters:filters}}};
    if(kind==='eventarc')return {status:200,body:{name:trigger,serviceAccount:account,eventFilters:[{attribute:'type',value:'google.cloud.firestore.document.v1.written'},...filters],destination:{cloudRun:{region:'europe-west1',service:'billingaccountdeleted'}}}};
    if(kind==='run'&&resource.endsWith(':getIamPolicy'))return {status:200,body:structuredClone(f.policy)};
    if(kind==='run'&&resource.endsWith(':setIamPolicy')){
      f.writes++;assert.equal(f.record.journal.phase,'started');assert.deepEqual(Object.keys(body).sort(),['policy','updateMask']);assert.equal(body.updateMask,'bindings,etag');assert.equal(body.policy.etag,f.policy.etag);
      if(f.writeMode==='timeout')throw Error('PRIVATE_PAYLOAD');if(f.writeMode==='conflict')return {status:409,body:{error:{message:'PRIVATE_PAYLOAD'}}};
      f.policy=structuredClone(body.policy);f.policy.etag='after';f.policy.bindings.reverse();for(const binding of f.policy.bindings)binding.members.reverse();if(!f.policy.bindings.some(binding=>binding.condition))f.policy.version=1;
      if(f.writeMode==='lost-success')throw Error('PRIVATE_PAYLOAD');
      if(f.writeMode==='extra')f.policy.bindings.push({role:'roles/run.viewer',members:['user:concurrent@example.invalid']});
      return {status:200,body:structuredClone(f.policy)};
    }
    if(kind==='run')return {status:200,body:{name:service,uid:'fixed-run-uid',template:{serviceAccount:account},terminalCondition:{state:'CONDITION_SUCCEEDED'}}};
    assert.fail('Unexpected API route');
  };
  f.clients=Object.fromEntries(['projects','functionsV2','run','eventarc'].map(kind=>[kind,{get:(resource,options)=>call(kind,'GET',resource,undefined,options),post:(resource,body,options)=>call(kind,'POST',resource,body,options)}]));
  f.saveRecord=async record=>{if(f.saveFails)throw Error('PRIVATE_FILE_PATH');f.record=structuredClone(record);};
  f.plan=()=>planCleanupInvoker({clients:f.clients,record:f.record,saveRecord:f.saveRecord,now:()=>1000});
  f.apply=extra=>applyCleanupInvoker({clients:f.clients,record:f.record,saveRecord:f.saveRecord,approvedDigest:f.record.planDigest,now:()=>2000,...extra});return f;
}
test('only one resolved Run grant is added using current etag, preserving conditions, audit configs and concurrent members',async()=>{
  const f=fixture(),before=structuredClone(f.policy),plan=await f.plan();assert.equal(plan.grantsToAdd,1);assert.equal(f.writes,0);
  f.policy.etag='fresh';f.policy.bindings.push({role:'roles/run.invoker',members:['serviceAccount:existing@example.invalid']});
  const result=await f.apply();assert.equal(result.state,'CLEANUP_INVOKER_VERIFIED');assert.equal(f.writes,1);assert.equal(f.record.journal.phase,'confirmed');assert.deepEqual(f.policy.auditConfigs,before.auditConfigs);assert.deepEqual(f.policy.bindings.find(b=>b.condition),before.bindings[0]);assert.deepEqual(new Set(f.policy.bindings.find(b=>b.role==='roles/run.invoker').members),new Set(['serviceAccount:existing@example.invalid',member]));
  assert.doesNotMatch(JSON.stringify(result),/private-operator|original|All condition fields/);
  for(const c of f.calls){assert.equal(c.options.retries,0);assert.deepEqual(c.options.retryCodes,[]);assert.equal(c.options.redirect,'error');assert.deepEqual(c.options.skipLog,{body:true,resBody:true,queryParams:true});if(c.method==='POST')assert.ok(c.resource===`/projects/${project}:getIamPolicy`||c.resource===`/${service}:setIamPolicy`);}
  assert.equal(f.calls.find(c=>c.resource.endsWith(':getIamPolicy')&&c.kind==='run').options.queryParams['options.requestedPolicyVersion'],3);
});
test('existing grant makes no mutation; unconditional IAM can normalize v3 to v1',async()=>{
  const f=fixture();f.policy={version:1,etag:'empty',bindings:[]};await f.plan();await f.apply();assert.equal(f.policy.version,1);assert.equal(f.writes,1);
  const g=fixture();g.policy.bindings.push({role:'roles/run.invoker',members:[member]});assert.equal((await g.plan()).grantsToAdd,0);assert.equal((await g.apply()).mutationApplied,false);assert.equal(g.writes,0);
});
test('Cloud Functions Eventarc destination accepts only the exact cleanup function and one destination',async()=>{
  const exact=`${prefix}/functions/billingAccountDeleted`;
  for(const [destination,valid] of [[{cloudFunction:exact},true],[{cloudFunction:exact.replace(project,number)},true],[{cloudFunction:exact.replace(project,'foreign')},false],[{cloudFunction:exact.replace('billingAccountDeleted','billing')},false],[{cloudFunction:exact,cloudRun:{service:'billingaccountdeleted',region:'europe-west1'}},false],[{httpEndpoint:{uri:'https://outside.invalid'}},false]]){
    const f=fixture();f.hook=c=>c.kind==='eventarc'?{status:200,body:{name:trigger,serviceAccount:account,eventFilters:[{attribute:'type',value:'google.cloud.firestore.document.v1.written'},...filters],destination}}:null;
    if(valid){await f.plan();await f.apply();assert.equal(f.writes,1);}else{await assert.rejects(f.plan(),{code:'CLEANUP_TRIGGER_NOT_READY'});assert.equal(f.writes,0);}
  }
});
test('foreign, inactive, public, bypassed and mismatched trigger destinations never reach mutation',async()=>{
  const cases=[
    ['functionsV2',{name:`${prefix}/functions/billingAccountDeleted`,state:'FAILED'}],
    ['run',{name:service,uid:'uid',template:{serviceAccount:account},terminalCondition:{state:'CONDITION_SUCCEEDED'},invokerIamDisabled:true}],
    ['eventarc',{name:trigger,serviceAccount:account,eventFilters:[{attribute:'type',value:'google.cloud.firestore.document.v1.written'},...filters],destination:{cloudRun:{region:'europe-west1',service:'foreign'}}}],
  ];
  for(const [kind,body] of cases){const f=fixture();f.hook=c=>c.kind===kind&&!c.resource.endsWith(':getIamPolicy')?{status:200,body}:null;await assert.rejects(f.plan());assert.equal(f.writes,0);}
  for(const publicMember of ['allUsers','allAuthenticatedUsers'])for(const scope of ['run','project']){const f=fixture();if(scope==='run')f.policy.bindings.push({role:'roles/run.invoker',members:[publicMember]});else f.hook=c=>c.kind==='projects'&&c.method==='POST'?{status:200,body:{etag:'project',bindings:[{role:'roles/run.invoker',members:[publicMember]}]}}:null;await assert.rejects(f.plan(),{code:'PUBLIC_INVOKER_REQUIRES_REVIEW'});assert.equal(f.writes,0);}
  const f=fixture();await assert.rejects(planCleanupInvoker({projectId:'foreign',clients:f.clients}),{code:'INVALID_TARGET'});assert.equal(f.calls.length,0);
});
test('journal failure prevents POST and uncertain writes never retry; exact observed success can be reconciled',async()=>{
  const f=fixture();await f.plan();f.saveFails=true;await assert.rejects(f.apply(),{code:'LOCAL_RECORD_FAILED'});assert.equal(f.writes,0);
  for(const mode of ['timeout','lost-success']){const g=fixture();await g.plan();g.writeMode=mode;await assert.rejects(g.apply(),{code:'REQUEST_OUTCOME_UNKNOWN'});assert.equal(g.record.journal.phase,'started');assert.equal(g.writes,1);await assert.rejects(g.plan(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});if(mode==='lost-success')assert.equal((await g.apply()).state,'CLEANUP_INVOKER_VERIFIED');else await assert.rejects(g.apply(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(g.writes,1);}
});
test('etag conflicts and post-write unrelated differences stop without retry; approval and resource identity are required',async()=>{
  for(const mode of ['conflict','extra']){const f=fixture();await f.plan();f.writeMode=mode;await assert.rejects(f.apply());await assert.rejects(f.apply(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(f.writes,1);}
  const f=fixture();await f.plan();await assert.rejects(f.apply({approvedDigest:'0'.repeat(64)}),{code:'PLAN_APPROVAL_REQUIRED'});await assert.rejects(f.apply({now:()=>86402000}),{code:'PLAN_EXPIRED_REVIEW_REQUIRED'});
  f.hook=c=>c.kind==='run'&&!c.resource.endsWith(':getIamPolicy')?{status:200,body:{name:service,uid:'replacement-uid',template:{serviceAccount:account},terminalCondition:{state:'CONDITION_SUCCEEDED'}}}:null;await assert.rejects(f.apply(),{code:'RESOURCE_CHANGED_REPLAN_REQUIRED'});assert.equal(f.writes,0);
  assert.deepEqual(safeInvokerFailure(Error('PRIVATE_PAYLOAD')),{state:'FAILED',httpStatus:0});assert.throws(()=>parseInvokerArguments(['apply','--approve-plan','x']));
});
