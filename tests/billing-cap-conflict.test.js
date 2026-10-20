import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnoseBillingCapConflict,sanitizeConflictMessage,safeConflictFailure} from '../work/payments/diagnose-billing-cap-conflict.mjs';
const project='brote-62d26',resource=`projects/${project}/locations/europe-west1/services/billing`,method='google.cloud.run.v2.Services.UpdateService';
const entry=message=>({timestamp:'2026-10-07T15:36:53.123Z',protoPayload:{serviceName:'run.googleapis.com',methodName:method,resourceName:resource,status:{code:10,message},authenticationInfo:{principalEmail:'private@example.invalid'},request:{private:'NO_RAW_REQUEST'}}});
function fixture(){const f={calls:[],pages:[{entries:[entry('The resource was modified; etag mismatch.')]}]};f.clients={projects:{get:async(path,options)=>{f.calls.push({method:'GET',path,options});return {status:200,body:{projectId:project,projectNumber:'226760894540',lifecycleState:'ACTIVE'}};}}};f.logging={post:async(path,body,options)=>{f.calls.push({method:'POST',path,body,options});return {status:200,body:f.pages.shift()||{}};}};return f;}
test('diagnostic is limited to fixed audit search and projects the Any payload without exposing private fields',async()=>{
  const f=fixture(),result=await diagnoseBillingCapConflict(f);assert.equal(result.state,'FAILED_UPDATE_FOUND');assert.equal(result.entries[0].statusCode,10);assert.equal(result.entries[0].message,'The resource was modified; etag mismatch.');assert.equal(f.calls.length,2);
  const search=f.calls[1];assert.equal(search.path,'/entries:list');assert.deepEqual(search.body.resourceNames,[`projects/${project}`]);assert.match(search.body.filter,/2026-10-07T15:35:00Z/);assert.match(search.body.filter,/2026-10-07T15:39:00Z/);assert.match(search.body.filter,/Services.UpdateService/);assert.match(search.body.filter,/services\/billing"/);assert.equal(search.body.pageSize,20);assert.equal(search.options.queryParams.fields,'entries(timestamp,protoPayload),nextPageToken');assert.doesNotMatch(JSON.stringify(result),/private@example|NO_RAW_REQUEST/);
  for(const call of f.calls){assert.equal(call.options.retries,0);assert.deepEqual(call.options.retryCodes,[]);assert.equal(call.options.redirect,'error');assert.deepEqual(call.options.skipLog,{body:true,resBody:true,queryParams:true});}
});
test('request, response and caller details are never inspected; read errors emit only the sanitized message',async()=>{
  const f=fixture();for(const field of ['request','response','authenticationInfo'])Object.defineProperty(f.pages[0].entries[0].protoPayload,field,{get(){assert.fail('Private audit detail accessed');}});
  assert.equal((await diagnoseBillingCapConflict(f)).entries.length,1);
  const g=fixture();g.logging.post=async()=>({status:400,body:{error:{message:'Invalid field selection protoPayload(serviceName). private@example.invalid Bearer hidden-token sk_private_dummy_123456789',details:[{private:'DO_NOT_EMIT'}]}}});
  let failure;try{await diagnoseBillingCapConflict(g);}catch(error){failure=safeConflictFailure(error);}
  assert.equal(failure.state,'AUDIT_READ_FAILED');assert.equal(failure.httpStatus,400);assert.match(failure.message,/Invalid field selection protoPayload\(serviceName\)/);assert.doesNotMatch(JSON.stringify(failure),/private@example|hidden-token|sk_private|DO_NOT_EMIT/);assert.deepEqual(Object.keys(failure).sort(),['httpStatus','message','state']);
});
test('unrelated entries are discarded and pages are bounded at two with identical filters',async()=>{
  const f=fixture(),foreign=entry('PRIVATE');foreign.protoPayload.resourceName=resource+'other';const old=entry('PRIVATE');old.timestamp='2026-10-07T14:00:00Z';f.pages=[{entries:[foreign,old],nextPageToken:'opaque-page-1'},{entries:[entry('Conflict')],nextPageToken:'opaque-page-2'}];const result=await diagnoseBillingCapConflict(f);assert.equal(result.discarded,2);assert.equal(result.entries.length,1);assert.equal(result.complete,false);assert.equal(f.calls.length,3);assert.equal(f.calls[1].body.filter,f.calls[2].body.filter);assert.equal(f.calls[2].body.pageToken,'opaque-page-1');
});
test('wrong project cannot query logs and messages cannot disclose obvious identifiers or credentials',async()=>{
  const f=fixture();await assert.rejects(diagnoseBillingCapConflict({...f,projectId:'foreign'}),{code:'INVALID_TARGET'});assert.equal(f.calls.length,0);
  const clean=sanitizeConflictMessage('Error for projects/test/locations/test/services/test private@example.invalid https://secret.example/x Bearer abc123 sk_private_dummy_token_12345 "opaque-etag" abcdefghijklmnopqrstuvwxyz0123456789');assert.doesNotMatch(clean,/private@|secret.example|abc123|sk_private|opaque-etag|abcdefghijklmnopqrstuvwxyz/);assert.match(clean,/\[resource\]/);
  assert.deepEqual(safeConflictFailure(Error('PRIVATE')),{state:'DIAGNOSTIC_FAILED',httpStatus:0});
});
