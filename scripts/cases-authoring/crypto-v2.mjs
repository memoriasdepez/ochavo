import {writeFileSync} from 'node:fs';
import {cases as first} from './crypto-01-10.mjs';
import {cases as middle} from './crypto-11-20.mjs';
import {cases as last} from './crypto-21-30.mjs';
import {source} from './crypto-helpers.mjs';

export const cases=[...first,...middle,...last];
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const bodies=new Set();
for(const [index,item] of cases.entries()){
  check(item.id===`crypto-v2-${index+1}` && item.world===115+index,'Identity '+item.id);
  check(item.steps.length===6,'Steps '+item.id);
  check(new Set(item.steps.filter(s=>s.type!=='learn').map(s=>s.type)).size>=2,'Formats '+item.id);
  check(item.steps.filter(s=>s.figure).length>=2,'Figures '+item.id);
  check(item.steps.some(s=>s.explore?.options.length>=2),'Explore '+item.id);
  for(const [i,step] of item.steps.entries()){
    check((step.type==='learn')===(i%2===0),'Alternation '+item.id);
    if(step.type==='learn'){
      check(step.body.split(/\s+/u).length>=60,`Too short ${item.id} ${step.title}`);
      check(!bodies.has(step.body),'Duplicate body '+item.id);bodies.add(step.body);
    }
  }
}
check(cases.length===30,'Expected 30 cases');
writeFileSync(new URL('../../src/content/cases-crypto-v2.json',import.meta.url),JSON.stringify({cases},null,2)+'\n');
const sources=Object.entries(source).map(([key,[title,url,verifiedClaim]])=>({key,title,url,primary:true,checkedAt:'2026-10-09',verification:'Página oficial abierta y contenido relevante revisado con búsqueda web',verifiedClaim,worlds:cases.filter(c=>c.sources.some(s=>s.url===url)).map(c=>c.world)})).filter(s=>s.worlds.length);
writeFileSync(new URL('./crypto-sources.json',import.meta.url),JSON.stringify({checkedAt:'2026-10-09',scope:'Hechos de funcionamiento; todas las cifras de ejercicios se identifican como simulaciones, salvo reglas de protocolo expresamente descritas.',sources},null,2)+'\n');
console.log(`Cripto: ${cases.length} casos, ${bodies.size} explicaciones originales, ${sources.length} fuentes oficiales.`);
