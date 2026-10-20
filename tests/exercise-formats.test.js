import {fullCourseTestData} from './course-fixture.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FORMAT_LABELS,validateActivity,activeActivity,activityAnswered,activityCorrect,activityMarkup,activityAction,activityInput,normalizeWord} from '../src/exercise-formats.js';
import {emptySnapshot,sanitizeSnapshot} from '../src/progress.js';
import {TRACKS,trackForLesson} from '../src/tracks.js';
const lessons=JSON.parse(fullCourseTestData()['br-invest-lessons']);
const exercises=lessons.flatMap(l=>l.steps.flatMap((s,step)=>s.activity?[{lessonId:l.id,step,s,a:s.activity}]:[]));
const draft=()=>({choice:null,selected:[],matches:{},order:[],number:'',attempts:0,passed:false,hinted:false,vars:{}});
function answerThroughControls(a,d){
  activityMarkup(a,d);
  if(a.rows){
    for(const [i,r] of a.rows.entries()){
      if(a.kind==='classify'){activityAction(a,d,'focus',i);activityAction(a,d,'bucket',r.answer);}
      else if(a.kind==='truth')activityAction(a,d,'row',r.answer,i);
      else activityInput(a,d,'row',String(r.answer),i);
    }
  }else if(['all','grid','differences'].includes(a.kind))for(const v of a.answers)activityAction(a,d,'toggle',v);
  else if(a.kind==='sort'){
    for(const [target,v] of a.answer.entries())activityAction(a,d,'drop',d.order.indexOf(v),target);
  }else if(a.kind==='build')for(const v of a.answer)activityAction(a,d,'append',v);
  else if(a.kind==='short')activityInput(a,d,typeof a.answer==='number'?'number':'word',typeof a.answer==='number'?String(a.answer).replace('.',','):normalizeWord(a.answer).toUpperCase());
  else if(a.kind==='slider')activityInput(a,d,'slider',String(a.answer));
  else if(a.kind==='interval')a.answer.forEach((v,i)=>activityInput(a,d,'row',String(v),i));
  else if(a.kind==='allocate')for(const [i,count] of a.answer.entries())for(let n=0;n<count;n++)activityAction(a,d,'plus',i);
  else activityAction(a,d,'choose',a.answer);
}
function makeWrong(a,d){
  if(a.rows){d.matches[0]=String((a.rows[0].answer+1)%a.rows[0].options.length);}
  else if(['all','grid','differences'].includes(a.kind)){const v=a.answers[0];d.selected=d.selected.filter(x=>x!==v);if(!d.selected.length)d.selected=[a.options.findIndex((_,i)=>!a.answers.includes(i))];}
  else if(['sort','build'].includes(a.kind))[d.order[0],d.order[1]]=[d.order[1],d.order[0]];
  else if(a.kind==='short'){if(typeof a.answer==='number')d.number=String(a.answer+10);else d.vars.exerciseText='respuesta equivocada';}
  else if(a.kind==='slider')d.number=String(a.answer===a.min?a.max:a.min);
  else if(a.kind==='interval')d.matches[0]=String((a.answer[0]+1)%a.options.length);
  else if(a.kind==='allocate'){const from=d.vars.exerciseAlloc.findIndex(v=>v>0),to=(from+1)%a.labels.length;d.vars.exerciseAlloc[from]--;d.vars.exerciseAlloc[to]++;}
  else d.choice=(a.answer+1)%a.options.length;
}
test('formats fit their authored paths and all twenty remain covered globally',()=>{
 assert.equal(Object.keys(FORMAT_LABELS).length,20);
 const unchanged=lessons.slice(0,450);
 for(const l of unchanged)assert.ok(l.steps.filter(s=>s.activity).length>=1&&l.steps.filter(s=>s.activity).length<=2);
 assert.equal(new Set(exercises.map(x=>x.a.kind)).size,20,'All twenty interactions remain supported by real course content');
 for(const t of TRACKS){const kinds=new Set(t.lessonIds.flatMap(id=>lessons[id].steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)));assert.ok(kinds.size>=(t.id==='technical'?12:9),t.id+' needs varied authored interactions');}
 for(const t of TRACKS)for(const id of t.lessonIds){const l=lessons[id];assert.ok(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>s.activity?.kind||s.type)).size>=3,`Interaction variety ${id}`);}
});
for(const kind of Object.keys(FORMAT_LABELS)){
  test(kind+': real curriculum answers can be entered, graded and recovered after sanitization; wrong answers fail',()=>{
    for(const {lessonId,step,s,a} of exercises.filter(x=>x.a.kind===kind)){
      assert.equal(validateActivity(a),true);
      const d=draft();assert.equal(activeActivity(s,d),a);
      const markup=activityMarkup(a,d);assert.ok(markup.includes('data-exercise-kind="'+kind+'"'));
      assert.equal(activityAnswered(a,d),false,`Untouched ${lessonId}/${step}`);
      answerThroughControls(a,d);assert.equal(activityAnswered(a,d),true,`Answered ${lessonId}/${step}`);assert.equal(activityCorrect(a,d),true,`Correct ${lessonId}/${step}`);
      const packed={c:d.choice,s:d.selected,m:d.matches,o:d.order,n:d.number,v:d.vars};
      const clean=sanitizeSnapshot({...emptySnapshot(),track:trackForLesson(lessonId).id,sessions:[[lessonId,step,lessons[lessonId].steps.map((_,i)=>i===step?packed:{})]],activeId:lessonId});
      const p=clean.sessions[0][2][step],restored={...draft(),choice:p.c??null,selected:p.s||[],matches:p.m||{},order:p.o||[],number:p.n||'',vars:p.v||{}};
      assert.equal(activeActivity(s,restored),a);assert.equal(activityCorrect(a,restored),true,`Recovered ${lessonId}/${step}`);
      makeWrong(a,restored);assert.equal(activityCorrect(a,restored),false,`Wrong ${lessonId}/${step}`);
    }
  });
}
test('old selected, passed and unconfirmed charged drafts keep their original exercise and answer',()=>{
  const s=exercises.find(x=>x.s.type==='choice').s;
  for(const old of [{choice:s.answer},{passed:true},{gameAttemptId:'10000000-0000-4000-8000-000000000001'},{hinted:true},{order:[0,1,2]},{matches:{0:'1'}},{number:'42'}]){
    const d={...draft(),...old};assert.equal(activeActivity(s,d),null);assert.equal(d.vars.exerciseKind,undefined);
  }
});
test('optional clues count as help without submitting an answer or consuming a life',()=>{
  const {a,s}=exercises.find(x=>x.a.kind==='clues'),d=draft();activeActivity(s,d);
  activityAction(a,d,'clue','');assert.equal(d.hinted,true);assert.equal(d.vars.exerciseClues,1);assert.equal(activityAnswered(a,d),false);
  for(let i=0;i<10;i++)activityAction(a,d,'clue','');assert.equal(d.vars.exerciseClues,a.clues.length);
});
test('allocation cannot exceed the budget or go below zero; partial allocation cannot be graded',()=>{
  const {a}=exercises.find(x=>x.a.kind==='allocate'),d=draft();
  assert.equal(activityAction(a,d,'minus',0),false);
  for(let i=0;i<a.budget+5;i++)activityAction(a,d,'plus',0);
  assert.equal(d.vars.exerciseAlloc.reduce((x,y)=>x+y),a.budget);
  activityAction(a,d,'minus',0);assert.equal(activityAnswered(a,d),false);
});
test('short answers normalize accents but cannot store profile information or arbitrary script',()=>{
  const clean=sanitizeSnapshot({...emptySnapshot(),sessions:[[0,1,[{},{v:{exerciseKind:'short',exerciseText:'acción',exerciseAlloc:[1,2],exerciseFocus:99}},{},{},{},{},{},{}]]]});
  assert.deepEqual(clean.sessions[0][2][1].v,{exerciseKind:'short',exerciseText:'acción'});
  for(const word of ['name@example.test','<script>','\u0000']){
    const p=sanitizeSnapshot({...emptySnapshot(),sessions:[[0,1,[{},{v:{exerciseKind:'short',exerciseText:word}},{},{},{},{},{},{}]]]});
    assert.equal(p.sessions[0][2][1].v.exerciseText,undefined);
  }
});
test('activity data and entered words are escaped when rendered',()=>{
  const a={kind:'short',title:'x',prompt:'x',instruction:'<script>',answer:'x'},d=draft();d.vars.exerciseText='" onfocus="evil';
  const markup=activityMarkup(a,d);assert.ok(markup.includes('&lt;script&gt;'));assert.ok(!markup.includes('<script>'));assert.ok(markup.includes('&quot; onfocus=&quot;evil'));
});
test('interval endpoints must be in order and unknown actions cannot corrupt answers',()=>{
  const {a}=exercises.find(x=>x.a.kind==='interval'),d=draft();activityInput(a,d,'row','3',0);activityInput(a,d,'row','0',1);assert.equal(activityAnswered(a,d),false);
  const before=JSON.stringify(d);assert.equal(activityInput(a,d,'row','100',0),false);assert.equal(activityAction(a,d,'bogus',0),false);assert.equal(JSON.stringify(d),before);
});
