import {worlds} from './outline-300.mjs';
import {laterWorldPacketA} from './later-worlds-a.mjs';
import {interpretationCases} from './interpretation-cases.mjs';
import {learn,choice,rows,activity} from './second-world-tools.mjs';

export const TECHNICAL_REASONING_REVISION='technical-reasoning-2026-10-10';
// Zero-based topic numbers whose objective really is to measure a quantity.
// A fresh chart application remains in every point; the extra numeric drill is optional.
const calculateTopics={4:[4,5],5:[2],6:[3],7:[2,3,4],8:[1,3],9:[6,7],10:[3],11:[7],12:[7],13:[2,7],14:[1,4,7],15:[1,2]};
const kind=s=>s.activity?.kind||s.type;
function contextualCase(raw,title,format,seed){
 const [scene,right,wrong]=raw.split('|');
 if(!scene||!right||!wrong||right===wrong)throw Error('Incomplete technical interpretation: '+title);
 const options=seed%2?[wrong,right]:[right,wrong],answer=options.indexOf(right);
 const body=scene+'\n\n¿Qué conclusión respeta la situación y la regla explicada?';
 if(format==='truth')return rows('truth',title,scene+'\n\nComprueba estas dos conclusiones.','Evalúa la afirmación completa.',options.map(v=>({label:v,options:['Justificada','No justificada'],answer:v===right?0:1})),right);
 if(format==='repair')return rows('repair',title,scene+'\n\nEl informe añade una conclusión equivocada. Corrígela.','Sustituye la frase que no respeta los datos.',[{label:wrong,wrongWord:wrong,options,answer}],right);
 if(format==='classify')return rows('classify',title,scene+'\n\nSepara conclusiones justificadas y no justificadas.','Clasifica cada afirmación completa.',options.map(v=>({label:v,options:['Justificada','No justificada'],answer:v===right?0:1})),right);
 if(format==='clues')return activity({kind:'clues',title,prompt:body,instruction:'Decide qué permite afirmar el caso; puedes abrir una pista.',options,answer,clues:['Comprueba si la conclusión respeta todas las condiciones nombradas en la situación.','Una condición pendiente no puede darse por cumplida; un dato observado no garantiza el siguiente.'],explanation:right});
 return choice(title,body,options,answer,right);
}
function purposePair(w,j){
 const p=laterWorldPacketA(w,j,1),f=p.fields;
 const entries=f.map(q=>({left:q.label,right:q.reason}));
 // Distinct reasons are required for a meaningful matching task.
 const unique=entries.filter((q,i,a)=>a.findIndex(x=>x.right===q.right)===i);
 const title='Elige cómo comprobarlo';
 const teaching=learn('Para qué sirve cada comprobación',`${w.topics[j].concept}\n\n${p.method}\n\nAntes de calcular, identifica qué pregunta responde cada comprobación. Una comparación de cierres, una comparación de extremos y una regla de confirmación pueden describir aspectos diferentes. En el ejercicio se pide relacionar las preguntas con el procedimiento que corresponde, sin resolver las cuentas.`,p.limit,p.figure);
 const explanation=unique.map(q=>q.left+': '+q.right).join('\n\n');
 let exercise;
 if(j%2===0&&unique.length>=2){exercise={type:'match',title,body:'Relaciona cada comprobación del gráfico con el procedimiento que le corresponde. No se pide calcular sus resultados.',pairs:unique,explanation,figure:p.figure,hint:p.method};}
 else {
  const opts=unique.map(q=>q.right),shift=j%opts.length,rotated=opts.slice(shift).concat(opts.slice(0,shift));
  exercise=rows('diagram',title,'Completa el plan de lectura del gráfico: elige el procedimiento de cada comprobación.','Relaciona la pregunta con el tipo de dato que utiliza.',unique.map(q=>({label:q.left,options:rotated,answer:rotated.indexOf(q.right)})),explanation,p.figure);
 }
 if(unique.length<2)throw Error(`Technical methods need two distinct purposes: ${w.number}/${j}`);
 return [teaching,exercise];
}
export function refineTechnicalReasoning(lessons,exams){
 let previousSequence='';
 for(const w of worlds.filter(w=>w.number>=4&&w.number<=15)){
  if(interpretationCases[w.number]?.length!==10)throw Error('Missing technical transfer world '+w.number);
  for(let j=0;j<10;j++){
   const l=lessons[(w.number-1)*10+j],t=w.topics[j];
   if(!calculateTopics[w.number].includes(j))l.steps.splice(2,2,...purposePair(w,j));
   const packet=laterWorldPacketA(w,j,0);
   l.steps[6]=learn('Qué significa y qué no demuestra',`${t.concept}\n\n${packet.limit}\n\nLa próxima situación exige interpretar la regla en otro contexto. Comprueba qué requisitos se cumplen y cuál falta antes de dar una conclusión por confirmada. El objetivo es explicar el alcance de la observación, no repetir su cuenta.`,packet.limit);
   const existing=new Set([l.steps[1],l.steps[3],l.steps[5]].map(kind));
   const preferred=['choice','truth','repair','clues','classify'][j%5];
   const format=existing.size<3&&existing.has(preferred)?['repair','truth','clues','classify'].find(k=>!existing.has(k)):preferred;
   l.steps[7]=contextualCase(interpretationCases[w.number][j],'Aplica el criterio: '+t.title,format,l.id);
   // Keep the opening explanation first. The two final independent applications
   // may swap, so adjacent lessons don't force the same interaction sequence.
   let seq=l.steps.filter(s=>s.type!=='learn').map(kind).join(',');
   if(seq===previousSequence){const tail=l.steps.splice(4,4);l.steps.push(...tail.slice(2),...tail.slice(0,2));seq=l.steps.filter(s=>s.type!=='learn').map(kind).join(',');}
   previousSequence=seq;l.editorialRevision=TECHNICAL_REASONING_REVISION;
   l.story.text=`Aprende a ${t.title.toLocaleLowerCase('es')}, comprueba qué datos necesitas y aplica el criterio a un gráfico y a una situación distinta.`;
   l.takeaway=packet.limit;
  }
  exams[w.number-1].editorialRevision=TECHNICAL_REASONING_REVISION;
 }
 return {lessons,exams};
}

