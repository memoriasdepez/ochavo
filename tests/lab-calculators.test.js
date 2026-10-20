import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCompound,calculateCagr,calculateRecovery,calculateFees,calculateInflation,calculateFreedom} from '../src/lab-calculators.js';

const close=(actual,expected,tolerance=1e-10)=>assert.ok(Math.abs(actual-expected)<=tolerance*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
const invested={initial:1000,monthly:100,years:10,annualRate:7};
const freedom={monthlyExpenses:2000,withdrawalRate:4,initial:10000,monthly:500,annualRate:5};
const finiteTree=value=>{
  if(typeof value==='number')assert.ok(Number.isFinite(value),`Nonfinite number ${value}`);
  else if(value&&typeof value==='object')Object.values(value).forEach(finiteTree);
};

test('one effective annual period grows by the entered annual rate, not annual/12',()=>{
  const result=calculateCompound({initial:1000,monthly:0,years:1,annualRate:12});
  assert.equal(result.ok,true);
  close(result.total,1120);
  assert.equal(result.contributed,1000);
  close(result.growth,120);
  assert.equal(result.series.length,2);
});

test('monthly deposits earn only after they arrive at the end of the month',()=>{
  // Choose an effective annual rate corresponding to exactly 1% per month.
  const annualRate=(1.01**12-1)*100;
  const oneMonth=calculateCompound({initial:1000,monthly:100,years:1/12,annualRate});
  const twoMonths=calculateCompound({initial:1000,monthly:100,years:2/12,annualRate});
  close(oneMonth.total,1110);
  close(twoMonths.total,1221.1);
  close(twoMonths.contributed,1200);
  close(twoMonths.growth,21.1);
  assert.equal(twoMonths.series.at(-1).month,2);
});

test('compound annuity matches an independent closed-form future value',()=>{
  const result=calculateCompound(invested);
  const factor=1.07**(1/12),months=120;
  const expected=1000*factor**months+100*(factor**months-1)/(factor-1);
  close(result.total,expected);
  assert.equal(result.contributed,13000);
  assert.equal(result.series.length,11);
  assert.deepEqual(result.series[0],{month:0,years:0,balance:1000,contributed:1000});
  close(result.series.at(-1).balance,result.total);
});

test('zero return, zero horizon, fractional months and negative returns are explicit',()=>{
  const flat=calculateCompound({...invested,annualRate:0});
  assert.equal(flat.total,13000);
  assert.equal(flat.growth,0);
  const now=calculateCompound({...invested,years:0});
  assert.equal(now.total,1000);
  assert.equal(now.series.length,1);
  const rounded=calculateCompound({...invested,years:0.1,annualRate:0});
  assert.equal(rounded.months,1);
  assert.equal(rounded.years,1/12);
  const decline=calculateCompound({initial:1000,monthly:0,years:2,annualRate:-50});
  close(decline.total,250);
  close(decline.growth,-750);
});

test('CAGR annualizes compound growth, losses, zero final value and sub-year periods',()=>{
  close(calculateCagr({initial:100,final:121,years:2}).cagr,10);
  close(calculateCagr({initial:100,final:125.9712,years:3}).cagr,8);
  close(calculateCagr({initial:100,final:81,years:2}).cagr,-10);
  assert.equal(calculateCagr({initial:100,final:0,years:2}).cagr,-100);
  close(calculateCagr({initial:100,final:110,years:0.5}).cagr,21);
  const unchanged=calculateCagr({initial:100,final:100,years:100});
  assert.equal(unchanged.cagr,0);
  assert.equal(unchanged.totalReturn,0);
});

test('a percentage fall requires a larger gain; complete loss cannot recover by growth alone',()=>{
  assert.deepEqual(calculateRecovery({lossPercent:0}),{ok:true,recoverable:true,requiredGain:0,remainingPercent:100});
  close(calculateRecovery({lossPercent:20}).requiredGain,25);
  close(calculateRecovery({lossPercent:50}).requiredGain,100);
  close(calculateRecovery({lossPercent:80}).requiredGain,400);
  assert.deepEqual(calculateRecovery({lossPercent:100}),{ok:true,recoverable:false,requiredGain:null,remainingPercent:0});
});

test('fees multiply the annual wealth factor and compare exactly the same cash flows',()=>{
  const result=calculateFees({initial:1000,monthly:0,years:2,annualRate:10,annualFee:1});
  close(result.netAnnualRate,8.9);
  close(result.withoutFees,1210);
  close(result.withFees,1000*1.1**2*0.99**2);
  close(result.cost,result.withoutFees-result.withFees);
  assert.equal(result.contributed,1000);
  assert.equal(result.series[0].withoutFees,1000);
  assert.equal(result.series[0].withFees,1000);
});

test('zero fees cost nothing and monthly fee projections agree with annuity math',()=>{
  const none=calculateFees({...invested,annualFee:0});
  assert.equal(none.withFees,none.withoutFees);
  assert.equal(none.cost,0);
  const charged=calculateFees({...invested,annualFee:2});
  const factor=(1.07*0.98)**(1/12),months=120;
  close(charged.withFees,1000*factor**months+100*(factor**months-1)/(factor-1));
  assert.equal(charged.contributed,13000);
  assert.ok(charged.cost>0);
  for(const point of charged.series)assert.ok(point.withoutFees>=point.withFees);
});

test('fee comparison remains meaningful when gross returns are negative',()=>{
  const result=calculateFees({initial:1000,monthly:0,years:1,annualRate:-50,annualFee:10});
  close(result.withoutFees,500);
  close(result.withFees,450);
  close(result.netAnnualRate,-55);
  close(result.cost,50);
});

test('inflation separates future replacement cost from purchasing power of fixed money',()=>{
  const result=calculateInflation({amount:1000,years:2,inflationRate:10});
  close(result.futureEquivalent,1210);
  close(result.purchasingPower,1000/1.21);
  close(result.priceIncrease,210);
  close(result.purchasingPowerLoss,1000-1000/1.21);
  assert.equal(result.series.length,3);
  close(result.series.at(-1).futureEquivalent,result.futureEquivalent);
});

test('zero inflation, deflation and fractional years retain their meaning',()=>{
  const flat=calculateInflation({amount:1000,years:20,inflationRate:0});
  assert.equal(flat.futureEquivalent,1000);
  assert.equal(flat.purchasingPower,1000);
  const deflation=calculateInflation({amount:1000,years:1,inflationRate:-10});
  close(deflation.futureEquivalent,900);
  close(deflation.purchasingPower,1000/0.9);
  assert.ok(deflation.purchasingPowerLoss<0);
  const fractional=calculateInflation({amount:1000,years:1.5,inflationRate:10});
  close(fractional.futureEquivalent,1000*1.1**1.5);
  assert.deepEqual(fractional.series.map(point=>point.years),[0,1,1.5]);
  assert.equal(calculateInflation({amount:0,years:0,inflationRate:0}).series.length,1);
});

test('financial freedom uses the user withdrawal hypothesis and detects immediate goals',()=>{
  const result=calculateFreedom({...freedom,initial:600000});
  assert.equal(result.target,600000);
  assert.equal(result.reachable,true);
  assert.equal(result.months,0);
  assert.equal(result.years,0);
  assert.equal(result.reason,'already-reached');
  assert.equal(result.series.length,1);
  assert.equal(calculateFreedom({...freedom,withdrawalRate:2,initial:1200000}).target,1200000);
  const noExpense=calculateFreedom({...freedom,monthlyExpenses:0,initial:0});
  assert.equal(noExpense.target,0);
  assert.equal(noExpense.months,0);
});

test('financial freedom returns the first reached month, with deposits at month end',()=>{
  const savingOnly=calculateFreedom({monthlyExpenses:4,withdrawalRate:4,initial:0,monthly:100,annualRate:0});
  assert.equal(savingOnly.target,1200);
  assert.equal(savingOnly.months,12);
  assert.equal(savingOnly.balanceAtTarget,1200);
  assert.equal(savingOnly.growth,0);
  const growing=calculateFreedom({monthlyExpenses:4,withdrawalRate:4,initial:1000,monthly:0,annualRate:21});
  assert.equal(growing.months,12);
  close(growing.balanceAtTarget,1210);
  const previous=calculateCompound({initial:1000,monthly:0,years:11/12,annualRate:21});
  assert.ok(previous.total<growing.target);
  assert.equal(growing.series.at(-1).month,growing.months);
});

test('financial freedom distinguishes impossible scenarios from goals beyond 100 years',()=>{
  for(const options of [
    {...freedom,initial:0,monthly:0,annualRate:7},
    {...freedom,monthly:0,annualRate:0},
    {...freedom,initial:0,monthly:100,annualRate:-10}
  ]){
    const result=calculateFreedom(options);
    assert.equal(result.reachable,false);
    assert.equal(result.reason,'not-reachable');
    assert.equal(result.months,null);
    assert.equal(result.years,null);
    assert.equal(result.balanceAtTarget,null);
    assert.equal(result.series.at(-1).month,1200);
  }
  const distant=calculateFreedom({...freedom,initial:0,monthly:1,annualRate:0});
  assert.equal(distant.reachable,false);
  assert.equal(distant.reason,'beyond-horizon');
  assert.equal(distant.contributed,1200);
});

test('floating-point compounding never adds a spurious month to an exact annual goal',()=>{
  for(const annualRate of [1,7,70,80]){
    const goal=1000*(1+annualRate/100);
    const result=calculateFreedom({monthlyExpenses:goal*.04/12,withdrawalRate:4,initial:1000,monthly:0,annualRate});
    assert.equal(result.months,12);
    close(result.balanceAtTarget,goal);
  }
});

test('financial freedom can reach a target below the ceiling with negative returns',()=>{
  const result=calculateFreedom({monthlyExpenses:1,withdrawalRate:4,initial:0,monthly:100,annualRate:-50});
  assert.equal(result.target,300);
  assert.equal(result.reachable,true);
  assert.equal(result.months,4);
  assert.ok(result.balanceAtTarget>=300);
});

test('invalid, missing, nonnumeric and unsafe inputs produce field errors',()=>{
  const invocations=[
    ()=>calculateCompound({...invested,initial:-1,monthly:Infinity,years:101,annualRate:-100}),
    ()=>calculateCagr({initial:0,final:-1,years:0}),
    ()=>calculateRecovery({lossPercent:101}),
    ()=>calculateFees({...invested,annualFee:-1}),
    ()=>calculateInflation({amount:1e13,years:1,inflationRate:-100}),
    ()=>calculateFreedom({...freedom,withdrawalRate:0}),
    ()=>calculateCompound({...invested,initial:'1000'}),
    ()=>calculateCompound({...invested,initial:NaN}),
    ()=>calculateCompound(null),
    ()=>calculateRecovery()
  ];
  for(const invoke of invocations){
    const result=invoke();
    assert.equal(result.ok,false);
    assert.ok(Object.keys(result.errors).length>0);
    assert.ok(Object.values(result.errors).every(message=>typeof message==='string'&&message.length>0));
    finiteTree(result);
  }
});

test('all validated extreme scenarios remain finite and preserve unrounded outputs',()=>{
  const results=[
    calculateCompound({initial:1e12,monthly:1e12,years:100,annualRate:100}),
    calculateCompound({initial:1e12,monthly:0,years:100,annualRate:-99}),
    calculateCagr({initial:0.01,final:1e12,years:1/12}),
    calculateCagr({initial:1e12,final:Number.MIN_VALUE,years:100}),
    calculateRecovery({lossPercent:99.999999999}),
    calculateFees({initial:1e12,monthly:1e12,years:100,annualRate:-99,annualFee:25}),
    calculateInflation({amount:1e12,years:100,inflationRate:-99}),
    calculateFreedom({monthlyExpenses:1e12,withdrawalRate:0.01,initial:0,monthly:0,annualRate:100})
  ];
  for(const result of results){assert.equal(result.ok,true);finiteTree(result);}
  assert.ok(calculateCagr({initial:1e12,final:Number.MIN_VALUE,years:100}).cagr>-100);
  const cents=calculateCompound({initial:0.01,monthly:0,years:1,annualRate:7});
  close(cents.total,0.0107);
  assert.notEqual(cents.total,Math.round(cents.total*100)/100);
});
