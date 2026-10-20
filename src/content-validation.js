import {TRACKS,trackForLesson,trackForExam,LESSON_COUNT,WORLD_COUNT} from './tracks.js';
import {validateActivity} from './exercise-formats.js';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const text=v=>typeof v==='string'&&v.trim().length>0;
function figure(f,where){
  if(!f)return;
  if(f.candles){
    check(Array.isArray(f.candles)&&f.candles.length>=3&&f.candles.length<=30,where+' candle count');
    check(!(f.lineMode&&f.barMode),where+' unambiguous chart type');
    for(const c of f.candles)check(['o','h','l','c','v'].every(k=>Number.isFinite(c[k]))&&c.l>0&&c.h>c.l&&c.h>=Math.max(c.o,c.c)&&c.l<=Math.min(c.o,c.c)&&c.v>0,where+' valid OHLC prices');
    for(const line of [...f.overlays||[],...f.panel?.series||[]])check(line.values.length===f.candles.length&&line.values.every(v=>v===null||Number.isFinite(v)),where+' aligned indicator');
    if(f.provisionalIndex!==undefined)check(f.provisionalIndex===f.candles.length-1,where+' unfinished final period');
    if(f.comparison)figure(f.comparison,where+' comparison');
    return;
  }
  if(f.kind==='table'){check(Array.isArray(f.headers)&&f.headers.length>=2&&f.headers.every(text),where+' table headers');check(Array.isArray(f.rows)&&f.rows.length>0&&f.rows.every(r=>r.length===f.headers.length&&r.every(v=>typeof v==='number'||text(v))),where+' table rows');}
  else if(f.kind==='flow')check(Array.isArray(f.items)&&f.items.length>=1&&f.items.every(text),where+' flow');
  else check(Array.isArray(f.labels)&&f.labels.every(text)&&Array.isArray(f.values)&&f.values.length===f.labels.length&&f.values.every(Number.isFinite),where+' figure');
}
function step(s,where,exam=false){
  if(s.activity){check(!exam&&s.type!=='learn',where+' practice format');validateActivity(s.activity,where);if(s.activity.candles){figure(s.activity.candles,where+' interactive chart');check(s.activity.candidates?.length===s.activity.options.length&&s.activity.candidates.every(i=>Number.isInteger(i)&&i>=0&&i<s.activity.candles.candles.length),where+' chart candidates');}}
  check(text(s.title)&&text(s.body),where+' title/body');figure(s.figure,where);
  if(s.type==='learn'){
    check(!exam&&text(s.takeaway),where+' takeaway');
    if(s.terms)check(s.terms.every(t=>text(t.word)&&text(t.meaning)),where+' terms');
    if(s.explore){check(text(s.explore.prompt)&&s.explore.options.length>=2&&s.explore.options.length<=3,where+' explore');for(const o of s.explore.options){check(text(o.label)&&text(o.title)&&text(o.body),where+' explore option');figure(o.figure,where);}}
    return;
  }
  check(text(s.explanation),where+' explanation');
  if(!exam)check(text(s.hint),where+' hint');
  if(['choice','multi'].includes(s.type)){
    check(Array.isArray(s.options)&&s.options.length>=2&&s.options.length<=4&&s.options.every(o=>text(o.text)),where+' options');
    const answers=s.type==='choice'?[s.answer]:s.answers;
    check(Array.isArray(answers)&&answers.length>0&&new Set(answers).size===answers.length&&answers.every(a=>Number.isInteger(a)&&a>=0&&a<s.options.length),where+' answers');
  }else if(s.type==='numeric')check(Number.isFinite(s.answer)&&(s.tolerance===undefined||Number.isFinite(s.tolerance)&&s.tolerance>=0),where+' number');
  else if(s.type==='match')check(Array.isArray(s.pairs)&&s.pairs.length>=2&&s.pairs.length<=4&&s.pairs.every(p=>text(p.left)&&text(p.right)),where+' pairs');
  else if(s.type==='order')check(Array.isArray(s.items)&&s.items.length>=2&&s.items.length<=4&&s.items.every(text)&&Array.isArray(s.answer)&&s.answer.length===s.items.length&&new Set(s.answer).size===s.items.length&&s.answer.every(a=>Number.isInteger(a)&&a>=0&&a<s.items.length),where+' order');
  else throw Error(where+' unsupported exercise '+s.type);
}
export function validateCourse({lessons,exams,course}){
  check(lessons.length===LESSON_COUNT&&exams.length===WORLD_COUNT&&course.groups.length===WORLD_COUNT,`Expected ${LESSON_COUNT} lessons, ${WORLD_COUNT} exams and ${WORLD_COUNT} worlds`);
  check(course.blockSize===10&&course.examPassCount===8,'Exam contract');
  course.groups.forEach((g,id)=>check(text(g.title)&&text(g.short)&&text(g.sub),'World '+id+' title/short/sub'));
  lessons.forEach((l,id)=>{
    const where='Lesson '+id;
    check(l.id===id,where+' stable ID');
    for(const key of ['title','short','subtitle','summary','takeaway'])check(text(l[key]),where+' '+key);
    check(l.story&&text(l.story.scene)&&text(l.story.text),where+' story');
    check(Number.isFinite(l.minutes)&&l.minutes>0,where+' duration');
    check(Array.isArray(l.prerequisites)&&l.prerequisites.every(p=>Number.isInteger(p)&&p<id&&trackForLesson(p)?.id===trackForLesson(id).id),where+' prerequisites');
    check(l.steps.length===([453,462,471].includes(id)?10:8),where+' expected screen count');
    l.steps.forEach((s,i)=>{check((s.type==='learn')===(i%2===0),where+' alternating explanation/exercise');step(s,where+' step '+i);});
    check(new Set(l.steps.filter(s=>s.type!=='learn').map(s=>trackForLesson(id)?.id==='technical'||l.editorialRevision?(s.activity?.kind||s.type):s.type)).size>=3,where+' exercise variety');
  });
  exams.forEach((e,id)=>{
    check(e.id===id&&text(e.title)&&text(e.summary)&&e.steps.length===10,'Exam '+id+' shape');
    check(new Set(e.steps.map(s=>s.reviewLesson)).size===10,'Exam '+id+' covers every lesson');
    e.steps.forEach((s,i)=>{check(Number.isInteger(s.reviewLesson)&&Math.floor(s.reviewLesson/10)===id,'Exam '+id+' review lesson');step(s,'Exam '+id+' question '+i,true);});
  });
  for(const t of TRACKS){check(t.lessonIds.every(id=>lessons[id]&&trackForLesson(id)?.id===t.id),t.id+' lesson count');check(t.groupIds.every(id=>exams[id]&&trackForExam(id)?.id===t.id),t.id+' exam count');}
  return true;
}
