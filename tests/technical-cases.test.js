import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const {cases}=read('src/content/cases-technical-v1.json');
const market=read('scripts/cases-authoring/technical-market-data.json');
const operations={
 'difference':([a,b])=>a-b,
 'return':([end,start])=>(end-start)/start*100,
 'range-percent':([high,low,open])=>(high-low)/open*100,
 'projection':([high,low])=>2*low-high,
 'retracement':([high,low,percent])=>high-(high-low)*percent/100,
 'mean':a=>a.reduce((s,n)=>s+n,0)/a.length,
 'rsi':([up,down])=>100-(100/(1+up/down)),
 'true-range':([previous,high,low])=>Math.max(high-low,Math.abs(high-previous),Math.abs(low-previous)),
 'weighted-price':([v1,p1,v2,p2])=>(v1*p1+v2*p2)/(v1+v2),
 'loss-with-cost':([entry,exit,cost])=>entry-exit+cost,
 'floor-ratio':([budget,unit])=>Math.floor(budget/unit),
 'expectancy-total':([wins,gain,losses,loss])=>wins*gain-losses*loss,
 'net-trades':([gross,count,cost])=>gross-count*cost,
 'ratio-percent':([a,b])=>a/b*100,
 'product':a=>a.reduce((a,b)=>a*b,1),
};
test('technical case numerical answers independently match their displayed inputs',()=>{
 let count=0;
 for(const c of cases)for(const s of c.steps.filter(s=>s.type==='numeric')){
  const {operation,operands}=s.calculation||{};
  assert.equal(typeof operations[operation],'function',c.id+' '+operation);
  assert.ok(operands.every(Number.isFinite));
  const expected=Math.round(operations[operation](operands)*100)/100;
  assert.equal(s.answer,expected,`${c.id}: ${s.body}`);
  assert.ok(Number.isFinite(s.tolerance)&&s.tolerance<=.02);
  count++;
 }
 assert.ok(count>=20);
});
test('technical historical charts preserve source OHLCV values, chronology and labels',()=>{
 assert.equal(cases.length,29);
 for(const c of cases){
  const chart=c.steps[0].figure;
  assert.equal(chart.kind,'candles');assert.equal(chart.provenance.dataKind,'historical');
  const set=market.datasets.find(d=>d.product===chart.provenance.product);
  assert.ok(set);assert.equal(chart.provenance.sourceUrl,set.url);
  const start=Date.parse(chart.provenance.start+'T00:00:00Z')/1000;
  const rows=set.rows.filter(r=>r[0]>=start).slice(0,chart.candles.length);
  assert.equal(chart.labels.length,rows.length);
  rows.forEach((r,i)=>{
   assert.deepEqual(chart.candles[i],{o:r[3],h:r[2],l:r[1],c:r[4],v:r[5]});
   assert.equal(r[0],start+i*86400);
   assert.equal(chart.labels[i],new Date(r[0]*1000).toISOString().slice(5,10));
  });
  if(c.world!==145)assert.equal(chart.lineMode,false,'Candlestick lessons need candlesticks');
 }
});
