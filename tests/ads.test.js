import test from 'node:test';
import assert from 'node:assert/strict';
import {createLessonAds, lessonAdsStorageKey} from '../src/ads.js';

const completion = (id, extra = {}) => ({kind: 'lesson', attemptId: String(id), ...extra});
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise, resolve}; };
function fixture(overrides = {}) {
  const values = new Map(), calls = [], errors = [];
  const storage = {
    async getItem(key) { return values.get(key) ?? null; },
    async setItem(key, value) { values.set(key, value); },
    async removeItem(key) { values.delete(key); }
  };
  let owner = 'alice', premium = false, consent = true;
  const options = {storage, getOwner: () => owner, getPremium: () => premium, consent: () => consent,
    adapter: {showInterstitial: async () => { calls.push('ad'); return true; }}, onError: error => errors.push(error), ...overrides};
  const ads = createLessonAds(options);
  return {ads, calls, errors, values, options, owner: value => { owner = value; },
    premium: value => { premium = value; }, consent: value => { consent = value; },
    state: (user = 'alice') => JSON.parse(values.get(lessonAdsStorageKey(user)))};
}

test('default build and signed-out sessions never request an ad', async () => {
  const ads = createLessonAds();
  assert.equal(await ads.afterCompletion(completion(1)), false);
  assert.equal(await ads.showPending(), false);
  const f = fixture(); f.owner(null);
  assert.equal(await f.ads.afterCompletion(completion(1)), false);
  assert.equal(f.values.size, 0);
});

test('only completions 2, 4 and 6 queue ads, shown at the result exit', async () => {
  const f = fixture();
  for (let n = 1; n <= 6; n++) {
    const previous = f.calls.length;
    assert.equal(await f.ads.afterCompletion(completion(n)), n % 2 === 0);
    assert.equal(f.calls.length, previous, 'recording a result never displays advertising');
    assert.equal(await f.ads.showPending(), n % 2 === 0);
    assert.equal(await f.ads.showPending(), false);
  }
  assert.equal(f.calls.length, 3);
  assert.equal(f.state().completed, 6);
});

test('reload preserves cadence and deduplication, but never replays a pending ad', async () => {
  const f = fixture(); await f.ads.afterCompletion(completion(1));
  const second = createLessonAds(f.options);
  assert.equal(await second.afterCompletion(completion(1)), false);
  assert.equal(await second.afterCompletion(completion(2)), true);
  const third = createLessonAds(f.options);
  assert.equal(await third.showPending(), false);
  assert.equal(await third.afterCompletion(completion(2)), false);
  assert.equal(await third.afterCompletion(completion(3)), false);
  assert.equal(await third.afterCompletion(completion(4)), true);
  assert.equal(await third.showPending(), true);
});

test('accounts keep separate counters and cannot inherit another account ad', async () => {
  const f = fixture();
  await f.ads.afterCompletion(completion(1)); await f.ads.afterCompletion(completion(2));
  f.owner('bob'); assert.equal(await f.ads.showPending(), false);
  assert.equal(await f.ads.afterCompletion(completion(1)), false);
  assert.equal(await f.ads.afterCompletion(completion(2)), true);
  f.owner('alice'); assert.equal(await f.ads.showPending(), false);
  assert.equal(await f.ads.afterCompletion(completion(3)), false);
  assert.equal(f.state().completed, 3); assert.equal(f.state('bob').completed, 2);
});

test('Plus attempts are deduplicated without advancing cadence, and Plus is rechecked at exit', async () => {
  const f = fixture(); f.premium(true);
  await f.ads.afterCompletion(completion('plus'));
  assert.equal(f.state().completed, 0);
  f.premium(false);
  assert.equal(await f.ads.afterCompletion(completion('plus')), false);
  await f.ads.afterCompletion(completion(1)); await f.ads.afterCompletion(completion(2));
  f.premium(true); assert.equal(await f.ads.showPending(), false);
  f.premium(false); assert.equal(await f.ads.showPending(), false);
  assert.equal(f.calls.length, 0);
});

test('refused or withdrawn consent skips the opportunity without catching up', async () => {
  const f = fixture(); f.consent(false);
  await f.ads.afterCompletion(completion(1));
  assert.equal(await f.ads.afterCompletion(completion(2)), false);
  f.consent(true);
  assert.equal(await f.ads.showPending(), false);
  assert.equal(await f.ads.afterCompletion(completion(3)), false);
  assert.equal(await f.ads.afterCompletion(completion(4)), true);
  f.consent(false); assert.equal(await f.ads.showPending(), false);
  f.consent(true); assert.equal(await f.ads.showPending(), false);
  assert.equal(f.calls.length, 0);
});

test('an unconsumed even opportunity is discarded by the next completed lesson', async () => {
  const f = fixture();
  await f.ads.afterCompletion(completion(1)); await f.ads.afterCompletion(completion(2));
  await f.ads.afterCompletion(completion(3));
  assert.equal(await f.ads.showPending(), false);
  assert.equal(await f.ads.afterCompletion(completion(4)), true);
  assert.equal(await f.ads.showPending(), true);
  assert.equal(f.calls.length, 1);
});

test('a result left before its save completes still counts without a late advertisement', async () => {
  const f = fixture();
  await f.ads.afterCompletion(completion(1));
  assert.equal(await f.ads.afterCompletion(completion(2, {allowAd: false})), false);
  assert.equal(f.state().completed, 2);
  assert.equal(await f.ads.showPending(), false);
  assert.equal(await f.ads.afterCompletion(completion(3)), false);
  assert.equal(await f.ads.afterCompletion(completion(4)), true);
  // A still older result finishing its save cannot cancel this newer result.
  assert.equal(await f.ads.afterCompletion(completion('late', {allowAd: false})), false);
  assert.equal(await f.ads.showPending(), true);
  assert.equal(f.calls.length, 1);
  assert.equal(f.state().completed, 5);
});

test('account change while awaiting consent prevents presentation for the old account', async () => {
  const gate = deferred(), started = deferred(); let delay = false;
  const f = fixture({consent: async () => {
    if (delay) { started.resolve(); await gate.promise; }
    return true;
  }});
  await f.ads.afterCompletion(completion(1)); await f.ads.afterCompletion(completion(2));
  delay = true;
  const showing = f.ads.showPending(); await started.promise;
  f.owner('bob'); gate.resolve();
  assert.equal(await showing, false); assert.equal(f.calls.length, 0);
});

test('invalid results and failed exams do not count; passed exams do', async () => {
  const f = fixture();
  for (const result of [null, {}, completion('', {}), completion(1, {kind: 'case'}),
    completion(2, {kind: 'exam', passed: false}), completion(3, {kind: 'exam'})]) {
    assert.equal(await f.ads.afterCompletion(result), false);
  }
  assert.equal(await f.ads.afterCompletion(completion(1)), false);
  assert.equal(await f.ads.afterCompletion(completion(2, {kind: 'exam', passed: true})), true);
  assert.equal(f.state().completed, 2);
});

test('adapter absence still records cadence, without a backlog when enabled later', async () => {
  const f = fixture({adapter: null});
  await f.ads.afterCompletion(completion(1)); await f.ads.afterCompletion(completion(2));
  assert.equal(f.state().completed, 2);
  const enabled = createLessonAds({...f.options, adapter: {showInterstitial: async () => true}});
  assert.equal(await enabled.showPending(), false);
  assert.equal(await enabled.afterCompletion(completion(3)), false);
  assert.equal(await enabled.afterCompletion(completion(4)), true);
});

test('no fill and provider errors are consumed once and do not reject progress', async () => {
  for (const showInterstitial of [async () => false, async () => { throw Error('no fill'); }]) {
    const f = fixture({adapter: {showInterstitial}});
    await f.ads.afterCompletion(completion(1)); await f.ads.afterCompletion(completion(2));
    assert.equal(await f.ads.showPending(), false);
    assert.equal(await f.ads.showPending(), false);
    assert.equal(await f.ads.afterCompletion(completion(3)), false);
    assert.equal(await f.ads.afterCompletion(completion(4)), true);
  }
});

test('concurrent completions and result exits deduplicate without double presentation', async () => {
  const gate = deferred(); let calls = 0;
  const f = fixture({adapter: {showInterstitial: async () => { calls++; await gate.promise; return true; }}});
  assert.deepEqual(await Promise.all([f.ads.afterCompletion(completion(1)), f.ads.afterCompletion(completion(1)),
    f.ads.afterCompletion(completion(2))]), [false, false, true]);
  const first = f.ads.showPending();
  assert.equal(await f.ads.showPending(), false);
  gate.resolve(); assert.equal(await first, true); assert.equal(calls, 1);
});

test('a provider can reenter the hook without hanging or showing twice', async () => {
  let ads, calls = 0;
  const f = fixture({adapter: {showInterstitial: async () => { calls++; assert.equal(await ads.showPending(), false); return true; }}});
  ads = f.ads;
  await ads.afterCompletion(completion(1)); await ads.afterCompletion(completion(2));
  assert.equal(await ads.showPending(), true); assert.equal(calls, 1);
});

test('navigation cancellation and sign-out invalidate deferred work', async () => {
  const f = fixture(); await f.ads.afterCompletion(completion(1));
  await f.ads.afterCompletion(completion(2)); f.ads.discardPending();
  assert.equal(await f.ads.showPending(), false);
  assert.equal(await f.ads.afterCompletion(completion(3)), false);
  await f.ads.afterCompletion(completion(4)); f.ads.reset();
  assert.equal(await f.ads.showPending(), false);
  const writing = deferred(), started = deferred();
  const g = fixture(); await g.ads.afterCompletion(completion(1));
  const original = g.options.storage.setItem;
  g.options.storage.setItem = async (...args) => { started.resolve(); await writing.promise; return original(...args); };
  const operation = g.ads.afterCompletion(completion(2)); await started.promise;
  g.owner('bob'); g.ads.reset(); writing.resolve();
  assert.equal(await operation, false); assert.equal(await g.ads.showPending(), false);
  assert.equal(await g.ads.afterCompletion(completion(1)), false);
});

test('storage failures suppress ads and never overwrite unread account state', async () => {
  const f = fixture();
  f.options.storage.getItem = async () => { throw Error('read failed'); };
  assert.equal(await f.ads.afterCompletion(completion(1)), false);
  assert.equal(await f.ads.afterCompletion(completion(2)), false);
  assert.equal(f.values.size, 0); assert.equal(f.calls.length, 0);
  const g = fixture(); await g.ads.afterCompletion(completion(1));
  g.options.storage.setItem = async () => { throw Error('write failed'); };
  assert.equal(await g.ads.afterCompletion(completion(2)), false);
  assert.equal(await g.ads.showPending(), false);
  assert.equal(await g.ads.afterCompletion(completion(2)), false);
  assert.equal(g.errors.length, 1);
});

test('attempt history is bounded and account deletion removes only its cadence', async () => {
  const f = fixture();
  for (let n = 1; n <= 132; n++) await f.ads.afterCompletion(completion(n));
  assert.equal(f.state().attempts.length, 128); assert.equal(f.state().completed, 132);
  f.owner('bob'); await f.ads.afterCompletion(completion(1));
  assert.equal(await f.ads.forget('alice'), true);
  assert.equal(f.values.has(lessonAdsStorageKey('alice')), false);
  assert.equal(f.state('bob').completed, 1);
  assert.equal(lessonAdsStorageKey(null), null);
});
