import {pick as renderCandlestickPick} from './technical-charts.js';
// Answers stay in the existing, account-scoped draft. No rewards or lives are granted here.
export const FORMAT_LABELS = Object.freeze({
  sort:'Ordena los elementos', classify:'Clasifica en grupos', truth:'Verdadero o falso',
  all:'Selecciona todas las correctas', intruder:'Encuentra el intruso', repair:'Corrige la frase',
  table:'Completa una tabla', hotspot:'Señala sobre una imagen', build:'Construye la respuesta',
  short:'Escribe una respuesta corta', differences:'Encuentra las diferencias', sequence:'Completa una secuencia',
  audio:'Asocia audio y texto', slider:'Ajusta un deslizador', interval:'Marca un intervalo',
  allocate:'Reparte fichas', diagram:'Completa un diagrama', reverse:'Elige la pregunta adecuada',
  grid:'Busca en una cuadrícula', clues:'Resuelve con pistas progresivas'
});
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const listKinds = ['all','grid','differences'];
const rowKinds = ['classify','truth','repair','table','diagram'];
const orderKinds = ['sort','build'];
const choiceKinds = ['intruder','hotspot','sequence','audio','reverse','clues'];
const text = v => typeof v === 'string' && v.trim().length > 0;
const optionList = v => Array.isArray(v) && v.length >= 2 && v.length <= 4 && v.every(text);
const index = (v,n) => Number.isInteger(v) && v >= 0 && v < n;
const setEqual = (a,b) => a.length === b.length && [...a].sort((x,y)=>x-y).every((v,i)=>v === [...b].sort((x,y)=>x-y)[i]);
export const normalizeWord = v => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
export function numberValue(v) {
  let s=String(v).trim().replace(/[\s\u00a0]/g,'');
  if(!s)return NaN;
  if(s.includes(',')){if(!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?$/.test(s))return NaN;s=s.replace(/\./g,'').replace(',','.');}
  else if(/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  else if(!/^[+-]?\d+(?:\.\d+)?$/.test(s))return NaN;
  return Number(s);
}
export function validateActivity(a,where='Activity') {
  const check=(ok,s)=>{if(!ok)throw Error(where+' '+s);};
  check(a && Object.hasOwn(FORMAT_LABELS,a.kind),'known format');
  check(text(a.title)&&text(a.prompt)&&text(a.instruction),'clear instructions');
  if(rowKinds.includes(a.kind)){
    check(Array.isArray(a.rows)&&a.rows.length>=1&&a.rows.length<=4,'rows');
    for(const r of a.rows)check(text(r.label)&&optionList(r.options)&&index(r.answer,r.options.length),'row answer');
    if(a.kind==='classify')check(a.rows.every(r=>JSON.stringify(r.options)===JSON.stringify(a.rows[0].options)),'shared categories');
  }else if(orderKinds.includes(a.kind)){
    check(optionList(a.items)&&Array.isArray(a.answer)&&a.answer.length===a.items.length&&new Set(a.answer).size===a.items.length&&a.answer.every(v=>index(v,a.items.length)),'permutation');
  }else if(listKinds.includes(a.kind)){
    check(optionList(a.options)&&Array.isArray(a.answers)&&a.answers.length>0&&new Set(a.answers).size===a.answers.length&&a.answers.every(v=>index(v,a.options.length)),'selected answers');
    if(a.kind==='differences')check(a.before?.length===a.options.length&&a.after?.length===a.options.length&&a.before.every(text)&&a.after.every(text),'two versions');
  }else if(choiceKinds.includes(a.kind)){
    check(optionList(a.options)&&index(a.answer,a.options.length),'choice');
    if(a.kind==='audio')check(text(a.narration),'narration');
    if(a.kind==='clues')check(Array.isArray(a.clues)&&a.clues.length>=2&&a.clues.length<=4&&a.clues.every(text),'progressive clues');
    if(a.kind==='hotspot')check(a.values?.length===a.options.length&&a.values.every(v=>Number.isFinite(v)&&v>=0)&&text(a.axis),'chart and axis');
    if(a.kind==='sequence')check(Array.isArray(a.sequence)&&a.sequence.length>=3&&a.sequence.length<=6&&a.sequence.every(text)&&a.sequence.filter(v=>v==='?').length===1,'sequence');
  }else if(a.kind==='short'){
    check(typeof a.answer==='number'?Number.isFinite(a.answer):text(a.answer)&&a.answer.length<=48,'short answer');
    if(a.aliases)check(a.aliases.every(v=>text(v)&&v.length<=48),'aliases');
  }else if(a.kind==='slider'){
    check([a.min,a.max,a.step,a.answer,a.initial].every(Number.isFinite)&&a.min<a.max&&a.step>0&&a.answer>=a.min&&a.answer<=a.max&&a.initial>=a.min&&a.initial<=a.max,'slider bounds');
  }else if(a.kind==='interval'){
    check(optionList(a.options)&&Array.isArray(a.answer)&&a.answer.length===2&&a.answer.every(v=>index(v,a.options.length))&&a.answer[0]<a.answer[1],'interval');
  }else if(a.kind==='allocate'){
    check(optionList(a.labels)&&Number.isInteger(a.budget)&&a.budget>0&&a.budget<=20&&a.answer?.length===a.labels.length&&a.answer.every(v=>Number.isInteger(v)&&v>=0)&&a.answer.reduce((x,y)=>x+y,0)===a.budget,'allocation');
  }
  return true;
}
export function activeActivity(s,d) {
  if(!s.activity)return null;
  if(d.vars.exerciseKind===s.activity.kind)return s.activity;
  // A previously selected answer (including an unconfirmed charged attempt) keeps its original exercise.
  if(d.choice!==null||d.selected.length||d.order.length||Object.values(d.matches).some(v=>v!=='')||d.number||d.attempts||d.passed||d.hinted||d.gameAttemptId)return null;
  d.vars.exerciseKind=s.activity.kind;
  return s.activity;
}
export function activityText(s,d,key){const a=activeActivity(s,d);return a?.[key] ?? s[key];}
export function activityAnswered(a,d){
  if(rowKinds.includes(a.kind))return a.rows.every((r,i)=>d.matches[i]!==undefined&&d.matches[i]!==''&&index(Number(d.matches[i]),r.options.length));
  if(orderKinds.includes(a.kind))return d.vars.exerciseTouched===1&&d.order.length===a.items.length;
  if(listKinds.includes(a.kind))return d.selected.length>0;
  if(choiceKinds.includes(a.kind))return index(d.choice,a.options.length);
  if(a.kind==='short')return typeof a.answer==='number'?Number.isFinite(numberValue(d.number)):!!d.vars.exerciseText?.trim();
  if(a.kind==='slider')return d.vars.exerciseTouched===1&&Number.isFinite(numberValue(d.number));
  if(a.kind==='interval')return [0,1].every(i=>d.matches[i]!==undefined&&d.matches[i]!==''&&index(Number(d.matches[i]),a.options.length))&&Number(d.matches[0])<Number(d.matches[1]);
  if(a.kind==='allocate')return d.vars.exerciseAlloc?.length===a.labels.length&&d.vars.exerciseAlloc.reduce((x,y)=>x+y,0)===a.budget;
  return false;
}
export function activityCorrect(a,d){
  if(!activityAnswered(a,d))return false;
  if(rowKinds.includes(a.kind))return a.rows.every((r,i)=>Number(d.matches[i])===r.answer);
  if(orderKinds.includes(a.kind))return d.order.every((v,i)=>v===a.answer[i]);
  if(listKinds.includes(a.kind))return setEqual(d.selected,a.answers);
  if(choiceKinds.includes(a.kind))return d.choice===a.answer;
  if(a.kind==='short')return typeof a.answer==='number'?Math.abs(numberValue(d.number)-a.answer)<=(a.tolerance??.01)+1e-8:[a.answer,...a.aliases||[]].some(v=>normalizeWord(v)===normalizeWord(d.vars.exerciseText));
  if(a.kind==='slider')return Math.abs(numberValue(d.number)-a.answer)<=(a.tolerance??a.step/2)+1e-8;
  if(a.kind==='interval')return a.answer.every((v,i)=>v===Number(d.matches[i]));
  if(a.kind==='allocate')return a.answer.every((v,i)=>v===d.vars.exerciseAlloc[i]);
  return false;
}
const pressed=(yes)=>`aria-pressed="${!!yes}"`;
const button=(label,action,value,selected,locked,extra='')=>`<button type="button" class="br-ex-card" data-ex="${action}" data-ex-value="${value}" ${pressed(selected)} ${locked?'disabled':''} ${extra}>${esc(label)}</button>`;
const select=(row,i,d,locked)=>`<label class="br-ex-cell"><span>${esc(row.label)}</span><select data-ex-input="row" data-ex-index="${i}" aria-label="Respuesta para ${esc(row.label)}" ${locked?'disabled':''}><option value="">Elige una respuesta</option>${row.options.map((v,j)=>`<option value="${j}" ${d.matches[i]!==''&&d.matches[i]!==undefined&&Number(d.matches[i])===j?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
export function activityMarkup(a,d,locked=false){
 if(a.kind==='hotspot'&&a.candles)return `<div class="br-exercise" data-exercise-kind="hotspot">${renderCandlestickPick(a,d,locked)}</div>`;
  let html='';
  if(a.kind==='sort'){
    if(d.order.length!==a.items.length){d.order=a.items.map((_,i)=>i);if(d.order.every((v,i)=>v===a.answer[i]))d.order.push(d.order.shift());}
    html=`<ol class="br-ex-sort">${d.order.map((v,i)=>`<li draggable="${!locked}" data-ex-drag="${i}"><span>${i+1}. ${esc(a.items[v])}</span><div>${button('↑','up',i,false,locked||i===0,`aria-label="Subir ${esc(a.items[v])}"`)}${button('↓','down',i,false,locked||i===a.items.length-1,`aria-label="Bajar ${esc(a.items[v])}"`)}</div></li>`).join('')}</ol>`;
  }else if(a.kind==='build'){
    html=`<div class="br-ex-built" aria-label="Respuesta construida">${d.order.length?d.order.map((v,i)=>button(a.items[v],'remove',i,false,locked)).join(''):'<p>Toca los bloques en el orden que complete la explicación.</p>'}</div><div class="br-ex-bank" aria-label="Bloques disponibles">${a.items.map((v,i)=>d.order.includes(i)?'':button(v,'append',i,false,locked)).join('')}</div>`;
  }else if(a.kind==='classify'){
    const current=index(d.vars.exerciseFocus,a.rows.length)?d.vars.exerciseFocus:0;
    html=`<div class="br-ex-bank">${a.rows.map((r,i)=>button(r.label,'focus',i,current===i,locked)).join('')}</div><p class="br-ex-note">Clasifica la tarjeta seleccionada: <strong>${esc(a.rows[current].label)}</strong></p><div class="br-ex-buckets">${a.rows[0].options.map((v,j)=>`<section>${button(v,'bucket',j,false,locked)}<ul>${a.rows.filter((_,i)=>d.matches[i]!==''&&d.matches[i]!==undefined&&Number(d.matches[i])===j).map(r=>`<li>${esc(r.label)}</li>`).join('')}</ul></section>`).join('')}</div>`;
  }else if(a.kind==='truth'){
    html=`<div class="br-ex-truth">${a.rows.map((r,i)=>`<fieldset><legend>${esc(r.label)}</legend><div>${r.options.map((v,j)=>button(v,'row',j,d.matches[i]!==''&&d.matches[i]!==undefined&&Number(d.matches[i])===j,locked,`data-ex-index="${i}"`)).join('')}</div></fieldset>`).join('')}</div>`;
  }else if(a.kind==='table'){
    const focus=index(d.vars.exerciseFocus,a.rows.length)?d.vars.exerciseFocus:0;
    html=`<div class="br-ex-table" role="table" aria-label="Tabla por completar"><div role="row" class="br-ex-table-head"><strong role="columnheader">${esc(a.columnLabels?.[0]||'Dato o situación')}</strong><strong role="columnheader">${esc(a.columnLabels?.[1]||'Lo que representa')}</strong></div>${a.rows.map((r,i)=>`<div role="row" class="br-ex-table-row"><span role="cell">${esc(r.label)}</span><span role="cell">${button(d.matches[i]!==undefined&&d.matches[i]!==''?r.options[Number(d.matches[i])]:'Toca para completar','focus',i,focus===i,locked,`aria-label="Completar casilla de ${esc(r.label)}"`)}</span></div>`).join('')}</div><p class="br-ex-note">Completa la casilla de <strong>${esc(a.rows[focus].label)}</strong>:</p><div class="br-ex-bank">${a.rows[focus].options.map((v,j)=>button(v,'row',j,d.matches[focus]!==''&&d.matches[focus]!==undefined&&Number(d.matches[focus])===j,locked,`data-ex-index="${focus}"`)).join('')}</div>`;
  }else if(a.kind==='diagram'){
    html=`<div class="br-ex-diagram" aria-label="Diagrama por completar"><p class="br-ex-budget">Mapa de conceptos</p>${a.rows.map((r,i)=>`<span class="br-ex-connector" aria-hidden="true">↳</span><div class="br-ex-node"><b>${i+1}</b>${select(r,i,d,locked)}</div>`).join('')}</div>`;
  }else if(a.kind==='repair'){
    html=`<div class="br-ex-repair">${a.rows.map((r,i)=>`<div><p>${esc(r.label)}</p><p class="br-ex-note">${r.replacementLabel?'Elige la conclusión corregida:':`Sustituye «${esc(r.wrongWord)}» por:`}</p>${select({...r,label:r.replacementLabel||'Palabra correcta'},i,d,locked)}</div>`).join('')}</div>`;
  }else if(a.kind==='differences'){
    html=`<div class="br-ex-differences"><div class="br-ex-table-head"><strong>${esc(a.versionLabels?.[0]||'Versión A')}</strong><strong>${esc(a.versionLabels?.[1]||'Versión B')}</strong></div>${a.options.map((v,i)=>`<button class="br-ex-diff-row" data-ex="toggle" data-ex-value="${i}" ${pressed(d.selected.includes(i))} ${locked?'disabled':''} aria-label="Marcar diferencia en ${esc(v)}"><span><small>${esc(v)}</small>${esc(a.before[i])}</span><span><small>${esc(v)}</small>${esc(a.after[i])}</span></button>`).join('')}</div>`;
  }else if(a.kind==='hotspot'){
    const max=Math.max(...a.values,1);
    html=`<figure class="br-ex-chart"><figcaption>${esc(a.axis)}</figcaption><div>${a.options.map((v,i)=>`<button data-ex="choose" data-ex-value="${i}" ${pressed(d.choice===i)} ${locked?'disabled':''} aria-label="${esc(v)}: ${a.values[i]} ${esc(a.unit||'')}"><span class="br-ex-bar" style="height:${24+100*a.values[i]/max}px"></span><b>${esc(a.values[i])} ${esc(a.unit||'')}</b><span>${esc(v)}</span></button>`).join('')}</div></figure>`;
  }else if(a.kind==='slider'){
    const value=d.number===''?a.initial:numberValue(d.number);
    html=`<label class="br-ex-range">Tu valor: <output data-ex-output>${esc(value)} ${esc(a.unit||'')}</output><input type="range" data-ex-input="slider" min="${a.min}" max="${a.max}" step="${a.step}" value="${value}" aria-label="Tu respuesta en ${esc(a.unit||'unidades')}" ${locked?'disabled':''}></label><div class="br-ex-range-ends"><span>${a.min} ${esc(a.unit||'')}</span><span>${a.max} ${esc(a.unit||'')}</span></div><p class="br-ex-note">Mueve el control para registrar tu respuesta. También puedes usar las flechas del teclado.</p>`;
  }else if(a.kind==='interval'){
    html=`<div class="br-ex-scale" aria-label="Escala">${a.options.map((v,i)=>`<span class="${d.matches[0]!==undefined&&d.matches[1]!==undefined&&i>=Number(d.matches[0])&&i<=Number(d.matches[1])?'is-marked':''}">${esc(v)}</span>`).join('')}</div>${select({label:'Inicio del intervalo',options:a.options},0,d,locked)}${select({label:'Final del intervalo',options:a.options},1,d,locked)}`;
  }else if(a.kind==='allocate'){
    const allocation=d.vars.exerciseAlloc?.length===a.labels.length?d.vars.exerciseAlloc:a.labels.map(()=>0);
    const used=allocation.reduce((x,y)=>x+y,0);
    html=`<p class="br-ex-budget" aria-live="polite">${a.budget-used} fichas por repartir de ${a.budget} · cada ficha = ${esc(a.tokenUnit)}</p><div class="br-ex-allocation">${a.labels.map((v,i)=>`<div><strong>${esc(v)}</strong><div>${button('−','minus',i,false,locked||allocation[i]===0,`aria-label="Quitar una ficha a ${esc(v)}"`)}<output aria-label="Fichas en ${esc(v)}">${allocation[i]}</output>${button('+','plus',i,false,locked||used>=a.budget,`aria-label="Añadir una ficha a ${esc(v)}"`)}</div></div>`).join('')}</div>`;
  }else if(a.kind==='short'){
    const numeric=typeof a.answer==='number';
    html=`<label class="br-ex-short">Tu respuesta${a.unit?' · '+esc(a.unit):''}<input data-ex-input="${numeric?'number':'word'}" type="text" ${numeric?'inputmode="decimal"':''} autocomplete="off" maxlength="${numeric?32:48}" value="${esc(numeric?d.number:d.vars.exerciseText||'')}" placeholder="${numeric?'Escribe el resultado':'Escribe la palabra'}" ${locked?'disabled':''}></label><p class="br-ex-note">${numeric?'Puedes utilizar una calculadora.':'Aceptamos mayúsculas, minúsculas y palabras sin tilde.'}</p>`;
  }else{
    if(a.kind==='audio')html+=`${button('Escuchar explicación','listen','',false,false)}<p class="br-ex-note" data-ex-audio-status aria-live="polite"></p><details class="br-ex-transcript"><summary>Leer la explicación del audio</summary><p>${esc(a.narration)}</p></details>`;
    if(a.kind==='clues')html+=`<div class="br-ex-clues"><ol>${a.clues.slice(0,d.vars.exerciseClues||0).map(c=>`<li>${esc(c)}</li>`).join('')}</ol>${button((d.vars.exerciseClues||0)?'Mostrar otra pista':'Mostrar primera pista','clue','',false,locked||(d.vars.exerciseClues||0)>=a.clues.length)}</div>`;
    if(a.kind==='sequence')html+=`<ol class="br-ex-sequence">${a.sequence.map(v=>`<li>${esc(v)}</li>`).join('')}</ol>`;
    if(a.kind==='reverse')html+=`<blockquote class="br-ex-answer">${esc(a.response)}</blockquote>`;
    html+=`<div class="${a.kind==='grid'?'br-ex-grid':'br-ex-bank'}">${a.options.map((v,i)=>button(v,listKinds.includes(a.kind)?'toggle':'choose',i,listKinds.includes(a.kind)?d.selected.includes(i):d.choice===i,locked)).join('')}</div>`;
  }
  return `<section class="br-new-exercise" data-exercise-kind="${a.kind}"><p class="br-ex-instruction">${esc(a.instruction)}</p>${html}</section>`;
}
export function activityAction(a,d,action,raw,indexRaw){
  const v=Number(raw), i=Number(indexRaw);
  if(action==='choose'&&index(v,a.options?.length)){d.choice=v;return true;}
  if(action==='toggle'&&index(v,a.options?.length)){d.selected=d.selected.includes(v)?d.selected.filter(x=>x!==v):[...d.selected,v];return true;}
  if(action==='focus'&&index(v,a.rows?.length)){d.vars.exerciseFocus=v;return true;}
  if(action==='bucket'&&a.kind==='classify'&&index(v,a.rows[0].options.length)){
    const focus=index(d.vars.exerciseFocus,a.rows.length)?d.vars.exerciseFocus:0;d.matches[focus]=String(v);
    const next=a.rows.findIndex((_,j)=>d.matches[j]===undefined||d.matches[j]==='');if(next>=0)d.vars.exerciseFocus=next;
    return true;
  }
  if(action==='row'&&index(i,a.rows?.length)&&index(v,a.rows[i].options.length)){
    d.matches[i]=String(v);
    if(a.kind==='table'){const next=a.rows.findIndex((_,j)=>d.matches[j]===undefined||d.matches[j]==='');if(next>=0)d.vars.exerciseFocus=next;}
    return true;
  }
  if(['up','down','drop'].includes(action)&&a.kind==='sort'){
    const target=action==='drop'?i:v+(action==='up'?-1:1);
    if(!index(v,d.order.length)||!index(target,d.order.length))return false;
    const item=d.order.splice(v,1)[0];d.order.splice(target,0,item);d.vars.exerciseTouched=1;return true;
  }
  if(action==='append'&&a.kind==='build'&&index(v,a.items.length)&&!d.order.includes(v)){d.order.push(v);d.vars.exerciseTouched=1;return true;}
  if(action==='remove'&&a.kind==='build'&&index(v,d.order.length)){d.order.splice(v,1);return true;}
  if(['plus','minus'].includes(action)&&a.kind==='allocate'&&index(v,a.labels.length)){
    const values=d.vars.exerciseAlloc?.length===a.labels.length?[...d.vars.exerciseAlloc]:a.labels.map(()=>0);
    if(action==='plus'&&values.reduce((x,y)=>x+y,0)<a.budget)values[v]++;
    else if(action==='minus'&&values[v]>0)values[v]--;else return false;
    d.vars.exerciseAlloc=values;return true;
  }
  if(action==='clue'&&a.kind==='clues'&&(d.vars.exerciseClues||0)<a.clues.length){d.vars.exerciseClues=(d.vars.exerciseClues||0)+1;d.hinted=true;return true;}
  return false;
}
export function activityInput(a,d,kind,value,indexRaw){
  if(kind==='row'){
    const i=Number(indexRaw),n=Number(value), options=a.kind==='interval'?a.options:a.rows?.[i]?.options;
    if(!options||!index(i,a.kind==='interval'?2:a.rows.length)||value!==''&&!index(n,options.length))return false;
    d.matches[i]=value===''?'':String(n);return true;
  }
  if(kind==='slider'&&a.kind==='slider'){
    const n=Number(value);if(!Number.isFinite(n)||n<a.min||n>a.max)return false;
    d.number=String(n);d.vars.exerciseTouched=1;return true;
  }
  if(kind==='word'&&a.kind==='short'&&typeof a.answer==='string'){d.vars.exerciseText=String(value).slice(0,48);return true;}
  if(kind==='number'&&a.kind==='short'&&typeof a.answer==='number'){d.number=String(value).slice(0,32);return true;}
  return false;
}
