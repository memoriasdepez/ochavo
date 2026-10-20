import {calculateCompound,calculateCagr,calculateFees,calculateInflation,calculateRecovery} from './lab-calculators.js';

// Lesson experiments use the same maths as Laboratorio. Their inputs live only
// in the current DOM: they never modify an answer, reward, draft or account.
const definitions={
  recovery:{title:'¿Cuánto necesitas subir para recuperarte?',defaults:{lossPercent:50},calculate:calculateRecovery,
    fields:[['lossPercent','Caída de la inversión','%',0,100]],
    note:'La subida necesaria se calcula sobre el dinero que queda tras la caída, no sobre el capital inicial. Es una condición matemática, no una garantía de recuperación. No incluye nuevas aportaciones, gastos ni impuestos.'},
  compound:{title:'Mira cómo crece con el tiempo',defaults:{initial:1000,monthly:0,years:15,annualRate:7},calculate:calculateCompound,
    fields:[['initial','Capital inicial','€',0,1e12],['monthly','Aportación mensual','€/mes',0,1e12],['years','Tiempo invertido','años',0,100],['annualRate','Rentabilidad anual supuesta','%',-99,100]],
    note:'Escenario de ejemplo: rentabilidad anual constante y ganancias reinvertidas. Las aportaciones llegan al final de cada mes. No incluye comisiones, impuestos ni inflación. En una inversión real la rentabilidad varía y puede ser negativa.'},
  cagr:{title:'De principio a fin: ¿qué tasa anual equivale?',defaults:{initial:1000,final:2000,years:10},calculate:calculateCagr,
    fields:[['initial','Valor inicial','€',.01,1e12],['final','Valor final','€',0,1e12],['years','Tiempo transcurrido','años',1/12,100]],
    note:'Úsala cuando no haya aportaciones ni retiradas entre el inicio y el final. La CAGR es una tasa anual equivalente: no significa que la inversión haya ganado lo mismo cada año. No descuenta comisiones, impuestos ni inflación que no estén ya reflejados en los valores introducidos.'},
  fees:{title:'Una pequeña comisión, muchos años',defaults:{initial:1000,monthly:100,years:30,annualRate:7,annualFee:1},calculate:calculateFees,
    fields:[['initial','Capital inicial','€',0,1e12],['monthly','Aportación mensual','€/mes',0,1e12],['years','Tiempo invertido','años',0,100],['annualRate','Rentabilidad antes del coste','%',-99,100],['annualFee','Comisión anual','%',0,25]],
    note:'Compara el mismo capital, aportaciones y rentabilidad constante. El modelo aplica cada año la comisión al saldo tras la rentabilidad y usa una tasa mensual equivalente. Las aportaciones llegan al final del mes. No incluye otros costes, impuestos ni inflación.'},
  inflation:{title:'Los euros y lo que puedes comprar',defaults:{amount:1000,years:30,inflationRate:3},calculate:calculateInflation,
    fields:[['amount','Dinero que conservas sin invertir','€',0,1e12],['years','Tiempo transcurrido','años',0,100],['inflationRate','Inflación anual supuesta','%',-99,100]],
    note:'Escenario con inflación constante. El dinero no genera rentabilidad: mantienes la misma cantidad de euros. «Poder de compra» expresa lo que esos euros podrían comprar, medido a precios de hoy. No es una previsión de los precios.'}
};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=(value,digits=2)=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:digits}).format(value);
const euros=value=>`${number(value,Math.abs(value)>=1e9?0:2)} €`;
const percent=value=>`${number(value)} %`;
const readNumber=value=>{
  if(typeof value==='number')return value;
  let text=String(value??'').trim().replace(/[\s\u00a0]/g,'');
  if(!text)return NaN;
  if(text.includes(',')){
    if(!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(text))return NaN;
    text=text.replace(/\./g,'').replace(',','.');
  }else if(/^[+-]?[1-9]\d{0,2}(?:\.\d{3})+$/.test(text))text=text.replace(/\./g,'');
  else if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text))return NaN;
  return Number(text);
};
let nextId=0;

export function evaluateGrowthLab(config={},override){
  const kind=Object.hasOwn(definitions,config.kind)?config.kind:'compound';
  const definition=definitions[kind];
  const supplied=config.values??config;
  const values=Object.fromEntries(definition.fields.map(([key])=>[key,readNumber(override&&Object.hasOwn(override,key)?override[key]:Object.hasOwn(supplied,key)?supplied[key]:definition.defaults[key])]));
  const result=definition.calculate(values);
  const requested=config.compareYears??[15,30];
  const compareYears=[...new Set(Array.isArray(requested)?requested:[15,30])].filter(year=>Number.isFinite(year)&&year>0&&year<=100).slice(0,4);
  const comparisons=result.ok&&!['cagr','recovery'].includes(kind)?compareYears.map(years=>({years,...definition.calculate({...values,years})})):[];
  return {kind,definition,values,result,comparisons};
}

function compactEuros(value){
  if(Math.abs(value)>=1e12)return `${value.toExponential(1).replace('.',',')} €`;
  if(Math.abs(value)>=1e9)return `${number(value/1e9,1)} mil M€`;
  if(Math.abs(value)>=1e6)return `${number(value/1e6,1)} M€`;
  if(Math.abs(value)>=1e3)return `${number(value/1e3,1)} mil €`;
  return `${number(value,0)} €`;
}

function chart(series,lines,caption){
  const left=70,right=480,top=20,bottom=212;
  const maxYear=series.at(-1)?.years??0;
  const maximum=Math.max(1,...series.flatMap(point=>lines.map(line=>point[line.key])));
  const x=year=>left+(maxYear?year/maxYear:0)*(right-left);
  const y=value=>bottom-value/maximum*(bottom-top);
  const ticks=[0,.5,1].map(ratio=>({value:maximum*ratio,y:y(maximum*ratio)}));
  const paths=lines.map((line,index)=>`<polyline class="oc-growth-line oc-growth-color-${index}" points="${series.map(point=>`${x(point.years).toFixed(2)},${y(point[line.key]).toFixed(2)}`).join(' ')}" fill="none" stroke-width="3.5"${index?' stroke-dasharray="7 5"':''} />${series.length===1?`<circle class="oc-growth-color-${index}" cx="${left}" cy="${y(series[0][line.key])}" r="4" fill="currentColor"/>`:''}`).join('');
  return `<figure class="oc-growth-figure"><svg viewBox="0 0 500 252" role="img" aria-label="${esc(caption)}"><title>${esc(caption)}</title>${ticks.map(tick=>`<path class="oc-growth-grid" d="M${left} ${tick.y}H${right}"/><text x="${left-9}" y="${tick.y+4}" text-anchor="end">${esc(compactEuros(tick.value))}</text>`).join('')}${paths}<text x="${left}" y="237">Hoy</text>${maxYear?`<text x="${(left+right)/2}" y="237" text-anchor="middle">${number(maxYear/2,1)}</text><text x="${right}" y="237" text-anchor="end">${number(maxYear,2)} años</text>`:''}</svg><figcaption>${lines.map((line,index)=>`<span><i class="oc-growth-swatch oc-growth-color-${index}" aria-hidden="true"></i>${esc(line.label)}</span>`).join('')}</figcaption></figure>`;
}

function stat(label,value){return `<div class="oc-growth-stat"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;}
function comparisonHTML(model){
  if(!model.comparisons.length)return '';
  const {kind}=model;
  return `<div class="oc-growth-comparison"><p class="oc-growth-small-heading">Cambia solo el plazo</p><div class="oc-growth-compare-grid">${model.comparisons.map(comparison=>{
    const value=kind==='compound'?comparison.total:kind==='fees'?comparison.withFees:comparison.purchasingPower;
    const detail=kind==='compound'?`Has aportado ${euros(comparison.contributed)}`:kind==='fees'?`Sin comisión: ${euros(comparison.withoutFees)}`:`${euros(model.values.amount)} guardados, medidos a precios de hoy`;
    return `<div><span>A ${number(comparison.years)} años</span><strong>${esc(euros(value))}</strong><small>${esc(detail)}</small></div>`;
  }).join('')}</div><p class="oc-growth-compare-note">${kind==='compound'||kind==='fees'?'El capital inicial, la aportación mensual y las tasas son los mismos. Si aportas cada mes, un plazo mayor también implica poner más dinero de tu bolsillo.':'La cantidad de euros guardada y la inflación anual son las mismas.'}</p></div>`;
}

function resultHTML(model){
  const {kind,result:r,values:v}=model;
  if(!r.ok)return `<div class="oc-growth-empty">Revisa los datos señalados para ver el resultado.</div>`;
  let html='';
  if(kind==='recovery'){
    html=`<div class="oc-growth-main-stat"><span>Subida necesaria para volver al inicio</span><strong>${r.recoverable?percent(r.requiredGain):'Capital agotado'}</strong></div><div class="oc-growth-stats">${stat('De cada 100 € iniciales quedan',euros(r.remainingPercent))}${stat('Dinero que falta para volver a 100 €',euros(v.lossPercent))}</div><p class="oc-growth-reading">${r.recoverable?`Tras caer un ${percent(v.lossPercent)}, quedan ${euros(r.remainingPercent)} de cada 100 € iniciales. Para recuperar los ${euros(v.lossPercent)} perdidos, la subida se calcula sobre esos ${euros(r.remainingPercent)}: (${number(v.lossPercent)} ÷ ${number(r.remainingPercent)}) × 100 = ${percent(r.requiredGain)}.`:'Con una pérdida del 100 %, el saldo queda en cero. Ninguna subida porcentual sobre cero permite recuperar el capital inicial; añadir dinero sería una nueva aportación.'}</p>`;
  }else if(kind==='compound'){
    const direction=r.growth<0?'Pérdida del escenario':'Ganancias del escenario';
    html=`<div class="oc-growth-main-stat"><span>Saldo a ${number(r.years)} años</span><strong>${esc(euros(r.total))}</strong></div><div class="oc-growth-stats">${stat('Dinero aportado por ti',euros(r.contributed))}${stat(direction,euros(r.growth))}</div>${chart(r.series,[{key:'balance',label:'Saldo con reinversión'},{key:'contributed',label:'Dinero que has aportado'}],`Saldo y aportaciones durante ${number(r.years)} años. Saldo final: ${euros(r.total)}; aportado: ${euros(r.contributed)}.`)}<p class="oc-growth-reading">${r.growth<0?'La línea del saldo termina por debajo del dinero aportado: en este escenario hay pérdidas.':'La distancia entre las líneas es lo que genera la inversión; las aportaciones, por sí solas, no son ganancias.'}</p>`;
  }else if(kind==='cagr'){
    const maximum=Math.max(v.initial,v.final,1);
    html=`<div class="oc-growth-main-stat"><span>Tasa anual equivalente (CAGR)</span><strong>${percent(r.cagr)}</strong></div><div class="oc-growth-endpoints" role="img" aria-label="${esc(`Inicio ${euros(v.initial)}; final ${euros(v.final)} tras ${number(v.years)} años.`)}">${[['Inicio',v.initial],['Final',v.final]].map(([label,value])=>`<div><span>${label} <strong>${esc(euros(value))}</strong></span><i style="--growth-bar:${100*value/maximum}%"></i></div>`).join('')}</div><div class="oc-growth-stats">${stat('Cambio total',percent(r.totalReturn))}${stat('Tiempo transcurrido',`${number(v.years)} años`)}</div><p class="oc-growth-reading">${v.final===0?'El valor final es cero: se ha perdido todo el capital inicial.':`Una tasa constante de ${percent(r.cagr)} al año, aplicada sobre el saldo que va quedando, conecta ${euros(v.initial)} con ${euros(v.final)} en ${number(v.years)} años.`} Este resumen no muestra las subidas y bajadas que hubo por el camino.</p>`;
  }else if(kind==='fees'){
    html=`<div class="oc-growth-main-stat"><span>Saldo después de la comisión</span><strong>${esc(euros(r.withFees))}</strong></div><div class="oc-growth-stats">${stat('Saldo sin comisión',euros(r.withoutFees))}${stat('Diferencia acumulada',euros(r.cost))}</div>${chart(r.series,[{key:'withoutFees',label:'Sin comisión'},{key:'withFees',label:'Con comisión'}],`Comparación a ${number(r.years)} años: sin comisión ${euros(r.withoutFees)}, con comisión ${euros(r.withFees)}.`)}<p class="oc-growth-reading">La diferencia incluye las comisiones y la rentabilidad que ese dinero habría generado después. No es solo la suma de las comisiones cobradas.</p>`;
  }else{
    const series=r.series.map(point=>({...point,nominal:v.amount}));
    html=`<div class="oc-growth-main-stat"><span>Poder de compra a precios de hoy</span><strong>${esc(euros(r.purchasingPower))}</strong></div><div class="oc-growth-stats">${stat('Euros que siguen en tu cuenta',euros(v.amount))}${stat('Coste futuro de lo que hoy compras',euros(r.futureEquivalent))}</div>${chart(series,[{key:'nominal',label:'Euros guardados'},{key:'purchasingPower',label:'Poder de compra (euros de hoy)'}],`Tras ${number(v.years)} años conservas ${euros(v.amount)}, cuyo poder de compra equivale a ${euros(r.purchasingPower)} de hoy.`)}<p class="oc-growth-reading">${v.inflationRate<0?'Con esta bajada de precios, los mismos euros permiten comprar más.':v.inflationRate===0?'Si los precios no cambian, el poder de compra se mantiene.':'Los euros siguen ahí, pero con precios más altos alcanzan para comprar menos.'}</p>`;
  }
  return html+comparisonHTML(model);
}

function statusText(model){
  if(!model.result.ok)return 'Hay datos que debes revisar.';
  if(model.kind==='recovery')return model.result.recoverable?`Subida necesaria: ${percent(model.result.requiredGain)}.`:'El saldo es cero: no puede recuperarse mediante una subida porcentual.';
  if(model.kind==='cagr')return `Tasa anual equivalente: ${percent(model.result.cagr)}.`;
  if(model.kind==='fees')return `Saldo con comisión: ${euros(model.result.withFees)}.`;
  if(model.kind==='inflation')return `Poder de compra: ${euros(model.result.purchasingPower)} de hoy.`;
  return `Saldo: ${euros(model.result.total)}. Dinero aportado: ${euros(model.result.contributed)}.`;
}

export function renderGrowthLab(config={}){
  const model=evaluateGrowthLab(config),id=`oc-growth-${++nextId}`;
  const payload={kind:model.kind,values:model.values,compareYears:config.compareYears??[15,30]};
  return `<section class="oc-growth-lab" data-growth-lab="${esc(JSON.stringify(payload))}" aria-labelledby="${id}-title"><div class="oc-growth-kicker"><span aria-hidden="true">↗</span> Pruébalo tú</div><h3 id="${id}-title">${esc(config.title??model.definition.title)}</h3>${config.prompt?`<p class="oc-growth-prompt">${esc(config.prompt)}</p>`:''}<div class="oc-growth-fields">${model.definition.fields.map(([key,label,unit,min,max])=>`<div class="oc-growth-field"><label for="${id}-${key}">${esc(label)}</label><div class="oc-growth-input-wrap"><input id="${id}-${key}" data-growth-field="${key}" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="${Number.isFinite(model.values[key])?model.values[key]:''}" aria-describedby="${id}-${key}-error" aria-invalid="${Boolean(model.result.errors?.[key])}" data-min="${min}" data-max="${max}"><span>${unit}</span></div><p class="oc-growth-error" id="${id}-${key}-error" data-growth-error="${key}">${esc(model.result.errors?.[key]??'')}</p></div>`).join('')}</div>${!['cagr','recovery'].includes(model.kind)?`<div class="oc-growth-presets" aria-label="Plazos para comparar"><span>Ver a</span>${[15,30].map(year=>`<button type="button" data-growth-years="${year}" aria-pressed="${model.values.years===year}">${year} años</button>`).join('')}</div>`:''}<div class="oc-growth-result" data-growth-result>${resultHTML(model)}</div><p class="oc-growth-status" data-growth-status role="status" aria-live="polite" aria-atomic="true"></p><details class="oc-growth-assumptions" open><summary>Qué supone este ejemplo</summary><p>${esc(model.definition.note)}</p>${model.kind==='compound'||model.kind==='fees'?'<p>Los plazos se redondean al mes más cercano. Las cifras de pantalla se redondean; los cálculos conservan los decimales.</p>':''}</details><button type="button" class="oc-growth-tool" data-growth-tool="${model.kind}"${model.result.ok?'':' disabled'}>Abrir esta calculadora en Laboratorio <span aria-hidden="true">→</span></button><p class="oc-growth-tool-note">Allí la tendrás también cuando termines esta lección.</p></section>`;
}

function updateWidget(widget){
  let config;
  try{config=JSON.parse(widget.getAttribute('data-growth-lab'));}catch{return false;}
  const fields=[...widget.querySelectorAll('[data-growth-field]')];
  const values=Object.fromEntries(fields.map(input=>[input.getAttribute('data-growth-field'),input.value]));
  const model=evaluateGrowthLab(config,values);
  for(const input of fields){
    const key=input.getAttribute('data-growth-field'),error=model.result.errors?.[key]??'';
    input.setAttribute('aria-invalid',String(Boolean(error)));
    const errorNode=widget.querySelector(`[data-growth-error="${key}"]`);
    if(errorNode)errorNode.textContent=error;
  }
  for(const preset of widget.querySelectorAll('[data-growth-years]'))preset.setAttribute('aria-pressed',String(Number(preset.getAttribute('data-growth-years'))===model.values.years));
  const resultNode=widget.querySelector('[data-growth-result]');
  if(resultNode)resultNode.innerHTML=resultHTML(model);
  const statusNode=widget.querySelector('[data-growth-status]');
  if(statusNode)statusNode.textContent=statusText(model);
  const toolButton=widget.querySelector('[data-growth-tool]');
  if(toolButton)toolButton.disabled=!model.result.ok;
  return true;
}

export function readGrowthLabValues(container){
  const widget=container?.matches?.('[data-growth-lab]')?container:container?.closest?.('[data-growth-lab]')??container?.querySelector?.('[data-growth-lab]');
  if(!widget)return {};
  return Object.fromEntries([...widget.querySelectorAll('[data-growth-field]')].map(input=>[input.getAttribute('data-growth-field'),readNumber(input.value)]));
}

export function handleGrowthInput(event,{canUse=()=>true}={}){
  const input=event.target?.closest?.('[data-growth-field]'),widget=input?.closest?.('[data-growth-lab]');
  return widget&&canUse()?updateWidget(widget):false;
}
export function handleGrowthClick(event,{canUse=()=>true}={}){
  const preset=event.target?.closest?.('[data-growth-years]'),widget=preset?.closest?.('[data-growth-lab]');
  if(!widget||!canUse())return false;
  const input=widget.querySelector('[data-growth-field="years"]');
  if(!input)return false;
  input.value=preset.getAttribute('data-growth-years');
  return updateWidget(widget);
}
export function installGrowthLab(root,{canUse=()=>true}={}){
  const click=event=>handleGrowthClick(event,{canUse}),input=event=>handleGrowthInput(event,{canUse});
  root.addEventListener('click',click);root.addEventListener('input',input);
  return ()=>{root.removeEventListener('click',click);root.removeEventListener('input',input);};
}
