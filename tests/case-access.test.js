import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaseAccess} from '../src/case-access.js';
const metadata={id:'nebula',world:0};
const content={...metadata,steps:Array.from({length:6},()=>({type:'learn',table:{rows:[['Company','Price'],['Ochavo',10]]}}))};
const sample={schemaVersion:1,caseJson:JSON.stringify(content)};
function setup(){let user={uid:'a',emailVerified:true},premium=true,reads=0,resolve;const access=createCaseAccess({db:{},getUser:()=>user,getGame:()=>({premium}),api:{doc:(_db,...path)=>path.join('/'),getDocFromServer:async path=>{assert.equal(path,'premiumCases/case-1');reads++;return new Promise(r=>resolve=r);}}});return {access,setUser:value=>user=value,setPremium:value=>premium=value,finish:(value=sample)=>resolve({exists:()=>true,data:()=>value}),get reads(){return reads;}};}
test('free and unverified accounts never request premium content',async()=>{const s=setup();s.setPremium(false);await assert.rejects(s.access.load(metadata));assert.equal(s.reads,0);s.setPremium(true);s.setUser({uid:'a',emailVerified:false});await assert.rejects(s.access.load(metadata));assert.equal(s.reads,0);});
test('case request is discarded when account changes or subscription expires',async()=>{for(const change of [s=>s.setUser({uid:'b',emailVerified:true}),s=>s.setPremium(false),s=>s.access.clear()]){const s=setup();const pending=s.access.load(metadata);change(s);s.finish();await assert.rejects(pending,/sesión/);}});
test('only the matching protected case can be opened, preserving nested tables',async()=>{const s=setup(),pending=s.access.load(metadata);s.finish();assert.deepEqual(await pending,content);const wrong=s.access.load(metadata);s.finish({...sample,caseJson:JSON.stringify({...content,id:'different'})});await assert.rejects(wrong,/actualización/);});
test('malformed and unsupported protected payloads fail closed',async()=>{for(const record of [{...sample,caseJson:'{'},{...sample,caseJson:'null'},{...sample,schemaVersion:2}]){const s=setup(),pending=s.access.load(metadata);s.finish(record);await assert.rejects(pending,/actualización/);}});

test('new premium case IDs use their stable world document and reject missing or stale content revisions',async()=>{
 for(const [world,id]of [[45,'stocks-v2-1'],[95,'etfs-v2-1'],[115,'crypto-v2-1'],[145,'technical-v2-1'],[148,'technical-v2-3'],[174,'technical-v2-29']]){
  const metadata={world,id,revision:'cases-2026-10'},body={...metadata,steps:content.steps};
  let current=body;const reads=[];
  const access=createCaseAccess({db:{},getUser:()=>({uid:'premium',emailVerified:true}),getGame:()=>({premium:true}),api:{doc:(_db,...path)=>path.join('/'),getDocFromServer:async path=>{reads.push(path);return {exists:()=>true,data:()=>({schemaVersion:1,caseJson:JSON.stringify(current)})};}}});
  assert.deepEqual(await access.load(metadata),body);
  for(const revision of [undefined,'cases-2025-01']){current={...body,revision};await assert.rejects(access.load(metadata),/actualización/);}
  current={...body,world:world+1};await assert.rejects(access.load(metadata),/actualización/);
  assert.deepEqual(reads,Array(4).fill('premiumCases/case-'+(world+1)));
 }
});
