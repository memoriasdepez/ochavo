import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDestination,summarize} from '../scripts/beta-capacity.mjs';
test('capacity runner refuses production, remote and shared emulator destinations',()=>{
  validateDestination('127.0.0.1:8088');
  for(const host of [undefined,'brote-62d26','127.0.0.1:8080','firestore.googleapis.com','0.0.0.0:8088','localhost:8088'])assert.throws(()=>validateDestination(host));
  assert.throws(()=>validateDestination('127.0.0.1:8088',['--project','brote-62d26']));
});
test('latency report uses measured percentiles, including empty and single samples',()=>{
  assert.deepEqual(summarize([]),{count:0});
  assert.deepEqual(summarize([12]),{count:1,p50Ms:12,p95Ms:12,maxMs:12});
  assert.deepEqual(summarize(Array.from({length:100},(_,i)=>100-i)),{count:100,p50Ms:50,p95Ms:95,maxMs:100});
});
