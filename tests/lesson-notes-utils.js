// Restore the actual 0.34.1 authoring for earlier-stage guarantees.
import {readFileSync} from 'node:fs';
import {beforeMarketEdits} from './market-edits-utils.js';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/stocks-notes-0341-baseline.json',import.meta.url)));
export function beforeLessonNotes(lesson){
 lesson=beforeMarketEdits(lesson);
 return baseline.before.find(l=>l.id===lesson.id)||lesson;
}
