import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterDictionary,dictionaryPage,dictionaryResults,normalizeDictionaryText} from '../src/dictionary.js';
import {createLaboratory} from '../src/laboratory.js';
import {fullCourseTestData} from './course-fixture.js';
const entries=JSON.parse(readFileSync(new URL('../src/content/dictionary-data.json',import.meta.url),'utf8'));
const course=JSON.parse(fullCourseTestData()['br-course']);
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('all course glossary terms and taught technical terms have a definition, without duplicate names',()=>{
 const keys=entries.map(e=>normalizeDictionaryText(e.term));assert.equal(new Set(keys).size,keys.length);
 for(const [word] of course.glossary)assert.ok(keys.includes(normalizeDictionaryText(word)),word);
 for(const entry of entries){assert.ok(entry.definition.length>=10,entry.term);assert.ok(entry.tracks.every(t=>course.tracks.some(track=>track.id===t)));}
 for(const name of ['CAGR','Vela japonesa','Doji','Martillo','RSI','ATR','ADX','VWAP','MACD','Soporte','Resistencia'])assert.ok(entries.some(e=>e.term===name),name);
 assert.ok(entries.filter(e=>e.example).length>=150);
 const collator=new Intl.Collator('es',{sensitivity:'base'});
 for(let i=1;i<entries.length;i++)assert.ok(collator.compare(entries[i-1].term,entries[i].term)<=0);
});

test('search understands accents, aliases and multiple words; track filters keep their scope',()=>{
 assert.ok(filterDictionary(entries,{query:'interes compuesto'}).some(e=>e.term==='Interés compuesto'));
 assert.ok(filterDictionary(entries,{query:'sma'}).some(e=>e.term==='Media simple'));
 assert.ok(filterDictionary(entries,{query:'salto apertura'}).some(e=>e.term==='Hueco de apertura'));
 assert.ok(filterDictionary(entries,{query:'compuesto anual'}).some(e=>e.term==='CAGR'));
 for(const track of course.tracks){const found=filterDictionary(entries,{track:track.id});assert.ok(found.length>80);assert.ok(found.every(e=>e.tracks.includes(track.id)));}
 assert.equal(filterDictionary(entries,{query:'no-existe-esta-palabra'}).length,0);
});

test('the list reveals definitions and examples, renders in batches and escapes all content',()=>{
 const first=dictionaryResults(entries),second=dictionaryResults(entries,{limit:60});
 assert.equal((first.html.match(/<details /g)||[]).length,30);
 assert.equal((second.html.match(/<details /g)||[]).length,60);
 assert.match(first.html,/data-oc-dictionary-more/);
 const cagr=dictionaryResults(entries,{query:'CAGR'});assert.match(cagr.html,/Un ejemplo/);assert.match(cagr.html,/121/);
 assert.doesNotMatch(dictionaryResults(entries,{query:'zzznonexistent'}).html,/data-oc-dictionary-more/);
 const unsafe=[{term:'<script>alert(1)</script>',definition:'<img src=x onerror=alert(1)>',example:'<iframe/>',aliases:[],tracks:[]}];
 assert.doesNotMatch(dictionaryPage(unsafe,{query:'" onfocus="x',track:'all',limit:30}),/<script>|<img|<iframe|value="" onfocus/);
});

function fixture(loadDictionary=async()=>entries){
 const nodes=new Map(),handlers={};let allowed=true;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(selector);};
 const main={dataset:{view:'lab'},innerHTML:'',querySelector:node,querySelectorAll:()=>[],contains:()=>true,insertAdjacentHTML(_p,html){this.innerHTML=html+this.innerHTML;},addEventListener:(type,fn)=>{handlers[type]=fn;},removeEventListener:type=>{delete handlers[type];}};
 globalThis.window={scrollTo(){}};
 const lab=createLaboratory({main,canUse:()=>allowed,loadDictionary});
 const target=(selector,extra={})=>({closest:query=>query===selector?extra:null});
 return {lab,main,node,deny:()=>allowed=false,click:(selector,extra)=>handlers.click({target:target(selector,extra)}),search:value=>handlers.input({target:target('[data-oc-dictionary-search]',{value})})};
}

test('the seventh tile loads only when opened, and native back returns to the tile menu',async()=>{
 let loads=0;const f=fixture(async()=>{loads++;return entries;});f.lab.render();
 assert.equal((f.main.innerHTML.match(/data-oc-lab-open=/g)||[]).length,7);
 assert.match(f.main.innerHTML,/data-oc-lab-open="dictionary"/);assert.equal(loads,0);
 f.lab.open('compound');assert.equal(loads,0);f.lab.back();
 f.click('[data-oc-lab-open]',{dataset:{ocLabOpen:'dictionary'}});await settle();
 assert.equal(loads,1);assert.match(f.main.innerHTML,/Buscar un término/);
 assert.equal(f.lab.back(),true);assert.match(f.main.innerHTML,/oc-lab-grid/);
 f.lab.open('dictionary');await settle();assert.equal(loads,1);
});

test('search and filters update just the list and reset on account change',async()=>{
 const f=fixture();f.lab.open('dictionary');await settle();
 f.search('CAGR');assert.match(f.node('[data-oc-dictionary-results]').innerHTML,/Tasa anual constante/);
 f.click('[data-oc-dictionary-track]',{dataset:{ocDictionaryTrack:'stocks'}});
 assert.match(f.node('[data-oc-dictionary-results]').innerHTML,/CAGR/);
 f.search('zzznonexistent');assert.match(f.node('[data-oc-dictionary-results]').innerHTML,/No encontramos/);
 f.lab.reset();f.lab.open('dictionary');await settle();
 assert.match(f.main.innerHTML,/value="" autocomplete/);assert.match(f.main.innerHTML,/data-oc-dictionary-track="all" aria-pressed="true"/);
});

test('a late dictionary download cannot replace a calculator, closed view or revoked account',async()=>{
 for(const action of ['calculator','reset','deny','dispose']){
  let finish;const f=fixture(()=>new Promise(resolve=>finish=resolve));f.lab.open('dictionary');await settle();
  if(action==='calculator')f.lab.open('cagr');else if(action==='deny')f.deny();else f.lab[action]();
  const before=f.main.innerHTML;finish(entries);await settle();assert.equal(f.main.innerHTML,before,action);
 }
});

test('a failed dictionary download has a working retry without changing course progress',async()=>{
 let loads=0;const f=fixture(async()=>{if(++loads===1)throw Error('offline');return entries;});
 f.lab.open('dictionary');await settle();assert.match(f.main.innerHTML,/Reintentar/);
 f.click('[data-oc-dictionary-retry]');await settle();assert.equal(loads,2);assert.match(f.main.innerHTML,/Buscar un término/);
});
