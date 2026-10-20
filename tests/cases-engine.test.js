import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {CASE_PARTS} from '../src/content-files.js';
import {emptySnapshot} from '../src/progress.js';
import * as candles from '../src/technical-charts.js';
import * as formats from '../src/exercise-formats.js';
const source=fs.readFileSync(new URL('../src/course.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const slot=id=>html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)</script>'))?.[1];
const cases=CASE_PARTS.flatMap(p=>JSON.parse(fs.readFileSync(new URL('../src/content/'+p+'.json',import.meta.url))).cases).filter(c=>c.revision);
const correct=s=>s.type==='choice'?{c:s.answer}:s.type==='multi'?{s:s.answers}:s.type==='numeric'?{n:String(s.answer).replace('.',',')}:s.type==='match'?{m:Object.fromEntries(s.pairs.map((_,i)=>[i,String(i)]))}:s.type==='order'?{o:s.answer}:{};
function mount(c){
 const key='case-'+(c.world+1),handlers={},nodes=new Map();let saved=null;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{dataset:{},innerHTML:'',textContent:'',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(selector);};
 const main=node('#br-main');main.querySelector=s=>['#br-number','#br-viz-output'].includes(s)?null:node(s);main.querySelectorAll=()=>[];
 const root={inert:false,querySelector:node,querySelectorAll:()=>[],contains:()=>true,addEventListener:(t,h)=>{handlers[t]=h;}};
 const snapshot={...emptySnapshot(),page:'cases',completedCases:{'case-1':{firstTry:2}},caseSessions:[[key,0,c.steps.map(correct)]]};
 const window={OchavoCandles:candles,OchavoExercises:formats,virutaAccess:{canLearn:()=>true},broteStore:{getSnapshot:()=>snapshot,save:s=>{saved=JSON.parse(JSON.stringify(s));return true;}},virutaGame:{getView:()=>({premium:true,canSpend:true,canPlay:true})},virutaCaseAccess:{load:async()=>structuredClone(c)},virutaSocial:{render(){},update(){}},virutaReconcile(){}};
 vm.runInNewContext(source,{window,document:{getElementById:id=>id==='brote-preview'?root:slot(id)?{textContent:slot(id)}:null},requestAnimationFrame:fn=>fn(),TextEncoder});
 return {window,main,node,get saved(){return saved;},click(dataset){const b={dataset,disabled:false,closest(){return this;},hasAttribute:a=>Object.hasOwn(dataset,a.replace(/^data-/,'').replace(/-([a-z])/g,(_,c)=>c.toUpperCase()))};handlers.click({target:b});}};
}
test('all 129 new protected cases render and accept their solutions through the shared course engine',async()=>{
 assert.equal(cases.length,129);
 for(const c of cases){
  const app=mount(c),key='case-'+(c.world+1);assert.equal(await app.window.BroteCourse.startCase(c.id),true,c.id);
  for(const s of c.steps){
   assert.equal(app.main.dataset.view,'case-lesson',c.id);
   if(s.figure?.kind==='candles')assert.match(app.node('#br-activity').innerHTML,/Consultar/);
   if(s.type!=='learn'){
    app.click({check:''});
    const session=app.saved.caseSessions.find(s=>s[0]===key);
    assert.equal(session[2][session[1]].p,1,c.id+' failed its correct '+s.type+' answer');
   }
   app.click({next:''});
  }
  assert.equal(app.main.dataset.view,'case-success',c.id);
  assert.equal(app.saved.completedCases[key].firstTry,3,c.id);
  assert.equal(app.saved.completedCases['case-1'].firstTry,2);
  assert.equal(app.saved.caseSessions.some(s=>s[0]===key),false);
 }
});
