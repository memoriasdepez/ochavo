import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases} from './crypto-v2.mjs';
let validator=fs.readFileSync(new URL('../../src/cases-validation.js',import.meta.url),'utf8');
for(const name of ['tracks.js','exercise-formats.js'])validator=validator.replace(`'./${name}'`,JSON.stringify(new URL(`../../src/${name}`,import.meta.url).href));
validator=validator.replaceAll('=== CASE_COUNT','=== 30');
const {validateCases}=await import('data:text/javascript;base64,'+Buffer.from(validator).toString('base64'));
assert.equal(validateCases(cases),true);
const calculations={1:150-105,2:30000-18000-11200,3:20-3-4,5:80-2,6:400-25,7:200*(1-.03),8:(600+100)*3,9:10*10+5*9,10:200-120-80,12:200-200*.97,13:20*10-21*8,14:10*100/200,15:600*.75/300,16:(3+7)-(6+2),17:(260-200)/200*100,18:((2000/200)-(3000/400))/(2000/200)*100,19:((8+2)-(4+2))/(8+2)*100,20:23-18,21:5*(3+2),22:4*.002+.003,23:100-2-3,25:.01+.02+.01,26:24/1200*100,27:20-7,28:30/1500*100,29:250-230};
let previous;
const wordCounts=[];
for(const [i,item] of cases.entries()){
  const signature=item.steps.filter(s=>s.type!=='learn').map(s=>s.type).join('/');
  assert.notEqual(signature,previous,item.id+' adjacent exercise pattern');previous=signature;
  const numerical=item.steps.filter(s=>s.type==='numeric');
  assert.equal(numerical.length,calculations[i+1]===undefined?0:1,item.id+' numeric count');
  for(const step of numerical)assert.ok(Math.abs(step.answer-calculations[i+1])<1e-8,item.id+' arithmetic');
  for(const step of item.steps){
    if(step.type==='learn')wordCounts.push(step.body.split(/\s+/u).length);
    if(step.type==='multi')assert.ok(step.answers.length<step.options.length,item.id+' multi must have distractor');
  }
}
const sources=JSON.parse(fs.readFileSync(new URL('./crypto-sources.json',import.meta.url),'utf8')).sources;
for(const item of cases)for(const s of item.sources)assert.ok(sources.some(r=>r.url===s.url&&r.worlds.includes(item.world)),item.id+' source registry');
console.log(JSON.stringify({cases:cases.length,learnScreens:wordCounts.length,minWords:Math.min(...wordCounts),numericRecomputed:Object.keys(calculations).length,exerciseTypes:[...new Set(cases.flatMap(c=>c.steps.filter(s=>s.type!=='learn').map(s=>s.type)))],figures:cases.flatMap(c=>c.steps).filter(s=>s.figure).length,explores:cases.flatMap(c=>c.steps).filter(s=>s.explore).length,adjacentIdenticalPatterns:0,sources:sources.length}));
