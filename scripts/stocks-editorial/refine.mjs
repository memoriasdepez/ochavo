import {calculate} from '../course-authoring.mjs';
import {pair,choice,multi,numeric,match,rows,truth,activity,table,usePairs,REVISION} from './helpers.mjs';
import {firstWorld} from './first-world.mjs';
import {secondWorld} from './second-world.mjs';
import {refineEarlyWorlds} from './worlds-3-25.mjs';
import {refineLateWorlds} from './worlds-26-50.mjs';
import {refineMarketOpening} from './market-opening.mjs';
import {refineCompoundWorld} from './compound-world.mjs';
import {refineEarlyChallenges} from './challenge-early.mjs';
import {refineLateChallenges} from './challenge-late.mjs';
import {CHALLENGE_REVISION,FIRST_CHALLENGE_LESSON,FIRST_CHALLENGE_EXAM} from './challenge-constants.mjs';
import {refineClarity41To180} from './clarity-41-180.mjs';
import {refineClarity181To340} from './clarity-181-340.mjs';
import {refineClarity341To500} from './clarity-341-500.mjs';
import {refineRealExamples} from './real-examples.mjs';
import {refineOpeningEdits} from './opening-edits.mjs';
import {refineDepthTeaching} from './depth-teaching.mjs';
import {refineSecondCorrections} from './second-corrections.mjs';
import {refineLessonNotes} from './lesson-notes.mjs';
import {refineMarketEdits} from './market-edits.mjs';
import {refineCompoundNotes} from './compound-notes.mjs';
import {refineRiskNotes} from './risk-notes.mjs';
import {refineClearWriting} from './clear-writing.mjs';
import {refineOrderNotes} from './order-notes.mjs';
import {cases as early} from './cases-2-20.mjs';
import {cases as middle} from './cases-21-40.mjs';
import {cases as advanced} from './cases-41-50.mjs';
const cases={...early,...middle,...advanced};
const f=n=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:6}).format(n);
const prompt=(r,args)=>r.prompt.replace(/\{([a-d])\}/g,(_,c)=>f(args[c.charCodeAt(0)-97]));
// The same operation supplies both the worked solution and its answer key.
export function formula(op,args){
 const [a,b,c]=args.map(f), formulas={sum:args.map(f).join(' + '),sub:`${a} − ${b}`,mul:`${a} × ${b}`,div:`${a} ÷ ${b}`,pct:`${a} ÷ ${b} × 100`,change:`(${b} ÷ ${a} − 1) × 100`,real:`(${a} ÷ ${b} − 1) × 100`,remain:`${a} × (1 − ${b} ÷ 100)`,recover:`${a} ÷ (100 − ${a}) × 100`,compound:`${a} × (1 + ${b} ÷ 100)^${c}`,cagr:`((${b} ÷ ${a})^(1 ÷ ${c}) − 1) × 100`,net:`${a} − ${b} − ${c}`,gain:`${a} + ${b} − ${c}`,linked:`((1 + ${a} ÷ 100) × (1 + ${b} ÷ 100) − 1) × 100`,afterWithdrawal:`(${a} − ${b}) × (1 + ${c} ÷ 100)`,margin:`(${a} − ${b}) ÷ ${a} × 100`,breakeven:`${a} ÷ (${b} − ${c})`,pv:`${a} ÷ (1 + ${b} ÷ 100)^${c}`,terminal:`${a} ÷ (${b} ÷ 100 − ${c} ÷ 100)`,average:`(${a} + ${b}) ÷ 2`,tax:`${a} × ${b} ÷ 100`,discount:`(${a} − ${b}) ÷ ${a} × 100`,capitalise:`${a} ÷ (${b} ÷ 100)`};
 if(!formulas[op])throw Error('Missing worked method '+op);
 return formulas[op]+' = '+f(calculate(op,args));
}
const methods={sum:'Suma las cantidades que forman el total.',sub:'Resta la segunda cantidad de la primera.',mul:'Multiplica las dos cantidades indicadas. La pregunta concreta qué representa cada una y en qué unidad se expresa el resultado.',div:'Divide el importe que se reparte o compara entre la base indicada.',pct:'Divide la parte entre el total y multiplica por 100.',change:'Compara el valor final con el inicial: divide final entre inicial, resta 1 y multiplica por 100.',real:'Compara cuánto ha crecido tu dinero con cuánto han crecido los precios. Si ambos empezaban con la misma cantidad, divide sus importes finales, resta 1 y multiplica por 100. También sirve dividir sus factores de crecimiento: por ejemplo, 1,05 representa un aumento del 5 %. No mezcles un importe en euros con un factor.',remain:'Calcula lo que queda: multiplica el importe por (1 − porcentaje ÷ 100).',recover:'La recuperación se calcula sobre lo que queda: divide el porcentaje perdido entre (100 − porcentaje perdido) y multiplica por 100.',compound:'Multiplica el capital por (1 + tasa ÷ 100) una vez por cada año. El símbolo ^ indica cuántas veces se repite el factor.',cagr:'Divide el importe final entre el inicial y elévalo a (1 ÷ años); resta 1 y multiplica por 100. La potencia reparte el crecimiento entre los años de forma compuesta.',net:'Al primer importe réstale las dos cantidades que indica la pregunta.',gain:'Suma el valor final y el dinero cobrado aparte; después resta lo invertido.',linked:'Convierte cada cambio en un factor (1 + porcentaje ÷ 100), multiplica los factores, resta 1 y multiplica por 100.',afterWithdrawal:'Primero resta el dinero retirado. Después aplica el rendimiento al saldo que queda.',margin:'Resta el coste de los ingresos. Divide esa diferencia entre los ingresos y multiplica por 100.',breakeven:'Resta el coste por unidad del precio por unidad. Divide los costes fijos entre lo que deja cada unidad; obtendrás el umbral teórico.',pv:'Trae el cobro futuro al presente: divide entre (1 + tasa ÷ 100), tantas veces como años debas esperar. El símbolo ^ expresa ese número de veces.',terminal:'Usa el flujo del primer año estable. Divídelo entre (tasa de descuento − crecimiento), convirtiendo las dos tasas a decimales. La tasa de descuento debe superar al crecimiento.',average:'Para dos cantidades con el mismo peso, suma ambas y divide entre dos.',tax:'Multiplica la cantidad por el porcentaje dividido entre 100.',discount:'Resta el precio del valor estimado. Divide la diferencia entre el valor estimado y multiplica por 100.',capitalise:'Divide el ingreso anual indicado entre la tasa expresada como decimal: porcentaje ÷ 100.'};
function changeCandidate(r,factor){
 const a=[...r.args];
 const round=(value,source)=>Number.isInteger(source)?Math.round(value):Math.round(value*10000)/10000;
 const step=source=>Number.isInteger(source)?1:.01;
 // Change a surplus/loss, not its sign: quantities still awaiting payment or delivery
 // cannot become negative, and a question about a rise must still describe a rise.
 if(['sub','net','discount','margin','afterWithdrawal'].includes(r.op)){
  const base=r.op==='net'?a[1]+a[2]:a[1],delta=a[0]-base;
  a[0]=round(base+delta*factor,a[0]);
  if(delta>0&&a[0]<=base)a[0]=round(base+step(r.args[0]),r.args[0]);
  if(delta<0&&a[0]>=base)a[0]=round(base-step(r.args[0]),r.args[0]);
  a[0]=Math.max(0,a[0]);
  if(a[0]===r.args[0])a[0]=round(a[0]+(delta<0?-1:1)*step(r.args[0]),r.args[0]);
  if(a[0]<0){a[0]=r.args[0];a[1]+=step(r.args[1]);}
 }else if(r.op==='change'){
  const delta=a[1]-a[0];
  a[1]=Math.max(0,round(a[0]+delta*factor,a[1]));
  if(a[1]===r.args[1])a[1]=Math.max(0,round(a[1]+(delta<0?-1:1)*step(r.args[1]),r.args[1]));
  if(a[1]===r.args[1])a[0]+=step(r.args[0]);
 }else if(r.op==='recover'){
  a[0]=Math.max(1,Math.min(90,Math.round(a[0]*factor)));
  if(a[0]===r.args[0])a[0]=a[0]>=90?a[0]-5:a[0]+1;
 }else if(r.op==='real'){
  const reference=a[0]>10?100:1;
  a[0]=Math.round((reference+(a[0]-reference)*factor)*10000)/10000;
  if(a[0]===r.args[0])a[0]+=0.01;
 }else{
  a[0]=Math.max(step(a[0]),round(a[0]*factor,a[0]));
  if(a[0]===r.args[0])a[0]+=step(r.args[0]);
 }
 if(r.op==='pct'&&r.args[0]<=r.args[1]){
  if(a[0]>a[1])a[0]=Math.max(1,Math.floor(a[1]*.8));
  if(a[0]===r.args[0])a[1]+=Math.max(1,Math.round(a[1]*.2));
 }
 // Some authored questions use only a subset of the operands. Changing an unused
 // number would leave the visible exercise identical to the worked example.
 if(prompt(r,a)===prompt(r,r.args)){
  const visible=[...r.prompt.matchAll(/\{([a-d])\}/g)].map(m=>m[1].charCodeAt(0)-97);
  const index=visible.find(i=>i!==0)??visible[0];
  if(index===undefined)throw Error('Numeric question has no visible operands: '+r.prompt);
  a[index]+=step(r.args[index]);
 }
 if(!Number.isFinite(calculate(r.op,a)))throw Error('Invalid editorial variation: '+r.prompt);
 return a;
}
const variantCache=new WeakMap();
function changed(r,factor){
 if(!variantCache.has(r)){
  const unique=new Set([prompt(r,r.args)]),variants=new Map();
  for(const multiplier of [.8,1.25,.65,1.7]){
   const a=changeCandidate(r,multiplier);
   for(let attempts=0;unique.has(prompt(r,a));attempts++){
    if(attempts>20)throw Error('Cannot create a distinct numeric case: '+r.prompt);
    // Shift both sides together when their ordering matters. This preserves, for
    // example, an outstanding balance rather than creating an overpayment.
    if(['sub','discount','margin','afterWithdrawal','change'].includes(r.op)){a[0]+=1;a[1]+=1;}
    else if(r.op==='net'){a[0]+=2;a[1]+=1;a[2]+=1;}
    else if(r.op==='pct'){a[0]+=1;a[1]+=2;}
    else if(r.op==='recover')a[0]=a[0]>=90?a[0]-7:a[0]+1;
    else if(r.op==='real')a[0]=Math.round((a[0]+.01)*10000)/10000;
    else{
     const letter=r.prompt.match(/\{([a-d])\}/)?.[1];
     if(!letter)throw Error('Question has no displayed quantity');
     a[letter.charCodeAt(0)-97]+=1;
    }
   }
   unique.add(prompt(r,a));variants.set(multiplier,a);
  }
  variantCache.set(r,variants);
 }
 const result=variantCache.get(r).get(factor);
 if(!result)throw Error('Unknown editorial case variant '+factor);
 return [...result];
}
function numericQuestion(r,args,title){return {...numeric(title,prompt(r,args),calculate(r.op,args),r.unit,`${formula(r.op,args)} ${r.unit}. ${r.meaning}`),calculation:{operation:r.op,operands:args}};}
function newCase(c,id,kind){
 const opts=id%2?[c.incorrect,c.correct]:[c.correct,c.incorrect],answer=id%2?1:0;
 const base=choice('Resuelve esta situación',c.scene+'\n\n'+c.question,opts,answer,c.explanation);
 if(kind==='truth')return truth('Comprueba las dos respuestas',base.body,opts.map((v,i)=>['Respuesta propuesta: «'+v+'»',i===answer]),c.explanation);
 if(kind==='clues')return activity(base,'clues',{options:opts,answer,clues:[c.teaching,c.question],instruction:'Elige la respuesta que encaja con el caso. Si necesitas ayuda, puedes abrir las pistas.'});
 if(kind==='audio')return activity({...base,body:c.question},'audio',{prompt:c.question,narration:c.scene,options:opts,answer,instruction:'Escucha la situación o abre su transcripción. Después responde a la pregunta.'});
 return base;
}
// Orders differ between adjacent lessons, while every test remains attached to its explanation.
const orders=[[0,1,2,3],[0,2,1,3],[0,1,3,2],[0,3,1,2],[0,2,3,1],[0,3,2,1]];
export function refineStocks(result,records,{clarity=true,openingEdits=true,depthTeaching=true,secondCorrections=true,lessonNotes=true,marketEdits=true,compoundNotes=true,riskNotes=true,clearWriting=true,orderNotes=true}={}){
 const missing=result.lessons.slice(10).filter(l=>!cases[l.id]);
 if(missing.length)throw Error('Missing editorial cases: '+missing.map(l=>l.id).join(','));
 firstWorld(result.lessons,result.exams[0]);
 for(const lesson of result.lessons.slice(10)){
  const id=lesson.id,local=id-450,r=records[local],c=cases[id],v=local%10;
  const errorOptions=[r.meaning,r.mistake,r.limit],shift=id%3,options=errorOptions.map((_,i)=>errorOptions[(i+shift)%3]),wrong=(1-shift+3)%3;
  let diagnose=choice('Detecta el error','Una de estas conclusiones sobre «'+lesson.title.toLocaleLowerCase('es')+'» es incorrecta. Señálala.',options,wrong,`La conclusión incorrecta es: «${r.mistake}». ${r.meaning} ${r.limit}`);
  if(v%3===0)diagnose=activity(diagnose,'intruder',{options,answer:wrong,instruction:'Selecciona solo la conclusión incorrecta.'});
  else if(v%3===1)diagnose=multi('Qué puedes afirmar','Selecciona las dos conclusiones correctas sobre «'+lesson.title.toLocaleLowerCase('es')+'».',options,options.map((_,i)=>i).filter(i=>i!==wrong),r.meaning+' '+r.limit);
  else diagnose=truth('Comprueba la interpretación','Valora estas afirmaciones sobre «'+lesson.title.toLocaleLowerCase('es')+'».',options.map((s,i)=>[s,i!==wrong]),r.meaning+' '+r.limit);
  const foundations=pair(lesson.title,`${r.concept}\n\n${r.example}\n\n${r.limit}`,r.meaning,diagnose);
  const worked=changed(r,.8),calculation=numericQuestion(r,r.args,'Haz la cuenta y explica el dato');
  const workedBody=`${methods[r.op]}\n\nEjemplo resuelto: ${prompt(r,worked)}\n\n${formula(r.op,worked)} ${r.unit}. ${r.meaning} En el siguiente ejercicio se usa la misma operación con otros datos. Si el resultado tiene decimales, redondea a dos.`;
  const numbers=pair('Cómo se obtiene la cifra',workedBody,r.meaning,calculation);
  const caseTeaching=c.teaching===r.concept
   ?`${r.meaning}\n\n${r.limit}\n\nEl siguiente caso cambia la situación. Antes de responder, distingue los hechos que te da de aquello que aún no sabemos.`
   :c.teaching;
  const casePair=pair('Usa la idea en una situación nueva',caseTeaching,r.meaning,newCase(c,id,['choice','clues','truth','audio'][v%4]));
  // Comparing two self-contained scenarios requires applying the procedure twice, not copying a displayed result.
  const a=changed(r,1.25),b=changed(r,.65),av=calculate(r.op,a),bv=calculate(r.op,b);
  const scenario=table(['Situación','Datos y pregunta'],[['A',prompt(r,a)],['B',prompt(r,b)]]);
  const explanation=`A: ${formula(r.op,a)} ${r.unit}. B: ${formula(r.op,b)} ${r.unit}. ${r.meaning}`;
  let compare;
  if(v%3===0){
   compare=rows('table','Dos situaciones, dos resultados','Resuelve A y B con el procedimiento explicado. Completa el resultado de cada fila.',[
    {label:'Resultado de A',options:[f(av)+' '+r.unit,f(bv)+' '+r.unit,f(av+bv+1)+' '+r.unit],answer:0},
    {label:'Resultado de B',options:[f(av+bv+1)+' '+r.unit,f(av)+' '+r.unit,f(bv)+' '+r.unit],answer:2}],explanation);
  }else if(v%3===1){
   compare=choice('Compara sin confundir las bases','Calcula el resultado pedido en A y en B. ¿Cuál es numéricamente mayor? Comparamos la cifra, no cuál sería una mejor inversión.',['El de A','El de B','Son iguales'],av>bv?0:av<bv?1:2,explanation);
  }else{
   compare=match('Asocia cada cuenta con su resultado','Resuelve cada situación de la tabla y relaciona A y B con el resultado correspondiente.',[['Situación A',f(av)+' '+r.unit],['Situación B',f(bv)+' '+r.unit]],explanation);
  }
  if(av===bv){compare=choice('Distingue un cambio de datos de un cambio de resultado','Aunque cambian los datos entre A y B, ¿cómo quedan los dos resultados al aplicar el procedimiento?',['Coinciden','El de A es mayor','El de B es mayor'],0,explanation);}
  compare.figure=scenario;compare.calculator=true;
  const comparison=pair('Comprueba el efecto de otros datos',`${r.meaning}\n\n${methods[r.op]} En la tabla siguiente aplicarás esta cuenta a dos situaciones independientes, A y B. Usa los datos de cada fila y expresa ambos resultados en ${r.unit}.\n\nAl interpretar la diferencia, conserva este criterio: ${r.limit}`,r.meaning,compare);
  // A worked method always precedes numerical comparison, including when comparison comes before the standalone calculation.
  const pairOrder=orders[local%orders.length];
  if(pairOrder.indexOf(3)<pairOrder.indexOf(1)){
   comparison[0].body+=`\n\nReferencia resuelta: ${prompt(r,worked)} ${formula(r.op,worked)} ${r.unit}.`;
   numbers[0].body=`${methods[r.op]}\n\nYa has usado esta cuenta al comparar situaciones. Ahora resuelve una sola con nuevos datos y expresa el resultado en ${r.unit}. Fíjate en qué cantidades pide relacionar el enunciado; no reutilices el resultado anterior. Si hay decimales, redondea a dos. ${r.meaning}`;
  }
  const pairs=[foundations,numbers,casePair,comparison];
  usePairs(lesson,pairOrder.map(i=>pairs[i]));
  if(v===0)lesson.steps[0].explore={prompt:'Consulta el ejemplo o la precaución antes de practicar.',options:[{label:'Ejemplo',title:lesson.title,body:r.example},{label:'Precaución',title:'Lo que el dato no demuestra',body:r.limit}]};
 }
 // Exams use fresh numeric data and a concrete decision for every other point.
 for(const exam of result.exams.slice(1)){
  exam.editorialRevision=REVISION;
  exam.steps=exam.steps.map((_,i)=>{
   const id=exam.id*10+i,r=records[id-450],c=cases[id];
   const question=i%2===0?numericQuestion(r,changed(r,1.7),'Aplica el procedimiento'):choice('Revisa una conclusión',c.scene+'\n\nAnte la pregunta «'+c.question+'», ¿qué respuesta descartarías por ser incorrecta?',[c.correct,c.incorrect],1,c.explanation);
   question.reviewLesson=id;delete question.hint;return question;
  });
 }
 secondWorld(result.lessons,result.exams[1]);
 refineEarlyWorlds(result,records);
 refineLateWorlds(result,records);
 refineMarketOpening(result);
 refineCompoundWorld(result);
 // The point detail introduces its purpose once. Reprinting that first
 // takeaway above every later explanation defeats the authored progression.
 for(const lesson of result.lessons.filter(lesson=>lesson.id>=470))lesson.story.hideDuringPractice=true;
 // Increase qualitative difficulty after the progressive teaching revision.
 // Keep every teaching screen, numerical task and the first forty points.
 refineEarlyChallenges(result);
 refineLateChallenges(result);
 for(const lesson of result.lessons.filter(lesson=>lesson.id>=FIRST_CHALLENGE_LESSON))lesson.editorialRevision=CHALLENGE_REVISION;
 for(const exam of result.exams.filter(exam=>exam.id>=FIRST_CHALLENGE_EXAM))exam.editorialRevision=CHALLENGE_REVISION;
 // New public authoring replaces the very close distractors with direct tasks.
 // The old stage remains available for its historical regression tests only.
 if(clarity){
  refineClarity41To180(result,records);
  refineClarity181To340(result,records);
  refineClarity341To500(result,records);
  refineRealExamples(result);
  for(const lesson of result.lessons.filter(lesson=>lesson.id>=FIRST_CHALLENGE_LESSON))lesson.story.hideDuringPractice=true;
 }
 if(clarity&&openingEdits)refineOpeningEdits(result);
 if(clarity&&depthTeaching)refineDepthTeaching(result,records);
 if(clarity&&secondCorrections)refineSecondCorrections(result);
 if(clarity&&lessonNotes)refineLessonNotes(result);
 if(clarity&&marketEdits)refineMarketEdits(result);
 if(clarity&&compoundNotes)refineCompoundNotes(result);
 if(clarity&&riskNotes)refineRiskNotes(result);
 if(clarity&&clearWriting)refineClearWriting(result);
 if(clarity&&orderNotes)refineOrderNotes(result);
 return result;
}
