import {calculate} from '../course-authoring.mjs';
import {pair,choice,multi,numeric,rows,truth,activity,usePairs,REVISION} from './helpers.mjs';
import {cases as middle} from './cases-21-40.mjs';
import {cases as advanced} from './cases-41-50.mjs';
import {investigations} from './late-investigations.mjs';
import {lateTeaching} from './late-teaching.mjs';
import {lateProgression} from './late-progression.mjs';
import {lateEvidenceOptions,lateEvidenceReasons} from './late-evidence-options.mjs';

const cases={...middle,...advanced};
// A number is retained when it measures the economic issue itself. Governance,
// research and decisions do not acquire a numeric question just to fill a slot.
export const lateNumericIds=new Set([
  700,706,709,711,712,714,716,717,718,721,725,726,727,728,
  740,741,743,746,749,750,751,752,754,759,761,763,765,768,
  791,793,798,803,806,809,813,815,817,819,821,824,828,
  835,837,842,844,845,847,848,851,852,855,856,863,864,865,
  873,874,875,881,883,884,889,891,895,897,902,905,906,908,
  911,913,914,915,924,926,928,929,932,934,937,938,943,944,948,
]);

const f=n=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:4}).format(n);
const prompt=(r,args)=>r.prompt.replace(/\{([a-d])\}/g,(_,letter)=>f(args[letter.charCodeAt(0)-97]));
const rotate=(values,offset)=>values.map((_,i)=>values[(i+offset)%values.length]);
const teachingFor=id=>lateProgression[id].caseTeaching||cases[id].teaching;

function foundation(lesson,r){
  const options=rotate([r.meaning,r.mistake,r.limit],lesson.id%3),answer=options.indexOf(r.mistake);
  let exercise;
  if(lesson.id%3===0){
    const base=choice('Localiza la conclusión que no se sostiene','Señala la conclusión incorrecta sobre «'+lesson.title.toLocaleLowerCase('es')+'».',options,answer,`${r.meaning} ${r.limit}`);
    exercise=activity(base,'intruder',{options,answer,instruction:'Selecciona la conclusión incorrecta.'});
  }else if(lesson.id%3===1){
    exercise=multi('Conserva las conclusiones justificadas','Selecciona las dos afirmaciones compatibles con lo explicado.',options,options.map((_,i)=>i).filter(i=>i!==answer),`${r.meaning} ${r.limit}`);
  }else{
    exercise=truth('Pon a prueba la interpretación','Valora cada afirmación a partir de lo que acabas de aprender.',options.map((text,i)=>[text,i!==answer]),`${r.meaning} ${r.limit}`);
  }
  const result=pair(lesson.title,`${r.concept}\n\n${r.example}\n\n${r.limit}`,r.meaning,exercise);
  // The takeaway is a conclusion appearing among the options. A hint should
  // direct the learner's reasoning rather than identify that option verbatim.
  exercise.hint='Contrasta cada afirmación con los hechos del ejemplo y con el alcance de la definición. Una conclusión no puede añadir una condición que no se ha demostrado.';
  if(exercise.activity)exercise.activity.hint=exercise.hint;
  return result;
}

function originalCase(id,r){
  const c=cases[id],progress=lateProgression[id],options=rotate([c.correct,c.incorrect],id%2),answer=options.indexOf(c.correct);
  let q=choice('Aplica la idea a este caso',c.scene+'\n\n'+c.question,options,answer,c.explanation);
  if(id%4===1)q=activity(q,'clues',{options,answer,clues:[progress.caseTakeaway,c.question],instruction:'Resuelve la situación. Puedes abrir las pistas si las necesitas.'});
  if(id%4===2)q=truth('Contrasta las dos respuestas',q.body,options.map((option,i)=>['Propuesta: «'+option+'»',i===answer]),c.explanation);
  if(id%4===3)q=activity({...q,body:c.question},'audio',{prompt:c.question,narration:c.scene,options,answer,instruction:'Escucha el caso o abre su transcripción y elige la respuesta.'});
  return pair('Del concepto a la empresa',teachingFor(id),progress.caseTakeaway,q);
}

function investigation(id,r){
  const p=investigations[id],progress=lateProgression[id];
  const entries=rotate([
    {label:p.action,options:['Comprobación fundamentada','Atajo que no resuelve el problema'],answer:0},
    {label:p.shortcut,options:['Comprobación fundamentada','Atajo que no resuelve el problema'],answer:1},
  ],id%2);
  const q=rows('classify','Elige cómo investigar',`${p.scene}\n\nClasifica las dos propuestas según permitan comprobar el problema o lo den por resuelto sin suficiente fundamento.`,entries,`${p.action}. ${progress.investigationTakeaway}`);
  return pair('Por qué importa en la práctica',progress.investigationTeaching||lateTeaching[id],progress.investigationTakeaway,q);
}

function evidence(id,r){
  const p=investigations[id],progress=lateProgression[id];
  // Neighboring objectives may require equally useful documents. Each wrong
  // data package now leaves a specific part of this objective untested.
  const options=rotate([p.evidence,...lateEvidenceOptions[id]],id%3),answer=options.indexOf(p.evidence);
  let q=choice('Pide la información que falta',`${p.scene}\n\nQuieres ${p.action.charAt(0).toLocaleLowerCase('es')+p.action.slice(1)}. ¿Qué información responde de forma más directa a esa comprobación?`,options,answer,`La información pertinente es: ${p.evidence.toLocaleLowerCase('es')}. ${lateEvidenceReasons[id].join(' ')}`);
  if(id%2===0)q=activity(q,'clues',{options,answer,clues:[progress.verificationTakeaway,`La duda del caso es: ${p.scene}`],instruction:'Identifica qué información permite contrastar la duda concreta. Puedes consultar las pistas.'});
  return pair('Qué dato permitiría comprobarlo',progress.verificationTeaching,progress.verificationTakeaway,q);
}

// Independent assessment context for every world. The exam asks for a revision
// of a proposed analysis, rather than replaying the lesson's binary case.
const assessmentContexts=[
  'Talleres Faro valora cobros futuros de una nueva línea de producción. El equipo mezcla referencias de distintas fechas y prepara un informe para quienes la financian.',
  'La valoración de Muebles Duna depende en gran parte de su actividad después del presupuesto detallado. Se quiere comprobar si esa etapa madura tiene una explicación económica defendible.',
  'Cafés Vela prepara varios planes de expansión. El comité recibe una valoración y quiere saber qué hipótesis podrían cambiar la decisión, antes de comprometer recursos.',
  'En las cuentas de Repuestos Sierra mejora el beneficio y empeora la caja. Hay cambios de criterios y operaciones puntuales. La revisión busca explicaciones comprobables, sin anticipar un veredicto.',
  'Grupo Nexo tiene filiales extranjeras, compromisos con antiguos empleados y diferencias entre cuentas e impuestos. El informe debe separar los efectos económicos y sus fechas.',
  'Envases Olmo debe financiar la próxima campaña y atender obligaciones existentes. La dirección pide evaluar qué ocurriría si los cobros llegaran más tarde de lo previsto.',
  'Luminaria estudia comprar un competidor y después separar una actividad. Los accionistas quieren entender qué recibirían, qué entregarían y qué costes continuarían.',
  'En Cristal Norte existe un propietario con influencia decisiva y varios acuerdos entre partes vinculadas. Se prepara una revisión del trato a todos los accionistas.',
  'Un equipo propone invertir en Servicios Alba porque cree que conservará clientes y mejorará margen. Otra persona debe cuestionar la tesis antes de aceptar sus conclusiones.',
  'Una cartera debe financiar objetivos con plazos diferentes. Su responsable documenta decisiones, revisa riesgos y quiere distinguir la calidad del proceso del resultado que llegue después.',
  'Motores Vega recibe pedidos para varios sectores y estudia ampliar producción. El informe debe conectar actividad, recursos, calidad y dinero disponible para propietarios.',
  'La cadena Hilo combina tiendas maduras, aperturas y venta digital. Está creciendo, pero el consejo quiere saber qué parte de la expansión podría sostener su rentabilidad.',
  'Alimentos Pradera aumenta ingresos con cambios de precios, productos y distribución. El análisis investiga qué parte del crecimiento puede mantenerse y qué recursos requiere.',
  'Atelier Luna prepara nuevas tiendas y líneas de producto. Quienes analizan la empresa necesitan entender cómo la expansión afecta demanda, marca, margen y capital.',
  'Nube Clara vende software con varios contratos y está captando clientes rápidamente. El informe debe estudiar la permanencia de ingresos y el coste económico de sostenerlos.',
  'La plataforma Plaza une compradores y comercios y prueba nuevos mercados. Su presentación destaca actividad total; el análisis debe reconstruir qué valor retiene realmente.',
  'Pagos Brisa presta servicios a bancos y comercios. Cambian la mezcla de operaciones y algunas reglas del mercado, y el equipo revisa de dónde procede su resultado.',
  'Circuitos Ría participa en una cadena internacional de fabricación y diseño. El informe estudia cómo demanda, tecnología y dependencias afectan su capacidad de producir y cobrar.',
  'Minerales Roble prepara su presupuesto durante una fase favorable de precios. Los analistas revisan qué beneficios, obligaciones y necesidades podrían permanecer al cambiar el ciclo.',
  'Redes Horizonte opera activos bajo diferentes contratos. El grupo quiere valorar sus cobros sin perder de vista inversión, financiación y derechos al final de cada acuerdo.',
  'Banco Delta presenta un plan de crecimiento. La revisión debe considerar beneficios y también la capacidad de afrontar pérdidas y cambios en la financiación.',
  'Seguros Linde aumenta pólizas y revisa sus estimaciones. El análisis debe conectar primas, siniestros, inversiones y recursos necesarios para cumplir las promesas a asegurados.',
  'Inmuebles Prado posee activos alquilados y proyectos de venta. El comité quiere valorar qué efectivo y qué derechos corresponden finalmente al accionista.',
  'BioVía combina tratamientos que vende con proyectos todavía en investigación. La valoración debe distinguir qué hechos se han conseguido y qué resultados siguen condicionados.',
  'Un comité compara empresas de modelos distintos. Quiere identificar oportunidades y preguntas pendientes usando métricas, supuestos y métodos coherentes con cada negocio.',
];

function numericExam(r,id){
  // Preserve rates/years and ordering; scale the monetary base to make a fresh
  // case without turning an outstanding balance into an impossible negative.
  const a=r.args.map(value=>value);
  if(['sum','sub','net','average','gain'].includes(r.op))a.forEach((value,i)=>{a[i]=value*2;});
  else if(['pct','discount','margin'].includes(r.op)){a[0]*=2;a[1]*=2;}
  else a[0]*=2;
  const answer=calculate(r.op,a);
  const question=numeric('Interpreta y calcula en otro caso',prompt(r,a),answer,r.unit,`Con estos datos, el resultado es ${f(answer)} ${r.unit}. ${r.meaning} ${r.limit}`);
  question.calculation={operation:r.op,operands:a};
  question.reviewLesson=id;
  return question;
}

export function refineLateWorlds(result,records){
  for(const lesson of result.lessons.filter(l=>l.id>=700&&l.id<=949)){
    const id=lesson.id,r=records[id-450];
    const progress=lateProgression[id];
    if(!r||!investigations[id]||!lateTeaching[id]||!cases[id]||!progress)throw Error('Incomplete late-world authorship '+id);
    let fourth;
    if(lateNumericIds.has(id)){
      const index=lesson.steps.findIndex(step=>step.type==='numeric');
      if(index<1||lesson.steps[index-1].type!=='learn')throw Error('Missing substantive numerical pair '+id);
      fourth=structuredClone(lesson.steps.slice(index-1,index+1));
      fourth[0].title='Una medida que ayuda a interpretar el caso';
      fourth[1].title='Calcula la medida del negocio';
      // Keep the worked method, but give the measurement its own interpretation
      // instead of attaching the foundation's conclusion to every screen.
      const previousBody=fourth[0].body;
      const reference=previousBody.includes('Ejemplo resuelto:')
        ?previousBody.split('Ejemplo resuelto:')[1]
        :lesson.steps.find(s=>s.type==='learn'&&s.body.includes('Referencia resuelta:'))?.body.split('Referencia resuelta:')[1];
      if(!reference)throw Error('Worked example missing for retained calculation '+id);
      const worked=reference.split(r.meaning)[0].trim();
      const method=previousBody.split(/Ejemplo resuelto:|Ya has usado esta cuenta al comparar situaciones\./)[0].trim();
      fourth[0].body=`${method}\n\nEjemplo resuelto: ${worked}\n\n${progress.verificationTeaching}`;
      fourth[0].takeaway=progress.verificationTakeaway;
      fourth[1].hint='Identifica las cantidades y su unidad en este caso. Aplica el procedimiento del ejemplo con los datos nuevos, conservando la base que pide la pregunta. Si el resultado tiene decimales, redondea a dos.';
      fourth[1].explanation=`${fourth[1].explanation.replace(r.meaning,'').trim()} ${progress.verificationTakeaway}`;
    }else fourth=evidence(id,r);
    const pairs=[foundation(lesson,r),originalCase(id,r),investigation(id,r),fourth];
    // The concept always comes first; applied reasoning, its consequence and
    // verification then add skills in that order. Exercise formats still vary.
    usePairs(lesson,pairs);
    lesson.editorialBalance={revision:REVISION,numericPractice:lateNumericIds.has(id),authoredInvestigation:true};
  }
  for(const exam of result.exams.filter(e=>e.id>=70&&e.id<=94)){
    const worldStart=exam.id*10;
    exam.steps=Array.from({length:10},(_,index)=>{
      const id=worldStart+index,r=records[id-450],p=investigations[id];
      let question;
      if(lateNumericIds.has(id)&&index%2===0)question=numericExam(r,id);
      else{
        const options=rotate([p.action,
          investigations[worldStart+(index+3)%10].action,
          investigations[worldStart+(index+7)%10].action],(exam.id+index)%3);
        const answer=options.indexOf(p.action);
        question=choice('Revisa el análisis',`${assessmentContexts[exam.id-70]}\n\nUna propuesta del informe consiste en ${p.shortcut.charAt(0).toLocaleLowerCase('es')+p.shortcut.slice(1)}. ¿Qué revisión responde de forma más directa al problema de esa propuesta?`,options,answer,`${p.action}. ${lateTeaching[id]}`);
        question.reviewLesson=id;
      }
      delete question.hint;
      return question;
    });
    exam.editorialRevision=REVISION;
  }
  return result;
}
