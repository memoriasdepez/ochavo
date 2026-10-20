import {learn,choice,multi,match,order,truth,rows,activity,table,pair} from './helpers.mjs';
import {validateActivity} from '../../src/exercise-formats.js';
import {cases as firstCases} from './cases-2-20.mjs';
import {cases as laterCases} from './cases-21-40.mjs';
import {earlySituations} from './early-situations.mjs';
import {earlyProgressionTeaching} from './early-progression-teaching.mjs';
import {investigations} from './late-investigations.mjs';
import {lateProgression} from './late-progression.mjs';
import {lateTeaching} from './late-teaching.mjs';
import {clarityRelations181To340 as relations,clarityFigures181To340 as figures,clarityBoards181To340 as boards,clarityNumericCaseAlternatives181To340 as numericCaseAlternatives} from './clarity-181-340-data.mjs';

const REVISION='stocks-clarity-variety-2026-10-11';
const caseClarifications={
632:{scene:'Una empresa muestra 4 € de patrimonio contable por acción. Sus acciones se negocian a 7 € y un analista estima un valor de 6 € por acción a partir de cobros futuros.',question:'¿Qué revisión ayuda a valorar si pagar 7 € resulta razonable?',correct:'Revisar los supuestos de la estimación de 6 € y compararla con el precio de 7 €',incorrectOptions:['Usar los 4 € del balance como precio máximo sin revisar el futuro del negocio','Tomar los 7 € negociados como prueba de que la estimación debe ser de 7 €'],explanation:'El precio y la estimación responden a preguntas distintas. Para valorar la compra, hay que entender los supuestos de la estimación y compararlos con lo que se paga.',teaching:'El valor contable no fija por sí solo un precio de compra. Una estimación intenta valorar lo que el negocio podrá generar, pero depende de supuestos. Compararla con el precio observado ayuda a plantear una decisión; primero hay que revisar cómo se obtuvo.'},
733:{scene:'Una empresa pagó 60 € por un desarrollo: registró 20 € como gasto y 40 € como activo. Al año siguiente abandona ese desarrollo y deja de utilizarlo.',question:'¿Qué comprobarías antes de mantener los 40 € como activo?',correct:'Si el desarrollo todavía puede utilizarse o generar beneficios futuros',incorrectOptions:['Si los 20 € de gasto del primer año explican por sí solos que los 40 € sigan siendo un activo','Si registrar los 40 € como activo aplazó también el pago inicial'],explanation:'Abandonar el desarrollo cambia la justificación económica del activo. Haber repartido el gasto en las cuentas no demuestra que el recurso siga siendo útil ni aplaza el pago ya realizado.',teaching:'Registrar un desembolso como activo exige justificar su utilidad futura. Esa explicación puede dejar de valer: si se abandona un desarrollo, hay que comprobar si aún puede utilizarse o generar beneficios. El gasto de años anteriores y el pago inicial son cuestiones distintas.'}
};
const cases={...firstCases,...laterCases,...caseClarifications};
const clone=value=>structuredClone(value);
const first=text=>text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()||text;
const lower=text=>(/^[A-ZÁÉÍÓÚÑ]{2,}(?:\b|\s)/.test(text)?text:text.charAt(0).toLocaleLowerCase('es')+text.slice(1)).replace(/\.$/,'');
const rotate=(entries,seed)=>entries.slice(seed%entries.length).concat(entries.slice(0,seed%entries.length));
const kind=step=>step.activity?.kind||step.type;
const HINT='Relaciona lo ocurrido con su efecto. No añadas una mejora o un cobro que el caso no demuestra.';

function finish(q){
 q.hint=HINT;
 if(q.activity){q.activity.hint=HINT;validateActivity(q.activity,`${q.title}`);}
 return q;
}
function selected(title,body,good,bad,explanation,seed){
 const options=rotate([good,...bad],seed);
 return finish(choice(title,body,options,options.indexOf(good),explanation));
}
function hinted(q,clues){
 return finish(activity(q,'clues',{options:q.options.map(option=>option.text),answer:q.answer,clues,instruction:'Elige una respuesta. Puedes abrir las pistas si te ayudan.'}));
}
const sequences={
634:['Estimar lo recuperable al vender','Restar obligaciones y costes de cierre','Atribuir el resto a propietarios'],
639:['Elegir métodos adecuados para los datos','Comparar resultados y supuestos','Investigar la causa de diferencias relevantes'],
648:['Delimitar el valor del negocio','Ajustar deuda y recursos no incluidos','Obtener el valor que corresponde a accionistas'],
649:['Calcular el valor del negocio','Ajustar los derechos de otros financiadores','Dividir el total del accionista entre sus acciones'],
659:['Calcular tu porcentaje antes de la emisión','Calcular tu porcentaje después','Estudiar recursos recibidos para evaluar el efecto en valor'],
669:['Homogeneizar periodo y beneficio de referencia','Calcular y comparar los PER','Interpretar diferencias de crecimiento y riesgo'],
679:['Identificar a quién corresponde el precio usado','Identificar a quién corresponde el resultado usado','Corregir la mezcla antes de comparar múltiplos'],
689:['Definir criterios de negocio y riesgo','Seleccionar candidatos y homogeneizar datos','Documentar las diferencias que siguen pendientes'],
699:['Estimar actividad y recursos necesarios','Construir los pagos y cobros compatibles','Revisar que los supuestos encajan entre sí'],
708:['Identificar para quién queda el flujo','Comprobar moneda y tipo de importes','Elegir una tasa compatible'],
727:['Ajustar valor de empresa hasta valor del accionista','Comprobar el total de acciones con esos derechos','Dividir para estimar valor por acción'],
738:['Localizar el apartado relevante del informe del auditor','Leer el problema concreto que describe','Revisar cómo afecta a las cuentas analizadas'],
758:['Repartir a los acreedores prioritarios','Atender los derechos de otros acreedores','Atribuir solo el resto a accionistas'],
768:['Valorar actividades sin duplicaciones','Incorporar deuda y otros ajustes no incluidos','Obtener el total del accionista'],
789:['Escribir las hipótesis de la tesis','Buscar pruebas a favor y en contra','Definir cómo revisarla y relacionarla con el precio']
};

function relationTask(id,title){
 const cards=relations[id], effects=cards.map(card=>card.effect);
 if(new Set(effects).size!==3)throw Error(`Destinos repetidos ${id}`);
 const mode=(id-630)%8;
 const feedback=cards.map(card=>`${card.case}: ${lower(card.effect)}.`).join(' ');
 const body='Resuelve estos tres ejemplos independientes con la idea que acabas de aprender.';
 if(sequences[id]){
  const chronological=sequences[id],items=rotate(chronological,id%3+1);
  const q=order('Pon el procedimiento en orden','Ordena los pasos de este análisis. Cada paso utiliza el resultado del anterior.',items,chronological.map(item=>items.indexOf(item)),chronological.join(' → ')+'.');
  q.hint='Identifica qué hay que conocer antes de realizar el siguiente paso.';return q;
 }
 if(mode===0)return finish(match('Relaciona situación y efecto',body,cards.map(card=>[card.case,card.effect]),feedback));
 if(mode===1){
  const claims=cards.map((card,i)=>[`${card.case}. Esto implica: ${lower(effects[i===1?2:i])}.`,i!==1]);
  return finish(truth('Comprueba las conclusiones','Decide si cada conclusión describe correctamente su propio ejemplo.',claims,feedback));
 }
 if(mode===2){
  const entries=cards.slice(0,2).map((card,i)=>({label:`${card.case}. Un informe dice: «${effects[(i+1)%3]}».`,wrongWord:effects[(i+1)%3],options:rotate(effects,id+i),answer:rotate(effects,id+i).indexOf(card.effect)}));
  const q=rows('repair','Corrige el informe','Sustituye la conclusión equivocada de cada ejemplo por la que encaja.',entries,feedback);
  q.activity.instruction='Corrige dos conclusiones. Cada ejemplo tiene una sola sustitución adecuada.';return finish(q);
 }
 if(mode===3)return finish(rows('classify','Clasifica los tres ejemplos','Coloca cada situación en el efecto económico que le corresponde.',cards.map(card=>({label:card.case,options:effects,answer:effects.indexOf(card.effect)})),feedback));
 if(mode===4){
  const entries=cards.map((card,i)=>({label:card.case,options:rotate(effects,id+i),answer:rotate(effects,id+i).indexOf(card.effect)}));
  const q=rows('table','Completa las consecuencias','Completa cada fila con lo que explica esa situación.',entries,feedback);
  q.activity.columnLabels=['Lo que ocurre','Consecuencia'];return finish(q);
 }
 if(mode===5){
  const proposals=cards.map((card,i)=>({text:`${card.case}: ${lower(effects[i===2?0:i])}.`,yes:i!==2}));
  const options=rotate(proposals,id),good=options.flatMap((option,i)=>option.yes?[i]:[]);
  const q=choice('Conserva las conclusiones correctas','Selecciona las dos conclusiones que encajan con su ejemplo.',options.map(option=>option.text),good[0],feedback);
  return finish(activity(q,'all',{options:options.map(option=>option.text),answers:good,instruction:'Hay dos conclusiones correctas. Selecciona ambas.'}));
 }
 if(mode===6){
  const proposals=rotate(cards.map((card,i)=>({text:`${card.case}: ${lower(effects[i===0?1:i])}.`,yes:i!==0})),id);
  const q=choice('Señala la conclusión incorrecta','Un informe contiene estos tres ejemplos. Señala el que tiene una conclusión equivocada.',proposals.map(option=>option.text),proposals.findIndex(option=>!option.yes),feedback);
  return finish(activity(q,'intruder',{options:q.options.map(option=>option.text),answer:q.answer,instruction:'Señala una sola conclusión incorrecta.'}));
 }
 return finish(rows('diagram','Une causa y consecuencia','Completa cada conexión entre un hecho y su efecto.',cards.map((card,i)=>({label:card.case,options:rotate(effects,id+i),answer:rotate(effects,id+i).indexOf(card.effect)})),feedback));
}

function caseTask(id,seed,hasNumeric=false){
 const c=hasNumeric&&numericCaseAlternatives[id]?numericCaseAlternatives[id]:cases[id];
 const q=selected('Aplica la idea al caso',`${c.scene}\n\n${c.question}`,c.correct,c.incorrectOptions||[c.incorrect],c.explanation,seed);
 return seed%3===1?hinted(q,['Identifica qué está cambiando en este ejemplo.','Revisa si la respuesta usa ese cambio o da por hecho algo que no aparece.']):q;
}
function figureFor(id){
 const f=figures[id];
 if(!f)return undefined;
 if(f.headers)return table(f.headers,f.rows,'Ejemplo inventado y simplificado para aprender.');
 return {kind:'bars',...clone(f)};
}
function boardTask(id,mode){
 const b=boards[id],f=figureFor(id);
 const q=selected('Interpreta el cuadro',`${b.question}\n\nUsa los datos del ejemplo mostrado.`,b.correct,b.wrong,b.teaching,id+3);
 q.figure=f;
 if(id===752){
  return finish(activity(q,'hotspot',{options:f.labels,values:f.values,axis:f.caption,unit:f.unit,answer:0,instruction:'Señala el año en el que primero revisarías recursos para atender el principal.'}));
 }
 if(mode===1){
  const claims=rotate([{text:b.correct,yes:true},...b.wrong.map(text=>({text,yes:false}))],id);
  const task=truth('Valora las lecturas del cuadro',`${b.question}\n\nDecide si cada respuesta está justificada por el cuadro.`,claims.map(item=>[item.text,item.yes]),b.teaching);
  task.figure=f;return finish(task);
 }
 if(mode===2){
  const options=q.options.map(option=>option.text);
  const task=rows('repair','Corrige la lectura del cuadro',b.question,[{label:`Una persona responde: «${b.wrong[0]}».`,wrongWord:b.wrong[0],options,answer:q.answer}],b.teaching);
  task.figure=f;task.activity.instruction='Sustituye la interpretación equivocada por la que encaja con los datos.';return finish(task);
 }
 if(mode===3)return hinted(q,['Identifica qué mide cada cifra del cuadro.','Busca la relación entre esas cifras; una cifra aislada no resuelve toda la pregunta.']);
 return q;
}

function nuanceTask(id,mode){
 const s=earlySituations[id],p=investigations[id];
 const scene=s?.scene||p.scene,good=s?.correct||p.action,bad=s?.incorrect||p.shortcut;
 const explanation=s?`${s.correct} ${earlyProgressionTeaching[id].nuanceBody}`:`${p.action}. ${lateProgression[id].investigationTakeaway}`;
 const q=selected(s?'Interpreta una situación nueva':'Decide qué comprobar',`${scene}\n\n${s?'¿Qué conclusión encaja con lo ocurrido?':'¿Qué harías para comprobar el problema?'}`,good,[bad],explanation,id+5);
 if(mode===1)return hinted(q,[s?'Distingue lo observado de lo que todavía no sabes.':'Identifica qué dato falta para resolver la duda.',s?'No atribuyas a una cifra un efecto que no mide.':'El plan debe responder a esta situación concreta.']);
 if(mode===2)return finish(truth('Pon a prueba las propuestas',`${scene}\n\n${s?'¿Es correcta cada interpretación?':'¿Responde cada propuesta a la duda del caso?'}`,rotate([[good,true],[bad,false]],id),explanation));
 if(mode===3){
  const labels=s?['Conclusión apoyada','Conclusión no apoyada']:['Comprobación útil','Atajo insuficiente'];
  return finish(rows('classify','Separa los dos criterios',scene+'\n\nClasifica las propuestas según respondan correctamente al caso.',rotate([{label:good,options:labels,answer:0},{label:bad,options:labels,answer:1}],id),explanation));
 }
 return q;
}
function evidenceTask(id,mode){
 const s=earlySituations[id],p=investigations[id],good=s?.evidence||p.evidence,bad=s?.distraction||p.shortcut;
 const scene=s?.scene||p.scene,body=`${scene}\n\n¿Qué información te ayudaría a comprobar el problema?`;
 const explanation=s?earlyProgressionTeaching[id].checkBody:lateProgression[id].verificationTeaching;
 const q=selected('Busca la información necesaria',body,good,[bad],explanation,id+7);
 if(mode===1)return hinted(q,['Nombra la duda antes de elegir una fuente.','Los datos deben permitir comprobar esa duda, aunque otras cifras también sean interesantes.']);
 if(mode===2){
  return finish(match('Relaciona información y utilidad',scene+'\n\nRelaciona cada propuesta con lo que permite comprobar en este caso.',[[good,'Responde a la duda'],[bad,'No basta para resolverla']],explanation));
 }
 const options=['Responde a la duda','No basta para resolverla'];
 return finish(rows('table','Completa la revisión de fuentes',scene+'\n\nEvalúa la utilidad de cada propuesta para esta duda.',rotate([{label:good,options,answer:0},{label:bad,options,answer:1}],id),explanation));
}

// Wrong conclusions are authored individually. Swapping two correct effects
// would create extra true claims when the effects are not mutually exclusive.
const examMultiIncorrect={
638:['A: el rango calculado impide negociar a ese precio.','B: las ventas débiles describen el extremo favorable por vender menos.'],
646:['A: consolidar la filial convierte ese 70 % en propiedad del 100 %.','B: las participaciones de otros socios son deuda financiera.'],
654:['A: emitir acciones elimina el coste económico del premio.','B: recomprar títulos ya emitidos aumenta el total de acciones emitidas.'],
662:['A: el beneficio retenido ya se ha cobrado como dividendo.','B: el cociente mide el dividendo cobrado respecto al precio.'],
678:['A: el PER mide el dinero repartido como dividendo.','B: ordenar los PER negativos permite compararlos como los positivos.'],
686:['A: ajustar solo a la favorita hace homogénea la comparación.','B: esa venta puntual puede usarse como beneficio habitual sin más pruebas.'],
694:['A: la depreciación es un nuevo pago anual de la máquina.','B: sumar el gasto de vuelta financia por sí mismo las reposiciones futuras.'],
702:['A: basta una referencia en dólares sin ajustar la moneda.','B: basta una referencia de un día sin revisar el plazo de veinte años.'],
710:['A: debe añadirse continuidad perpetua aunque la actividad termine.','B: el final del presupuesto demuestra que termina la actividad.'],
734:['A: la subida demuestra que se han vendido más unidades.','B: alargar la vida útil devuelve parte del dinero pagado por la máquina.'],
742:['A: el activo fiscal puede darse por recuperable sin beneficio futuro suficiente.','B: la previsión equivale a dinero ingresado hoy en el banco.'],
758:['A: puede apartarse su reparto antes de atender las obligaciones.','B: comparte la misma prioridad que el accionista del ejemplo.'],
766:['A: basta la deuda total sin asignar obligaciones a cada entidad.','B: los gastos duplicados no afectan al valor separado.'],
774:['A: subir ventas demuestra que ha aumentado la caja operativa.','B: un préstamo nuevo cuenta como caja operativa sostenible.'],
782:['A: la mejora justifica ignorar el precio que se pagó.','B: explicar la ventaja del negocio demuestra ya que el precio es atractivo.']
};

function examTransferTask(id,seed){
 if(id===630){
  const q=selected('Precio y cambios del negocio','Compara estas dos empresas:\n\nA. Pierde un contrato importante, pero su precio en bolsa no cambia.\nB. Su acción cae, sin noticias que hayas verificado sobre el negocio.\n\n¿Qué revisión corresponde a cada una?','A: revisar los cobros previstos. B: investigar el motivo de la caída.',['A: mantener la estimación por su precio estable. B: bajarla al ritmo del precio.','A y B: sustituir la estimación por el precio observado en bolsa.'],'En A hay un cambio concreto del negocio que puede afectar a los cobros futuros. En B solo conocemos un movimiento del precio: hay que investigar qué lo explica antes de cambiar las previsiones.',seed);
  delete q.hint;q.reviewLesson=id;return q;
 }
 const cards=rotate(relations[id],id%3),[a,b,c]=cards;
 const statement=(firstEffect,secondEffect)=>`A: ${lower(firstEffect)}. B: ${lower(secondEffect)}.`;
 const good=statement(a.effect,b.effect);
 const wrong=[statement(c.effect,b.effect),statement(a.effect,c.effect)];
 const body=`Una revisión compara estos dos casos independientes:\n\nA. ${a.case}.\nB. ${b.case}.\n\n¿Qué lectura interpreta correctamente los dos casos?`;
 const explanation=`En A, ${lower(a.case)} implica ${lower(a.effect)}. En B, ${lower(b.case)} implica ${lower(b.effect)}. No hay que atribuir a ninguno el efecto de otra situación.`;
 if(id%4===2){
  let q;
  if(id%8===2){
   q=match('Relaciona dos casos',`Estudia estos dos casos independientes:\n\nA. ${a.case}.\nB. ${b.case}.\n\nRelaciona cada caso con su consecuencia.`,[[`A. ${a.case}`,a.effect],[`B. ${b.case}`,b.effect]],explanation);
  }else{
   const incorrect=examMultiIncorrect[id];
   if(!incorrect)throw Error(`Faltan distractores de examen ${id}`);
   const proposals=rotate([{text:`A: ${lower(a.effect)}.`,yes:true},{text:`B: ${lower(b.effect)}.`,yes:true},...incorrect.map(text=>({text,yes:false}))],seed);
   q=multi('Selecciona las dos lecturas correctas',`Compara los casos independientes:\n\nA. ${a.case}.\nB. ${b.case}.\n\nSelecciona las dos conclusiones que corresponden a su caso.`,proposals.map(item=>item.text),proposals.flatMap((item,i)=>item.yes?[i]:[]),explanation);
  }
  delete q.hint;q.reviewLesson=id;return q;
 }
 const q=selected('Compara dos situaciones',body,good,wrong,explanation,seed);
 delete q.hint;q.reviewLesson=id;
 return q;
}

function keepVariety(lesson,pairs,id){
 const unique=()=>new Set(pairs.map(p=>kind(p[1]))).size;
 if(unique()>=3)return;
 const s=earlySituations[id],p=investigations[id],scene=s?.scene||p.scene,good=s?.correct||p.action,bad=s?.incorrect||p.shortcut;
 // Choose a distinct control only for the same self-contained interpretation.
 const occupied=new Set(pairs.map(p=>kind(p[1])));
 const q=selected('Resuelve con pistas',`${scene}\n\n${s?'¿Qué puedes concluir?':'¿Qué comprobarías?'}`,good,[bad],s?.correct||p.action,id);
 if(!occupied.has('clues'))pairs[2][1]=hinted(q,['Identifica el cambio observado.','Relaciona ese cambio con la explicación anterior.']);
 else if(!occupied.has('truth'))pairs[2][1]=finish(truth('Comprueba la interpretación',scene,[[good,true],[bad,false]],q.explanation));
 else if(!occupied.has('classify')){
  const options=['Apoyada por el caso','No apoyada por el caso'];
  pairs[2][1]=finish(rows('classify','Distingue las propuestas',scene,[{label:good,options,answer:0},{label:bad,options,answer:1}],q.explanation));
 }
 if(unique()<3)throw Error(`Falta variedad en ${id}`);
}

// These cases are easier to read as a small report than as one dense paragraph.
// The figures contain the evidence, never an extra conclusion or answer key.
const caseReports={
 667:table(['Empresa','Precio por acción','Resultado por acción'],[['A','8 €','−2 € (pérdida)'],['B','12 €','2 € (beneficio)']],'Dos empresas ficticias. Cifras simplificadas.'),
 676:table(['Partida','Dato'],[['Valor en bolsa','80 €'],['Patrimonio contable','100 €'],['Activos incluidos','Venta incierta']],'Extracto de una valoración ficticia.'),
 715:table(['Situación','Margen'],[['Años habituales','12 %'],['Un año con el rival cerrado temporalmente','25 %'],['Previsión propuesta','25 % todos los años futuros']],'Comparación de resultados y previsión inventados.'),
 716:table(['Parte del modelo','Dato'],[['Periodo de referencia','Último año proyectado'],['EBITDA de ese año','30 €'],['Múltiplo de salida','7 veces'],['Resultado de multiplicarlos','210 €']],'Extracto de un modelo de valoración simulado.'),
 739:table(['Parte de las cuentas','Qué se conoce'],[['Clientes pendientes de cobro','Han aumentado'],['Explicación de la dirección','La empresa está creciendo'],['Detalle de facturas y cobros','No se ha aportado']],'Extracto de cuentas y comentario de dirección inventados.'),
 748:table(['Bloque de valoración','Tratamiento del mismo compromiso'],[['Flujos previstos','Incluyen todos sus pagos'],['Ajuste al valor final','Se resta otra vez su valor completo']],'Recorrido de una obligación en un modelo simulado.'),
 772:table(['Órgano','Actividad en el caso'],[['Consejo','Aprueba la estrategia y supervisa al director ejecutivo'],['Equipo directivo','Organiza las entregas diarias']],'Organización ficticia: supervisión y operación diaria.'),
 787:table(['Duda','Impacto en la valoración','Coste de investigar'],[['Contrato principal','Puede cambiar mucho el valor','Igual en ambos casos'],['Gasto mínimo','Apenas cambia el valor','Igual en ambos casos']],'Matriz de prioridades de una investigación simulada.'),
};
export function refineClarity181To340(result,records){
 for(const lesson of result.lessons.filter(item=>item.id>=630&&item.id<=789)){
  const id=lesson.id,r=records[id-450],c=cases[id],s=earlySituations[id],p=investigations[id],progress=lateProgression[id],early=earlyProgressionTeaching[id];
  if(!r||!c||!relations[id]||(!s&&!p))throw Error(`Falta autoría clara ${id}`);
  const numeric=lesson.steps[7].type==='numeric'?clone(lesson.steps[7]):null;
  const firstPair=[learn(lesson.title,`${r.concept}\n\n${r.limit}`,r.meaning),relationTask(id,lesson.title)];
  if(sequences[id])firstPair[0].body+='\n\nEn este procedimiento: '+sequences[id].map((text,i)=>`${i+1}. ${text.toLocaleLowerCase('es')}`).join('; ')+'.';
  const caseBody=(numeric&&numericCaseAlternatives[id]?.teaching)||caseClarifications[id]?.teaching||early?.caseBody||progress.caseTeaching||c.teaching;
  const second=pair('Del concepto a una decisión',caseBody,first(caseBody),caseTask(id,id%4,Boolean(numeric)));
  if(caseReports[id])second[1].figure=caseReports[id];
  let third;
  if(boards[id]){
   const b=boards[id];
   third=[learn('Comprueba qué muestran los datos',b.teaching,first(b.teaching)),boardTask(id,Math.floor(id/3)%4)];
  }else{
   const text=early?.nuanceBody||progress.investigationTeaching||lateTeaching[id];
   third=[learn('Otro caso para entender el matiz',text,first(text)),nuanceTask(id,(id+1)%4)];
  }
  let fourth;
  if(numeric){
   fourth=[clone(lesson.steps[6]),numeric];
   fourth[0].title='Calcula e interpreta';
  }else{
   const text=early?.checkBody||progress.verificationTeaching;
   fourth=[learn('Qué información buscarías',text,first(text)),evidenceTask(id,id%3)];
  }
  const pairs=[firstPair,second,third,fourth];
  keepVariety(lesson,pairs,id);
  // Change adjacent sequences, while the existing numerical reward slot stays
  // at index 7. Every activity retains its immediately preceding teaching.
  const sequence=id%2?[firstPair,third,second,fourth]:pairs;
  lesson.steps=sequence.flat();
  lesson.summary=lesson.steps[0].body;
  lesson.takeaway=lesson.steps[6].takeaway;
  lesson.story={...lesson.story,scene:lesson.title,text:lesson.steps[0].takeaway,hideDuringPractice:true};
  lesson.editorialRevision=REVISION;
  lesson.qualitativeRevision='stocks-clarity-181-340-2026-10-11';
  for(const step of lesson.steps)if(step.activity)validateActivity(step.activity,`Acciones ${id}`);
 }
 for(const exam of result.exams.filter(item=>item.id>=63&&item.id<=78)){
  exam.steps=exam.steps.map((original,index)=>{
   const id=original.reviewLesson??exam.id*10+index;
   if(id<630||id>789||original.type==='numeric')return original;
   return examTransferTask(id,exam.id+index);
  });
  exam.editorialRevision=REVISION;
 }
 return result;
}
