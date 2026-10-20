import {readFileSync} from 'node:fs';
import {beforeRiskNotes} from './risk-notes-utils.js';
const baseline=JSON.parse(readFileSync(new URL('./fixtures/stocks-compound-notes-0351-baseline.json',import.meta.url)));
// Restore real pre-edit teaching for historical assertions, without changing
// the course engine or weakening the current revision's own coverage.
export const beforeCompoundNotes=lesson=>baseline.before.find(l=>l.id===lesson.id)||beforeRiskNotes(lesson);
