import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {enableSecretManager,safeEnableFailure,SERVICE} from '../work/payments/enable-secret-manager.mjs';
import {PROJECT_ID,createGoogleClients,openLocalStore} from '../work/payments/store-server-secrets.mjs';

const number='123456789',resource=`/projects/${number}/services/${SERVICE}`,operation='operations/acf.fixture-1';
function fixture(){
  const f={calls:[],record:null,state:'DISABLED',finish:true,sleeps:0};
  const clients={projects:{get:async(...args)=>{f.calls.push({method:'GET',kind:'project',args});return {status:200,body:{projectId:PROJECT_ID,projectNumber:number}};}},serviceUsage:{
    get:async(...args)=>{
      f.calls.push({method:'GET',args});
      if(args[0]===resource)return {status:200,body:{name:resource.slice(1),state:f.state,config:{name:SERVICE}}};
      assert.equal(args[0],'/'+operation);if(f.finish)f.state='ENABLED';return {status:200,body:{name:operation,done:f.finish}};
    },
    post:async(...args)=>{f.calls.push({method:'POST',args});assert.equal(f.record.phase,'enabling');assert.equal(args[0],resource+':enable');assert.deepEqual(args[1],{});return {status:200,body:{name:operation,done:false}};},
  }};
  f.clients=clients;f.saveRecord=async value=>{f.record=structuredClone(value);};
  f.run=extra=>enableSecretManager({clients,record:f.record,saveRecord:f.saveRecord,sleep:async ms=>{assert.equal(ms,2000);f.sleeps++;},...extra});return f;
}

test('only fixed project and service are enabled, with validated metadata and quiet no-retry requests',async()=>{
  const f=fixture();assert.deepEqual(await f.run(),{service:SERVICE,httpStatus:200,state:'ENABLED'});
  assert.equal(f.record.phase,'enabled');assert.equal(f.record.operation,operation);
  for(const call of f.calls){const options=call.args.at(-1);assert.equal(options.retries,0);assert.deepEqual(options.retryCodes,[]);assert.equal(options.redirect,'error');assert.deepEqual(options.skipLog,{body:true,resBody:true,queryParams:true});assert.doesNotMatch(call.args[0],/secrets|IamPolicy|disable|batchEnable/);}
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  await f.run();assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
  for(const extra of [{projectId:'foreign-project'},{service:'compute.googleapis.com'}])await assert.rejects(f.run(extra),{code:'INVALID_TARGET'});
  const bad=fixture();bad.clients.projects.get=async()=>({status:200,body:{projectId:'other',projectNumber:number}});await assert.rejects(bad.run(),{code:'INVALID_REMOTE_PROJECT'});assert.equal(bad.calls.length,0);
});
test('pending operations are bounded and only resume GET, never duplicate the enable request',async()=>{
  const f=fixture();f.finish=false;assert.equal((await f.run()).state,'PENDING');assert.equal(f.sleeps,4);assert.equal(f.record.phase,'polling');
  assert.equal(f.calls.filter(call=>call.args[0]==='/'+operation).length,5);
  f.finish=true;assert.equal((await f.run()).state,'ENABLED');assert.equal(f.calls.filter(call=>call.method==='POST').length,1);
});
test('uncertain enable or failed record stops automatic retry while already-enabled state can recover safely',async()=>{
  const f=fixture();let postCalls=0;
  f.clients.serviceUsage.post=async()=>{postCalls++;throw Error('FIXTURE_TOKEN');};
  await assert.rejects(f.run(),error=>{assert.equal(error.code,'REQUEST_OUTCOME_UNKNOWN');assert.doesNotMatch(JSON.stringify(safeEnableFailure(error)),/FIXTURE/);return true;});
  assert.equal(f.record.phase,'enabling');await assert.rejects(f.run(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(postCalls,1);
  f.state='ENABLED';assert.equal((await f.run()).state,'ENABLED');assert.equal(postCalls,1);
  const before=fixture();await assert.rejects(before.run({saveRecord:async()=>{throw Error('fixture disk full');}}),{code:'LOCAL_RECORD_FAILED'});assert.equal(before.calls.filter(call=>call.method==='POST').length,0);
  const after=fixture();let writes=0;await assert.rejects(after.run({saveRecord:async value=>{if(++writes===2)throw Error('fixture disk error');await after.saveRecord(value);}}),{code:'LOCAL_RECORD_FAILED'});assert.equal(after.record.phase,'enabling');await assert.rejects(after.run(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(after.calls.filter(call=>call.method==='POST').length,1);
});
test('operation result cannot redirect polling or falsely confirm a still-disabled service',async()=>{
  const substituted=fixture();substituted.clients.serviceUsage.post=async()=>({status:200,body:{name:'https://evil.invalid/FIXTURE_TOKEN'}});await assert.rejects(substituted.run(),{code:'INVALID_OPERATION_METADATA'});assert.equal(substituted.record.phase,'enabling');
  const incorrect=fixture(),original=incorrect.clients.serviceUsage.get;incorrect.clients.serviceUsage.get=async(...args)=>args[0]==='/'+operation?{status:200,body:{name:'operations/different',done:true}}:original(...args);await assert.rejects(incorrect.run(),{code:'INVALID_OPERATION_METADATA'});
  const disabled=fixture(),get=disabled.clients.serviceUsage.get;disabled.clients.serviceUsage.get=async(...args)=>args[0]==='/'+operation?{status:200,body:{name:operation,done:true}}:get(...args);await assert.rejects(disabled.run(),{code:'ENABLE_NOT_CONFIRMED'});
  const failed=fixture();failed.clients.serviceUsage.post=async()=>({status:200,body:{name:operation,done:true,error:{code:7,message:'FIXTURE_TOKEN'}}});await assert.rejects(failed.run(),error=>{assert.equal(error.code,'OPERATION_FAILED');assert.doesNotMatch(JSON.stringify(safeEnableFailure(error)),/FIXTURE/);return true;});
  assert.equal(safeEnableFailure(Object.assign(Error('FIXTURE_SECRET'),{code:'FIXTURE_TOKEN'})).state,'FAILED');
});
test('service metadata, local target and operation records must match before any enable',async()=>{
  const f=fixture();f.clients.serviceUsage.get=async()=>({status:200,body:{name:resource.slice(1),state:'DISABLED',config:{name:'other.googleapis.com'}}});await assert.rejects(f.run(),{code:'INVALID_SERVICE_METADATA'});assert.equal(f.calls.filter(call=>call.method==='POST').length,0);
  for(const override of [{projectId:'other'},{projectNumber:'42'},{service:'other.googleapis.com'},{operation:'../other'},{extra:'fixture'}]){
    const local=fixture();local.record={schemaVersion:1,projectId:PROJECT_ID,projectNumber:number,service:SERVICE,phase:'polling',operation,...override};await assert.rejects(local.run(),{code:'INVALID_LOCAL_RECORD'});assert.equal(local.calls.filter(call=>call.method==='POST').length,0);
  }
});
test('optional Service Usage Client keeps logger suppression and fixed Google origin',async()=>{
  const constructed=[],logs=[],logger={debug:value=>logs.push(value),log:value=>logs.push(value)};
  await createGoogleClients({includeServiceUsage:true,env:{},load:name=>{
    if(name.endsWith('/logger'))return {logger};
    assert.equal(logger.silent,true);
    if(name.endsWith('/auth'))return {getProjectDefaultAccount:()=>({user:{},tokens:{}})};
    if(name.endsWith('/requireAuth'))return {requireAuth:async()=>{logger.debug('FIXTURE_TOKEN');return 'fixture';}};
    if(name.endsWith('/apiv2'))return {Client:class{constructor(options){constructed.push(options);}}};
    assert.fail('unexpected module');
  }});
  assert.deepEqual(logs,[]);assert.deepEqual(constructed.at(-1),{urlPrefix:'https://serviceusage.googleapis.com',apiVersion:'v1'});
  await assert.rejects(createGoogleClients({includeServiceUsage:'https://evil.invalid',load:()=>assert.fail('no imports')}),{code:'INVALID_CLIENT_SELECTION'});
});
test('enablement file scope has a separate durable journal and lock, with no secret-file reader',async t=>{
  const parent=fileURLToPath(new URL('../work/payments/',import.meta.url)),root=await mkdtemp(path.join(parent,'enable-test-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(parent));assert.ok(path.basename(root).startsWith('enable-test-'));await rm(root,{recursive:true,force:true});});
  await mkdir(path.join(root,'work/payments'),{recursive:true});
  const local=await openLocalStore(root,'secret-manager-enablement');
  try{assert.equal(local.readSource,undefined);assert.equal(await local.readRecord(),null);await local.saveRecord({phase:'enabling'});assert.deepEqual(await local.readRecord(),{phase:'enabling'});await assert.rejects(openLocalStore(root,'secret-manager-enablement'),{code:'LOCAL_LOCK_REQUIRES_REVIEW'});}finally{await local.close();}
  await assert.rejects(openLocalStore(root,'../../unsafe'),{code:'INVALID_LOCAL_SCOPE'});
});
