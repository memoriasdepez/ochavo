import {readFileSync} from 'node:fs';
import {beforeCompoundNotes} from './compound-notes-utils.js';
const previous=JSON.parse(readFileSync(new URL('./fixtures/stocks-market-0342-baseline.json',import.meta.url)));
export const beforeMarketEdits=lesson=>previous.before.find(l=>l.id===lesson.id)||beforeCompoundNotes(lesson);
export function beforeMarketCatalog(raw){const catalog=JSON.parse(raw);delete catalog['answer-471-9'];return Buffer.from(JSON.stringify(catalog,null,2)+'\n');}
