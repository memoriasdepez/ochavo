import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDocFromServer} from 'firebase/firestore';
import {createCaseAccess} from '../src/case-access.js';
import {encodeFirestoreValue} from '../scripts/seed-game-catalog.mjs';
import {CASE_PARTS} from '../src/content-files.js';
import {emptyCommerce} from '../src/game-domain.js';

const host=process.env.FIRESTORE_EMULATOR_HOST,enabled=!!host,projectId='demo-viruta-premium-seed';
let environment,directory,records,originals;
function nestedRows(value){
  if(!value||typeof value!=='object')return 0;
  const here=Array.isArray(value.rows)&&value.rows.some(Array.isArray)?1:0;
  return here+Object.values(value).reduce((n,child)=>n+nestedRows(child),0);
}
before(async()=>{
  if(!enabled)return;
  assert.match(host,/^(127\.0\.0\.1|localhost):\d+$/,'This test may use only a local emulator.');
  directory=await mkdtemp(fileURLToPath(new URL('../../../work/premium-seed-qa-',import.meta.url)));
  const output=join(directory,'seed.json');
  execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/seed-premium-cases.mjs',import.meta.url)),'--out',output],{stdio:'pipe'});
  ({records}=JSON.parse(await readFile(output,'utf8')));
  originals=(await Promise.all(CASE_PARTS.map(async name=>JSON.parse(await readFile(new URL('../src/content/'+name+'.json',import.meta.url),'utf8'))))).flatMap(v=>v.cases);
  const [hostname,port]=host.split(':');
  environment=await initializeTestEnvironment({projectId,firestore:{host:hostname,port:+port,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});
  await environment.clearFirestore();
  const prefix=`projects/${projectId}/databases/(default)/documents`;
  const active={...emptyCommerce(),revision:1,premiumUntilMs:Date.now()+3600000,store:'play_store'};
  const fixtures=[
    {path:'users/premium/commerce/main',data:active},
    {path:'users/unverified/commerce/main',data:active},
    {path:'users/deleted/commerce/main',data:active},
    {path:'accountDeletions/deleted',data:{deletedAt:'emulator-fixture'}},
    {path:'users/expired/commerce/main',data:{...active,premiumUntilMs:Date.now()-1000}}
  ];
  // Exercise exactly the REST Firestore encoding used by --publish, against the emulator only.
  const response=await fetch(`http://${host}/v1/${prefix}:commit`,{method:'POST',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({writes:[...records,...fixtures].map(r=>({update:{name:prefix+'/'+r.path,fields:encodeFirestoreValue(r.data).mapValue.fields}}))})});
  assert.equal(response.status,200,await response.text());
});
after(async()=>{if(environment){await environment.clearFirestore();await environment.cleanup();}if(directory){await unlink(join(directory,'seed.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}});
const check=(name,fn)=>test(name,{skip:!enabled},fn);

check('actual seed exports 174 protected string documents and REST accepts every nested table',async()=>{
  assert.equal(records.length,174);assert.equal(new Set(records.map(r=>r.path)).size,174);
  let tables=0;
  const db=environment.authenticatedContext('premium',{email_verified:true}).firestore();
  const access=createCaseAccess({db,getUser:()=>({uid:'premium',emailVerified:true}),getGame:()=>({premium:true})});
  for(const original of originals){
    const record=records.find(r=>r.path==='premiumCases/case-'+(original.world+1));
    assert.deepEqual(Object.keys(record.data).sort(),['caseJson','schemaVersion']);
    assert.equal(record.data.schemaVersion,1);assert.equal(typeof record.data.caseJson,'string');
    const server=await getDocFromServer(doc(db,record.path));assert.equal(server.exists(),true);
    assert.deepEqual(server.data(),record.data);
    assert.deepEqual(await access.load({id:original.id,world:original.world,...(original.revision?{revision:original.revision}:{})}),original);
    tables+=nestedRows(original);
  }
  assert.ok(tables>0,'The real authored fixtures must exercise nested table rows.');
  console.log(`Verified 174 cases and ${tables} nested-row tables through REST and protected server reads.`);
});
check('caseJson payload remains unreadable to free, expired, unverified, deleted and anonymous accounts',async()=>{
  const clients=[environment.authenticatedContext('free',{email_verified:true}).firestore(),environment.authenticatedContext('expired',{email_verified:true}).firestore(),environment.authenticatedContext('unverified',{email_verified:false}).firestore(),environment.authenticatedContext('deleted',{email_verified:true}).firestore(),environment.unauthenticatedContext().firestore()];
  for(const db of clients)for(const record of records)await assertFails(getDocFromServer(doc(db,record.path)));
});
check('protected server reads reject stale revisions for new cases in every path and across the retired technical gap',async()=>{
  const db=environment.authenticatedContext('premium',{email_verified:true}).firestore();
  const access=createCaseAccess({db,getUser:()=>({uid:'premium',emailVerified:true}),getGame:()=>({premium:true})});
  for(const world of [45,95,115,145,148,174]){
    const original=originals.find(item=>item.world===world);assert.ok(original);
    assert.deepEqual(await access.load({id:original.id,world,revision:'cases-2026-10'}),original);
    await assert.rejects(access.load({id:original.id,world,revision:'cases-stale'}),/actualización/);
  }
});
