import {beforeDepth} from './depth-test-utils.js';
import {beforeSecondCatalog} from './second-corrections-utils.js';
// Earlier revisions remain testable after the separately requested opening edits.
import {readFileSync} from 'node:fs';
import {parseAuthoring,compileRevision} from '../scripts/course-authoring.mjs';
import {refineStocks} from '../scripts/stocks-editorial/refine.mjs';
import {OPENING_CHANGED_IDS} from '../scripts/stocks-editorial/opening-edits.mjs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
let historical;
export function beforeOpening(lesson){
 if(!OPENING_CHANGED_IDS.includes(lesson.id))return beforeDepth(lesson);
 if(!historical){
  const records=parseAuthoring(Array.from({length:5},(_,i)=>read(`src/content/stocks-v2-authoring/part-${i+1}.txt`)),500);
  historical=refineStocks(compileRevision({outline:JSON.parse(read('src/content/stocks-outline-v2.json')),records,start:450,sources:JSON.parse(read('src/content/stocks-curriculum-v2.json')).sources}),records,{openingEdits:false,depthTeaching:false,secondCorrections:false,lessonNotes:false,marketEdits:false,compoundNotes:false,riskNotes:false,clearWriting:false}).lessons;
 }
 return historical.find(l=>l.id===lesson.id);
}
export function beforeOpeningFile(path){
 const data=readFileSync(new URL('../'+path,import.meta.url));
 if(path!=='src/content/game-catalog.json')return data;
 const catalog=JSON.parse(beforeSecondCatalog(data));delete catalog['answer-453-9'];
 return Buffer.from(JSON.stringify(catalog,null,2)+'\n');
}
