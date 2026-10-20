import test from 'node:test';
import assert from 'node:assert/strict';
import {createProgressStore} from '../src/sync.js';
import {createNativeProgressStorage} from '../src/native-storage.js';
import {emptySnapshot} from '../src/progress.js';
import {disconnectedProgressStatus, retryProgress} from '../src/progress-status.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
const progress = () => ({...emptySnapshot(), completed: {0: {firstTry: 4}}});
test('an app that needs updating never reports an offline success or a successful sync',async()=>{
  assert.equal(disconnectedProgressStatus('update-required'),'update-required');
  await assert.rejects(retryProgress({retry:async()=>{},flushLocal:async()=>true},()=> 'update-required'),/Actualiza la app/);
});
async function fixture({user = {uid: 'test-account', emailVerified: true}, beforeSet = async () => {}, online = false} = {}) {
  const data = new Map();
  const preferences = {keys: async () => ({keys: []}), get: async ({key}) => ({value: data.get(key) ?? null}), remove: async ({key}) => { data.delete(key); }, set: async ({key, value}) => { await beforeSet(); data.set(key, value); }};
  const storage = await createNativeProgressStorage({preferences});
  let status;
  const store = createProgressStore({storage, isOnline: () => online, onStatus: value => { status = value; }, delay: 1e6});
  await store.select(user);
  return {store, data, getStatus: () => status};
}

test('disconnect preserves an actual local write failure and retry never claims durability while it fails', async t => {
  const f = await fixture({user: {uid: 'test-account', emailVerified: true}, beforeSet: () => { throw Error('disk unavailable'); }});
  t.after(() => f.store.pause());
  f.store.save(progress()); await f.store.flushLocal();
  assert.equal(f.getStatus(), 'storage-error');
  assert.equal(disconnectedProgressStatus(f.getStatus()), 'storage-error');
  await assert.rejects(retryProgress(f.store, f.getStatus), /No se pudo guardar en este dispositivo/);
  assert.equal(f.data.size, 0); assert.equal(f.getStatus(), 'storage-error');
});

test('verified account retry can recover a failed local save offline', async t => {
  let fails = true;
  const f = await fixture({beforeSet: () => { if (fails) throw Error('disk unavailable'); }});
  t.after(() => f.store.pause());
  f.store.save(progress()); await f.store.flushLocal();
  await assert.rejects(retryProgress(f.store, f.getStatus), /No se pudo guardar/);
  fails = false;
  assert.equal((await retryProgress(f.store, f.getStatus)).message, 'Tu progreso se ha guardado en este dispositivo. La sincronización con tu cuenta sigue pendiente.');
  assert.equal(f.getStatus(), 'offline');
  assert.deepEqual(JSON.parse(f.data.get('brote.progress.v1.test-account')).data.snapshot.completed, progress().completed);
});

test('retry waits for a pending Preferences acknowledgment before showing local success', async t => {
  const request = deferred(), f = await fixture({beforeSet: () => request.promise});
  t.after(async () => { request.resolve(); await f.store.pause(); });
  f.store.save(progress());
  assert.equal(f.getStatus(), 'saving-local');
  assert.equal(disconnectedProgressStatus(f.getStatus()), 'saving-local');
  let done = false;
  const pending = retryProgress(f.store, f.getStatus).then(result => { done = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(done, false); assert.equal(f.data.size, 0);
  request.resolve();
  assert.equal((await pending).message, 'Tu progreso se ha guardado en este dispositivo. La sincronización con tu cuenta sigue pendiente.');
  assert.equal(f.data.size, 1); assert.equal(f.getStatus(), 'offline');
});

test('a verified account offline can report confirmed local storage without claiming cloud synchronization', async t => {
  const f = await fixture({user: {uid: 'test-account', emailVerified: true}});
  t.after(() => f.store.pause());
  f.store.save(progress());
  const result = await retryProgress(f.store, f.getStatus);
  assert.equal(f.getStatus(), 'offline');
  assert.equal(disconnectedProgressStatus('saved'), 'offline');
  assert.match(result.message, /guardado en este dispositivo/);
  assert.match(result.message, /sincronización con tu cuenta sigue pendiente/);
  assert.ok(f.data.has('brote.progress.v1.test-account'));
});

test('a deletion barrier stays visible offline and retry never promises a later synchronization',async()=>{
  assert.equal(disconnectedProgressStatus('deletion-pending'),'deletion-pending');
  await assert.rejects(retryProgress({retry:async()=>{},flushLocal:async()=>true},()=> 'deletion-pending'),/sincronización está bloqueada/);
});

test('signed-out and unverified retry do not claim saved progress or become offline',async()=>{
  for(const [user,status] of [[null,'signed-out'],[{uid:'A',emailVerified:false},'unverified']]){
    const f=await fixture({user});assert.equal(f.store.save(progress()),false);const result=await retryProgress(f.store,f.getStatus);
    assert.equal(f.getStatus(),status);assert.equal(disconnectedProgressStatus(status),status);assert.doesNotMatch(result.message,/guardado|sincronizado/);assert.equal(f.data.size,0);await f.store.pause();
  }
});
