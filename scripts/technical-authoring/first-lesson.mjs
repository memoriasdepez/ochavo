import {num} from './scenarios.mjs';

// This introductory lesson uses only prices at the end of each day.
// Opening gaps and candle anatomy belong to later lessons in the supplied index.
export function dailyPrices(prices,caption,volumes=null){
 const candles=prices.map((c,i)=>{const o=i?prices[i-1]:c;return {o,c,h:Math.max(o,c)+1,l:Math.min(o,c)-1,v:volumes?.[i]??100};});
 return {kind:'candles',lineMode:true,candles,index:prices.length-1,values:prices,labels:prices.map((_,i)=>'Día '+(i+1)),unit:'€',caption,timeframe:'Cada punto representa el precio al terminar un día',periodLabel:'Día',volume:!!volumes};
}
const first=f=>f.values[0],last=f=>f.values.at(-1),previous=f=>f.values.at(-2);
const wentUpEveryDay=f=>f.values.slice(1).every((v,i)=>v>f.values[i]);
const fallingDays=f=>f.values.slice(1).flatMap((v,i)=>v<f.values[i]?[`día ${i+1} al ${i+2}: ${num(f.values[i])} → ${num(v)} €`]:[]).join('; ');
const overall=f=>`Primer día: ${num(first(f))} €. Último día: ${num(last(f))} €. Cambio del conjunto: ${num(last(f))} − ${num(first(f))} = ${num(last(f)-first(f))} €.`;
const finalDay=f=>`Penúltimo día: ${num(previous(f))} €. Último día: ${num(last(f))} €. Cambio entre ambos: ${num(last(f))} − ${num(previous(f))} = ${num(last(f)-previous(f))} €.`;
const explain=rows=>rows.map(r=>(r.correct?'Es correcta: ':'Es incorrecta: ')+r.text+' '+r.explanation).join('\n\n');

export function clarifyFirstLesson(lesson){
 const example=dailyPrices([30,34,33,38,40,37],'Ejemplo explicado · seis días de precios simulados');
 const practice=dailyPrices([42,46,44,49,54,50],'Tu turno · un caso distinto con seis días simulados');
 const final=dailyPrices([50,55,53,58,61,57],'Reto final · otro caso con seis días simulados');
 lesson.steps[4]={type:'learn',title:'¿Subió en conjunto o bajó el último día?',
  body:`Un gráfico te ayuda a describir cómo ha cambiado el precio. Pero decir «ha subido» puede ser confuso si no aclaras qué días comparas.\n\nEn este ejemplo, cada punto es el precio al terminar un día. El número de abajo indica el día; la altura del punto indica el precio en euros.\n\nPara mirar los seis días en conjunto, compara el primero con el último: de 30 € a 37 €. Acabó 7 € más arriba.\n\nPara mirar solo el último cambio, compara los días 5 y 6: de 40 € a 37 €. Bajó 3 €.\n\nLas dos cosas son ciertas: el precio subió en conjunto, aunque cayó el último día. Por eso conviene mirar qué periodo describe cada frase. En el siguiente gráfico comprobarás tres frases con otros precios.`,
  takeaway:'Compara el primer y el último día para describir el conjunto. Compara los dos últimos para describir el cambio más reciente.',figure:example};
 const rows=[
  {text:'El precio terminó más alto que el primer día.',correct:last(practice)>first(practice),explanation:overall(practice)},
  {text:'El precio subió todos los días, sin ninguna caída.',correct:wentUpEveryDay(practice),explanation:`También hubo caídas: ${fallingDays(practice)}. Acabar más arriba no significa subir todos los días.`},
  {text:'El último día terminó más alto que el anterior.',correct:last(practice)>previous(practice),explanation:finalDay(practice)}
 ];
 const prompt='Comprueba estas tres frases en el gráfico. «Cumple» significa que la frase describe lo que muestran los precios; «No cumple», que los datos la contradicen.';
 lesson.steps[5]={type:'choice',title:'Describe lo que ocurrió',body:prompt,figure:practice,
  options:[{text:'Cumple'},{text:'No cumple'}],answer:rows[0].correct?0:1,
  hint:'En la primera frase compara los días 1 y 6. En la segunda revisa todos los cambios. En la tercera compara los días 5 y 6.',explanation:explain(rows),
  activity:{kind:'truth',title:'Describe lo que ocurrió',prompt,instruction:'Responde «Cumple» o «No cumple» en cada frase. Puedes tocar los puntos o consultar la tabla.',rows:rows.map(r=>({label:r.text,options:['Cumple','No cumple'],answer:r.correct?0:1})),explanation:explain(rows)}};
 lesson.steps[6]={type:'learn',title:'Lo que pasó no garantiza lo que pasará',
  body:'Ya sabes separar lo que ocurrió durante varios días de lo que ocurrió el último día. Ahora falta una distinción importante: observar el pasado no es conocer el futuro.\n\nDecir «el precio acabó más alto que al principio» describe unos datos que puedes comprobar. Decir «mañana subirá porque estos días ha subido» añade una predicción que el gráfico no garantiza.\n\nEl análisis técnico sirve para estudiar movimientos y preparar decisiones. No convierte una subida o una caída en una promesa sobre el día siguiente.\n\nEn el reto final usarás un gráfico nuevo. Marca solo las frases que puedes comprobar con sus precios y deja fuera las que contradicen los datos o aseguran lo que pasará mañana.',
  takeaway:'El gráfico permite comprobar lo que ocurrió. Por sí solo no garantiza el movimiento del día siguiente.'};
 const finalRows=[
  {text:'El precio acabó más alto que al principio de los seis días.',correct:last(final)>first(final),explanation:overall(final)},
  {text:'En el último día, el precio cayó respecto al día anterior.',correct:last(final)<previous(final),explanation:finalDay(final)},
  {text:'El precio subió todos los días del gráfico.',correct:wentUpEveryDay(final),explanation:`Hubo días de caída: ${fallingDays(final)}.`},
  {text:'La subida del conjunto garantiza que mañana el precio volverá a subir.',correct:false,explanation:'El gráfico muestra seis días que ya terminaron. No muestra el precio de mañana ni garantiza que la subida continúe.'}
 ];
 lesson.steps[7]={type:'multi',title:'¿Qué puedes afirmar con este gráfico?',body:'Marca todas las frases que puedes comprobar con los precios de estos seis días. Revisa el conjunto y el último cambio; una predicción sobre mañana no es un dato del gráfico.',figure:final,options:finalRows.map(r=>({text:r.text})),answers:finalRows.flatMap((r,i)=>r.correct?[i]:[]),hint:'Compara los días 1 y 6 para el conjunto y los días 5 y 6 para el último cambio. Después busca si hubo alguna caída. ¿El gráfico muestra el día de mañana?',explanation:explain(finalRows)};
 return lesson;
}
