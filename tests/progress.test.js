import test from 'node:test';
import assert from 'node:assert/strict';
import { emptySnapshot, sanitizeSnapshot, makeEnvelope, mergeProgress } from '../src/progress.js';

const copy = value => JSON.parse(JSON.stringify(value));
const session = (id, step = 0, answer = {}) => [id, step, Array.from({ length: 8 }, (_, i) => i === step ? copy(answer) : {})];
const exam = (id = 45, step = 0, submitted = false, score = 0) => ({
  id, step, order: [9, 2, 5, 0, 1, 8, 7, 6, 4, 3],
  drafts: Array.from({ length: 10 }, () => ({})), submitted, ...(submitted ? { score } : {}),
});
const snapshot = changes => ({ ...emptySnapshot(), ...changes });

test('emptySnapshot is a fresh JSON-safe version-5 snapshot', () => {
  const a = emptySnapshot();
  const b = emptySnapshot();
  a.completed[0] = { firstTry: 4 };
  a.sessions.push(session(0));
  assert.deepEqual(b.completed, {});
  assert.deepEqual(b.sessions, []);
  assert.equal(b.version, 5);
  assert.deepEqual(copy(b), b);
});

test('intro shortcut persists as a strict boolean and merges across devices without faking completions',()=>{
  const first=makeEnvelope(snapshot({introSkipped:true}),null,100);
  const other=makeEnvelope(snapshot({track:'etfs',group:10}),null,200);
  for(const result of [mergeProgress(first,other),mergeProgress(other,first)]){
    assert.equal(result.snapshot.introSkipped,true);assert.deepEqual(result.snapshot.completed,{});assert.deepEqual(result.snapshot.passedExams,{});
  }
  assert.equal(sanitizeSnapshot(snapshot({introSkipped:true})).introSkipped,true);
  for(const value of [1,'true',null,{},[0,1,2,3,4,5]])assert.equal(sanitizeSnapshot(snapshot({introSkipped:value})).introSkipped,false);
  assert.equal(sanitizeSnapshot({version:5,completed:{}}).introSkipped,false);
  const accessor={version:5,completed:{}};Object.defineProperty(accessor,'introSkipped',{get(){throw Error('Should not read getter');}});
  assert.equal(sanitizeSnapshot(accessor).introSkipped,false);
});

test('sanitizeSnapshot rejects invalid versions and out-of-range identifiers', () => {
  for (const input of [null, 7, [], { version: 4 }, { version: '5' }]) assert.deepEqual(sanitizeSnapshot(input), emptySnapshot());
  const clean = sanitizeSnapshot(snapshot({
    page: 'exam', group: 175, mapTarget: 'br-world-175', activeId: 1750,
    completed: { '-1': {}, 0: { firstTry: 3 }, 49: { firstTry: 4 }, 1750: {}, '01': {} },
    passedExams: { 0: { best: 7, attempts: 2, passed: true }, 4: { best: 8, passed: false }, 175: { best: 10 }, 2: { best: 99 } },
    sessions: [session(-1), session(0), session(1750)],
  }));
  assert.equal(clean.page, 'map');
  assert.equal(clean.group, 45);
  assert.equal(clean.mapTarget, null);
  assert.equal(clean.activeId, null);
  assert.deepEqual(Object.keys(clean.completed), ['0', '49']);
  assert.deepEqual(Object.keys(clean.passedExams), ['0', '4']);
  assert.equal(clean.passedExams[0].passed, false);
  assert.equal(clean.passedExams[4].passed, true);
  assert.deepEqual(clean.sessions.map(s => s[0]), [0]);
});

test('sanitization reads no accessors, inherited fields or unknown profile fields', () => {
  let calls = 0;
  const untrusted = Object.create({ completed: { 8: { firstTry: 4 } }, version: 5 });
  assert.deepEqual(sanitizeSnapshot(untrusted), emptySnapshot());
  Object.defineProperty(untrusted, 'version', { value: 5 });
  Object.defineProperty(untrusted, 'completed', { get() { calls++; return { 0: {} }; } });
  untrusted.email = 'private@example.test';
  untrusted.userId = 'private';
  untrusted.sessions = [session(2, 1, { c: 2, uid: 'secret', n: 'private@example.test', v: { email: 'secret', matchOrder: [1, 0], explore: 2 } })];
  const clean = sanitizeSnapshot(untrusted);
  assert.equal(calls, 0);
  assert.deepEqual(clean.completed, {});
  assert.equal('email' in clean, false);
  assert.deepEqual(clean.sessions[0][2][1], { c: 2, v: { explore: 2, matchOrder: [1, 0] } });
  const polluted = JSON.parse('{"version":5,"__proto__":{"polluted":true},"completed":{"__proto__":{"firstTry":4},"1":{"firstTry":2,"email":"secret"}}}');
  assert.deepEqual(sanitizeSnapshot(polluted).completed, { 1: { firstTry: 2 } });
  assert.equal({}.polluted, undefined);
});

test('packed drafts are bounded, copied and retain supported v5 fields', () => {
  const packed = { c: 3, s: [3, 1], m: { 0: '2', 1: '', 2: 1, 4: '0', other: 'secret' },
    o: [2, 0, 1], n: '9'.repeat(100), a: 2_000_000, p: 1, h: 1,
    v: { owned: 1000, fee: -1, rate: Infinity, fund: 'global', evidence: 'risk', matchOrder: [2, 0, 1], explore: 2, arbitrary: 'secret' } };
  const input = snapshot({ sessions: [session(0, 3, packed)], activeId: 0, mapTarget: 'br-point-499' });
  const clean = sanitizeSnapshot(input);
  assert.deepEqual(clean.sessions[0][2][3], { c: 3, s: [3, 1], m: { 0: '2', 1: '', 2: '1' }, o: [2, 0, 1], n: '9'.repeat(32), a: 1_000_000, p: 1, h: 1,
    v: { owned: 30, fee: 0, fund: 'global', evidence: 'risk', explore: 2, matchOrder: [2, 0, 1] } });
  assert.equal(clean.mapTarget, 'br-point-499');
  clean.sessions[0][2][3].s.push(0);
  assert.deepEqual(input.sessions[0][2][3].s, [3, 1]);
  assert.equal(input.sessions[0][2][3].n.length, 100);
});

test('bad session shapes are discarded; invalid answer arrays become empty drafts', () => {
  const bad = session(0, 2, { c: '2', s: [0, 0], o: [0, 3], m: { 0: '99' }, v: { matchOrder: [0, 0] } });
  const clean = sanitizeSnapshot(snapshot({ sessions: [bad, [1, 0, []], session(2, 8), session(453, 1.5), ['4', 0, Array(8).fill({})], session(0, 4)] }));
  assert.deepEqual(clean.sessions, [session(0, 4)]); // Last valid duplicate wins; order is canonical.
  const once = sanitizeSnapshot(snapshot({ sessions: [bad] }));
  assert.deepEqual(once.sessions[0][2][2], {});
  const many = sanitizeSnapshot(snapshot({ sessions: Array.from({ length: 100 }, (_, i) => session(i % 50)) }));
  assert.equal(many.sessions.length, 50);
});

test('exam drafts require ten questions and a full permutation; scores and flags are bounded', () => {
  const valid = exam(49, 9, true, 8);
  valid.drafts[0] = { c: 1, p: 1, h: 1, a: 300, n: '12,5', email: 'secret' };
  const clean = sanitizeSnapshot(snapshot({ exam: valid })).exam;
  assert.deepEqual(clean.drafts[0], { c: 1, n: '12,5' });
  assert.equal(clean.score, 8);
  assert.equal(clean.submitted, true);
  const invalidOrder = exam(); invalidOrder.order[0] = invalidOrder.order[1];
  assert.equal(sanitizeSnapshot(snapshot({ exam: invalidOrder })).exam, null);
  const invalidLength = exam(); invalidLength.drafts.pop();
  assert.equal(sanitizeSnapshot(snapshot({ exam: invalidLength })).exam, null);
  const invalidScore = exam(45, 9, true, 11);
  assert.equal(sanitizeSnapshot(snapshot({ exam: invalidScore })).exam.submitted, false);
  assert.equal('score' in sanitizeSnapshot(snapshot({ exam: invalidScore })).exam, false);
});

test('makeEnvelope timestamps only changed records and preserves deletion tombstones', () => {
  const initial = snapshot({ sessions: [session(0, 2), session(1, 4)], activeId: 1, exam: exam() });
  const first = makeEnvelope(initial, null, 100);
  assert.deepEqual(first.sessionTimes, { 0: 100, 1: 100 });
  assert.equal(first.examTime, 100);
  assert.deepEqual(makeEnvelope(initial, first, 900), first);
  const moved = copy(initial); moved.sessions[1][1] = 5;
  const second = makeEnvelope(moved, first, 200);
  assert.deepEqual(second.sessionTimes, { 0: 100, 1: 200 });
  assert.equal(second.examTime, 100);
  const nav = copy(moved); nav.page = 'library';
  const third = makeEnvelope(nav, second, 50);
  assert.equal(third.modifiedAt, 201);
  assert.deepEqual(third.sessionTimes, second.sessionTimes);
  const removed = copy(nav); removed.sessions = removed.sessions.filter(s => s[0] !== 0); removed.exam = null;
  const fourth = makeEnvelope(removed, third, 300);
  assert.equal(fourth.sessionTimes[0], 300);
  assert.equal(fourth.examTime, 300);
  assert.equal(first.snapshot.sessions[1][1], 4);
});

test('merge unions completions and retains maximum scores and attempt counts', () => {
  const remote = makeEnvelope(snapshot({ completed: { 0: { firstTry: 4 }, 1: { firstTry: 1 } },
    passedExams: { 0: { best: 9, attempts: 3 }, 1: { best: 6, attempts: 9 } } }), null, 100);
  const local = makeEnvelope(snapshot({ completed: { 1: { firstTry: 3 }, 2: { firstTry: 2 } },
    passedExams: { 0: { best: 5, attempts: 4 }, 1: { best: 8, attempts: 2 } } }), null, 200);
  const before = JSON.stringify([remote, local]);
  const merged = mergeProgress(remote, local);
  assert.deepEqual(merged.snapshot.completed, { 0: { firstTry: 4 }, 1: { firstTry: 3 }, 2: { firstTry: 2 } });
  assert.deepEqual(merged.snapshot.passedExams, { 0: { best: 9, attempts: 4, passed: true }, 1: { best: 8, attempts: 9, passed: true } });
  assert.equal(JSON.stringify([remote, local]), before);
  merged.snapshot.completed[0].firstTry = 0;
  assert.equal(remote.snapshot.completed[0].firstTry, 4);
});

test('a pending lesson follows its own newer edit, even when unrelated navigation is newer remotely', () => {
  const base = makeEnvelope(snapshot({ sessions: [session(461, 1)], activeId: 461 }), null, 100);
  const localSnapshot = copy(base.snapshot); localSnapshot.sessions[0] = session(461, 6, { n: '33,33' });
  const local = makeEnvelope(localSnapshot, base, 200);
  const remoteSnapshot = copy(base.snapshot); remoteSnapshot.page = 'library'; remoteSnapshot.group = 48; remoteSnapshot.mapTarget = 'br-world-48';
  const remote = makeEnvelope(remoteSnapshot, base, 300);
  const merged = mergeProgress(remote, local);
  assert.equal(merged.snapshot.sessions[0][1], 6);
  assert.equal(merged.snapshot.sessions[0][2][6].n, '33,33');
  assert.equal(merged.sessionTimes[461], 200);
  assert.equal(merged.snapshot.page, 'library');
  assert.equal(merged.snapshot.mapTarget, 'br-world-48');
  assert.equal(merged.snapshot.activeId, 461);
});

test('a later visit to an earlier step is preserved instead of taking maximum step', () => {
  const remote = makeEnvelope(snapshot({ sessions: [session(9, 7)], activeId: 9 }), null, 100);
  const local = makeEnvelope(snapshot({ sessions: [session(9, 2, { c: 1 })], activeId: 9 }), remote, 200);
  assert.equal(mergeProgress(remote, local).snapshot.sessions[0][1], 2);
});

test('completion removes an unfinished stale session, even if its device edited it later', () => {
  const remote = makeEnvelope(snapshot({ completed: { 453: { firstTry: 4 } } }), null, 100);
  const local = makeEnvelope(snapshot({ sessions: [session(453, 7)], activeId: 453 }), null, 200);
  const merged = mergeProgress(remote, local);
  assert.deepEqual(merged.snapshot.sessions, []);
  assert.equal(merged.snapshot.activeId, null);
  assert.deepEqual(merged.snapshot.completed, { 453: { firstTry: 4 } });
});

test('an explicitly active replay survives; an inactive replay is discarded', () => {
  const remote = makeEnvelope(snapshot({ completed: { 453: { firstTry: 4 } } }), null, 100);
  const replay = makeEnvelope(snapshot({ completed: { 453: { firstTry: 2 } }, sessions: [session(453, 2)], activeId: 453 }), null, 200);
  const active = mergeProgress(remote, replay);
  assert.equal(active.snapshot.sessions.length, 1);
  assert.equal(active.snapshot.activeId, 453);
  assert.equal(active.snapshot.completed[453].firstTry, 4);
  const inactiveSnapshot = copy(replay.snapshot); inactiveSnapshot.activeId = null;
  const inactive = makeEnvelope(inactiveSnapshot, replay, 300);
  assert.deepEqual(mergeProgress(remote, inactive).snapshot.sessions, []);
});

test('finishing a replay and deleting a pending session do not resurrect older drafts', () => {
  const base = makeEnvelope(snapshot({ completed: { 0: { firstTry: 4 } }, sessions: [session(0, 7), session(1, 1)], activeId: 0 }), null, 100);
  const removedSnapshot = copy(base.snapshot); removedSnapshot.sessions = []; removedSnapshot.activeId = null;
  const removed = makeEnvelope(removedSnapshot, base, 200);
  const merged = mergeProgress(base, removed);
  assert.deepEqual(merged.snapshot.sessions, []);
  assert.deepEqual(merged.sessionTimes, { 0: 200, 1: 200 });
  assert.deepEqual(mergeProgress(merged, base).snapshot.sessions, []);
});

test('exam content uses its edit clock; best results remain monotonic during a retake', () => {
  const pending = makeEnvelope(snapshot({ exam: exam(45, 8) }), null, 100);
  const graded = makeEnvelope(snapshot({ exam: exam(45, 9, true, 9), passedExams: { 45: { best: 9, attempts: 1 } } }), pending, 200);
  const oldNavigation = copy(pending.snapshot); oldNavigation.page = 'library';
  const stale = makeEnvelope(oldNavigation, pending, 300);
  const merged = mergeProgress(graded, stale);
  assert.equal(merged.snapshot.exam.submitted, true);
  assert.equal(merged.snapshot.exam.score, 9);
  assert.equal(merged.snapshot.page, 'library');
  const retake = makeEnvelope(snapshot({ exam: exam(45, 1), passedExams: { 45: { best: 9, attempts: 1 } } }), graded, 400);
  const newest = mergeProgress(merged, retake);
  assert.equal(newest.snapshot.exam.submitted, false);
  assert.equal(newest.snapshot.exam.step, 1);
  assert.equal(newest.snapshot.passedExams[45].passed, true);
});

test('exam removal uses a timestamp; roundtripping the envelope needs only one JSON string', () => {
  const withExam = makeEnvelope(snapshot({ exam: exam(), sessions: [session(2, 2)], activeId: 2 }), null, 100);
  const clearedSnapshot = copy(withExam.snapshot); clearedSnapshot.exam = null;
  const cleared = makeEnvelope(clearedSnapshot, withExam, 200);
  assert.equal(mergeProgress(withExam, cleared).snapshot.exam, null);
  const persistedString = JSON.stringify(cleared);
  assert.deepEqual(mergeProgress(null, JSON.parse(persistedString)), cleared);
});

test('ties are deterministic and malformed envelopes cannot replace achievements', () => {
  const remote = makeEnvelope(snapshot({ completed: { 4: { firstTry: 3 } }, sessions: [session(5, 2)], activeId: 5 }), null, 100);
  const local = makeEnvelope(snapshot({ sessions: [session(5, 3)], activeId: 5 }), null, 100);
  assert.equal(mergeProgress(remote, local).snapshot.sessions[0][1], 3);
  const bad = { schema: 999, modifiedAt: Infinity, sessionTimes: { 5: 1e100 }, snapshot: { completed: { 5: {} } } };
  assert.deepEqual(mergeProgress(remote, bad), remote);
  assert.deepEqual(mergeProgress(null, null), { schema: 1, snapshot: emptySnapshot(), modifiedAt: 0, sessionTimes: {}, examTime: 0,examTimes:{stocks:0,etfs:0,crypto:0,technical:0},caseTimes:{} });
});
