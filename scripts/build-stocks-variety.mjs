import {writeFile} from 'node:fs/promises';
// Current stock activities are authored together with their teaching in stocks-editorial.
// Retired copy-only placements must never replace them.
await writeFile(new URL('../src/content/stocks-variety-v2.json',import.meta.url),'[]\n');
console.log('Acciones: dinámicas integradas con su explicación.');
