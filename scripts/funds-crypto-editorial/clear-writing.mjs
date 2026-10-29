import {text as etfsText} from './etfs-clear-intros.mjs';
import {text as cryptoText} from './crypto-clear-intros.mjs';
import {readableParagraphs} from '../stocks-editorial/clear-writing.mjs';

const parse=(text,total)=>{
 const result=Object.fromEntries(text.trim().split(/\r?\n/).map(line=>{
  const [point,body]=line.split('¦');
  if(!/^\d+$/.test(point)||!body)throw Error('Incomplete ETF/Cripto opening: '+line);
  return [Number(point),body];
 }));
 if(Object.keys(result).length!==total||Array.from({length:total},(_,i)=>i+1).some(p=>!result[p]))throw Error('Missing ETF/Cripto opening');
 return result;
};
export const clearOpenings={etfs:parse(etfsText,200),crypto:parse(cryptoText,300)};
const segmenter=new Intl.Segmenter('es',{granularity:'sentence'});

// Replace entire reviewed phrases, never technical words without context.
// All work is restricted to learn.body; grading and exercise feedback are intact.
const phrases=[
 ['El error de seguimiento mide cuánto varían las diferencias de rentabilidad entre ETF e índice a lo largo del tiempo.','El error de seguimiento, o tracking error, mide si la diferencia de rentabilidad entre el ETF y su índice cambia mucho de un periodo a otro.'],
 ['No es la misma cosa que su diferencia acumulada final. Una diferencia constante puede ser pequeña en variabilidad aunque reste rentabilidad de forma regular.','Un ETF puede quedar siempre un poco por debajo del índice y seguirlo de forma regular. Otro puede alternar diferencias grandes y pequeñas. Esta medida estudia esa variación, no cuánto ganó o perdió el fondo en total.'],
 ['El rango del ejercicio no sustituye el cálculo estadístico del error de seguimiento.','En estos ejercicios, el rango es la distancia entre la mayor y la menor diferencia de seguimiento observada. Ayuda a visualizar la variación, pero no equivale al cálculo estadístico del tracking error.'],
 ['La siguiente situación cambia el contexto. Relaciona sus hechos con el mecanismo explicado: una descripción del funcionamiento no promete un resultado.','En el siguiente ejercicio aplicarás esta idea a un caso concreto. Distingue lo que sus datos permiten afirmar de lo que todavía no se puede asegurar.'],
 ['Para contrastar una interpretación necesitas información sobre la causa que propone. Una cifra o una etiqueta pueden ser ciertas y aun así dejar sin responder esa duda concreta.','Para comprobar una explicación, busca datos sobre lo que la causa. Un nombre o una cifra aislada pueden dejar fuera información importante.'],
 ['En el próximo caso cambia una condición importante. Decide si el mecanismo sigue permitiendo la conclusión propuesta: conservar un nombre, una cantidad o un resultado aislado no significa conservar todas las condiciones.','En el siguiente caso cambiará una condición. Comprueba cómo afecta a lo que puedes concluir, aunque el nombre del activo o una cifra sigan siendo iguales.'],
 ['En el ejercicio cambian los datos; conserva el procedimiento, no el resultado.','El ejercicio utiliza cantidades diferentes. Aplica el cálculo explicado; el resultado del ejemplo no sirve como respuesta.'],
 ['Para medir el cambio de poder de compra divide el factor de crecimiento de tu dinero entre el factor de los precios; después resta uno.','Para medir el cambio de poder de compra, compara cuánto ha crecido tu dinero con cuánto han subido los precios. Cada factor es 1 más el porcentaje expresado como decimal: un 10 % de subida equivale a 1,10. Divide el factor de tu dinero entre el de los precios, resta 1 y multiplica por 100 para expresarlo como porcentaje.'],
 ['El riesgo de contraparte es que no cumpla un pago u obligación.','El riesgo de contraparte es que esa entidad no cumpla el pago o la obligación que ha prometido.'],
 ['Compara obligación, garantía utilizable y reglas de valoración.','Compara cuánto se debe con las garantías que realmente se podrían recuperar y cómo se calcula su valor.'],
 ['para los partícipes','para quienes tienen participaciones del fondo'],
 ['contrapartidas disponibles','ofertas de compra o venta disponibles'],
 ['encontrar contrapartida','encontrar a alguien dispuesto a realizar la operación'],
 ['encuentra contrapartida bajo las condiciones de tu orden','encuentra a alguien que acepte las condiciones de tu orden'],
 ['facilita encontrar contrapartida','facilita encontrar compradores y vendedores'],
 ['puede haber menos contrapartidas','puede haber menos compradores y vendedores'],
 ['No puntúes como mejor una orden sin distinguir controlar precio de conseguir ejecución.','Para comparar las órdenes, distingue dos objetivos: respetar un precio y conseguir que se realice la operación. Una orden puede cumplir uno y dejar el otro pendiente.'],
 ['si las cifras son contemporáneas y comparables','si las cifras corresponden al mismo momento y miden lo mismo'],
 ['no resume perfectamente la sensibilidad económica del negocio','no explica por completo cómo afectan los cambios de moneda al negocio'],
 ['no resumen perfectamente la sensibilidad económica del negocio','no explican por completo cómo afectan los cambios de moneda al negocio'],
 ['Distingue moneda contable, moneda de negociación y exposición económica.','Separa la moneda en la que se presentan las cuentas, la que utilizas para comprar y las monedas que afectan al valor de las inversiones.'],
 ['distribuye momentos de entrada','reparte las fechas en que inviertes'],
 ['la expone antes al mercado','hace que participe antes en las subidas y bajadas del mercado'],
 ['Los pesos se desvían','Los porcentajes de cada inversión cambian'],
 ['bloques infraponderados','partes de la cartera que pesan menos de lo previsto'],
 ['Las aportaciones cambian el denominador','Las aportaciones aumentan el total utilizado para calcular los porcentajes'],
 ['Para atribuir un resultado identifica lo que aportó cada bloque durante el periodo.','Para explicar el resultado total, identifica cuánto contribuyó cada parte de la cartera durante el periodo.'],
 ['Sumar contribuciones explica el total bajo esos supuestos','Sumar lo que aporta cada parte explica el total bajo esos supuestos'],
 ['Para una conciliación sencilla suma patrimonio inicial, flujo neto y resultado de inversión bajo datos coherentes.','Para explicar un cambio sencillo, parte del patrimonio inicial, añade las entradas de dinero, resta las salidas y añade la ganancia o pérdida de las inversiones. Todos los datos deben corresponder al mismo periodo y criterio.'],
 ['se realizan activos y distribuye lo que corresponda tras obligaciones y costes','se venden o recuperan los activos y se reparte lo que corresponde después de pagar obligaciones y costes'],
 ['Su actividad facilita encontrar compradores y vendedores.','Su actividad ayuda a que haya compradores y vendedores disponibles.'],
 ['su próxima pérdida','lo que podría perder en el futuro'],
 ['impago técnico o económico','problemas técnicos o económicos que impidan recuperar el dinero'],
 ['La regla matemática no crea reservas seguras por sí sola.','Una fórmula puede definir el ajuste, pero no crea por sí sola recursos seguros con los que pagar a quien quiere salir.'],
 ['una transferencia incompatible','un envío por una red o versión que el destinatario no admite'],
 ['una red disponible no hace solvente a su emisor','que la red funcione no demuestra que el emisor tenga recursos para pagar sus obligaciones'],
 ['La comisión aislada','La comisión por sí sola'],
 ['El porcentaje nominal no garantiza compensación exacta de cada movimiento','El porcentaje de cobertura declarado no garantiza compensar exactamente cada cambio'],
 ['Separa actividad económica y subsidio promocional.','Distingue lo que pagan los usuarios por utilizar el servicio de las recompensas financiadas para atraer participantes.'],
 ['un precio inicial para una cantidad diminuta','el precio inicial calculado para una cantidad muy pequeña'],
 ['la proporción del conjunto','la parte que representas dentro del total'],
 ['Al comparar saldos incluye costes','Al comparar lo que había y lo que queda, incluye los costes'],
 ['Un dato necesita fuente y fecha.','Para interpretar un dato necesitas saber de dónde procede y a qué fecha corresponde.'],
 ['La fecha y la definición permiten interpretar correctamente las cifras publicadas.','Saber a qué fecha corresponde una cifra y cómo se ha calculado permite entender qué describe.'],
 ['las monedas de los activos subyacentes','las monedas de las inversiones que hay detrás del producto'],
 ['las condiciones del subyacente','las condiciones del activo que sirve de referencia'],
 ['la actividad del subyacente','la actividad del activo que sirve de referencia'],
];

// Clarifications are selected where a shortcut is genuinely hard to follow.
// They introduce no new protocol claims, prices, tax rates or exercise data.
const clarifications={
 etfs:{
  25:'El ajuste no significa que desaparezcan acciones. Solo cambia qué parte del tamaño de la empresa utiliza el índice para repartir su peso.',
  43:'Puedes pensar en dos piezas: los activos que el fondo conserva y el compromiso que otra entidad debe cumplir. Ambas necesitan comprobarse; conocer una no explica por sí sola la otra.',
  57:'Compara siempre dos rentabilidades del mismo periodo y con el mismo tratamiento de los ingresos. Si una cifra incluye dividendos y otra no, la resta estaría mezclando formas distintas de medir el resultado.',
  71:'El patrimonio neto es lo que valen los activos después de restar las obligaciones del fondo. Al dividirlo entre las participaciones, repartes ese valor entre todas las unidades existentes.',
  95:'Un punto porcentual significa pasar, por ejemplo, del 3 % al 4 %. No es lo mismo que aumentar el 3 % en un 1 % relativo; utilizar la unidad equivocada cambiaría la estimación.',
  115:'Un factor expresa cuánto queda por cada unidad inicial. Un factor 1,10 significa que 1 pasa a 1,10; uno de 0,95 significa que pasa a 0,95. Multiplicar ambos sigue los dos cambios sucesivos.',
  167:'La regla debe decir qué diferencia estás midiendo. Alejarse cinco puntos porcentuales del peso objetivo y alejarse un cinco por ciento de ese peso producen límites distintos.',
  172:'Cada tramo empieza con el capital que hay después del movimiento correspondiente. Enlazar los factores significa multiplicarlos para seguir el recorrido completo; sumar sus porcentajes ignoraría el efecto acumulado.',
  173:'El dinero que entra antes participa durante más tiempo que el que llega al final. Por eso esta medida necesita fechas e importes, y no solo la ganancia final y la suma aportada.',
  175:'Una inversión que pesa poco puede influir menos en el total aunque suba mucho. La contribución combina cuánto dinero dependía de ella con el rendimiento que tuvo en el periodo.',
  185:'La base cambia después de cada día: la siguiente variación se aplica al saldo que queda, no al dinero del principio. Ese recorrido explica por qué un objetivo diario no se traslada directamente a varios meses.',
 },
 crypto:{
  28:'Una operación puede haber entrado en un bloque y necesitar todavía la comprobación o la espera prevista por esa red. El estado debe leerse con sus reglas, sin trasladar automáticamente las de otra.',
  45:'Separa el recurso utilizado y su precio. La cantidad de trabajo y la tarifa aplicada ayudan a explicar el coste, mientras que el importe transferido responde a otra pregunta.',
  75:'La valoración totalmente diluida suele abreviarse FDV. Antes de compararla con la capitalización actual, comprueba qué cantidad de unidades ha usado cada cálculo y cuándo podrían estar disponibles.',
  95:'Pregunta si el pago sale de recursos que alguien ha entregado por un servicio o de aumentar el número de unidades. Recibir tokens puede parecer igual en la cuenta y tener un origen económico diferente.',
  111:'Paridad significa coincidir con la referencia elegida. Perderla significa alejarse de ella; no demuestra por sí solo ni una pérdida definitiva ni una recuperación segura.',
  124:'La base es el importe sobre el que se aplica el porcentaje. Una comisión sobre recompensas no se calcula como otra sobre todo el capital, aunque las dos utilicen el mismo porcentaje.',
  137:'Son dos comparaciones distintas: cuánto queda frente al inicio y cuánto queda frente a haber conservado los activos. Una posición puede subir en euros y aun así terminar por debajo de la segunda alternativa.',
  144:'LTV es la abreviatura de la relación entre préstamo y valor de la garantía. El límite para pedir más y el que permite liquidar no tienen por qué coincidir; utiliza el definido en el caso.',
  154:'Que una prueba compruebe un resultado no implica que compruebe todo el servicio. Las actualizaciones, el orden de operaciones y los mecanismos de salida pueden depender de componentes adicionales.',
  167:'TVL es la abreviatura habitual de valor total bloqueado. Antes de interpretar su crecimiento, separa depósitos nuevos, variación de precios y recursos que puedan aparecer contabilizados en más de un lugar.',
  178:'Una dependencia común puede afectar a varios tokens a la vez. El reparto debe estudiarse por las causas que comparten, además de por los nombres o sectores con los que se presentan.',
  295:'Una comprobación de ciertas reservas en una fecha no equivale a revisar todas las cuentas y obligaciones futuras. El alcance del informe indica qué pregunta ayuda a responder y qué dudas siguen abiertas.',
 }
};

export function refineFundsCryptoClearWriting(result,track){
 const start=track==='etfs'?950:1150,openings=clearOpenings[track];
 if(!openings)throw Error('Unknown clarity track '+track);
 for(const lesson of result.lessons){
  const point=lesson.id-start+1;
  // The foundation already defines the full concept. Rewrite the duplicated
  // opening of the application screen, retaining the foundation before its
  // first question so no protocol fact or prerequisite moves behind a quiz.
  const application=lesson.steps.findIndex(s=>s.type==='learn'&&s.title==='Aplicar el mecanismo');
  for(const [index,step] of lesson.steps.entries()){
   if(step.type!=='learn')continue;
   const old=step.body;let body=old;
   if(index===application){
    const first=[...segmenter.segment(body)][0].segment;
    body=openings[point]+' '+body.slice(first.length).trimStart();
   }else if(application<0&&index===0){
    // First-world openings individually retain their original concepts,
    // including the bank claim and the definition of a portfolio.
    const first=[...segmenter.segment(body)][0].segment;
    body=openings[point]+' '+body.slice(first.length).trimStart();
   }
   for(const [from,to] of phrases)body=body.replaceAll(from,to);
   if(index===0&&clarifications[track][point])body+='\n\n'+clarifications[track][point];
   step.body=readableParagraphs(body);
   if(index===0&&lesson.summary===old)lesson.summary=step.body;
  }
 }
 return result;
}
