import test from 'node:test';
import assert from 'node:assert/strict';
import {buildTechnical} from '../scripts/technical-authoring/build-300.mjs';
import {refineLateTechnicalReasoning,lateTechnicalCalculateTopics} from '../scripts/technical-authoring/late-reasoning-revision.mjs';
import {lateReasoningCases} from '../scripts/technical-authoring/late-reasoning-cases.mjs';
const original=buildTechnical();
const result=structuredClone(original);
refineLateTechnicalReasoning(result.lessons,result.exams);
const lessons=result.lessons.filter(l=>l.id>=1600);
const kind=s=>s.activity?.kind||s.type;

test('150 individual qualitative transfer cases cover every late technical objective',()=>{
  assert.deepEqual(Object.keys(lateReasoningCases).map(Number),Array.from({length:150},(_,i)=>1600+i));
  assert.equal(new Set(Object.values(lateReasoningCases).map(p=>p.scene)).size,150);
  for(const [id,p] of Object.entries(lateReasoningCases)){
    assert.ok(p.teaching.length>80,id);
    assert.ok(p.scene.length>25,id);
    assert.notEqual(p.right,p.wrong,id);
  }
});

test('the revision preserves stable identities, titles and candle chart tasks',()=>{
  assert.deepEqual(result.lessons.filter(l=>l.id<1600),original.lessons.filter(l=>l.id<1600));
  assert.deepEqual(result.exams.filter(e=>e.id<160),original.exams.filter(e=>e.id<160));
  for(const l of lessons){
    const before=original.lessons.find(v=>v.id===l.id);
    assert.equal(l.title,before.title);
    assert.deepEqual(l.prerequisites,before.prerequisites);
    assert.ok(l.steps.some(s=>s.type!=='learn'&&s.figure?.kind==='candles'),`${l.id}: lost candle task`);
  }
});

test('qualitative objectives no longer have a forced numeric input; mathematical objectives keep theirs',()=>{
  let total=0;
  for(const l of lessons){
    const local=l.id-1450,w=Math.floor(local/10)+1,j=local%10,keep=lateTechnicalCalculateTopics[w].includes(j);
    const count=l.steps.filter(s=>s.type==='numeric').length;
    assert.equal(count,keep?1:0,l.id);
    total+=count;
  }
  assert.ok(total<40);
  for(const id of [1640,1642,1646,1700,1702,1706,1710,1711,1712,1713,1714,1718,1720,1723,1724,1725,1728,1730,1734,1735,1738])
    assert.equal(result.lessons.find(l=>l.id===id).steps.some(s=>s.type==='numeric'),false,id);
});

test('all lessons explain first, vary formats and have valid answer references',()=>{
  let previous;
  for(const l of lessons){
    assert.equal(l.steps.length,8,l.id);
    const formats=[];
    for(let i=0;i<8;i+=2){
      assert.equal(l.steps[i].type,'learn',`${l.id}/${i}`);
      assert.ok(l.steps[i].body.length>60,`${l.id}/${i}`);
      const q=l.steps[i+1];formats.push(kind(q));
      assert.notEqual(q.type,'learn');
      assert.ok(q.explanation?.length>5,`${l.id}/${i+1}`);
      if(q.type==='choice')assert.ok(q.answer>=0&&q.answer<q.options.length,`${l.id}/${i+1}`);
      if(q.type==='multi')assert.ok(q.answers.every(n=>n>=0&&n<q.options.length));
      if(q.type==='numeric')assert.ok(Number.isFinite(q.answer));
      for(const row of q.activity?.rows||[])assert.ok(row.answer>=0&&row.answer<row.options.length);
    }
    assert.ok(new Set(formats).size>=3,`${l.id}: ${formats}`);
    if(previous)assert.notDeepEqual(formats,previous,l.id);
    previous=formats;
    assert.doesNotMatch(JSON.stringify(l),/undefined|NaN/);
  }
});

test('exam objectives remain aligned and cancelled numeric drills do not survive as numeric inputs',()=>{
  for(const exam of result.exams.filter(e=>e.id>=160)){
    assert.equal(exam.steps.length,10);
    for(let j=0;j<10;j++){
      const q=exam.steps[j],w=exam.id-144;
      assert.equal(q.reviewLesson,exam.id*10+j);
      if(!lateTechnicalCalculateTopics[w].includes(j))assert.notEqual(q.type,'numeric',q.reviewLesson);
      assert.equal(q.hint,undefined);
    }
  }
});
