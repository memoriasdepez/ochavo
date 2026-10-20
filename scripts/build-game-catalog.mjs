import {readFile,writeFile} from 'node:fs/promises';
import {COURSE_PARTS} from '../src/content-files.js';
import {createGameCatalog} from '../src/game-domain.js';

// Prepare the client's reward catalogue without contacting Firebase or changing balances.
const root=new URL('../src/content/',import.meta.url);
const parts=await Promise.all(COURSE_PARTS.map(async name=>JSON.parse(await readFile(new URL(name+'.json',root),'utf8'))));
const catalog=createGameCatalog({lessons:parts.flatMap(part=>part.lessons),exams:parts.flatMap(part=>part.exams)});
await writeFile(new URL('game-catalog.json',root),JSON.stringify(catalog,null,2)+'\n');
console.log(`Catálogo local: ${Object.keys(catalog).length} recompensas y acciones; sin publicación ni cambios de saldo.`);
