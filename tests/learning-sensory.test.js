import test from 'node:test';
import assert from 'node:assert/strict';
import {createLearningSensory,createWebCueDriver,SENSORY_KEY} from '../src/learning-sensory.js';
import {readFileSync} from 'node:fs';

function fixture(options={}){
  const calls=[],listeners=new Map(),values=new Map();
  const doc={hidden:false,addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type)};
  const driver={play:kind=>{calls.push(kind);return Promise.resolve();},stop:()=>calls.push('stop'),prime:()=>calls.push('prime')};
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  let at=0;
  const controller=createLearningSensory({doc,driver,storage,now:()=>at,...options});
  return {controller,calls,doc,listeners,values,advance:()=>{at+=200;}};
}
test('web effects require opting out of silent mode; the saved preference survives reload',()=>{
  const f=fixture();assert.equal(f.controller.getView().muted,true);assert.equal(f.controller.play('correct'),false);assert.deepEqual(f.calls,[]);
  f.controller.setMuted(false);assert.equal(f.controller.play('correct'),true);assert.deepEqual(f.calls,['correct']);
  const restored=fixture({storage:{getItem:()=>f.values.get(SENSORY_KEY)}});assert.equal(restored.controller.getView().muted,false);
  f.controller.setMuted(true);f.advance();assert.equal(f.controller.play('badge'),false);assert.deepEqual(f.calls,['correct','stop']);
});
test('native mode delegates effects to the OS driver and stop is immediate when muted or hidden',()=>{
  const f=fixture({native:true});assert.equal(f.controller.play('correct'),true);f.advance();assert.equal(f.controller.play('chest'),true);
  f.doc.hidden=true;f.listeners.get('visibilitychange')();assert.equal(f.controller.play('badge'),false);
  f.doc.hidden=false;f.controller.setMuted(true);assert.equal(f.controller.play('correct'),false);assert.deepEqual(f.calls,['correct','chest','stop','stop']);
});
test('unavailable feedback and pending audio never delay grading or introduce unhandled errors',async()=>{
  const f=fixture({native:true,driver:{play:()=>new Promise(()=>{}),stop(){}}});assert.equal(f.controller.play('correct'),true);
  assert.equal(f.controller.play('wrong'),false);assert.equal(f.controller.play('correct'),false);f.advance();assert.equal(f.controller.play('correct'),true);
  const failed=fixture({native:true,driver:{play:()=>Promise.reject(Error('missing hardware')),stop:()=>Promise.reject(Error('gone'))}});
  assert.equal(failed.controller.play('badge'),true);failed.controller.stop();await new Promise(r=>setImmediate(r));
});

function audioFixture(){
  const starts=[],pending=new Map();
  class Context{
    state='running';destination={};resume(){return Promise.resolve();}
    decodeAudioData(bytes){return Promise.resolve(bytes);}
    createBufferSource(){return {connect(){},disconnect(){},start(){starts.push(this.buffer);},stop(){},buffer:null};}
  }
  const fetch=url=>new Promise(resolve=>pending.set(url.split('/').pop(),()=>resolve({ok:true,arrayBuffer:async()=>url})));
  const driver=createWebCueDriver({AudioContext:Context,fetch,doc:{hidden:false}});
  return {driver,starts,pending};
}
test('muting cancels a sound still being downloaded and a newer celebration replaces stale feedback',async()=>{
  const f=audioFixture();const old=f.driver.play('correct');await Promise.resolve();f.driver.stop();f.pending.get('correct.wav')();assert.equal(await old,false);assert.deepEqual(f.starts,[]);
  const a=audioFixture();const early=a.driver.play('correct');await Promise.resolve();const chest=a.driver.play('chest');await Promise.resolve();
  a.pending.get('chest.wav')();assert.equal(await chest,true);a.pending.get('correct.wav')();assert.equal(await early,false);assert.deepEqual(a.starts,['/sounds/chest.wav']);
});
test('sound samples are brief nonempty PCM clips and identical across all platform inputs',()=>{
  for(const [kind,max] of [['correct',.3],['chest',.9],['badge',.8]]){
    const bytes=readFileSync(`public/sounds/${kind}.wav`);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');
    assert.equal(bytes.readUInt16LE(20),1);assert.equal(bytes.readUInt16LE(22),1);assert.equal(bytes.readUInt32LE(24),44100);assert.equal(bytes.readUInt16LE(34),16);
    const length=bytes.readUInt32LE(40);assert.equal(length,bytes.length-44);assert.ok(length/88200<=max);assert.ok(bytes.subarray(44).some(x=>x!==0));
  }
});
