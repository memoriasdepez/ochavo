import test from 'node:test';
import assert from 'node:assert/strict';
import {GAME_CONFIG,dayWindow,dayKeyAt,emptyGame,applyGameCommand,eventIdFor,createGameCatalog,currentGame} from '../src/game-domain.js';

const catalog=createGameCatalog({lessons:Array.from({length:12},(_,id)=>({id,steps:[{type:'learn'},{type:'choice'}]})),exams:[{id:0}]});
function game(){
  let state=emptyGame();const claims=new Set(),events=new Map();
  return {get state(){return state;},set state(value){state=value;},act(command,day='2026-10-04',extra={}){
    const result=applyGameCommand(state,command,{day,entry:catalog[command.target],existingClaims:[...claims],existingEvent:events.get(eventIdFor(command,day)),...extra});
    state=result.state;for(const c of result.claims)claims.add(c.id);if(result.receipt)events.set(result.receipt.id,result.receipt);return result;
  }};
}

test('welcome is exactly 200 even if a reward was claimed before first entry; daily reward begins next date',()=>{
 const g=game();assert.equal(GAME_CONFIG.welcomeGems,200);assert.equal(GAME_CONFIG.worldSkipCost,200);
 g.act({kind:'open'});assert.equal(g.state.gems,200);assert.equal(g.state.streak,1);
 g.act({kind:'open'},'2026-10-05');assert.equal(g.state.gems,202);
 const other=game();other.act({kind:'answer',target:'answer-0-1',attemptId:'right',correct:true});
 other.act({kind:'open'});assert.equal(other.state.gems,201);
});
test('skip catalog follows all three ordered paths without granting lesson, exam or world rewards',()=>{
 for(const [id,previous] of [[0,-1],[10,-1],[15,-1],[20,9],[35,14],[40,19]])assert.equal(catalog['skip-world-'+id].previousWorldId,previous);
 const entry=catalog['skip-world-0'],result=applyGameCommand(emptyGame(),{kind:'skip-world',target:'skip-world-0'},{day:'2026-10-04',entry});
 assert.equal(result.state.gems,0);assert.equal(result.receipt.gemDelta,-200);assert.equal(result.receipt.rewardAmount,0);
 assert.deepEqual(result.skippedWorldIds,[0]);assert.deepEqual(result.claims,[{id:'skip-world-0',amount:0}]);
 assert.equal(result.state.lives,5);assert.equal(result.state.completedLessons,0);assert.equal(result.state.passedExams,0);
 assert.throws(()=>applyGameCommand(emptyGame(),{kind:'skip-world',target:'skip-world-0'},{day:'2026-10-04',entry:{...entry,cost:1}}),{code:'game/invalid-action'});
});
test('Madrid midnight and daylight saving produce 23/25 hour days, without streak arithmetic in hours',()=>{
  assert.equal(dayKeyAt(Date.parse('2026-03-28T23:00:00Z')),'2026-03-29');
  assert.equal((dayWindow('2026-03-29').endAt-dayWindow('2026-03-29').startAt)/3600000,23);
  assert.equal((dayWindow('2026-10-25').endAt-dayWindow('2026-10-25').startAt)/3600000,25);
  assert.equal(dayWindow('2026-03-30').startAt,Date.parse('2026-03-29T22:00:00Z'));
  assert.equal(dayWindow('2026-10-26').startAt,Date.parse('2026-10-25T23:00:00Z'));
  const g=game();for(const d of ['2026-03-28','2026-03-29','2026-03-30'])g.act({kind:'open'},d);
  assert.equal(g.state.streak,3);assert.equal(g.state.gems,209);
});
test('welcome, daily entry and streak milestones award exactly once, breaks restart without re-awarding milestone',()=>{
  const g=game();assert.equal(g.state.gems,200);
  g.act({kind:'open'},'2026-10-01');g.act({kind:'open'},'2026-10-01');assert.equal(g.state.gems,200);
  for(const d of ['2026-10-02','2026-10-03','2026-10-05','2026-10-06','2026-10-07'])g.act({kind:'open'},d);
  assert.equal(g.state.streak,3);assert.equal(g.state.gems,215);assert.equal(g.state.bestStreak,3);
});
test('same incorrect attempt charges once, no lives blocks new answer, next day resets exactly five',()=>{
  const g=game(),bad={kind:'answer',target:'answer-0-1',correct:false,attemptId:'one'};
  g.act(bad);g.act(bad);assert.equal(g.state.lives,4);
  for(let i=0;i<4;i++)g.act({...bad,attemptId:'next-'+i});
  assert.equal(g.state.lives,0);assert.throws(()=>g.act({...bad,attemptId:'empty'}),{code:'game/no-lives'});
  assert.equal(currentGame(g.state,'2026-10-05').lives,5);
  assert.throws(()=>currentGame(g.state,'2026-10-03'),{code:'game/clock'});
});
test('correct answer rewards only first correctness even with new attempts or reload-equivalent history',()=>{
  const g=game();g.act({kind:'answer',target:'answer-0-1',correct:false,attemptId:'wrong'});
  const c={kind:'answer',target:'answer-0-1',correct:true,attemptId:'right'};
  g.act(c);g.act(c);g.act({...c,attemptId:'replay'});assert.equal(g.state.gems,201);assert.equal(g.state.lives,4);
  assert.throws(()=>g.act({...c,correct:false}),{code:'game/attempt-conflict'});
});
test('exam charges only on delivery, caps errors at actual lives and preserves aggregate grade',()=>{
  const g=game();g.state={...g.state,lives:2,lifeDay:'2026-10-04'};
  const c={kind:'exam',target:'exam-0',attemptId:'exam-a',wrongCount:5,passed:false};
  g.act(c);g.act(c);assert.equal(g.state.lives,0);assert.equal(g.state.gems,200);
  assert.throws(()=>g.act({...c,attemptId:'exam-b'}),{code:'game/no-lives'});
});
test('first passed exam gives declared 30+50 once, repetitions still charge new mistakes',()=>{
  const g=game(),c={kind:'exam',target:'exam-0',attemptId:'exam-a',wrongCount:2,passed:true};
  g.act(c);assert.equal(g.state.gems,280);assert.equal(g.state.lives,3);
  g.act({...c,attemptId:'exam-b'});assert.equal(g.state.gems,280);assert.equal(g.state.lives,1);
  assert.throws(()=>g.act({...c,attemptId:'invalid',wrongCount:3}),{code:'game/invalid-result'});
});
test('full refill costs twenty, never overfills and cannot buy twice by retrying',()=>{
  const g=game();g.state={...g.state,gems:20};assert.throws(()=>g.act({kind:'refill',attemptId:'full'}),{code:'game/lives-full'});
  g.act({kind:'answer',target:'answer-0-1',attemptId:'wrong',correct:false});
  const c={kind:'refill',attemptId:'purchase'};g.act(c);g.act(c);
  assert.equal(g.state.lives,5);assert.equal(g.state.gems,0);
});
test('cases require premium and never gems or an approved exam',()=>{
  const g=game();assert.throws(()=>g.act({kind:'case',target:'case-1'}),{code:'game/premium-required'});
  assert.throws(()=>g.act({kind:'case-complete',target:'complete-case-1'}),{code:'game/premium-required'});
  g.state={...g.state,lives:0,lifeDay:'2026-10-04'};
  const commerce={schemaVersion:1,revision:1,premiumUntilMs:Date.now()+86400000,store:'play_store',environment:'production',paidGranted:0,paidConsumed:0,paidLives:0};
  g.act({kind:'case-complete',target:'complete-case-1'},'2026-10-04',{commerce});
  assert.equal(g.state.gems,210);assert.equal(g.state.lives,0);assert.deepEqual(g.state.completedCases,['case-1']);
});
test('badges and referrals have required evidence and no repeat reward',()=>{
  const g=game();assert.throws(()=>g.act({kind:'badge',target:'badge-first-lesson'}),{code:'game/badge-locked'});
  g.act({kind:'lesson',target:'lesson-0'});g.act({kind:'badge',target:'badge-first-lesson'});g.act({kind:'badge',target:'badge-first-lesson'});
  const r={kind:'referral',target:'receipt-one'};assert.throws(()=>g.act(r),{code:'game/referral-unverified'});
  g.act(r,'2026-10-04',{referralVerified:true});g.act(r,'2026-10-04',{referralVerified:true});assert.equal(g.state.referralCount,1);assert.equal(g.state.gems,250);
});
test('historical rewards consume no lives and imports cannot submit an arbitrary credit',()=>{
  const g=game();g.state={...g.state,lives:0,lifeDay:'2026-10-04'};
  g.act({kind:'exam-credit',target:'exam-0'});assert.equal(g.state.lives,0);assert.equal(g.state.gems,280);
  g.act({kind:'import-debit',attemptId:'import-a',amount:1000});assert.equal(g.state.gems,0);
  assert.throws(()=>g.act({kind:'import-debit',attemptId:'negative',amount:-1}),{code:'game/invalid-action'});
  assert.throws(()=>g.act({kind:'lesson',target:'lesson-900'}),{code:'game/unknown-reward'});
  assert.equal(GAME_CONFIG.dailyLives,5);
});
