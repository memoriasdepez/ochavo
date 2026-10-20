import test from 'node:test';
import assert from 'node:assert/strict';
import {createLaboratory} from '../src/laboratory.js';

function fixture(){
 const nodes=new Map(),handlers={};let allowed=true;
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',textContent:'',dataset:{},setAttribute(){},focus(){},scrollIntoView(){}});return nodes.get(selector);};
 const main={dataset:{view:'lab'},innerHTML:'',querySelector:node,contains:()=>true,
  insertAdjacentHTML(position,html){this.innerHTML=html+this.innerHTML;},
  addEventListener:(type,fn)=>{handlers[type]=fn;},removeEventListener:type=>{delete handlers[type];}};
 globalThis.window={scrollTo(){}};
 const lab=createLaboratory({main,canUse:()=>allowed});
 return {lab,main,deny:()=>{allowed=false;},click(selector){handlers.click({target:{closest:query=>query===selector?{}:null}});}};
}

test('a lesson opens a calculator with its figures and can return without awarding progress',()=>{
 const f=fixture();let returns=0;
 assert.equal(f.lab.open('compound',{values:{initial:2500,monthly:50,years:30,annualRate:5},onReturn:()=>{returns++;}}),true);
 assert.match(f.main.innerHTML,/Volver a la lección/);
 assert.match(f.main.innerHTML,/name="initial" value="2500"/);
 assert.match(f.main.innerHTML,/name="years" value="30"/);
 assert.equal(f.lab.back(),true);assert.equal(returns,1);
 assert.equal(f.lab.back(),false);assert.equal(returns,1);
});

test('all calculators remains a real destination and keeps the explicit lesson return',()=>{
 const f=fixture();let returns=0;
 f.lab.open('cagr',{onReturn:()=>{returns++;}});
 f.click('[data-oc-lab-back]');
 assert.equal(returns,0);
 assert.match(f.main.innerHTML,/Pon tus ideas a prueba/);
 assert.match(f.main.innerHTML,/Volver a la lección/);
 f.click('[data-oc-lab-return]');assert.equal(returns,1);
});

test('reset, revocation and disposal prevent a stale account callback',()=>{
 for(const action of ['reset','deny','dispose']){
  const f=fixture();let returns=0;
  f.lab.open('cagr',{onReturn:()=>{returns++;}});
  if(action==='deny')f.deny();else f.lab[action]();
  assert.equal(f.lab.back(),false);assert.equal(returns,0);
 }
});
