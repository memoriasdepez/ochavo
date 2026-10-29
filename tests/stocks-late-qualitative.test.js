import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileRevision,parseAuthoring,calculate} from '../scripts/course-authoring.mjs';
import {refineStocks} from '../scripts/stocks-editorial/refine.mjs';
import {refineLateWorlds,lateNumericIds} from '../scripts/stocks-editorial/worlds-26-50.mjs';
import {investigations} from '../scripts/stocks-editorial/late-investigations.mjs';
import {lateTeaching} from '../scripts/stocks-editorial/late-teaching.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const outline=JSON.parse(read('src/content/stocks-outline-v2.json'));
const records=parseAuthoring(Array.from({length:5},(_,i)=>read(`src/content/stocks-v2-authoring/part-${i+1}.txt`)),500);
const original=refineStocks(compileRevision({outline,records,start:450,sources:[]}),records,{depthTeaching:false,secondCorrections:false,compoundNotes:false,riskNotes:false,clearWriting:false,orderNotes:false});
const result=refineLateWorlds(structuredClone(original),records);
const lessons=result.lessons.filter(l=>l.id>=700);
const exams=result.exams.filter(e=>e.id>=70);
const kind=s=>s.activity?.kind||s.type;

test('all 250 late objectives have individual investigations and qualitative explanations',()=>{
  assert.deepEqual(Object.keys(investigations).map(Number),Array.from({length:250},(_,i)=>700+i));
  assert.deepEqual(Object.keys(lateTeaching).map(Number),Object.keys(investigations).map(Number));
  assert.equal(new Set(Object.values(investigations).map(p=>p.scene)).size,250);
  assert.equal(new Set(Object.values(lateTeaching)).size,250);
  for(const [id,p] of Object.entries(investigations)){
    assert.ok(lateTeaching[id].length>100,id);
    assert.ok(p.scene.length>30,id);
    assert.notEqual(p.action,p.shortcut,id);
    assert.ok(p.evidence.length>20,id);
  }
});

test('identities, prerequisites and the other worlds remain unchanged',()=>{
  assert.deepEqual(result.lessons.slice(0,250),original.lessons.slice(0,250));
  assert.deepEqual(result.exams.slice(0,25),original.exams.slice(0,25));
  assert.deepEqual(result.groups,original.groups);
  for(const l of lessons){
    const before=original.lessons.find(o=>o.id===l.id);
    assert.equal(l.title,before.title);
    assert.equal(l.prerequisite,before.prerequisite);
  }
});

test('every activity has teaching and neighbouring points vary their actual formats',()=>{
  let previous;
  for(const l of lessons){
    assert.equal(l.steps.length,8,l.id);
    const formats=[];
    for(let i=0;i<8;i+=2){
      assert.equal(l.steps[i].type,'learn',`${l.id}/${i}`);
      assert.ok(l.steps[i].body.length>60,`${l.id}/${i}`);
      const q=l.steps[i+1];formats.push(kind(q));
      assert.notEqual(q.type,'learn');
      assert.ok(q.explanation?.length>20,`${l.id}/${i+1}`);
      assert.ok(q.body?.length>6,`${l.id}/${i+1}`);
      if(q.type==='numeric')assert.equal(q.answer,calculate(q.calculation.operation,q.calculation.operands));
      if(q.type==='choice')assert.ok(q.answer>=0&&q.answer<q.options.length);
      if(q.type==='multi')assert.ok(q.answers.every(a=>a>=0&&a<q.options.length));
      for(const row of q.activity?.rows||[])assert.ok(row.answer>=0&&row.answer<row.options.length);
    }
    assert.ok(new Set(formats).size>=3,`${l.id}: ${formats}`);
    if(previous)assert.notDeepEqual(formats,previous,`${l.id}: adjacent repeated sequence`);
    previous=formats;
    assert.doesNotMatch(JSON.stringify(l),/undefined|NaN|\{[a-d]\}|Ya has usado esta cuenta al comparar situaciones|Dos situaciones, dos resultados/);
  }
});

test('the arithmetic quota is removed and all retained numeric questions teach a business measure',()=>{
  const direct=lessons.flatMap(l=>l.steps.filter(s=>s.type==='numeric'));
  assert.equal(direct.length,lateNumericIds.size);
  assert.ok(direct.length<100,'Fewer than one direct calculation for every ten exercises');
  for(const l of lessons){
    assert.equal(l.steps.filter(s=>s.type==='numeric').length,lateNumericIds.has(l.id)?1:0,l.id);
    assert.doesNotMatch(JSON.stringify(l.steps.filter(s=>s.type==='numeric')),/cuántas (?:notas|fuentes|preguntas|pistas)|cuántos (?:pasos|documentos)/i);
  }
  for(const id of [770,771,772,773,774,775,776,777,778,779,780,781,782,783,784,785,786,787,788,789])
    assert.equal(result.lessons.find(l=>l.id===id).steps.some(s=>s.type==='numeric'),false,id);
});

test('exams use new prompts, varied answer locations and one explicit reviewed objective per question',()=>{
  const positions=new Set();
  for(const exam of exams){
    assert.equal(exam.steps.length,10);
    assert.deepEqual(exam.steps.map(q=>q.reviewLesson),Array.from({length:10},(_,i)=>exam.id*10+i));
    for(const q of exam.steps){
      const lesson=result.lessons.find(l=>l.id===q.reviewLesson);
      assert.ok(lesson.steps.every(s=>s.body!==q.body),`${q.reviewLesson}: exam repeated practice`);
      assert.equal(q.hint,undefined);
      if(q.type==='choice'){
        assert.equal(q.options.length,3);
        assert.equal(new Set(q.options.map(o=>o.text)).size,3);
        positions.add(q.answer);
      }else assert.equal(q.answer,calculate(q.calculation.operation,q.calculation.operands));
    }
  }
  assert.deepEqual([...positions].sort(),[0,1,2]);
});
