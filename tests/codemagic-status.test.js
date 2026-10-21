import test from 'node:test';
import assert from 'node:assert/strict';
import {readCodemagicStatus} from '../scripts/codemagic-status.mjs';

test('missing credentials stop the request before network access',async()=>{
  await assert.rejects(readCodemagicStatus({token:'',fetchImpl:()=>assert.fail('No network')}),/Falta CODEMAGIC_API_TOKEN/);
});

test('invalid app IDs cannot change the destination or request path',async()=>{
  await assert.rejects(readCodemagicStatus({token:'test-placeholder',appId:'../other',fetchImpl:()=>assert.fail('No network')}),/Identificador/);
});

test('only GET is sent to Codemagic and response credential fields are excluded',async()=>{
  let calls=0;
  const report=await readCodemagicStatus({token:'test-placeholder',appId:'6accf99e8c1d0301049c0174',fetchImpl:async(url,options)=>{
    calls++;assert.equal(url,'https://api.codemagic.io/apps/6accf99e8c1d0301049c0174');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers['x-auth-token'],'test-placeholder');
    return {ok:true,json:async()=>({application:{_id:'6accf99e8c1d0301049c0174',appName:'ochavo-ios',branches:['main'],workflowIds:[],environment:{secret:'never-print-this'}}})};
  }});
  assert.equal(calls,1);assert.equal(report.applications[0].name,'ochavo-ios');assert.deepEqual(report.applications[0].branches,['main']);assert.ok(!JSON.stringify(report).includes('never-print-this'));assert.ok(!JSON.stringify(report).includes('test-placeholder'));
});

test('API failure bodies cannot expose credentials in error messages',async()=>{
  await assert.rejects(readCodemagicStatus({token:'test-placeholder',fetchImpl:async()=>({ok:false,status:401,json:async()=>{assert.fail('Do not read error credentials');}})}),/^Error: Codemagic respondió HTTP 401/);
});
