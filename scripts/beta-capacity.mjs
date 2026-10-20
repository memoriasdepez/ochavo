import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as firestore from 'firebase/firestore';
import {createGameBackend} from '../src/game-backend.js';
import {createProgressBackend} from '../src/cloud.js';
import {createFeedbackBackend} from '../src/feedback.js';
import {emptySnapshot,makeEnvelope} from '../src/progress.js';
import {GAME_CONFIG,dayWindow,dayKeyAt} from '../src/game-domain.js';

// Deliberately fixed to a disposable local project; no administrator credentials.
export const PROJECT='demo-ochavo-capacity';
export function validateDestination(host,args=[]) {
  if(!/^127\.0\.0\.1:8088$/.test(host||'')||args.length)throw Error('Solo se admite el emulador aislado 127.0.0.1:8088, sin argumentos de destino.');
}
export function summarize(values) {
  if(!values.length)return {count:0};
  const sorted=[...values].sort((a,b)=>a-b),at=p=>Math.round(sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]);
  return {count:values.length,p50Ms:at(.5),p95Ms:at(.95),maxMs:Math.round(sorted.at(-1))};
}
function instrument(counters) {
  return {...firestore,
    getDocFromServer:async ref=>{counters.documentReads++;return firestore.getDocFromServer(ref);},
    runTransaction:(db,callback)=>{
      counters.transactions++;
      return firestore.runTransaction(db,tx=>{
        counters.transactionAttempts++;
        return callback({get:ref=>{counters.documentReads++;return tx.get(ref);},set:(ref,value)=>{counters.writeAttempts++;return tx.set(ref,value);},delete:ref=>{counters.writeAttempts++;return tx.delete(ref);}});
      });
    }
  };
}
async function main() {
  validateDestination(process.env.FIRESTORE_EMULATOR_HOST,process.argv.slice(2));
  const root=new URL('../',import.meta.url),out=new URL('../../../outputs/ochavo-beta-controlada/',import.meta.url);
  await mkdir(out,{recursive:true});
  const catalog=JSON.parse(await readFile(new URL('src/content/game-catalog.json',root),'utf8'));
  const day=dayKeyAt(),window=dayWindow(day);
  const env=await initializeTestEnvironment({projectId:PROJECT,firestore:{host:'127.0.0.1',port:8088,rules:await readFile(new URL('firestore.rules',root),'utf8')}});
  const report={createdAt:new Date().toISOString(),project:PROJECT,destination:'127.0.0.1:8088',sourceVersion:JSON.parse(await readFile(new URL('package.json',root),'utf8')).version,scope:'Firestore emulator, real client backends and deployed-source rules; synthetic verified identities, not Firebase Auth, CDN or cloud capacity',stages:[],checks:{},errors:[]};
  async function timed(stage,label,fn) {
    const started=performance.now();
    try {const result=await fn();(stage.samples[label]??=[]).push(performance.now()-started);return result;}
    catch(error){stage.errors.push({operation:label,code:String(error.code||error.name)});throw error;}
  }
  try {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled(async c=>{
      const db=c.firestore(),batch=firestore.writeBatch(db);
      batch.set(firestore.doc(db,'gameConfig/economy'),GAME_CONFIG);
      batch.set(firestore.doc(db,'gameDays',day),{...window,startAt:firestore.Timestamp.fromMillis(window.startAt),endAt:firestore.Timestamp.fromMillis(window.endAt)});
      for(const id of ['answer-450-1','answer-450-3','answer-450-5','answer-450-7','lesson-450','exam-45','skip-world-45']){
        assert(catalog[id],id);batch.set(firestore.doc(db,'gameCatalog',id),catalog[id]);
      }
      await batch.commit();
    });
    for(const users of [10,25,50]) {
      const stage={users,samples:{},errors:[],counters:{documentReads:0,transactions:0,transactionAttempts:0,writeAttempts:0}},start=performance.now();
      const api=instrument(stage.counters);
      const results=await Promise.allSettled(Array.from({length:users},async(_,index)=>{
        const uid=`synthetic-${users}-${index}`,db=env.authenticatedContext(uid,{email_verified:true,firebase:{sign_in_provider:'password'}}).firestore();
        const game=createGameBackend(db,{api}),progress=createProgressBackend(db,api);
        await timed(stage,'startup',()=>Promise.all([progress.read(uid),game.read(uid),game.readCommerce(uid),game.readSkips(uid),game.readGemCommerce(uid)]));
        assert.equal((await timed(stage,'daily-open',()=>game.commit(uid,{kind:'open'}))).state.gems,200);
        for(const step of [1,3,5,7])await timed(stage,'answer',()=>game.commit(uid,{kind:'answer',target:`answer-450-${step}`,attemptId:`attempt-${step}`,correct:true}));
        await timed(stage,'lesson',()=>game.commit(uid,{kind:'lesson',target:'lesson-450'}));
        const snapshot={...emptySnapshot(),completed:{450:{firstTry:4}},track:'stocks',group:45};
        await timed(stage,'progress-save',()=>progress.commit(uid,makeEnvelope(snapshot)));
        // Two devices retry the same receipt: exactly one reward and one life debit.
        const before=await game.read(uid);
        const command={kind:'answer',target:'answer-450-1',attemptId:'lost-response',correct:false};
        const receipts=await timed(stage,'duplicate-two-devices',()=>Promise.all([game.commit(uid,command),createGameBackend(db,{api}).commit(uid,command)]));
        assert.equal(receipts.filter(r=>r.duplicate).length,1);
        const wallet=await game.read(uid);assert.equal(wallet.lives,before.lives-1);assert.equal(wallet.gems,before.gems);
        // Competing progress writes from stale devices must merge distinct paths.
        await timed(stage,'progress-two-devices',()=>Promise.all([
          progress.commit(uid,makeEnvelope({...emptySnapshot(),completed:{950:{firstTry:3}},track:'etfs'})),
          progress.commit(uid,makeEnvelope({...emptySnapshot(),completed:{1150:{firstTry:2}},track:'crypto'}))
        ]));
        const restored=await timed(stage,'restore',()=>createProgressBackend(db,api).read(uid));
        for(const id of [450,950,1150])assert(restored.snapshot.completed[id]);
        // Existing feedback channel: authenticated, idempotent and no private answer data.
        const user={uid,emailVerified:true},feedback=createFeedbackBackend({db,getUser:()=>user},api);
        const notice={id:(users*1000+index).toString(16).padStart(32,'0'),category:'progreso',text:'Aviso ficticio de beta: comprobar el guardado.',context:{page:'map',track:'stocks'}};
        await timed(stage,'feedback',()=>feedback.send(notice));
        await timed(stage,'feedback-retry',()=>feedback.send(notice));
        return true;
      }));
      stage.durationMs=Math.round(performance.now()-start);stage.successfulUsers=results.filter(r=>r.status==='fulfilled').length;
      stage.operations=Object.fromEntries(Object.entries(stage.samples).map(([k,v])=>[k,summarize(v)]));delete stage.samples;
      report.stages.push(stage);
      console.log(JSON.stringify({stage:users,successfulUsers:stage.successfulUsers,durationMs:stage.durationMs,errors:stage.errors.length}));
      if(stage.successfulUsers!==users){for(const result of results)if(result.status==='rejected')report.errors.push({code:String(result.reason.code||result.reason.name),message:String(result.reason.message).slice(0,240)});break;}
    }
    const owner=env.authenticatedContext('synthetic-10-0',{email_verified:true}).firestore(),other=env.authenticatedContext('synthetic-other',{email_verified:true}).firestore();
    await assertFails(firestore.getDoc(firestore.doc(other,'users/synthetic-10-0/progress/main')));
    await assertFails(firestore.getDoc(firestore.doc(env.unauthenticatedContext().firestore(),'users/synthetic-10-0/game/main')));
    report.checks.otherAccountBlocked=true;report.checks.guestBlocked=true;
    // Maximum curriculum history: ensure our 128 KiB progress guard has headroom.
    const completed=Object.fromEntries(Array.from({length:1750},(_,id)=>[id,{firstTry:4}]));
    const passedExams=Object.fromEntries(Array.from({length:175},(_,id)=>[id,{best:10,attempts:1}]));
    const large=makeEnvelope({...emptySnapshot(),completed,passedExams});
    report.progressPayloadBytes=Buffer.byteLength(JSON.stringify(large));report.progressLimitBytes=131072;
    await createProgressBackend(owner).commit('synthetic-10-0',large);
    report.checks.fullHistorySaved=true;
    report.ok=report.errors.length===0&&report.stages.length===3&&report.stages.every(s=>s.errors.length===0&&s.successfulUsers===s.users);
  } catch(error) {report.ok=false;report.errors.push({code:String(error.code||error.name),message:String(error.message).slice(0,240)});}
  finally {await env.cleanup();await writeFile(new URL('capacidad-firestore-local.json',out),JSON.stringify(report,null,2)+'\n');}
  if(!report.ok)process.exitCode=1;
  console.log(JSON.stringify({ok:report.ok,report:'outputs/ochavo-beta-controlada/capacidad-firestore-local.json'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
