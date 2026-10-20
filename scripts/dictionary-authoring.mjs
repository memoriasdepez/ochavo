import {readFile,writeFile} from 'node:fs/promises';

const normalize=text=>String(text||'').normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase('es').replace(/\s+/g,' ').trim();
const root=new URL('../',import.meta.url);
const escapeRegex=text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** Reuse course definitions; additions and illustrative examples have one authoring source. */
export async function buildDictionary({course,lessons}){
 const entries=new Map();
 const add=(term,definition,extra={})=>{
  const key=normalize(term);if(!key||!String(definition||'').trim())throw Error('Incomplete dictionary term');
  entries.set(key,{term,definition,aliases:[],example:'',...entries.get(key),...extra});
 };
 for(const [term,definition] of course.glossary||[])add(term,definition);
 for(const track of course.tracks){
  for(const [term,definition] of track.glossary||[])add(term,definition);
  for(const id of track.lessonIds)for(const step of lessons[id].steps)for(const term of step.terms||[])add(term.word,term.meaning);
 }
 const authored=await readFile(new URL('src/content/dictionary-examples.tsv',root),'utf8');
 for(const line of authored.trim().split(/\r?\n/)){
  const [term,definition,example='',aliases='']=line.split('|');
  add(term,definition,{definition,example,aliases:aliases.split(';').filter(Boolean)});
 }
 // Track labels are built offline; consulting the dictionary never downloads lesson packs.
 const teaching=course.tracks.map(track=>({id:track.id,text:normalize(track.lessonIds.map(id=>{
  const l=lessons[id];return [l.title,l.summary,...l.steps.filter(s=>s.type==='learn').map(s=>[s.title,s.body,s.takeaway].join(' '))].join(' ');
 }).join(' '))}));
 const collator=new Intl.Collator('es',{sensitivity:'base'});
 const result=[...entries.values()].map(entry=>{
  const patterns=[entry.term,...entry.aliases].map(normalize).map(term=>new RegExp('(^|[^\\p{L}\\p{N}])'+escapeRegex(term)+'([^\\p{L}\\p{N}]|$)','u'));
  return {...entry,tracks:teaching.filter(t=>patterns.some(pattern=>pattern.test(t.text))).map(t=>t.id)};
 }).sort((a,b)=>collator.compare(a.term,b.term));
 await writeFile(new URL('src/content/dictionary-data.json',root),JSON.stringify(result,null,2)+'\n');
 console.log(`Diccionario: ${result.length} términos, ${result.filter(e=>e.example).length} ejemplos.`);
 return result;
}
