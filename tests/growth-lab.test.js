import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateGrowthLab,renderGrowthLab,handleGrowthInput,handleGrowthClick,installGrowthLab,readGrowthLabValues} from '../src/growth-lab.js';

const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=1e-10*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);

test('Spanish pasted amounts keep thousands and decimal commas without changing their value',()=>{
 const model=evaluateGrowthLab({kind:'compound',values:{initial:'1.000,50',monthly:'100',years:'15',annualRate:'5,5'}});
 assert.equal(model.result.ok,true);assert.equal(model.values.initial,1000.5);assert.equal(model.values.annualRate,5.5);
 assert.equal(evaluateGrowthLab({kind:'cagr',values:{initial:'1.000',final:'1.210',years:2}}).result.ok,true);
 close(evaluateGrowthLab({kind:'cagr',values:{initial:'1.000',final:'1.210',years:2}}).result.cagr,10);
 assert.equal(evaluateGrowthLab({kind:'compound',values:{initial:'1,000.50'}}).result.ok,false);
 assert.equal(evaluateGrowthLab({kind:'compound',values:{annualRate:'0.125'}}).values.annualRate,0.125);
});

test('the 15/30 year comparison holds rates and initial capital fixed, with compounding',()=>{
  const model=evaluateGrowthLab({kind:'compound',values:{initial:1000,monthly:0,years:15,annualRate:7}});
  assert.equal(model.result.ok,true);
  close(model.result.total,1000*1.07**15);
  assert.deepEqual(model.comparisons.map(item=>item.years),[15,30]);
  close(model.comparisons[1].total,1000*1.07**30);
  assert.ok(model.comparisons[1].growth>model.comparisons[0].growth*2);
  assert.ok(model.comparisons.every(item=>item.contributed===1000));
});

test('monthly contributions are clearly separated from earnings and arrive at month end',()=>{
  const values={initial:1000,monthly:100,years:30,annualRate:7};
  const model=evaluateGrowthLab({kind:'compound',values});
  const rate=1.07**(1/12)-1,months=360;
  close(model.result.total,1000*(1+rate)**months+100*((1+rate)**months-1)/rate);
  assert.equal(model.result.contributed,37000);
  assert.equal(model.comparisons[0].contributed,19000);
  close(model.result.growth,model.result.total-model.result.contributed);
  const html=renderGrowthLab({kind:'compound',values});
  assert.match(html,/fin(?:al de cada mes|al del mes)/);
  assert.match(html,/un plazo mayor también implica poner más dinero de tu bolsillo/);
  assert.match(html,/Dinero que has aportado/);
});

test('changing one hypothesis visibly changes the forecast without changing the input configuration',()=>{
  const config=Object.freeze({kind:'compound',values:Object.freeze({initial:1000,monthly:0,years:30,annualRate:5})});
  const low=evaluateGrowthLab(config,{...config.values,annualRate:3});
  const high=evaluateGrowthLab(config,{...config.values,annualRate:7});
  assert.ok(high.result.total>low.result.total*3);
  assert.equal(config.values.annualRate,5);
});

test('CAGR measures compounded annual equivalence, including losses, rather than total change divided by years',()=>{
  const growth=evaluateGrowthLab({kind:'cagr',values:{initial:100,final:121,years:2}});
  close(growth.result.cagr,10);
  close(growth.result.totalReturn,21);
  assert.equal(growth.comparisons.length,0);
  close(evaluateGrowthLab({kind:'cagr',values:{initial:100,final:81,years:2}}).result.cagr,-10);
  const html=renderGrowthLab({kind:'cagr',values:{initial:100,final:121,years:2}});
  assert.match(html,/no haya aportaciones ni retiradas/);
  assert.match(html,/no significa que la inversión haya ganado lo mismo cada año/);
  assert.match(html,/data-growth-tool="cagr"/);
});

test('fees compare equal contributions and include foregone growth, not just cash charges',()=>{
  const model=evaluateGrowthLab({kind:'fees',values:{initial:1000,monthly:0,years:30,annualRate:7,annualFee:1}});
  close(model.result.withFees,1000*(1.07*.99)**30);
  close(model.result.cost,1000*1.07**30-1000*(1.07*.99)**30);
  assert.match(renderGrowthLab({kind:'fees'}),/No es solo la suma de las comisiones cobradas/);
});

test('inflation distinguishes nominal euros, purchasing power and the future price of a basket',()=>{
  const model=evaluateGrowthLab({kind:'inflation',values:{amount:1000,years:30,inflationRate:3}});
  close(model.result.purchasingPower,1000/1.03**30);
  close(model.result.futureEquivalent,1000*1.03**30);
  assert.ok(model.comparisons[1].purchasingPower<model.comparisons[0].purchasingPower);
  const html=renderGrowthLab({kind:'inflation'});
  assert.match(html,/Poder de compra \(euros de hoy\)/);
  assert.match(html,/Euros guardados/);
});

test('empty, nonnumeric and out-of-range fields do not silently become zero or keep stale results',()=>{
  for(const values of [{initial:''},{monthly:'hola'},{years:101},{annualRate:-100}]){
    const result=evaluateGrowthLab({kind:'compound',values}).result;
    assert.equal(result.ok,false);
  }
  assert.equal(evaluateGrowthLab({kind:'cagr',values:{initial:0}}).result.ok,false);
  const zero=evaluateGrowthLab({kind:'compound',values:{initial:0,monthly:0,years:0,annualRate:0}});
  assert.equal(zero.result.ok,true);assert.equal(zero.result.total,0);
  assert.match(renderGrowthLab({kind:'compound',values:{initial:''}}),/Revisa los datos señalados/);
  assert.match(renderGrowthLab({kind:'compound',values:{initial:''}}),/data-growth-tool="compound" disabled/);
});

test('Spanish decimal commas, fractional months, zero rates and falling markets remain finite',()=>{
  const comma=evaluateGrowthLab({kind:'compound',values:{initial:'1000,50',monthly:'25,5',years:2,annualRate:'0'}});
  close(comma.result.total,1612.5);
  const one=evaluateGrowthLab({kind:'compound',values:{initial:1000,monthly:100,years:1/12,annualRate:0}});
  assert.equal(one.result.total,1100);
  for(const config of [
    {kind:'compound',values:{initial:0,monthly:0,years:0,annualRate:0}},
    {kind:'compound',values:{annualRate:-99}},
    {kind:'cagr',values:{final:0}},
    {kind:'inflation',values:{inflationRate:-99,years:100}},
    {kind:'fees',values:{annualFee:25}}
  ])assert.doesNotMatch(renderGrowthLab(config),/\b(?:NaN|Infinity|undefined)\b/);
});

test('rendered widgets have distinct accessible field IDs, axis units, legends and safe text',()=>{
  const html=renderGrowthLab({kind:'compound',title:'<script>alert(1)</script>',prompt:'Capital "inicial" & plazo'});
  const second=renderGrowthLab({kind:'compound'});
  const firstId=html.match(/<input id="([^"]+)"/)[1],secondId=second.match(/<input id="([^"]+)"/)[1];
  assert.notEqual(firstId,secondId);
  assert.ok(html.includes(`for="${firstId}"`));
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(html,/aria-live="polite"/);assert.match(html,/role="img"/);
  assert.match(html,/mil €/);assert.match(html,/ años<\/text>/);
  assert.match(html,/Saldo con reinversión/);assert.match(html,/Dinero que has aportado/);
  assert.match(html,/data-growth-years="15"/);assert.match(html,/data-growth-years="30"/);
});

function fixture(config={kind:'compound',values:{initial:1000,monthly:0,years:15,annualRate:7}}){
  const model=evaluateGrowthLab(config),inputs=new Map(),errors=new Map(),listeners=new Map();
  const result={innerHTML:'initial'},status={textContent:''},tool={disabled:false};
  const widget={
    getAttribute:key=>key==='data-growth-lab'?JSON.stringify(config):null,
    matches:selector=>selector==='[data-growth-lab]',
    querySelectorAll:selector=>selector==='[data-growth-field]'?[...inputs.values()]:selector==='[data-growth-years]'?presets:[],
    querySelector:selector=>{
      if(selector==='[data-growth-result]')return result;
      if(selector==='[data-growth-status]')return status;
      if(selector==='[data-growth-tool]')return tool;
      const field=selector.match(/^\[data-growth-field="(\w+)"\]$/)?.[1];
      if(field)return inputs.get(field);
      const error=selector.match(/^\[data-growth-error="(\w+)"\]$/)?.[1];
      return errors.get(error);
    },
    addEventListener:(kind,fn)=>listeners.set(kind,fn),removeEventListener:(kind,fn)=>{assert.equal(listeners.get(kind),fn);listeners.delete(kind);}
  };
  for(const [key,value] of Object.entries(model.values)){
    const attrs=new Map();errors.set(key,{textContent:''});
    const input={value:String(value),attrs,getAttribute:name=>name==='data-growth-field'?key:attrs.get(name),setAttribute:(name,next)=>attrs.set(name,next),closest:selector=>selector==='[data-growth-field]'?input:selector==='[data-growth-lab]'?widget:null};
    inputs.set(key,input);
  }
  const presets=[15,30].map(year=>{
    const attrs=new Map();const preset={attrs,getAttribute:key=>key==='data-growth-years'?String(year):attrs.get(key),setAttribute:(name,value)=>attrs.set(name,value),closest:selector=>selector==='[data-growth-years]'?preset:selector==='[data-growth-lab]'?widget:null};return preset;
  });
  return {widget,inputs,errors,presets,result,status,tool,listeners};
}

test('editing a figure updates only the result, preserves the focused field, and clears obsolete output on invalid input',()=>{
  const f=fixture(),initialField=f.inputs.get('initial');
  initialField.value='2000';
  assert.equal(handleGrowthInput({target:initialField}),true);
  assert.match(f.result.innerHTML,/5518,06/);
  assert.equal(f.inputs.get('initial'),initialField);
  initialField.value='';handleGrowthInput({target:initialField});
  assert.equal(initialField.attrs.get('aria-invalid'),'true');
  assert.match(f.result.innerHTML,/Revisa los datos/);
  assert.doesNotMatch(f.result.innerHTML,/oc-growth-main-stat/);
  assert.equal(f.tool.disabled,true);
  initialField.value='1000';handleGrowthInput({target:initialField});
  assert.equal(initialField.attrs.get('aria-invalid'),'false');
  assert.equal(f.errors.get('initial').textContent,'');
  assert.equal(f.tool.disabled,false);
  assert.match(f.status.textContent,/Saldo:/);
});

test('preset controls recalculate from current inputs and the Laboratory handoff reads those same local values',()=>{
  const f=fixture();f.inputs.get('monthly').value='100,5';
  assert.equal(handleGrowthClick({target:f.presets[1]}),true);
  assert.equal(f.inputs.get('years').value,'30');
  assert.equal(f.presets[1].attrs.get('aria-pressed'),'true');
  assert.equal(f.presets[0].attrs.get('aria-pressed'),'false');
  assert.deepEqual(readGrowthLabValues(f.widget),{initial:1000,monthly:100.5,years:30,annualRate:7});
  assert.deepEqual(readGrowthLabValues(f.inputs.get('initial')),readGrowthLabValues(f.widget));
  assert.deepEqual(readGrowthLabValues(null),{});
});

test('access checks gate all experiment handlers and removing the view removes its listeners',()=>{
  const f=fixture();let canUse=false;
  const cleanup=installGrowthLab(f.widget,{canUse:()=>canUse});
  f.inputs.get('initial').value='2000';
  f.listeners.get('input')({target:f.inputs.get('initial')});
  f.listeners.get('click')({target:f.presets[1]});
  assert.equal(f.result.innerHTML,'initial');assert.equal(f.inputs.get('years').value,'15');
  canUse=true;f.listeners.get('click')({target:f.presets[1]});
  assert.notEqual(f.result.innerHTML,'initial');assert.equal(f.inputs.get('years').value,'30');
  cleanup();assert.equal(f.listeners.size,0);
});
