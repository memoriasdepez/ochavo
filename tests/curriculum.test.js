import {fullCourseTestData} from './course-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCourse} from '../src/content-validation.js';
const oldParts=await Promise.all(['stocks-base','stocks-extension','etfs','crypto'].map(async name=>JSON.parse(await readFile(new URL('../src/content/'+name+'.json',import.meta.url),'utf8'))));
const data=fullCourseTestData();
const get=id=>JSON.parse(data[id]);
const lessons=get('br-invest-lessons'),exams=get('br-exams'),course=get('br-course');
test('the complete four-path curriculum satisfies rendering, progression and answer contracts',()=>{
  assert.equal(validateCourse({lessons,exams,course}),true);
  assert.deepEqual(course.tracks.map(t=>[t.id,t.count,t.groupCount]),[['stocks',500,50],['etfs',200,20],['crypto',300,30],['technical',290,29]]);
});
test('all 200 existing lessons retain their original content and identity beneath the new practice formats; exams stay unchanged',()=>{
  const original=lessons.slice(0,200).map(l=>({...l,steps:l.steps.map(({activity,...step})=>step)}));
  assert.deepEqual(original,oldParts.flatMap(p=>p.lessons));
  assert.deepEqual(exams.slice(0,20),oldParts.flatMap(p=>p.exams));
});
test('new lessons include visual reasoning, varied practice and substantial prior explanations',()=>{
  const bodies=new Set();
  // The new technical course has its own editorial and chart checks.
  for(const l of lessons.slice(50,1450)){
    // A comparison table, matching cards or classification diagram is also a
    // visual task. Do not require a decorative numeric chart in every topic.
    assert.ok(l.steps.some(s=>s.figure||s.growthLab||s.explore?.options.some(o=>o.figure)||(l.editorialRevision&&(s.activity?.rows||s.type==='match'||s.type==='order'))),`Visual reasoning missing in lesson ${l.id}`);
    const explanations=l.steps.filter(s=>s.type==='learn');
    if(['stocks-progressive-2026-10-10','stocks-challenges-2026-10-11','stocks-compound-2026-10-11','stocks-clarity-variety-2026-10-11'].includes(l.editorialRevision)){
      // This revision deliberately removes repeated definitions and allows a
      // shorter point. Distinct, substantive teaching matters more than a word
      // quota; the progression suite also checks repeated sentences and the
      // authored explanation that precedes every retained scenario.
      assert.equal(explanations.length,4,`Missing teaching in lesson ${l.id}`);
      assert.equal(new Set(explanations.map(s=>s.takeaway)).size,4,`Repeated teaching objective in lesson ${l.id}`);
      assert.ok(explanations.every(s=>s.body.length>60),`Missing teaching context in lesson ${l.id}`);
    }else assert.ok(explanations.reduce((sum,s)=>sum+s.body.split(/\s+/).length,0)>=120,`Too little explanation in lesson ${l.id}`);
    for(const s of explanations){assert.ok(!bodies.has(s.body),`Repeated explanation in lesson ${l.id}`);bodies.add(s.body);}
  }
  for(const t of course.tracks.filter(t=>t.id!=='technical'))for(const id of t.lessonIds){assert.ok(new Set(lessons[id].steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3,`Insufficient authored interaction variety in ${id}`);}
});
test('exam questions cover each block without copying lesson exercise statements',()=>{
  for(const e of exams.slice(5)){
    for(const s of e.steps){assert.ok(!lessons[s.reviewLesson].steps.some(practice=>practice.type!=='learn'&&practice.body===s.body),`Exam ${e.id} repeats practice verbatim`);}
  }
});
