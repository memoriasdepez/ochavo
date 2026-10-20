import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCourseContent} from '../src/course-content.js';
import {TRACKS} from '../src/tracks.js';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slot=id=>JSON.parse(html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
export const courseManifest=()=>({course:slot('br-course'),lessons:slot('br-invest-lessons'),exams:slot('br-exams')});
export const filePayload=url=>JSON.parse(readFileSync(new URL('../public'+url,import.meta.url),'utf8'));
const respond=url=>({ok:true,json:async()=>filePayload(url)});

test('initial HTML contains metadata, not exercise bodies; 175 hashed worlds preserve active content and history',()=>{
 const {course,lessons,exams}=courseManifest();
 assert.equal(lessons.length,1750);assert.equal(exams.length,175);assert.equal(course.worldFiles.length,175);
 assert.ok(lessons.every(l=>l.steps.every(s=>!('body' in s)&&!('answer' in s)&&!('activity' in s))));
 const publicCases=slot('br-cases'),caseBytes=Buffer.byteLength(JSON.stringify(publicCases));
 assert.equal(publicCases.length,174);
 assert.ok(publicCases.every(c=>!('steps' in c)&&!('sources' in c)), 'Paid case content must not enter the HTML');
 assert.ok(caseBytes<175_000, 'The extended case catalogue must remain metadata only');
 assert.ok(Buffer.byteLength(html)-caseBytes<950_000, 'The lesson metadata budget must not grow with the cases');
 for(const track of TRACKS){
   const files=course.worldFiles.filter(f=>track.groupIds.includes(f.id));
   assert.deepEqual(files.map(f=>f.id),track.groupIds);
   assert.deepEqual(files.flatMap(f=>f.lessonIds),track.lessonIds);
   for(const file of files){const data=filePayload(file.url);assert.equal(data.worldId,file.id);assert.deepEqual(data.lessons.map(l=>l.id),file.lessonIds);assert.equal(data.exam.steps.length,10);}
 }
});
test('loads only requested worlds, deduplicates concurrent requests and reuses downloaded content',async()=>{
 const data=courseManifest(),requests=[];
 const loader=createCourseContent({...data,fetchFile:async url=>{requests.push(url);return respond(url);}});
 assert.deepEqual(requests,[]);assert.equal(loader.hasWorld(0),false);
 await Promise.all([loader.ensureWorlds([0,1]),loader.ensureWorlds([1,0,1])]);
 assert.equal(requests.length,2);assert.equal(loader.loadedWorldIds().length,2);
 assert.ok(data.lessons[0].steps[0].body);assert.equal(data.lessons[20].steps[0].body,undefined);
 await loader.ensureWorlds([0,1]);assert.equal(requests.length,2);
 await loader.ensureWorlds([2,3]);assert.equal(requests.length,4);
});
test('network failures can be retried without losing or partially replacing course data',async()=>{
 const data=courseManifest(),before=JSON.stringify(data.lessons.slice(0,10));let fail=true;
 const loader=createCourseContent({...data,fetchFile:async url=>{if(fail)throw Error('offline');return respond(url);}});
 await assert.rejects(loader.ensureWorld(0));assert.equal(loader.hasWorld(0),false);assert.equal(JSON.stringify(data.lessons.slice(0,10)),before);
 fail=false;await loader.ensureWorld(0);assert.equal(loader.hasWorld(0),true);
});
test('a wrong world or incomplete last lesson cannot expose partially loaded exercises',async()=>{
 for(const mutate of [d=>d.worldId=1,d=>delete d.lessons.at(-1).steps.at(-1).body,d=>d.exam.id=1]){
  const data=courseManifest(),before=JSON.stringify(data.lessons),payload=filePayload(data.course.worldFiles[0].url);mutate(payload);
  const loader=createCourseContent({...data,fetchFile:async()=>({ok:true,json:async()=>payload})});
  await assert.rejects(loader.ensureWorld(0));assert.equal(JSON.stringify(data.lessons),before);assert.equal(loader.hasWorld(0),false);
 }
});
test('a timed-out request aborts and a later retry succeeds',async()=>{
 const data=courseManifest();let stalled=true,aborted=false;
 const loader=createCourseContent({...data,timeoutMs:10,fetchFile:(url,{signal})=>stalled?new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})):Promise.resolve(respond(url))});
 await assert.rejects(loader.ensureWorld(0));assert.equal(aborted,true);stalled=false;await loader.ensureWorld(0);assert.equal(loader.hasWorld(0),true);
});
