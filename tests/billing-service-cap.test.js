import test from 'node:test';
import assert from 'node:assert/strict';
import {capCloudBillingServices,parseCapArguments,safeCapFailure} from '../work/payments/cap-cloud-billing-services.mjs';

const project='brote-62d26',number='226760894540',prefix=`projects/${project}/locations/europe-west1`;
const names=['billing','revenuecatWebhook','billingAccountDeleted'],identities=['read','webhook','cleanup'];
function fixture(){
  const f={record:null,calls:[],writes:[],clock:1000,saveFails:false,mode:'ok',pending:false,hook:()=>null};
  f.runs=Object.fromEntries(names.map((name,i)=>[name,{name:`${prefix}/services/${name.toLowerCase()}`,uid:`uid-${i}`,etag:`etag-${i}`,terminalCondition:{state:'CONDITION_SUCCEEDED'},template:{serviceAccount:`ochavo-billing-${identities[i]}@${project}.iam.gserviceaccount.com`,scaling:{maxInstanceCount:2},timeout:'60s',containers:[{image:'fixed-image',env:[{name:'PRIVATE_DUMMY',value:'fixture-not-a-secret'}],resources:{limits:{memory:'256Mi'}}}]},scaling:{maxInstanceCount:20},traffic:[{type:'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST',percent:100}],ingress:'INGRESS_TRAFFIC_ALL'}]));
  const call=async(kind,method,resource,body,options)=>{
    const request={kind,method,resource,body,options};f.calls.push(request);const changed=f.hook(request);if(changed)return changed;
    if(kind==='projects')return {status:200,body:{projectId:project,projectNumber:number,lifecycleState:'ACTIVE'}};
    if(kind==='functionsV2'){const name=resource.split('/').at(-1),i=names.indexOf(name);return {status:200,body:{name:`${prefix}/functions/${name}`,state:'ACTIVE',buildConfig:{runtime:'nodejs22'},serviceConfig:{service:f.runs[name].name,serviceAccountEmail:`ochavo-billing-${identities[i]}@${project}.iam.gserviceaccount.com`}}};}
    if(kind==='run'&&resource.includes('/operations/'))return {status:200,body:{name:resource.slice(1),done:!f.pending}};
    const name=names.find(name=>resource===`/${f.runs[name].name}`);assert.ok(name,'fixed Run service only');
    if(method==='GET')return {status:200,body:structuredClone(f.runs[name])};
    assert.equal(method,'PATCH');f.writes.push(name);assert.equal(f.record.entries[name].phase,'started');assert.deepEqual(body,{name:f.runs[name].name,etag:f.runs[name].etag,scaling:{maxInstanceCount:2}});assert.deepEqual(options.queryParams,{updateMask:'scaling.maxInstanceCount',allowMissing:false});
    if(f.mode==='timeout')throw Error('PRIVATE_NETWORK_DETAILS');if(f.mode==='conflict')return {status:412};
    f.runs[name].scaling.maxInstanceCount=2;f.runs[name].etag='changed';
    if(f.mode==='drift')f.runs[name].traffic=[{revision:'unexpected',percent:100}];
    if(f.mode==='lost')throw Error('PRIVATE_NETWORK_DETAILS');
    return {status:200,body:{name:`${prefix}/operations/op-${name}`}};
  };
  f.clients=Object.fromEntries(['projects','functionsV2','run'].map(kind=>[kind,{get:(resource,options)=>call(kind,'GET',resource,undefined,options),patch:(resource,body,options)=>call(kind,'PATCH',resource,body,options)}]));
  f.saveRecord=async value=>{if(f.saveFails)throw Error('PRIVATE_FILE_DETAILS');f.record=structuredClone(value);};
  f.apply=extra=>capCloudBillingServices({clients:f.clients,record:f.record,saveRecord:f.saveRecord,now:()=>f.clock,sleep:async ms=>{f.clock+=ms;},...extra});return f;
}
test('three exact service caps use fresh etags and preserve template/traffic without printing private values',async()=>{
  const f=fixture(),before=structuredClone(f.runs);const result=await f.apply();assert.equal(result.state,'SERVICE_CAPS_VERIFIED');assert.deepEqual(f.writes,names);
  for(const name of names){assert.equal(f.record.entries[name].phase,'confirmed');assert.deepEqual(f.runs[name].template,before[name].template);assert.deepEqual(f.runs[name].traffic,before[name].traffic);assert.equal(f.runs[name].scaling.maxInstanceCount,2);}
  assert.doesNotMatch(JSON.stringify(f.record)+JSON.stringify(result),/fixture-not-a-secret|PRIVATE_DUMMY|fixed-image/);
  for(const c of f.calls){assert.deepEqual(c.options.skipLog,{body:true,resBody:true,queryParams:true});assert.equal(c.options.redirect,'error');assert.equal(c.options.retries,0);assert.deepEqual(c.options.retryCodes,[]);assert.ok(['GET','PATCH'].includes(c.method));}
  await f.apply();assert.equal(f.writes.length,3);
});
test('already capped services have no mutation or operation reads',async()=>{
  const f=fixture();for(const run of Object.values(f.runs))run.scaling.maxInstanceCount=2;
  const result=await f.apply();assert.equal(f.writes.length,0);assert.ok(result.services.every(service=>!service.mutationAttempted));assert.ok(!f.calls.some(c=>c.resource.includes('/operations/')));
});
test('all identities and revision limits are checked before any mutation',async()=>{
  for(const alter of [r=>r.template.scaling.maxInstanceCount=3,r=>r.template.scaling.minInstanceCount=1,r=>r.scaling.minInstanceCount=1,r=>r.template.serviceAccount='foreign@example.invalid',r=>r.template.timeout='300s',r=>r.scaling.scalingMode='MANUAL',r=>r.template.containers[0].resources.limits.memory='1Gi']){
    const f=fixture();alter(f.runs.billingAccountDeleted);await assert.rejects(f.apply(),{code:'UNEXPECTED_RUN_CONFIGURATION'});assert.equal(f.writes.length,0);
  }
  const f=fixture();f.hook=c=>c.kind==='projects'?{status:200,body:{projectId:project,projectNumber:'999',lifecycleState:'ACTIVE'}}:null;await assert.rejects(f.apply(),{code:'INVALID_REMOTE_PROJECT'});assert.equal(f.writes.length,0);
  const g=fixture();g.hook=c=>c.kind==='functionsV2'?{status:200,body:{name:`${prefix}/functions/foreign`,state:'ACTIVE'}}:null;await assert.rejects(g.apply(),{code:'FUNCTION_NOT_READY'});assert.equal(g.writes.length,0);
  const h=fixture();await assert.rejects(h.apply({projectId:'foreign'}),{code:'INVALID_TARGET'});assert.equal(h.calls.length,0);
});
test('durable journal failure prevents PATCH; unknown outcomes never repeat that PATCH',async()=>{
  const f=fixture();f.saveFails=true;await assert.rejects(f.apply(),{code:'LOCAL_RECORD_FAILED'});assert.equal(f.writes.length,0);
  const g=fixture();g.mode='timeout';await assert.rejects(g.apply(),{code:'REQUEST_OUTCOME_UNKNOWN'});await assert.rejects(g.apply(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.deepEqual(g.writes,['billing']);
  const h=fixture();h.mode='lost';await assert.rejects(h.apply(),{code:'REQUEST_OUTCOME_UNKNOWN'});h.mode='ok';await h.apply();assert.deepEqual(h.writes,names);assert.equal(h.record.entries.billing.phase,'confirmed');
});
test('recreation or protected-field change between preflight and fresh PATCH read prevents mutation',async()=>{
  for(const field of ['uid','traffic']){
    const f=fixture();let reads=0;f.hook=c=>{if(c.kind==='run'&&c.method==='GET'&&c.resource===`/${f.runs.billing.name}`&&++reads===2){if(field==='uid')f.runs.billing.uid='replacement';else f.runs.billing.traffic=[{revision:'other',percent:100}];}return null;};
    await assert.rejects(f.apply(),{code:'RESOURCE_CHANGED_REVIEW_REQUIRED'});assert.equal(f.writes.length,0);
  }
});
test('operation polling is bounded and resumption only reads an already started operation',async()=>{
  const f=fixture();f.pending=true;await assert.rejects(f.apply(),{code:'OPERATION_PENDING_RETRY_READ_ONLY'});assert.deepEqual(f.writes,['billing']);assert.ok(f.clock<=61000);assert.equal(f.record.entries.billing.phase,'pending');
  f.pending=false;await f.apply();assert.deepEqual(f.writes,names);
  const g=fixture();g.hook=c=>c.resource.includes('/operations/')?{status:200,body:{name:`projects/foreign/locations/europe-west1/operations/op`,done:true}}:null;await assert.rejects(g.apply(),{code:'OPERATION_IDENTITY_MISMATCH'});assert.equal(g.writes.length,1);
});
test('foreign operation names are never followed; etag conflicts and unrelated drift fail closed',async()=>{
  const f=fixture();f.hook=c=>c.method==='PATCH'?{status:200,body:{name:'https://foreign.example/operation'}}:null;await assert.rejects(f.apply(),{code:'INVALID_OPERATION'});assert.ok(!f.calls.some(c=>c.resource.includes('/operations/')));
  const g=fixture();g.mode='conflict';await assert.rejects(g.apply(),{code:'PATCH_OUTCOME_REQUIRES_REVIEW'});await assert.rejects(g.apply(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(g.writes.length,1);
  const h=fixture();h.mode='drift';await assert.rejects(h.apply(),{code:'POST_PATCH_CONFIGURATION_CHANGED'});await assert.rejects(h.apply(),{code:'RESOURCE_CHANGED_REVIEW_REQUIRED'});assert.equal(h.writes.length,1);
  assert.throws(()=>parseCapArguments([]));assert.throws(()=>parseCapArguments(['apply','--project','foreign']));assert.deepEqual(safeCapFailure(Error('PRIVATE_DETAILS')),{state:'FAILED',httpStatus:0});
});
