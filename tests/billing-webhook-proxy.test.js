import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {createWebhookProxy,assertWebhookTarget,PROXY_HOST,PROXY_PORT,WEBHOOK_TARGET,MAX_BODY_BYTES} from '../scripts/billing-webhook-proxy.mjs';

const signature='t=1801656000,v1='+'a'.repeat(64);
class Response extends EventEmitter{
  constructor(){super();this.writableEnded=false;this.destroyed=false;this.headers=null;this.body=null;}
  writeHead(status,headers){this.status=status;this.headers=headers;}
  end(body){this.body=body;this.writableEnded=true;}
}
function request({method='POST',url='/revenuecatWebhook',headers={},rawHeaders}={}){
  const req=new PassThrough();Object.assign(req,{method,url,headers:{host:'127.0.0.1:8787','content-type':'application/json','x-revenuecat-webhook-signature':signature,...headers}});
  req.rawHeaders=rawHeaders||Object.entries(req.headers).flatMap(([key,value])=>[key,value]);return req;
}
async function exchange(proxy,body=Buffer.from('{"event":{"id":"test"}}'),options={}){
  const req=request(options),res=new Response(),task=proxy.handler(req,res);req.end(body);await task;return {req,res};
}

test('relay binds only loopback and accepts no host, port, target or oversized resource overrides',()=>{
  const proxy=createWebhookProxy();assert.equal(proxy.host,PROXY_HOST);assert.equal(proxy.port,PROXY_PORT);assert.equal(proxy.server.listening,false);
  assert.equal(proxy.server.maxHeadersCount,32);assert.equal(proxy.server.maxRequestsPerSocket,1);
  for(const changes of [{host:'0.0.0.0'},{port:5173},{target:WEBHOOK_TARGET},{maxConcurrent:5},{upstreamTimeoutMs:60000},{bodyTimeoutMs:10000}])assert.throws(()=>createWebhookProxy(changes));
  for(const target of ['http://localhost:5001/demo-brote/europe-west1/revenuecatWebhook','http://127.0.0.1:5001/brote-62d26/europe-west1/revenuecatWebhook',WEBHOOK_TARGET+'?token=secret','https://example.com/revenuecatWebhook','http://127.0.0.1:5001@evil.invalid/demo-brote/europe-west1/revenuecatWebhook'])assert.throws(()=>assertWebhookTarget(target));
});

test('raw bytes and signature survive forwarding; unrelated authorization and forwarded headers never do',async()=>{
  const calls=[],raw=Buffer.from('{\r\n "event" : {"id":"utf8-ñ","n":1.00} \r\n}\n','utf8');
  const proxy=createWebhookProxy({fetchImpl:async(url,options)=>{calls.push({url,options});return {status:200};}});
  const {res}=await exchange(proxy,raw,{headers:{'content-type':'application/json; charset=UTF-8',authorization:'secret-never-forwarded','x-forwarded-host':'public-tunnel.invalid'}});
  assert.equal(res.status,200);assert.equal(calls.length,1);assert.equal(calls[0].url,WEBHOOK_TARGET);assert.equal(calls[0].options.method,'POST');assert.equal(calls[0].options.redirect,'error');
  assert.deepEqual(calls[0].options.body,raw);assert.equal(calls[0].options.headers['x-revenuecat-webhook-signature'],signature);
  assert.deepEqual(Object.keys(calls[0].options.headers).sort(),['Content-Type','x-revenuecat-webhook-signature'].sort());
  assert.equal(res.headers['Cache-Control'],'no-store');assert.doesNotMatch(res.body,/secret|signature|event/);
});

test('all other paths, methods, queries and control hosts return 404 without forwarding',async()=>{
  let called=0;const proxy=createWebhookProxy({fetchImpl:async()=>{called++;return {status:200};}});
  const requests=[{method:'GET'},{method:'OPTIONS'},{method:'PUT'},{url:'/revenuecatWebhook?token=do-not-log'},{url:'/revenuecatWebhook/'},{url:'http://attacker.invalid/revenuecatWebhook'},{url:'/%72evenuecatWebhook'},{url:'/identitytoolkit.googleapis.com/v1/accounts:lookup'},{url:'/v1/projects/demo-brote/databases/(default)/documents'},{url:'/'},{headers:{host:'public-tunnel.invalid'}},{headers:{host:'localhost:8787'}},{headers:{host:'127.0.0.1:5173'}},{headers:{host:'127.0.0.1:8787\r\nInjected: true'}}];
  for(const options of requests)assert.equal((await exchange(proxy,Buffer.from('{}'),options)).res.status,404);
  assert.equal(called,0);
});

test('bad MIME, compression, absent signature, control characters and ambiguous headers are rejected early',async()=>{
  let called=0;const proxy=createWebhookProxy({fetchImpl:async()=>{called++;return {status:200};}});
  const invalid=[{'content-type':'text/plain'},{'content-type':'application/jsonp'},{'content-type':'application/json; charset=latin1'},{'content-type':'application/json; unexpected=true'},{'content-encoding':'gzip'},{'transfer-encoding':'gzip'},{'transfer-encoding':'chunked','content-length':'2'},{'x-revenuecat-webhook-signature':undefined},{'x-revenuecat-webhook-signature':''},{'x-revenuecat-webhook-signature':'a'.repeat(513)},{'x-revenuecat-webhook-signature':'t=1\r\nv1=bad'},{'content-type':'application/json\r\n'}];
  for(const headers of invalid)assert.equal((await exchange(proxy,Buffer.from('{}'),{headers})).res.status,404);
  for(const name of ['Host','Content-Type','Content-Length','X-RevenueCat-Webhook-Signature']){
    const req=request(name==='Content-Length'?{headers:{'content-length':'2'}}:{});req.rawHeaders.push(name,'duplicate');const res=new Response(),task=proxy.handler(req,res);req.end('{}');await task;assert.equal(res.status,404);
  }
  assert.equal(called,0);
});

test('body bound applies to declared length and chunked streamed bytes with no oversized forwarding',async()=>{
  let called=0;const proxy=createWebhookProxy({fetchImpl:async()=>{called++;return {status:200};}});
  assert.equal((await exchange(proxy,Buffer.from('{}'),{headers:{'content-length':String(MAX_BODY_BYTES+1)}})).res.status,413);
  const req=request({headers:{'transfer-encoding':'chunked'}}),res=new Response(),task=proxy.handler(req,res);
  req.write(Buffer.alloc(MAX_BODY_BYTES));req.end(Buffer.from('x'));await task;assert.equal(res.status,413);assert.equal(called,0);
  assert.equal((await exchange(proxy,Buffer.alloc(MAX_BODY_BYTES),{headers:{'content-length':String(MAX_BODY_BYTES)}})).res.status,200);assert.equal(called,1);
});

test('malformed or mismatched content length fails without forwarding',async()=>{
  let called=0;const proxy=createWebhookProxy({fetchImpl:async()=>{called++;return {status:200};}});
  for(const length of ['-1','2.5','1e3','12junk',['2']])assert.equal((await exchange(proxy,Buffer.from('{}'),{headers:{'content-length':length}})).res.status,404);
  assert.equal((await exchange(proxy,Buffer.from('{}'),{headers:{'content-length':'3'}})).res.status,400);assert.equal(called,0);
});

test('requests are limited concurrently and failed upstream calls release capacity',async()=>{
  let release;const pending=new Promise(resolve=>{release=resolve;});
  const proxy=createWebhookProxy({maxConcurrent:1,fetchImpl:async()=>{await pending;return {status:200};}});
  const req=request(),res=new Response(),first=proxy.handler(req,res);req.end('{}');
  assert.equal(proxy.inFlight(),1);assert.equal((await exchange(proxy)).res.status,429);assert.equal(proxy.inFlight(),1);
  release();await first;assert.equal(res.status,200);assert.equal(proxy.inFlight(),0);
  const failed=createWebhookProxy({fetchImpl:async()=>{throw Error('private backend response');}});
  const failure=await exchange(failed);assert.equal(failure.res.status,502);assert.equal(failed.inFlight(),0);assert.doesNotMatch(failure.res.body,/private/);
});

test('slow incomplete body times out and request abort stops forwarding',async()=>{
  let called=0;const proxy=createWebhookProxy({bodyTimeoutMs:10,fetchImpl:async()=>{called++;return {status:200};}});
  const req=request(),res=new Response();await proxy.handler(req,res);assert.equal(res.status,408);assert.equal(called,0);assert.equal(proxy.inFlight(),0);
  const aborted=request(),abortedResponse=new Response(),task=proxy.handler(aborted,abortedResponse);aborted.emit('aborted');await task;assert.equal(abortedResponse.status,400);assert.equal(called,0);
});

test('upstream timeout is bounded even when an injected fetch ignores abort',async()=>{
  let signal;const proxy=createWebhookProxy({upstreamTimeoutMs:10,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  const {res}=await exchange(proxy);assert.equal(res.status,504);assert.equal(signal.aborted,true);assert.equal(proxy.inFlight(),0);
});

test('client disconnect aborts the upstream and releases capacity',async()=>{
  let started;const ready=new Promise(resolve=>{started=resolve;});let signal;
  const proxy=createWebhookProxy({fetchImpl:async(url,options)=>{signal=options.signal;started();return new Promise(()=>{});}});
  const req=request(),res=new Response(),task=proxy.handler(req,res);req.end('{}');await ready;res.destroyed=true;res.emit('close');await task;assert.equal(signal.aborted,true);assert.equal(proxy.inFlight(),0);assert.equal(res.status,undefined);
});

test('redirects are not followed and upstream errors or payloads are never reflected',async()=>{
  for(const status of [200,401,503,302]){
    let cancelled=false;const proxy=createWebhookProxy({fetchImpl:async()=>({status,headers:{Authorization:'private'},body:{cancel:async()=>{cancelled=true;}}})});
    const {res}=await exchange(proxy);assert.equal(res.status,status===302?502:status);assert.equal(cancelled,true);assert.doesNotMatch(res.body,/private|Authorization/);assert.deepEqual(JSON.parse(res.body),{ok:status>=200&&status<300});
  }
});

test('importing the proxy does not start anything and source never reads keys or logs request details',()=>{
  const source=readFileSync(new URL('../scripts/billing-webhook-proxy.mjs',import.meta.url),'utf8');
  assert.match(source,/import\.meta\.url===pathToFileURL/);assert.doesNotMatch(source,/readFile|\.secret\.local|process\.env|config\.json|https:\/\//);
  const logs=source.split('\n').filter(line=>/console\.(log|error)/.test(line));
  assert.ok(logs.every(line=>!line.includes('req.')&&!line.includes('error.')&&!line.includes('headers')&&!line.includes('body')));
});
