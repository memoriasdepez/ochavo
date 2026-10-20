import {calculationMethod} from '../course-authoring.mjs';
import {ETF_CASES} from './etfs-cases.mjs';
import {ETF_TRANSFERS} from './etfs-transfers.mjs';
import {etfsFirstWorld} from './etfs-first-world.mjs';
import {cryptoFirstWorld} from './crypto-first-world.mjs';
import {pair,choice,multi,match,truth,rows,numeric,activity,table,usePairs,rotate} from './helpers.mjs';

export const REVISIONS={etfs:'etfs-reasoning-2026-10-10',crypto:'crypto-reasoning-2026-10-10'};
// Explicit curriculum decisions, not arithmetic inferred from whatever operands
// happen to exist in the legacy record. In particular security/identity lessons
// no longer count compromised keys or add unrelated types of token together.
export const ETF_NUMERIC=new Set([
 951,955,957,963,964,965,967,968,969,973,974,975,999,
 1000,1002,1003,1004,1006,1008,1009,1011,1014,1016,1019,
 1020,1022,1035,1037,1041,1044,1047,1049,1064,1067,1069,
 1083,1085,1092,1094,1097,1102,1105,1106,1109,1111,1113,
 1114,1117,1119,1120,1121,1122,1124,1125,1127,1129,
 1133,1134,1135,1137,1139,1143,
]);
export const CRYPTO_NUMERIC=new Set([
 1158,1162,1176,1193,1197,1199,1212,1215,1216,1217,1219,
 1220,1223,1224,1225,1227,1230,1231,1232,1234,1235,1237,1239,
 1243,1244,1246,1247,1259,1264,1269,1272,1273,1274,1275,1279,
 1282,1283,1285,1286,1289,1293,1295,1296,1299,1309,
 1315,1316,1317,1325,1327,1334,1335,1343,1345,1346,
 1354,1355,1365,1374,1376,1384,1385,1395,1406,1415,
 1424,1425,1432,1439,1442,1449,
]);
const copy=v=>structuredClone(v);
const orders=[[0,1,2,3],[0,2,3,1],[0,3,1,2],[0,2,1,3],[0,1,3,2],[0,3,2,1]];
const distractors={
 etfs:[
  'Elegir basándose únicamente en la evolución reciente del precio.',
  'Comparar únicamente el saldo final, sin reconstruir los movimientos.',
  'Usar el nivel en puntos del índice como medida de calidad.',
  'Dar prioridad al nombre comercial sobre la identificación del documento.',
  'Comparar solo la rentabilidad reciente, sin revisar cómo se obtiene.',
  'Ordenar los productos solo por el TER anunciado.',
  'Usar la última cotización como precio reservado para cualquier operación.',
  'Tratar cualquier distancia entre precio y valor como beneficio seguro.',
  'Contar únicamente cuántos nombres diferentes aparecen en la cartera.',
  'Elegir únicamente el bono que promete el pago más alto.',
  'Tratar todos los fondos de bonos como si conservaran el mismo riesgo.',
  'Deducir toda la exposición de divisa a partir de la moneda de compra.',
  'Aceptar la etiqueta del factor sin consultar cómo selecciona inversiones.',
  'Tomar el crecimiento del tema como prueba suficiente de buena inversión.',
  'Elegir por la mayor subida reciente sin comprobar la exposición.',
  'Añadir productos hasta tener muchas líneas distintas en la cuenta.',
  'Cambiar el plan solo porque el último movimiento de mercado fue grande.',
  'Ordenar resultados solo por el dinero que hay al terminar.',
  'Juzgar el producto solo por los ingresos que reparte.',
  'Mantener el análisis antiguo porque el nombre sigue resultando familiar.',
 ],
 crypto:[
  'Deducir los derechos únicamente del precio o del nombre del activo.',
  'Aceptar una captura aislada como prueba suficiente de todo el historial.',
  'Contar participantes sin comprobar las reglas ni el control que ejercen.',
  'Elegir por la comodidad de acceso sin estudiar recuperación y custodia.',
  'Dar por correcto un envío porque el símbolo del activo coincide.',
  'Aceptar la solicitud porque el mensaje parece urgente y profesional.',
  'Comparar únicamente el último precio mostrado en pantalla.',
  'Comparar tokens solo por el precio de una unidad.',
  'Usar el máximo histórico como referencia suficiente del riesgo actual.',
  'Tomar más usuarios como prueba de más valor para cualquier token.',
  'Confiar en el nombre de la aplicación sin revisar permisos y dependencias.',
  'Tratar el precio objetivo como garantía de salida inmediata.',
  'Comparar solo el porcentaje anunciado de recompensas.',
  'Contar únicamente los pagos recibidos por aportar liquidez.',
  'Suponer que una garantía suficiente hoy lo será también después.',
  'Deducir seguridad y recuperación únicamente de la rapidez del traslado.',
  'Tomar una cifra grande de actividad como prueba de usuarios independientes.',
  'Reforzar la conclusión solo con los datos que la favorecen.',
  'Usar la subida reciente de BTC como prueba suficiente de sus condiciones.',
  'Confundir actividad en Ethereum con beneficio asegurado para ETH.',
  'Interpretar cualquier aumento de operaciones como demanda sostenible de SOL.',
  'Atribuir al titular de BNB todos los derechos de una empresa del ecosistema.',
  'Tratar cada anuncio de acuerdos como prueba de demanda efectiva de XRP.',
  'Deducir la sostenibilidad de ADA únicamente de las recompensas anunciadas.',
  'Atribuir cualquier uso de una red del ecosistema a demanda directa de AVAX.',
  'Confundir redes conectadas con uso garantizado y creciente de DOT.',
  'Suponer que más integraciones aseguran beneficio para quien posee LINK.',
  'Usar la popularidad como sustituto de comprobar actividad económica.',
  'Dar por equivalentes todas las unidades que muestran el símbolo USDT.',
  'Dar por equivalentes todas las versiones y vías de salida de USDC.',
 ],
};

function interpretation(r,c,id){
 const explanation=`${c.correct} ${r.limit}`;
 const body=`${c.scene}\n\n¿Qué interpretación explica esta situación sin añadir una garantía que no existe?`;
 if(id%4===0)return truth('¿Qué permite afirmar el caso?',c.scene,[[c.correct,true],[c.wrong,false]],explanation);
 if(id%4===1)return match('Interpreta las dos respuestas',`${c.scene}\n\nRelaciona cada respuesta con la valoración adecuada.`,[[c.correct,'Se sostiene con la información del caso'],[c.wrong,'Confunde conceptos o añade una garantía']],explanation);
 const options=[c.correct,c.wrong];if(id%4===2)return activity(choice('Resuelve la situación',body,options,0,explanation),'clues',{options,answer:0,clues:[r.meaning,r.limit],instruction:'Elige una respuesta. Puedes revelar pistas si las necesitas.'});
 return choice('Una decisión explicada',body,options,0,explanation);
}
function investigate(r,c,id,track){
 const distract=c.distraction||distractors[track][Math.floor((id-(track==='etfs'?950:1150))/10)];
 const body=`${c.scene}\n\nQuieres comprobar la explicación, no quedarte con la primera impresión. ¿Qué paso responde al problema descrito?`;
 const explanation=`${c.check} Esa comprobación ayuda a contrastar la situación concreta. ${r.limit}`;
 if(id%3===0)return choice('El siguiente paso útil',body,[c.check,distract],0,explanation);
 const entries=[{label:c.check,options:['Ayuda a comprobar este problema','Deja el problema sin comprobar'],answer:0},{label:distract,options:['Ayuda a comprobar este problema','Deja el problema sin comprobar'],answer:1}];
 if(id%2)entries.reverse();
 return rows(id%3===1?'classify':'table','Qué investigarías',body,entries,explanation);
}
function foundation(r,id,title){
 const explain=`${r.concept}\n\n${r.limit}`;
 let exercise;
 if(id%3===0)exercise=multi('Separa la idea y su límite','Selecciona las dos afirmaciones que podrías defender después de esta explicación.',[r.meaning,r.mistake,r.limit],[0,2],`${r.meaning} ${r.limit}`);
 else if(id%3===1)exercise=choice('Señala la interpretación incorrecta',`Un resumen de «${title.toLocaleLowerCase('es')}» contiene estas tres frases. ¿Cuál hay que corregir?`,[r.meaning,r.mistake,r.limit],1,`${r.concept} ${r.limit}`);
 else exercise=truth('Distingue la regla de una suposición','Valora las dos afirmaciones de este resumen.',[[r.meaning,true],[r.mistake,false]],`${r.concept} ${r.limit}`);
 return pair(title,explain,r.meaning,exercise);
}
function transferExercise(r,t,id,reserved){
 const possible=['choice','truth','match','clues'].filter(k=>!reserved.includes(k));
 const kind=(possible.length?possible:['choice','truth','match','clues'])[id%(possible.length||4)];
 const explanation=`${t.correct} ${r.limit}`;
 if(kind==='truth')return truth('Prueba la idea en otra situación',t.scene,[[t.correct,true],[t.wrong,false]],explanation);
 if(kind==='match')return match('Distingue dos conclusiones',`${t.scene}\n\nRelaciona cada interpretación con su valoración.`,[[t.correct,'Está apoyada por la situación'],[t.wrong,'La situación no la justifica']],explanation);
 const options=[t.correct,t.wrong],step=choice('Un caso que cambia las condiciones',`${t.scene}\n\n¿Qué conclusión respeta las condiciones de este caso?`,options,0,explanation);
 if(kind==='clues')return activity(step,'clues',{options,answer:0,clues:[r.meaning,r.limit],instruction:'Elige la conclusión que explica el nuevo caso. Las pistas recuerdan el criterio.'});
 return step;
}

export function refineFundsCrypto(result,records,{track,cases,transfers={}}){
 const revision=REVISIONS[track],start=track==='etfs'?950:1150,quant=track==='etfs'?ETF_NUMERIC:CRYPTO_NUMERIC;
 cases ||= track==='etfs'?ETF_CASES:undefined;
 if(!revision||!cases||cases.length!==result.lessons.length)throw Error('Missing complete topic-specific editorial cases for '+track);
 for(const [i,lesson] of result.lessons.entries()){
  if(i<10)continue; // Introductory worlds are written as individual learning sequences below.
  const id=lesson.id,r=records[i],c=cases[i];
  if(!c?.scene||!c.correct||!c.wrong||!c.check)throw Error('Incomplete editorial case '+id);
  const base=foundation(r,id,lesson.title);
  const applied=pair('Aplicar el mecanismo',`${r.concept}\n\n${r.limit} La siguiente situación cambia el contexto. Relaciona sus hechos con el mecanismo explicado: una descripción del funcionamiento no promete un resultado.`,r.meaning,interpretation(r,c,id));
  const research=pair('Qué información sirve para comprobarlo',`${r.meaning}\n\n${r.limit} Para contrastar una interpretación necesitas información sobre la causa que propone. Una cifra o una etiqueta pueden ser ciertas y aun así dejar sin responder esa duda concreta.`,r.limit,investigate(r,c,id,track));
  let fourth;
  if(quant.has(id)){
   const source=copy(lesson.steps.find(s=>s.type==='numeric'));
   if(!source)throw Error('Missing original numeric exercise '+id);
   source.calculator=true;source.title='Pon una cantidad al efecto';
   fourth=pair('Para qué sirve esta cuenta',`${calculationMethod(r.op)}\n\nEjemplo explicado: ${r.example}\n\n${r.meaning} ${r.limit} En el ejercicio cambian los datos; conserva el procedimiento, no el resultado.`,r.meaning,source,table(['Ejemplo resuelto','Qué permite interpretar'],[[r.example,r.meaning]]));
  }else{
   const t=c.transfer||transfers[id]||(track==='etfs'?ETF_TRANSFERS[id]:null);
   if(!t?.scene||!t.correct||!t.wrong)throw Error('Missing independent transfer case '+id);
   const reserved=[base[1],applied[1],research[1]].map(s=>s.activity?.kind||s.type);
   fourth=pair('Comprobar el límite de la idea',`${r.meaning}\n\n${r.limit} En el próximo caso cambia una condición importante. Decide si el mecanismo sigue permitiendo la conclusión propuesta: conservar un nombre, una cantidad o un resultado aislado no significa conservar todas las condiciones.`,r.limit,transferExercise(r,t,id,reserved));
  }
  const pairs=[base,applied,research,fourth];usePairs(lesson,orders[i%orders.length].map(n=>pairs[n]),revision);
  lesson.qualitativeRevision=revision;
 }
 if(track==='etfs')etfsFirstWorld(result.lessons,records,revision);
 else cryptoFirstWorld(result.lessons,records,revision);
 for(const exam of result.exams){
  const previous=copy(exam.steps);let numericUsed=0;
  exam.steps=Array.from({length:10},(_,j)=>{
   const id=exam.id*10+j,index=id-start,r=records[index],c=cases[index];let step;
   if(quant.has(id)&&previous[j]?.type==='numeric'&&numericUsed<2){step=previous[j];numericUsed++;step.calculator=true;}
   else if(c.exam){step=choice('Aplica la idea a otro caso',c.exam.scene+'\n\n¿Qué interpretación está justificada?',[c.exam.correct,c.exam.wrong],0,c.exam.correct+' '+r.limit);}
   else if(j%3===1){
    const t=c.transfer||transfers[id]||(track==='etfs'?ETF_TRANSFERS[id]:null);
    if(t){
     // Practice selected an investigation or interpreted one situation. The
     // exam now asks learners to connect two contexts through the topic's rule.
     step=choice('Encuentra la idea que conecta los casos',`Situación A: ${c.scene}\n\nSituación B: ${t.scene}\n\n¿Qué idea sirve para analizar ambas sin caer en la confusión que hemos estudiado?`,[r.meaning,r.mistake],0,`${r.meaning}\n\nEn A: ${c.correct}\n\nEn B: ${t.correct}`);
    }else{
     // On quantitative topics without a second authored scenario, switch from
     // choosing a next action to identifying the mistaken inference it avoids.
     step=choice('Por qué hace falta comprobarlo',`${c.scene}\n\nAntes de concluir, propones: «${c.check}». ¿Qué error de razonamiento intentas evitar con esa comprobación?`,[c.wrong,c.correct],0,`La conclusión que hay que evitar es: «${c.wrong}». ${c.check} ${c.correct}`);
    }
   }
   else {const reject=j%3===2;step=choice(reject?'Detecta la conclusión incorrecta':'Razona con el caso',`${c.scene}\n\n${reject?'¿Qué conclusión descartarías?':'¿Qué interpretación puedes justificar?'}`,[c.correct,c.wrong],reject?1:0,`${c.correct} ${r.limit}`);}
   delete step.hint;step.reviewLesson=id;rotate(step,exam.id+j*3);return step;
  });
  exam.editorialRevision=revision;
 }
 result.editorialRevision=revision;
 return result;
}

export function refineEtfs(result,records){return refineFundsCrypto(result,records,{track:'etfs',cases:ETF_CASES});}
