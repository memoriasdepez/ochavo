import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureVerifiedSession, createSessionRecovery, prepareSignOut} from '../src/session-recovery.js';
import {createNativeProgressStorage} from '../src/native-storage.js';
import {createProgressStore} from '../src/sync.js';
import {emptySnapshot} from '../src/progress.js';

const verified = uid => ({uid, emailVerified: true});
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };
const permission = () => Object.assign(Error('Missing or insufficient permissions.'), {code: 'permission-denied'});
function harness(overrides = {}) {
  const state = {user: verified('A'), claimsVerified: true, calls: []};
  const options = {
    getUser: () => state.user,
    getTokenResult: async () => { state.calls.push('claims'); return {claims: {email_verified: state.claimsVerified}}; },
    reloadUser: async user => { state.calls.push('reload:' + user.uid); },
    refreshToken: async (user, force) => { state.calls.push('token:' + user.uid + ':' + force); state.claimsVerified = true; },
    retryProgress: async user => { state.calls.push('progress:' + user.uid); return 'saved'; },
    retryGame: async user => { state.calls.push('game:' + user.uid); return 'saved'; },
    ...overrides,
  };
  return {state, options, recovery: createSessionRecovery(options)};
}

test('admission checks cached claims without forcing an already verified token', async () => {
  const f = harness();
  assert.equal(await ensureVerifiedSession(f.options), f.state.user);
  assert.deepEqual(f.state.calls, ['claims']);
});

test('admission repairs a verified profile with a stale claim exactly once', async () => {
  const f = harness(); f.state.claimsVerified = false;
  assert.equal(await ensureVerifiedSession(f.options), f.state.user);
  assert.deepEqual(f.state.calls, ['claims', 'token:A:true', 'claims']);
});

test('admission never grants access when a refreshed token still lacks verification', async () => {
  const f = harness({refreshToken: async () => {}}); f.state.claimsVerified = false;
  await assert.rejects(ensureVerifiedSession(f.options), {code: 'account/verification-required'});
});

test('admission does not refresh unverified or signed-out users', async () => {
  const f = harness(); f.state.user.emailVerified = false;
  assert.equal(await ensureVerifiedSession(f.options), f.state.user);
  f.state.user = null; assert.equal(await ensureVerifiedSession(f.options), null);
  assert.deepEqual(f.state.calls, []);
});

test('admission aborts after token lookup if the identity changes, including the same UID', async () => {
  for (const replacement of [null, verified('B'), verified('A')]) {
    const wait = deferred(), f = harness({getTokenResult: () => wait.promise});
    const pending = ensureVerifiedSession(f.options); f.state.user = replacement;
    wait.resolve({claims: {email_verified: false}});
    await assert.rejects(pending, {code: 'account/identity-changed'});
    assert.deepEqual(f.state.calls, []);
  }
});

test('explicit recovery forces renewal even when the profile was already verified', async () => {
  const f = harness(); const result = await f.recovery.recover();
  assert.equal(result.verified, true);
  assert.equal(result.progress.status, 'fulfilled'); assert.equal(result.game.status, 'fulfilled');
  assert.deepEqual(f.state.calls, ['reload:A', 'token:A:true', 'progress:A', 'game:A']);
});

test('recovery independently retries both stores even if one throws permission denied synchronously', async () => {
  for (const failing of ['retryProgress', 'retryGame']) {
    const f = harness({[failing]: () => { throw permission(); }});
    const result = await f.recovery.recover();
    const rejected = failing === 'retryProgress' ? result.progress : result.game;
    const fulfilled = failing === 'retryProgress' ? result.game : result.progress;
    assert.equal(rejected.status, 'rejected'); assert.equal(rejected.reason.code, 'permission-denied');
    assert.equal(fulfilled.status, 'fulfilled');
  }
});

test('recovery deduplicates concurrent requests for the same identity', async () => {
  const wait = deferred(), f = harness({reloadUser: () => wait.promise});
  const first = f.recovery.recover(), second = f.recovery.recover();
  assert.equal(first, second); wait.resolve(); await first;
  assert.equal(f.state.calls.filter(call => call.startsWith('token:')).length, 1);
});

test('recovery blocks retries after logout or account replacement during reload', async () => {
  for (const replacement of [null, verified('B'), verified('A')]) {
    const wait = deferred(), f = harness({reloadUser: () => wait.promise});
    const pending = f.recovery.recover(); f.state.user = replacement; wait.resolve();
    await assert.rejects(pending, {code: 'account/identity-changed'});
    assert.deepEqual(f.state.calls, []);
  }
});

test('recovery checks identity after token renewal and after store retries', async () => {
  for (const phase of ['refreshToken', 'retryProgress']) {
    const wait = deferred(), f = harness({[phase]: () => wait.promise});
    const pending = f.recovery.recover();
    await new Promise(resolve => setImmediate(resolve));
    f.state.user = verified('A'); wait.resolve();
    await assert.rejects(pending, {code: 'account/identity-changed'});
    if (phase === 'refreshToken') assert.ok(!f.state.calls.some(call => call.startsWith('progress:') || call.startsWith('game:')));
  }
});

test('recovery stops before store retries when reload reports an unverified account', async () => {
  const f = harness({reloadUser: async user => { user.emailVerified = false; }});
  const result = await f.recovery.recover();
  assert.equal(result.verified, false); assert.equal(result.progress, null); assert.equal(result.game, null);
  assert.deepEqual(f.state.calls, []);
});

test('failed token renewal never starts store retries and a later recovery can succeed', async () => {
  let failed = true;
  const f = harness({refreshToken: async () => { if (failed) throw Object.assign(Error('offline'), {code: 'auth/network-request-failed'}); }});
  await assert.rejects(f.recovery.recover(), {code: 'auth/network-request-failed'});
  assert.deepEqual(f.state.calls, ['reload:A']);
  failed = false; const result = await f.recovery.recover();
  assert.equal(result.progress.status, 'fulfilled'); assert.equal(result.game.status, 'fulfilled');
});

function logoutHarness(overrides = {}) {
  const state = {user: verified('A'), calls: []};
  const options = {getUser: () => state.user, flushInputs: () => { state.calls.push('inputs'); },
    flushProgressLocal: async () => { state.calls.push('local-progress'); return true; },
    flushGameLocal: async () => { state.calls.push('local-game'); return true; },
    flushProgress: async () => { state.calls.push('remote'); return true; },
    timeoutMs: 10, ...overrides};
  return {state, options};
}

test('sign-out preparation preserves both local stores before tolerating permission denial', async () => {
  const f = logoutHarness({flushProgress: async () => { f.state.calls.push('remote'); throw permission(); }});
  const result = await prepareSignOut(f.options);
  assert.equal(result.remote.status, 'rejected'); assert.equal(result.remote.reason.code, 'permission-denied');
  assert.deepEqual(f.state.calls, ['inputs', 'local-progress', 'local-game', 'remote']);
});

test('offline sign-out keeps local progress and does not require cloud success', async () => {
  const f = logoutHarness({flushProgress: async () => false});
  const result = await prepareSignOut(f.options);
  assert.deepEqual(result.remote, {status: 'fulfilled', value: false});
  assert.deepEqual(f.state.calls, ['inputs', 'local-progress', 'local-game']);
});

test('sign-out upload has a bounded wait and a late failure is handled', async () => {
  const wait = deferred(), f = logoutHarness({flushProgress: () => wait.promise});
  const result = await prepareSignOut(f.options);
  assert.equal(result.remote.status, 'timeout');
  wait.reject(permission()); await new Promise(resolve => setImmediate(resolve));
});

test('local failures attempt both stores and stop sign-out before any remote request', async () => {
  for (const failed of [() => false, () => { throw Error('Storage unavailable'); }]) {
    const f = logoutHarness({flushProgressLocal: failed});
    await assert.rejects(prepareSignOut(f.options), {code: 'storage/write-failed'});
    assert.deepEqual(f.state.calls, ['inputs', 'local-game']);
  }
});

test('sign-out preparation rejects a changed account instead of signing out its replacement', async () => {
  for (const phase of ['flushProgressLocal', 'flushProgress']) {
    const wait = deferred(), f = logoutHarness({[phase]: () => wait.promise, timeoutMs: 1000});
    const pending = prepareSignOut(f.options); await new Promise(resolve => setImmediate(resolve));
    f.state.user = verified('A'); wait.resolve(true);
    await assert.rejects(pending, {code: 'account/identity-changed'});
  }
});

test('native offline sign-out waits for durable Preferences and a new store restores the pending lesson', async t => {
  const disk = new Map(), write = deferred(), user = verified('native-A');
  const preferences = {keys: async () => ({keys: []}), get: async ({key}) => ({value: disk.get(key) ?? null}),
    set: async ({key, value}) => { await write.promise; disk.set(key, value); }, remove: async () => assert.fail('Local progress must survive sign-out')};
  const storage = await createNativeProgressStorage({preferences});
  const store = createProgressStore({storage, isOnline: () => false});
  t.after(() => store.pause());
  await store.select(user);
  const completed = {4: {firstTry: 3}};
  store.save({...emptySnapshot(), completed});
  let prepared = false;
  const signOut = prepareSignOut({getUser: () => user, flushProgressLocal: () => store.flushLocal(),
    flushGameLocal: () => storage.flush(), flushProgress: () => store.flush()}).then(result => { prepared = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(prepared, false); assert.equal(disk.size, 0);
  write.resolve(); await signOut;
  const local = JSON.parse(disk.get('brote.progress.v1.native-A'));
  assert.deepEqual(local.data.snapshot.completed, completed); assert.equal(local.dirty, true);
  const restored = createProgressStore({storage, isOnline: () => false});
  await restored.select(user); assert.deepEqual(restored.getSnapshot().completed, completed);
  await restored.pause();
});
