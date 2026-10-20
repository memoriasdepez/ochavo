import {beforeOpening,beforeOpeningFile} from './opening-test-utils.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {emptySnapshot,makeEnvelope,mergeProgress} from '../src/progress.js';
import {TRACKS} from '../src/tracks.js';
import {mount,openLesson,lessons,exams} from './current-course-harness.js';
import {fullCourseTestData} from './course-fixture.js';
import {interpretationCases} from '../scripts/technical-authoring/interpretation-cases.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const baseline=JSON.parse(read('tests/fixtures/reasoning-revision-baseline.json'));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const course=JSON.parse(fullCourseTestData()['br-course']);
const kind=s=>s.activity?.kind||s.type;

test('the editorial change preserves historical content, introductory worlds and all stable identities',()=>{
 assert.equal(hash(lessons.slice(0,450)),baseline.historicalLessons);
 assert.equal(hash(exams.slice(0,45)),baseline.historicalExams);
 assert.equal(hash(lessons.slice(450,460).map(beforeOpening)),baseline.stocksFirstWorld);
 assert.equal(hash(exams[45]),baseline.stocksFirstExam);
 assert.equal(hash(lessons.slice(1450,1480)),baseline.technicalFirstWorlds);
 assert.equal(hash(exams.slice(145,148)),baseline.technicalFirstExams);
 assert.equal(hash(lessons.map(x=>[x.id,x.title,x.prerequisites])),baseline.titles);
 assert.equal(hash(course.groups),baseline.groups);
});

test('Stocks world two teaches interpretation, evidence and decisions alongside six useful calculations',()=>{
 const world=lessons.slice(460,470).map(beforeOpening),practices=world.flatMap(l=>l.steps.filter(s=>s.type!=='learn'));
 assert.equal(practices.length,40);
 assert.equal(practices.filter(s=>s.type==='numeric').length,6);
 assert.equal(new Set(world.map(l=>l.steps.filter(s=>s.type!=='learn').map(kind).join(','))).size,10);
 const topics=[/recupera.*pagaste/s,/no garantiza|no asegura/s,/recursos de la empresa/s,/mismos componentes/s,/base|invertid/s,/realizad|cerrad/s,/comision/s,/reinver/s,/dividendo|reparto/s,/comision|gasto/s];
 for(const [i,l]of world.entries()){
  assert.match(l.steps.filter(s=>s.type==='learn').map(s=>s.body).join('\n'),topics[i]);
  for(let j=0;j<8;j+=2){assert.equal(l.steps[j].type,'learn');assert.ok(l.steps[j].body.length>100);assert.ok(l.steps[j+1].explanation.length>30);}
  assert.doesNotMatch(JSON.stringify(l.steps),/Dos situaciones, dos resultados|Compara sin confundir las bases|Resuelve A y B/);
 }
 assert.equal(exams[46].steps.length,10);
 assert.equal(exams[46].steps.filter(s=>s.type==='numeric').length,3);
 for(const s of exams[46].steps)assert.ok(!practices.some(p=>p.body===s.body),'Exam must use a new question');
});

test('technical worlds formerly repeating chart calculations now include 120 distinct interpretations',()=>{
 const cases=Object.values(interpretationCases).flat();
 assert.equal(cases.length,120);assert.equal(new Set(cases).size,120);
 let numeric=0;
 for(let id=1480;id<1600;id++){
  const l=lessons[id],scene=interpretationCases[Math.floor((id-1450)/10)+1][id%10].split('|')[0];
  assert.ok(l.steps.some(s=>s.type!=='learn'&&s.body.includes(scene)),`Missing contextual interpretation ${id}`);
  assert.ok(l.steps.some(s=>s.type!=='learn'&&(s.figure?.candles||s.activity?.candles)),`Chart practice missing ${id}`);
  assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(kind)).size>=3);
  numeric+=l.steps.filter(s=>s.type==='numeric').length;
 }
 assert.equal(numeric,21);
});

test('revision metadata is available before fetching a world, so stale answers never reach new questions',()=>{
 const html=read('index.html');
 for(const [slot,full]of [['br-invest-lessons',lessons],['br-exams',exams]]){
  const meta=JSON.parse(html.match(new RegExp('<script[^>]*id="'+slot+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
  for(const t of TRACKS)for(const id of slot==='br-exams'?t.groupIds:t.lessonIds){
   assert.equal(meta[id].editorialRevision,full[id].editorialRevision,`${slot}/${id}`);
  }
 }
});

test('all four paths restart incompatible attempts without deleting completion or exam history',()=>{
 for(const id of [460,950,1150,1480,1600]){
  const track=TRACKS.find(t=>t.lessonIds.includes(id)),prior=track.lessonIds.filter(n=>n<id);
  const completed=Object.fromEntries([...prior,0,450].map(n=>[n,{firstTry:3}]));
  const passedExams=Object.fromEntries(track.groupIds.filter(n=>n<Math.floor(id/10)).map(n=>[n,{best:9,attempts:1,passed:true}]));
  const old=[id,5,Array.from({length:8},(_,i)=>i%2?{c:0,p:1,a:2}:i===0?{v:{contentRevision:'old-edition'}}:{})];
  const snapshot={...emptySnapshot(),track:track.id,group:Math.floor(id/10),activeId:id,activeByTrack:{[track.id]:id},completed,passedExams,sessions:[old]};
  const cloud=mergeProgress(null,makeEnvelope(snapshot,null,100)).snapshot,app=mount(cloud);
  openLesson(app,id);
  const saved=app.saved.sessions.find(s=>s[0]===id);
  assert.equal(saved[1],0);assert.equal(saved[2][0].v.contentRevision,lessons[id].editorialRevision);
  assert.ok(saved[2].every(d=>d.c===undefined&&!d.p));
  assert.deepEqual(app.saved.completed,cloud.completed);assert.deepEqual(app.saved.passedExams,cloud.passedExams);
  const resumed=structuredClone(app.saved),draft=resumed.sessions.find(s=>s[0]===id);draft[1]=1;
  const again=mount(resumed);openLesson(again,id);assert.equal(again.course.reportContext().stepIndex,1);
 }
});

test('an untagged attempt in unchanged technical introductory content still resumes',()=>{
 const id=1450,sessions=[[id,3,Array.from({length:8},()=>({}))]];
 const app=mount({...emptySnapshot(),track:'technical',group:145,activeId:id,activeByTrack:{technical:id},sessions});
 openLesson(app,id);assert.equal(app.course.reportContext().stepIndex,3);
});
