import {TRACKS,ALL_TRACKS} from './tracks.js';
import {FORMAT_LABELS,validateActivity} from './exercise-formats.js';

const make=(s,kind,extra)=>({kind,title:s.title,prompt:s.body,instruction:FORMAT_LABELS[kind]+'.',...extra});
function candidates(s,previous){
  const result=[];
  const put=(kind,extra)=>result.push(make(s,kind,extra));
  if(s.type==='order')put('sort',{items:s.items,answer:s.answer,instruction:'Coloca el primer paso arriba. Arrastra las tarjetas o utiliza las flechas.'});
  if(s.type==='match'){
    const options=s.pairs.map(p=>p.right),rows=s.pairs.map((p,i)=>({label:p.left,options,answer:i}));
    put('classify',{rows,prompt:s.body.replace(/Relaciona|Asocia/g,'Clasifica'),instruction:'Toca una tarjeta y después el grupo al que corresponde. Puedes cambiarla de grupo.'});
    put('table',{rows,columnLabels:['Situación o dato','Qué representa'],instruction:'Completa cada casilla de la segunda columna utilizando la información de la primera.'});
    put('diagram',{rows,instruction:'Completa las etiquetas de este mapa. Cada rama conecta una observación con su significado.'});
    put('audio',{narration:s.pairs[0].left,options,answer:0,title:'Escucha e identifica la idea',prompt:'Escucha la observación del caso y elige qué idea describe. Puedes leer exactamente el mismo texto si prefieres.',instruction:'Reproduce la explicación o abre su transcripción; después selecciona la relación correcta.',explanation:s.pairs[0].left+' → '+s.pairs[0].right+'. '+s.explanation,hideFigure:true});
  }
  if(s.type==='multi'){
    const options=s.options.map(o=>o.text);
    // True/false fits assertions. A list of proposed actions or questions must keep its original task.
    const actions=/^(Revisar|Comparar|Dar|Sustituir|Tratar|Ignorar|Restar|Registrar|No volver|Recalcular|Actualizar|Anotar|Consultar|Leer|Separar|Documentar|Comprobar|Buscar|Pedir|Contar|Estimar|Suponer|Calcular|Usar|Utilizar|Mantener|Exigir|Evitar|Asumir|Aceptar|Observar|Distinguir|Identificar|Describir|Investigar|Elegir|Reconstruir|Verificar|Atribuir|Aplicar|Tomar|Medir|Agrupar|Resolver|Sumar|Convertir|Explicar|Ordenar|Depender|Concluir|Reducir|Decidir|Construir|Cambiar|Añadir|Ajustar|Preguntar|Confundir|Afirmar|Omitir|Mezclar|¿|Cómo|Cuándo|Qué|Cuánto)\b/u;
    if(options.every(v=>!actions.test(v)))put('truth',{rows:options.map((label,i)=>({label:'Con la información del caso, se puede afirmar: «'+label+'»',options:['Verdadero','Falso'],answer:s.answers.includes(i)?0:1})),prompt:s.body.replace(/(?:Selecciona|Elige|Marca) (?:las|los|todas|todos|dos)[^.!?]*(?:[.!?]|$)/g,'').trim()||'Revisa las afirmaciones sobre la idea que acabas de estudiar.',instruction:'Responde a cada afirmación. Verdadero: los datos permiten afirmarla. Falso: los datos no justifican esa conclusión.'});
    put('all',{options,answers:s.answers,instruction:'Marca todas las tarjetas correctas. Puede haber más de una; toca de nuevo una tarjeta para quitarla.'});
    put('grid',{options,answers:s.answers,instruction:'Busca en la cuadrícula todas las tarjetas que cumplen la condición de la pregunta.'});
  }
  if(s.type==='numeric'){
    put('short',{answer:s.answer,tolerance:s.tolerance,unit:s.unit,instruction:'Escribe el resultado, con coma o punto decimal. Respeta la unidad indicada.'});
    if(s.answer>=0&&s.answer<=100&&Number.isInteger(s.answer*10)){
      const step=Number.isInteger(s.answer)?1:.1,max=Math.max(10,Math.ceil(s.answer/10)*10+10);
      put('slider',{min:0,max,step,initial:s.answer===0?max:0,answer:s.answer,tolerance:s.tolerance??step/2,unit:s.unit,instruction:'Calcula la respuesta con los datos del caso y mueve el control hasta ese valor.'});
    }
  }
  if(s.type==='choice'){
    put('clues',{options:s.options.map(o=>o.text),answer:s.answer,clues:[s.hint,previous.takeaway],instruction:'Elige la respuesta. Si la necesitas, revela una pista cada vez; usar pistas no consume vidas, pero cuenta como ayuda.'});
    const term=previous.terms?.find(t=>t.word.length<=48&&!/[()]/.test(t.word));
    if(term){
      put('short',{title:'Pon nombre a la idea',prompt:'Acabas de estudiar esta definición: «'+term.meaning+'». ¿Cómo se llama este concepto?',answer:term.word,instruction:'Escribe el nombre del concepto. No hace falta poner tildes.',explanation:term.word+': '+term.meaning,hint:'Vuelve a la explicación anterior y busca el nombre de esta idea.',hideFigure:true});
      put('reverse',{title:'¿A qué pregunta responde?',prompt:'Lee esta respuesta y elige la pregunta que resuelve.',response:term.meaning,options:['¿Qué significa '+term.word+'?','¿Qué rentabilidad garantiza una inversión?','¿Cuánto cuesta hoy comprar esta inversión?'],answer:0,instruction:'Relaciona la respuesta con la pregunta que realmente contesta.',explanation:'La respuesta explica el significado de «'+term.word+'». No ofrece un precio actual ni una rentabilidad garantizada.',hint:'Distingue definir una idea de dar un precio o prometer un resultado.',hideFigure:true});
    }
    const words=previous.takeaway.split(/\s+/);
    if(words.length>=14&&words.length<=36){
      const parts=[0,1,2].map(i=>words.slice(Math.round(i*words.length/3),Math.round((i+1)*words.length/3)).join(' '));
      put('build',{title:'Construye la idea clave',prompt:'Reconstruye la explicación que acabas de leer para mostrar cómo se relacionan sus ideas.',items:[parts[1],parts[2],parts[0]],answer:[2,0,1],instruction:'Toca los bloques en el orden de la explicación. Toca un bloque colocado para devolverlo al banco.',explanation:previous.takeaway,hint:'Empieza por el sujeto de la explicación; después añade la relación y su consecuencia.',hideFigure:true});
    }
  }
  return result;
}
export function applyExerciseVariety(lessons,authored){
  const known=new Map(lessons.map(l=>[l.id,l]));
  const placements=[];
  for(const track of ALL_TRACKS){
    if(track.id==='technical')continue; // Its activities are authored alongside their teaching screens.
    const counts={},worldCounts={};
    for(const id of track.lessonIds){
      const lesson=known.get(id),world=Math.floor(id/10);worldCounts[world]||={};
      if(lesson.editorialRevision)continue;
      if(authored.filter(p=>p.lessonId===id).length>=2)continue;
      const choices=lesson.steps.flatMap((s,i)=>s.type==='learn'?[]:candidates(s,lesson.steps[i-1]).map(a=>({step:i,a})));
      // Infrequent forms get a small allowance, leaving space for reasoning and calculations.
      const score=x=>(worldCounts[world][x.a.kind]||0)*30+(counts[x.a.kind]||0)*(['build','reverse','short','audio'].includes(x.a.kind)?2:1);
      choices.sort((a,b)=>score(a)-score(b)||((a.step+id)%8)-((b.step+id)%8));
      const chosen=choices[0];if(!chosen)throw Error('No suitable format for lesson '+id);
      const a=structuredClone(chosen.a);
      // Stable shuffling keeps the correct column/answer from always occupying the same position.
      if(a.options&&['audio','reverse','clues','all','grid'].includes(a.kind)){
        const shift=(id+chosen.step)%a.options.length;
        a.options=a.options.map((_,i)=>chosen.a.options[(i+shift)%a.options.length]);
        const remap=v=>(v-shift+a.options.length)%a.options.length;
        if(a.answers)a.answers=a.answers.map(remap);else a.answer=remap(a.answer);
      }
      if(['table','diagram','classify'].includes(a.kind)){
        const shift=(id+chosen.step)%a.rows[0].options.length;
        a.rows=a.rows.map(r=>({...r,options:r.options.map((_,i)=>r.options[(i+shift)%r.options.length]),answer:(r.answer-shift+r.options.length)%r.options.length}));
      }
      lesson.steps[chosen.step].activity=a;
      counts[chosen.a.kind]=(counts[chosen.a.kind]||0)+1;worldCounts[world][chosen.a.kind]=(worldCounts[world][chosen.a.kind]||0)+1;
    }
  }
  for(const {lessonId,step,activity} of authored){
    const lesson=known.get(lessonId);if(!lesson||![1,3,5,7].includes(step))throw Error('Invalid authored placement');
    if(!lesson.editorialRevision)lesson.steps[step].activity=activity;
  }
  for(const l of lessons)for(const [step,s] of l.steps.entries())if(s.activity){validateActivity(s.activity,`Lesson ${l.id} step ${step}`);placements.push({lessonId:l.id,step,kind:s.activity.kind});}
  for(const kind of Object.keys(FORMAT_LABELS))if(!placements.some(p=>p.kind===kind))throw Error('Missing format '+kind);
  // Editorial activities are chosen for their teaching goal, not a quota of UI widgets.
  for(const t of TRACKS.filter(t=>!['technical','stocks'].includes(t.id)&&!t.lessonIds.every(id=>known.get(id)?.editorialRevision)))for(const kind of Object.keys(FORMAT_LABELS))if(!placements.some(p=>t.lessonIds.includes(p.lessonId)&&p.kind===kind))throw Error('Missing '+kind+' in '+t.id);
  return placements;
}
