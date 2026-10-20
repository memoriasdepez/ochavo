// Parse arithmetic only; expressions never execute JavaScript or access answers.
export function calculate(expression){
 const text=String(expression).replace(/[×]/g,'*').replace(/[÷]/g,'/').replace(/[−]/g,'-').replace(/,/g,'.').replace(/\s/g,'');
 if(!text||text.length>160)throw Error('Escribe una operación, por ejemplo (100 + 120 + 140) ÷ 3.');
 let pos=0,depth=0;
 const failure=()=>{throw Error('Revisa los números, los signos y los paréntesis.');};
 function atom(){
  if(++depth>20)failure();
  let value;
  if(text[pos]==='('){pos++;value=sum();if(text[pos++]!==')')failure();}
  else{const match=text.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);if(!match)failure();pos+=match[0].length;value=Number(match[0]);}
  depth--;while(text[pos]==='%'){pos++;value/=100;}
  return value;
 }
 function power(){let value=atom();if(text[pos]==='^'){pos++;value=value**signed();}return value;}
 function signed(){if(text[pos]==='+'){pos++;return signed();}if(text[pos]==='-'){pos++;return -signed();}return power();}
 function product(){let value=signed();while(text[pos]==='*'||text[pos]==='/'){const op=text[pos++],right=signed();if(op==='/'&&right===0)throw Error('No se puede dividir entre cero.');value=op==='*'?value*right:value/right;}return value;}
 function sum(){let value=product();while(text[pos]==='+'||text[pos]==='-'){const op=text[pos++],right=product();value=op==='+'?value+right:value-right;}return value;}
 const result=sum();if(pos!==text.length)failure();
 if(!Number.isFinite(result)||Math.abs(result)>1e15)throw Error('El resultado está fuera del rango de esta calculadora.');
 return Object.is(result,-0)?0:result;
}
const keys=[['C','Borrar cálculo'],['⌫','Borrar último carácter'],['(','Abrir paréntesis'],[')','Cerrar paréntesis'],['7'],['8'],['9'],['÷','Dividir'],['4'],['5'],['6'],['×','Multiplicar'],['1'],['2'],['3'],['−','Restar'],['0'],[',','Coma decimal'],['%','Porcentaje'],['+','Sumar'],['^','Potencia'],['=','Calcular']];
export function renderCalculator({allowUse=true}={}){
 return `<details class="ta-calculator"><summary>Abrir calculadora</summary><div class="ta-calculator-body"><label>Operación<input class="ta-calculator-expression" type="text" inputmode="decimal" autocomplete="off" maxlength="160" placeholder="Ej.: (100 + 120 + 140) ÷ 3" aria-label="Operación de la calculadora"></label><p class="ta-calculator-result" role="status" aria-live="polite">Resultado: —</p><div class="ta-calculator-keys">${keys.map(([key,name])=>`<button type="button" data-ta-calc-key="${key}" aria-label="${name||key}" ${['^','='].includes(key)?'class="ta-calculator-wide"':''}>${key==='^'?'xʸ':key}</button>`).join('')}</div><p class="br-note">% divide entre 100. xʸ eleva a una potencia. Usa paréntesis para agrupar la cuenta.</p><button type="button" class="br-main-button br-wide" data-ta-calc-use disabled ${allowUse?'':'hidden'}>Usar resultado en mi respuesta</button></div></details>`;
}
export function mountCalculator(root){
 const results=new WeakMap();
 const input=box=>box.querySelector('.ta-calculator-expression');
 const answer=box=>box.closest('#br-activity')?.querySelector('#br-number,[data-ex-input="number"],[data-ex-input="slider"]');
 const clear=box=>{results.delete(box);box.querySelector('[role="status"]').textContent='Resultado: —';box.querySelector('[data-ta-calc-use]').disabled=true;};
 function compute(box){
  try{const value=calculate(input(box).value),rounded=Number(value.toFixed(10));results.set(box,rounded);box.querySelector('[role="status"]').textContent='Resultado: '+rounded.toLocaleString('es-ES',{useGrouping:false,maximumFractionDigits:10});box.querySelector('[data-ta-calc-use]').disabled=!answer(box)||answer(box).disabled;}
  catch(error){results.delete(box);box.querySelector('[role="status"]').textContent=error.message;box.querySelector('[data-ta-calc-use]').disabled=true;}
 }
 root.addEventListener('input',e=>{const box=e.target.closest('.ta-calculator');if(box&&e.target.matches('.ta-calculator-expression'))clear(box);});
 root.addEventListener('keydown',e=>{const box=e.target.closest('.ta-calculator');if(box&&e.target.matches('.ta-calculator-expression')&&e.key==='Enter'){e.preventDefault();compute(box);}});
 root.addEventListener('click',e=>{
  const button=e.target.closest('[data-ta-calc-key],[data-ta-calc-use]');if(!button)return;
  const box=button.closest('.ta-calculator'),field=input(box);
  if(button.hasAttribute('data-ta-calc-use')){const target=answer(box);if(!target||target.disabled||!results.has(box))return;const value=results.get(box);if(target.type==='range'&&(value<Number(target.min)||value>Number(target.max)||Math.abs((value-Number(target.min))/Number(target.step)-Math.round((value-Number(target.min))/Number(target.step)))>1e-8)){box.querySelector('[role="status"]').textContent='El control de este ejercicio admite valores de '+target.min+' a '+target.max+' en pasos de '+target.step+'.';return;}target.value=target.type==='range'?String(value):value.toLocaleString('es-ES',{useGrouping:false,maximumFractionDigits:10});target.dispatchEvent(new Event('input',{bubbles:true}));target.focus({preventScroll:true});return;}
  const key=button.dataset.taCalcKey;
  if(key==='='){compute(box);return;}
  clear(box);
  if(key==='C')field.value='';
  else if(key==='⌫')field.value=field.value.slice(0,-1);
  else if(field.value.length<160)field.value+=key;
 });
}
