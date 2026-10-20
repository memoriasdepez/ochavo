import { choice, activity, truth, rows } from './helpers.mjs';
import { cases as earlyCases } from './cases-2-20.mjs';
import { cases as middleCases } from './cases-21-40.mjs';
import { earlySituations } from './early-situations.mjs';
import { earlyProgressionTeaching } from './early-progression-teaching.mjs';
import { earlyChallengeData as coreData } from './challenge-early-data.mjs';
import { earlyExtraChallengeData } from './challenge-early-extra.mjs';
import { earlySpecialChallenges } from './challenge-early-special.mjs';

const cases = { ...earlyCases, ...middleCases };
const earlyChallengeData = { ...coreData, ...earlyExtraChallengeData };
const first = text => text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || text;
const remaining = text => text.slice(first(text).length).trim() || text;
const sentences = text => [...new Intl.Segmenter('es', { granularity: 'sentence' }).segment(text)].map(x => x.segment.trim()).filter(Boolean);
const clone = value => structuredClone(value);
const recipes = [
  ['all', 'choice', 'truth', 'diagram'],
  ['intruder', 'all', 'diagram', 'choice'],
  ['choice', 'truth', 'all', 'table'],
  ['all', 'choice', 'diagram', 'truth'],
  ['intruder', 'choice', 'truth', 'all'],
  ['choice', 'all', 'diagram', 'table'],
];
function rotate(entries, seed) {
  const offset = seed % entries.length;
  return entries.slice(offset).concat(entries.slice(0, offset));
}
const optionsFor = (good, bad, seed) => rotate([...good.map(text => ({ text, yes: true })), ...bad.map(text => ({ text, yes: false }))], seed);
function select(title, body, correct, wrong, feedback, hint, seed) {
  const options = optionsFor([correct], wrong, seed);
  const exercise = choice(title, body, options.map(x => x.text), options.findIndex(x => x.yes), feedback);
  exercise.hint = hint;
  return exercise;
}
function claims(kind, title, body, good, wrong, feedback, hint, seed) {
  const options = optionsFor(good, wrong, seed);
  const base = select(title, body, good[0], wrong, feedback, hint, seed);
  if (kind === 'truth') {
    const exercise = truth(title, body, options.map(x => [x.text, x.yes]), feedback);
    exercise.hint = hint;
    exercise.activity.hint = hint;
    return exercise;
  }
  if (kind === 'intruder') {
    // A single wrong conclusion, against two different supported observations.
    const entries = optionsFor(good, wrong.slice(0, 1), seed);
    return activity(base, 'intruder', { title, prompt: `${body}\n\nSeñala la interpretación que no se sostiene.`, options: entries.map(x => x.text), answer: entries.findIndex(x => !x.yes), instruction: 'Selecciona una sola interpretación que introduce un error.', explanation: feedback, hint });
  }
  return activity(base, 'all', { options: options.map(x => x.text), answers: options.flatMap((x, i) => x.yes ? [i] : []), instruction: 'Selecciona todas las interpretaciones justificadas; puede haber más de una.', explanation: feedback, hint });
}
function causalMap(title, body, sources, feedback, hint, seed) {
  const entries = sources.map((source, index) => {
    const options = optionsFor([source.correct], source.wrong, seed + index);
    return { label: source.label, options: options.map(x => x.text), answer: options.findIndex(x => x.yes) };
  });
  const exercise = rows('diagram', title, body, entries, feedback);
  exercise.hint = hint;
  exercise.activity.hint = hint;
  exercise.activity.instruction = 'Completa cada vínculo entre una situación y lo que permite concluir. Cada fila tiene una respuesta.';
  return exercise;
}
const protocol = text => text.replace(/, sin\b.*$/, '').replace(/^La |^El |^Los |^Las /, match => match.toLowerCase());
function evidence(kind, s, d, teaching, id) {
  const body = `${s.scene}\n\nQuieres comprobar esta interpretación: «${s.correct}». Decide qué revisión contiene las piezas necesarias para esa duda.`;
  const missing = (d.evidenceOmissions || []).filter(Boolean);
  const feedback = `${s.evidence} ${remaining(teaching.checkBody)}${missing.length ? ` Las revisiones parciales omiten piezas necesarias: ${missing.join('; ')}.` : ''}`;
  const hint = 'Busca si la revisión conserva las piezas y la base que exige esta duda, aunque use cifras verdaderas.';
  if (kind === 'table' || kind === 'truth' || kind === 'all') {
    const entries = rotate([{ label: s.evidence, yes: true }, ...d.evidenceWrong.map(text => ({ label: protocol(text), yes: false }))], id);
    const exercise = rows(kind === 'all' ? 'table' : kind, 'Evalúa las comprobaciones', body, entries.map((row, i) => ({ label: row.label, options: i % 2 ? ['Le falta una pieza', 'Responde a esta duda'] : ['Responde a esta duda', 'Le falta una pieza'], answer: i % 2 ? row.yes ? 1 : 0 : row.yes ? 0 : 1 })), feedback);
    exercise.hint = hint;
    exercise.activity.hint = hint;
    exercise.activity.instruction = 'Evalúa cada revisión por separado: ¿contiene lo necesario para resolver la duda o falta una pieza?';
    return exercise;
  }
  if (kind === 'diagram') {
    const c = cases[id];
    return causalMap('Conecta hechos, interpretación y comprobación', 'Relaciona cada situación ya trabajada con su lectura correspondiente. Las cifras son contexto; aquí no se pide calcular.', [
      { label: `Caso → ${c.scene}`, correct: first(teaching.caseBody), wrong: d.caseWrong },
      { label: `Matiz → ${s.scene}`, correct: s.correct, wrong: d.nuanceWrong },
      { label: `Revisión → ¿qué estudiarías para contrastar este último matiz?`, correct: s.evidence, wrong: d.evidenceWrong },
    ], `${remaining(teaching.caseBody)} ${remaining(teaching.nuanceBody)} ${remaining(teaching.checkBody)}`, hint, id);
  }
  return select('Elige una comprobación completa', body, s.evidence, d.evidenceWrong, feedback, hint, id + 7);
}

export function refineEarlyChallenges(result) {
  for (const lesson of result.lessons.filter(l => l.id >= 490 && l.id <= 699)) {
    const id = lesson.id, d = earlyChallengeData[id], c = cases[id], s = earlySituations[id], authoredTeaching = earlyProgressionTeaching[id];
    // The example measures purchases, not customer headcount. Keep the
    // published teaching and make the exercise's conclusion precise.
    const teaching = id === 544 ? { ...authoredTeaching,
      caseBody: 'Clientes nuevos pueden ocultar una caída de las compras de la base anterior. Separar ambas bases muestra de dónde procede la expansión y cuánto compran quienes ya eran clientes.'
    } : authoredTeaching;
    if (!d || !c || !s || !teaching) throw Error(`Falta dificultad cualitativa de Acciones ${id}`);
    const recipe = recipes[(id - 490) % recipes.length];
    const foundation = lesson.steps[0];
    const [concept, limitation] = foundation.body.split('\n\n');
    const foundationCorrect = [foundation.takeaway, limitation || first(concept)];
    const foundationBody = `Al aplicar «${lesson.title.toLocaleLowerCase('es')}», compara estas interpretaciones. Distingue lo que la idea permite concluir de lo que requeriría otra información.`;
    const foundationFeedback = `${foundation.takeaway} ${limitation || concept} Las otras interpretaciones cambian esa base o atribuyen a un dato más alcance del que tiene.`;
    const foundationHint = 'Comprueba qué base, plazo o condición usa cada interpretación.';
    lesson.steps[1] = recipe[0] === 'choice'
      ? select('Distingue la interpretación defendible', foundationBody, foundation.takeaway, d.foundationWrong, foundationFeedback, foundationHint, id)
      : claims(recipe[0], 'Pon a prueba la idea', foundationBody, foundationCorrect, d.foundationWrong, foundationFeedback, foundationHint, id);

    const caseBody = `${c.scene}\n\n¿Qué interpretación de la situación está justificada?`;
    const caseCorrect = sentences(teaching.caseBody);
    const caseFeedback = `${teaching.caseBody} ${c.explanation}`;
    const caseHint = 'Separa el dato del caso de la conclusión que permite; revisa qué condición seguiría sin comprobarse.';
    lesson.steps[3] = recipe[1] === 'choice'
      ? select('Razona sobre el caso', caseBody, caseCorrect[0], d.caseWrong, caseFeedback, caseHint, id + 1)
      : claims(recipe[1], 'Comprueba las lecturas del caso', caseBody, caseCorrect.slice(0, recipe[1] === 'all' ? 2 : 1), d.caseWrong, caseFeedback, caseHint, id + 1);

    const nuanceBody = `${s.scene}\n\nEvalúa las conclusiones con los datos indicados. No supongas que una cifra aislada describe toda la situación.`;
    const nuanceFeedback = `${s.correct} ${remaining(teaching.nuanceBody)}`;
    const nuanceHint = 'Relaciona el cambio observado con su causa y con la información que aún falta.';
    if (recipe[2] === 'diagram') {
      lesson.steps[5] = causalMap('Conecta cada caso con su implicación', 'Completa los vínculos. Cada conclusión debe responder a la situación de su fila, conservando su base y condiciones.', [
        { label: `Caso aplicado → ${c.scene}`, correct: caseCorrect[0], wrong: d.caseWrong },
        { label: `Nueva situación → ${s.scene}`, correct: s.correct, wrong: d.nuanceWrong },
      ], `${remaining(teaching.caseBody)} ${nuanceFeedback}`, nuanceHint, id + 5);
    } else if (recipe[2] === 'choice') {
      lesson.steps[5] = select('Evalúa el matiz', nuanceBody, s.correct, d.nuanceWrong, nuanceFeedback, nuanceHint, id + 5);
    } else {
      lesson.steps[5] = claims(recipe[2], 'Evalúa el matiz', nuanceBody, recipe[2] === 'all' ? [s.correct, remaining(teaching.nuanceBody)] : [s.correct], d.nuanceWrong, nuanceFeedback, nuanceHint, id + 5);
    }
    if (lesson.steps[7].type !== 'numeric') lesson.steps[7] = evidence(recipe[3], s, d, teaching, id);

    const special = earlySpecialChallenges[id];
    if (special) {
      if (lesson.steps[special.slot].type === 'numeric') throw Error(`Un formato cualitativo sustituiría un cálculo: ${id}`);
      lesson.steps[special.slot] = clone(special.exercise);
    }
    const kinds = new Set(lesson.steps.filter(step => step.type !== 'learn').map(step => step.activity?.kind || step.type));
    if (kinds.size < 3) {
      // A special activity may replace the only format of its kind. Use the
      // foundation's genuine multiple-selection task to restore variety.
      lesson.steps[1] = claims('all', 'Pon a prueba la idea', foundationBody, foundationCorrect, d.foundationWrong, foundationFeedback, foundationHint, id);
    }
    const finalKinds = new Set(lesson.steps.filter(step => step.type !== 'learn').map(step => step.activity?.kind || step.type));
    if (finalKinds.size < 3) throw Error(`Menos de tres dinámicas en Acciones ${id}`);
  }
  for (const exam of result.exams.filter(e => e.id >= 49 && e.id <= 69)) {
    exam.steps = exam.steps.map((step, index) => {
      if (step.type === 'numeric') return step;
      const id = exam.id * 10 + index, s = earlySituations[id], d = earlyChallengeData[id], teaching = earlyProgressionTeaching[id];
      const check = index % 3 === 1;
      if (!d.examScene) throw Error(`Falta un escenario propio de examen: ${id}`);
      const body = check
        ? `${d.examScene}\n\n¿Qué comprobación contiene la información necesaria para resolver esta duda?`
        : `${d.examScene}\n\n¿Qué conclusión está justificada, conservando la base y las condiciones de la situación?`;
      const exercise = select(check ? 'Contrasta una interpretación' : 'Defiende la conclusión', body, check ? s.evidence : s.correct, check ? d.evidenceWrong : d.nuanceWrong, check ? `${s.evidence} ${remaining(teaching.checkBody)}` : `${s.correct} ${remaining(teaching.nuanceBody)}`, '', id + exam.id);
      exercise.reviewLesson = step.reviewLesson;
      delete exercise.hint;
      return exercise;
    });
  }
  return result;
}
