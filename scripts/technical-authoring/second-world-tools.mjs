export const learn=(title,body,takeaway,figure)=>({type:'learn',title,body,takeaway,...(figure?{figure}:{})});
export const choice=(title,body,options,answer,explanation,figure)=>({type:'choice',title,body,options:options.map(text=>({text})),answer,explanation,hint:'Aplica la explicación al caso y comprueba los datos antes de decidir.',...(figure?{figure}:{})});
export const multi=(title,body,options,answers,explanation,figure)=>({type:'multi',title,body,options:options.map(text=>({text})),answers,explanation,hint:'Revisa cada opción por separado y selecciona todas las que encajan con el caso.',...(figure?{figure}:{})});
export const numeric=(title,body,answer,unit,explanation,figure,tolerance=.01)=>({type:'numeric',title,body,answer,unit,tolerance,explanation,hint:'Puedes consultar los datos del gráfico y abrir la calculadora para hacer las cuentas.',...(figure?{figure}:{})});
export function activity(a,figure){
 let base;
 if(a.rows)base=choice(a.title,a.prompt,a.rows[0].options,a.rows[0].answer,a.explanation,figure);
 else if(['sort','build'].includes(a.kind))base={type:'order',title:a.title,body:a.prompt,items:a.items,answer:a.answer,explanation:a.explanation,...(figure?{figure}:{})};
 else if(['all','differences','grid'].includes(a.kind))base=multi(a.title,a.prompt,a.options,a.answers,a.explanation,figure);
 else if(a.kind==='interval')base=choice(a.title,a.prompt,a.options,a.answer[0],a.explanation,figure);
 else if(a.kind==='slider')base=numeric(a.title,a.prompt,a.answer,a.unit,a.explanation,figure,a.tolerance);
 else base=choice(a.title,a.prompt,a.options,a.answer,a.explanation,figure);
 return {...base,hint:a.instruction,activity:a};
}
export const rows=(kind,title,prompt,instruction,entries,explanation,figure)=>activity({kind,title,prompt,instruction,rows:entries,explanation},figure);
export function setLesson(lesson,pairs,summary,takeaway,story){
 lesson.steps=pairs.flat();lesson.summary=summary;lesson.takeaway=takeaway;lesson.story.text=story;lesson.editorialRevision='second-world-variety-v1';
}
export function candleFigure(candles,caption,opts={}){
 const cs=candles.map(c=>({v:100,...c}));
 return {kind:'candles',candles:cs,labels:cs.map((_,i)=>String(i+1)),values:cs.map(c=>c.c),unit:'€',caption,timeframe:'Cada vela resume una sesión de negociación',periodLabel:'Sesión',axisLabels:true,index:cs.length-1,...opts};
}
