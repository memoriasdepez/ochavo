// Keep earlier editorial contracts testable without imposing their old wording
// on the separately authorised 53–500 development. Current content is tested
// independently against the 0.32.0 baseline in stocks-depth.test.js.
import {readFileSync} from 'node:fs';
import {parseAuthoring,compileRevision} from '../scripts/course-authoring.mjs';
import {refineStocks} from '../scripts/stocks-editorial/refine.mjs';
import {beforeSecondCorrections} from './second-corrections-utils.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
let historical;
export function beforeDepth(lesson){
 if(lesson.id<502)return beforeSecondCorrections(lesson);
 if(!historical){
  const records=parseAuthoring(Array.from({length:5},(_,i)=>read(`src/content/stocks-v2-authoring/part-${i+1}.txt`)),500);
  historical=refineStocks(compileRevision({outline:JSON.parse(read('src/content/stocks-outline-v2.json')),records,start:450,sources:[]}),records,{depthTeaching:false,secondCorrections:false,lessonNotes:false,marketEdits:false,compoundNotes:false,riskNotes:false,clearWriting:false}).lessons;
 }
 return historical.find(l=>l.id===lesson.id);
}
