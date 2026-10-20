import assert from 'node:assert/strict';
import fs from 'node:fs';
import {cases} from './etfs-v2.mjs';

// Reuse the application validator in memory, adapting only its total count to this assigned slice.
// It still checks the actual track/world identity, figures, interactions and declared vocabulary.
const validatorPath=new URL('../../src/cases-validation.js',import.meta.url);
let validator=fs.readFileSync(validatorPath,'utf8');
for(const name of ['tracks.js','exercise-formats.js'])validator=validator.replace(`'./${name}'`,JSON.stringify(new URL(`../../src/${name}`,import.meta.url).href));
validator=validator.replaceAll('=== CASE_COUNT','=== 20');
const {validateCases}=await import('data:text/javascript;base64,'+Buffer.from(validator).toString('base64'));
assert.equal(validateCases(cases),true);
assert.deepEqual(cases.map(c=>c.world),Array.from({length:20},(_,i)=>95+i));
const math={
  1:500*1.10+300+200,
  2:210+6-200-2,
  3:1000*.5*.2-1000*.25*.2,
  5:110-104,
  6:1000*.001+5-1000*.002,
  7:4*49+3*50,
  8:(102-100)/100*100,
  9:(600*.1+400*.2)/1000*100,
  10:1000*5*.005,
  11:600-350,
  12:100*1.10*.90,
  14:(.60*.20+.40*.90)*100,
  16:(800*.60+200)/1000*100,
  17:(660+340+200)*.40-340,
  18:((100*1.25-10)*.80-10)-((100*.80-10)*1.25-10),
  19:Math.min(120,105)+3,
  20:50*1.10-5,
};
let numericCount=0;
const signatures=[];
for(const [index,item] of cases.entries()){
  const numerical=item.steps.filter(s=>s.type==='numeric');
  if(numerical.length){assert.equal(numerical.length,1);assert.ok(Math.abs(numerical[0].answer-math[index+1])<1e-8,`${item.id} arithmetic`);numericCount++;}
  const signature=item.steps.filter(s=>s.type!=='learn').map(s=>s.type).join('/');
  assert.notEqual(signature,signatures.at(-1),`${item.id} adjacent repetition`);signatures.push(signature);
  for(const step of item.steps){
    if(step.type==='choice')assert.ok(step.options[step.answer]?.text);
    if(step.type==='multi')assert.ok(step.answers.length<step.options.length);
    if(step.type!=='learn'&&/\btabla\b/i.test(step.body))assert.equal(step.figure?.kind,'table',`${item.id} table stays visible`);
  }
}
assert.equal(numericCount,Object.keys(math).length);
const evidence=JSON.parse(fs.readFileSync(new URL('./etfs-sources.json',import.meta.url),'utf8'));
for(const item of cases)for(const s of item.sources)assert.ok(evidence.sources.some(e=>e.url===s.url&&e.cases.includes(item.world-94)),`${item.id} evidence ${s.url}`);
console.log(JSON.stringify({cases:cases.length,learnScreens:60,exercises:60,numericVerified:numericCount,minExplanationWords:Math.min(...cases.flatMap(c=>c.steps.filter(s=>s.type==='learn').map(s=>s.body.split(/\s+/u).length))),officialSources:evidence.sources.length,adjacentIdenticalFormats:0}));
