import {text as a} from './depth/053-100.mjs';
import {text as b} from './depth/101-150.mjs';
import {text as c} from './depth/151-200.mjs';
import {text as d} from './depth/201-250.mjs';
import {text as e} from './depth/251-300.mjs';
import {text as f} from './depth/301-350.mjs';
import {text as g} from './depth/351-400.mjs';
import {text as h} from './depth/401-450.mjs';
import {text as i} from './depth/451-500.mjs';
import {table} from './helpers.mjs';

export const FIRST_DEPTH_POINT=53;
export const depthGuides=Object.fromEntries([a,b,c,d,e,f,g,h,i].flatMap(block=>block.trim().split(/\r?\n/)).map(line=>{
 const [point,...paragraphs]=line.split('¦');
 if(!/^\d+$/.test(point)||paragraphs.length!==3||paragraphs.some(p=>p.trim().split(/\s+/).length<20))throw Error('Incomplete individual explanation: '+point);
 return [Number(point),paragraphs];
}));
if(Object.keys(depthGuides).length!==448||Array.from({length:448},(_,i)=>i+53).some(p=>!depthGuides[p]))throw Error('Every point 53–500 needs its own teaching development.');

// A worked illustration is selected for concepts whose abstraction benefits
// from a small example. Investigation/checklist points do not get one by recipe.
export const illustratedPoints=new Set([
 53,54,55,57,58,62,65,66,67,69,73,76,77,81,83,84,85,86,89,
 91,92,93,95,96,98,99,101,102,103,104,105,106,107,108,109,
 113,115,116,117,122,124,125,126,127,128,131,132,133,134,135,136,137,138,139,
 141,143,144,145,146,147,148,149,151,152,153,154,155,156,157,158,159,
 161,162,163,164,165,166,167,168,169,172,174,176,177,178,
 181,182,183,185,187,188,191,192,193,194,195,197,199,
 201,202,203,204,205,206,207,208,209,211,212,213,214,216,217,218,
 221,222,223,224,225,226,227,228,233,234,238,242,243,245,246,247,248,249,
 251,252,254,258,259,261,262,263,264,265,267,269,273,275,276,277,278,279,
 281,282,283,284,285,286,287,288,291,292,293,294,295,296,297,298,
 302,303,304,305,306,307,308,312,313,314,315,316,317,318,319,
 322,325,326,327,328,332,333,335,337,342,343,344,345,
 352,353,354,355,356,357,358,361,362,363,364,365,366,367,368,369,
 372,374,375,378,383,384,386,387,388,391,392,393,394,395,396,397,398,399,
 401,402,403,404,405,406,407,411,412,413,414,415,416,417,
 421,423,424,425,426,428,431,432,433,434,435,436,437,439,
 441,442,443,444,445,446,447,448,449,451,452,453,454,455,456,457,458,459,
 461,462,463,464,465,466,467,468,469,471,473,474,475,476,477,478,479,
 481,483,484,485,486,487,488,489,492,493,494,495,496,497,
]);
const normal=s=>s.normalize('NFKC').replace(/\*\*/g,'').replace(/\s+/g,' ').trim().toLocaleLowerCase('es');
const segmenter=new Intl.Segmenter('es',{granularity:'sentence'});
const sentences=text=>[...segmenter.segment(text)].map(s=>s.segment.trim()).filter(Boolean);
const sharedSentence=(text,other)=>sentences(text).some(s=>s.split(/\s+/).length>=8&&other.some(body=>normal(body).includes(normal(s))));
function clearLanguage(text){
 return text
 .replace(/\ben 1 años\b/g,'en 1 año').replace(/\bdurante 1 años\b/g,'durante 1 año')
 .replace(/riesgo de contraparte/g,'riesgo de que la otra parte del contrato incumpla')
 .replace(/las obligaciones prioritarias/g,'las obligaciones que deben pagarse antes')
 .replace(/Construye daño supuesto, cobertura y cesión por reaseguro antes de comparar recursos; conserva también incertidumbre de recuperar lo cedido\./g,'Plantea un daño posible, revisa qué cubren las pólizas y qué parte asumiría el reasegurador. Después compáralo con los recursos disponibles y estudia si se recuperará el dinero previsto del reaseguro.')
 .replace(/La exposición no es la pérdida retenida\./g,'El importe expuesto a un daño no es necesariamente lo que la aseguradora acabará pagando por su cuenta.');
}
const uniqueParagraphs=(body,extras)=>{
 let result=body;
 for(const text of extras)if(text&&!normal(result).includes(normal(text)))result+='\n\n'+text;
 return result;
};
const source=(title,url,period)=>({title,url,period,checkedAt:'2026-10-13'});
const msft=source('Microsoft · informe anual 2025: resultados y políticas de ingresos','https://www.microsoft.com/investor/reports/ar25/index.html','Ejercicio terminado el 30 de junio de 2025');
const visa=source('Visa · informe anual 2025: funciones y tarifas de la red','https://www.sec.gov/Archives/edgar/data/1403161/000140316125000089/v-20250930.htm','Ejercicio terminado el 30 de septiembre de 2025');
const prologis=source('Prologis · informe anual 2024: actividad inmobiliaria','https://ir.prologis.com/financials/annual-reports/content/0000950170-25-021272/0000950170-25-021272.pdf','Ejercicio terminado el 31 de diciembre de 2024');
const flow=(caption,items)=>({kind:'flow',caption,items});
export const depthFigures={
 53:flow('Qué hace una orden a mercado: esquema explicativo, sin precios reales.', ['Envías una cantidad que quieres comprar o vender.','La orden utiliza ofertas disponibles al llegar al mercado.','El registro muestra las cantidades y los precios realmente ejecutados.']),
 58:flow('Cómo leer el cambio de moneda: esquema del coste.', ['Identifica moneda e importe que entregas.','Aplica el cambio en la dirección correcta y los cargos correspondientes.','Compara el importe neto recibido en la misma moneda final.']),
 91:flow('Los tres componentes que explican ventas: esquema conceptual.', ['Cantidad: cuántas unidades se venden.','Precio: cuánto se cobra por cada unidad comparable.','Mezcla: qué productos forman las ventas y con qué peso.']),
 102:flow('Primer escalón de una cuenta de resultados simplificada.', ['Empieza por las ventas del periodo.','Resta el coste correspondiente a esas ventas.','Obtienes beneficio bruto; aún faltan otros gastos.']),
 122:table(['Hecho','Pregunta que responde'],[['Servicio prestado','¿Se cumplen las condiciones para reconocer ingreso?'],['Factura emitida','¿Qué importe se solicita al cliente?'],['Dinero recibido','¿Cuándo entró efectivo en la cuenta?']],'Hechos distintos: su calendario depende del contrato y la política contable; no es una cuenta de una empresa real.'),
 131:table(['Parte del balance','Qué representa'],[['Activos','Recursos registrados de la empresa'],['Pasivos','Obligaciones registradas'],['Patrimonio neto','Diferencia contable entre activos y pasivos']],'Mapa conceptual del balance. No confundir patrimonio neto con caja disponible.'),
 143:flow('Cómo conectar beneficio y caja operativa.', ['Parte del beneficio según la conciliación utilizada.','Revisa gastos que no produjeron pagos de ese periodo.','Incorpora cambios de recursos y obligaciones operativas.','Llegas a una medida de caja, no a un segundo beneficio.']),
 151:table(['Momento del ejemplo','Qué ocurre'],[['Entrega del trabajo','Puede reconocerse la venta bajo las condiciones del caso'],['Espera hasta el pago','El cliente sigue debiendo el importe'],['Cobro','Entra dinero y disminuye lo pendiente']],'Esquema de una venta a crédito; no contiene cifras de cuentas reales.'),
 193:flow('Valor de empresa: puente simplificado que requiere una definición.', ['Capitalización: valor bursátil de las acciones consideradas.','Ajusta deuda y caja según su definición y disponibilidad.','Revisa otros derechos o recursos cuando proceda.','Obtienes una medida del negocio completo.']),
 201:table(['Dato de la cuenta','Unidad y alcance'],[['Beneficio atribuible','Euros del periodo que corresponden a las acciones analizadas'],['Acciones utilizadas','Número compatible con periodo y criterio del BPA'],['Beneficio por acción','Euros por acción; no es un dividendo prometido']],'Cómo interpretar las unidades del BPA: tabla explicativa, no datos publicados.'),
 228:table(['Objeto del análisis','Cifras que deben corresponderle'],[['Negocio para sus financiadores','Valor y resultado del mismo conjunto de actividades'],['Propiedad de accionistas','Valor y resultado atribuible a esos propietarios']],'Mapa de coherencia: no combinar derechos diferentes por compartir la misma moneda.'),
 247:flow('Por qué crecer puede utilizar caja operativa.', ['Más actividad puede necesitar más existencias.','Parte de las ventas puede permanecer pendiente de cobro.','Los plazos de proveedores pueden financiar una parte.','El cambio de esa necesidad afecta al flujo del periodo.']),
 259:table(['Característica','Qué debe coincidir entre flujo y tasa'],[['Destinatario','Negocio completo o accionista'],['Moneda','La misma moneda del modelo'],['Inflación','Ambos nominales o ambos reales según el supuesto'],['Tiempo','Periodo y fecha de valoración compatibles']],'Comprobación conceptual antes de descontar; no son tasas actuales de mercado.'),
 278:flow('Antes de obtener un valor por acción.', ['Define qué negocios y recursos has valorado.','Ajusta obligaciones y derechos ajenos a esos accionistas.','Revisa recursos que proceda añadir y que aún no estaban incluidos.','Divide el importe atribuible entre las acciones compatibles.']),
 303:table(['Dato del préstamo','Para qué sirve'],[['Principal pendiente','Qué cantidad debe devolverse'],['Fecha de vencimiento','Cuándo debe estar disponible'],['Intereses y cargos','Qué pagos añade la financiación'],['Recursos confirmados','Cómo se podría atender el calendario']],'Ficha explicativa del préstamo: saldo y capacidad de pago son preguntas diferentes.'),
 355:flow('Un límite productivo no se identifica solo contando máquinas.', ['Sigue qué entra y qué sale de cada etapa.','Localiza la fase que limita entregas útiles.','Separa unidades válidas de defectos o repeticiones.','Evalúa recursos en la fase que realmente restringe el conjunto.']),
 393:table(['Medida','Qué debes leer'],[['Retención de clientes','Cuántos del grupo inicial permanecen'],['Retención de ingresos','Cuánto ingreso conserva ese grupo bajo la definición'],['Expansión y bajas','Qué movimientos componen el resultado neto']],'Mapa explicativo: el porcentaje neto puede ocultar movimientos en sentidos distintos.'),
 402:table(['Magnitud','Significado'],[['Volumen transaccionado','Importe de las operaciones cubiertas por la definición'],['Ingreso del intermediario','Lo que reconoce por prestar su servicio'],['Resultado','Lo que queda tras los costes correspondientes']],'Tres niveles distintos de actividad; no son cuentas inventadas de una compañía real.'),
 413:flow('Etapas de un pago: esquema simplificado, con condiciones según sistema y contrato.', ['Autorización: se decide si se acepta la operación.','Compensación: se organizan datos y obligaciones entre participantes.','Liquidación: se realizan los movimientos de fondos correspondientes.']),
 421:table(['Actividad','Pregunta sobre sus recursos'],[['Diseñar chips','¿Qué desarrollo y derechos tecnológicos necesita?'],['Fabricar chips','¿Qué capacidad, proceso y calidad puede entregar?'],['Suministrar equipos','¿Qué máquinas, tecnología y servicio presta a fabricantes?']],'Funciones del sector: tabla conceptual, sin cifras de empresas reales.'),
 462:table(['Concepto','Qué momento describe'],[['Prima emitida','Contratación bajo el criterio publicado'],['Prima devengada','Cobertura atribuida al periodo'],['Siniestro estimado','Obligación reconocida según las condiciones'],['Pago del siniestro','Salida de dinero cuando se atiende la prestación']],'Contratos, ingresos, estimaciones y pagos: no intercambiar sus fechas o importes sin explicación.'),
 481:table(['Estado del producto','Qué debes estudiar'],[['Comercializado','Acceso, competencia e ingresos bajo las condiciones actuales'],['En desarrollo','Hitos, gasto, plazos e incertidumbre antes de posibles ventas']],'Dos situaciones financieras distintas; no es una valoración clínica de medicamentos.'),
};
export const extraRealExamples=[
 {point:103,slot:0,title:'Microsoft: reconocer los escalones del resultado',body:'Microsoft publicó estas ventas y costes para 2025. Su diferencia es el beneficio bruto: todavía faltan otros gastos. La tabla está en millones de dólares; las cifras grandes sirven para reconocer partidas, mientras practicarás la lógica con importes pequeños.',source:msft,figure:table(['Partida del informe de Microsoft','2025 · millones de USD'],[['Ingresos','281.724'],['Coste de ingresos','87.831'],['Beneficio bruto: diferencia de las dos partidas','193.893']],'Extracto seleccionado y traducido de las cuentas reales de Microsoft 2025; la diferencia coincide con el margen bruto publicado. No es una simulación.')},
 {point:127,slot:0,title:'Microsoft: operativo y neto son escalones diferentes',body:'En 2025 Microsoft publicó 128.528 millones de dólares de resultado operativo y 101.832 millones de beneficio neto. Son cantidades del mismo año con distinto alcance; leer el segundo importe no sustituye entender cómo se llega desde el primero.',source:msft,figure:table(['Partida publicada','2025 · millones de USD'],[['Resultado operativo','128.528'],['Beneficio neto','101.832']],'Dos subtotales reales de Microsoft, ejercicio 2025. No atribuyas toda su diferencia a una sola partida.')},
 {point:152,slot:0,title:'Microsoft: facturar y ganar el ingreso en fechas distintas',body:'Microsoft explica en su informe de 2025 que determinados contratos se facturan al inicio y sus ingresos se reconocen a lo largo de la cobertura. Ese mecanismo muestra por qué facturar por adelantado no equivale a haber prestado ya todo el servicio.',source:msft},
 {point:412,slot:0,title:'Visa: la red no es el banco que presta',body:'Visa señala en su informe de 2025 que no emite tarjetas ni concede crédito a sus titulares. Participa en la red de pagos; el banco emisor tiene otra función. Reconocerlas evita atribuir a Visa los préstamos asociados a una tarjeta que lleva su marca.',source:visa},
 {point:415,slot:0,title:'Visa: el cargo del comercio no es íntegramente ingreso de la red',body:'Visa explica que sus tarifas a participantes se determinan de forma independiente de las comisiones de intercambio y de los cargos que el adquirente fija al comercio. Analizar sus ingresos exige separar esos conceptos; todo el coste del comercio no corresponde a Visa.',source:visa},
 {point:471,slot:0,title:'Prologis: conservar inmuebles y cobrar su utilización',body:'Prologis describe en su informe de 2024 la actividad de alquiler, gestión y desarrollo de inmuebles logísticos. Una nave que se conserva para alquilar genera un recorrido de cobros diferente de otra que se desarrolla para vender; el modelo concreto determina qué debes proyectar.',source:prologis},
];
const coreDevelopments={
 103:'El margen bruto indica qué parte de las ventas queda después de pagar el coste de los productos o servicios vendidos. Se calcula dividiendo beneficio bruto entre ventas y multiplicando por 100. No es una cantidad en euros: es un porcentaje.\n\nSirve para comparar negocios de tamaños diferentes. Una empresa puede tener más beneficio bruto en euros y, aun así, quedarse con una parte menor de cada euro vendido que otra más pequeña.\n\nTodavía faltan otros gastos para llegar al beneficio final. Además, antes de comparar empresas hay que revisar que ambas incluyan costes semejantes en el coste de ventas. Si clasifican una partida de forma diferente, el porcentaje necesita ese contexto.',
 171:'La empresa debe decidir qué hacer con el dinero que puede utilizar: mantener el negocio, invertir para crecer, comprar otra empresa, reducir deuda o repartir fondos a sus propietarios. Cada opción compite por los mismos recursos.\n\nAntes de elegir, separa lo realmente sobrante de lo que ya hará falta para pagar facturas, devolver un préstamo o sustituir un equipo. Ver dinero en el banco no significa que todo esté libre para cualquier uso.\n\nDespués compara las alternativas por lo que cuestan, lo que podrían aportar y cuándo lo harían. Un proyecto con una ganancia esperada alta puede no encajar si deja sin recursos un pago próximo. La decisión debe mirar rendimiento, riesgo y calendario juntos.',
 180:'Elegir un uso para el dinero exige comparar alternativas concretas. No basta con decir que crecer es bueno o que repartir siempre beneficia al accionista: importa cuánto se entrega, qué se espera recibir y qué riesgo se asume.\n\nPrimero identifica pagos e inversiones necesarios para mantener el negocio. Con el resto, estudia las oportunidades disponibles: reinvertir, reducir deuda, adquirir otro negocio o devolver fondos a propietarios, según las condiciones del caso.\n\nExplica por qué una opción encaja mejor y qué información podría cambiar esa prioridad. El objetivo no es adivinar una rentabilidad exacta, sino decidir con recursos, compromisos y supuestos visibles.',
};

export function refineDepthTeaching(result,records){
 for(const lesson of result.lessons.filter(l=>l.id>=502)){
  const point=lesson.id-449,r=records[point-1],guides=depthGuides[point];
  if(!guides||!r)throw Error('Missing expanded teaching '+point);
  const intro=lesson.steps[0],otherTeaching=lesson.steps.slice(1).filter(s=>s.type==='learn').map(s=>s.body);
  if(coreDevelopments[point])intro.body=coreDevelopments[point];
  if(point===103)intro.takeaway='El margen bruto mide qué parte de las ventas queda después del coste de ventas.';
  const clarification=(coreDevelopments[point]?[]:[r.meaning,r.limit]).filter(t=>!normal(intro.body).includes(normal(t))&&!sharedSentence(t,otherTeaching));
  const context=clarification.join(' ');clarification.length=0;if(context)clarification.push(context);
  if(illustratedPoints.has(point)&&!intro.realExample&&!normal(intro.body).includes(normal(r.example))&&!sharedSentence(r.example,otherTeaching))clarification.push('Ejemplo ficticio, con cifras simplificadas: '+r.example);
  intro.body=uniqueParagraphs(clearLanguage(intro.body),clarification.map(clearLanguage));
  for(let j=0;j<3;j++){
   const step=lesson.steps[(j+1)*2];
   const otherBodies=lesson.steps.filter((s,k)=>s.type==='learn'&&k!==(j+1)*2).map(s=>s.body);
   const developed=sentences(guides[j]).filter(s=>!sharedSentence(s,otherBodies)).join(' ');
   step.body=uniqueParagraphs(clearLanguage(step.body),[developed]);
   // Preserve each original numerical method and visual. The final paragraph
   // develops its meaning and the concrete documentation, rather than padding.
   step.takeaway=clearLanguage(step.takeaway);
  }
  lesson.summary=intro.body;
  const words=lesson.steps.filter(s=>s.type==='learn').reduce((n,s)=>n+s.body.split(/\s+/).length,0);
  lesson.minutes=Math.max(lesson.minutes,Math.ceil(words/160+2));
  if(depthFigures[point]&&!intro.figure)intro.figure=structuredClone(depthFigures[point]);
 }
 for(const item of extraRealExamples){
  const lesson=result.lessons.find(l=>l.id===item.point+449),step=lesson.steps[item.slot];
  if(step.type!=='learn'||step.realExample)throw Error('Duplicate or misplaced real example '+item.point);
  step.body+='\n\n**Ejemplo real · '+item.title+'.** '+item.body;
  step.sources=[...(step.sources||[]),item.source];
  step.realExample={title:item.title,period:item.source.period,sourceKeys:[]};
  lesson.sources=[...(lesson.sources||[]),item.source].filter((s,i,a)=>a.findIndex(t=>t.url===s.url)===i);
  lesson.practiceContext='simulation';
  if(item.figure){if(step.figure)throw Error('Do not replace the retained visual '+item.point);step.figure=structuredClone(item.figure);}
  lesson.summary=lesson.steps[0].body;
 }
 result.sources=[...(result.sources||[]),...extraRealExamples.map(e=>e.source)].filter((s,i,a)=>a.findIndex(t=>t.url===s.url)===i);
 return result;
}
