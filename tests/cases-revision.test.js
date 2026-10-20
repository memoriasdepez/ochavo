import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CASE_PARTS,LEGACY_CASE_PARTS,COURSE_PARTS} from '../src/content-files.js';
import {TRACKS,CASE_WORLD_IDS,CASE_IDS,CASE_COUNT,worldNumber} from '../src/tracks.js';
import {activeCases,orderedCases,caseHistory,caseProgressKey,caseWorldLabel} from '../src/case-catalog.js';
import {createGameCatalog,emptyGame,emptyCommerce,applyGameCommand,GAME_CONFIG} from '../src/game-domain.js';

const read=name=>JSON.parse(readFileSync(new URL('../src/content/'+name+'.json',import.meta.url),'utf8'));
const all=CASE_PARTS.flatMap(name=>read(name).cases),historic=LEGACY_CASE_PARTS.flatMap(name=>read(name).cases);
const parts=COURSE_PARTS.map(read),catalog=createGameCatalog({lessons:parts.flatMap(p=>p.lessons),exams:parts.flatMap(p=>p.exams)});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const range=(start,count)=>Array.from({length:count},(_,i)=>start+i);

test('every historical and current case cover has an icon registered by the real client',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const registered=new Set(main.match(/window\.lucide=\{createIcons:[^\n]+icons:\{([^}]+)\}/)[1].split(',').map(p=>p.split(':')[0]));
 for(const c of all){const name=c.cover.icon.split('-').map(p=>p[0].toUpperCase()+p.slice(1)).join('');assert.ok(registered.has(name),c.id+': '+c.cover.icon);}
});

test('all 129 current worlds have a new case aligned to their ten stable lesson IDs',()=>{
 const current=activeCases(all),worlds=TRACKS.flatMap(t=>t.groupIds);
 assert.equal(CASE_COUNT,174);assert.equal(current.length,129);assert.equal(historic.length,45);
 assert.deepEqual(CASE_WORLD_IDS,[...range(0,45),...worlds]);assert.deepEqual(CASE_IDS,CASE_WORLD_IDS.map(id=>'case-'+(id+1)));
 assert.equal(CASE_IDS.includes('case-148'),false);
 assert.deepEqual(current.map(c=>c.world),worlds);
 for(const item of current){
  const track=TRACKS.find(t=>t.groupIds.includes(item.world));
  assert.equal(item.id,`${track.id}-v2-${worldNumber(item.world)}`);
  assert.equal(item.revision,'cases-2026-10');assert.deepEqual(item.lessonIds,range(item.world*10,10));
  assert.ok(item.lessonIds.every(id=>track.lessonIds.includes(id)));assert.ok(item.learningGoals.length>=2);
 }
 assert.equal(new Set(all.map(caseProgressKey)).size,174);
 assert.equal(caseProgressKey(current.find(c=>c.id==='technical-v2-3')),'case-149');
});

test('45 historical authored cases are byte-equivalent as parsed JSON to the published 0.23.0 baseline',()=>{
 // Frozen before this extension, independently compared with the exported iOS 0.23.0 source.
 assert.equal(hash(historic),'58da578d4a50008cb24bc8696013bd5a615432c397cec613617408ae2ad6a243');
 assert.deepEqual(all.filter(c=>c.world<45),historic);
 assert.equal(historic.some(c=>c.revision||c.lessonIds||c.learningGoals),false);
});

test('catalogue helpers separate historical work from ordered current worlds without mutating inputs',()=>{
 const before=JSON.stringify(all),progress={completedCases:{'case-1':{firstTry:3},'case-96':{firstTry:2}},caseSessions:[['case-11',1,Array(6).fill({})]]};
 assert.deepEqual(caseHistory(all,progress).map(caseProgressKey),['case-1','case-11']);
 assert.deepEqual(orderedCases([...all].reverse(),'etfs').map(c=>c.world),range(95,20));
 assert.deepEqual(orderedCases(all,'technical').map(c=>worldNumber(c.world)),range(1,29));
 assert.equal(caseWorldLabel(historic[0],[]),'Caso del recorrido anterior');
 assert.match(caseWorldLabel(all.find(c=>c.world===148),Array.from({length:175},()=>({title:'Tema'}))),/^Mundo 3 · Tema$/);
 assert.equal(JSON.stringify(all),before);
});

test('game catalogue only adds the 258 new case entries and retains every old published reward unchanged',()=>{
 const newIds=new Set(TRACKS.flatMap(t=>t.groupIds).flatMap(world=>['case-'+(world+1),'complete-case-'+(world+1)]));
 assert.equal(newIds.size,258);assert.equal(Object.keys(catalog).length,9379+258+3);
 for(const id of newIds)assert.ok(catalog[id],id);
 assert.equal(catalog['case-148'],undefined);assert.equal(catalog['complete-case-148'],undefined);
 const previous=Object.fromEntries(Object.entries(catalog).filter(([key])=>!newIds.has(key)&&!['answer-453-9','answer-462-9','answer-471-9'].includes(key)).sort(([a],[b])=>a.localeCompare(b)));
 assert.equal(Object.keys(previous).length,9379);
 assert.equal(hash(previous),'8b94256061fccf6e4ea36f8ffa9075cc47c2957741e782d03acb7adaa6c795a7');
 for(const world of CASE_WORLD_IDS)assert.equal(catalog['case-'+(world+1)].requiredClaim,'exam-'+world);
});

test('new and historical case receipts award independently once and repeats cannot duplicate gems',()=>{
 const ids=['case-1','case-46','case-96','case-116','case-146','case-149','case-175'];
 const commerce={...emptyCommerce(),premiumUntilMs:Date.parse('2030-01-01T00:00:00Z'),store:'play_store'};
 let wallet={...emptyGame(),gems:321,lives:0,lifeDay:'2026-10-09'};const claims=new Set(),events=new Map();
 const apply=id=>{const command={kind:'case-complete',target:'complete-'+id};const result=applyGameCommand(wallet,command,{day:'2026-10-09',entry:catalog[command.target],commerce,now:Date.parse('2026-10-09T12:00:00Z'),existingClaims:[...claims],existingEvent:events.get(command.target)});wallet=result.state;for(const claim of result.claims)claims.add(claim.id);if(result.receipt)events.set(command.target,result.receipt);return result;};
 for(const id of ids){assert.equal(apply(id).duplicate,false);assert.equal(apply(id).duplicate,true);}
 assert.equal(wallet.gems,321+ids.length*GAME_CONFIG.caseReward);assert.equal(wallet.lives,0);assert.deepEqual(wallet.completedCases,ids);assert.equal(claims.size,ids.length);
 // Even if a receipt is unavailable, the durable claim still prevents a second reward.
 events.clear();for(const id of ids)assert.equal(apply(id).claims.length,0);
 assert.equal(wallet.gems,321+ids.length*GAME_CONFIG.caseReward);assert.equal(wallet.completedLessons,0);assert.equal(wallet.passedExams,0);
});
