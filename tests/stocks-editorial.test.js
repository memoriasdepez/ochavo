import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRevision, parseAuthoring, calculate } from '../scripts/course-authoring.mjs';
import { refineStocks } from '../scripts/stocks-editorial/refine.mjs';
import { REVISION } from '../scripts/stocks-editorial/helpers.mjs';
import { CLARITY_REVISION } from '../scripts/stocks-editorial/clarity-constants.mjs';
import {OPENING_RESTART_IDS,OPENING_REVISION} from '../scripts/stocks-editorial/opening-edits.mjs';
import { IDENTIFICATION_REVISION } from '../scripts/stocks-editorial/real-examples.mjs';
import {SECOND_CORRECTIONS_IDS,SECOND_CORRECTIONS_REVISION} from '../scripts/stocks-editorial/second-corrections.mjs';
import { earlyProgressionTeaching } from '../scripts/stocks-editorial/early-progression-teaching.mjs';
import { lateProgression } from '../scripts/stocks-editorial/late-progression.mjs';
import { cases as earlyCases } from '../scripts/stocks-editorial/cases-2-20.mjs';
import { cases as middleCases } from '../scripts/stocks-editorial/cases-21-40.mjs';
import { cases as advancedCases } from '../scripts/stocks-editorial/cases-41-50.mjs';
import { emptySnapshot, makeEnvelope, mergeProgress, sanitizeSnapshot } from '../src/progress.js';
import { mount, openLesson, openExam, lessons, exams } from './current-course-harness.js';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const outline = JSON.parse(read('src/content/stocks-outline-v2.json'));
const records = parseAuthoring(Array.from({ length: 5 }, (_, i) => read(`src/content/stocks-v2-authoring/part-${i + 1}.txt`)), 500);
const authored = refineStocks(compileRevision({ outline, records, start: 450, sources: [] }), records, {marketEdits:false,compoundNotes:false,riskNotes:false,clearWriting:false,orderNotes:false});
const cases = { ...earlyCases, ...middleCases, ...advancedCases };
const copy = value => JSON.parse(JSON.stringify(value));
const kind = step => step.activity?.kind || step.type;
const session = (id, step, revision = null) => [id, step, Array.from({ length: 8 }, (_, index) => ({
  ...(index % 2 ? { c: 1, p: 1, a: 2, n: '37' } : {}),
  ...(index === 0 && revision ? { v: { contentRevision: revision } } : {}),
}))];
const examDraft = (id, step, revision = null) => ({ id, step, order: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], submitted: false,
  drafts: Array.from({ length: 10 }, (_, i) => ({ c: 1, ...(i === 0 && revision ? { v: { contentRevision: revision } } : {}) })),
});

test('the editorial revision retains all 500 approved identities and every lesson teaches before each exercise', () => {
  assert.equal(authored.lessons.length, 500);
  assert.equal(authored.exams.length, 50);
  assert.deepEqual(authored.lessons.map(l => l.title), outline.worlds.flatMap(w => w.lessons.map(l => l.title)));
  for (const [index, lesson] of authored.lessons.entries()) {
    assert.equal(lesson.id, 450 + index);
    assert.equal(lesson.editorialRevision, SECOND_CORRECTIONS_IDS.includes(lesson.id)?SECOND_CORRECTIONS_REVISION:OPENING_RESTART_IDS.includes(lesson.id) ? OPENING_REVISION : lesson.id === 501 ? IDENTIFICATION_REVISION : index < 10 ? 'stocks-clear-2026-10-09' : index < 20 ? 'stocks-clear-2026-10-10' : index < 30 ? REVISION : index < 40 ? 'stocks-compound-2026-10-11' : CLARITY_REVISION);
    assert.equal(lesson.steps.length, [453,462].includes(lesson.id)?10:8);
    assert.deepEqual(lesson.steps.map(s => s.type === 'learn'), Array.from({length:lesson.steps.length},(_,i)=>i%2===0));
    for (let i = 0; i < lesson.steps.length; i += 2) {
      assert.ok(lesson.steps[i].body.length > 60, `Teaching ${lesson.id}/${i} needs context`);
      const exercise = lesson.steps[i + 1];
      assert.ok(exercise.body.trim().length > 6, `Exercise ${lesson.id}/${i + 1} needs an explicit task`);
      assert.ok(exercise.explanation?.trim(), `Exercise ${lesson.id}/${i + 1} needs answer feedback`);
    }
    assert.doesNotMatch(JSON.stringify(lesson), /undefined|NaN|\{[a-d]\}|TODO/);
  }
  for (const [index, exam] of authored.exams.entries()) {
    assert.equal(exam.id, 45 + index);
    assert.equal(exam.editorialRevision, index === 0 ? 'stocks-clear-2026-10-09' : index === 1 ? 'stocks-clear-2026-10-10' : index === 2 ? REVISION : index === 3 ? 'stocks-compound-2026-10-11' : CLARITY_REVISION);
    assert.deepEqual(exam.steps.map(s => s.reviewLesson), Array.from({ length: 10 }, (_, i) => 450 + index * 10 + i));
  }
});

test('the retained situations follow their specifically authored teaching; the opening market points have their own scenarios', () => {
  assert.equal(Object.keys(cases).length, 490);
  assert.deepEqual(Object.keys(cases).map(Number), Array.from({ length: 490 }, (_, i) => 460 + i));
  assert.equal(new Set(Object.values(cases).map(c => c.scene)).size, 490, 'Each case needs its own situation');
  for (const lesson of authored.lessons.slice(22)) {
    const c = cases[lesson.id], record = records[lesson.id - 450];
    for (const field of ['scene', 'question', 'correct', 'incorrect', 'explanation', 'teaching']) {
      assert.equal(typeof c[field], 'string', `${lesson.id}/${field}`);
      assert.ok(c[field].trim().length > 1, `${lesson.id}/${field} is empty`);
    }
    assert.notEqual(c.correct, c.incorrect, `${lesson.id}: indistinguishable answers`);
    assert.notEqual(c.scene, record.example, `${lesson.id}: the challenge repeats the worked example`);
    // Points 41+ now have separately authored questions. Their prior teaching
    // is checked against the published baseline by stocks-difficulty.test.js.
    // Do not require the superseded binary case or its feedback to survive.
    // World four is now also individually rewritten with long-term scenarios;
    // its teaching and exercises are covered by stocks-compound.test.js.
    if (lesson.id >= 480) continue;
    const index = lesson.steps.findIndex(s => s.type !== 'learn' && (s.body.includes(c.scene) || s.activity?.narration === c.scene));
    assert.ok(index > 0, `Case missing from ${lesson.id}`);
    const teaching = lesson.steps[index - 1];
    assert.equal(teaching.type, 'learn');
    const caseBody=lesson.id<700?earlyProgressionTeaching[lesson.id].caseBody:lateProgression[lesson.id].caseTeaching||c.teaching;
    assert.equal(teaching.body,caseBody,`Case has wrong teaching in ${lesson.id}`);
    assert.ok(lesson.steps[0].body.includes(record.concept),`${lesson.id}: foundational concept missing`);
    assert.ok(JSON.stringify(lesson.steps[index]).includes(c.explanation), `Case explanation missing from ${lesson.id}`);
  }
});

test('adjacent points change their sequence and every point uses at least three actual interaction formats', () => {
  const sequences = authored.lessons.map(l => l.steps.filter(s => s.type !== 'learn').map(kind));
  for (const [index, sequence] of sequences.entries()) {
    assert.ok(new Set(sequence).size >= 3, `Point ${index + 1}: ${sequence.join(', ')}`);
    if (index > 0) assert.notDeepEqual(sequence, sequences[index - 1], `Points ${index} and ${index + 1} repeat their interaction sequence`);
  }
  assert.ok(new Set(sequences.slice(0, 10).map(sequence => sequence.join(','))).size >= 8, 'The introductory world needs individually designed points');
  const firstWorld = authored.lessons.slice(0, 10);
  const numericShare = firstWorld.flatMap(l => l.steps.filter(s => s.type !== 'learn')).filter(s => s.type === 'numeric').length;
  assert.ok(numericShare < 20, 'The first world must not become mostly arithmetic drills');
});

test('inflation, compounding, contributions and recurring costs stay aligned with the approved world-four titles', () => {
  const checks = [[483, /inflaci[oó]n/i], [484, /rentabilidad (?:nominal|real)/i], [485, /inter[eé]s compuesto/i],
    [486, /tiempo|año adicional/i], [487, /aportaci[oó]n/i], [488, /costes/i]];
  for (const [id, expected] of checks) assert.match(authored.lessons[id - 450].steps[0].body, expected, `Title/content mismatch ${id}`);
  const insolvency = records[44];
  assert.match(insolvency.prompt, /obligaciones con prioridad por \{a\}.*activos aporta \{b\}/);
  assert.equal(calculate(insolvency.op, insolvency.args), 20);
  const debtSaving = records[173];
  assert.equal(debtSaving.op, 'tax');
  assert.deepEqual(debtSaving.args, [50, 6]);
  assert.match(debtSaving.prompt, /\{a\} €.*\{b\} %/);
  assert.equal(calculate(debtSaving.op, debtSaving.args), 3);
  assert.match(records[17].prompt, /fracciones/,'Varying reinvestment sums must not ask for whole shares then score a fraction');
});

test('opening an outdated stocks draft clears old answers while retaining completed points, exams and other paths', () => {
  const old = session(450, 5), oldLater = session(460, 7), history = session(0, 3), etf = session(950, 3, lessons[950].editorialRevision);
  const snapshot = { ...emptySnapshot(), activeId: 450, activeByTrack: { stocks: 450 },
    completed: { 0: { firstTry: 4 }, 450: { firstTry: 4 }, 451: { firstTry: 2 }, 950: { firstTry: 3 } },
    passedExams: { 0: { best: 9, attempts: 2, passed: true }, 45: { best: 8, attempts: 1, passed: true } },
    sessions: [old, oldLater, history, etf],
    archivedExamSessions: { 0: examDraft(0, 4) },
  };
  const app = mount(snapshot);
  openLesson(app, 450);
  assert.equal(app.course.reportContext().stepIndex, 0);
  for (const id of [450, 460]) {
    const updated = app.saved.sessions.find(s => s[0] === id);
    assert.equal(updated[1], 0);
    assert.equal(updated[2][0].v.contentRevision, lessons[id].editorialRevision);
    assert.ok(updated[2].every(d => !d.p && d.c === undefined && d.n === undefined), `Old answers survived in ${id}`);
  }
  assert.deepEqual(app.saved.completed, snapshot.completed);
  assert.deepEqual(app.saved.passedExams, snapshot.passedExams);
  assert.deepEqual(app.saved.sessions.find(s => s[0] === 0), history);
  assert.deepEqual(app.saved.sessions.find(s => s[0] === 950), etf);
  assert.deepEqual(app.saved.archivedExamSessions, snapshot.archivedExamSessions);
  app.click({ nav: 'map' });
  assert.doesNotMatch(app.main.innerHTML, /Acciones: 0 de 500 puntos/);
});

test('outdated current exams restart while passed exam history and unrelated exam drafts survive', () => {
  const oldExam = examDraft(45, 7), otherExam = examDraft(95, 3, exams[95].editorialRevision), archived = examDraft(0, 2);
  const snapshot = { ...emptySnapshot(), group: 45, exam: oldExam, examSessions: { stocks: oldExam, etfs: otherExam },
    archivedExamSessions: { 0: archived },
    completed: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [450 + i, { firstTry: 4 }])),
    passedExams: { 45: { best: 9, attempts: 3, passed: true }, 0: { best: 8, attempts: 1, passed: true } },
  };
  const app = mount(snapshot);
  app.window.virutaAttemptId = () => '10000000-0000-4000-8000-000000000001';
  openExam(app, 45);
  assert.equal(app.saved.exam.step, 0);
  assert.equal(app.saved.exam.drafts[0].v.contentRevision, exams[45].editorialRevision);
  assert.ok(app.saved.exam.drafts.every(d => d.c === undefined && d.n === undefined));
  assert.deepEqual(app.saved.passedExams, snapshot.passedExams);
  assert.deepEqual(app.saved.examSessions.etfs, otherExam);
  assert.deepEqual(app.saved.archivedExamSessions[0], archived);
});

test('a draft from the unchanged first world survives cloud serialization, resume and background merge', () => {
  const revision = 'stocks-clear-2026-10-09';
  const active = session(451, 3, revision);
  active[2][3] = { n: '7,5' };
  const snapshot = { ...emptySnapshot(), activeId: 451, activeByTrack: { stocks: 451 }, sessions: [active], completed: { 450: { firstTry: 4 } } };
  const cloud = mergeProgress(null, copy(makeEnvelope(snapshot, null, 100)));
  assert.equal(cloud.snapshot.sessions[0][2][0].v.contentRevision, revision);
  const app = mount(cloud.snapshot);
  openLesson(app, 451);
  assert.equal(app.course.reportContext().stepIndex, 3);
  assert.equal(app.saved.sessions.find(s => s[0] === 451)[2][3].n, '7,5');
  app.course.mergeAchievements(cloud.snapshot);
  const roundTrip = sanitizeSnapshot(copy(app.saved));
  assert.equal(roundTrip.sessions.find(s => s[0] === 451)[2][0].v.contentRevision, revision);
  assert.equal(roundTrip.sessions.find(s => s[0] === 451)[1], 3);
  assert.deepEqual(roundTrip.completed, snapshot.completed);
  assert.equal(lessons[451].editorialRevision, revision);
  assert.equal(exams[45].editorialRevision, revision);
});
