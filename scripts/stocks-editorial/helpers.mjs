export const REVISION='stocks-progressive-2026-10-10';
export const learn=(title,body,takeaway,figure)=>({type:'learn',title,body,takeaway,...(figure?{figure}:{})});
export const table=(headers,rows,caption='Ejemplo inventado para aprender; importes simplificados.')=>({kind:'table',headers,rows,caption});
export const choice=(title,body,options,answer,explanation)=>({type:'choice',title,body,options:options.map(text=>({text})),answer,explanation,hint:'Aplica la idea de la pantalla anterior a los datos de esta situación.'});
export const multi=(title,body,options,answers,explanation)=>({...choice(title,body,options,0,explanation),type:'multi',answers});
export const numeric=(title,body,answer,unit,explanation)=>({type:'numeric',title,body,answer,unit,tolerance:.02,explanation,hint:'Identifica las cantidades de esta pregunta. Puedes abrir la calculadora; no hace falta hacer la cuenta de memoria.'});
export const match=(title,body,pairs,explanation)=>({type:'match',title,body,pairs:pairs.map(([left,right])=>({left,right})),explanation,hint:'Cada situación corresponde a una descripción distinta.'});
export const order=(title,body,items,answer,explanation)=>({type:'order',title,body,items,answer,explanation,hint:'Busca qué paso necesita que el anterior ya haya ocurrido.'});
export function activity(base,kind,extra){return {...base,activity:{kind,title:base.title,prompt:base.body,explanation:base.explanation,hint:base.hint,...extra}};}
export const rows=(kind,title,body,entries,explanation)=>activity(choice(title,body,entries[0].options,entries[0].answer,explanation),kind,{rows:entries,instruction:kind==='truth'?'Indica si cada afirmación es verdadera o falsa.':kind==='classify'?'Toca una tarjeta y después el grupo al que pertenece.':'Completa cada casilla con la opción que encaja.'});
export const truth=(title,body,entries,explanation)=>rows('truth',title,body,entries.map(([label,yes])=>({label,options:['Verdadero','Falso'],answer:yes?0:1})),explanation);
export const pair=(title,body,takeaway,exercise,figure)=>{
 if(exercise.type!=='numeric'){
  exercise.hint='Recuerda: '+takeaway;
  if(exercise.activity)exercise.activity.hint=exercise.hint;
 }
 return [learn(title,body,takeaway,figure),exercise];
};
export function usePairs(lesson,pairs){lesson.steps=pairs.flat();lesson.summary=lesson.steps[0].body;lesson.takeaway=lesson.steps[6].takeaway;lesson.story={scene:lesson.title,text:lesson.steps[0].takeaway};lesson.editorialRevision=REVISION;}
