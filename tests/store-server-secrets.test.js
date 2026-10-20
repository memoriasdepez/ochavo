import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,rm,link} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PROJECT_ID,SECRET_NAMES,parseArguments,parseSelectedSecrets,createGoogleClients,storeServerSecrets,openLocalStore,publicFailure} from '../work/payments/store-server-secrets.mjs';

const names=SECRET_NAMES.slice(0,2),projectNumber='123456789';
const fixtures={
  [SECRET_NAMES[0]]:'sk_fixture_only_read_secret',
  [SECRET_NAMES[1]]:'sk_fixture_only_cleanup_secret',
  [SECRET_NAMES[2]]:'fixture_only_webhook_signature_secret',
};
const source=selection=>selection.map(name=>`${name}=${fixtures[name]}`).join('\n');
function fixture(){
  const cloud=new Map(),calls=[],output=[];let record=null;
  const clients={projects:{get:async(resource,options)=>{calls.push({kind:'project',resource,options});return {status:200,body:{projectId:PROJECT_ID,projectNumber}};}},secrets:{
    get:async(resource,options)=>{
      calls.push({method:'GET',resource,options});const match=new RegExp('^/projects/'+PROJECT_ID+'/secrets/('+SECRET_NAMES.join('|')+')(?:/versions/(latest|[1-9][0-9]*))?$').exec(resource);assert.ok(match);
      const [,name,version]=match,entry=cloud.get(name);
      if(!entry)return {status:404};
      if(!version)return {status:200,body:{name:`projects/${projectNumber}/secrets/${name}`}};
      const id=version==='latest'?String(entry.versions.length):version;
      return entry.versions[Number(id)-1]?{status:200,body:{name:`projects/${projectNumber}/secrets/${name}/versions/${id}`,state:'ENABLED'}}:{status:404};
    },
    post:async(resource,body,options)=>{
      calls.push({method:'POST',resource,body,options});
      if(resource===`/projects/${PROJECT_ID}/secrets`){const name=options.queryParams.secretId;assert.ok(SECRET_NAMES.includes(name));assert.deepEqual(body,{replication:{automatic:{}}});cloud.set(name,{versions:[]});return {status:200,body:{name:`projects/${projectNumber}/secrets/${name}`}};}
      const match=new RegExp('^/projects/'+PROJECT_ID+'/secrets/('+SECRET_NAMES.join('|')+'):addVersion$').exec(resource);assert.ok(match);
      const name=match[1],entry=cloud.get(name);entry.versions.push(body.payload.data);
      return {status:200,body:{name:`projects/${projectNumber}/secrets/${name}/versions/${entry.versions.length}`,state:'ENABLED'}};
    },
  }};
  const f={cloud,calls,output,clients,get record(){return record;},set record(value){record=value;},async saveRecord(value){record=structuredClone(value);}};
  f.run=options=>storeServerSecrets({projectId:PROJECT_ID,names,values:Object.fromEntries(names.map(name=>[name,fixtures[name]])),record:f.record,saveRecord:f.saveRecord,clients,onMetadata:metadata=>output.push(metadata),...options});
  return f;
}

test('selection is two approved keys or explicitly includes the real webhook secret',()=>{
  assert.deepEqual(parseArguments([]),{projectId:PROJECT_ID,names});
  assert.deepEqual(parseArguments(['--project',PROJECT_ID,'--include-webhook']).names,SECRET_NAMES);
  for(const args of [['--project','other-project'],['--url','https://evil.invalid'],['--secret','other'],['--include-webhook','--include-webhook']])assert.throws(()=>parseArguments(args));
  assert.deepEqual(parseSelectedSecrets(source(names)+'\nIGNORED_VALUE=not-copied',names),Object.fromEntries(names.map(name=>[name,fixtures[name]])));
  assert.throws(()=>parseSelectedSecrets(source(names),SECRET_NAMES),{code:'MISSING_OR_INVALID_SECRET'});
  assert.throws(()=>parseSelectedSecrets(source(names)+'\n'+source([names[0]]),names),{code:'INVALID_SECRET_FILE'});
  assert.throws(()=>parseSelectedSecrets(names.map(name=>name+'='+fixtures[names[0]]).join('\n'),names),{code:'SEPARATE_KEYS_REQUIRED'});
});

test('logger is silenced before CLI account selection, auth refresh and fixed-origin Client loading',async()=>{
  const order=[],logs=[],constructed=[];
  const logger={silent:false,debug:value=>logs.push(value),log:value=>logs.push(value),clear:()=>order.push('clear')};
  const account={user:{email:'fixture@example.test'},tokens:{access_token:'FIXTURE_TOKEN',refresh_token:'FIXTURE_REFRESH'}};
  const modules={
    'firebase-tools/lib/logger':{logger},
    'firebase-tools/lib/auth':{getProjectDefaultAccount:root=>{assert.equal(root,'fixture-root');assert.equal(logger.silent,true);logger.debug('FIXTURE_TOKEN');return account;},getGlobalDefaultAccount:()=>assert.fail('project account should win')},
    'firebase-tools/lib/requireAuth':{requireAuth:async(options,skipAuto)=>{assert.equal(options.project,PROJECT_ID);assert.equal(options.tokens,account.tokens);assert.equal(skipAuto,true);logger.log('FIXTURE_REFRESH');return account.user.email;}},
    'firebase-tools/lib/apiv2':{Client:class{constructor(options){constructed.push(options);}}},
  };
  await createGoogleClients({root:'fixture-root',env:{},load:name=>{order.push(name);assert.ok(modules[name]);return modules[name];}});
  assert.equal(order[0],'firebase-tools/lib/logger');assert.deepEqual(logs,[]);
  assert.deepEqual(constructed,[{urlPrefix:'https://cloudresourcemanager.googleapis.com',apiVersion:'v1'},{urlPrefix:'https://secretmanager.googleapis.com',apiVersion:'v1'}]);
  for(const env of [{FIREBASE_TOKEN:'fixture'},{GOOGLE_APPLICATION_CREDENTIALS:'fixture'},{FIREBASE_AUTH_URL:'https://evil.invalid'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1'}])await assert.rejects(createGoogleClients({env,load:()=>assert.fail('must reject before imports')}),{code:'UNEXPECTED_AUTH_ENVIRONMENT'});
});

test('authentication failures reveal no token and fall back to the global CLI account only when needed',async()=>{
  const logs=[],logger={debug:value=>logs.push(value),log:value=>logs.push(value)};let globalCalls=0;
  await assert.rejects(createGoogleClients({env:{},load:name=>{
    if(name.endsWith('/logger'))return {logger};
    if(name.endsWith('/auth'))return {getProjectDefaultAccount:()=>null,getGlobalDefaultAccount:()=>{globalCalls++;return {user:{},tokens:{refresh_token:'FIXTURE_TOKEN'}};}};
    if(name.endsWith('/requireAuth'))return {requireAuth:async()=>{logger.debug('FIXTURE_TOKEN');throw Error('FIXTURE_TOKEN');}};
    assert.fail('Client should not load');
  }}),error=>{assert.equal(error.code,'FIREBASE_AUTH_FAILED');assert.equal(JSON.stringify(publicFailure(error)).includes('FIXTURE_TOKEN'),false);return true;});
  assert.equal(globalCalls,1);assert.deepEqual(logs,[]);
  assert.deepEqual(publicFailure(Object.assign(Error('FIXTURE_SECRET'),{code:'FIXTURE_TOKEN'})),{name:null,httpStatus:0,version:null,state:'FAILED'});
});

test('storage uses fixed project, no payload reads, no retries or redirects, and prints only verified metadata',async()=>{
  const f=fixture();await f.run();
  assert.equal(f.cloud.size,2);assert.equal(f.cloud.has(SECRET_NAMES[2]),false);
  for(const call of f.calls){assert.equal(call.options.retries,0);assert.deepEqual(call.options.retryCodes,[]);assert.equal(call.options.redirect,'error');assert.equal(call.options.resolveOnHTTPError,true);assert.deepEqual(call.options.skipLog,{body:true,resBody:true,queryParams:true});assert.ok(call.resource.startsWith('/projects/'+PROJECT_ID));assert.doesNotMatch(call.resource,/:access|IamPolicy|enable|revenuecat/);}
  assert.deepEqual(f.output,names.map(name=>({name,httpStatus:200,version:'1',state:'ENABLED'})));
  for(const value of Object.values(fixtures)){assert.equal(JSON.stringify(f.output).includes(value),false);assert.equal(JSON.stringify(f.record).includes(value),false);assert.equal(JSON.stringify(f.record).includes(Buffer.from(value).toString('base64')),false);}
  await f.run();assert.equal(f.calls.filter(call=>call.resource.endsWith(':addVersion')).length,2);
  assert.equal(f.output.length,4);
});

test('explicit three-secret storage never manufactures a missing HMAC',async()=>{
  const f=fixture();await f.run({names:SECRET_NAMES,values:fixtures});assert.equal(f.cloud.size,3);
  const absent=fixture();await assert.rejects(absent.run({names:SECRET_NAMES}),{code:'INVALID_SECRET_SELECTION'});assert.equal(absent.calls.length,0);
});

test('foreign project or substituted resource metadata cannot receive the payload',async()=>{
  const f=fixture();await assert.rejects(f.run({projectId:'other-project'}),{code:'INVALID_PROJECT'});assert.equal(f.calls.length,0);
  f.clients.projects.get=async()=>({status:200,body:{projectId:'other-project',projectNumber}});
  await assert.rejects(f.run(),{code:'INVALID_REMOTE_PROJECT'});assert.equal(f.calls.length,0);
  const other=fixture();other.cloud.set(names[0],{versions:[]});other.clients.secrets.get=async()=>({status:200,body:{name:'projects/999999/secrets/'+names[0]}});
  await assert.rejects(other.run(),{code:'INVALID_REMOTE_METADATA'});assert.equal(other.calls.filter(call=>call.method==='POST').length,0);
});

test('failed durable record prevents addVersion and unknown network outcome never retries automatically',async()=>{
  const before=fixture();let writes=0;
  await assert.rejects(before.run({saveRecord:async()=>{if(++writes===2)throw Error('fixture disk error');}}),{code:'LOCAL_RECORD_FAILED'});
  assert.equal(before.calls.filter(call=>call.resource.endsWith(':addVersion')).length,0);
  const uncertain=fixture(),post=uncertain.clients.secrets.post;let additions=0;
  uncertain.clients.secrets.post=async(resource,body,options)=>{
    if(resource.endsWith(':addVersion')){additions++;assert.equal(options.retries,0);throw Error('request failed '+JSON.stringify(body)+' FIXTURE_TOKEN');}
    return post(resource,body,options);
  };
  await assert.rejects(uncertain.run(),error=>{assert.equal(error.code,'ADD_VERSION_OUTCOME_UNKNOWN');assert.equal(JSON.stringify(publicFailure(error)).includes('FIXTURE_TOKEN'),false);return true;});
  assert.equal(uncertain.record.entries[names[0]].phase,'adding');assert.equal(additions,1);
  await assert.rejects(uncertain.run(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(additions,1);assert.deepEqual(uncertain.output,[]);
});

test('failure recording a successful remote add leaves an uncertain marker and cannot duplicate the version',async()=>{
  const f=fixture();let writes=0;
  await assert.rejects(f.run({saveRecord:async record=>{if(++writes===3)throw Error('fixture disk failure');await f.saveRecord(record);}}),{code:'LOCAL_RECORD_FAILED'});
  assert.equal(f.cloud.get(names[0]).versions.length,1);assert.equal(f.record.entries[names[0]].phase,'adding');assert.deepEqual(f.output,[]);
  await assert.rejects(f.run(),{code:'PREVIOUS_OUTCOME_REQUIRES_REVIEW'});assert.equal(f.cloud.get(names[0]).versions.length,1);
});

test('unknown existing versions, disabled versions and changed input require review instead of appending',async()=>{
  const f=fixture();f.cloud.set(names[0],{versions:['fixture-existing-base64']});await assert.rejects(f.run(),{code:'UNTRACKED_VERSION_REQUIRES_REVIEW'});
  assert.equal(f.calls.filter(call=>call.resource.endsWith(':addVersion')).length,0);
  const known=fixture();await known.run();const changed={...fixtures,[names[0]]:'sk_fixture_replacement_changed'};delete changed[SECRET_NAMES[2]];
  await assert.rejects(known.run({values:changed}),{code:'LOCAL_VALUE_CHANGED_REVIEW_REQUIRED'});
  const get=known.clients.secrets.get;known.clients.secrets.get=async(...args)=>{const result=await get(...args);if(result.body?.state)result.body.state='DISABLED';return result;};
  await assert.rejects(known.run(),{code:'STORED_VERSION_REQUIRES_REVIEW'});
  assert.equal(known.calls.filter(call=>call.resource.endsWith(':addVersion')).length,2);
});

async function localFixture(t){
  const parent=fileURLToPath(new URL('../work/payments/',import.meta.url)),root=await mkdtemp(path.join(parent,'store-test-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(parent));assert.ok(path.basename(root).startsWith('store-test-'));await rm(root,{recursive:true,force:true});});
  await mkdir(path.join(root,'functions'));await mkdir(path.join(root,'work/payments'),{recursive:true});
  await writeFile(path.join(root,'functions/.secret.local'),source(names));return root;
}
test('local files use a lock and atomic metadata record while the fixture source stays unchanged',async t=>{
  const root=await localFixture(t),local=await openLocalStore(root);
  try{
    assert.equal(await local.readSource(),source(names));assert.equal(await local.readRecord(),null);
    await assert.rejects(openLocalStore(root),{code:'LOCAL_LOCK_REQUIRES_REVIEW'});
    const metadata={schemaVersion:1,projectId:PROJECT_ID,projectNumber,entries:{}};
    await local.saveRecord(metadata);assert.deepEqual(await local.readRecord(),metadata);
    assert.equal(await readFile(path.join(root,'functions/.secret.local'),'utf8'),source(names));
  }finally{await local.close();}
  const again=await openLocalStore(root);await again.close();
});
test('hard-linked fixture source and journal targets are rejected without overwriting anything',async t=>{
  const root=await localFixture(t),local=await openLocalStore(root);
  try{
    await link(path.join(root,'functions/.secret.local'),path.join(root,'keep-fixture.txt'));
    await assert.rejects(local.readSource(),{code:'UNSAFE_LOCAL_PATH'});
    const keep=path.join(root,'keep-metadata.txt');await writeFile(keep,'unchanged');await link(keep,path.join(root,'work/payments/secret-storage-state.json'));
    await assert.rejects(local.saveRecord({}),{code:'UNSAFE_LOCAL_PATH'});assert.equal(await readFile(keep,'utf8'),'unchanged');
  }finally{await local.close();}
});
