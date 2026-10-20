import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {COURSE_PARTS,CASE_PARTS} from '../src/content-files.js';
import { validateCases } from '../src/cases-validation.js';
import {CASE_WORLD_IDS,isArchivedWorld} from '../src/tracks.js';

const content = async name => JSON.parse(await readFile(new URL('../src/content/' + name + '.json', import.meta.url), 'utf8'));
const parts = await Promise.all(CASE_PARTS.map(content));
const cases = parts.flatMap(part => part.cases);
const lessons = (await Promise.all(COURSE_PARTS.map(content))).flatMap(part => part.lessons);
const verify = values => validateCases(values, { lessons });
const edited = change => { const copy = structuredClone(cases); change(copy); return copy; };

test('174 cases cover 129 current worlds and preserve the 45 historical identities', () => {
  assert.equal(verify(cases), true);
  assert.deepEqual(cases.map(item => item.world),CASE_WORLD_IDS);
  assert.deepEqual(cases.filter(item=>isArchivedWorld(item.world)).reduce((sum, item) => ({ ...sum, [item.track]: (sum[item.track] || 0) + 1 }), {}), { stocks: 25, etfs: 10, crypto: 10 });
  assert.deepEqual(cases.filter(item=>!isArchivedWorld(item.world)).reduce((sum, item) => ({ ...sum, [item.track]: (sum[item.track] || 0) + 1 }), {}), { stocks: 50, etfs: 20, crypto: 30,technical:29 });
});

test('the public case catalogue contains no premium explanation or answer keys', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const matches = [...html.matchAll(/<script[^>]*id="br-cases"[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(matches.length, 1);
  const publicCases=JSON.parse(matches[0][1]);
  assert.deepEqual(publicCases,cases.map(({id,world,track,company,title,summary,period,minutes,cover,revision,lessonIds,learningGoals})=>({id,world,track,company,title,summary,period,minutes,cover,...(revision?{revision,lessonIds,learningGoals}:{})})));
  for(const item of publicCases){assert.equal(item.steps,undefined);assert.equal(item.takeaway,undefined);assert.equal(item.sources,undefined);}
  for (const id of ['br-invest-lessons', 'br-exams', 'br-course', 'br-reading-support']) assert.ok(html.includes(`id="${id}"`));
});

test('case identities cannot collide or migrate into another path', () => {
  assert.throws(() => verify(edited(copy => { copy[1].id = copy[0].id; })), /Duplicate/);
  assert.throws(() => verify(edited(copy => { copy[10].track = 'crypto'; })), /world\/track/);
  assert.throws(() => verify(edited(copy => { copy[0].world = 175; })), /world\/track/);
  assert.throws(() => verify(cases.slice(1)), /174 study cases/);
});

test('each case preserves three substantial explanations alternating with three varied challenges', () => {
  assert.throws(() => verify(edited(copy => { [copy[0].steps[0], copy[0].steps[1]] = [copy[0].steps[1], copy[0].steps[0]]; })), /alternating/);
  assert.throws(() => verify(edited(copy => { copy[0].steps[0].body = 'Una frase sin explicar el caso.'; })), /substantial/);
  assert.throws(() => verify(edited(copy => { copy[0].steps[3] = structuredClone(copy[0].steps[1]); copy[0].steps[5] = structuredClone(copy[0].steps[1]); })), /variety/);
  assert.throws(() => verify(edited(copy => { delete copy[0].steps[1].explanation; })), /feedback/);
});

test('source URLs must be complete HTTPS links without embedded credentials', () => {
  for (const url of ['http://example.com/report', 'javascript:alert(1)', '/relative-report', 'https://user:secret@example.com/report']) {
    assert.throws(() => verify(edited(copy => { copy[0].sources[0].url = url; })), /HTTPS source/);
  }
});

test('figure matrices and comparisons must have compatible dimensions and distinct scenarios', () => {
  assert.throws(() => verify(edited(copy => { copy[0].steps[0].figure.rows[0].pop(); })), /table rows/);
  assert.throws(() => verify(edited(copy => { copy[11].steps[2].figure.values.push(1); })), /bar values/);
  assert.throws(() => verify(edited(copy => { copy[0].steps[2].figure.kind = 'pie'; })), /unsupported figure/);
  assert.throws(() => verify(edited(copy => { copy[0].steps[2].explore.options[1].body = copy[0].steps[2].explore.options[0].body; })), /repeated scenario/);
  assert.throws(() => verify(edited(copy => { copy[0].steps.forEach(step => { delete step.figure; delete step.explore; }); })), /visual\/comparison/);
});

test('answer indices, matching pairs, order permutations and numeric tolerances are renderable', () => {
  assert.throws(() => verify(edited(copy => { copy[0].steps[1].answer = 8; })), /answer indices/);
  assert.throws(() => verify(edited(copy => { copy[0].steps[5].answers = [1, 1]; })), /answer indices/);
  assert.throws(() => verify(edited(copy => { const step = copy[1].steps[5]; step.pairs[1].right = step.pairs[0].right; })), /ambiguous pairs/);
  assert.throws(() => verify(edited(copy => { copy[3].steps[5].answer = [0, 0, 1]; })), /order permutation/);
  assert.throws(() => verify(edited(copy => { copy[0].steps[3].tolerance = -1; })), /numeric answer/);
});

test('declared case vocabulary cannot first be tested before its explanation', () => {
  const copy = edited(copy => {
    copy[0].steps[4].terms = [{ word: 'Xenocalibración', meaning: 'Un concepto inventado para comprobar el orden editorial.' }];
    copy[0].steps[4].body += ' La xenocalibración se explica aquí.';
    copy[0].steps[1].body += ' Calcula la xenocalibración.';
  });
  assert.throws(() => verify(copy), /term used before explanation: Xenocalibración/);
  // This is a guard for declared terms; nuanced explanation quality is reviewed editorially.
});

test('all 18 numeric answers match independently recomputed case quantities', () => {
  const expected = {
    'stocks-1': 47.10 / 1.884,
    'stocks-2': 9285 - 169 + 624 - 2373,
    'stocks-3': 74071 - 21771,
    'stocks-4': 6494 / 28263 * 100,
    'stocks-5': 100 / 1.1 + 110 / 1.1 ** 2,
    'stocks-6': (1.1 * 0.95 - 1) * 100,
    'stocks-7': 120000 / 3 - 120000 / 5,
    'stocks-8': 800 - (2000 + 300 - 700 - 900),
    'stocks-9': 1700 / 1.08 ** 3,
    'stocks-10': 0.25 * -40 + 0.75 * -4,
    'etfs-1': (10400 + 300 - 10000) / 10000 * 100,
    'etfs-2': 0.5 * 72.14 + 0.5 * 100,
    'etfs-3': 24.91 - 24.50,
    'etfs-4': 123 / (123 + 127) * 100,
    'etfs-5': (6000 * 0.6 + 4000) / 10000 * 100,
    'crypto-3': (1162 - 468) / 468 * 100,
    'crypto-4': 3300 / 9700 * 100,
    'crypto-5': 150 / 600 * 100,
  };
  const numeric = cases.filter(item=>item.world<20).flatMap(item => item.steps.filter(step => step.type === 'numeric').map(step => ({ id: item.id, step })));
  assert.equal(numeric.length, Object.keys(expected).length);
  for (const { id, step } of numeric) assert.ok(Math.abs(step.answer - expected[id]) <= step.tolerance, `${id}: ${step.answer} differs from ${expected[id]}`);
});
