import {trackForLesson,trackForExam,worldNumber,CASE_COUNT,CASE_WORLD_IDS} from './tracks.js';
import {validateActivity} from './exercise-formats.js';
const check = (ok, message) => { if (!ok) throw new Error(message); };
const text = value => typeof value === 'string' && value.trim().length > 0;
const normalize = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const hasTerm = (value, term) => new RegExp('(?:^|[^a-z0-9])' + normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z0-9])').test(normalize(value));

function figure(value, where) {
  check(value && text(value.caption), where + ' figure caption');
  if (value.kind === 'candles') {
    check(Array.isArray(value.candles) && value.candles.length >= 3 && value.candles.length <= 30, where + ' candle count');
    check(text(value.timeframe), where + ' chart timeframe');
    for(const c of value.candles)check(['o','h','l','c','v'].every(k=>Number.isFinite(c[k])) && c.l>0 && c.h>c.l && c.h>=Math.max(c.o,c.c) && c.l<=Math.min(c.o,c.c) && c.v>0, where + ' valid OHLC');
    if(value.axisLabels)check(value.labels?.length===value.candles.length && value.labels.every(text),where+' chart labels');
    for(const line of [...value.overlays||[],...value.panel?.series||[]])check(line.values.length===value.candles.length && line.values.every(v=>v===null||Number.isFinite(v)),where+' indicator alignment');
    if(value.showZone)check(value.zone?.length===2 && value.zone.every(Number.isFinite) && value.zone[0]<value.zone[1],where+' chart zone');
  } else if (value.kind === 'table') {
    check(Array.isArray(value.headers) && value.headers.length >= 2 && value.headers.every(text), where + ' table headers');
    check(Array.isArray(value.rows) && value.rows.length > 0 && value.rows.every(row => Array.isArray(row) && row.length === value.headers.length && row.every(cell => text(cell) || typeof cell === 'number' && Number.isFinite(cell))), where + ' table rows');
  } else if (value.kind === 'bars') {
    check(Array.isArray(value.labels) && value.labels.length > 0 && value.labels.every(text) && Array.isArray(value.values) && value.values.length === value.labels.length && value.values.every(Number.isFinite), where + ' bar values');
    check(text(value.unit), where + ' bar unit');
  } else if (value.kind === 'flow') {
    check(Array.isArray(value.items) && value.items.length >= 2 && value.items.every(text), where + ' flow items');
  } else throw new Error(where + ' unsupported figure');
}

function exercise(step, where) {
  check(text(step.explanation) && text(step.hint), where + ' feedback');
  if(step.activity){validateActivity(step.activity,where);if(step.activity.candles)figure(step.activity.candles,where+' chart');}
  if (step.type === 'choice' || step.type === 'multi') {
    check(Array.isArray(step.options) && step.options.length >= 2 && step.options.length <= 4 && step.options.every(option => text(option.text)), where + ' options');
    check(new Set(step.options.map(option => option.text)).size === step.options.length, where + ' duplicate options');
    const answers = step.type === 'choice' ? [step.answer] : step.answers;
    check(Array.isArray(answers) && answers.length > 0 && new Set(answers).size === answers.length && answers.every(answer => Number.isInteger(answer) && answer >= 0 && answer < step.options.length), where + ' answer indices');
  } else if (step.type === 'numeric') {
    check(Number.isFinite(step.answer) && Number.isFinite(step.tolerance) && step.tolerance >= 0 && text(step.unit), where + ' numeric answer');
  } else if (step.type === 'match') {
    check(Array.isArray(step.pairs) && step.pairs.length >= 2 && step.pairs.length <= 4 && step.pairs.every(pair => text(pair.left) && text(pair.right)), where + ' pairs');
    check(new Set(step.pairs.map(pair => pair.left)).size === step.pairs.length && new Set(step.pairs.map(pair => pair.right)).size === step.pairs.length, where + ' ambiguous pairs');
  } else if (step.type === 'order') {
    check(Array.isArray(step.items) && step.items.length >= 2 && step.items.length <= 4 && step.items.every(text) && new Set(step.items).size === step.items.length, where + ' order items');
    check(Array.isArray(step.answer) && step.answer.length === step.items.length && new Set(step.answer).size === step.items.length && step.answer.every(answer => Number.isInteger(answer) && answer >= 0 && answer < step.items.length), where + ' order permutation');
  } else throw new Error(where + ' unsupported exercise ' + step.type);
}

/** Structural and declared-vocabulary checks; factual accuracy still needs editorial review. */
export function validateCases(input, { lessons = [] } = {}) {
  const cases = Array.isArray(input) ? input : input?.cases;
  check(Array.isArray(cases) && cases.length === CASE_COUNT, `Expected ${CASE_COUNT} study cases`);
  check(new Set(cases.map(item => item.id)).size === CASE_COUNT && new Set(cases.map(item => item.world)).size === CASE_COUNT, 'Duplicate case or world');
  const bodies = new Set();
  for (const item of cases) {
    const where = 'Case ' + item.id;
    const track = trackForExam(item.world)?.id;
    const local = worldNumber(item.world);
    const active=!trackForExam(item.world)?.archived;
    check(CASE_WORLD_IDS.includes(item.world) && item.track === track && item.id === `${track}-${active?'v2-':''}${local}`, where + ' world/track identity');
    if(active){
      check(item.revision==='cases-2026-10',where+' revision');
      const expected=Array.from({length:10},(_,i)=>item.world*10+i);
      check(JSON.stringify(item.lessonIds)===JSON.stringify(expected),where+' lesson alignment');
      check(Array.isArray(item.learningGoals) && item.learningGoals.length>=2 && item.learningGoals.length<=4 && item.learningGoals.every(text),where+' learning goals');
    }
    for (const key of ['title', 'company', 'period', 'summary', 'takeaway']) check(text(item[key]), where + ' ' + key);
    check(Number.isFinite(item.minutes) && item.minutes > 0, where + ' duration');
    check(item.cover && /^[a-z][a-z0-9-]*$/.test(item.cover.icon) && /^#[a-f0-9]{6}$/i.test(item.cover.color), where + ' cover');
    check(Array.isArray(item.sources) && item.sources.length > 0, where + ' sources');
    for (const source of item.sources) {
      let url; try { url = new URL(source.url); } catch { /* rejected below */ }
      check(text(source.title) && url?.protocol === 'https:' && !!url.hostname && !url.username && !url.password, where + ' HTTPS source');
    }
    check(Array.isArray(item.steps) && item.steps.length === 6, where + ' six steps');
    let figures = 0, explores = 0;
    const types = new Set();
    const declaredTerms = item.steps.flatMap(step => step.type === 'learn' ? step.terms || [] : []);
    // Only already-completed worlds in this path can supply earlier explanations.
    let explained = lessons.filter(lesson => trackForLesson(lesson.id)?.id === track && Boolean(trackForLesson(lesson.id)?.archived)===!active && worldNumber(Math.floor(lesson.id/10)) <= local).flatMap(lesson => lesson.steps.filter(step => step.type === 'learn').map(step => step.body)).join('\n');
    item.steps.forEach((step, index) => {
      const place = where + ' step ' + index;
      check(text(step.title) && text(step.body) && !step.body.includes('\uFFFD'), place + ' text');
      check((step.type === 'learn') === (index % 2 === 0), place + ' alternating explanation/exercise');
      if (step.figure) { figure(step.figure, place); figures++; }
      if (step.type === 'learn') {
        check(text(step.takeaway) && step.body.split(/\s+/u).length >= 60, place + ' substantial explanation');
        check(!bodies.has(step.body), place + ' repeated explanation'); bodies.add(step.body);
        check(step.terms === undefined || Array.isArray(step.terms) && step.terms.every(term => text(term.word) && text(term.meaning)), place + ' terms');
        explained += '\n' + step.body + '\n' + (step.terms || []).map(term => term.word + ': ' + term.meaning).join('\n');
        if (step.explore) {
          const comparison = step.explore;
          check(text(comparison.prompt) && Array.isArray(comparison.options) && comparison.options.length >= 2 && comparison.options.length <= 3, place + ' comparison');
          check(new Set(comparison.options.map(option => option.body)).size === comparison.options.length, place + ' repeated scenario');
          for (const option of comparison.options) {
            check(text(option.label) && text(option.title) && text(option.body), place + ' scenario text');
            if (option.figure) { figure(option.figure, place); figures++; }
          }
          explores++;
        }
      } else {
        check(!step.explore, place + ' exploration belongs in explanation');
        exercise(step, place); types.add(step.activity?.kind||step.type);
        const question = [step.body, ...(step.options || []).map(option => option.text), ...(step.pairs || []).flatMap(pair => [pair.left, pair.right]), ...(step.items || [])].join('\n');
        for (const term of declaredTerms) if (hasTerm(question, term.word)) check(hasTerm(explained, term.word), place + ' term used before explanation: ' + term.word);
      }
    });
    check(figures >= 2 && explores >= 1, where + ' visual/comparison coverage');
    check(types.size >= 2, where + ' exercise variety');
  }
  return true;
}
