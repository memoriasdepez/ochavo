import test from 'node:test';
import assert from 'node:assert/strict';
import {safeDiagnostic,diagnoseSecretManager} from '../work/payments/diagnose-secret-manager.mjs';
import {PROJECT_ID,SECRET_NAMES} from '../work/payments/store-server-secrets.mjs';

const disabled={status:403,body:{error:{code:403,status:'PERMISSION_DENIED',message:'FIXTURE_PRIVATE_MESSAGE',details:[{'@type':'type.googleapis.com/google.rpc.ErrorInfo',domain:'googleapis.com',reason:'SERVICE_DISABLED',metadata:{service:'secretmanager.googleapis.com',consumer:'FIXTURE_PRIVATE_PROJECT'}}]}}};
test('diagnostic emits only bounded codes and approved service metadata',()=>{
  assert.deepEqual(safeDiagnostic(disabled),{httpStatus:403,error:{code:403,status:'PERMISSION_DENIED'},reason:'SERVICE_DISABLED',service:'secretmanager.googleapis.com'});
  const hostile=structuredClone(disabled);hostile.body.error.status='FIXTURE_TOKEN';hostile.body.error.details[0].reason='FIXTURE_SECRET';
  assert.deepEqual(safeDiagnostic(hostile),{httpStatus:403,error:{code:403,status:'UNKNOWN'},reason:null,service:null});
  const foreign=structuredClone(disabled);foreign.body.error.details[0].metadata.service='https://evil.invalid/FIXTURE_TOKEN';
  assert.equal(safeDiagnostic(foreign).service,null);
  assert.equal(safeDiagnostic({status:200,body:{name:'FIXTURE_SECRET'}}).error.status,'OK');
});
test('diagnostic uses only fixed project and secret metadata GETs with suppressed logs and no retries',async()=>{
  const calls=[];
  const clients={projects:{get:async(...args)=>{calls.push(args);return {status:200,body:{projectId:PROJECT_ID,projectNumber:'123456789'}};}},secrets:{get:async(...args)=>{calls.push(args);return disabled;},post:()=>assert.fail('no mutation')}};
  assert.equal((await diagnoseSecretManager({clients})).reason,'SERVICE_DISABLED');
  assert.deepEqual(calls.map(call=>call[0]),['/projects/'+PROJECT_ID,`/projects/${PROJECT_ID}/secrets/${SECRET_NAMES[0]}`]);
  for(const [resource,options] of calls){assert.doesNotMatch(resource,/versions|access|enable|IamPolicy/);assert.equal(options.retries,0);assert.deepEqual(options.retryCodes,[]);assert.equal(options.redirect,'error');assert.deepEqual(options.skipLog,{body:true,resBody:true,queryParams:true});}
  await diagnoseSecretManager({projectId:'foreign-project',clients});assert.equal(calls.length,2);
});
test('foreign project metadata and network errors disclose nothing and cannot reach secret endpoint',async()=>{
  let calls=0;
  const clients={projects:{get:async()=>({status:200,body:{projectId:'foreign-project',projectNumber:'1234'}})},secrets:{get:()=>{calls++;assert.fail('foreign project');}}};
  assert.equal((await diagnoseSecretManager({clients})).httpStatus,0);assert.equal(calls,0);
  clients.projects.get=async()=>{throw Object.assign(Error('FIXTURE_TOKEN'),{body:disabled.body});};
  const result=await diagnoseSecretManager({clients});assert.equal(result.httpStatus,0);assert.doesNotMatch(JSON.stringify(result),/FIXTURE/);
});
