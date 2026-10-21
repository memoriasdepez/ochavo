import test from 'node:test';
import assert from 'node:assert/strict';
import {createWelcomeBackend, createWelcomeController} from '../src/welcome.js';

const storage = () => {
  const data = new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
};
function accountBackend({existing=false,deleted=false}={}) {
  const documents = new Map();
  if(existing)documents.set('users/a/progress/main',{});
  if(deleted)documents.set('accountDeletions/a',{});
  let sequence = Promise.resolve();
  const api = {doc:(_db,...parts)=>parts.join('/'),serverTimestamp:()=>42,
    deleteDoc:async key=>{documents.delete(key);},
    runTransaction:(_db,run)=>{
      const request=sequence.then(()=>run({get:async key=>({exists:()=>documents.has(key)}),set:(key,value)=>documents.set(key,value)}));
      sequence=request.catch(()=>{});return request;
    }};
  return {backend:createWelcomeBackend({},api),documents};
}
test('first login claims welcome once across independent devices and fresh storage',async()=>{
  const {backend}=accountBackend();
  const phone=createWelcomeController({backend,storage:storage()});
  const web=createWelcomeController({backend,storage:storage()});
  assert.equal(await phone.claim('a'),true);
  assert.equal(await phone.claim('a'),false);
  assert.equal(await web.claim('a'),false);
  assert.equal(await createWelcomeController({backend,storage:storage()}).claim('a'),false);
});
test('two simultaneous first logins open exactly one welcome',async()=>{
  const {backend}=accountBackend();
  const devices=[0,1].map(()=>createWelcomeController({backend,storage:storage()}));
  assert.deepEqual((await Promise.all(devices.map(d=>d.claim('a')))).sort(),[false,true]);
});
test('existing learners and deleted accounts never get a fresh tutorial',async()=>{
  for(const options of [{existing:true},{deleted:true}]){
    const {backend}=accountBackend(options);
    assert.equal(await createWelcomeController({backend,storage:storage()}).claim('a'),false);
  }
});
test('different accounts on the same device each have their own first login',async()=>{
  const {backend}=accountBackend();const controller=createWelcomeController({backend,storage:storage()});
  assert.equal(await controller.claim('a'),true);
  assert.equal(await controller.claim('b'),true);
  assert.equal(await controller.claim('a'),false);
});
test('failed server read defers welcome and remains retryable',async()=>{
  let calls=0;const controller=createWelcomeController({backend:{claim:async()=>{if(++calls===1)throw Error('offline');return true;}},storage:storage()});
  assert.equal(await controller.claim('a'),false);
  assert.equal(await controller.claim('a'),true);
});
test('native storage loss or failed write cannot replay a confirmed server claim',async()=>{
  const {backend}=accountBackend();const failing={getItem(){throw Error('read');},setItem(){throw Error('write');}};
  assert.equal(await createWelcomeController({backend,storage:failing}).claim('a'),true);
  assert.equal(await createWelcomeController({backend,storage:failing}).claim('a'),false);
});
test('forget invalidates an in-flight request and removes only the owner cache',async()=>{
  let finish;const cache=storage();const controller=createWelcomeController({backend:{claim:()=>new Promise(resolve=>{finish=resolve;})},storage:cache});
  const request=controller.claim('a');await Promise.resolve();await controller.forget('a');finish(true);
  assert.equal(await request,false);
  assert.equal(cache.getItem('brote.progress.v1.welcome.a'),null);
});
