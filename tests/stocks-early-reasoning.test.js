import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileRevision, parseAuthoring } from '../scripts/course-authoring.mjs';
import { refineStocks } from '../scripts/stocks-editorial/refine.mjs';
import { refineEarlyWorlds, EARLY_NUMERIC_LESSONS } from '../scripts/stocks-editorial/worlds-3-25.mjs';
import { earlySituations } from '../scripts/stocks-editorial/early-situations.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const outline = JSON.parse(read('src/content/stocks-outline-v2.json'));
const records = parseAuthoring(Array.from({ length: 5 }, (_, i) => read(`src/content/stocks-v2-authoring/part-${i + 1}.txt`)), 500);
const original = refineStocks(compileRevision({ outline, records, start: 450, sources: [] }), records,{depthTeaching:false,secondCorrections:false,marketEdits:false,compoundNotes:false,riskNotes:false,clearWriting:false});
// This tests the earlier reasoning stage in isolation. The subsequent world-four
// rewrite removes some of the calculation exercises this stage needs as input;
// replaying an earlier stage on that finished curriculum is not a valid pipeline.
// Restore only that world's documented prior input. The final published version
// is exercised in full by stocks-compound and stocks-revision instead.
const previousWorld = JSON.parse(read('tests/fixtures/stocks-compound-previous-world.json'));
for (const lesson of previousWorld.lessons) original.lessons[lesson.id - 450] = lesson;
original.exams[3] = previousWorld.exams[0];
const course = refineEarlyWorlds(structuredClone(original), records);
const lessons = course.lessons.filter(l => l.id >= 470 && l.id <= 699);
const exams = course.exams.filter(e => e.id >= 47 && e.id <= 69);
const kind = step => step.activity?.kind || step.type;

test('all 230 early points have independent topic situations and retain stable identities', () => {
  assert.deepEqual(Object.keys(earlySituations).map(Number), Array.from({ length: 230 }, (_, i) => 470 + i));
  assert.equal(new Set(Object.values(earlySituations).map(s => s.scene)).size, 230);
  assert.deepEqual(lessons.map(l => [l.id, l.title]), original.lessons.slice(20, 250).map(l => [l.id, l.title]));
  assert.deepEqual(course.lessons.slice(0, 20), original.lessons.slice(0, 20));
  assert.deepEqual(course.lessons.slice(250), original.lessons.slice(250));
  assert.deepEqual(course.exams.slice(0, 2), original.exams.slice(0, 2));
  assert.deepEqual(course.exams.slice(25), original.exams.slice(25));
});

test('each practice follows its explanation, has feedback and changes adjacent interaction sequences', () => {
  let prior;
  for (const l of lessons) {
    assert.equal(l.steps.length, 8);
    const sequence = [];
    for (let i = 0; i < l.steps.length; i += 2) {
      assert.equal(l.steps[i].type, 'learn');
      assert.ok(l.steps[i].body.length > 60, `${l.id}: missing teaching context`);
      const exercise = l.steps[i + 1];
      assert.notEqual(exercise.type, 'learn');
      assert.ok(exercise.body.length > 10);
      assert.ok(exercise.explanation.length > 25);
      sequence.push(kind(exercise));
      if (exercise.type === 'numeric') assert.ok(Number.isFinite(exercise.answer));
    }
    assert.ok(new Set(sequence).size >= 3, `${l.id}: ${sequence}`);
    if (prior) assert.notDeepEqual(sequence, prior, `${l.id} repeats the previous sequence`);
    prior = sequence;
    assert.doesNotMatch(JSON.stringify(l.steps), /undefined|NaN|\{[a-d]\}|TODO|Dos situaciones, dos resultados|Compara sin confundir las bases/);
  }
});

test('quantitative drills are selected by topic instead of forced on every lesson', () => {
  const numerical = lessons.flatMap(l => l.steps.filter(s => s.type === 'numeric'));
  assert.equal(numerical.length, EARLY_NUMERIC_LESSONS.size);
  assert.ok(numerical.length < 80, 'Keep explicit calculation below 9% of the 920 practices');
  for (const l of lessons) {
    assert.equal(l.steps.filter(s => s.type === 'numeric').length, EARLY_NUMERIC_LESSONS.has(l.id) ? 1 : 0);
    const payload = JSON.stringify(l.steps);
    assert.ok(payload.includes(earlySituations[l.id].scene), `${l.id}: missing its topic situation`);
    if (!EARLY_NUMERIC_LESSONS.has(l.id)) assert.ok(payload.includes(earlySituations[l.id].evidence), `${l.id}: missing evidence task`);
  }
  for (const id of [520, 530, 538, 560, 568, 622, 628, 680, 688]) {
    assert.equal(course.lessons[id - 450].steps.filter(s => s.type === 'numeric').length, 0, `${id}: arithmetic adds no learning here`);
  }
});

test('world exams assess all ten topics without fixed correct option or repeated arithmetic', () => {
  for (const e of exams) {
    assert.equal(e.steps.length, 10);
    assert.deepEqual(e.steps.map(s => s.reviewLesson), Array.from({ length: 10 }, (_, i) => e.id * 10 + i));
    assert.ok(e.steps.filter(s => s.type === 'numeric').length <= 1);
    const choices = e.steps.filter(s => s.type === 'choice');
    assert.deepEqual(new Set(choices.map(s => s.answer)), new Set([0, 1]));
    for (const s of choices) {
      assert.ok(s.options[s.answer]);
      assert.notEqual(s.options[0].text, s.options[1].text);
      assert.ok(s.explanation);
      assert.equal(s.hint, undefined);
    }
  }
});
