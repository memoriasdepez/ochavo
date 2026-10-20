import {readFileSync} from 'node:fs';
import {parseAuthoring} from '../course-authoring.mjs';
import {choice,multi,activity,rows,truth} from './helpers.mjs';
import {cases as middle} from './cases-21-40.mjs';
import {cases as advanced} from './cases-41-50.mjs';
import {investigations} from './late-investigations.mjs';
import {lateTeaching} from './late-teaching.mjs';
import {lateProgression} from './late-progression.mjs';
import {lateEvidenceOptions,lateEvidenceReasons} from './late-evidence-options.mjs';
import {lateChallengeData,lateCaseQuestions} from './challenge-late-data.mjs';
import {validateActivity} from '../../src/exercise-formats.js';

const cases=Object.fromEntries(Object.entries({...middle,...advanced}).map(([id,c])=>[id,{...c,...lateCaseQuestions[id]}]));
const records=parseAuthoring([1,2,3,4,5].map(n=>readFileSync(new URL(`../../src/content/stocks-v2-authoring/part-${n}.txt`,import.meta.url),'utf8')),500);
const lower=s=>s.charAt(0).toLocaleLowerCase('es')+s.slice(1).replace(/\.$/,'');
const rotate=(values,n)=>values.map((_,i)=>values[(i+n)%values.length]);
const hint='Separa lo que se conoce de lo que falta comprobar. Una propuesta puede parecer prudente y aun así medir otra fecha, otra base o una parte distinta del problema.';
function finish(q,customHint=hint){
  q.hint=customHint;if(q.activity){q.activity.hint=customHint;validateActivity(q.activity,q.title);}return q;
}
function taggedChoice(title,body,values,correct,explanation,id){
  const options=rotate(values,id%values.length);return choice(title,body,options,options.indexOf(correct),explanation);
}
function foundation(id,lesson,r,d){
  const options=rotate([r.meaning,r.limit,d.foundationWrong],Math.floor(id/3)%3);
  const incorrect=options.indexOf(d.foundationWrong), explanation=`La interpretación «${d.foundationWrong}» cambia una condición del concepto. ${r.meaning} ${r.limit}`;
  const body=`Aplica lo explicado sobre «${lesson.title.toLocaleLowerCase('es')}». Compara el criterio de cada propuesta, además de que utilice palabras del tema.`;
  let q;
  if(id%3===0)q=activity(choice('Encuentra el matiz que falla',body,options,incorrect,explanation),'intruder',{options,answer:incorrect,instruction:'Señala la única interpretación que cambia indebidamente una condición.'});
  else if(id%3===1)q=activity(multi('Conserva las dos conclusiones defendibles',body,options,options.map((_,i)=>i).filter(i=>i!==incorrect),explanation),'all',{options,answers:options.map((_,i)=>i).filter(i=>i!==incorrect),instruction:'Selecciona las dos afirmaciones que respetan la base y el alcance de lo explicado.'});
  else q=truth('Comprueba el alcance de cada conclusión',body,options.map((v,i)=>[v,i!==incorrect]),explanation);
  return finish(q,'Comprueba si la frase conserva las condiciones del ejemplo. Tener un dato correcto no autoriza una conclusión sobre otro plazo, otra base o un efecto que no mide.');
}
function appliedCase(id,c,d){
  let correct=c.correct,incorrect=d.caseWrong;
  // A brief numerical answer can stay brief. In conceptual cases, sometimes
  // ask the learner to compare conclusions with their reasons. Keep wrong
  // conclusions intact: dropping their qualifier can make them true, and a
  // comma may be part of a decimal rather than a sentence boundary.
  if(!/\d/.test(correct)&&id%2===0){
    const reason=c.explanation.split(/(?<=[.!?])\s+/)[0];
    correct=`${correct} ${reason}`;
  }
  const q=taggedChoice('Distingue dos interpretaciones próximas',`${c.scene}\n\n${c.question}`,[correct,incorrect],correct,`${c.explanation} La alternativa «${d.caseWrong}» no conserva la condición del caso.`,Math.floor(id/4));
  if(id%4===0||id%4===2){
    const options=q.options.map(o=>o.text);
    return finish(activity(q,'clues',{options,answer:q.answer,clues:['Identifica qué permanece constante y qué cambia en esta situación.','Comprueba si la conclusión usa exactamente el importe, periodo o derecho al que se refiere la pregunta.'],instruction:'Elige la interpretación que conserva todas las condiciones. Puedes consultar las pistas.'}));
  }
  return finish(q);
}
function investigate(id,p,c,d,progress){
  const explanation=`${p.action}. ${progress.investigationTakeaway} La propuesta «${d.actionWrong}» examina una parte distinta o deja una condición necesaria sin resolver. ${progress.investigationTeaching||lateTeaching[id]}`;
  const mode=id%4;
  if(mode===0){
    const question=id===916
      ?'¿Por qué hace falta separar exposición, daño cubierto y riesgo retenido al estudiar esa concentración?'
      :`¿Por qué conviene ${lower(p.action)}?`;
    const response=id===860
      ?'Identificar quién hace qué permite atribuir ingresos, costes y responsabilidades sin confundir el importe de la compra con el ingreso de un intermediario.'
      :id===916
        ?'La exposición agregada no equivale a la pérdida retenida: una parte del daño puede quedar fuera de las pólizas y otra puede cederse mediante reaseguro.'
        :progress.investigationTakeaway;
    const options=rotate([
      question,
      `¿Por qué conviene ${lower(d.actionWrong)}?`,
      `¿Por qué conviene aceptar este criterio: ${lower(d.foundationWrong)}?`,
    ],Math.floor(id/4)%3);
    const answer=options.indexOf(question);
    const q=taggedChoice('Encuentra la pregunta que responde el análisis',`${p.scene}\n\nUna revisión del caso llega a la conclusión del recuadro. ¿Cuál de las preguntas queda respondida por esa conclusión?`,options,options[answer],explanation,Math.floor(id/4));
    return finish(activity(q,'reverse',{response,options:q.options.map(o=>o.text),answer:q.answer,instruction:'Elige la pregunta cuyo criterio queda explicado por la conclusión, sin añadir una premisa no demostrada.'}));
  }
  if(mode===1){
    const categories=['Resuelve la duda planteada','Deja una condición necesaria pendiente'];
    const entries=rotate([
      {label:p.action,options:categories,answer:0},
      {label:d.actionWrong,options:categories,answer:1},
    ],Math.floor(id/4)%2);
    return finish(rows('classify','Separa comprobación y aproximación',`${p.scene}\n\nClasifica las dos propuestas por lo que permiten averiguar en este caso, no por lo profesional que suenen.`,entries,explanation));
  }
  if(mode===2){
    const options=rotate([p.action,progress.investigationTakeaway,d.actionWrong,d.foundationWrong],id%4);
    const answers=options.map((v,i)=>[p.action,progress.investigationTakeaway].includes(v)?i:-1).filter(i=>i>=0);
    const q=multi('Relaciona comprobación y criterio de análisis',`${p.scene}\n\nSelecciona la comprobación pertinente y el criterio aprendido que debe guiar la interpretación. Hay dos respuestas.`,options,answers,explanation);
    return finish(activity(q,'all',{options,answers,instruction:'Marca dos afirmaciones: una comprobación que resuelve la duda y el criterio de análisis que respeta lo aprendido.'}));
  }
  const makeRow=(label,good,bad,n)=>{const options=rotate([good,bad],Math.floor(n/4)%2);return {label,options,answer:options.indexOf(good)};};
  return finish(rows('diagram','Conecta duda, comprobación e interpretación',`${p.scene}\n\nCompleta dos conexiones: de la duda del caso a una comprobación, y de esa comprobación al criterio que debe guiar la interpretación.`,[
    makeRow('La situación exige esta comprobación…',p.action,d.actionWrong,id),
    makeRow('Al interpretar lo comprobado, aplica este criterio…',progress.investigationTakeaway,d.foundationWrong,id+4),
  ],explanation));
}
function verification(id,p,c,d,progress,modeOverride){
  const offers=lateEvidenceOptions[id],reasons=lateEvidenceReasons[id];
  if(!offers||!reasons)throw Error('Missing qualitative verification '+id);
  const explanation=`Para esta duda necesitas ${lower(p.evidence)}. ${reasons.join(' ')} ${progress.verificationTakeaway}`;
  const mode=modeOverride??Math.floor(id/4)%4;
  if(mode===0){
    const q=taggedChoice('Pide datos que realmente resuelvan la duda',`${p.scene}\n\nEl objetivo es ${lower(p.action)}. Los tres informes pueden contener datos verdaderos. ¿Cuál permite realizar esa comprobación concreta?`,[p.evidence,...offers],p.evidence,explanation,id);
    return finish(q);
  }
  if(mode===1){
    const row=(label,good,bad,n)=>{const options=rotate([good,bad],n%2);return {label,options,answer:options.indexOf(good)};};
    const entries=[
      row(`La duda del caso es: ${p.scene} La revisión que conecta con esa duda es…`,p.action,d.actionWrong,id),
      row('Esa revisión necesita una fuente que muestre…',p.evidence,offers[0],id+1),
      row('Al interpretar lo comprobado, conserva este límite de la conclusión…',progress.verificationTakeaway,d.foundationWrong,id+2),
    ];
    return finish(rows('diagram','Conecta duda, prueba y conclusión',`${p.scene}\n\nCompleta el recorrido del análisis: la situación exige una comprobación, esa comprobación requiere datos, y el resultado conserva un alcance concreto.`,entries,explanation));
  }
  if(mode===2){
    const row=(label,wrongWord,good,badA,badB,n)=>{const options=rotate([good,badA,badB],Math.floor(n/4)%3);return {label,wrongWord,options,answer:options.indexOf(good)};};
    const entries=[
      row(`Conclusión del caso de práctica: «${d.caseWrong}»`,d.caseWrong,c.correct,d.caseWrong,d.foundationWrong,id),
      row(`Plan para esta duda: «${d.actionWrong}»`,d.actionWrong,p.action,d.actionWrong,`Concluir que ${lower(d.foundationWrong)}`,id+4),
      row(`Fuente elegida: «${offers[0]}»`,offers[0],p.evidence,...offers,id+8),
    ];
    return finish(rows('repair','Repara tres partes del informe',`Caso de práctica: ${c.scene}\n\nInvestigación del negocio: ${p.scene}\n\nEl informe mezcla la conclusión del caso de práctica, un plan para la investigación y una fuente de datos. Sustituye cada fragmento por el que respeta las condiciones aprendidas.`,entries,`${c.explanation} ${explanation}`));
  }
  const options=rotate([p.evidence,c.correct,d.actionWrong,d.caseWrong],id%4);
  const answers=options.map((v,i)=>[p.evidence,c.correct].includes(v)?i:-1).filter(i=>i>=0);
  const q=multi('Monta un informe con fundamento',`Caso de práctica: ${c.scene}\n\nInvestigación del negocio: ${p.scene}\n\nMarca las dos piezas que puedes conservar: la conclusión justificada del caso de práctica y los datos pertinentes para la investigación.`,options,answers,`${c.explanation} ${explanation}`);
  return finish(activity(q,'all',{options,answers,instruction:'Selecciona dos piezas justificadas; no conserves propuestas que cambien las condiciones del ejemplo o de la investigación.'}));
}

export function refineLateChallenges(result){
  for(const lesson of result.lessons.filter(l=>l.id>=700&&l.id<=949)){
    const id=lesson.id,r=records[id-450],p=investigations[id],d=lateChallengeData[id],progress=lateProgression[id];
    const c=id===788?{...cases[id],explanation:'El criterio era revisar el análisis si bajaba la retención, no vender automáticamente. Investigar por qué ha bajado permite actualizar la idea que tenías sobre la empresa.'}:cases[id];
    if(!r||!p||!c||!d||!progress)throw Error('Incomplete late challenges '+id);
    const numeric=lesson.steps[7].type==='numeric';
    const qs=[foundation(id,lesson,r,d),appliedCase(id,c,d),investigate(id,p,c,d,progress)];
    if(!numeric){
      let fourth=verification(id,p,c,d,progress);
      const kind=q=>q.activity?.kind||q.type;
      if(kind(fourth)===kind(qs[2])||new Set([...qs,fourth].map(kind)).size<3)fourth=verification(id,p,c,d,progress,2);
      qs.push(fourth);
    }
    // Comparison rows are a useful visual task when the original teaching
    // has no chart or table. They ask for three distinct scope judgements,
    // rather than adding an unrelated illustration to fill the space.
    const hasVisual=lesson.steps.some(s=>s.figure)||qs.some(q=>q.pairs||q.items||q.activity?.rows);
    if(!hasVisual){
      const options=rotate([r.meaning,r.limit,d.foundationWrong],Math.floor(id/3)%3);
      const explanation=qs[0].explanation;
      if(Math.floor(id/3)%2===0){
        qs[0]=finish(truth('Compara tres interpretaciones',qs[0].body,options.map(v=>[v,v!==d.foundationWrong]),explanation),qs[0].hint);
      }else{
        const categories=['Conclusión justificada','Cambia una condición necesaria'];
        qs[0]=finish(rows('classify','Clasifica el alcance de las interpretaciones',qs[0].body,options.map(label=>({label,options:categories,answer:label===d.foundationWrong?1:0})),explanation),qs[0].hint);
      }
    }
    // Only replace exercises. In particular, do not call usePairs: stories,
    // takeaways, explanation screens and every numeric field remain byte exact.
    qs.forEach((q,index)=>{lesson.steps[index*2+1]=q;});
  }
  for(const exam of result.exams.filter(e=>e.id>=70&&e.id<=94)){
    exam.steps=exam.steps.map((old,index)=>{
      if(old.type==='numeric')return old;
      const id=old.reviewLesson,p=investigations[id],r=records[id-450],d=lateChallengeData[id],progress=lateProgression[id];
      if(!p||!d)throw Error('Missing exam challenge '+id);
      const proposal=d.actionWrong.replace(/\.$/,'');
      const body=`${p.scene}\n\nEn un segundo informe se propone: «${proposal}». Quieres corregir el criterio de ese informe antes de aceptar su conclusión.`;
      const explanation=`La revisión pertinente es ${lower(p.action)}. ${progress.investigationTakeaway} La alternativa «${d.actionWrong}» conserva una condición pendiente. La interpretación «${d.foundationWrong}» cambia el alcance del concepto: ${r.meaning}`;
      let q;
      if((exam.id+index)%3===0){
        const options=rotate([p.action,progress.investigationTakeaway,d.actionWrong,d.foundationWrong],(exam.id+index)%4);
        const answers=options.map((v,i)=>[p.action,progress.investigationTakeaway].includes(v)?i:-1).filter(i=>i>=0);
        q=multi('Revisa el criterio de un informe',body+' Selecciona dos afirmaciones: la corrección pertinente y el criterio aprendido que debe guiar la interpretación.',options,answers,explanation);
      }else{
        const values=[p.action,d.actionWrong,`Basar la conclusión en este criterio: ${lower(d.foundationWrong)}`];
        q=taggedChoice('Revisa el criterio de un informe',body+' ¿Qué revisión resuelve de manera más directa la duda original?',values,p.action,explanation,exam.id+index);
      }
      q.reviewLesson=id;delete q.hint;if(q.activity){delete q.activity.hint;validateActivity(q.activity,'Late exam '+exam.id+' / '+id);}return q;
    });
  }
  return result;
}
