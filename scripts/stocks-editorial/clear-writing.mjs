import {introductions} from './clear-writing-intros.mjs';

export const clearIntroductions=Object.fromEntries(introductions.trim().split(/\r?\n/).map(line=>{
 const [point,text]=line.split('¦');
 if(!/^\d+$/.test(point)||!text)throw Error('Incomplete clear introduction: '+line);
 return [Number(point),text];
}));
if(Object.keys(clearIntroductions).length!==451||Array.from({length:451},(_,i)=>i+50).some(p=>!clearIntroductions[p]))throw Error('Missing individual introduction in points 50–500');

const segmenter=new Intl.Segmenter('es',{granularity:'sentence'});
const sentences=text=>[...segmenter.segment(text)].map(x=>x.segment);
// Split on sentence boundaries only. A bold span may cover several sentences;
// keep that span together so the existing rich-text renderer can still read it.
export function readableParagraphs(body){
 return body.split(/\n\s*\n/).map(paragraph=>{
  if(paragraph.length<=420)return paragraph;
  const pieces=[];let current='';
  for(const sentence of sentences(paragraph)){
   const balanced=((current.match(/\*\*/g)||[]).length%2)===0;
   if(current.trim().length>=170&&current.length+sentence.length>350&&balanced){pieces.push(current.trimEnd());current='';}
   current+=sentence;
  }
  if(current.trim())pieces.push(current.trimEnd());
  return pieces.join('\n\n');
 }).join('\n\n');
}

// Each replacement is a complete, reviewed expression. Do not substitute
// financial words mechanically: e.g. "clientes" may mean people or receivables.
const language=[
 ['Un porcentaje calculado al comprar puede quedar desactualizado. Para hablar de concentración hoy, numerador y total deben proceder de la misma fecha.','El peso que tenía una inversión cuando la compraste puede haber cambiado. Para calcular su peso hoy, usa su valor actual y el de la cartera en la misma fecha.'],
 ['Para identificar exposición compartida, sigue quién compra y qué impulsa los ingresos.','Para detectar riesgos compartidos, investiga quién compra a cada empresa y de qué depende que siga haciéndolo.'],
 ['La exposición geográfica sigue clientes y operaciones.','Los riesgos de un país dependen de los clientes y de las actividades que tiene allí la empresa.'],
 ['Combina peso individual y exposición del resto a la causa.','Mira qué peso tiene esa inversión y qué otras inversiones podrían verse afectadas por el mismo problema.'],
 ['La diversidad de nombres no prueba ausencia de exposición común.','Tener empresas con nombres distintos no demuestra que sus riesgos sean independientes.'],
 ['Para entender la exposición hay que mirar qué contiene y con qué pesos.','Para entender sus riesgos, comprueba qué inversiones contiene y cuánto pesa cada una.'],
 ['Un acumulado contiene meses anteriores. Para aislar un trimestre, resta el acumulado previo y conserva la misma definición en ambas cifras.','Una cifra acumulada incluye los meses anteriores. Para saber qué ocurrió solo en el último trimestre, resta el acumulado anterior, utilizando cifras que midan lo mismo.'],
 ['Recurrencia no significa permanencia garantizada.','Que un ingreso se repita no garantiza que el cliente vaya a seguir pagando siempre.'],
 ['Compara ventas, beneficios y recursos de cada división con un perímetro común.','Compara las ventas, los beneficios y los recursos de cada división incluyendo las mismas actividades en cada cifra.'],
 ['Las piezas deben ser compatibles. Un canal, una promesa de servicio y una estructura de costes pueden hacer inviable un relato que parece atractivo al mirar solo ingresos.','Las partes del negocio deben encajar. Prometer una entrega rápida puede exigir un canal y unos costes que las ventas no alcanzan a cubrir, aunque el ingreso por sí solo parezca atractivo.'],
 ['El crecimiento propio requiere mantener actividades comparables. Restar ventas adquiridas ayuda a evitar atribuir a clientes antiguos una expansión del perímetro.','Para estudiar el negocio anterior, compara las mismas actividades. Separa las ventas de empresas recién compradas: sumarlas no demuestra que los clientes anteriores estén comprando más.'],
 ['Medir a moneda constante busca aislar actividad.','Medir a moneda constante intenta separar el cambio del negocio del efecto de convertir sus cifras entre monedas.'],
 ['Localizar contribuciones permite explicar el total sin suponer que todas las partes mejoraron.','Saber cuánto aportó cada parte permite explicar el total sin dar por hecho que todas mejoraron.'],
 ['La definición del mercado cambia el denominador.','El mercado que eliges determina el total con el que comparas las ventas de la empresa.'],
 ['Reconstruye un puente de ventas con componentes compatibles. Después vincula cada tramo con datos de actividad para explicar el aumento, además de cuadrarlo.','Explica paso a paso cómo se llega de las ventas anteriores a las actuales. Separa cada causa sin contarla dos veces y busca datos que permitan comprobar su aportación.'],
 ['Un cambio de mezcla modifica el margen agregado aunque cada producto conserve precio y coste.','Si cambia la proporción de productos vendidos, puede cambiar el margen del conjunto aunque el precio y el coste de cada producto sigan iguales.'],
 ['Reconciliar ambos con ventas permite identificar la causa del cambio operativo.','Relacionar esos gastos con las ventas ayuda a explicar por qué cambió el beneficio operativo.'],
 ['Una pérdida de contribución relativamente pequeña puede absorber buena parte del beneficio existente.','Una pequeña reducción de lo que dejan las ventas después de sus costes variables puede consumir gran parte del beneficio, porque los costes fijos siguen ahí.'],
 ['Las métricas deben ser compatibles con la causa de ventaja que se afirma.','Los datos deben comprobar la ventaja que se afirma: por ejemplo, si se habla de fidelidad, hay que estudiar si los clientes permanecen.'],
 ['Revisa políticas y reconciliación con las cuentas. La diferencia de clasificación puede explicar un margen distinto sin demostrar mejor economía.','Revisa cómo clasifica la empresa sus gastos y cómo encajan las cifras con sus cuentas. Un margen distinto puede deberse a esa presentación, sin que el negocio gane más.'],
 ['Operación, financiación e impuestos explican escalones distintos. Localizar una caída exige identificar en cuál apareció antes de atribuirla al negocio.','El funcionamiento del negocio, sus intereses y sus impuestos afectan a pasos distintos de la cuenta. Para explicar una caída del resultado, identifica primero dónde se produjo.'],
 ['Desglosa antigüedad, plazos e impagos.','Separa las facturas por cuánto tiempo llevan pendientes, cuándo debían cobrarse y cuáles no se han pagado al vencer.'],
 ['El vencimiento convierte una cifra agregada en necesidades de efectivo por fecha.','Las fechas de vencimiento permiten saber cuánto dinero hará falta en cada momento, además del total que se debe.'],
 ['Une conversión de activos y calendario de obligaciones. Estudiar fechas permite pasar del balance agregado a una evaluación concreta de liquidez.','Compara cuándo se podrían convertir los activos en dinero con las fechas de los pagos. Así podrás estudiar si hay efectivo a tiempo, además de leer el total del balance.'],
 ['La reconciliación necesita además diferencias entre ventas y cobros u otros movimientos operativos.','Para completar el paso de beneficio a caja, también debes considerar ventas todavía no cobradas y otros movimientos de la actividad.'],
 ['Los clientes pendientes pueden absorber caja aunque el beneficio crezca.','Las ventas pendientes de cobro pueden dejar al negocio con menos efectivo disponible aunque su beneficio aumente.'],
 ['Mantén separados el ajuste de reconciliación y los cobros realmente recibidos.','Distingue el ajuste que explica la diferencia contable del dinero que realmente se cobró.'],
 ['Un aumento de clientes significa que más ventas siguen sin llegar a caja. La reconciliación utiliza la variación, no todo el saldo final.','Si aumenta el saldo de clientes pendientes de cobro, más dinero vendido sigue sin cobrarse. Para explicar el cambio de caja usa el aumento de ese saldo, no todo lo pendiente al final.'],
 ['Una venta de activos no equivale a caja recurrente de clientes.','El dinero de vender un activo no es lo mismo que el dinero que entra habitualmente por cobrar a los clientes.'],
 ['La reconciliación parte del saldo inicial. Entradas y salidas netas de cada actividad deben explicar el saldo final bajo el mismo perímetro.','Empieza por el dinero que había al principio. Añade las entradas y resta las salidas de las mismas actividades incluidas en las cuentas hasta explicar el saldo final.'],
 ['La antigüedad contable puede alterar la base. Activos más depreciados reducen el denominador aunque sigan prestando un servicio parecido.','Los años de uso pueden reducir el valor contable de los activos por la depreciación. Al dividir el beneficio entre un valor menor, el ROA puede aumentar aunque los equipos sigan prestando un servicio parecido.'],
 ['Explicita qué financiación y caja entran en la base.','Explica qué financiación y qué efectivo incluye el capital que utilizas en el cálculo.'],
 ['El numerador no representa necesariamente dinero disponible para repartir a accionistas.','El beneficio operativo utilizado en la división no es necesariamente efectivo disponible para repartir a los accionistas.'],
 ['Tratar arrendamientos de forma distinta altera comparación de múltiplos. Numerador y resultado deben reflejar el mismo criterio de inclusión de esos pagos.','Tratar de forma distinta los alquileres cambia la comparación de múltiplos. El valor utilizado y el resultado con el que lo comparas deben considerar esos pagos con el mismo criterio.'],
 ['Esa trazabilidad evita tanto omisiones como duplicaciones en el puente de valoración.','Seguir cada partida permite pasar de un valor a otro sin dejar obligaciones fuera ni descontar lo mismo dos veces.'],
 ['El puente separa derechos sobre el negocio.','Los pasos entre valor del negocio y valor de las acciones separan lo que corresponde a cada financiador.'],
 ['Total y precio unitario tienen unidades distintas. Conservar euros en el puente y euros por acción al final ayuda a detectar mezclas de alcance.','El valor total se expresa en euros; el valor de cada acción, en euros por acción. Primero calcula el total de los accionistas y después divídelo entre sus acciones: así no mezclas las dos cantidades.'],
 ['El denominador aumenta cuando se crean acciones para otros propietarios.','Al crearse acciones para otros propietarios, aumenta el total entre el que divides tus acciones.'],
 ['No basta con aumentar el denominador si esa conversión también cambia el resultado atribuible.','No basta con añadir acciones si la conversión también cambia el beneficio que corresponde a sus propietarios.'],
 ['El mejor año aumenta el denominador y baja el PER.','El beneficio elevado del mejor año hace bajar el PER, porque divides el precio entre una cifra mayor.'],
 ['Una pequeña variación del denominador altera mucho el resultado.','Un cambio pequeño del beneficio utilizado en la división puede modificar mucho el resultado.'],
 ['Deuda, caja y otros derechos alteran el numerador. Una ratio aparentemente parecida puede haber sido construida con perímetros diferentes.','La deuda, el efectivo y otros derechos modifican el valor de empresa que utilizas en la división. Dos múltiplos parecidos pueden incluir actividades u obligaciones distintas.'],
 ['Un resultado anual de otro perímetro puede distorsionar un múltiplo bien calculado.','Un resultado anual que incluya otras actividades puede distorsionar un múltiplo aunque la división esté bien hecha.'],
 ['Revisa duración, perímetro y criterios de cálculo.','Revisa la duración del periodo, las actividades incluidas y cómo se ha calculado cada cifra.'],
 ['Una etiqueta excepcional necesita respaldo en naturaleza y recurrencia.','Para llamar excepcional a un gasto, hay que explicar de dónde viene y por qué no se espera que se repita.'],
 ['Busca una referencia coherente con la moneda y el horizonte del flujo; elegir el porcentaje menor no la hace más adecuada.','Busca una referencia para la misma moneda y un plazo adecuado al dinero que valoras. Escoger la tasa más baja no la convierte en la más apropiada.'],
 ['La diferencia de tasas está en el denominador.','En esta fórmula divides entre la diferencia de la tasa de descuento y la de crecimiento.'],
 ['Al modificar una tasa, vuelve a calcular el denominador completo. Un punto puede cambiar mucho el resultado.','Al cambiar una tasa, calcula otra vez la diferencia entre descuento y crecimiento. Un punto porcentual puede modificar mucho el valor obtenido.'],
 ['Mantener el crecimiento igual permite aislar el margen.','Mantener el mismo crecimiento permite ver qué cambia únicamente por el margen.'],
 ['La conciliación debe mostrar cuánto se elimina y por qué se considera no recurrente.','La explicación del ajuste debe mostrar qué importe se excluye y por qué no se espera que se repita.'],
 ['El perímetro y los contratos determinan qué recursos y obligaciones pasan realmente al comprador.','Las actividades incluidas en la compra y sus contratos determinan qué recursos y obligaciones recibe realmente el comprador.'],
 ['El atractivo comercial necesita comprobarse dentro del perímetro adquirido.','La oportunidad comercial debe comprobarse en los negocios y derechos que realmente se compran.'],
 ['El ajuste de deuda viene después de revisar ese perímetro; restarla no corrige una duplicación de activos.','Antes de ajustar la deuda, revisa qué incluye cada bloque. Restar deuda no corrige haber contado dos veces el mismo activo.'],
 ['Las etiquetas de sectores no muestran todos los vínculos.','Los nombres de los sectores no muestran todas las dependencias compartidas.'],
 ['El calendario de exposición','El tiempo durante el que el dinero queda invertido'],
 ['calendario de exposición','tiempo durante el que el dinero queda invertido'],
 ['El stock','Los productos almacenados'],
 ['stock reciente','mercancía reciente'],
 ['convierte stock en caja','convierte los productos sin vender en dinero'],
 ['Descompón las dos causas','Separa las dos causas'],
 ['contribución incremental','lo que aportan las operaciones nuevas después de sus costes asociados'],
 ['La tasación bruta','La valoración del inmueble antes de descontar obligaciones'],
 ['tasación bruta','valoración del inmueble antes de descontar obligaciones'],
 ['El puente de crecimiento debe identificar compras, precios, unidades y moneda.','El desglose del crecimiento debe explicar qué viene de adquirir empresas, cambiar precios, vender unidades o convertir monedas.'],
 ['cuadrar el puente','comprobar que los pasos explican el cambio total'],
];

const fullerScreens={
 '50/3':'Los riesgos pueden sumarse. Si una empresa pierde un cliente importante justo cuando debe devolver un préstamo, puede recibir menos dinero en el momento en que más lo necesita.\n\nEse problema también puede afectarte a ti si has invertido gran parte de tus ahorros en ella y necesitas vender pronto. Por eso conviene estudiar juntos el negocio, sus deudas y tu situación.',
 '50/7':'Describe qué podría causar una pérdida, qué inversiones alcanzaría y cuándo necesitarías recuperar el dinero. Esa lista debe explicar las conexiones entre problemas, además de nombrarlos.\n\nPor ejemplo, tener varias empresas no elimina el riesgo si todas dependen del mismo cliente. Si pierden sus ventas a la vez, el efecto sobre la cartera podría ser mayor de lo que sugiere contar sus nombres.',
 '51/3':'Las comisiones del bróker y el resultado de la acción son cosas diferentes. Pagar menos por una operación conserva más dinero, pero no impide que las acciones pierdan valor.\n\nPor eso compara las tarifas y la calidad del servicio por un lado, y estudia el negocio que compras por otro. Una decisión no sustituye a la otra.',
 '51/7':'Antes de elegir el intermediario, revisa qué entidad presta el servicio, cómo tramita las operaciones y quién mantiene registradas las acciones. Consulta también las tarifas y las condiciones de custodia.\n\nUna lista amplia de productos no responde a esas preguntas. Entender el servicio permite saber qué estás contratando y qué gastos o limitaciones podrías encontrar después.',
};

export function refineClearWriting(result){
 for(const lesson of result.lessons){
  const point=lesson.id-449;
  if(point<11)continue;
  for(const [index,step] of lesson.steps.entries()){
   if(step.type!=='learn')continue;
   const old=step.body;let body=old;
   if(point>=50){
    if(index===0){const first=sentences(body)[0];body=clearIntroductions[point]+' '+body.slice(first.length).trimStart();}
    for(const [from,to] of language)body=body.replaceAll(from,to);
    body=fullerScreens[`${point}/${index+1}`]||body;
   }
   step.body=readableParagraphs(body);
   if(index===0&&lesson.summary===old)lesson.summary=step.body;
  }
 }
 return result;
}
