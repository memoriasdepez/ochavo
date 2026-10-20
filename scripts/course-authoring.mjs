export function calculate(op,v){
 const [a,b,c]=v;
 const operations={sum:()=>v.reduce((n,x)=>n+x,0),sub:()=>a-b,mul:()=>a*b,div:()=>a/b,pct:()=>a/b*100,change:()=>(b/a-1)*100,real:()=>(a/b-1)*100,remain:()=>a*(1-b/100),recover:()=>a/(100-a)*100,compound:()=>a*(1+b/100)**c,cagr:()=>((b/a)**(1/c)-1)*100,net:()=>a-b-c,gain:()=>a+b-c,linked:()=>((1+a/100)*(1+b/100)-1)*100,afterWithdrawal:()=>(a-b)*(1+c/100),margin:()=>(a-b)/a*100,breakeven:()=>a/(b-c),pv:()=>a/(1+b/100)**c,terminal:()=>a/(b/100-c/100),average:()=>(a+b)/2,tax:()=>a*b/100,discount:()=>(a-b)/a*100,capitalise:()=>a/(b/100)};
 if(!operations[op])throw Error('Unknown calculation '+op);
 const result=operations[op]();if(!Number.isFinite(result))throw Error('Invalid calculation');
 return Math.round((result+Number.EPSILON)*100)/100;
}
const money=v=>new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(v);
const procedures={sum:'Suma los importes que pertenecen al mismo total.',sub:'Resta la segunda cantidad de la primera; expresa la diferencia en su unidad original.',mul:'Multiplica la cantidad por el importe o factor indicado.',div:'Divide la cantidad total entre la base indicada; conserva la unidad del resultado.',pct:'Divide la parte entre el total y multiplica por 100 para expresar el porcentaje.',change:'Divide la cifra final entre la inicial, resta 1 y multiplica por 100. Una bajada da un resultado negativo.',real:'Divide el factor de crecimiento del dinero entre el factor de los precios, resta 1 y multiplica por 100.',remain:'Convierte el porcentaje en decimal dividiéndolo entre 100 y multiplica el importe inicial por uno menos ese decimal.',recover:'Divide el porcentaje perdido entre 100 menos ese porcentaje y multiplica por 100. La base es lo que queda tras la caída.',compound:'Convierte la tasa anual en decimal. Multiplica el capital por uno más esa tasa, una vez por cada año.',cagr:'Divide capital final entre inicial; toma la raíz correspondiente al número de años, resta 1 y multiplica por 100. Puedes usar una calculadora.',net:'Empieza por el primer importe y resta las dos partidas indicadas, sin contar ningún coste dos veces.',breakeven:'Resta coste variable por unidad del precio. Divide los costes fijos entre esa contribución; puede dar un umbral teórico fraccionario.',pv:'Divide el flujo futuro entre el factor uno más la tasa anual en decimal, elevado al número de años.',terminal:'Convierte ambas tasas en decimales. Divide el flujo del primer año estable entre tasa de descuento menos crecimiento.',average:'Con dos cantidades y pesos iguales, suma ambas y divide entre dos.',tax:'Multiplica el importe por el porcentaje dividido entre 100.',discount:'Resta el precio del valor estimado; divide la diferencia entre el valor estimado y multiplica por 100.',capitalise:'Divide el ingreso operativo neto sostenible entre la tasa de capitalización expresada como decimal.'};
const termFor=concept=>{
 const definitions=[
  [/^Un fondo de inversión /,'Fondo de inversión'],[/^Una participación /,'Participación'],[/^Un ETF es/,'ETF'],[/^La gestora es/,'Gestora'],[/^Un índice resume/,'Índice'],
  [/^El ISIN es/,'ISIN'],[/^La réplica sintética/,'Réplica sintética'],[/^Una contraparte es/,'Contraparte'],[/^El TER es/,'TER'],[/^El diferencial, también/,'Diferencial'],
  [/^La diferencia de seguimiento /,'Diferencia de seguimiento'],[/^El error de seguimiento /,'Error de seguimiento'],[/^El valor liquidativo /,'Valor liquidativo'],
  [/^Un bono es/,'Bono'],[/^El cupón es/,'Cupón'],[/^La duración modificada /,'Duración modificada'],[/^La convexidad /,'Convexidad'],[/^El diferencial de crédito /,'Diferencial de crédito'],
  [/^La moneda de cotización /,'Moneda de cotización'],[/^La moneda base /,'Moneda base'],[/^Un factor es/,'Factor'],[/^La correlación /,'Correlación'],
  [/^Un activo digital es/,'Activo digital'],[/^Un registro de transacciones /,'Registro de transacciones'],[/^Un nodo es/,'Nodo'],
  [/^El consenso es/,'Consenso'],[/^Una firma digital /,'Firma digital'],[/^La frase de recuperación /,'Frase de recuperación'],
  [/^El gas mide/,'Gas'],[/^Un explorador es/,'Explorador'],[/^La suplantación /,'Suplantación'],[/^Una orden limitada /,'Orden limitada'],
  [/^El deslizamiento es/,'Deslizamiento'],[/^La emisión crea/,'Emisión'],[/^Un desbloqueo /,'Desbloqueo'],[/^Quemar significa/,'Quema'],
  [/^Un contrato inteligente es/,'Contrato inteligente'],[/^Un oráculo /,'Oráculo'],[/^Una stablecoin /,'Stablecoin'],
  [/^Reembolsar significa/,'Reembolso'],[/^Staking significa/,'Staking'],[/^La dilución /,'Dilución'],[/^Un puente /,'Puente'],
  [/^La relación préstamo\/garantía/,'LTV'],[/^El valor total bloqueado/,'TVL'],[/^El secuenciador es/,'Secuenciador'],
  [/^Reequilibrar es/,'Reequilibrio'],[/^Un derivado es/,'Derivado'],[/^El riesgo de secuencia /,'Riesgo de secuencia'],
  [/^Una acción representa/,'Acción'],[/^Emitir acciones significa/,'Emitir acciones'],[/^Cotizar significa/,'Cotizar'],
  [/^Un dividendo /,'Dividendo'],[/^La capitalización /,'Capitalización bursátil'],[/^La inflación /,'Inflación'],
  [/^El interés compuesto /,'Interés compuesto'],[/^El CAGR /,'CAGR'],[/^El volumen cuenta/,'Volumen'],
  [/^Un índice resume/,'Índice bursátil'],[/^La volatilidad /,'Volatilidad'],[/^La liquidez /,'Liquidez'],
  [/^El beneficio por acción, o BPA/,'Beneficio por acción'],[/^El PER /,'PER'],[/^El valor contable /,'Valor contable'],
  [/^El flujo de caja libre /,'Flujo de caja libre'],[/^El margen de seguridad /,'Margen de seguridad']
 ];
 const item=definitions.find(([pattern])=>pattern.test(concept));
 return item?[{word:item[1],meaning:concept.split('.')[0]+'.'}]:[];
};
Object.assign(procedures,{gain:'Suma el valor final y los cobros que recibiste fuera; resta el importe invertido.',linked:'Convierte cada porcentaje en un factor: uno más el porcentaje dividido entre cien. Multiplica los dos factores, resta uno y multiplica por cien.',afterWithdrawal:'Resta la retirada del saldo disponible. Aplica al capital restante el factor uno más la rentabilidad del siguiente periodo dividida entre cien.',margin:'Resta el coste de los ingresos; divide el resultado entre los ingresos y multiplica por cien.'});
const decode=s=>s.replace(/\{([a-d])\}/g,(_,letter)=>'{'+letter+'}');
export function calculationMethod(operation){
 if(!procedures[operation])throw Error('Missing calculation teaching '+operation);
 return procedures[operation];
}

export function parseAuthoring(texts,expected){
const records=[];
for(const [chapter,text] of texts.entries())for(const row of text.split(/\r?\n/).filter(r=>r.trim()&&!r.startsWith('#'))){
  const fields=row.split('¦').map(v=>v.trim());
  if(fields.length!==8)throw Error(`Part ${chapter}: expected eight fields: ${row.slice(0,70)}`);
  const [concept,example,prompt,expression,unit,meaning,limit,mistake]=fields;
  const [op,...values]=expression.split(':');const args=values.map(Number);
  if(args.some(v=>!Number.isFinite(v)))throw Error('Invalid operands');
  for(const [,letter] of prompt.matchAll(/\{([a-d])\}/g))if(args[letter.charCodeAt(0)-97]===undefined)throw Error('Question references missing operand: '+prompt);
  records.push({concept,example,prompt:decode(prompt),op,args,unit,meaning,limit,mistake});
}
if(records.length!==expected)throw Error('Expected '+expected+' authored records; got '+records.length);
return records;
}
export function compileRevision({outline,records,start,sources}){
const lessons=[],exams=[],groups=[];
const crypto=start===1150;
const numeric=(r,values)=>{
 const body=r.prompt.replace(/\{([a-d])\}/g,(_,letter)=>money(values[letter.charCodeAt(0)-97]));
 const answer=calculate(r.op,values);
 return {type:'numeric',title:'Aplica la idea con otros datos',body,answer,tolerance:.02,unit:r.unit,hint:'Usa solo los datos de esta pregunta. La explicación anterior muestra el procedimiento, con otras cifras.',explanation:`Con estos datos, el resultado es ${money(answer)} ${r.unit}. ${r.meaning}`,calculation:{operation:r.op,operands:values}};
};
for(const w of outline.worlds){
 const worldId=start/10-1+w.number;
 groups.push({title:w.title,short:w.title,sub:w.section});
 const exam={id:worldId,title:`Examen ${w.number} · ${w.title}`,summary:'Diez situaciones para comprobar si puedes aplicar lo aprendido. Necesitas ocho aciertos; después podrás continuar.',steps:[]};
 for(const [position,item] of w.lessons.entries()){
  const local=(w.number-1)*10+position,id=start+local,r=records[local];
  const exampleFigure={kind:'table',headers:['Parte del ejemplo','Qué significa'],rows:[['Datos y cálculo',r.example],['Interpretación',r.meaning]],caption:crypto?'Simulación educativa: cifras simplificadas, no precios, tarifas o requisitos actuales. No se realiza ninguna operación real.':'Ejemplo didáctico: cifras simplificadas; no son datos actuales de una empresa.'};
  const learn=(title,body,takeaway,extra={})=>({type:'learn',title,body,takeaway,...extra});
  const rotation=id%3,options=[r.meaning,r.mistake,'La cifra del ejemplo garantiza el resultado de cualquier inversión.'];
  const shuffled=options.map((_,i)=>({text:options[(i+rotation)%3]}));
  const lesson={id,title:item.title,short:item.title,subtitle:w.title,summary:r.concept,takeaway:r.meaning,minutes:6,prerequisites:local?[id-1]:[],story:{scene:'Una decisión con datos',text:r.example},steps:[
   learn(item.title,`${r.concept}\n\nVamos a separar el dato observado de lo que podemos concluir. ${r.meaning}`,r.meaning,{figure:exampleFigure,terms:termFor(r.concept)}),
   {type:'choice',title:'Qué te dicen estos datos',body:`Lee el ejemplo de la tabla. ¿Qué conclusión está justificada?`,figure:exampleFigure,options:shuffled,answer:(3-rotation)%3,hint:'Busca la frase que interpreta los datos sin prometer nada que no se haya demostrado.',explanation:r.meaning+' '+r.limit},
   learn('Un cálculo que puedas repetir',`${crypto?'Para esta situación, recuerda: '+r.meaning+'\n\n':start===950?'En este caso de fondos, recuerda: '+r.meaning+'\n\n':''}${procedures[r.op]}\n\nEn el ejercicio siguiente cambian los números. Identifica qué cantidad corresponde a cada parte y usa el procedimiento de «${item.title.toLocaleLowerCase('es')}»; no copies el resultado del ejemplo.`,r.meaning,{figure:exampleFigure,explore:position%2===0?{prompt:'Cambia de perspectiva: ¿qué podemos afirmar y qué queda por comprobar?',options:[{label:'Lo que sabemos',title:'Conclusión apoyada por el ejemplo',body:r.meaning,figure:exampleFigure},{label:'Lo que falta',title:'Límite de esta conclusión',body:r.limit}]}:undefined}),
   numeric(r,r.args),
   learn('Interpretar antes de decidir',`${r.meaning}\n\nEn «${item.title}», hacer bien la cuenta es solo una parte del trabajo. ${crypto?'Relaciona la cifra con el uso, el acceso o el riesgo que acabamos de explicar.':'Ahora conecta la cifra con el negocio o con tu posición como inversor.'} ${r.limit} No confundas una explicación de lo que ha ocurrido con una promesa sobre lo que ocurrirá.`,r.limit),
   {type:'match',title:'Dato y conclusión',body:'Relaciona cada afirmación con su interpretación. Una está apoyada por el ejemplo y otra añade una conclusión que no se puede sostener.',pairs:[{left:r.meaning,right:'El ejemplo permite esta conclusión'},{left:r.mistake,right:'Esta conclusión no está justificada'}],hint:'La relación correcta debe respetar los límites explicados, además de las cifras.',explanation:r.meaning+' '+r.limit},
   learn('El límite que conviene recordar',`${r.limit}\n\nUna confusión frecuente en «${item.title}» sería pensar: «${r.mistake}». Es incorrecta: ${r.concept} Mantén separados el cálculo, su interpretación y aquello que todavía necesitas comprobar; así podrás usar esta idea sin atribuirle más significado del que tiene.`,r.limit),
   {type:'multi',title:'Distingue las conclusiones válidas',body:'Selecciona las dos afirmaciones correctas sobre lo que acabas de aprender. La tercera confunde el cálculo con algo que no demuestra.',options:[{text:r.meaning},{text:r.mistake},{text:r.limit}],answers:[0,2],hint:'Hay una conclusión válida y una precaución necesaria; ambas son correctas.',explanation:r.meaning+' '+r.limit}
  ]};
  if(local%5===0){
   const sequence=['Identificar los datos y su unidad',procedures[r.op],r.meaning];
   lesson.steps[6].body+=`\n\nPara aplicar la idea sigue este orden: primero identifica los datos y su unidad; después realiza el cálculo explicado; por último interpreta su significado y sus límites.`;
   lesson.steps[7]={type:'order',title:'Del dato a su interpretación',body:`Ordena el procedimiento para aplicar «${item.title.toLocaleLowerCase('es')}». El primer paso va arriba.`,items:[sequence[2],sequence[0],sequence[1]],answer:[1,2,0],hint:'Identificar viene antes de calcular; calcular viene antes de interpretar.',explanation:sequence.join(' → ')};
  }
  lessons.push(lesson);
  if(position%3===0){
   // A new set of operands asks for transfer of the procedure, not recall of the practice answer.
   const changed=[...r.args];
   if(r.op==='pct')changed[0]=Number.isInteger(changed[0])?Math.max(1,Math.floor(changed[0]*.8)):changed[0]*.8;
   else if(r.op==='change')changed[1]*=changed[1]>=changed[0]?1.1:.9;
   else if(start===950&&r.unit==='años'&&changed[0]>2000)changed[0]+=1;
   else if(start===950&&changed[0]===100&&r.unit==='%'){if(r.op==='div')changed[1]+=1;else changed[1]*=.8;}
   else changed[0]*=1.5;
   const question=numeric(r,changed);question.title='Comprueba el cálculo';question.body='Nuevo caso, independiente del ejemplo de la lección. '+question.body;question.reviewLesson=id;delete question.hint;exam.steps.push(question);
  }else if(position%3===1){
   const options=[{text:r.limit},{text:r.mistake},{text:r.meaning}],shift=crypto?(w.number+Math.floor(position/3))%3:0;
   exam.steps.push({type:'multi',title:'Cálculo y límites',body:`Estás analizando «${item.title.toLocaleLowerCase('es')}». Marca las dos afirmaciones que podrías incluir en una explicación rigurosa.`,options:options.map((_,i)=>options[(i+shift)%3]),answers:[0,2].map(i=>(i-shift+3)%3),reviewLesson:id,explanation:r.meaning+' '+r.limit});
  }else{
   const options=[{text:r.meaning+' '+r.limit},{text:crypto?'La afirmación es correcta para cualquier token y cualquier red.':'La afirmación es correcta en cualquier empresa.'},{text:crypto?'La afirmación deja de ser un problema si el precio del token sube.':'La afirmación deja de ser un problema si el precio de la acción sube.'}],shift=crypto?(w.number+Math.floor(position/3))%3:0;
   exam.steps.push({type:'choice',title:'Detecta el error de interpretación',body:`Otra persona estudia «${item.title.toLocaleLowerCase('es')}» y afirma: «${r.mistake}». ¿Cómo corregirías esa conclusión?`,options:options.map((_,i)=>options[(i+shift)%3]),answer:(3-shift)%3,reviewLesson:id,explanation:r.concept+' '+r.limit});
  }
 }
 exams.push(exam);
}

return {revision:outline.revision,groups,lessons,exams,sources};
}
