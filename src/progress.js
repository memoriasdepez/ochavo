/** JSON-only progress; account identifiers and profile information never belong here. */
import {TRACKS,trackForLesson,trackForExam,isArchivedLesson,isArchivedWorld,LESSON_COUNT,WORLD_COUNT,CASE_IDS} from './tracks.js';
import {FORMAT_LABELS} from './exercise-formats.js';
const LESSONS = LESSON_COUNT;
const EXAMS = WORLD_COUNT;
const STEPS = 8;
const QUESTIONS = 10;
const MAX_ATTEMPTS = 1_000_000;
const MAX_TIME = Number.MAX_SAFE_INTEGER;
const CASE_STEPS = 6;
const caseTrack = value => typeof value === 'string' && CASE_IDS.includes(value) ? trackForExam(Number(value.slice(5))-1)?.id : null;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

// Read only own data properties: inherited properties and accessors are not input.
function own(value, key) {
  if (value === null || typeof value !== 'object') return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const id = (value, count) => integer(value, 0, count - 1);
const timestamp = value => integer(value, 0, MAX_TIME) ? value : 0;
const attempts = value => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, MAX_ATTEMPTS) : 0;
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function indices(value, max, permutation = false) {
  if (!Array.isArray(value) || value.length > max) return [];
  const result = [];
  for (let i = 0; i < value.length; i++) {
    const n = own(value, i);
    if (!id(n, max) || result.includes(n)) return [];
    result.push(n);
  }
  if (permutation && result.some(n => n >= result.length)) return [];
  return result;
}

const VARIABLE_RANGES = {
  owned: [1, 30], price: [10, 500], sell: [70, 140], dividend: [0, 10],
  inflation: [0, 10], drop: [5, 70], tech: [0, 100], years: [1, 30],
  fee: [0, 2], cost: [40, 95], collected: [6, 20], rate: [4, 20],
};

function sanitizeVars(input) {
  const output = {};
  if (!record(input)) return output;
  const contentRevision=own(input,'contentRevision');
  if(typeof contentRevision==='string'&&/^[a-z0-9-]{1,48}$/.test(contentRevision))output.contentRevision=contentRevision;
  for (const [key, [min, max]] of Object.entries(VARIABLE_RANGES)) {
    const value = own(input, key);
    if (typeof value === 'number' && Number.isFinite(value)) output[key] = Math.min(max, Math.max(min, value));
  }
  const fund = own(input, 'fund');
  if (['global', 'sector', 'single'].includes(fund)) output.fund = fund;
  const evidence = own(input, 'evidence');
  if (['business', 'value', 'risk'].includes(evidence)) output.evidence = evidence;
  const explore = own(input, 'explore');
  if (integer(explore, 0, 2)) output.explore = explore;
  const order = indices(own(input, 'matchOrder'), 4, true);
  if (order.length) output.matchOrder = order;
  const matchFocus=own(input,'matchFocus');
  if(integer(matchFocus,0,3))output.matchFocus=matchFocus;
  const kind=own(input,'exerciseKind');
  if(typeof kind==='string'&&Object.hasOwn(FORMAT_LABELS,kind)){
    output.exerciseKind=kind;
    if(own(input,'exerciseTouched')===1)output.exerciseTouched=1;
    const focus=own(input,'exerciseFocus'),clues=own(input,'exerciseClues');
    if(integer(focus,0,3))output.exerciseFocus=focus;
    if(integer(clues,0,4))output.exerciseClues=clues;
    const word=own(input,'exerciseText');
    if(kind==='short'&&typeof word==='string'&&/^[\p{L}\p{N} .,+'’\-]*$/u.test(word))output.exerciseText=word.slice(0,48);
    const allocation=own(input,'exerciseAlloc');
    if(kind==='allocate'&&Array.isArray(allocation)&&allocation.length>=2&&allocation.length<=4){
      const values=Array.from({length:allocation.length},(_,i)=>own(allocation,i));
      if(values.every(v=>integer(v,0,20))&&values.reduce((a,b)=>a+b,0)<=20)output.exerciseAlloc=values;
    }
  }
  return output;
}

function sanitizeDraft(input, exam = false) {
  const output = {};
  if (!record(input)) return output;
  const choice = own(input, 'c');
  if (id(choice, 4)) output.c = choice;
  const selected = indices(own(input, 's'), 4);
  if (selected.length) output.s = selected;
  const matches = own(input, 'm');
  if (record(matches)) {
    const clean = {};
    for (let i = 0; i < 4; i++) {
      const value = own(matches, String(i));
      if (value === '' || /^[0-3]$/.test(typeof value === 'string' ? value : '')) clean[i] = value;
      else if (id(value, 4)) clean[i] = String(value);
    }
    if (Object.keys(clean).length) output.m = clean;
  }
  const order = indices(own(input, 'o'), 4, true);
  if (order.length) output.o = order;
  const number = own(input, 'n');
  // This is a number-entry field, not a free-text/profile field. Keep unfinished numeric input.
  if (typeof number === 'string' && /^[0-9.,+\- \u00a0]*$/.test(number)) {
    const limited = number.slice(0, 32);
    if (limited) output.n = limited;
  }
  if (!exam) {
    const count = attempts(own(input, 'a'));
    if (count) output.a = count;
    if (own(input, 'p') === 1) output.p = 1;
    if (own(input, 'h') === 1) output.h = 1;
  }
  const vars = sanitizeVars(own(input, 'v'));
  if (Object.keys(vars).length) output.v = vars;
  const attempt = own(input, 'q');
  if (uuid(attempt)) output.q = attempt;
  return output;
}

function drafts(value, count, exam = false) {
  if (!Array.isArray(value) || value.length !== count) return null;
  return Array.from({ length: count }, (_, i) => sanitizeDraft(own(value, i), exam));
}

function sanitizeSession(input) {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const lesson = own(input, 0);
  const step = own(input, 1);
  // Points 4 and 13 have ten screens. Keep historical eight-screen attempts so the
  // course can identify and restart only the incompatible editorial revision.
  const rawDrafts=own(input,2);
  const count=[453,462,471].includes(lesson)&&Array.isArray(rawDrafts)&&rawDrafts.length===10?10:STEPS;
  const answers = drafts(rawDrafts, count);
  return id(lesson, LESSONS) && id(step, count) && answers ? [lesson, step, answers] : null;
}

function sanitizeCaseSession(input) {
  if (!Array.isArray(input) || input.length !== 3) return null;
  const caseId = own(input, 0), step = own(input, 1);
  const answers = drafts(own(input, 2), CASE_STEPS);
  return caseTrack(caseId) && id(step, CASE_STEPS) && answers ? [caseId, step, answers] : null;
}

function sanitizeExam(input) {
  if (!record(input)) return null;
  const exam = own(input, 'id');
  const step = own(input, 'step');
  const order = indices(own(input, 'order'), QUESTIONS, true);
  const answers = drafts(own(input, 'drafts'), QUESTIONS, true);
  if (!id(exam, EXAMS) || !id(step, QUESTIONS) || order.length !== QUESTIONS || !answers) return null;
  const score = own(input, 'score');
  const submitted = own(input, 'submitted') === true && integer(score, 0, QUESTIONS);
  const output = { id: exam, step, order, drafts: answers, submitted };
  if (submitted) output.score = score;
  const attempt = own(input, 'attemptId');
  if (uuid(attempt)) output.attemptId = attempt;
  const pending = own(input, 'pendingSubmit');
  if (typeof pending === 'boolean') output.pendingSubmit = pending && !submitted && Boolean(output.attemptId);
  return output;
}

function mapTarget(value) {
  if (typeof value !== 'string') return null;
  const match = /^br-(point|world|exam)-(0|[1-9]\d*)$/.exec(value);
  return match && id(Number(match[2]), match[1] === 'point' ? LESSONS : EXAMS) ? value : null;
}

/** A fresh snapshot matching invest-engine.js save() version 5. */
export function emptySnapshot() {
  return { version: 5, stocksRevision:TRACKS[0].revision, track:'stocks', page: 'map', group: TRACKS[0].groupStart, mapTarget: null, introSkipped:false, completed: {}, sessions: [], activeId: null, activeByTrack:{}, passedExams: {}, exam: null, examSessions:{}, archivedExamSessions:{}, completedCases:{}, caseSessions:[], activeCaseId:null };
}

/** Copy an untrusted v5 snapshot using bounded, explicit fields only. Invalid versions become empty. */
export function sanitizeSnapshot(input) {
  const output = emptySnapshot();
  if (!record(input) || own(input, 'version') !== 5) return output;
  output.introSkipped = own(input,'stocksRevision')===TRACKS[0].revision && own(input, 'introSkipped') === true;
  const selected=TRACKS.find(t=>t.id===own(input,'track'))||TRACKS[0];
  output.track=selected.id;
  const page = own(input, 'page');
  if (['map', 'library', 'lab', 'cases', 'profile'].includes(page)) output.page = page;
  const group = own(input, 'group');
  output.group = id(group,EXAMS)&&selected.groupIds.includes(group) ? group : selected.groupStart;
  // The redundant third technical world is retired, not a restart of this path.
  if(selected.id==='technical'&&group===147&&selected.groupIds.includes(148))output.group=148;
  output.mapTarget = mapTarget(own(input, 'mapTarget'));
  if(selected.id==='technical'&&selected.groupIds.includes(148)&&!selected.groupIds.includes(147)){
    if(/^br-point-147\d$/.test(output.mapTarget||''))output.mapTarget='br-point-1480';
    else if(output.mapTarget==='br-world-147'||output.mapTarget==='br-exam-147')output.mapTarget='br-world-148';
  }
  if(output.mapTarget){const [,kind,n]=/^br-(point|world|exam)-(\d+)$/.exec(output.mapTarget);if(!(kind==='point'?selected.lessonIds:selected.groupIds).includes(Number(n)))output.mapTarget=null;}
  const completed = own(input, 'completed');
  for (let i = 0; i < LESSONS; i++) {
    const value = own(completed, String(i));
    if (record(value)) {
      const firstTry = own(value, 'firstTry');
      output.completed[i] = { firstTry: integer(firstTry, 0, [453,462,471].includes(i)?5:4) ? firstTry : 0 };
    }
  }
  const passedExams = own(input, 'passedExams');
  for (let i = 0; i < EXAMS; i++) {
    const value = own(passedExams, String(i));
    const best = own(value, 'best');
    if (record(value) && integer(best, 0, QUESTIONS)) output.passedExams[i] = { best, attempts: attempts(own(value, 'attempts')), passed: best >= 8 };
  }
  const sessions = own(input, 'sessions');
  const byId = new Map();
  if (Array.isArray(sessions)) {
    for (let i = 0; i < Math.min(sessions.length, LESSONS); i++) {
      const session = sanitizeSession(own(sessions, i));
      if (session) byId.set(session[0], session);
    }
  }
  output.sessions = [...byId.values()].sort((a, b) => a[0] - b[0]);
  const completedCases = own(input, 'completedCases');
  for (const caseId of CASE_IDS) {
    const value = own(completedCases, caseId);
    if (record(value)) {
      const firstTry = own(value, 'firstTry');
      output.completedCases[caseId] = {firstTry:integer(firstTry,0,3)?firstTry:0};
    }
  }
  const caseSessions = own(input, 'caseSessions'), casesById = new Map();
  if (Array.isArray(caseSessions)) for (let i=0;i<Math.min(caseSessions.length,CASE_IDS.length);i++) {
    const session=sanitizeCaseSession(own(caseSessions,i));
    if(session) casesById.set(session[0],session);
  }
  output.caseSessions=CASE_IDS.filter(caseId=>casesById.has(caseId)).map(caseId=>casesById.get(caseId));
  const activeCaseId=own(input,'activeCaseId');
  if(caseTrack(activeCaseId)&&casesById.has(activeCaseId)) output.activeCaseId=activeCaseId;
  const active = own(input, 'activeId');
  for(const track of TRACKS){
    const candidate=own(own(input,'activeByTrack'),track.id);
    if(track.lessonIds.includes(candidate)&&byId.has(candidate))output.activeByTrack[track.id]=candidate;
    const pending=sanitizeExam(own(own(input,'examSessions'),track.id));
    if(pending&&track.groupIds.includes(pending.id))output.examSessions[track.id]=pending;
  }
  // The selected path's legacy aliases remain authoritative, including explicit removals.
  if(id(active,LESSONS)&&byId.has(active)&&selected.lessonIds.includes(active)){output.activeId=active;output.activeByTrack[selected.id]=active;}
  else if(own(input,'activeId')===null)delete output.activeByTrack[selected.id];
  else output.activeId=output.activeByTrack[selected.id]??null;
  const activeExam=sanitizeExam(own(input,'exam'));
  if(activeExam&&selected.groupIds.includes(activeExam.id))output.examSessions[selected.id]=activeExam;
  else if(own(input,'exam')===null)delete output.examSessions[selected.id];
  output.exam=output.examSessions[selected.id]||null;
  for(let i=0;i<EXAMS;i++){
    if(!isArchivedWorld(i))continue;
    const archived=sanitizeExam(own(own(input,'archivedExamSessions'),String(i)));
    if(archived?.id===i)output.archivedExamSessions[i]=archived;
  }
  for(const candidate of [own(input,'exam'),...TRACKS.map(t=>own(own(input,'examSessions'),t.id))]){
    const archived=sanitizeExam(candidate);
    if(archived&&isArchivedWorld(archived.id))output.archivedExamSessions[archived.id]=archived;
  }
  return output;
}

function sanitizeEnvelope(input) {
  const valid = record(input) && own(input, 'schema') === 1;
  const snapshot = sanitizeSnapshot(valid ? own(input, 'snapshot') : null);
  const modifiedAt = valid ? timestamp(own(input, 'modifiedAt')) : 0;
  const sessionTimes = {};
  const times = valid ? own(input, 'sessionTimes') : null;
  for (let i = 0; i < LESSONS; i++) {
    const value = own(times, String(i));
    if (integer(value, 0, MAX_TIME)) sessionTimes[i] = Math.min(value, modifiedAt);
  }
  // Legacy/missing clocks fall back only for records that actually exist, never for absent sessions.
  for (const [lesson] of snapshot.sessions) if (!Object.hasOwn(sessionTimes, lesson)) sessionTimes[lesson] = modifiedAt;
  const examTimes={};
  for(const track of TRACKS){
    const raw=valid?own(own(input,'examTimes'),track.id):undefined;
    const legacy=track.id===snapshot.track&&valid?own(input,'examTime'):undefined;
    const time=integer(raw,0,MAX_TIME)?raw:integer(legacy,0,MAX_TIME)?legacy:snapshot.examSessions[track.id]?modifiedAt:0;
    examTimes[track.id]=Math.min(time,modifiedAt);
  }
  const examTime=examTimes[snapshot.track];
  const caseTimes={}, rawCaseTimes=valid?own(input,'caseTimes'):null;
  for(const caseId of CASE_IDS){const value=own(rawCaseTimes,caseId);if(integer(value,0,MAX_TIME))caseTimes[caseId]=Math.min(value,modifiedAt);}
  for(const [caseId] of snapshot.caseSessions)if(!Object.hasOwn(caseTimes,caseId))caseTimes[caseId]=modifiedAt;
  return { schema: 1, snapshot, modifiedAt, sessionTimes, examTime, examTimes, caseTimes };
}

/**
 * Attach edit clocks to a sanitized snapshot. previous is an envelope, not a snapshot.
 * Unchanged sessions keep their clocks; removed sessions keep a timestamp tombstone.
 * A backward device clock cannot make a new local edit older than its previous envelope.
 */
export function makeEnvelope(snapshot, previous = null, now = Date.now()) {
  const clean = sanitizeSnapshot(snapshot);
  const prior = sanitizeEnvelope(previous);
  const hasPrevious = record(previous) && own(previous, 'schema') === 1;
  if (hasPrevious && equal(clean, prior.snapshot)) return prior;
  const modifiedAt = Math.max(timestamp(now), hasPrevious ? Math.min(MAX_TIME, prior.modifiedAt + 1) : 0);
  const before = new Map(prior.snapshot.sessions.map(s => [s[0], s]));
  const after = new Map(clean.sessions.map(s => [s[0], s]));
  const sessionTimes = { ...prior.sessionTimes };
  for (let i = 0; i < LESSONS; i++) {
    if (!equal(before.get(i), after.get(i))) sessionTimes[i] = modifiedAt;
  }
  const examTimes={};
  for(const t of TRACKS)examTimes[t.id]=equal(clean.examSessions[t.id],prior.snapshot.examSessions[t.id])?prior.examTimes[t.id]:modifiedAt;
  const examTime=examTimes[clean.track];
  const beforeCases=new Map(prior.snapshot.caseSessions.map(s=>[s[0],s]));
  const afterCases=new Map(clean.caseSessions.map(s=>[s[0],s]));
  const caseTimes={...prior.caseTimes};
  for(const caseId of CASE_IDS)if(!equal(beforeCases.get(caseId),afterCases.get(caseId)))caseTimes[caseId]=modifiedAt;
  return { schema: 1, snapshot: clean, modifiedAt, sessionTimes, examTime, examTimes, caseTimes };
}

function choose(remote, local, remoteTime, localTime) {
  if (remoteTime !== localTime) return localTime > remoteTime ? local : remote;
  return local.modifiedAt >= remote.modifiedAt ? local : remote;
}

/**
 * Merge two schema-1 envelopes without mutating either. Achievements only increase.
 * Navigation follows modifiedAt; each session and the exam follow their own clocks.
 * Equal clocks use modifiedAt, then local. Persist JSON.stringify(result) as one Firestore string.
 */
export function mergeProgress(remote, local) {
  const r = sanitizeEnvelope(remote);
  const l = sanitizeEnvelope(local);
  const newest = choose(r, l, r.modifiedAt, l.modifiedAt);
  const snapshot = emptySnapshot();
  snapshot.introSkipped = r.snapshot.introSkipped || l.snapshot.introSkipped;
  snapshot.track=newest.snapshot.track;
  snapshot.page = newest.snapshot.page;
  snapshot.group = newest.snapshot.group;
  snapshot.mapTarget = newest.snapshot.mapTarget;
  const remoteSessions = new Map(r.snapshot.sessions.map(s => [s[0], s]));
  const localSessions = new Map(l.snapshot.sessions.map(s => [s[0], s]));
  const sessionTimes = {};
  for (let i = 0; i < LESSONS; i++) {
    const rc = own(r.snapshot.completed, String(i));
    const lc = own(l.snapshot.completed, String(i));
    if (rc || lc) snapshot.completed[i] = { firstTry: Math.max(rc?.firstTry ?? 0, lc?.firstTry ?? 0) };
    const rt = Object.hasOwn(r.sessionTimes, i);
    const lt = Object.hasOwn(l.sessionTimes, i);
    if (!rt && !lt) continue;
    const winner = !rt ? l : !lt ? r : choose(r, l, r.sessionTimes[i], l.sessionTimes[i]);
    sessionTimes[i] = winner.sessionTimes[i];
    const session = (winner === r ? remoteSessions : localSessions).get(i);
    if (!session) continue; // A newer removal wins over a stale pending draft.
    const track=trackForLesson(i).id;
    const activeReplay = newest.snapshot.activeByTrack[track] === i && winner.snapshot.activeByTrack[track] === i && Boolean(own(winner.snapshot.completed, String(i)));
    if (isArchivedLesson(i) || !own(snapshot.completed, String(i)) || activeReplay) snapshot.sessions.push(session);
  }
  for(const t of TRACKS){const active=newest.snapshot.activeByTrack[t.id];if(snapshot.sessions.some(s=>s[0]===active))snapshot.activeByTrack[t.id]=active;}
  snapshot.activeId=snapshot.activeByTrack[snapshot.track]??null;
  const remoteCases=new Map(r.snapshot.caseSessions.map(s=>[s[0],s]));
  const localCases=new Map(l.snapshot.caseSessions.map(s=>[s[0],s]));
  const caseTimes={};
  for(const caseId of CASE_IDS){
    const rc=own(r.snapshot.completedCases,caseId),lc=own(l.snapshot.completedCases,caseId);
    if(rc||lc)snapshot.completedCases[caseId]={firstTry:Math.max(rc?.firstTry??0,lc?.firstTry??0)};
    const rt=Object.hasOwn(r.caseTimes,caseId),lt=Object.hasOwn(l.caseTimes,caseId);
    if(!rt&&!lt)continue;
    const winner=!rt?l:!lt?r:choose(r,l,r.caseTimes[caseId],l.caseTimes[caseId]);
    caseTimes[caseId]=winner.caseTimes[caseId];
    const session=(winner===r?remoteCases:localCases).get(caseId);
    if(!session)continue;
    const replay=newest.snapshot.activeCaseId===caseId&&winner.snapshot.activeCaseId===caseId&&Boolean(own(winner.snapshot.completedCases,caseId));
    if(!own(snapshot.completedCases,caseId)||replay)snapshot.caseSessions.push(session);
  }
  if(snapshot.caseSessions.some(s=>s[0]===newest.snapshot.activeCaseId))snapshot.activeCaseId=newest.snapshot.activeCaseId;
  for (let i = 0; i < EXAMS; i++) {
    const re = own(r.snapshot.passedExams, String(i));
    const le = own(l.snapshot.passedExams, String(i));
    if (re || le) {
      const best = Math.max(re?.best ?? 0, le?.best ?? 0);
      snapshot.passedExams[i] = { best, attempts: Math.max(re?.attempts ?? 0, le?.attempts ?? 0), passed: best >= 8 };
    }
  }
  const examTimes={};
  for(const t of TRACKS){
    const winner=choose(r,l,r.examTimes[t.id],l.examTimes[t.id]);
    if(winner.snapshot.examSessions[t.id])snapshot.examSessions[t.id]=winner.snapshot.examSessions[t.id];
    examTimes[t.id]=Math.max(r.examTimes[t.id],l.examTimes[t.id]);
  }
  snapshot.exam=snapshot.examSessions[snapshot.track]||null;
  // Historical drafts never participate in current exam navigation or unlocking.
  // Prefer the newest complete historical snapshot when both devices carry it.
  const older=newest===r?l:r;
  snapshot.archivedExamSessions={...older.snapshot.archivedExamSessions,...newest.snapshot.archivedExamSessions};
  return { schema: 1, snapshot, modifiedAt: Math.max(r.modifiedAt, l.modifiedAt), sessionTimes, examTime:examTimes[snapshot.track],examTimes,caseTimes };
}
