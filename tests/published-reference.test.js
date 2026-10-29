import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
const slot=(html,id)=>JSON.parse(html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))[1]);
const reference='referencias/ochavo-app-2026-10-21/';
const continuity='referencias/continuidad-2026-10-30/';
const revision=JSON.parse(text(continuity+'revision.json'));
function expectedSlot(html,id){
 const data=slot(html,id);
 if(id==='br-invest-lessons')for(const [lesson,metadata] of Object.entries(revision.lessonMetadata))data[lesson]=metadata;
 if(id==='br-course')data.worldFiles=data.worldFiles.map(w=>revision.worldFiles[w.id]||w);
 return data;
}

test('the rebuilt curriculum and all 175 world payloads reproduce the published reference',()=>{
  const expected=text(reference+'index.html'),actual=text('index.html');
  for(const id of ['br-invest-lessons','br-reading-support','br-exams','br-course','br-cases']){
    assert.deepEqual(slot(actual,id),expectedSlot(expected,id),'Published metadata: '+id);
  }
  const worlds=expectedSlot(expected,'br-course').worldFiles;
  assert.equal(worlds.length,175);
  for(const world of worlds){
    const path=world.url.slice(1);
    assert.equal(text('public/'+path),text((revision.worldFiles[world.id]?continuity:reference)+path),'Published world '+world.id);
  }
});
