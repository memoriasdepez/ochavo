// Deterministic, inspectable calculations for simulated educational charts.
export const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
export const sma=(a,n)=>a.map((_,i)=>i<n-1?null:mean(a.slice(i-n+1,i+1)));
export function smooth(a,n,alpha=1/n){let sum=0,seeded=false,last=null,count=0;return a.map(v=>{if(v===null)return null;if(!seeded){sum+=v;count++;if(count<n)return null;seeded=true;last=sum/n;}else last=alpha*v+(1-alpha)*last;return last;});}
export const ema=(a,n)=>smooth(a,n,2/(n+1));
export function rsi(closes,n=5){const gains=closes.map((c,i)=>i?Math.max(0,c-closes[i-1]):null),losses=closes.map((c,i)=>i?Math.max(0,closes[i-1]-c):null),up=smooth(gains,n),down=smooth(losses,n);return up.map((u,i)=>u===null?null:down[i]===0?(u===0?50:100):100-100/(1+u/down[i]));}
export function macd(a,fast=3,slow=6,signalPeriod=3){const f=ema(a,fast),s=ema(a,slow),line=f.map((v,i)=>s[i]===null?null:v-s[i]),signal=ema(line,signalPeriod),histogram=line.map((v,i)=>signal[i]===null?null:v-signal[i]);return {line,signal,histogram};}
export const trueRanges=cs=>cs.map((c,i)=>i?Math.max(c.h-c.l,Math.abs(c.h-cs[i-1].c),Math.abs(c.l-cs[i-1].c)):c.h-c.l);
export const atr=(cs,n=5)=>smooth(trueRanges(cs),n);
export function bollinger(closes,n=5,k=2){const center=sma(closes,n),sd=closes.map((_,i)=>center[i]===null?null:Math.sqrt(mean(closes.slice(i-n+1,i+1).map(v=>(v-center[i])**2))));return {center,sd,upper:center.map((v,i)=>v===null?null:v+k*sd[i]),lower:center.map((v,i)=>v===null?null:v-k*sd[i])};}
export function directional(cs,n=5){const tr=trueRanges(cs),plus=cs.map((c,i)=>{if(!i)return null;const up=c.h-cs[i-1].h,down=cs[i-1].l-c.l;return up>0&&up>down?up:0;}),minus=cs.map((c,i)=>{if(!i)return null;const up=c.h-cs[i-1].h,down=cs[i-1].l-c.l;return down>0&&down>up?down:0;});const trAverage=smooth(tr.map((v,i)=>i?v:null),n),p=smooth(plus,n),m=smooth(minus,n),diPlus=p.map((v,i)=>v===null?null:trAverage[i]===0?0:100*v/trAverage[i]),diMinus=m.map((v,i)=>v===null?null:trAverage[i]===0?0:100*v/trAverage[i]);const dx=diPlus.map((v,i)=>v===null?null:v+diMinus[i]===0?0:100*Math.abs(v-diMinus[i])/(v+diMinus[i]));return {diPlus,diMinus,adx:smooth(dx,n)};}
// VWAP uses each bar's (high + low + close)/3 as an explicit approximation.
export function vwap(cs,anchor=0){let amount=0,volume=0;return cs.map((c,i)=>{if(i<anchor)return null;amount+=(c.h+c.l+c.c)/3*c.v;volume+=c.v;return amount/volume;});}
export function obv(cs){let value=0;return cs.map((c,i)=>{if(i)value+=Math.sign(c.c-cs[i-1].c)*c.v;return value;});}
export function aggregate(cs,size){const out=[];for(let i=0;i<cs.length;i+=size){const part=cs.slice(i,i+size);out.push({o:part[0].o,c:part.at(-1).c,h:Math.max(...part.map(c=>c.h)),l:Math.min(...part.map(c=>c.l)),v:part.reduce((s,c)=>s+c.v,0)});}return out;}
