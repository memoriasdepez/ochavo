import test from 'node:test';
import assert from 'node:assert/strict';
import {createRewardMotion} from '../src/motion.js';
import {rewardStorageKey} from '../src/reward-queue.js';
import {createGameStore} from '../src/game-store.js';
import {emptyGame,applyGameCommand,createGameCatalog} from '../src/game-domain.js';

const event=(id,gems,extra={})=>({owner:'A',duplicate:false,receipt:{id,gemDelta:gems,kind:'lesson',target:'lesson-0',...extra}});
function fixture(data=new Map()){
 const shown=[],storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};
 const motion=createRewardMotion({storage,present:r=>shown.push(r)});motion.setOwner('A');
 return {motion,shown,storage,data};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('rewards accumulate silently outside Aprende and create a chest with the exact total only on returning',async()=>{
 const {motion}=fixture();motion.receive(event('answer',1));motion.receive(event('exam',80));
 assert.equal(motion.showPending(),false);assert.equal(motion.getView(),null);
 assert.equal(motion.wallet({owner:'A',gems:281,earnedGems:281}).gems,200);
 motion.setHome(true);assert.equal(motion.showPending(),true);
 assert.equal(motion.getView().phase,'closed');assert.equal(motion.getView().gems,81);
 assert.equal(await motion.continue(),false,'closed chest requires opening first');
 motion.openChest();assert.equal(motion.getView().phase,'open');
 assert.equal(motion.wallet({owner:'A',gems:281,earnedGems:281}).gems,200);
 await motion.continue();assert.equal(motion.getView(),null);
 assert.equal(motion.wallet({owner:'A',gems:281,earnedGems:281}).gems,281);
});

test('each badge gets its own screen followed by one chest, and only Continue advances the sequence',async()=>{
 const {motion}=fixture();motion.receive(event('one',10,{kind:'badge',target:'badge-first-lesson'}));motion.receive(event('two',10,{kind:'badge',target:'badge-streak-3'}));motion.receive(event('exercise',1));
 motion.setHome(true);motion.showPending();assert.equal(motion.getView().id,'first-lesson');assert.equal(motion.getView().remaining,3);
 assert.equal(motion.openChest(),false);await settle();assert.equal(motion.getView().id,'first-lesson');
 await motion.continue();assert.equal(motion.getView().id,'streak-3');await motion.continue();
 assert.equal(motion.getView().kind,'gems');assert.equal(motion.getView().gems,21);
 motion.openChest();await motion.continue();assert.equal(motion.getView(),null);
});

test('duplicate, zero, spent and other-account receipts never create prizes',()=>{
 const {motion}=fixture();for(const e of [event('spent',-30),{...event('old',10),duplicate:true},{...event('other',10),owner:'B'},event('zero',0)])assert.equal(motion.receive(e),false);
 assert.equal(motion.receive(event('first',10)),true);assert.equal(motion.receive(event('first',10)),false);
 assert.deepEqual(motion.pending(),{gems:10,badges:[]});
});

test('pending rewards survive reload, reopening an unopened chest and switching accounts without leaking',async()=>{
 const f=fixture();f.motion.receive(event('one',10,{kind:'badge',target:'badge-first-lesson'}));await f.motion.flush();
 f.motion.setHome(true);f.motion.showPending();f.motion.setOwner('B');f.motion.setHome(true);assert.equal(f.motion.showPending(),false);
 const restored=fixture(f.data);restored.motion.setHome(true);restored.motion.showPending();assert.equal(restored.motion.getView().id,'first-lesson');
 await restored.motion.continue();restored.motion.openChest();restored.motion.reset();restored.motion.setHome(true);restored.motion.showPending();
 assert.equal(restored.motion.getView().phase,'closed');assert.equal(restored.motion.getView().gems,10);
 assert.equal(restored.motion.receive(event('one',10)),false,'persisted receipt prevents duplicate awards');
});

test('acknowledged rewards never replay on a subsequent visit or reload',async()=>{
 const f=fixture();f.motion.receive(event('one',10));f.motion.setHome(true);f.motion.showPending();f.motion.openChest();await f.motion.continue();
 const restored=fixture(f.data);restored.motion.setHome(true);assert.equal(restored.motion.showPending(),false);assert.equal(restored.motion.receive(event('one',10)),false);
});

test('leaving Aprende hides its modal and retains unacknowledged rewards',()=>{
 const {motion}=fixture();motion.receive(event('one',10));motion.setHome(true);motion.showPending();motion.openChest();motion.setHome(false);
 assert.equal(motion.getView(),null);assert.deepEqual(motion.pending(),{gems:10,badges:[]});motion.setHome(true);motion.showPending();assert.equal(motion.getView().phase,'closed');
});

test('a failed acknowledgement keeps the chest open and its gems withheld until a successful retry',async()=>{
 const f=fixture();f.motion.receive(event('one',10));await f.motion.flush();f.motion.setHome(true);f.motion.showPending();f.motion.openChest();
 f.storage.setItem=()=>{throw Error('disk full');};assert.equal(await f.motion.continue(),false);
 assert.equal(f.motion.getView().phase,'open');assert.match(f.motion.getView().error,/reintentarlo/);assert.equal(f.motion.pending().gems,10);
 f.storage.setItem=(key,value)=>f.data.set(key,value);await f.motion.continue();assert.equal(f.motion.pending().gems,0);
});

test('Continue cannot double acknowledge and a late acknowledgement cannot touch the new owner',async()=>{
 const f=fixture();f.motion.receive(event('one',10));await f.motion.flush();f.motion.setHome(true);f.motion.showPending();f.motion.openChest();
 let resolve;f.storage.flush=()=>new Promise(done=>resolve=done);
 const pending=f.motion.continue();await settle();assert.equal(await f.motion.continue(),false);f.motion.setOwner('B');resolve();await pending;
 assert.equal(f.motion.getView(),null);assert.deepEqual(f.motion.pending(),{gems:0,badges:[]});assert.equal(f.data.has(rewardStorageKey('B')),false);
});

test('new receipts arriving during a chest acknowledgement remain pending and are never lost',async()=>{
 const f=fixture();f.motion.receive(event('one',10));await f.motion.flush();f.motion.setHome(true);f.motion.showPending();f.motion.openChest();
 let resolve;let first=true;f.storage.flush=()=>first?(first=false,new Promise(done=>resolve=done)):Promise.resolve();
 const pending=f.motion.continue();await settle();f.motion.receive(event('two',5));resolve();await pending;
 assert.equal(f.motion.getView().gems,5);assert.equal(f.motion.getView().phase,'closed');assert.equal(f.motion.pending().gems,5);
 await f.motion.flush();assert.equal(JSON.parse(f.data.get(rewardStorageKey('A'))).gems,5);
});

test('withheld earned gems never hide purchased gems or create a negative displayed balance',()=>{
 const {motion}=fixture();motion.receive(event('one',50));
 assert.equal(motion.wallet({owner:'A',gems:210,earnedGems:10,paidGems:200}).gems,200);
 assert.equal(motion.wallet({owner:'A',gems:10,earnedGems:10}).gems,0);
 assert.equal(motion.wallet({owner:'B',gems:100,earnedGems:100}).gems,100);
});

test('account deletion removes its reward queue and preserves another account',async()=>{
 const f=fixture();f.motion.receive(event('one',10));await f.motion.flush();f.data.set(rewardStorageKey('B'),'other account');await f.motion.forget('A');
 assert.equal(f.data.has(rewardStorageKey('A')),false);assert.equal(f.data.get(rewardStorageKey('B')),'other account');assert.equal(f.motion.getView(),null);
});

test('an unreadable reward queue is retained without hiding or modifying the protected wallet',async()=>{
 const data=new Map([[rewardStorageKey('A'),'unreadable']]),f=fixture(data);assert.equal(f.motion.receive(event('one',10)),false);
 assert.equal(f.motion.wallet({owner:'A',gems:210}).gems,210);await f.motion.flush();assert.equal(data.get(rewardStorageKey('A')),'unreadable');
});

test('confirmed rewards are queued before the updated wallet renders, avoiding a premature gem increase',async()=>{
 const f=fixture(),views=[],catalog=createGameCatalog({lessons:[{id:0,steps:[{type:'learn'},{type:'choice'}]}],exams:[]});
 let state=emptyGame();const backend={read:async()=>state,commit:async(_uid,c)=>{const result=applyGameCommand(state,c,{day:'2026-10-10',entry:catalog[c.target]});state=result.state;return result;}};
 const game=createGameStore({storage:f.storage,backend,catalog,onView:v=>views.push(f.motion.wallet(v).gems),onEvent:f.motion.receive,now:()=>Date.parse('2026-10-10T12:00:00Z')});
 await game.select({uid:'A',emailVerified:true});await game.claimLesson(0);
 assert.equal(game.getView().gems,210,'server wallet retains confirmed value');assert.equal(views.at(-1),200);assert.ok(!views.includes(210));
 f.motion.setHome(true);f.motion.showPending();f.motion.openChest();await f.motion.continue();assert.equal(f.motion.wallet(game.getView()).gems,210);
});