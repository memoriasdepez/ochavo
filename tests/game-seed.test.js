import test from 'node:test';
import assert from 'node:assert/strict';
import {buildGameSeed,encodeFirestoreValue,publishGameSeed} from '../scripts/seed-game-catalog.mjs';

test('catalog preparation keeps calendar timestamps typed and covers Madrid DST boundaries',()=>{
  const result=buildGameSeed({lessons:[{id:0,steps:[{type:'learn'},{type:'numeric'}]}],exams:[{id:0}],firstYear:2026,lastYear:2026});
  assert.equal(result.records.filter(r=>r.path.startsWith('gameDays/')).length,365);
  const spring=result.records.find(r=>r.path==='gameDays/2026-03-29').data;
  assert.equal(Date.parse(spring.endAt.$timestamp)-Date.parse(spring.startAt.$timestamp),23*3600000);
  assert.equal(encodeFirestoreValue(spring).mapValue.fields.startAt.timestampValue,'2026-03-28T23:00:00.000Z');
  assert.equal(result.catalog['answer-0-1'].amount,1);assert.equal(result.catalog['case-1'].requiredClaim,'exam-0');
});
test('administrative seed writes only protected game configuration in bounded idempotent paths',async()=>{
  const requests=[],records=Array.from({length:805},(_,i)=>({path:'gameCatalog/item-'+i,data:{amount:1}}));
  const result=await publishGameSeed(records,{projectId:'demo-viruta-game',accessToken:'test-only',fetchImpl:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true};}});
  assert.equal(result.written,805);assert.deepEqual(requests.map(r=>r.body.writes.length),[400,400,5]);
  assert.equal(requests[0].body.writes[0].update.name,'projects/demo-viruta-game/databases/(default)/documents/gameCatalog/item-0');
  await assert.rejects(publishGameSeed([{path:'users/other',data:{}}],{projectId:'demo-viruta-game',accessToken:'test-only',fetchImpl:()=>{throw Error('must not call');}}),/solo admite/);
});
test('failed seed does not print or include credentials in the error',async()=>{
  await assert.rejects(publishGameSeed([{path:'gameConfig/economy',data:{version:1}}],{projectId:'demo-viruta-game',accessToken:'secret-test-only',fetchImpl:async()=>({ok:false,status:403})}),error=>error.message.includes('HTTP 403')&&!error.message.includes('secret-test-only'));
});
