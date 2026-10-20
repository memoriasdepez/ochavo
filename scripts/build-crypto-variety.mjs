import {readFile,writeFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const course=JSON.parse(await readFile(new URL('src/content/crypto-curriculum-v2.json',root),'utf8'));
if(!course.lessons.every(l=>l.editorialRevision==='crypto-reasoning-2026-10-10'))throw Error('Generate the Cripto editorial curriculum before variety.');
// These activities are authored with their teaching; never reinsert counting/copying drills.
await writeFile(new URL('src/content/crypto-variety-v2.json',root),'[]\n');
console.log('Cripto: authored exercises preserved; legacy substitutions retired.');
