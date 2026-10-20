import { pair, choice, match, rows, truth, activity, table, usePairs, REVISION } from './helpers.mjs';
import { earlySituations } from './early-situations.mjs';
import { earlyProgressionTeaching } from './early-progression-teaching.mjs';
import { cases as earlyCases } from './cases-2-20.mjs';
import { cases as middleCases } from './cases-21-40.mjs';
import { calculationMethod } from '../course-authoring.mjs';

const cases = { ...earlyCases, ...middleCases };
// A calculation remains when learning the procedure is part of the topic.
// Research, business models and competitive advantages are not arithmetic drills.
export const EARLY_NUMERIC_LESSONS = new Set([
  473, 480, 481, 482, 484, 485, 487, 488, 493, 496, 506, 507, 511,
  540, 541, 542, 545, 551, 552, 554, 555, 556, 557, 558, 573, 574, 576,
  580, 592, 597, 598, 605, 611, 612, 614, 616, 617, 618, 623, 626, 627,
  634, 638, 640, 642, 648, 649, 650, 651, 652, 657, 658, 659,
  660, 662, 665, 666, 670, 672, 674, 675, 676, 687, 691, 692, 697, 698, 699,
]);
const copy = value => structuredClone(value);
const kind = step => step.activity?.kind || step.type;
const firstSentence = text => text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || text;
// Feedback gives the conclusion and the causal distinction for this facet.
// It does not append the same general caution to every answer in the point.
const reasoning = body => body.slice(firstSentence(body).length).trim() || body;
const explain = (s, teaching) => `${s.correct} ${reasoning(teaching.nuanceBody)}`;
const alternating = (a, b, seed) => seed % 2 ? { options: [b, a], answer: 1 } : { options: [a, b], answer: 0 };

function caseExercise(c, id, teaching) {
  const { options, answer } = alternating(c.correct, c.incorrect, id);
  const body = `${c.scene}\n\n${c.question}`;
  const base = choice('Interpreta el caso', body, options, answer, c.explanation);
  if (id % 4 === 0) return activity(base, 'clues', { options, answer, clues: [teaching.caseBody, c.question], instruction: 'Relaciona la situación con la explicación anterior. Puedes abrir las pistas.' });
  if (id % 4 === 1) return activity(base, 'audio', { prompt: c.question, narration: c.scene, options, answer, instruction: 'Escucha el caso o lee su transcripción y responde.' });
  if (id % 4 === 2) return truth('Comprueba la interpretación', body, options.map((text, i) => [text, i === answer]), c.explanation);
  return base;
}

function situationExercise(s, teaching, id, reserved) {
  const available = ['choice', 'truth', 'match', 'clues'].filter(k => !reserved.includes(k));
  const selected = available[id % available.length];
  const { options, answer } = alternating(s.correct, s.incorrect, id + Math.floor(id / 10));
  const body = `${s.scene}\n\n¿Qué conclusión está apoyada por esta información?`;
  const feedback = explain(s, teaching);
  if (selected === 'truth') return truth('Qué sostienen los datos', s.scene + '\n\nDecide si cada conclusión está justificada.', options.map((text, i) => [text, i === answer]), feedback);
  if (selected === 'match') return match('Separa la conclusión del error', s.scene + '\n\nRelaciona cada interpretación con su evaluación.', [[s.correct, 'Está justificada por la situación'], [s.incorrect, 'Introduce una conclusión equivocada']], feedback);
  const base = choice('Decide con la información disponible', body, options, answer, feedback);
  if (selected === 'clues') return activity(base, 'clues', { options, answer, clues: [firstSentence(teaching.nuanceBody), reasoning(teaching.nuanceBody)], instruction: 'Relaciona los hechos con el matiz explicado. Las pistas separan el criterio y su razón.' });
  return base;
}

function evidenceExercise(s, teaching, id, reserved) {
  const feedback = `${s.evidence} ${reasoning(teaching.checkBody)}`;
  const body = `${s.scene}\n\nTu comprobación tiene este objetivo: «${firstSentence(teaching.checkBody)}». ¿Qué información es directamente pertinente para realizarla?`;
  const entries = [
    { label: s.evidence, options: ['Responde a esta duda', 'No basta para responderla'], answer: 0 },
    { label: s.distraction, options: ['Responde a esta duda', 'No basta para responderla'], answer: 1 },
  ];
  if (id % 2) entries.reverse();
  const available = ['classify', 'table', 'match'].filter(k => !reserved.includes(k));
  const selected = available[id % available.length];
  if (selected === 'match') return match('Elige qué investigar', body, entries.map(e => [e.label, e.options[e.answer]]), feedback);
  return rows(selected, id % 2 ? 'Completa la comprobación' : 'Distingue la evidencia útil', body, entries, feedback);
}

export function refineEarlyWorlds(result, records) {
  for (const lesson of result.lessons.filter(l => l.id >= 470 && l.id <= 699)) {
    const id = lesson.id, r = records[id - 450], c = cases[id], s = earlySituations[id], teaching = earlyProgressionTeaching[id];
    if (!r || !c || !s || !teaching) throw new Error(`Falta autoría cualitativa para Acciones ${id}`);
    // Define the term once. Reconstructing the screen also removes the old
    // explore panel, which copied the same example and caution a second time.
    const foundation = pair(lesson.title, `${r.concept}\n\n${r.limit}`, r.meaning, copy(lesson.steps[1]));
    const existingCase = caseExercise(c, id, teaching);
    const casePair = pair('Cómo aplicar la idea', teaching.caseBody, firstSentence(teaching.caseBody), existingCase);
    const decision = situationExercise(s, teaching, id, [kind(foundation[1]), kind(existingCase)]);
    const decisionPair = pair('Un matiz que cambia la interpretación', teaching.nuanceBody, firstSentence(teaching.nuanceBody), decision);
    let fourthPair;
    if (EARLY_NUMERIC_LESSONS.has(id)) {
      const original = lesson.steps.find(step => step.type === 'numeric');
      if (!original) throw new Error(`Falta cálculo de origen para ${id}`);
      const exercise = { ...copy(original), title: 'Cuantifica esta situación' };
      // The arithmetic-mean point needs a worked mean, not the authored
      // compounding counterexample (which solves a different procedure).
      const workedExample = id === 482
        ? 'Tres rendimientos anuales del 8 %, 4 % y 6 % suman 18 puntos porcentuales. Su media simple es 18 ÷ 3 = 6 %. Esa cifra no reconstruye por sí sola el capital final.'
        : r.example;
      fourthPair = pair('Obtén la cifra e interpreta su alcance', `${calculationMethod(r.op)}\n\nEjemplo resuelto: ${workedExample}\n\n${teaching.checkBody}`, firstSentence(teaching.checkBody), exercise);
      exercise.hint = `Usa los datos de esta pregunta. ${calculationMethod(r.op)}`;
      if([480,540,551,576,611,623,659,660].includes(id))fourthPair[0].figure=table(['Paso de comprobación','Finalidad'],[[firstSentence(teaching.checkBody),reasoning(teaching.checkBody)]],'La cifra se interpreta junto con los datos que explican su origen.');
    } else {
      const evidence = evidenceExercise(s, teaching, id, [kind(foundation[1]), kind(existingCase), kind(decision)]);
      fourthPair = pair('Qué evidencia permite comprobarlo', teaching.checkBody, firstSentence(teaching.checkBody), evidence);
    }
    const pairs = [foundation, casePair, decisionPair, fourthPair];
    usePairs(lesson, pairs);
    lesson.qualitativeRevision = 'early-reasoning-2026-10-10';
  }
  for (const exam of result.exams.filter(e => e.id >= 47 && e.id <= 69)) {
    const oldSteps = exam.steps;
    exam.steps = Array.from({ length: 10 }, (_, index) => {
      const id = exam.id * 10 + index, r = records[id - 450], s = earlySituations[id], teaching = earlyProgressionTeaching[id];
      // One numerical question at most in each exam. Its operands are fresh in
      // refineStocks; qualitative questions assess the interpretation/evidence.
      const firstNumeric = Array.from({ length: 10 }, (_, i) => exam.id * 10 + i).find(n => EARLY_NUMERIC_LESSONS.has(n) && (n % 10) % 2 === 0);
      if (id === firstNumeric && oldSteps[index]?.type === 'numeric') {
        return { ...copy(oldSteps[index]), reviewLesson: id, title: 'Aplica el procedimiento y revisa su significado' };
      }
      const evidence = index % 3 === 1;
      const correct = evidence ? s.evidence : s.correct;
      const incorrect = evidence ? s.distraction : s.incorrect;
      // The required action alternates: validate a conclusion, select evidence,
      // or reject a proposed conclusion. Do not leak a fixed answer position.
      const reject = index % 3 === 2;
      const { options, answer } = alternating(reject ? incorrect : correct, reject ? correct : incorrect, Math.floor(id / 10) + index);
      const question = evidence ? '¿Qué comprobarías para contrastar esta interpretación?' : reject ? '¿Qué conclusión descartarías porque estos datos no la justifican?' : '¿Qué interpretación puedes defender con estos datos?';
      const step = choice(evidence ? 'Selecciona la evidencia' : reject ? 'Encuentra el error de razonamiento' : 'Interpreta antes de decidir', `${s.scene}\n\n${question}`, options, answer, evidence ? `${s.evidence} ${reasoning(teaching.checkBody)}` : explain(s, teaching));
      step.reviewLesson = id;
      delete step.hint;
      return step;
    });
    exam.editorialRevision = REVISION;
  }
  return result;
}
