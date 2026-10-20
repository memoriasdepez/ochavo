export const learn=(title,body,takeaway,figure)=>({type:'learn',title,body,takeaway,...figure?{figure}:{}});
export const choice=(title,body,options,answer,explanation)=>({type:'choice',title,body,options:options.map(text=>({text})),answer,explanation});
export const multi=(title,body,options,answers,explanation)=>({type:'multi',title,body,options:options.map(text=>({text})),answers,explanation});
export const match=(title,body,pairs,explanation)=>({type:'match',title,body,pairs:pairs.map(([left,right])=>({left,right})),explanation});
export const order=(title,body,items,answer,explanation)=>({type:'order',title,body,items,answer,explanation});
export const numeric=(title,body,answer,unit,explanation)=>({type:'numeric',title,body,answer,unit,tolerance:.02,calculator:true,explanation});
export const table=(headers,rows,caption='Situación inventada para aprender; no son precios ni condiciones actuales.')=>({kind:'table',headers,rows,caption});
export const activity=(step,kind,details)=>({...step,activity:{kind,title:step.title,prompt:step.body,explanation:step.explanation,...details}});
export const rows=(kind,title,body,entries,explanation)=>activity(choice(title,body,entries[0].options,entries[0].answer,explanation),kind,{rows:entries,instruction:kind==='truth'?'Responde verdadero o falso a cada afirmación.':'Clasifica cada situación con el criterio indicado.'});
export const truth=(title,body,entries,explanation)=>rows('truth',title,body,entries.map(([label,yes])=>({label,options:['Verdadero','Falso'],answer:yes?0:1})),explanation);
export const pair=(title,body,takeaway,exercise,figure)=>[learn(title,body,takeaway,figure),{...exercise,hint:exercise.type==='numeric'?'Puedes abrir la calculadora. Usa las cifras del ejercicio, que son distintas de las del ejemplo.':'Busca qué dato de la situación justifica tu respuesta.'}];
export function rotate(step,seed){
 if(step.options){const n=step.options.length,shift=((seed%n)+n)%n;step.options=step.options.slice(shift).concat(step.options.slice(0,shift));if(step.type==='multi')step.answers=step.answers.map(a=>(a-shift+n)%n).sort((a,b)=>a-b);else step.answer=(step.answer-shift+n)%n;}
 if(step.activity?.options){const a=step.activity,n=a.options.length,shift=((seed%n)+n)%n;a.options=a.options.slice(shift).concat(a.options.slice(0,shift));if(a.answers)a.answers=a.answers.map(v=>(v-shift+n)%n).sort((x,y)=>x-y);else a.answer=(a.answer-shift+n)%n;}
 if(step.activity?.rows&&seed%2)step.activity.rows.reverse();
 return step;
}
export function usePairs(lesson,pairs,revision){
 if(pairs.length!==4)throw Error('A lesson needs four authored teaching/practice pairs');
 lesson.steps=pairs.flat();lesson.summary=lesson.steps[0].body;lesson.takeaway=lesson.steps[6].takeaway;lesson.editorialRevision=revision;lesson.story={scene:lesson.title,text:lesson.steps[0].takeaway};
 for(const [i,s] of lesson.steps.entries()){if(s.type==='learn')continue;rotate(s,lesson.id*5+i*3);}
}
