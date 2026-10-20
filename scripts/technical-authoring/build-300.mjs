import {worlds} from './outline-300.mjs';
import {scenario,measurement,metricKeys,figure,num} from './scenarios.mjs';
import {audit,numeric,reasoning,comparison,interpretation,calculationFigure} from './analysis.mjs';
import {workedDetail} from './worked.mjs';
import {clarifyFirstLesson} from './first-lesson.mjs';
import {clarifySecondLesson} from './second-lesson.mjs';
import {redesignFirstWorld} from './first-world.mjs';
import {redesignSecondWorldA} from './second-world-a.mjs';
import {redesignSecondWorldB} from './second-world-b.mjs';
import {refineLaterWorldsA} from './later-worlds-a.mjs';
import {refineLaterWorldsB} from './later-worlds-b.mjs';
import {refineTechnicalReasoning} from './reasoning-revision.mjs';
import {refineLateTechnicalReasoning} from './late-reasoning-revision.mjs';
export {worlds,scenario,measurement};
export const START=1450;
const basics='Todos los datos son simulados. Cada periodo tiene un precio inicial, un precio final y dos extremos. El cierre es el último precio registrado al terminar ese periodo. Toca un periodo para consultarlo; la tabla permite comparar todos los datos.';
const reading='Cada vela resume un periodo terminado: apertura es su primer precio y cierre el último. Máximo y mínimo son sus extremos. Verde indica cierre sobre apertura; rojo, cierre por debajo. Puedes tocar una vela o abrir la tabla.';
const terms=[{word:'Apertura',meaning:'Primer precio del periodo.'},{word:'Cierre',meaning:'Último precio cuando termina el periodo.'},{word:'Cuerpo',meaning:'Distancia entre apertura y cierre.'},{word:'Mechas',meaning:'Líneas desde el cuerpo hasta los extremos.'}];
const toolTerms={15:[{word:'Media simple',meaning:'Promedio que da el mismo peso a cada cierre.'},{word:'Media exponencial',meaning:'Promedio que da más importancia a los precios recientes.'}],17:[{word:'Línea de señal',meaning:'Promedio exponencial del propio MACD para compararlo con su recorrido reciente.'},{word:'Histograma',meaning:'Barras que representan la diferencia entre MACD y señal.'}],18:[{word:'Dispersión',meaning:'Cuánto se separan los precios de su media.'},{word:'Desviación típica',meaning:'Una medida de esa dispersión, en la misma unidad que el precio.'}],20:[{word:'+DI y −DI',meaning:'Comparaciones suavizadas de avances de máximos y descensos de mínimos; ayudan a separar dirección y fuerza.'}]};
export const sources=[{title:'Fidelity · Guía de análisis técnico',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis'},{title:'Fidelity · RSI',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/rsi'},{title:'Fidelity · MACD',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/macd'},{title:'Fidelity · ATR',url:'https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr'},{title:'Fidelity · ADX',url:'https://www.fidelity.com/viewpoints/active-investor/average-directional-index-ADX'},{title:'Charles Schwab · Promedios ponderados por volumen',url:'https://www.schwab.com/learn/story/how-to-use-volume-weighted-indicators-trading'}];
function chartChallenge(w,j,s,id){
 if([3,6,7,8].includes(w.number)&&j%3===0){const candidates=s.candles.map((_,i)=>i).slice(-4),axis=w.number===6?'volumen comparado con rango':j%2?'mecha inferior frente a cuerpo':'cuerpo frente a rango';const score=c=>w.number===6?c.v/(c.h-c.l):j%2?(Math.min(c.o,c.c)-c.l)/Math.max(.25,Math.abs(c.c-c.o)):Math.abs(c.c-c.o)/(c.h-c.l);const values=candidates.map(i=>score(s.candles[i])),answer=values.indexOf(Math.max(...values)),prompt=`Entre las cuatro velas indicadas en los botones, señala la que tiene mayor proporción de ${axis}. Si hay empate, elige la primera de izquierda a derecha.`,method=w.number===6?'Divide el volumen por máximo menos mínimo.':j%2?'Divide la mecha inferior por el cuerpo; para cuerpos de cero usamos 0,25 € como divisor en esta comparación.':'Divide el cuerpo por máximo menos mínimo; comparar cuerpos en euros no basta.';
 return {type:'choice',title:'Compara sobre el gráfico',body:prompt,options:candidates.map(i=>({text:'Vela '+(i+1)})),answer,hint:method,explanation:`${method} Proporciones: ${values.map((v,i)=>'vela '+(candidates[i]+1)+': '+num(v)).join('; ')}.`,activity:{kind:'hotspot',title:'Compara sobre el gráfico',prompt,instruction:method+' Toca una de las cuatro velas marcadas o su botón.',options:candidates.map(i=>'Vela '+(i+1)),answer,values,axis,candles:figure(s),candidates,explanation:method}};
 }
 const base=comparison(w,j,s);const rows=base.activity.rows;
 if(id%6===0){base.activity={...base.activity,kind:'classify',title:'Clasifica las conclusiones',instruction:'Clasifica cada afirmación según si los datos la sostienen.',rows:rows.map(r=>({...r,options:['Los datos la sostienen','Los datos no la sostienen']}))};}
 if(id%6===1){base.activity={...base.activity,kind:'table',title:'Completa la revisión',instruction:'Completa las tres filas comprobando las condiciones en el gráfico.'};}
 if(id%6===2){base.activity={...base.activity,kind:'diagram',title:'Relaciona datos y conclusión',instruction:'Elige la conclusión que corresponde a cada observación.'};}
 return base;
}
function worked(w,j,key){const practice=measurement(key,scenario(w,j,1)).answer;for(const candidateWorld of [w,...worlds.filter(other=>w.number<3||other.number>=3)])for(let k=0;k<10;k++){const s=scenario(candidateWorld,(j+k)%10,0);try{if(measurement(key,s).answer!==practice)return s;}catch{}}throw Error('A worked example must not disclose the next answer: '+key);}
export function buildTechnical(){const lessons=[],groups=[],exams=[];
 for(const w of worlds){const worldId=145+w.number-1;groups.push({title:w.title,short:w.title,sub:w.section});const exam={id:worldId,title:`Examen ${w.number} · ${w.title}`,summary:'Diez casos para aplicar las ideas del mundo. Necesitas ocho aciertos para abrir el siguiente.',steps:[]};
 for(const [j,t] of w.topics.entries()){const local=(w.number-1)*10+j,id=START+local,s=scenario(w,j,0),p=scenario(w,j,1),r=scenario(w,j,2),end=scenario(w,j,3),key=metricKeys[w.number-1][j],example=worked(w,j,key),m=measurement(key,example),check=audit(w,j,s),learn=(title,body,takeaway,extra={})=>({type:'learn',title,body,takeaway,...extra});
 const application=reasoning(t,id,p);if(local%7===5)application.activity={kind:'clues',title:application.title,prompt:application.body,instruction:'Decide con la regla explicada. Puedes abrir las pistas si lo necesitas.',options:application.options.map(o=>o.text),answer:application.answer,clues:['Identifica qué dos conceptos compara la situación.','Comprueba qué requisito falta antes de sacar una conclusión.'],explanation:application.explanation};
 const comparisonStep=chartChallenge(w,j,r,id),comparisonRule=comparisonStep.activity?.kind==='hotspot'?comparisonStep.activity.instruction:'En la revisión, «cumple» significa que todos los requisitos de la frase son ciertos. Si combina dos condiciones, necesitas comprobar ambas. No confundas el cambio del último periodo con el de todo el tramo.';
 const explanation=[t.concept,(w.number<=2?basics:w.number===3?reading:'Este caso mantiene el periodo indicado sobre el gráfico. Los números de las velas identifican su orden en el tiempo; no son sus precios.')].join('\n\n');
 lessons.push({id,title:t.title,short:t.title,subtitle:w.title,summary:t.concept,takeaway:t.correct,minutes:w.number<8?6:8,prerequisites:local?[id-1]:[],story:{scene:w.section,text:`Primero entenderás la idea de «${t.title.toLocaleLowerCase('es')}». Después compararás situaciones, harás una cuenta y revisarás conclusiones con otros datos.`},bridge:j<9?`A continuación: ${w.topics[j+1].title}.`:'El examen reunirá las diez ideas con casos distintos.',sources,steps:[
 learn(t.title,explanation,t.concept,{figure:figure(s),...(w.number===3?{terms}:toolTerms[w.number]?{terms:toolTerms[w.number]}: {})}),application,
 learn('Una cuenta que ayuda a entenderlo',`Ahora vamos a medir ${m.name}.\n\n${m.method}\n\n${workedDetail(key,example)}\n\nEn el ejercicio siguiente cambian los datos. Aplica el método con sus cifras.`,m.method,{figure:calculationFigure(key,example),workedAnswer:m.answer}),numeric(w,j,p),
 learn('Comprueba las condiciones',`${comparisonRule}\n\nPor ejemplo, en este gráfico: ${check[0].text} ${check[0].correct?'Se cumple.':'No se cumple.'} ${check[0].explanation}\n\nEl siguiente reto utiliza otro caso. Puedes consultar cada vela y los valores de las líneas en la tabla.`,comparisonRule,{figure:figure(s)}),comparisonStep,
 learn('De la observación a la conclusión',`${t.correct}\n\nAntes de revisar un informe, distingue el periodo que se compara y exige todos los datos de su condición. Una descripción de lo que ocurrió no demuestra qué pasará después. Si una afirmación necesita más información, no la presentes como un hecho.`,t.correct,{figure:figure(r)}),interpretation(w,j,end)
 ]});
 let q=j%3===0?numeric(w,j,scenario(w,j,5)):j%3===1?interpretation(w,j,scenario(w,j,5)):reasoning(t,id+1,scenario(w,j,5));delete q.activity;delete q.hint;q.title=t.title;q.reviewLesson=id;exam.steps.push(q);
 }exams.push(exam);}
 clarifyFirstLesson(lessons[0]);
 clarifySecondLesson(lessons[1]);
 redesignFirstWorld(lessons,exams);
 redesignSecondWorldA(lessons);
 redesignSecondWorldB(lessons,exams);
 refineLaterWorldsA(lessons,exams);
 refineLaterWorldsB(lessons,exams);
 refineTechnicalReasoning(lessons,exams);
 refineLateTechnicalReasoning(lessons,exams);
 const chartSources=[{title:'Fidelity · Elegir y configurar gráficos',url:'https://www.fidelity.com/viewpoints/active-investor/how-to-set-up-your-charts'},{title:'TradingView · Ajustar los datos por dividendos',url:'https://www.tradingview.com/support/solutions/43000590597-how-to-adjust-data-for-dividends/'},{title:'TradingView · Configuración de gráficos y escalas',url:'https://www.tradingview.com/support/solutions/43000748166-how-to-configure-your-supercharts/'}];
 for(const l of lessons.slice(10,20))l.sources=[...sources,...chartSources];
 return {revision:'technical-preview-300-v2',groups,lessons,exams,sources};}
