import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const course=JSON.parse(await readFile(new URL('src/content/etfs-curriculum-v2.json',root),'utf8'));
if(!course.lessons.every(l=>l.editorialRevision==='etfs-reasoning-2026-10-10'))throw Error('Generate the ETF editorial curriculum before variety.');
// Activities belong to explanations; retired substitutions must not overwrite them.
await writeFile(new URL('src/content/etfs-variety-v2.json',root),'[]\n');
console.log('ETFs: authored exercises preserved; legacy substitutions retired.');
