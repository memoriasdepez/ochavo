// Earlier editorial guarantees are tested against their actual authored stage;
// the current 11–15 revision has its own preservation and engine tests.
import {readFileSync} from 'node:fs';
import {parseAuthoring,compileRevision} from '../scripts/course-authoring.mjs';
import {refineStocks} from '../scripts/stocks-editorial/refine.mjs';
import {SECOND_CORRECTIONS_IDS} from '../scripts/stocks-editorial/second-corrections.mjs';
import {beforeLessonNotes} from './lesson-notes-utils.js';
import {beforeMarketCatalog} from './market-edits-utils.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
let previous;
export function beforeSecondCorrections(lesson){
 lesson=beforeLessonNotes(lesson);
 if(!SECOND_CORRECTIONS_IDS.includes(lesson.id))return lesson;
 if(!previous){
  const records=parseAuthoring(Array.from({length:5},(_,i)=>read(`src/content/stocks-v2-authoring/part-${i+1}.txt`)),500);
  previous=refineStocks(compileRevision({outline:JSON.parse(read('src/content/stocks-outline-v2.json')),records,start:450,sources:[]}),records,{secondCorrections:false,lessonNotes:false,marketEdits:false,compoundNotes:false,riskNotes:false,clearWriting:false}).lessons;
 }
 return previous.find(l=>l.id===lesson.id);
}
export function beforeSecondCatalog(raw){
 const catalog=JSON.parse(beforeMarketCatalog(raw));delete catalog['answer-462-9'];return Buffer.from(JSON.stringify(catalog,null,2)+'\n');
}
