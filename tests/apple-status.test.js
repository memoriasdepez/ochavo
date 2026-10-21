import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,verify} from 'node:crypto';
import {appleToken,appleCredentialStatus,readAppleStatus} from '../scripts/apple-status.mjs';

// Ephemeral test keys; never account credentials.
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const env={APP_STORE_CONNECT_KEY_ID:'TESTKEY123',APP_STORE_CONNECT_ISSUER_ID:'00000000-0000-0000-0000-000000000000',APP_STORE_CONNECT_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};

test('missing configuration is identified by name before any network request',async()=>{
  assert.equal(appleCredentialStatus({}).configured,false);
  assert.equal(appleCredentialStatus({}).missing.length,3);
  await assert.rejects(readAppleStatus({env:{},fetchImpl:()=>assert.fail('Network must not run')}),/Faltan variables seguras/);
});

test('the Apple JWT has a valid ES256 signature and expires in ten minutes',()=>{
  const now=Date.UTC(2026,9,21),token=appleToken(env,now),[header,payload,signature]=token.split('.');
  const h=JSON.parse(Buffer.from(header,'base64url')),p=JSON.parse(Buffer.from(payload,'base64url'));
  assert.equal(h.alg,'ES256');assert.equal(h.kid,env.APP_STORE_CONNECT_KEY_ID);
  assert.equal(p.aud,'appstoreconnect-v1');assert.equal(p.iat,now/1000);assert.equal(p.exp-p.iat,600);
  assert.ok(verify('sha256',Buffer.from(header+'.'+payload),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
  assert.ok(!token.includes('PRIVATE KEY'));
});

test('private-key failures do not disclose the invalid credential',()=>{
  const invalid='not-a-key-sensitive-value';
  assert.throws(()=>appleToken({...env,APP_STORE_CONNECT_PRIVATE_KEY:invalid}),error=>!error.message.includes(invalid)&&error.message.includes('formato PEM'));
});

test('the original PKCS#8 body and escaped PEM both produce valid Apple signatures',()=>{
  const body=privateKey.export({type:'pkcs8',format:'der'}).toString('base64').match(/.{1,64}/g).join('\n');
  for(const value of [body,env.APP_STORE_CONNECT_PRIVATE_KEY.replace(/\n/g,'\\n')]){
    const [header,payload,signature]=appleToken({...env,APP_STORE_CONNECT_PRIVATE_KEY:value}).split('.');
    assert.ok(verify('sha256',Buffer.from(header+'.'+payload),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'base64url')));
  }
});

test('status queries use only authenticated GET requests to Apple and report limited results',async()=>{
  const requests=[];
  const fetchImpl=async(url,options)=>{
    requests.push([url,options]);let data;
    if(url.pathname==='/v1/apps')data={data:[{id:'123456',attributes:{bundleId:'app.brote.inversion',name:'Ochavo'}}]};
    else if(url.pathname.endsWith('/appStoreVersions'))data={data:[{id:'v1',attributes:{versionString:'0.35.4',platform:'IOS',appStoreState:'WAITING_FOR_REVIEW'}}]};
    else if(url.pathname==='/v1/builds')data={data:[{id:'b1',attributes:{version:'66',processingState:'VALID'},relationships:{preReleaseVersion:{data:{id:'p1'}}}}],included:[{id:'p1',attributes:{version:'0.35.4'}}]};
    else data={data:[{id:'g1',attributes:{name:'Internal',isInternalGroup:true}}]};
    return {ok:true,json:async()=>data};
  };
  const report=await readAppleStatus({env,fetchImpl});
  assert.equal(requests.length,4);
  for(const [url,options] of requests){assert.equal(url.origin,'https://api.appstoreconnect.apple.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.match(options.headers.Authorization,/^Bearer /);}
  assert.equal(report.appStoreVersions[0].state,'WAITING_FOR_REVIEW');assert.equal(report.latestBuilds[0].version,'0.35.4');
  assert.equal(report.testFlightGroups[0].internal,true);
  assert.ok(!JSON.stringify(report).includes('PRIVATE KEY'));assert.ok(!JSON.stringify(report).includes('Bearer '));
});

test('authentication errors are reported without reflecting server content or credentials',async()=>{
  await assert.rejects(readAppleStatus({env,fetchImpl:async()=>({ok:false,status:401,json:async()=>({token:'must-not-be-printed'})})}),/^Error: Apple respondió HTTP 401/);
});
