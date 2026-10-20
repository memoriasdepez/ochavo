// Stable IDs never move: extensions append new ranges while paths keep their order.
const range=(start,count)=>Array.from({length:count},(_,i)=>start+i);
const track=(details,segments)=>{
  const lessonIds=segments.flatMap(([start,count])=>range(start,count));
  const groupIds=segments.flatMap(([start,count])=>range(start/10,count/10));
  return {...details,start:lessonIds[0],count:lessonIds.length,groupStart:groupIds[0],groupCount:groupIds.length,lessonIds,groupIds};
};
export const TRACKS=[
  track({id:'stocks',name:'Acciones',icon:'chart-no-axes-combined',tag:'Entiende el negocio detrás de una acción',description:'De ser accionista a entender las cuentas, valorar negocios y analizar cada sector.',story:'Acciones, paso a paso',revision:'stocks-2026-10',freeIntroWorld:true},[[450,500]]),
  track({id:'etfs',name:'ETFs',icon:'layers',tag:'Entiende qué compras con un ETF',description:'Aprende en qué invierte un ETF, cómo se compra y cómo compararlo con otros fondos.',story:'ETFs paso a paso, con ejemplos',revision:'etfs-2026-10'},[[950,200]]),
  track({id:'crypto',name:'Cripto',icon:'blocks',tag:'Comprende lo que hay detrás de un token',description:'De las redes y la custodia a estudiar proyectos, precios y riesgos.',story:'Cripto paso a paso, con datos y ejemplos',revision:'crypto-2026-10'},[[1150,300]]),
  track({id:'technical',name:'Análisis técnico',icon:'chart-candlestick',tag:'Aprende a interpretar los gráficos',description:'290 puntos para leer velas, comparar escenarios y evaluar decisiones con datos simulados.',story:'Análisis técnico · práctica con gráficos',revision:'technical-2026-10'},[[1450,20],[1480,270]])
];
// Previous lessons retain their identities and reward receipts as history.
// They cannot unlock different lessons in the rebuilt curriculum.
export const LEGACY_TRACKS=[track({id:'stocks',name:'Acciones · recorrido anterior',archived:true},[[0,100],[200,150]]),track({id:'etfs',name:'ETFs · recorrido anterior',archived:true},[[100,50],[350,50]]),track({id:'crypto',name:'Cripto · recorrido anterior',archived:true},[[150,50],[400,50]]),
  // Retire the duplicate third world without reusing its IDs, claims or historical numbers.
  track({id:'technical',name:'Análisis técnico · contenido retirado',archived:true,retired:true,lessonNumberOffset:20,worldNumberOffset:2,previousWorldId:146},[[1470,10]])];
export const ALL_TRACKS=[...TRACKS,...LEGACY_TRACKS];
export const LESSON_COUNT=1750;
export const WORLD_COUNT=175;
export const ACTIVE_LESSON_COUNT=TRACKS.reduce((n,t)=>n+t.count,0);
export const ACTIVE_WORLD_COUNT=TRACKS.reduce((n,t)=>n+t.groupCount,0);
// Case receipt numbers are tied to persistent world IDs, including historical cases.
export const CASE_WORLD_IDS=[...range(0,45),...TRACKS.flatMap(t=>t.groupIds)];
export const CASE_IDS=CASE_WORLD_IDS.map(id=>'case-'+(id+1));
export const CASE_COUNT=CASE_WORLD_IDS.length;
export const INTRO_LESSON_IDS=TRACKS[0].lessonIds.slice(0,6);
export const FREE_INTRO_WORLD_ID=TRACKS[0].groupIds[0];
export const isArchivedLesson=id=>LEGACY_TRACKS.some(t=>t.lessonIds.includes(id));
export const isArchivedWorld=id=>LEGACY_TRACKS.some(t=>t.groupIds.includes(id));
export const trackForLesson=id=>Number.isInteger(id)?ALL_TRACKS.find(t=>t.lessonIds.includes(id)):undefined;
export const trackForExam=id=>Number.isInteger(id)?ALL_TRACKS.find(t=>t.groupIds.includes(id)):undefined;
export const lessonNumber=id=>{const t=trackForLesson(id);return t?t.lessonIds.indexOf(id)+1+(t.lessonNumberOffset||0):null;};
export const worldNumber=id=>{const t=trackForExam(id);return t?t.groupIds.indexOf(id)+1+(t.worldNumberOffset||0):null;};
