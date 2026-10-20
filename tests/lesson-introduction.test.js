import test from 'node:test';
import assert from 'node:assert/strict';
import {mount,lessons} from './current-course-harness.js';
import {TRACKS} from '../src/tracks.js';
import {emptySnapshot} from '../src/progress.js';

const normalize=text=>String(text||'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
const repeats=lesson=>normalize(lesson.steps[0].body).includes(normalize(lesson.summary));
const completed=Object.fromEntries(TRACKS.flatMap(t=>t.lessonIds).map(id=>[id,{firstTry:4}]));
const passedExams=Object.fromEntries(TRACKS.flatMap(t=>t.groupIds).map(id=>[id,{best:10,attempts:1,passed:true}]));

for(const track of TRACKS)test(`${track.id}: every repeated introduction opens the first explanation in one click`,()=>{
 const app=mount({...emptySnapshot(),track:track.id,completed,passedExams});
 const repeated=track.lessonIds.filter(id=>repeats(lessons[id]));
 assert.ok(repeated.length);
 for(const id of repeated){
  app.click({detail:String(id)});
  assert.equal(app.main.dataset.view,'lesson',`Lesson ${id}`);
  assert.equal(app.course.reportContext().stepIndex,0,`Lesson ${id}`);
  assert.ok(app.main.innerHTML.includes('1 / '+lessons[id].steps.length));
  assert.doesNotMatch(app.main.innerHTML,/br-level-detail|data-start=/);
 }
 assert.deepEqual(app.saved.completed,completed);
 assert.deepEqual(app.saved.passedExams,passedExams);
});

test('an unfinished point resumes its compatible answers instead of restarting at 1/8',()=>{
 const id=450,drafts=Array.from({length:8},()=>({}));
 drafts[0]={v:{contentRevision:lessons[id].editorialRevision}};
 drafts[1]={c:0,p:true};
 const app=mount({...emptySnapshot(),sessions:[[id,2,drafts]],activeId:id,activeByTrack:{stocks:id}});
 app.click({detail:String(id)});
 assert.equal(app.main.dataset.view,'lesson');
 assert.equal(app.course.reportContext().stepIndex,2);
 assert.equal(app.saved.sessions.find(s=>s[0]===id)[2][1].c,0);
 app.click({exit:''});assert.equal(app.main.dataset.view,'map');
 app.click({detail:String(id)});assert.equal(app.course.reportContext().stepIndex,2);
});

test('locked points retain the reason and signed-out users cannot enter',()=>{
 const app=mount();app.click({detail:'451'});
 assert.equal(app.main.dataset.view,'detail');
 assert.doesNotMatch(app.main.innerHTML,/data-start="451"/);
 assert.equal(app.saved,null);
 app.window.virutaAccess.canLearn=()=>false;app.course.refreshAccess();
 app.click({detail:'450'});assert.equal(app.main.dataset.view,'locked');
 assert.equal(app.main.innerHTML,'');assert.equal(app.saved,null);
});

test('a distinct introduction remains available without losing the first explanation',()=>{
 const id=1451;assert.equal(repeats(lessons[id]),false);
 const app=mount({...emptySnapshot(),track:'technical',completed:{1450:{firstTry:4}}});
 app.click({detail:String(id)});assert.equal(app.main.dataset.view,'detail');
 assert.match(app.main.innerHTML,/data-start="1451"/);
 app.click({start:String(id)});assert.equal(app.main.dataset.view,'lesson');
 assert.equal(app.course.reportContext().stepIndex,0);
});
