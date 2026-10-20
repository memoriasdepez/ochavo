import test from 'node:test';
import assert from 'node:assert/strict';
import {mount,openLesson} from './current-course-harness.js';
import {TRACKS,FREE_INTRO_WORLD_ID} from '../src/tracks.js';
import {emptySnapshot} from '../src/progress.js';
import {createGameCatalog,emptyGame,applyGameCommand} from '../src/game-domain.js';
const catalog=createGameCatalog(),settle=()=>new Promise(resolve=>setImmediate(resolve));

test('a zero-balance account can skip the whole first stock world once and then pay for the next world',()=>{
 const before={...emptyGame(),gems:0},free=applyGameCommand(before,{kind:'skip-world',target:'skip-world-45'},{day:'2026-10-08',entry:catalog['skip-world-45']});
 assert.equal(free.state.gems,0);assert.equal(free.receipt.gemDelta,0);assert.equal(free.receipt.rewardAmount,0);assert.equal(free.receipt.bonusAmount,0);
 assert.deepEqual(free.skippedWorldIds,[45]);assert.equal(free.state.completedLessons,0);assert.equal(free.state.passedExams,0);assert.deepEqual(free.state.badges,[]);
 const next=applyGameCommand({...free.state,gems:200},{kind:'skip-world',target:'skip-world-46'},{day:'2026-10-08',entry:catalog['skip-world-46'],skippedWorldIds:free.skippedWorldIds});
 assert.equal(next.state.gems,0);assert.deepEqual(next.skippedWorldIds,[45,46]);
 assert.throws(()=>applyGameCommand(before,{kind:'skip-world',target:'skip-world-46'},{day:'2026-10-08',entry:{...catalog['skip-world-46'],cost:0}}),{code:'game/invalid-action'});
 assert.throws(()=>applyGameCommand(before,{kind:'skip-world',target:'skip-world-95'},{day:'2026-10-08',entry:{...catalog['skip-world-95'],cost:0}}),{code:'game/invalid-action'});
});
test('the free button replaces the paid offer only in world one of stocks; later worlds are unlocked after durable confirmation',async()=>{
 const app=mount(),calls=[],skipped=[];let finish;
 app.window.virutaGame={getView:()=>({canSpend:true,canPlay:true,skippedWorldIds:skipped}),skipWorld:id=>{calls.push(id);return new Promise(resolve=>finish=()=>{skipped.push(id);resolve();});}};
 assert.match(app.main.innerHTML,/Saltar primer mundo/);assert.doesNotMatch(app.main.innerHTML,/data-value="45"/);assert.doesNotMatch(app.main.innerHTML,/data-value="46"/);
 app.click({skipIntro:''});assert.deepEqual(calls,[FREE_INTRO_WORLD_ID]);assert.equal(app.course.isBusy(),true);assert.equal(skipped.length,0);
 finish();await settle();assert.equal(app.course.isBusy(),false);assert.equal(app.saved.mapTarget,'br-point-460');assert.deepEqual(app.saved.completed,{});assert.deepEqual(app.saved.passedExams,{});
 assert.match(app.main.innerHTML,/data-value="46"/);assert.doesNotMatch(app.main.innerHTML,/data-value="45"/);openLesson(app,460);
 const restored=mount(app.saved,skipped);restored.click({nav:'map'});openLesson(restored,460);
});
test('a failed or interrupted free skip cannot unlock another account or masquerade as a completed lesson',async()=>{
 const app=mount();app.window.virutaGame={getView:()=>({canSpend:true,skippedWorldIds:[]}),skipWorld:async()=>{throw Error('No connection');}};
 app.click({skipIntro:''});await settle();assert.match(app.main.innerHTML,/data-skip-intro/);assert.equal(app.course.isBusy(),false);
 app.click({detail:'460'});assert.doesNotMatch(app.main.innerHTML,/data-start="460"/);
 let finish;app.click({nav:'map'});app.window.virutaGame.skipWorld=()=>new Promise(resolve=>finish=resolve);app.click({skipIntro:''});app.course.restore(emptySnapshot());finish();await settle();
 assert.match(app.main.innerHTML,/data-skip-intro/);assert.deepEqual(app.saved?.completed||{},{});assert.equal(app.course.isBusy(),false);
});
test('all other reached, unfinished worlds in all three paths offer the visible 200-gem shortcut',()=>{
 for(const t of TRACKS)for(const [index,id] of t.groupIds.entries()){
  const passedExams=Object.fromEntries(t.groupIds.slice(0,index).map(i=>[i,{best:8,attempts:1,passed:true}]));
  const app=mount({...emptySnapshot(),track:t.id,group:id,passedExams});app.click({group:String(id)});
  if(id===FREE_INTRO_WORLD_ID){assert.doesNotMatch(app.main.innerHTML,/data-value="45"/);continue;}
  assert.match(app.main.innerHTML,new RegExp(`data-value="${id}" aria-label="Saltar mundo ${index+1} por 200 gemas"`));
  assert.match(app.main.innerHTML,/data-lucide="fast-forward"/);assert.match(app.main.innerHTML,/br-world-skip-price/);
 }
});
