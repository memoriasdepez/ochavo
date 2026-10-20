import {readFileSync} from 'node:fs';
// Actual generated course after the risk changes and before the style pass.
const baseline=JSON.parse(readFileSync(new URL('./fixtures/stocks-clear-writing-baseline.json',import.meta.url)));
export const beforeClearWriting=lesson=>baseline.before.find(l=>l.id===lesson.id)||lesson;
