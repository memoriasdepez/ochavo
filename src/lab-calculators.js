/**
 * Educational scenarios in EUR, with no stored data or recommended rates.
 * Input and output rates are percentages (7 means 7%), except monthlyRate.
 * Returns are effective annual rates: the equivalent monthly rate is
 * expm1(log1p(annualRate / 100) / 12). Deposits arrive at the end of the month.
 * Keep full precision here; display rounding belongs to the UI.
 *
 * Context checked against primary investor education sources:
 * https://www.investor.gov/financial-tools-calculators/calculators/compound-interest-calculator
 * https://syndication.finra.org/content/how-are-your-investments-doing-returns-explained
 * https://www.bls.gov/cpi/factsheets/purchasing-power-constant-dollars.htm
 * The fee model below is an explicit simplified annual scenario, not a fund quote.
 */
export const LAB_LIMITS = Object.freeze({money:1e12,years:100,minAnnualRate:-99,maxAnnualRate:100,maxFee:25,maxWithdrawalRate:25});
const money = [0,LAB_LIMITS.money,'Introduce un importe entre 0 y 1 billón de euros.'];
const horizon = [0,LAB_LIMITS.years,'Introduce un plazo entre 0 y 100 años.'];
const annual = [LAB_LIMITS.minAnnualRate,LAB_LIMITS.maxAnnualRate,'Usa una rentabilidad entre −99 % y 100 %.'];
const monthlyRate = rate => Math.expm1(Math.log1p(rate / 100) / 12);
const roundedMonths = years => Math.round(years * 12);
// Equivalent monthly compounding can finish a few ulps below an exact goal.
const targetReached=(balance,target)=>balance>=target||(target-balance)<=Number.EPSILON*128*Math.max(Math.abs(balance),Math.abs(target));

function errorsFor(input,specifications){
  const errors={};
  for(const [field,[min,max,message]] of Object.entries(specifications)){
    const value=input?.[field];
    if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)errors[field]=message;
  }
  return Object.keys(errors).length?{ok:false,errors}:null;
}

/** Initial value, annual snapshots and the final month, without duplicate points. */
function project(initial,monthly,annualRate,months){
  const rate=monthlyRate(annualRate);
  let balance=initial;
  const series=[{month:0,years:0,balance,contributed:initial}];
  for(let month=1;month<=months;month++){
    balance=balance*(1+rate)+monthly;
    if(month%12===0||month===months)series.push({month,years:month/12,balance,contributed:initial+monthly*month});
  }
  const contributed=initial+monthly*months;
  return {total:balance,contributed,growth:balance-contributed,months,years:months/12,monthlyRate:rate,series};
}

export function calculateCompound(input){
  const invalid=errorsFor(input,{initial:money,monthly:money,years:horizon,annualRate:annual});
  if(invalid)return invalid;
  return {ok:true,...project(input.initial,input.monthly,input.annualRate,roundedMonths(input.years))};
}

/** Only compares initial and final values. Intermediate deposits/withdrawals are not measured. */
export function calculateCagr(input){
  const invalid=errorsFor(input,{
    initial:[0.01,LAB_LIMITS.money,'El importe inicial debe ser de al menos 0,01 € y no superar 1 billón de euros.'],
    final:money,
    years:[1/12,LAB_LIMITS.years,'Introduce un plazo entre un mes (1/12 de año) y 100 años.']
  });
  if(invalid)return invalid;
  const multiple=input.final/input.initial;
  const cagr=input.final===0?-100:Math.expm1((Math.log(input.final)-Math.log(input.initial))/input.years)*100;
  return {ok:true,cagr,totalReturn:(multiple-1)*100,multiple};
}

export function calculateRecovery(input){
  const invalid=errorsFor(input,{lossPercent:[0,100,'Introduce una caída entre 0 % y 100 %.']});
  if(invalid)return invalid;
  const remainingPercent=100-input.lossPercent;
  return {ok:true,recoverable:remainingPercent>0,requiredGain:remainingPercent===0?null:input.lossPercent/remainingPercent*100,remainingPercent};
}

/** Fee applied to annual wealth: (1 + gross return) * (1 − annual fee) − 1. */
export function calculateFees(input){
  const invalid=errorsFor(input,{initial:money,monthly:money,years:horizon,annualRate:annual,annualFee:[0,LAB_LIMITS.maxFee,'Introduce una comisión anual entre 0 % y 25 %.']});
  if(invalid)return invalid;
  const months=roundedMonths(input.years);
  const netAnnualRate=input.annualFee===0?input.annualRate:((1+input.annualRate/100)*(1-input.annualFee/100)-1)*100;
  const gross=project(input.initial,input.monthly,input.annualRate,months);
  const net=project(input.initial,input.monthly,netAnnualRate,months);
  return {
    ok:true,withoutFees:gross.total,withFees:net.total,cost:gross.total-net.total,
    contributed:gross.contributed,netAnnualRate,months,years:months/12,
    series:gross.series.map((point,index)=>({month:point.month,years:point.years,withoutFees:point.balance,withFees:net.series[index].balance,contributed:point.contributed}))
  };
}

/** A chosen constant inflation rate, not a historical CPI series or a forecast. */
export function calculateInflation(input){
  const invalid=errorsFor(input,{amount:money,years:horizon,inflationRate:[-99,100,'Introduce una inflación anual entre −99 % y 100 %.']});
  if(invalid)return invalid;
  const logFactor=Math.log1p(input.inflationRate/100);
  const values=years=>({years,futureEquivalent:input.amount*Math.exp(logFactor*years),purchasingPower:input.amount*Math.exp(-logFactor*years)});
  const result=values(input.years);
  const series=[values(0)];
  for(let year=1;year<=input.years;year++)series.push(values(year));
  if(input.years>0&&!Number.isInteger(input.years))series.push(result);
  return {ok:true,...result,priceIncrease:result.futureEquivalent-input.amount,purchasingPowerLoss:input.amount-result.purchasingPower,series};
}

/**
 * Target = annual expenses / chosen annual withdrawal rate.
 * The rate is an adjustable hypothesis, never a guarantee of lasting income.
 * Estimates the first month reaching that fixed nominal target, up to 100 years.
 * No inflation, taxes or market variability are introduced implicitly.
 */
export function calculateFreedom(input){
  const invalid=errorsFor(input,{
    monthlyExpenses:money,
    withdrawalRate:[0.01,LAB_LIMITS.maxWithdrawalRate,'Introduce una retirada anual entre 0,01 % y 25 %.'],
    initial:money,monthly:money,annualRate:annual
  });
  if(invalid)return invalid;
  const target=input.monthlyExpenses*12/(input.withdrawalRate/100);
  const rate=monthlyRate(input.annualRate);
  let balance=input.initial;
  const series=[{month:0,years:0,balance,contributed:input.initial}];
  const resultAt=month=>({ok:true,target,reachable:true,months:month,years:month/12,balanceAtTarget:balance,contributed:input.initial+input.monthly*month,growth:balance-input.initial-input.monthly*month,series,reason:month===0?'already-reached':'reached'});
  if(targetReached(balance,target))return resultAt(0);
  // With negative returns the monthly deposits approach a fixed ceiling. Equality
  // at that ceiling is approached, but is never reached from a lower balance.
  const impossible=(input.initial===0&&input.monthly===0)
    ||(rate===0&&input.monthly===0)
    ||(rate<0&&target>=input.monthly/-rate);
  const maxMonths=LAB_LIMITS.years*12;
  for(let month=1;month<=maxMonths;month++){
    balance=balance*(1+rate)+input.monthly;
    const reached=!impossible&&targetReached(balance,target);
    if(month%12===0||month===maxMonths||reached)series.push({month,years:month/12,balance,contributed:input.initial+input.monthly*month});
    if(reached)return resultAt(month);
  }
  const contributed=input.initial+input.monthly*maxMonths;
  return {ok:true,target,reachable:false,months:null,years:null,balanceAtTarget:null,contributed,growth:balance-contributed,series,reason:impossible?'not-reachable':'beyond-horizon'};
}
