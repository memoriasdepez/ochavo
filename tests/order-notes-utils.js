import {readFileSync} from 'node:fs';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/stocks-order-notes-0354-baseline.json',import.meta.url)));
// Preserve real historical stage guarantees; the current changes have their own scope tests.
export const beforeOrderNotes=lesson=>[504,505,507].includes(lesson.id)?baseline.course.lessons.find(l=>l.id===lesson.id):lesson;
export const beforeOrderNotesFile=path=>path==='src/content/stocks-curriculum-v2.json'?Buffer.from(JSON.stringify(baseline.course,null,2)+'\n'):readFileSync(new URL('../'+path,import.meta.url));
