import {readFileSync} from 'node:fs';
const index=readFileSync(new URL('./indice-300.txt',import.meta.url),'utf8');
const editorial=readFileSync(new URL('./editorial.tsv',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#')).map(l=>l.split('|').map(s=>s.trim()));
export const worlds=[];let section='',current=null,position=0;
for(const line of index.split(/\r?\n/)){let m;if((m=line.match(/^## (.+)/)))section=m[1];else if((m=line.match(/^### Mundo (\d+) — (.+)/))){current={number:+m[1],title:m[2],section,topics:[]};worlds.push(current);}else if((m=line.match(/^\d+\. (.+)/))){const row=editorial[position++];if(!row||row.length!==5)throw Error('Missing editorial row '+position);const [concept,question,correct,...distractors]=row;current.topics.push({title:m[1],concept,question,correct,distractors});}}
if(worlds.length!==30||position!==300||editorial.length!==300||worlds.some(w=>w.topics.length!==10))throw Error('The supplied index requires exactly 30 worlds × 10 points.');
