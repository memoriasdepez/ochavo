import {choice,multi,activity,rows,truth,learn,table,order,match} from './helpers.mjs';
import {cases as middle} from './cases-21-40.mjs';
import {cases as advanced} from './cases-41-50.mjs';
import {investigations} from './late-investigations.mjs';
import {lateTeaching} from './late-teaching.mjs';
import {lateProgression} from './late-progression.mjs';
import {lateEvidenceOptions,lateEvidenceReasons} from './late-evidence-options.mjs';
import {clarityReports341To500 as reports,clarityTeaching341To500 as teaching,clarityDocumentation341To500 as documentation,clarityQualitativeCases341To500 as qualitativeCases} from './clarity-341-500-data.mjs';
import {validateActivity} from '../../src/exercise-formats.js';

export const CLARITY_341_500_REVISION='stocks-clarity-variety-2026-10-11';
const cases={...middle,...advanced,
 872:{
  scene:'Durante un mes, un fabricante vende 100 dispositivos que llevan un chip cada uno. Compra 60 chips nuevos y utiliza 40 que ya tenía almacenados. Así atiende todas las ventas del mes.',
  question:'¿Por qué los 60 chips pedidos al proveedor no bastan para medir el consumo final de ese mes?',
  correct:'Parte de los chips utilizados salió del almacén: los pedidos nuevos fueron menores que el consumo final.',
  incorrect:'Los pedidos nuevos reflejan todo el consumo final, aunque también se hayan utilizado chips del almacén.',
  explanation:'Se utilizaron 100 chips en los dispositivos vendidos, pero solo 60 se compraron ese mes. El resto salió del stock. Por eso menos pedidos al proveedor pueden deberse a usar existencias, sin que las ventas finales bajen en la misma proporción.',
 },
};
const rotate=(values,n)=>values.map((_,i)=>values[(i+n)%values.length]);
const lower=s=>s.charAt(0).toLocaleLowerCase('es')+s.slice(1).replace(/\.$/,'');
const kind=q=>q.activity?.kind||q.type;
// Replace complete, reviewed phrases only. Replacing fragments of terminology
// globally can change gender or break the meaning of an advanced sentence.
const simple=s=>s
 .replaceAll('misma cohorte inicial','mismo grupo inicial de clientes')
 .replaceAll('la misma cohorte','el mismo grupo de clientes')
 .replaceAll('de la cohorte','del grupo de clientes')
 .replaceAll('las cohortes','los grupos de clientes')
 .replaceAll('por cohorte','por grupo de clientes')
 .replaceAll('cada cohorte','cada grupo de clientes')
 .replaceAll('cohorte inicial','grupo inicial de clientes')
 .replaceAll('Datos de cohortes','Datos de grupos de clientes')
 .replaceAll('Datos por cohortes','Datos por grupos de clientes')
 .replaceAll('Reprecio de activos y pasivos y sensibilidad por plazo','Fechas de revisión de intereses cobrados y pagados, y efecto de esas revisiones')
 .replaceAll('Calendario de construcción, financiación y rampa de producción','Calendario de construcción, financiación y aumento gradual de producción');
function complete(q,hint='Identifica qué ocurre en el caso. Responde solo a lo que se pregunta, usando esos datos.'){
 q.hint=hint;if(q.activity){q.activity.hint=hint;validateActivity(q.activity,q.title);}return q;
}
function optionsFor(good,badA,badB,id){const options=rotate([good,badA,badB],id%3);return {options,answer:options.indexOf(good)};}
const timelines={
 790:['Dentro de 6 meses: pagar entrada de vivienda.','Dentro de 25 años: objetivo de jubilación.'],
 795:['Cada trimestre: revisar clientes y margen.','Entre revisiones: comprobar cambios relevantes en el cliente principal.'],
 806:['Hoy: comprar materiales.','Mes 1: entregar el pedido.','Mes 3: cobrar al cliente.'],
 814:['Apertura: inversión y captación inicial.','Primeros meses: ventas todavía en desarrollo.','Etapa madura: nivel de actividad más estable.'],
 824:['Enero: el envase cuesta más.','Enero–marzo: no cambia el precio de venta.','Abril: se permite revisar precio.'],
 833:['Antes: el distribuidor opera el punto de venta.','Transición: la marca abre sus locales.','Después: la marca paga personal, alquiler y operación.'],
 847:['Inicio: el cliente paga 12 meses.','Durante el año: se presta y financia el servicio.','Final: termina la cobertura del pago inicial.'],
 862:['Autorización: se acepta el pago.','Compensación: se calculan saldos de participantes.','Liquidación: se transfiere el dinero.'],
 865:['Compra: se identifica si el pago es nacional o internacional.','Aplicación del contrato: se calculan tarifa y costes de esa modalidad.','Resultado: se determina cuánto conserva cada participante.'],
 875:['Hoy: financiación y comienzo de la obra.','Años 1–3: construcción.','Año 3 en adelante: puesta en marcha gradual.'],
 888:['Durante operación: extraer y mantener la explotación.','Antes del cierre: financiar las garantías requeridas.','Al cerrar: cumplir restauración ambiental.'],
 895:['Antes de inaugurar: continúan pagos de obra.','Demora: todavía no llegan los cobros de operación.','Nueva apertura: empiezan los cobros posteriores.'],
 901:['Hoy: algunos depositantes pueden retirar dinero.','Años siguientes: llegan cobros de préstamos.','Mientras tanto: el banco necesita recursos líquidos.'],
 911:['Enero: se cobra la póliza anual.','Enero–marzo: transcurre parte de la cobertura.','Abril–diciembre: sigue la cobertura comprometida.'],
 917:['Año 1: se esperan pagos a asegurados.','Antes de pagar: puede necesitarse vender inversiones con riesgo de precio.','Año 8: vencen los bonos contratados.'],
 925:['Renovación: el propietario paga una reforma.','Meses 1–3: no se cobra renta.','Mes 4 en adelante: vuelve la renta pactada.'],
 937:['Hoy: caja disponible.','Próximo ensayo: aumenta el consumo de dinero.','Si se retrasa: hacen falta más meses de financiación.'],
 941:['A: vende más con la actividad que ya existía.','B: paga por adquirir otra empresa.','Comparación: separar fuentes y recursos del crecimiento.'],
 948:['Punto de partida: precio de mercado y valor estimado.','Revisión: comprobar supuestos y escenarios de pérdida.','Comparación: juzgar descuento junto a fiabilidad, no por separado.'],
};
function figureFor(id){const d=reports[id];return timelines[id]?{kind:'flow',items:timelines[id],caption:'Calendario o recorrido de un supuesto inventado.'}:table(['Parte del informe','Dato observado'],d.rows,'Informe simulado. Datos simplificados para aprender.');}
function reportQuestion(id){
 const d=reports[id],{options,answer}=optionsFor(d.correct,d.wrongA,d.wrongB,id),body=`${d.scene}\n\n${d.question}`;
 let q=choice('Interpreta el informe',body,options,answer,d.explanation);
 const mode=id%6;
 if(mode===1)q=rows('table','Completa la conclusión del informe',`${d.scene}\n\n${d.question}`,[{label:'Interpretación de los datos',options,answer}],d.explanation);
 if(mode===2)q=activity(q,'clues',{options,answer,clues:['Distingue los datos observados de lo que todavía falta comprobar.','Relaciona las condiciones de las filas; no uses una cifra aislada como explicación completa.'],instruction:'Elige una conclusión. Las pistas son opcionales.'});
 if(mode===3)q=rows('repair','Corrige el resumen',`${d.scene}\n\nUn resumen afirma: «${d.wrongA}»\n\n${d.question}`,[{label:'Sustituye esa afirmación por la conclusión que respaldan los datos.',wrongWord:d.wrongA,options,answer}],d.explanation);
 if(mode===4)q=truth('Revisa las conclusiones',`${d.scene}\n\nIndica si cada conclusión está respaldada por el informe.`,[[d.correct,true],[d.wrongA,false],[d.wrongB,false]],d.explanation);
 if(mode===5)q=rows('classify','Separa datos y conclusiones',`${d.scene}\n\nClasifica cada interpretación según esté respaldada por el informe.`,options.map(label=>({label,options:['Respaldada por los datos','No respaldada por los datos'],answer:label===d.correct?0:1})),d.explanation);
 q.figure=figureFor(id);return complete(q,'Mira las condiciones de cada fila. Pregúntate qué conclusión se obtiene al relacionarlas.');
}
function qualitativeCase(id){
 const d=qualitativeCases[id],c=cases[id],{options,answer}=optionsFor(d.correct,d.wrongA,d.wrongB,id+2);
 return complete(choice('Interpreta el resultado del caso',`${simple(c.scene)}\n\nLa cuenta ya está resuelta: ${simple(c.correct)}\n\n${d.question}`,options,answer,d.explanation),'Usa la cifra como dato. La pregunta pide explicar su significado, sin volver a hacer la cuenta.');
}
function repairCase(id,hasNumeric=false){
 const q=hasNumeric&&qualitativeCases[id]?qualitativeCase(id):choice('Corrige la respuesta al caso',`${simple(cases[id].scene)}\n\n${simple(cases[id].question)}`,[simple(cases[id].incorrect),simple(cases[id].correct)],1,simple(cases[id].explanation));
 return complete(rows('repair','Corrige la interpretación del caso',q.body,[{label:'Elige la interpretación que corrige el error.',wrongWord:q.options.find((_,i)=>i!==q.answer).text,options:q.options.map(o=>o.text),answer:q.answer}],q.explanation));
}
function appliedCase(id,hasNumeric=false){
 if(hasNumeric&&qualitativeCases[id])return qualitativeCase(id);
 if(differencesQuestions[id])return differenceQuestion(id,differencesQuestions[id]);
 const c=cases[id],options=rotate([simple(c.correct),simple(c.incorrect)],id%2),answer=options.indexOf(simple(c.correct));
 const body=simple(`${c.scene}\n\n${c.question}`),explanation=simple(c.explanation);
 let q=choice('Aplica la idea en otra situación',body,options,answer,explanation);
 const mode=Math.floor(id/2)%5;
 if(mode===1)q=activity(q,'clues',{options,answer,clues:['Sigue qué ocurre en este caso antes de interpretar las cifras.','Comprueba qué afirma cada opción; distingue cantidades, fechas y condiciones del ejemplo.'],instruction:'Resuelve el caso. Puedes consultar una pista si la necesitas.'});
 if(mode===2)q=rows('table','Completa la respuesta al caso',body,[{label:'Respuesta a la pregunta',options,answer}],explanation);
 if(mode===3)q=rows('repair','Revisa la respuesta propuesta',`${simple(c.scene)}\n\nUna persona responde: «${simple(c.incorrect)}»\n\n${simple(c.question)}`,[{label:'Elige la respuesta que corrige ese error.',wrongWord:simple(c.incorrect),options,answer}],explanation);
 if(mode===4)q=truth('Contrasta las propuestas',body,options.map((v,i)=>[v,i===answer]),explanation);
 return complete(q);
}
const differencesQuestions={
 794:{scene:'Dos versiones del plan invierten el mismo total en la misma acción. No se indica cómo se moverá su precio.',before:['Una compra hoy.','Comisión fija: 1 € por compra.','Informe con portada verde.'],after:['Cuatro compras en fechas distintas.','Comisión fija: 1 € por compra.','Informe con portada azul.'],options:['Exposición temporal al precio.','Coste total de comisiones.','Calidad económica por el color de portada.'],answers:[0,1],explanation:'Repartir en cuatro fechas cambia cuándo está invertido el dinero y genera cuatro comisiones en este contrato. La portada no cambia el riesgo ni la rentabilidad.'},
 815:{scene:'Se compara mantener una tienda y cerrarla. El local conserva el mismo contrato mientras no se rescinda.',before:['Tienda abierta y con ventas.','Alquiler obligatorio hasta final del contrato.','Decoración con nueva temporada.'],after:['Tienda cerrada y sin ventas.','Alquiler obligatorio hasta final del contrato.','Decoración retirada.'],options:['Continuidad de ingresos de tienda.','Obligación de pagar el alquiler.','Dinero disponible por retirar decoración, sin venta indicada.'],answers:[0],explanation:'Cerrar elimina las ventas de esa tienda, pero las versiones mantienen la misma obligación de alquiler. Retirar decoración no implica un cobro.'},
 825:{scene:'Una campaña se prueba con descuento y después vuelve a la tarifa normal. Selecciona qué aspectos hay que comprobar antes de hablar de una marca más fuerte.',before:['Clientes compran mientras hay descuento.','Muchos prueban por primera vez.','Nuevo diseño del anuncio.'],after:['Clientes pueden comprar sin descuento.','Ya ha transcurrido tiempo para observar repetición.','Otro diseño del anuncio.'],options:['Demanda al precio sin promoción.','Repetición después de probar.','Preferencia de compra demostrada solo por el diseño.'],answers:[0,1],explanation:'Precio completo y repetición ayudan a estudiar un efecto duradero. El aspecto del anuncio no demuestra por sí mismo preferencia económica.'},
 843:{scene:'Se revisan dos versiones del informe de crecimiento para estudiar expansión dentro del mismo grupo de clientes.',before:['Ingreso del grupo inicial separado.','Altas nuevas en una línea aparte.','Resumen en tres páginas.'],after:['Ingreso inicial mezclado con altas nuevas.','No se mantiene una línea aparte para nuevas altas.','Resumen en dos páginas.'],options:['Identificación del mismo grupo inicial.','Separación de nuevas altas.','Validez económica por tener menos páginas.'],answers:[0,1],explanation:'La segunda versión ya no permite aislar expansión del grupo inicial. Cambia la separación de ingresos, no por el número de páginas.'},
 855:{scene:'La plataforma compara pedidos durante la ayuda y después de retirarla. Selecciona qué aspectos permiten evaluar si la captación funcionó sin esa subvención.',before:['Precio para cliente reducido por ayuda.','Coste promocional por pedido.','Muchos registros nuevos.'],after:['Precio normal sin ayuda.','Sin ese coste promocional.','Los registros acumulados se mantienen.'],options:['Repetición de pedidos al precio normal.','Contribución sin el coste de promoción.','Éxito confirmado por mantener el total de registros.'],answers:[0,1],explanation:'Que las cuentas registradas permanezcan no demuestra compras. El comportamiento sin ayuda y el dinero que dejan los pedidos permiten evaluar la captación.'},
 875:{scene:'El cliente adelanta el plan comercial, pero la obra conserva su calendario. Selecciona las diferencias que exigen revisar ingresos y financiación del proyecto.',before:['Fábrica abre dentro de 3 años.','Demanda prevista para el año de apertura.','Obra financiada hasta esa apertura.'],after:['Fábrica abre dentro de 4 años por demora.','Se mantiene la previsión para el antiguo año de apertura.','Se mantiene financiación hasta el antiguo año de apertura.'],options:['Demanda relevante en la nueva fecha.','Necesidad de dinero durante la demora.','Capacidad para vender antes de que abra la fábrica.'],answers:[0,1],explanation:'La obra tarda más, de modo que cambian el horizonte comercial y el periodo sin ingresos. Mantener los calendarios antiguos deja condiciones sin justificar.'},
 892:{scene:'La infraestructura revisa su mecanismo de traslado de costes. Selecciona qué cambios obligan a revisar caja y margen antes de la nueva tarifa.',before:['Actualización al subir el coste.','Se admite todo el incremento definido.','Nombre del informe: Plan A.'],after:['Actualización seis meses después.','Solo se admite parte del incremento definido.','Nombre del informe: Plan B.'],options:['Periodo con tarifa antigua y costes nuevos.','Parte del coste que no se recupera en tarifa.','Rentabilidad por cambiar el nombre del informe.'],answers:[0,1],explanation:'El retraso crea un intervalo de financiación y el límite deja costes sin trasladar. El nombre del documento no produce esos efectos.'},
 905:{scene:'La segunda versión reduce provisiones por cambiar el escenario, no por nuevos cobros. Selecciona qué pruebas necesita revisar para aceptar esa reducción.',before:['Previsión económica débil.','Pérdidas futuras estimadas altas.','Préstamos aún pendientes.'],after:['Previsión económica mejor.','Pérdidas futuras estimadas menores.','Los mismos préstamos siguen pendientes.'],options:['Fundamento del escenario más favorable.','Coherencia de menores pérdidas con datos de prestatarios.','Cobro ya realizado porque bajó la provisión.'],answers:[0,1],explanation:'Han cambiado hipótesis y estimaciones. No se ha indicado un cobro nuevo, por lo que hace falta respaldar la reducción con información sobre riesgo.'},
 914:{scene:'La revisión de un siniestro incorpora información nueva. Selecciona qué cambió de forma demostrable, sin confundir estimación con pago.',before:['Se estima obligación de 20 €.','No se ha pagado todavía.','Se desconocía parte del daño.'],after:['Se estima obligación de 30 €.','No se ha pagado todavía.','Nueva evidencia sobre parte del daño.'],options:['Estimación de la obligación.','Información utilizada para estimar.','Pago de caja ya realizado.'],answers:[0,1],explanation:'La nueva información aumenta la obligación estimada. Las dos versiones dicen que el pago sigue pendiente, así que no hay base para tratarlo como efectivo ya salido.'},
 925:{scene:'El inmueble renueva el mismo inquilino con incentivos. Selecciona qué piezas reducen caja frente a repetir el contrato anterior sin incentivos.',before:['Renta desde el primer mes.','Sin reforma adicional del propietario.','Mismo inquilino.'],after:['Tres meses iniciales sin renta.','Reforma pagada por el propietario.','Mismo inquilino.'],options:['Meses sin cobrar al inicio.','Dinero destinado a la reforma.','Pérdida demostrada de ocupación por cambiar de inquilino.'],answers:[0,1],explanation:'La ocupación puede mantenerse y aun así requerir recursos. Carencia y reforma modifican la caja sin que haya cambiado el inquilino.'},
 938:{scene:'Se revisa un modelo de proyecto. El ensayo se paga siempre; el ingreso depende de éxito. Selecciona qué partidas necesitan ponderaciones diferentes.',before:['Se aplica 20 % al ingreso si hay éxito.','Se aplica también 20 % al coste obligatorio del ensayo.','Mismo nombre de proyecto.'],after:['Ingreso sigue condicionado a éxito.','Ensayo se paga también en fracaso.','Mismo nombre de proyecto.'],options:['Ingreso ligado al resultado incierto.','Coste que ocurre en todos los escenarios.','Probabilidad mayor por mantener el nombre.'],answers:[0,1],explanation:'La condición del ingreso no es la del coste. No debe reducirse un desembolso obligatorio por la probabilidad de un resultado comercial distinto.'},
 946:{scene:'Una revisión descubre una exposición que no figuraba en el resumen sectorial. Selecciona los vínculos que requieren un escenario común.',before:['A aparece en sector industrial.','B aparece en sector servicios.','Se supone riesgo separado por las etiquetas.'],after:['A consume energía con precios variables.','Los clientes de B dependen de costes energéticos.','Las etiquetas sectoriales siguen siendo distintas.'],options:['Efecto directo del coste energético sobre A.','Efecto sobre demanda de clientes de B.','Caída necesariamente idéntica en ambas cotizaciones.'],answers:[0,1],explanation:'Una causa puede transmitirse directamente y a través de clientes. El vínculo común necesita un escenario; no obliga a que los resultados o precios caigan por igual.'},
};
function differenceQuestion(id,d){
 const base=multi('Compara las dos versiones',d.scene,d.options,d.answers,d.explanation);
 return complete(activity(base,'differences',{options:d.options,answers:d.answers,before:d.before,after:d.after,instruction:'Compara las versiones y marca los aspectos indicados que cambian o necesitan comprobarse. No basta detectar una palabra distinta.'}),'Relaciona cada cambio con el efecto económico pedido, no solo con la diferencia de texto.');
}
function evidenceQuestion(id){
 const p=investigations[id],progress=lateProgression[id],offers=lateEvidenceOptions[id];
 const good=simple(p.evidence),{options,answer}=optionsFor(good,...offers.map(simple),id+1);
 const body=simple(`${p.scene}\n\nQuieres ${lower(p.action)}. ¿Qué documento o conjunto de datos pedirías para comprobarlo?`);
 const explanation=simple(`Necesitas ${lower(p.evidence)}. ${lateEvidenceReasons[id].join(' ')} ${progress.verificationTakeaway}`);
 let q=choice('Elige la información útil',body,options,answer,explanation);
 const mode=Math.floor(id/3)%4;
 if(mode===1)q=rows('table','Completa la petición de información',body,[{label:'Datos que permiten responder a esa duda',options,answer}],explanation);
 if(mode===2)q=activity(q,'clues',{options,answer,clues:['Un documento puede contener cifras verdaderas y no responder a esta pregunta.','Comprueba si permite conocer la condición que falta: fecha, contrato, gasto o actividad que menciona el caso.'],instruction:'Elige el informe que resuelve la duda planteada. Las pistas son opcionales.'});
 if(mode===3)q=rows('repair','Corrige la fuente elegida',`${simple(p.scene)}\n\nSe ha elegido «${simple(offers[0])}». Para ${simple(lower(p.action))}, sustituye esa fuente por la que permite comprobarlo.`,[{label:'Información necesaria',wrongWord:simple(offers[0]),options,answer}],explanation);
 return complete(q,'Identifica primero la duda concreta. Después busca qué datos permitirían resolverla.');
}
function investigationQuestion(id){
 const p=investigations[id],progress=lateProgression[id],good=simple(p.action),bad=simple(p.shortcut);
 const mode=id%4,body=simple(`${p.scene}\n\n¿Qué revisión evita dar el problema por resuelto sin comprobarlo?`),explanation=simple(`${p.action}. ${progress.investigationTakeaway}`);
 if(mode===0&&processOrders[id]){
  // Data, analysis and judgement have a real dependency. The steps refer to
  // this objective, rather than to an unrelated generic calculation.
  const logical=processOrders[id];
  const items=rotate(logical,1+(Math.floor(id/4)%2)),answer=logical.map(s=>items.indexOf(s));
  return complete(order('Ordena el trabajo necesario',simple(`${p.scene}\n\nOrdena estos pasos para obtener una conclusión que use las condiciones del caso.`),items,answer,explanation));
 }
 const options=rotate([good,bad],id%2),answer=options.indexOf(good);
 if(mode===1||mode===0)return complete(rows('classify','Clasifica los planes de revisión',simple(`${p.scene}\n\nDecide qué plan comprueba el problema y cuál lo da por resuelto sin la prueba necesaria.`),options.map(label=>({label,options:['Comprueba el problema','Lo da por resuelto sin comprobar'],answer:label===good?0:1})),explanation));
 if(mode===2){
  const q=multi('Selecciona la revisión necesaria',body,options,[answer],explanation);
  return complete(activity(q,'all',{options,answers:[answer],instruction:'Marca el plan que comprueba el problema descrito.'}));
 }
 return complete(truth('Comprueba los planes',simple(`${p.scene}\n\n¿Permite cada plan comprobar el problema, en lugar de suponerlo resuelto?`),options.map(v=>[v,v===good]),explanation));
}
// Specific applied charts. Values share a unit within each chart and support
// the judgement; we do not use decorative graphs as a substitute for evidence.
const chartQuestions={
 791:{labels:['Empresa de licencia única','Resto de la cartera'],values:[35,65],unit:'% de cartera',question:'La empresa de licencia única puede perder su autorización. ¿Qué uso del gráfico ayuda a revisar su tamaño?',options:['Probar cuánto afectaría ese riesgo a la cartera y a las necesidades del inversor.','Mantener el 35 % porque el resto de la cartera pesa más.','Usar la caída histórica menor de la acción como límite de pérdida.'],answer:0,explanation:'El gráfico mide peso, no calidad. Sirve para conectar la pérdida posible en esa empresa con la cartera y la capacidad económica de soportarla.'},
 803:{labels:['Producción anterior','Producción actual'],values:[80,40],unit:'unidades',question:'El alquiler sigue siendo 200 € en los dos periodos. ¿Qué implica producir menos?',options:['Cada unidad soporta una parte mayor del alquiler.','El alquiler por unidad se mantiene porque el total es igual.','El alquiler total baja al mismo ritmo que las unidades.'],answer:0,explanation:'Repartir los mismos 200 € entre 40 unidades da una carga mayor por unidad que repartirlos entre 80. La barra muestra producción, no costes.'},
 811:{labels:['Ventas comparables antes','Ventas comparables ahora'],values:[100,90],unit:'€',question:'Son los mismos locales. Las ventas del grupo aumentan al abrir tiendas nuevas. ¿Qué lectura conserva ambos hechos?',options:['Los locales comparables empeoran aunque crezca el grupo.','Todos los locales antiguos mejoran porque crece el grupo.','La comparación ya incluye las aperturas nuevas.'],answer:0,explanation:'Las barras mantienen el mismo conjunto de tiendas. Las aperturas explican otra parte del total; no cambian que esta red pase de 100 € a 90 €.'},
 824:{labels:['Coste de envase en diciembre','Coste de envase desde enero'],values:[2,3],unit:'€ por unidad',question:'La tarifa de venta solo puede revisarse en abril. Entre enero y marzo, ¿qué presión refleja el gráfico si lo demás no cambia?',options:['Menor margen por unidad antes de trasladar el coste al precio.','Mayor ingreso de venta desde enero porque el envase cuesta más.','Solo un cambio de calendario, sin efecto económico durante la espera.'],answer:0,explanation:'Cada unidad lleva un euro más de coste sin aumento de tarifa en ese intervalo. La recuperación posterior no elimina esa presión temporal.'},
 835:{labels:['Compradores turistas','Compradores locales'],values:[80,20],unit:'% de ventas de la boutique',question:'La boutique está en Francia y esos turistas proceden de otra región. ¿Qué información debe acompañar a las ventas por país de la tienda?',options:['Origen del comprador y condiciones de viaje, además de demanda local.','Solo demanda francesa porque ahí se registra la venta.','Solo origen de la fabricación de los productos.'],answer:0,explanation:'El país de la boutique no basta para localizar su demanda. Los compradores que viajan pueden concentrar exposición económica fuera del lugar de cobro.'},
 842:{labels:['Ingreso de la base inicial antes','Ingreso de esa base ahora'],values:[100,110],unit:'€',question:'De los 10 clientes iniciales quedan 8. ¿Qué muestran juntos la gráfica y el dato de clientes?',options:['Puede crecer el ingreso de esa base mientras se pierden clientes.','No se perdió ningún cliente porque creció el ingreso.','Hay que incluir clientes nuevos para que aumente el ingreso.'],answer:0,explanation:'La gráfica corresponde siempre al grupo inicial. Los clientes que quedan pueden gastar más y compensar el ingreso de quienes se fueron.'},
 851:{labels:['Compras de usuarios','Ingreso propio por comisión'],values:[100,10],unit:'€',question:'La plataforma solo intermedia estas compras. ¿Qué diferencia necesitas conservar al leer las barras?',options:['Importe tramitado e ingreso propio son medidas distintas.','Las dos barras son ingresos propios que se suman.','El ingreso propio permite tratar todo el importe como beneficio.'],answer:0,explanation:'De las compras tramitadas, solo la comisión es ingreso propio en este caso. Después todavía faltan los gastos de la plataforma.'},
 864:{labels:['Importe facturado','Parte conservada tras repartir a terceros'],values:[6,2],unit:'€',question:'Los gastos propios del procesador todavía no se han restado. ¿Cómo describirías las dos barras?',options:['La segunda es una medida intermedia; aún no es beneficio neto.','La primera es ingreso conservado porque el cliente la pagó.','La segunda ya ha cubierto todos los costes del procesador.'],answer:0,explanation:'Facturar 6 € y entregar parte a otros deja 2 € antes de costes propios. El gráfico separa el reparto, pero no termina el resultado económico.'},
 872:{labels:['Dispositivos vendidos antes','Dispositivos vendidos ahora','Chips comprados ahora'],values:[100,100,140],unit:'unidades',question:'Cada dispositivo utiliza un chip y el cliente guarda el resto. ¿Qué explica la diferencia de la tercera barra?',options:['Acumulación de chips, sin aumento de ventas finales.','Crecimiento de un 40 % en dispositivos vendidos.','Reducción del inventario porque compró más chips.'],answer:0,explanation:'El uso final sigue en 100 chips. Comprar 140 añade 40 al almacén bajo las condiciones del ejercicio.'},
 874:{labels:['Lote A: chips válidos','Lote B: chips válidos'],values:[80,50],unit:'unidades',question:'Cada lote cuesta 100 € y fabrica 100 chips. ¿Por qué A tiene menor coste por chip vendible?',options:['Su coste total se reparte entre más chips válidos.','Su coste total es menor que el del lote B.','Sus defectuosos pueden contarse como ventas normales.'],answer:0,explanation:'La calidad cambia la base del coste unitario. A entrega 80 chips válidos por el mismo coste al que B entrega 50.'},
 884:{labels:['Ingreso con precio inicial','Ingreso con precio menor','Coste que permanece en ambos escenarios'],values:[100,80,70],unit:'€',question:'Las unidades no cambian y esos son todos los costes del supuesto. ¿Qué explica que el resultado se reduzca mucho al bajar el precio?',options:['El coste que permanece absorbe una parte mayor del ingreso restante.','Los costes han aumentado aunque la barra no cambie.','La reducción del precio afecta solo a la cantidad de acciones.'],answer:0,explanation:'El ingreso baja y el coste no acompaña esa caída. La diferencia disponible se estrecha de forma importante; ese es el efecto económico del coste fijo.'},
 891:{labels:['Inversión realizada','Base admitida por el regulador'],values:[100,80],unit:'€',question:'La remuneración se aplica solo a la base admitida. ¿Qué diferencia necesita mantener el presupuesto?',options:['Lo invertido no genera por defecto remuneración regulada en su totalidad.','Los 100 € son la base porque han salido de la caja.','Los 80 € son un ingreso cobrado hoy, sin otra regla.'],answer:0,explanation:'Las barras tienen funciones diferentes: recurso empleado y base reconocida. La regla de remuneración se aplica a la segunda.'},
 906:{labels:['Capital disponible','Capital requerido en el plan nuevo'],values:[80,90],unit:'€ del ejemplo',question:'El plan amplía préstamos en una categoría de mayor riesgo. ¿Qué deja pendiente el gráfico antes de celebrar el ingreso nuevo?',options:['Obtener capital suficiente o ajustar el plan a sus recursos.','Llamar capital a todos los préstamos nuevos.','Comparar solo cuánto interés adicional generarán.'],answer:0,explanation:'La expansión exige más recursos de protección que los disponibles en el supuesto. Ingresos previstos y capital para pérdidas no son lo mismo.'},
 913:{labels:['Indicador del año sin liberación antigua','Indicador publicado con liberación antigua'],values:[104,95],unit:'% combinado',question:'Las bases del cálculo son compatibles. ¿Qué parte del resultado necesita separarse para estudiar el seguro del año?',options:['El efecto de revisar reservas antiguas frente al desempeño actual.','La diferencia como reducción obligatoria de siniestros actuales.','El 95 % como medida completa de liquidez y solvencia.'],answer:0,explanation:'El indicador publicado mejora por una revisión del pasado. El desempeño del periodo no tiene por qué mejorar en la misma medida; además, el indicador no resume solvencia.'},
 922:{labels:['Superficie alquilada','Rentas efectivamente cobradas'],values:[95,70],unit:'% de su base',question:'La primera barra usa superficie disponible; la segunda, renta debida. ¿Qué investigación señala la combinación?',options:['Revisar retrasos y calidad de cobro pese a la ocupación alta.','Considerar que toda la renta está cobrada por la ocupación.','Restar los porcentajes como si fueran metros sin alquilar.'],answer:0,explanation:'Las bases son distintas y están indicadas. No se restan como una única superficie: ocupación y cobro necesitan revisiones separadas.'},
 937:{labels:['Consumo anual antes del ensayo','Consumo anual con el ensayo nuevo'],values:[20,40],unit:'€ por año',question:'La caja disponible no cambia. ¿Qué información debe actualizarse para decidir cuándo buscar financiación?',options:['El calendario de gasto y autonomía con el plan nuevo.','Solo la autonomía antigua porque la caja inicial es igual.','Contar el aumento de gasto como nuevo efectivo disponible.'],answer:0,explanation:'El mismo saldo dura menos a un consumo mayor. El momento de pedir recursos debe reflejar gasto previsto y posibles retrasos.'},
 944:{labels:['Caja de A en escenario adverso','Caja de B en escenario adverso','Pago de deuda de cada una'],values:[30,15,20],unit:'€ en la fecha de pago',question:'La deuda es igual, pero los escenarios de cobro difieren. ¿Qué problema requiere revisar B?',options:['Cómo cubrir el pago si llega el escenario de caja indicado.','Que el importe de deuda sea menor que el de A.','El beneficio publicado como sustituto del efectivo de esa fecha.'],answer:0,explanation:'El importe adeudado por sí solo no mide capacidad de pago. B necesita recursos o ajustes para el escenario en que su caja no cubra la obligación.'},
};
const matchQuestions={
 792:{prompt:'Relaciona cada grupo de empresas con el riesgo común que sí describe su situación.',pairs:[['Dos negocios que venden para viviendas nuevas.','Menos construcción puede afectar a ambos.'],['Dos fábricas abastecidas por una planta difícil de sustituir.','Un cierre del proveedor puede interrumpir ambas.'],['Dos negocios que renuevan préstamos a interés variable.','Un encarecimiento del crédito puede presionar a ambos.']],explanation:'Una cartera puede compartir demanda, suministro o financiación. Hay que buscar dependencias económicas, además de contar empresas.'},
 801:{prompt:'Relaciona cada detalle de los pedidos con la duda que conviene resolver.',pairs:[['El cliente puede cancelar sin pagar una penalización.','Firmeza de la actividad anunciada.'],['La entrega está prevista dentro de muchos meses.','Fecha en que podrá convertirse en venta y cobro.'],['Subieron costes de fabricar al precio acordado.','Dinero que puede quedar después de entregar.']],explanation:'Un pedido pendiente necesita condiciones, calendario y costes. Su importe por sí solo no asegura ventas rentables ni cobros cercanos.'},
 812:{prompt:'Une cada cambio de la tienda con la parte del recorrido del cliente que afecta directamente.',pairs:[['Entran menos personas por la puerta.','Tráfico de visitas.'],['De quienes entran, una proporción menor compra.','Conversión de visita a compra.'],['Cada comprador añade un artículo a su compra.','Tamaño de la cesta.']],explanation:'Las tres piezas forman ventas: visitas, proporción que compra y gasto de quienes compran. Cada hecho cambia una parte distinta.'},
 821:{prompt:'Relaciona cada situación con su fuente de cambio en ingresos. No hay otros cambios en cada ejemplo.',pairs:[['Se vende igual cantidad del mismo producto a una tarifa mayor.','Efecto del precio.'],['Se vende mayor cantidad del mismo producto a igual tarifa.','Efecto del volumen.'],['Se sustituye parte del producto económico por otro más caro.','Efecto de la mezcla de productos.']],explanation:'Ingresos mayores no cuentan por sí solos qué pasó. Precio, unidades y composición explican fuentes de crecimiento diferentes.'},
 834:{prompt:'Une cada distribución de ventas con la concentración que conviene analizar.',pairs:[['Casi todo el avance viene de bolsos.','Dependencia de una categoría.'],['Pocos compradores de alto gasto sostienen buena parte de ingresos.','Dependencia de un segmento de clientes.'],['Muchos productos se venden a turistas de un mismo origen.','Dependencia del origen económico de compradores.']],explanation:'Contar marcas no describe la diversificación de ventas. Categoría, clientes y origen de demanda pueden concentrarse de forma diferente.'},
 842:{prompt:'Relaciona cada dato con la medida que pone a prueba. Todos se refieren al mismo grupo inicial.',pairs:[['Varios clientes dejan de pagar por el servicio.','Permanencia del número de clientes.'],['Quienes siguen contratan más funciones.','Expansión del ingreso de clientes conservados.'],['El dinero de la base inicial sube pese a esas bajas.','Retención de ingresos distinta de retención de clientes.']],explanation:'La base puede perder clientes y mantener o aumentar ingresos. Hay que observar qué se conserva y cuánto gasta cada grupo.'},
 852:{prompt:'Une cada hecho con la explicación del cambio en ingresos que sí permite.',pairs:[['La plataforma sube la comisión de cada categoría.','Cambian las tarifas.'],['Mantiene tarifas, pero crece la categoría de mayor comisión.','Cambia la mezcla de operaciones.'],['Mantiene tarifas y mezcla, pero se hacen más compras.','Cambia el volumen intermediado.']],explanation:'Los tres cambios pueden aumentar ingresos, pero por caminos distintos. Para entender la tasa media hay que separar volumen, tarifas y composición.'},
 862:{prompt:'Relaciona cada hecho de una operación con su etapa. El acuerdo puede separar sus fechas.',pairs:[['El sistema acepta que la compra siga adelante.','Autorización.'],['Se determina el saldo que corresponde a cada participante.','Compensación.'],['Se ejecuta el abono del dinero al comercio.','Liquidación.']],explanation:'Aceptar, calcular saldos y transferir son pasos distintos. Un mensaje de autorización no prueba que el comercio tenga ya el dinero disponible.'},
 871:{prompt:'Cada fabricante suministra solo los productos indicados. Une una noticia de demanda con el fabricante que tiene exposición directa.',pairs:[['Se venden más vehículos que requieren sensores.','Proveedor de sensores para vehículos.'],['Se amplían centros de datos que requieren procesadores.','Proveedor de procesadores para servidores.'],['Se venden menos teléfonos con memorias integradas.','Proveedor de memorias para móviles.']],explanation:'La noticia debe conectarse con el uso del producto. Pertenecer al mismo sector no hace iguales las exposiciones finales.'},
 883:{prompt:'Relaciona cada diferencia entre referencia y cobro con el dato que la explicaría.',pairs:[['El producto tiene calidad inferior a la de referencia.','Descuento de calidad previsto en el acuerdo.'],['El vendedor asume llevarlo hasta el destino.','Coste de transporte y condiciones de entrega.'],['El acuerdo usa el promedio del mes anterior.','Periodo de referencia fijado por el contrato.']],explanation:'Calidad, transporte y fecha pueden separar el precio recibido de la referencia visible. Hay que reconstruir la regla de esa venta.'},
 890:{prompt:'Une cada mecanismo de ingreso con la información que necesitas para preverlo.',pairs:[['El regulador admite una remuneración sobre activos reconocidos.','Base admitida y reglas de revisión.'],['Un acuerdo fija el pago bajo condiciones de servicio.','Contrato, plazo y penalizaciones.'],['El activo vende producción al precio disponible del mercado.','Escenarios de oferta, demanda y precio.']],explanation:'Los tres mecanismos tienen condiciones distintas. Una cifra agregada no describe cuánto puede cambiar cada cobro.'},
 900:{prompt:'Relaciona cada hecho de un banco con la parte del resultado que afecta de forma directa.',pairs:[['Cobra intereses de un préstamo.','Ingreso financiero.'],['Paga intereses a un depositante.','Coste de financiación.'],['Cobra por un servicio de cuenta.','Ingreso por comisiones.']],explanation:'El margen financiero relaciona intereses cobrados y pagados. Las comisiones proceden de servicios y deben analizarse con sus costes.'},
 911:{prompt:'Relaciona los hechos de la póliza con lo que representan. El contrato cobra al inicio y cubre un año.',pairs:[['El cliente abona el importe anual en enero.','Entrada de efectivo.'],['Han transcurrido tres meses de protección al cierre de marzo.','Parte de cobertura ya prestada.'],['Durante el año ocurre un daño cubierto que exige pagar.','Siniestro que puede generar una obligación.']],explanation:'Cobrar, prestar cobertura y afrontar un siniestro no son el mismo evento. Sus fechas pueden ser diferentes.'},
 924:{prompt:'Según la definición de este ejemplo, el NOI resta gastos operativos antes de intereses y reformas. Une cada partida con su lugar en el recorrido.',pairs:[['Mantenimiento ordinario incluido como gasto de operación.','Reduce el NOI del ejemplo.'],['Interés del préstamo del edificio.','Se resta después para estudiar financiación.'],['Reforma necesaria del activo.','Se considera al estudiar inversión y caja disponible.']],explanation:'Primero hay que conocer qué incluye el indicador. Las partidas fuera del NOI no desaparecen del recorrido hacia el accionista.'},
 936:{prompt:'Une cada condición de una licencia con el tipo de pago que representa.',pairs:[['Se debe al firmar el acuerdo.','Importe inicial comprometido.'],['Solo se debe si se supera un objetivo de desarrollo.','Pago por hito condicionado.'],['Se calcula sobre ventas futuras según el contrato.','Royalty ligado a la base acordada.']],explanation:'Los pagos de un acuerdo pueden tener momentos y condiciones diferentes. El máximo anunciado no es necesariamente un pago inmediato.'},
 941:{prompt:'Relaciona cada aumento de ingresos con su origen. En cada caso se mantiene lo demás.',pairs:[['Los mismos productos se venden en más unidades.','Crecimiento de volumen de la actividad existente.'],['La empresa incorpora las ventas de una compañía que compró.','Crecimiento por adquisición.'],['Se venden las mismas unidades a un precio mayor.','Crecimiento por precios.']],explanation:'El mismo aumento porcentual puede requerir recursos y riesgos diferentes. Separar las fuentes evita atribuir toda la mejora a más demanda propia.'},
};
function matchQuestion(id,d){return complete(match('Relaciona situaciones y efectos',d.prompt,d.pairs,d.explanation),'Busca qué cambia en cada caso; cada descripción corresponde a un efecto diferente.');}
const processOrders={
 796:['Buscar si hubo cambios en contratos, costes o deuda.','Actualizar las previsiones si esos datos afectan al negocio.','Comparar el nuevo valor estimado con el precio actual.'],
 804:['Medir ritmo y defectos de cada etapa.','Localizar qué etapa limita unidades vendibles.','Evaluar una mejora en esa restricción antes de ampliar otra etapa.'],
 812:['Medir visitantes, compradores y gasto por compra.','Separar qué parte del recorrido explica el cambio de ventas.','Evaluar una medida dirigida a esa parte del problema.'],
 816:['Identificar edad y demanda del inventario.','Estimar descuentos y costes de vender ese stock.','Actualizar margen y caja que puede aportar la venta.'],
 832:['Revisar dónde se vende y quién decide descuentos.','Estudiar cambios de precio y respuesta de compradores.','Contrastar la expansión con el posicionamiento de marca.'],
 844:['Identificar clientes nuevos que corresponden al periodo.','Reunir el gasto atribuible a captar esos clientes.','Dividir ese gasto completo entre las altas que le corresponden.'],
 852:['Separar volumen de operaciones por categoría.','Aplicar la tarifa vigente a cada categoría.','Comparar el ingreso conjunto con la mezcla y tarifas anteriores.'],
 868:['Identificar qué actividad y comisión alcanza la norma.','Recalcular ingresos y costes que pueden adaptarse.','Probar si el negocio conserva caja suficiente bajo esa regla.'],
 872:['Obtener ventas finales e inventarios del canal.','Separar consumo de acumulación o reducción de existencias.','Actualizar los pedidos esperados con esas causas.'],
 884:['Fijar precio y unidades del nuevo escenario.','Distinguir costes variables y costes que permanecen.','Estimar resultado y capacidad de financiar obligaciones.'],
 892:['Leer fecha, límites y costes recuperables de la tarifa.','Presupuestar pagos y cobros durante el desfase.','Comprobar el dinero que hace falta antes de la actualización.'],
 896:['Leer quién firma y qué garantías aporta la matriz.','Asignar los pagos posibles a proyecto y grupo.','Revisar si sus recursos cubren las obligaciones asignadas.'],
 904:['Desglosar retrasos, garantías y reestructuraciones de préstamos.','Actualizar pérdidas posibles y recuperación de esos cobros.','Valorar la sostenibilidad del beneficio después de esos efectos.'],
 916:['Situar las pólizas por zona y evento compartido.','Estimar daños cubiertos y parte cedida por reaseguro.','Contrastar la pérdida retenida con recursos disponibles.'],
 920:['Separar edificios alquilados y proyectos para vender.','Presupuestar ingresos, inversión y fechas de cada actividad.','Combinar sus necesidades de caja sin duplicar partidas.'],
 928:['Revisar valores tasados y obligaciones incluidas.','Calcular el cambio del valor neto de activos.','Comprobar por separado si han cambiado cobros de alquiler.'],
 936:['Leer condiciones que activan cada pago de licencia.','Separar pagos ya debidos y pagos todavía condicionados.','Presupuestar los desembolsos según sus escenarios y fechas.'],
 940:['Describir cómo gana dinero y qué recursos utiliza cada empresa.','Elegir medidas que representen esas actividades.','Comparar sus resultados manteniendo definiciones compatibles.'],
 944:['Situar vencimientos y necesidades de pago.','Probar cobros disponibles con un escenario adverso.','Evaluar financiación o ajustes si falta dinero en esas fechas.'],
};
function chartQuestion(id,d){
 const options=rotate(d.options,id%3),answer=options.indexOf(d.options[d.answer]);
 const q=choice('Interpreta el gráfico',d.question,options,answer,d.explanation);
 q.figure={kind:'bars',labels:d.labels,values:d.values,unit:d.unit,caption:'Gráfico de un supuesto inventado. Las cantidades no son datos reales de empresa.'};return complete(q,'Mira qué mide cada barra y qué se mantiene igual en el supuesto.');
}
function ensureDifferentKinds(qs,id){
 // No adjacent lessons share an exercise sequence. A repair/table rendition
 // alone is not counted as enough diversity: include ordering or classification
 // when two other questions use the same control.
 if(new Set(qs.map(kind)).size>=3)return qs;
 const q=qs[0],d=reports[id],current=new Set(qs.map(kind));
 if(!current.has('classify'))qs[0]=complete(rows('classify','Contrasta las interpretaciones',`${d.scene}\n\nClasifica cada interpretación según esté respaldada por los datos.`,[d.correct,d.wrongA,d.wrongB].map(label=>({label,options:['Respaldada por los datos','No respaldada por los datos'],answer:label===d.correct?0:1})),d.explanation));
 else qs[0]=complete(rows('table','Completa la conclusión del informe',`${d.scene}\n\n${d.question}`,[{label:'Interpretación de los datos',options:[d.wrongA,d.correct,d.wrongB],answer:1}],d.explanation));
 qs[0].figure=q.figure;
 if(new Set(qs.map(kind)).size<3)qs[1]=repairCase(id,qs[3].type==='numeric');
 if(new Set(qs.map(kind)).size<3)throw Error('Insufficient authored variety '+id);return qs;
}
function lessonTeaching(id,r,q0,q1,q2,q3,preservedNumeric){
 const c=cases[id],p=investigations[id],progress=lateProgression[id];
 const own=teaching[id];if(!own)throw Error('Missing distinct teaching '+id);
 const takeaway=body=>body.split(/(?<=[.!?])\s+/).at(-1);
 const lesson=[
  learn('Entiende la idea',simple(r.concept),simple(r.meaning)),q0,
  learn('Un efecto que importa en la práctica',own.caseTeaching,takeaway(own.caseTeaching)),q1,
  learn('Un paso más en el análisis',own.investigationTeaching,takeaway(own.investigationTeaching)),q2,
 ];
 if(preservedNumeric){lesson.push(preservedNumeric,q3);return lesson;}
 const doc=documentation[id];if(!doc)throw Error('Missing distinct documentation '+id);
 lesson.push(learn('Qué debe demostrar la documentación',doc,takeaway(doc)),q3);
 return lesson;
}
export function refineClarity341To500(result,records){
 let previous;
 for(const lesson of result.lessons.filter(l=>l.id>=790&&l.id<=949)){
  const id=lesson.id,r=records[id-450];
  if(!reports[id]||!cases[id]||!investigations[id]||!lateProgression[id]||!r)throw Error('Missing clarity authorship '+id);
  const oldNumeric=lesson.steps[7].type==='numeric'?structuredClone(lesson.steps[7]):null;
  const oldNumericLearn=oldNumeric?structuredClone(lesson.steps[6]):null;
  // Foundation reports, independent cases, real investigative sources and a
  // useful calculation/procedure have different learning purposes.
  let qs=[matchQuestions[id]?matchQuestion(id,matchQuestions[id]):chartQuestions[id]?chartQuestion(id,chartQuestions[id]):reportQuestion(id),appliedCase(id,!!oldNumeric),investigationQuestion(id),oldNumeric||evidenceQuestion(id)];
  qs=ensureDifferentKinds(qs,id);
  const signature=qs.map(kind).join('|');
  if(signature===previous)qs[1]=repairCase(id,!!oldNumeric);
  previous=qs.map(kind).join('|');
  lesson.steps=lessonTeaching(id,r,...qs,oldNumericLearn);
  lesson.summary=lesson.steps[0].body;lesson.takeaway=lesson.steps[6].takeaway;
  lesson.story={...lesson.story,hideDuringPractice:true,text:lesson.steps[0].takeaway};
  lesson.editorialRevision=CLARITY_341_500_REVISION;
  lesson.editorialBalance={...lesson.editorialBalance,revision:CLARITY_341_500_REVISION,numericPractice:!!oldNumeric,authoredInvestigation:true,visualAppliedReport:true};
  if(lesson.steps.length!==8||new Set([1,3,5,7].map(i=>kind(lesson.steps[i]))).size<3)throw Error('Invalid clarity structure '+id);
 }
 for(const exam of result.exams.filter(e=>e.id>=79&&e.id<=94)){
  exam.steps=exam.steps.map(old=>{
   const id=old.reviewLesson;if(id<790||id>949||old.type==='numeric')return old;
   const p=investigations[id],c=cases[id],d=reports[id];
   // Independent text from both the lesson report and the old opaque challenge.
   // Examinations use existing native controls; no activity-only format is sent
   // to the exam scorer.
   const options=rotate([simple(p.action),simple(p.shortcut),simple(d.wrongA)],id%3);
   const q=choice('Decide qué revisar',simple(`${p.scene}\n\n¿Qué revisión permite comprobar ese problema?`),options,options.indexOf(simple(p.action)),simple(`${p.action}. ${lateProgression[id].investigationTakeaway}`));
   q.reviewLesson=id;delete q.hint;return q;
  });
  exam.editorialRevision=CLARITY_341_500_REVISION;
 }
 return result;
}
