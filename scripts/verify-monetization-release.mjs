import {readFileSync,readdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {CASE_PARTS} from '../src/content-files.js';
import {CASE_COUNT} from '../src/tracks.js';
import path from 'node:path';
const bytes=file=>readFileSync(file);
const hash=file=>createHash('sha256').update(bytes(file)).digest('hex');
const mirrors=['android/app/src/main/assets/public','ios/App/App/public'];
function verify(relative=''){
  for(const item of readdirSync(path.join('dist',relative),{withFileTypes:true})){
    const child=path.join(relative,item.name);
    if(item.isDirectory())verify(child);
    else for(const mirror of mirrors)assert.equal(hash(path.join('dist',child)),hash(path.join(mirror,child)),mirror+'/'+child);
  }
}
verify();
const html=bytes('dist/index.html').toString('utf8');
const cases=JSON.parse(html.match(/<script[^>]*id="br-cases"[^>]*>([\s\S]*?)<\/script>/)[1]);
assert.equal(cases.length,CASE_COUNT);
for(const item of cases){assert.equal(item.steps,undefined);assert.equal(item.takeaway,undefined);assert.equal(item.sources,undefined);}
for(const source of CASE_PARTS){
  const full=JSON.parse(bytes('src/content/'+source+'.json'));
  for(const item of full.cases)assert.ok(!html.includes(item.steps[0].body),'Premium case explanation leaked into public HTML');
}
console.log('PASS: Android, iOS y web comparten todos los recursos; ningún caso completo está incluido en el paquete público.');
