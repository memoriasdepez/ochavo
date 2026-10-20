import {readFileSync} from 'node:fs';
import {beforeClearWriting} from './clear-writing-utils.js';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/stocks-risk-notes-0352-baseline.json',import.meta.url)));
export const beforeRiskNotes=lesson=>baseline.before.find(l=>l.id===lesson.id)||beforeClearWriting(lesson);
