import {readFileSync} from 'node:fs';
import {learn,choice,match,order,truth,activity,table,usePairs} from './helpers.mjs';
import {realExamples} from './real-examples-data.mjs';

export const IDENTIFICATION_REVISION='stocks-identification-real-2026-10-12';
const original=JSON.parse(readFileSync(new URL('../cases-authoring/stocks-sources.json',import.meta.url),'utf8')).sources;
export const exampleSources=Object.fromEntries(original.map(s=>[s.key,{title:s.company+' · '+s.title,url:s.url,period:s.period}]));
Object.assign(exampleSources,{
 'alphabet25':{title:'Alphabet · informe anual 2025, clases de acciones y negocios',url:'https://d18rn0p25nwr6d.cloudfront.net/CIK-0001652044/e6a3f2b6-bb98-4f54-900f-2a8794a582cf.html',period:'Ejercicio 2025'},
 'borsa-a':{title:'Borsa Italiana · Alphabet clase A, ISIN US02079K3059',url:'https://www.borsaitaliana.it/borsa/azioni/global-equity-market/listino-ufficiale.html?isin=US02079K3059&lang=it',period:'Identificación consultada el 12 de octubre de 2026'},
 'borsa-c':{title:'Borsa Italiana · Alphabet clase C, ISIN US02079K1079',url:'https://www.borsaitaliana.it/borsa/azioni/global-equity-market/listino-ufficiale.html?isin=US02079K1079&lang=it',period:'Identificación consultada el 12 de octubre de 2026'},
 'msft25':{title:'Microsoft · informe anual 2025',url:'https://www.microsoft.com/investor/reports/ar25/index.html',period:'Ejercicio terminado el 30 de junio de 2025'},
 'amazon':{title:'Amazon · informe anual 2025',url:'https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm',period:'Ejercicio 2025'},
 'apple-tax':{title:'Apple · cuentas de 2024 y nota del gasto fiscal de Irlanda',url:'https://www.apple.com/newsroom/pdfs/fy2024-q4/FY24_Q4_Consolidated_Financial_Statements.pdf',period:'Ejercicio 2024'},
});
const sourcesFor=keys=>keys.map(key=>{
 const source=exampleSources[key];if(!source)throw Error('Missing example source '+key);
 return {...source,checkedAt:'2026-10-12'};
});

function identification(lesson){
 const classes=table(['Acción en Nasdaq','Ticker','ISIN','Voto por acción'],[
  ['Alphabet A','GOOGL','US02079K3059','1 voto'],
  ['Alphabet C','GOOG','US02079K1079','Sin voto ordinario'],
 ],'Clases e identificadores reales de Alphabet; sin cotizaciones ni recomendación de compra.');
 const listings=table(['Clase A de Alphabet','ISIN','Moneda de negociación'],[
  ['Nasdaq','US02079K3059','Dólar estadounidense'],
  ['Borsa Italiana, Global Equity Market','US02079K3059','Euro'],
 ],'El mismo instrumento puede negociarse en mercados y monedas diferentes. Comprueba su disponibilidad en tu bróker.');
 const body='Alphabet es la empresa matriz de Google. Si la buscas en un bróker, puedes encontrar GOOGL y GOOG: no son dos empresas, sino dos clases de acciones del mismo negocio. Una clase agrupa acciones con determinados derechos. La A tiene un voto por acción; la C no tiene voto ordinario. Votar permite participar en decisiones de los accionistas.\n\nEl ticker es el nombre corto usado en un mercado: GOOGL corresponde a la A y GOOG a la C en Nasdaq. El ISIN es un código internacional de 12 caracteres que identifica el título. Cada clase tiene el suyo. No necesitas memorizarlo: sirve para comprobar qué estás eligiendo.';
 const first=match('¿La búsqueda encaja con lo que quieres?','Usa las fichas de Alphabet para interpretar estas decisiones. Relaciona cada situación con su comprobación.',[
  ['Quieres una acción con voto, pero seleccionas GOOG.','La clase elegida no cumple tu condición.'],
  ['Quieres clase A y confirmas GOOGL con su ISIN.','La identificación de la clase coincide con tu objetivo.'],
  ['Solo lees «Alphabet», sin clase ni identificador.','Falta información para confirmar qué título es.'],
 ],'GOOG identifica la clase C, sin voto ordinario. GOOGL y el ISIN de la A confirman esa clase. El nombre de la empresa solo no distingue ambas.');
 first.figure=structuredClone(classes);
 const rights=truth('Comprueba los derechos','Indica si estas conclusiones sobre las clases de Alphabet son verdaderas o falsas.',[
  ['Comprar clase C sigue siendo invertir en Alphabet, aunque no tenga voto ordinario.',true],
  ['Dos acciones clase A dan los mismos votos que una acción clase B.',false],
  ['Las letras A, B y C tienen los mismos derechos en todas las empresas.',false],
 ],'La C participa en el negocio, pero no tiene voto ordinario. Dos A suman dos votos, frente a diez de una B. Hay que leer los derechos de cada empresa.');
 const check=order('Revisa la compra antes de enviarla','Quieres Alphabet clase A en Nasdaq y pagar la operación en dólares. Ordena estas comprobaciones antes de enviar la orden.',[
  'Comprobar que la ficha corresponde a Nasdaq y que la operación se expresa en dólares.',
  'Preparar y revisar la orden del instrumento que ya has identificado.',
  'Verificar clase A, ticker GOOGL e ISIN US02079K3059.',
 ],[2,0,1],'Primero identificas la clase; después compruebas dónde y en qué moneda se negocia; finalmente revisas la orden.');
 check.figure=structuredClone(listings);
 const last=activity(choice('Qué compruebas y qué no puedes concluir','Ves Alphabet A en euros y Alphabet C en dólares. Selecciona las dos comprobaciones que necesitas antes de comparar estas fichas.',[
  'Los derechos y el ISIN de cada clase.',
  'Que el número del precio menor demuestra menor valoración de la empresa.',
  'El mercado, la moneda y los costes de cada operación.',
  'Que un ISIN que empieza por US obliga siempre a pagar en dólares.',
 ],0,'Identifica la clase y las condiciones de negociación. Un precio en otra moneda no se compara directamente, y US dentro del ISIN no fija la moneda de tu operación.'),'all',{
  options:['Los derechos y el ISIN de cada clase.','Que el número del precio menor demuestra menor valoración de la empresa.','El mercado, la moneda y los costes de cada operación.','Que un ISIN que empieza por US obliga siempre a pagar en dólares.'],answers:[0,2],instruction:'Selecciona las dos comprobaciones útiles.',
 });
 usePairs(lesson,[
  [learn('Alphabet: misma empresa, clases distintas',body,'Identifica la clase concreta; el nombre de la empresa no basta.',classes),first],
  [learn('La letra describe unos derechos, no una nota','Alphabet también tiene clase B: diez votos por acción y sin cotización pública como A y C. El informe de 2025 explica que las tres clases tienen los mismos derechos a dividendos; la diferencia principal está en el voto. Por tanto, una C no deja de ser participación en el negocio.\n\nLas letras no son una clasificación universal de calidad. En otra empresa, una clase A puede tener condiciones distintas: lee sus documentos antes de decidir.','Comprueba los derechos de cada empresa, sin deducirlos solo de la letra.'),rights],
  [learn('El ISIN identifica; el mercado explica dónde compras','La clase A de Alphabet conserva US02079K3059 tanto en Nasdaq como en su ficha de Borsa Italiana. Lo que cambia es el lugar de negociación y la moneda: dólares en Nasdaq y euros en esa ficha europea. El código US no obliga a que todas las operaciones sean en dólares.\n\nSi quieres Nasdaq, no te basta con encontrar el ISIN: debes comprobar también ese mercado. Una cotización en euros tampoco significa que el negocio subyacente sea diferente.','Separa la identidad del título de las condiciones de su negociación.',listings),check],
  [learn('Un precio menor puede estar en otra moneda','Un importe en euros y otro en dólares no se comparan por el número que muestran. Además, A y C tienen derechos distintos. Antes de confirmar, reúne clase, ISIN, mercado, moneda y costes.\n\nEstas fichas contienen identificadores reales, no precios actuales. En los próximos ejercicios, cuando usemos precios pequeños para practicar órdenes, serán simulaciones explícitas.','Revisa qué compras y cómo lo compras antes de mirar un precio aislado.'),last],
 ]);
 lesson.editorialRevision=IDENTIFICATION_REVISION;
 lesson.practiceContext='real-identification';
 lesson.story.hideDuringPractice=true;
 lesson.sources=sourcesFor(['alphabet25','borsa-a','borsa-c']);
 for(const index of [0,2])lesson.steps[index].sources=sourcesFor(['alphabet25','borsa-a','borsa-c']);
 lesson.steps[4].sources=sourcesFor(['borsa-a']);
}

export function refineRealExamples(result){
 const byId=new Map(result.lessons.map(l=>[l.id,l]));
 identification(byId.get(501));
 for(const [point,slot,key,title,body,figure] of realExamples){
  const lesson=byId.get(point+449),step=lesson?.steps[slot];
  if(point<53||!step||step.type!=='learn')throw Error('Bad real example placement '+point+'/'+slot);
  if(figure&&step.figure)throw Error('Do not replace an existing visual at '+point+'/'+slot);
  const keys=point===491?[key,'prologis']:[key];
  const sources=sourcesFor(keys);
  step.body+='\n\n'+title+'. '+body;
  step.sources=sources;
  step.realExample={title,sourceKeys:keys,period:sources.map(s=>s.period).join(' / ')};
  lesson.practiceContext='simulation';
  if(figure)step.figure=structuredClone(figure);
  lesson.summary=lesson.steps[0].body;
  lesson.sources=[...(lesson.sources||[]),...sources].filter((s,i,a)=>a.findIndex(t=>t.url===s.url)===i);
 }
 const used=result.lessons.flatMap(l=>l.sources||[]);
 result.sources=[...(result.sources||[]),...used].filter((s,i,a)=>a.findIndex(t=>t.url===s.url)===i);
 return result;
}
