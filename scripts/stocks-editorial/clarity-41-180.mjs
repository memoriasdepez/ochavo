import {pair,learn,choice,multi,match,order,rows,truth,activity,table,usePairs} from './helpers.mjs';
import {cases} from './cases-2-20.mjs';
import {earlySituations} from './early-situations.mjs';
import {earlyProgressionTeaching} from './early-progression-teaching.mjs';
import {earlyChallengeData} from './challenge-early-data.mjs';
import {earlyExtraChallengeData} from './challenge-early-extra.mjs';
import {clarityData} from './clarity-41-180-data.mjs';
import {validateActivity} from '../../src/exercise-formats.js';

const REVISION='stocks-clarity-variety-2026-10-11';
const clone=structuredClone;
const first=text=>text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()||text;
const rotate=(xs,id)=>xs.slice(id%xs.length).concat(xs.slice(0,id%xs.length));
const selection=(title,body,correct,wrong,explanation,id)=>{
 const entries=rotate([{text:correct,yes:true},...wrong.map(text=>({text,yes:false}))],id);
 return choice(title,body,entries.map(x=>x.text),entries.findIndex(x=>x.yes),explanation);
};
const related=pair=>pair[0]+': '+pair[1].charAt(0).toLocaleLowerCase('es')+pair[1].slice(1);
const simpleEvidence=text=>text.replace(/, sin\b.*$/,'').replace(/^La |^El |^Los |^Las /,m=>'Solo '+m.toLocaleLowerCase('es')).replace(/[.]$/,'');
const chart=(labels,values,unit,caption)=>({kind:'bars',labels,values,unit,caption});
const figures={
 490:table(['Plan','Dinero'],[['Matrícula que vence este mes','80 €'],['Posición después de la caída','60 €'],['Otra reserva disponible','0 €']],'Presupuesto de Luis. Los importes son un ejemplo inventado.'),
 491:table(['Dato de la semana','Acción A','Acción B'],[['Precio mínimo y máximo','6–14 €','9–11 €'],['Caja para el próximo vencimiento','Suficiente en este ejemplo','Insuficiente en este ejemplo']],'Precio y capacidad de pago son dos datos distintos. Ninguno resume por sí solo todos los riesgos.'),
 492:table(['Observación','Qué sabemos'],[['Cotización','Ha bajado un 15 %'],['Cliente principal','Canceló un contrato importante'],['Efecto en beneficios','Todavía pendiente de estimar']],'Dos señales distintas: una describe el precio y otra apunta al negocio.'),
 493:chart(['Antes de caer','Tras perder 20 %','Tras subir luego 20 %'],[100,80,96],'€','Una subida y una bajada del mismo porcentaje usan bases distintas. No hay costes ni movimientos adicionales.'),
 494:table(['Liquidación inventada','Importe'],[['Activos vendidos','90 €'],['Deudas con prioridad sobre acciones','100 €'],['Otros recursos recuperables','0 €']],'Para estudiar el resto del accionista primero se atienden las obligaciones prioritarias.'),
 495:table(['Momento','Necesidad o recurso'],[['Hoy','300 € invertidos'],['Dentro de un mes','Pago de 300 €'],['Día del pago tras una caída','Posición de 240 €'],['Posible recuperación','Fecha desconocida']],'Calendario del inversor: la obligación tiene fecha; la recuperación no.'),
 496:chart(['Exposición a Faro en A','Exposición a Faro en B'],[80,20],'€','Ambas carteras valen 100 € antes de la caída. El resto de cada cartera no cambia en el supuesto.'),
 497:table(['Dato','Antes','Después'],[['Precio de la posición','100 $','100 $'],['Valor de un dólar en euros','1 €','0,80 €']],'La posición no cambia en dólares; sí cambia la moneda con la que el inversor mide su dinero.'),
 498:table(['Pregunta','Situación de Clara'],[['¿Le preocupan las caídas?','Se siente tranquila'],['¿Necesita esos ahorros pronto?','Sí, para una factura'],['¿Tiene otra reserva?','No cubre la factura']],'Tranquilidad y dinero disponible responden a preguntas diferentes.'),
 499:table(['Posición','De qué depende'],[['Aerolínea','Viajes a la isla'],['Hoteles','Visitantes de la misma isla']],'Dos actividades distintas pueden depender de la misma demanda.'),
 500:table(['Movimiento','Importe'],[['Precio de las acciones compradas','40 €'],['Tarifa del bróker','1 €'],['Valor días después','36 €']],'El coste del servicio y la variación de la inversión se muestran por separado.'),
 501:table(['Resultado de búsqueda','Clase','Moneda'],[['Faro en mercado A','A','EUR'],['Faro en mercado B','B','USD']],'Antes de comprar hay que comprobar clase, código y mercado. El nombre solo no basta.'),
 502:table(['Oferta disponible','Acciones','Precio por acción'],[['Primera','2','5 €'],['Siguiente','2','6 €']],'Libro de ofertas inventado. Comprar cuatro puede usar las dos ofertas; no hay comisión.'),
 503:table(['Orden y oferta','Precio'],[['Máximo aceptado en la compra','7 €'],['Precio más bajo al que venden','7,20 €']],'El límite de una compra es un máximo, no una obligación del vendedor de bajar su precio.'),
 504:table(['Momento','Precio'],[['Nivel que activa el stop a mercado','10 €'],['Primera oferta de compra tras la noticia','8 €']],'El nivel de activación y el posible precio de venta no son lo mismo.'),
 505:table(['Estado de la orden','Cantidad'],[['Solicitadas','12 acciones'],['Ejecutadas','5 acciones'],['Pendientes hasta cierre','7 acciones']],'Confirmación simulada: pedir una cantidad no significa que ya se haya ejecutado completa.'),
 506:table(['Tarifa','Bróker A','Bróker B'],[['Compra','0 €','2 €'],['Custodia durante un año','4 €','0 €'],['Venta','No se vende','No se vende']],'Se compara una compra y un año de tenencia, sin venta ni otros cargos.'),
 507:table(['Conversión de 100 €','Antes de tarifa','Tarifa adicional'],[['Proveedor A','108 $','0 $'],['Proveedor B','110 $','4 $']],'Para comparar usa lo que recibes después del cargo, no solo el cambio anunciado.'),
 508:table(['Resumen antes de confirmar','Dato'],[['Saldo disponible','50 €'],['Cantidad','10 acciones'],['Precio por acción','5 €'],['Comisión','2 €']],'Resumen de compra inventado: el importe necesario incluye el coste del servicio.'),
 509:table(['Condición del comprador','Dato'],[['Máximo por acción','9 €'],['Mejor oferta de venta','9,30 €'],['Urgencia de ejecutar','No tiene prisa']],'La orden debe respetar las condiciones del comprador, aunque no se ejecute.'),
 511:chart(['Valor actual de A','Valor actual de B'],[100,50],'€','Los pesos se calculan con valores actuales. El número de compras realizadas no cambió.'),
 513:table(['Posición','Actividad','Importe'],[['Banco A','Banca','25 €'],['Banco B','Banca','25 €'],['Banco C','Banca','25 €'],['Banco D','Banca','25 €']],'Cuatro nombres con igual peso pueden seguir concentrados en una actividad.'),
 514:table(['Empresa','Bolsa','Ventas principales'],[['Local','Madrid','España'],['Exterior','Madrid','90 % en dólares a clientes de EE. UU.']],'La actividad económica puede ser distinta aunque el mercado de cotización sea el mismo.'),
 518:chart(['Tres mayores posiciones','Otras 47 posiciones'],[70,30],'%','ETF inventado: estas son participaciones del valor del fondo, no el número de empresas.'),
 519:table(['Posición','Actividad','Valor actual'],[['Banco A','Banca','30 €'],['Banco B','Banca','20 €'],['Alimentación','Consumo','50 €']],'Para detectar concentración bancaria reúne todas las posiciones de esa actividad.'),
 521:table(['Encabezado del informe','Celda publicada','Resumen de terceros'],[['Miles de euros','Ventas: 25','Ventas: 25 €']],'El encabezado define la unidad de la celda. Primero se comprueba la fuente.'),
 522:chart(['Ventas enero-marzo','Ventas enero-junio'],[35,80],'€','Son periodos acumulados: enero-marzo ya está dentro de enero-junio.'),
 526:table(['Periodo','Ventas'],[['Verano anterior','80 €'],['Invierno','50 €'],['Verano actual','90 €']],'La heladería tiene demanda estacional. Compara veranos para estudiar su crecimiento entre temporadas.'),
 527:table(['Dato','Estado'],[['70 € de ventas este año','Publicado en el informe'],['84 € el año próximo','Estimación si entran dos clientes nuevos']],'La estimación depende de un supuesto que aún no ha ocurrido.'),
 533:table(['Suscripciones iguales','Dato'],[['Al comenzar','20'],['Canceladas este mes','4'],['Nuevas','0'],['Cuota mensual','5 €']],'Ingreso recurrente no significa ingreso garantizado: los clientes pueden dejar de pagar cuotas futuras.'),
 535:table(['Canal','Venta','Coste del canal'],[['Plataforma','40 €','8 €'],['Venta directa','40 €','3 €']],'Solo se comparan costes de distribución; todavía falta el coste de producir el artículo.'),
 538:chart(['Alimentación','Limpieza'],[12,-5],'€','Resultado por división. El signo distingue beneficio y pérdida; el total no explica cada negocio.'),
 540:table(['Periodo','Unidades','Precio por unidad'],[['Anterior','10','4 €'],['Actual','8','6 €']],'Ventas = unidades × precio. El número de unidades puede bajar aunque las ventas en euros suban.'),
 541:table(['Ventas actuales del grupo','Importe'],[['Negocio anterior','80 €'],['Empresa recién adquirida','30 €'],['Total actual','110 €'],['Total del año previo, sin adquisición','80 €']],'El aumento publicado incluye una empresa nueva: hay que separar el crecimiento del negocio anterior.'),
 542:table(['Periodo','Ventas locales','Cambio por dólar'],[['Anterior','100 $','0,80 €'],['Actual','100 $','0,90 €']],'Mismas ventas locales con distinta conversión a euros.'),
 543:table(['Región','Ventas antes','Ventas ahora'],[['Norte','40 €','60 €'],['Sur','60 €','50 €']],'Una región puede compensar el descenso de otra; el total no describe las dos.'),
 544:table(['Grupo de clientes','Compras antes','Compras ahora'],[['Antiguos','100 €','80 €'],['Nuevos de este periodo','0 €','40 €']],'Los grupos distinguen el origen de las compras. No se está comparando el número de clientes.'),
 545:table(['Ventas comparables','Antes','Ahora'],[['Empresa','20 €','24 €'],['Mercado completo','100 €','150 €']],'Cuota = ventas de la empresa ÷ ventas del mercado. Ambas bases deben ser comparables.'),
 547:chart(['Noviembre actual','Diciembre anterior','Diciembre actual'],[40,100,90],'€','Que diciembre supere noviembre no implica que haya crecido frente al mismo mes del año anterior.'),
 550:table(['Coste dentro de la capacidad','Con 5 unidades','Con 10 unidades'],[['Alquiler','20 €','20 €'],['Material por unidad','3 €','3 €']],'El alquiler no cambia en este supuesto. El material total sí depende de cuántas unidades se fabriquen.'),
 551:table(['Cuenta simplificada','Importe'],[['Ventas','90 €'],['Coste de ventas','50 €'],['Administración','15 €']],'El bruto descuenta coste de ventas. La administración se descuenta después al pasar al operativo.'),
 552:table(['Empresa','Ventas','Beneficio bruto'],[['A','100 €','40 €'],['B','200 €','60 €']],'Compara la parte de ventas que queda, no solo el beneficio bruto en euros.'),
 554:table(['Cuenta comparable','Anterior','Actual'],[['Ventas','100 €','200 €'],['Beneficio operativo','20 €','30 €']],'Beneficio y margen son distintos. El margen divide el resultado operativo entre ventas.'),
 557:table(['Supuesto','Dato'],[['Costes fijos','25 €'],['Contribución por unidad','4 €'],['Venta fraccionada','No: solo unidades completas']],'El punto teórico puede quedar entre dos unidades. Para cubrir costes con productos completos hay que pasar ese umbral.'),
 558:chart(['Beneficio con 10 unidades','Beneficio con 9 unidades'],[10,5],'€','Cada unidad aporta 5 € y los costes fijos son 40 €. Una venta menos reduce cinco euros de un beneficio inicialmente pequeño.'),
 562:table(['Antes y después del precio','Antes','Después'],[['Precio unitario','10 €','12 €'],['Unidades vendidas','10','6']],'Subir el precio y conservar poder de precios no son lo mismo: también importa la respuesta del cliente.'),
 564:table(['Cambio de proveedor','Importe'],[['Migración inicial','60 €'],['Ahorro anual','20 €'],['Uso restante previsto','1 año']],'Sin otras diferencias de servicio, se compara el ahorro durante el tiempo de uso con el coste del cambio.'),
 570:table(['Documento','Qué describe'],[['Resultados','Ingresos y gastos de enero a diciembre'],['Balance','Recursos y obligaciones el 31 de diciembre'],['Flujos','Entradas y salidas de dinero del año']],'Documentos complementarios: un beneficio anual no es un saldo de banco al cierre.'),
 571:table(['Calendario del servicio','Hecho'],[['Marzo','Servicio terminado y facturado: 50 €'],['Abril','Cliente paga esos 50 €']],'El ejemplo reconoce el ingreso al terminar el servicio. El cobro llega después.'),
 572:table(['Cuenta simplificada','Importe'],[['Ventas','150 €'],['Coste de ventas','90 €'],['Administración','30 €']],'Producción y administración son partidas distintas. Ambas se descuentan para el operativo de este caso.'),
 573:table(['Máquina inventada','Dato'],[['Precio y pago hoy','80 €'],['Vida de uso asumida','4 años'],['Valor final asumido','0 €'],['Método','Reparto uniforme']],'El pago ocurre al comprar. La depreciación reparte el gasto entre los años de uso.'),
 574:table(['Resultado simplificado','Importe'],[['EBITDA','30 €'],['Depreciación','12 €'],['Renovación de maquinaria','Necesaria; importe aún no informado']],'EBITDA excluye depreciación; no demuestra cuánto dinero queda después de renovar maquinaria.'),
 575:chart(['Resultado operativo','Intereses'],[8,11],'€','El negocio gana antes de financiarse, pero ese importe no cubre los intereses del ejemplo. No hay otros efectos ni impuestos.'),
 576:table(['Tramo de resultados','Importe'],[['Operativo, con producción y administración ya descontadas','25 €'],['Intereses pendientes de descontar','4 €'],['Impuestos pendientes de descontar','6 €']],'No se descuentan dos veces partidas que ya estaban dentro de un subtotal.'),
 577:table(['Resultado publicado','Importe'],[['Beneficio neto total','40 €'],['Ganancia neta excepcional por edificio, incluida arriba','15 €']],'Separar el efecto incluido permite estudiar cuánto dependió el resultado de una operación singular.'),
 578:table(['Ajuste de reestructuración','Frecuencia'],[['Gasto excluido este año','10 €'],['Gasto parecido excluido en años previos','Cada uno de los últimos cinco años']],'Llamar extraordinario a un coste no demuestra que sea poco habitual.'),
 579:table(['Cuenta simulada','Importe'],[['Ventas','120 €'],['Costes operativos','80 €'],['Intereses','10 €'],['Impuestos','5 €']],'Reconstruye los tramos sin saltarte la financiación.'),
 580:table(['Balance simplificado','Importe'],[['Activos','90 €'],['Pasivos','65 €']],'Activos = pasivos + patrimonio. El patrimonio es la diferencia contable, no otra entrada de caja.'),
 581:table(['Recurso o pago','Disponibilidad'],[['Caja','10 € accesibles'],['Depósito','40 € bloqueados seis meses'],['Factura','25 € que vencen mañana']],'El plazo importa: no todo activo financiero está disponible cuando hace falta.'),
 582:table(['Cliente','Saldo','Estado'],[['A','20 €','Pago previsto la semana próxima'],['B','20 €','Seis meses de retraso']],'Importes iguales con distinta información sobre recuperación y plazo.'),
 583:table(['Ropa fuera de temporada','Dato'],[['Coste registrado','50 €'],['Venta esperada','30 €'],['Otros costes de salida','0 € en este ejemplo']],'El coste pasado no garantiza lo que podrá recuperarse al vender.'),
 584:table(['Equipo','Importe'],[['Coste original','120 €'],['Depreciación acumulada','40 €'],['Oferta de un comprador','70 €']],'Valor contable y precio ofrecido miden cosas distintas.'),
 585:table(['Adquisición simplificada','Importe'],[['Precio pagado','90 €'],['Activos identificables menos obligaciones valorados','60 €'],['Otros ajustes','0 €']],'El exceso del precio es fondo de comercio en el supuesto, no dinero en la cuenta bancaria.'),
 586:table(['Compra de materiales','Hecho'],[['Material recibido hoy','45 €'],['Pago acordado','Dentro de un mes'],['Pago realizado hoy','0 €']],'Recibir a crédito crea una obligación aunque hoy no salga dinero.'),
 587:table(['Empresa','Deuda total','Vence el mes próximo'],[['A','100 €','80 €'],['B','100 €','10 €']],'La deuda total coincide; el calendario de devolución no.'),
 588:table(['Balance','Importe'],[['Activos totales','100 €'],['Caja incluida en esos activos','5 €'],['Pasivos','40 €']],'El patrimonio no se identifica con caja disponible.'),
 589:table(['Pago o recurso','Dato'],[['Caja','8 €'],['Máquina','100 €, no vendible a tiempo'],['Factura','20 €, mañana']],'Liquidez significa poder atender un pago a tiempo, no solo tener bienes valiosos.'),
 590:chart(['Entrada por préstamo','Consumo de caja operativa'],[40,-10],'€','La suma de ambos movimientos aumenta el saldo en 30 €, pero la actividad por sí sola consume caja.'),
 591:table(['Movimiento del año','Importe'],[['Ventas facturadas','80 €'],['Cobros de clientes','50 €'],['Pagos de funcionamiento','35 €']],'El flujo operativo cuenta cobros y pagos; no sustituye el cobro por toda la facturación.'),
 592:table(['Conciliación simplificada','Importe'],[['Beneficio','16 €'],['Depreciación sin pago del año','6 €'],['Otros ajustes','0 €']],'Se deshace del beneficio un gasto que no había restado dinero este año.'),
 594:table(['Clientes pendientes','Importe'],[['Al comienzo','10 €'],['Al final','25 €'],['Caja operativa antes de ese ajuste','40 €']],'Se ajusta el cambio de los saldos pendientes, no todo el saldo final.'),
 595:chart(['Pago por equipos','Cobro por vender equipo usado'],[-60,15],'€','El signo distingue salida y entrada de inversión; no son dos salidas.'),
 596:chart(['Deuda recibida','Principal devuelto'],[70,-20],'€','Financiación: una entrada y una devolución. No son cobros de clientes.'),
 597:table(['Conciliación del año','Importe'],[['Caja inicial','15 €'],['Operaciones','+20 €'],['Inversión','−12 €'],['Financiación','−3 €']],'No hay otros efectos. Suma los cambios con su signo al saldo inicial.'),
 598:table(['Movimiento','Importe'],[['Caja operativa','35 €'],['Compra de equipos','20 €'],['Deuda nueva','10 €']],'Aquí flujo libre = caja operativa menos compra de equipos. La financiación se mantiene separada.'),
 599:table(['Movimiento','Importe'],[['Caja inicial','10 €'],['Operaciones','−5 €'],['Venta de edificio','+20 €'],['Caja final','25 €']],'Un saldo mayor puede venir de vender activos y no de una operación más fuerte.'),
 600:table(['Servicio ya terminado','Hecho'],[['Venta reconocida','60 €'],['Costes pagados hoy','40 €'],['Cobro del cliente','Dentro de dos meses']],'La ganancia contable y el movimiento de caja de hoy pueden tener signos distintos.'),
 601:table(['Suscripción de servicio','Dato'],[['Cobrado al inicio','60 €'],['Duración total','6 meses iguales'],['Prestado al cierre','2 meses']],'Cobrar antes no equivale a haber prestado ya el servicio completo.'),
 604:table(['Capital ligado a operación','Antes','Ahora'],[['Clientes más existencias','70 €','100 €'],['Proveedores pendientes','40 €','40 €']],'En este ejemplo se usa clientes + existencias − proveedores. Se compara cómo cambia esa necesidad.'),
 605:table(['Días del ciclo','Antes','Ahora'],[['Almacén','20','20'],['Cobro tras la venta','15','15'],['Pago al proveedor','10','25']],'Ciclo = días de almacén + días de cobro − días de pago. Más plazo pactado de proveedor resta días que financiar.'),
 607:table(['Equipo adquirido','Uso','Importe'],[['Sustitución equivalente','Mantener capacidad','20 €'],['Línea adicional','Ampliar capacidad','30 €']],'No todo equipo nuevo representa nueva capacidad.'),
 609:table(['Calendario de caja','Movimiento'],[['Lunes','Saldo de 12 €'],['Martes','Pago de 20 €'],['Viernes','Cobro confirmado de 15 €']],'No hay otros movimientos. Primero hay que superar el déficit del martes.'),
 610:table(['Empresa','Beneficio','Capital usado'],[['A','9 €','60 €'],['B','12 €','120 €']],'Misma definición y periodo. Para comparar eficiencia se divide beneficio entre capital usado.'),
 611:table(['Empresa','Importe'],[['Beneficio para accionistas','10 €'],['Patrimonio medio contable','50 €'],['Capitalización en bolsa','200 €']],'ROE usa beneficio para accionistas y patrimonio medio contable, no precio bursátil.'),
 612:table(['ROA publicado','Numerador','Base'],[['Empresa A','Beneficio neto','Activos'],['Empresa B','Resultado antes de intereses','Activos']],'El mismo nombre no asegura que ambas entidades hayan usado la misma definición.'),
 614:table(['ROIC definido en el ejemplo','Dato'],[['Operativo después de impuestos','18 €'],['Capital invertido medio','90 €'],['Intereses','3 €, separados del numerador definido']],'La definición se fija antes de calcular. Restar intereses cambiaría este criterio.'),
 615:table(['Empresa','Beneficio','Patrimonio','Deuda relativa'],[['A','10 €','100 €','Menor'],['B','10 €','50 €','Mayor']],'Más ROE puede proceder de una base de patrimonio menor y mayor deuda.'),
 616:table(['Empresa','Margen','Rotación'],[['A','20 %','1 vez'],['B','10 %','3 veces']],'En este modelo: rendimiento = margen × rotación. Se mantienen criterios de resultado y capital comparables.'),
 617:table(['Parte del negocio','Dato'],[['Capital antiguo','Rinde 20 %'],['Ampliación nueva','Usa 100 €'],['Resultado adicional estabilizado','5 € por año']],'El rendimiento de la ampliación usa su capital y su resultado adicional, no la tasa del negocio anterior.'),
 618:chart(['Rendimiento esperado','Rendimiento exigido para ese riesgo'],[7,10],'% anual','Se comparan bajo la misma definición. Una ganancia positiva puede quedar por debajo de lo exigido por el riesgo.'),
 620:table(['Presupuesto de caja','Importe'],[['Caja total','90 €'],['Pagos próximos necesarios','50 €'],['Dividendo propuesto','70 €']],'Primero se reserva lo necesario para cumplir pagos; no toda la caja es excedente.'),
 621:table(['Proyecto','Inversión','Resultado anual esperado'],[['A','40 €','6 €'],['B','80 €','6 €']],'Mismo plazo y riesgo en este caso. El cociente simple ayuda a comparar capital necesario.'),
 622:table(['Compra de empresa','Importe'],[['Precio anunciado','80 €'],['Integración inicial','20 €'],['Resultado adicional anual estabilizado','10 €']],'La integración también compromete capital en este ejemplo.'),
 625:chart(['Caja libre generada','Dividendo pagado'],[20,30],'€','El resto se financia con deuda nueva. Pagar una vez no demuestra sostenibilidad futura.'),
 626:table(['Acciones en circulación','Movimiento'],[['Al inicio','100'],['Recompradas y retiradas','−10'],['Nuevas para empleados','+10']],'La variación neta incluye retiradas y emisiones.'),
 627:table(['Recompra','Escenario A','Escenario B'],[['Presupuesto','60 €','60 €'],['Precio por acción','6 €','10 €']],'Se aísla el efecto del precio sobre las acciones retiradas. No hay gastos.'),
 628:table(['Proyecto estabilizado','Capital usado','Resultado anual'],[['A','50 €','15 €'],['B','50 €','0 €']],'El historial conjunto incluye los proyectos que no funcionaron.'),
 629:table(['Presupuesto','Importe'],[['Dinero disponible','80 €'],['Mantenimiento necesario','30 €'],['Reparto propuesto','60 €']],'Las alternativas deben evaluarse después de reservar recursos necesarios.'),
};

const recipes=[['match','choice','truth'],['classify','clues','all'],['table','truth','intruder'],['match','all','choice'],['classify','choice','clues'],['table','clues','truth'],['match','truth','all'],['classify','all','intruder']];
// Cuando ya hay un cálculo útil al final, el caso enseña a interpretar o
// elegir los datos. No se añade otra cuenta por obligación de formato.
const qualitativeCases={
 496:['¿Por qué una misma caída de Faro afecta de forma distinta a estas carteras?','La cantidad expuesta a Faro es distinta.','La caída porcentual de Faro cambia según quién tenga las acciones.','El peso se determina solo contando cuántos nombres hay.','Se aplica la misma caída a importes expuestos diferentes.'],
 506:['¿Qué error evitarías al comparar estas tarifas?','Elegir solo por el coste de compra, dejando fuera la tenencia.','Incluir la custodia durante el año que mantienes los títulos.','Comparar el mismo número de compras en ambas entidades.','La tarifa más llamativa no resume todo el uso que se ha indicado.'],
 507:['¿Qué cifra deberías comparar entre A y B?','Los dólares finalmente recibidos después de las tarifas.','Solo los dólares anunciados antes de la comisión.','Solo el número de conceptos que cobra cada proveedor.','Lo recibido neto permite comparar el mismo importe enviado.'],
 511:['¿Por qué el reparto dejó de ser mitad y mitad?','Una posición cambió de valor más que la otra.','El peso queda fijado por el número de compras.','Solo puede cambiar el peso si se venden acciones.','El peso responde al valor actual, aunque no hagas operaciones.'],
 540:['¿Qué explicación encaja con el crecimiento de ventas?','El precio mayor compensa la caída de unidades.','Las unidades crecieron en la misma proporción que el precio.','El precio no importa cuando el número de unidades baja.','Se revisan cantidad y precio por separado antes de atribuir el crecimiento.'],
 541:['¿Qué dato permite estudiar si creció el negocio que ya existía?','Las ventas actuales sin incluir las de la nueva adquisición.','Solo las ventas totales de 110 €.','El precio pagado por la adquisición, sin sus ventas.','Hay que mantener la misma composición del grupo al comparar el negocio anterior.'],
 542:['¿Qué demuestra que este aumento en euros no viene de vender más en dólares?','Las ventas locales son iguales en los dos años.','El euro publicado es mayor este año.','La conversión usa euros en vez de dólares.','La base local permanece en 100 $; el cambio monetario explica la diferencia convertida.'],
 545:['¿Cómo puede crecer la empresa y perder cuota al mismo tiempo?','El mercado crece más deprisa que sus ventas.','El crecimiento de ventas siempre aumenta la cuota.','La cuota depende del precio de la acción, no de ventas.','La cuota compara ventas propias con un mercado que también cambia.'],
 551:['¿Qué partida se descuenta después del beneficio bruto para llegar al operativo de este ejemplo?','Administración.','De nuevo el coste de los productos vendidos.','Las ventas del periodo.','El coste de ventas ya se descontó para obtener el bruto.'],
 552:['¿Qué comparación responde a cuál retiene una mayor parte de sus ventas después del coste de ventas?','Beneficio bruto dividido entre ventas de cada empresa.','Solo el beneficio bruto en euros de cada empresa.','Solo las ventas totales de cada empresa.','El margen mide una proporción; el importe de beneficio mide tamaño.'],
 554:['¿Por qué aumentar beneficio no demuestra que el margen mejore?','Las ventas pueden aumentar proporcionalmente más.','El margen depende únicamente de gastos financieros.','El margen permanece fijo cuando hay beneficio positivo.','El resultado operativo se compara con su base de ventas.'],
 555:['¿Qué distingue el margen neto del operativo en esta cuenta?','El neto también refleja los intereses e impuestos indicados.','El neto usa el mismo resultado pero divide entre otra cifra de ventas.','El operativo descuenta intereses dos veces.','Se baja al resultado después de financiación e impuestos, manteniendo la misma base de ventas.'],
 556:['¿Por qué una contribución positiva por producto no basta para ganar en total?','Todavía hay que cubrir los costes fijos.','Los costes variables no se han descontado al obtener esa contribución.','Cada producto cubre por sí solo todo el alquiler.','La suma de contribuciones debe alcanzar primero los costes fijos.'],
 557:['El cálculo teórico da 6,25 unidades. ¿Por qué no basta vender seis productos completos?','Su contribución queda por debajo del coste fijo.','Porque se debe redondear siempre cualquier número hacia arriba.','Porque el coste fijo se duplica al vender seis.','Se sube al siguiente entero solo para alcanzar el umbral con unidades completas.'],
 558:['¿Por qué el porcentaje de caída del beneficio puede ser mayor que el de unidades?','El coste fijo no baja al perder esa venta.','El coste fijo aumenta cada vez que se vende menos.','La contribución por unidad subió en el supuesto.','La venta perdida resta contribución mientras permanece la estructura fija.'],
 573:['¿Por qué no es correcto tratar el gasto anual como el pago del primer día?','El gasto se reparte por uso; el desembolso ocurrió completo al comprar.','La depreciación es otra factura pagada al proveedor cada año.','Registrar gasto significa que no hubo compra de un activo.','Pago y reparto contable del coste tienen calendarios diferentes.'],
 574:['¿Qué limitación sigue teniendo el EBITDA para juzgar el dinero disponible?','No descuenta por sí solo lo necesario para renovar equipos.','Siempre incluye el pago íntegro de toda máquina comprada.','Es lo mismo que saldo de caja al final del año.','Excluir depreciación no elimina la necesidad económica de mantenimiento.'],
 576:['¿Qué error debe evitarse al pasar de operativo a neto?','Volver a descontar producción y administración, ya incluidas.','Restar los intereses que todavía faltan.','Considerar los impuestos del ejemplo en el último tramo.','Cada partida se descuenta una vez en el tramo correspondiente.'],
 580:['Si se compra una máquina financiada completamente con deuda, ¿qué aumenta inicialmente?','Activos y pasivos, sin crear por esa compra un beneficio.','Solo el patrimonio porque la empresa tiene más máquinas.','Solo los activos, porque la deuda no es un recurso físico.','El recurso adquirido tiene una obligación de financiación correspondiente.'],
 592:['¿Por qué se añade la depreciación en esta conciliación?','Porque redujo beneficio sin ser un pago del año.','Porque representa un cobro nuevo de clientes.','Porque la máquina no tendrá que sustituirse nunca.','Se deshace un gasto sin desembolso de ese periodo; no se crea dinero.'],
 597:['¿Qué informa la conciliación que no aporta solo mirar el saldo final?','Qué categorías explican el cambio desde el saldo inicial.','El precio justo de todas las acciones.','El beneficio neto exacto sin consultar resultados.','El puente de caja identifica entradas y salidas del periodo.'],
 598:['¿Por qué la deuda nueva se mantiene fuera de esta definición de flujo libre?','Financia la empresa, pero no es caja generada por la actividad tras invertir.','Nunca cambia el dinero disponible en el banco.','Ya está incluida necesariamente en la caja operativa.','La financiación se distingue de la generación de la actividad y su inversión.'],
 605:['¿Por qué ampliar el plazo pactado con el proveedor puede reducir el ciclo?','La empresa paga más tarde sin retrasar su propio cobro.','La empresa cobra más tarde y por eso necesita menos dinero.','Los productos permanecen más días en el almacén.','En este caso cambia el tiempo hasta pagar; almacén y cobro se mantienen.'],
 611:['¿Por qué no usar los 200 € de cotización como base del ROE contable?','El ROE relaciona beneficio con patrimonio contable, no con precio bursátil.','La cotización se usa solo cuando el beneficio es positivo.','El ROE no utiliza ningún capital como base.','Cambiar patrimonio por precio responde a una comparación distinta.'],
 612:['¿Qué harías antes de comparar estas dos cifras de ROA?','Igualar definición de resultado y periodo.','Escoger el porcentaje mayor sin revisar sus componentes.','Promediar ambos resultados aunque usen criterios distintos.','Los nombres iguales no corrigen diferencias de criterio.'],
 614:['¿Por qué no restar también los intereses al numerador indicado?','Cambiaría el resultado operativo después de impuestos que define este ROIC.','Porque pagar intereses no consume dinero.','Porque el capital invertido ya incluye esos intereses como beneficio.','Esta definición fija un numerador operativo independiente de cómo se financia.'],
 616:['¿Qué enseña combinar margen y rotación?','Un margen menor puede compensarse con más ventas por euro de capital.','Un margen mayor siempre produce más rendimiento del capital.','La rotación deja de importar cuando el beneficio es positivo.','Se evalúan las dos piezas del modelo y no una aislada.'],
 617:['¿Por qué estudiar la ampliación por separado?','Su rendimiento puede diferir del que obtiene el negocio antiguo.','La tasa histórica se aplica automáticamente a cualquier proyecto nuevo.','El coste de ampliar no forma parte del capital usado.','La inversión adicional debe explicar qué resultado adicional puede generar.'],
 618:['¿Por qué no basta con que el proyecto espere una rentabilidad positiva?','Debe compararse con lo exigido para ese riesgo.','Todo porcentaje positivo elimina la posibilidad de pérdidas.','La exigencia se fija siempre por debajo del rendimiento esperado.','La referencia de riesgo permite interpretar el rendimiento esperado.'],
 623:['Además del interés evitado, ¿qué revisarías antes de devolver toda la deuda?','Que quede dinero suficiente para operar y pagar vencimientos próximos.','Solo si el interés evitado es una cifra positiva.','Solo cuántas acciones tiene la empresa.','Reducir deuda puede ayudar, pero no debe dejar sin recursos pagos necesarios.'],
 626:['¿Por qué no basta con anunciar diez recompras para afirmar que hay diez acciones menos?','También se han emitido acciones nuevas.','Las acciones retiradas vuelven automáticamente al día siguiente.','El número inicial es irrelevante para el total final.','Se revisa el cambio neto de acciones, incluyendo emisión y retirada.'],
 627:['¿Qué debe añadirse para decidir si una recompra a 6 € crea valor?','Una estimación razonada del valor y de otros usos de ese dinero.','Solo que permite retirar más títulos que a 10 €.','Solo que el precio cayó frente al máximo histórico.','Un precio menor retira más títulos con igual presupuesto, pero eso no demuestra que sea atractivo frente al valor.'],
};
function adaptedCase(id,c){
 const q=qualitativeCases[id];
 return q?{...c,question:q[0],correct:q[1],explanation:q[4]}:c;
}
function mapping(id,data,kind){
 const body='Relaciona cada situación con lo que implica. Son ejemplos distintos: no tienes que calcular ninguna cifra.';
 const explanation=data.pairs.map(related).join('. ')+'.';
 if(kind==='match')return match('Relaciona situaciones e ideas',body,data.pairs,explanation);
 const options=rotate(data.pairs.map(p=>p[1]),id);
 const entries=data.pairs.map(([label,correct])=>({label,options,answer:options.indexOf(correct)}));
 const result=rows(kind,kind==='table'?'Completa la lectura de los casos':'Agrupa por su significado',body,entries,explanation);
 result.activity.instruction=kind==='table'?'Completa cada fila con su consecuencia o significado.':'Toca una situación y después su grupo.';
 if(kind==='table')result.activity.columnLabels=['Situación','Qué implica'];
 return result;
}
function caseExercise(id,c,data,kind){
 const body=c.scene+'\n\n'+c.question;
 const base=selection('Decide en este caso',body,c.correct,data.wrong,c.explanation,id);
 if(kind==='truth')return truth('Evalúa estas dos respuestas',body,[[c.correct,true],[data.wrong[(id+1)%2],false]],c.explanation);
 if(kind==='all')return truth('Revisa tres respuestas posibles',body,rotate([[c.correct,true],...data.wrong.map(x=>[x,false])],id),c.explanation);
 if(kind==='clues')return activity(base,'clues',{options:base.options.map(o=>o.text),answer:base.answer,clues:['Separa los datos observados de las conclusiones de las tres opciones.','Descarta la opción que añade una condición o una cantidad que no aparece en el caso.'],instruction:'Elige una respuesta. Las pistas son opcionales.'});
 return base;
}
function nuanceExercise(id,s,teaching,kind){
 const body=s.scene+'\n\n'+(kind==='intruder'?'Señala la conclusión incorrecta.':'¿Qué puedes concluir con estos datos?');
 const explanation=teaching.nuanceBody;
 const base=selection('Una situación diferente',body,s.correct,[s.incorrect],explanation,id+1);
 if(kind==='truth')return truth('Comprueba las conclusiones',s.scene,rotate([[s.correct,true],[s.incorrect,false]],id+1),explanation);
 if(kind==='all'){
  const statements=rotate([{text:s.correct,yes:true},{text:'Para comprobarlo, estudiaría '+s.evidence.charAt(0).toLocaleLowerCase('es')+s.evidence.slice(1),yes:true},{text:s.incorrect,yes:false}],id);
  return activity(base,'all',{options:statements.map(x=>x.text),answers:statements.flatMap((x,i)=>x.yes?[i]:[]),instruction:'Selecciona las dos conclusiones o comprobaciones que encajan con el caso.'});
 }
 if(kind==='intruder'){
  const options=rotate([s.correct,s.incorrect,'La revisión útil es '+s.evidence.charAt(0).toLocaleLowerCase('es')+s.evidence.slice(1)],id);
  return activity(base,'intruder',{options,answer:options.indexOf(s.incorrect),instruction:'Marca la única conclusión equivocada.'});
 }
 if(kind==='clues')return activity(base,'clues',{options:base.options.map(o=>o.text),answer:base.answer,clues:['Identifica primero qué cambió en la situación.','Comprueba si cada conclusión requiere información que todavía no se conoce.'],instruction:'Resuelve la situación. Puedes abrir las pistas si lo necesitas.'});
 return base;
}
function evidenceExercise(id,s,teaching){
 const detail={...earlyChallengeData,...earlyExtraChallengeData}[id];
 const body=s.scene+'\n\n¿Qué revisión incluye los datos necesarios para comprobar este problema?';
 // Alternativas parciales del mismo asunto: dos revisiones pueden contener
 // cifras verdaderas, pero dejar fuera una pieza necesaria para esta duda.
 const wrong=detail.evidenceWrong.map(simpleEvidence);
 return selection('Decide qué datos reunir',body,s.evidence,wrong,teaching.checkBody,id+2);
}

export function refineClarity41To180(result,records){
 for(const lesson of result.lessons.filter(l=>l.id>=490&&l.id<=629)){
  const id=lesson.id,r=records[id-450],c=adaptedCase(id,cases[id]),s=earlySituations[id],teaching=earlyProgressionTeaching[id],data=clone(clarityData[id]);
  if(qualitativeCases[id])data.wrong=qualitativeCases[id].slice(2,4);
  if(!r||!c||!s||!teaching||!data)throw Error('Falta claridad de Acciones '+id);
  const originalNumeric=lesson.steps[7].type==='numeric'?clone(lesson.steps[7]):null;
  const recipe=recipes[(id-490)%recipes.length];
  const foundation=pair(lesson.title,r.concept,r.meaning,mapping(id,data,recipe[0]));
  const casePair=pair('Llévalo a un caso concreto',teaching.caseBody,first(teaching.caseBody),caseExercise(id,c,data,recipe[1]));
  if(figures[id]){casePair[0].figure=clone(figures[id]);casePair[1].figure=clone(figures[id]);}
  const nuancePair=pair('Otra situación que conviene distinguir',teaching.nuanceBody,first(teaching.nuanceBody),nuanceExercise(id,s,teaching,recipe[2]));
  const finalPair=originalNumeric?[clone(lesson.steps[6]),originalNumeric]:pair('Antes de decidir, comprueba esto',teaching.checkBody,first(teaching.checkBody),evidenceExercise(id,s,teaching));
  let pairs=[foundation,casePair,nuancePair,finalPair];
  // Cambiar el orden de dos aplicaciones cambia el ritmo, sin separar una
  // pregunta de su explicación y sin mover el cálculo de su posición histórica.
  if(id%2)pairs=[foundation,nuancePair,casePair,finalPair];
  usePairs(lesson,pairs);
  specialLessons(lesson,id,r);
  // Ampliación compatible de la explicación pública; las etapas históricas
  // y las cuatro prácticas mantienen su autoría y respuestas originales.
  if(id===500)lesson.steps[0].body='Para comprar o vender acciones cotizadas en bolsa, como particular necesitas un intermediario autorizado: no envías tu compra directamente al mercado por tu cuenta. Ese intermediario se llama bróker. Normalmente usas su aplicación o su web para elegir las acciones y enviar una orden, es decir, la instrucción de comprar o vender. La plataforma es la herramienta; la entidad que está detrás tramita la operación. También puede ofrecer custodia: mantener registradas tus acciones y gestionar cobros, como los dividendos. Por estos servicios puede cobrar comisiones, además del importe de las acciones.';
  if(id===503){
   lesson.steps[2].body='Una compra limitada no obliga a nadie a vender por tu máximo. Si todas las ofertas lo superan, la orden puede esperar mientras esté vigente o terminar sin ejecución. Que el precio parezca cercano al límite no cambia esa condición.';
   lesson.steps[2].takeaway='Si ningún vendedor acepta tu máximo, la compra puede seguir pendiente.';
   lesson.steps[3].explanation=lesson.steps[2].body;
   lesson.steps[3].hint='Revisa si algún precio de venta respeta el máximo de la compra.';
   lesson.steps[3].activity.explanation=lesson.steps[3].explanation;
   lesson.steps[3].activity.hint=lesson.steps[3].hint;
  }
  if(id===544){
   for(const step of lesson.steps){
    for(const key of ['body','takeaway','hint'])if(typeof step[key]==='string')step[key]=step[key].replace('pérdida de clientes anteriores','una caída de las compras de clientes anteriores');
    if(step.activity?.hint)step.activity.hint=step.activity.hint.replace('pérdida de clientes anteriores','una caída de las compras de clientes anteriores');
   }
  }
  lesson.editorialRevision=REVISION;
  lesson.summary=lesson.steps[0].body;
  lesson.takeaway=lesson.steps[6].takeaway;
  for(const step of lesson.steps)if(step.activity)validateActivity(step.activity,'Acciones '+id);
  let kinds=new Set(lesson.steps.filter(x=>x.type!=='learn').map(x=>x.activity?.kind||x.type));
  if(kinds.size<3){
   const fresh=['match','classify','table'].find(k=>!kinds.has(k));
   if(fresh)lesson.steps[1]=mapping(id,data,fresh);
   kinds=new Set(lesson.steps.filter(x=>x.type!=='learn').map(x=>x.activity?.kind||x.type));
  }
  if(kinds.size<3)throw Error('Faltan dinámicas distintas en '+id);
  if(originalNumeric&&JSON.stringify(lesson.steps[7])!==JSON.stringify(originalNumeric))throw Error('Cálculo alterado '+id);
 }
 for(const exam of result.exams.filter(e=>e.id>=49&&e.id<=62)){
  exam.steps=exam.steps.map((old,index)=>{
   if(old.type==='numeric')return old;
   const id=old.reviewLesson??exam.id*10+index,s=earlySituations[id],t=earlyProgressionTeaching[id],d=clarityData[id];
   if(id<490||id>629)return old;
   let question;
   if(index===0||index===5)question=match('Relaciona los tres casos','Cada situación corresponde a una implicación diferente. Relaciona las tres.',d.pairs,d.pairs.map(related).join('. ')+'.');
   else if(index===3||index===8)question=multi('Selecciona lo que encaja',s.scene+'\n\nMarca las dos respuestas que describen el caso o ayudan a investigarlo.',rotate([s.correct,'Revisar '+s.evidence.charAt(0).toLocaleLowerCase('es')+s.evidence.slice(1),s.incorrect],id),[0,1].map(i=>(i-(id%3)+3)%3),t.nuanceBody+' '+t.checkBody);
   else{
    const evidence=index%3===1, detail={...earlyChallengeData,...earlyExtraChallengeData}[id];
    const scene=detail?.examScene||s.scene;
    const correct=evidence?s.evidence:s.correct;
    const wrong=evidence?detail?.evidenceWrong?.map(simpleEvidence):[s.incorrect];
    question=selection(evidence?'Elige una comprobación útil':'Interpreta el caso',scene+'\n\n'+(evidence?'¿Qué información revisarías para comprobar el problema?':'¿Qué conclusión puedes defender con estos datos?'),correct,(wrong?.length?wrong:[s.distraction]).slice(0,2),evidence?t.checkBody:t.nuanceBody,id+index);
   }
   question.reviewLesson=old.reviewLesson??id;
   delete question.hint;
   return question;
  });
  exam.editorialRevision=REVISION;
 }
 return result;
}

function specialLessons(lesson,id,r){
 // Las primeras dos decenas se escriben individualmente más abajo.
 const special=specials[id];
 if(!special)return;
 for(const [slot,p]of special){
  if(lesson.steps[slot+1].type==='numeric')throw Error('Se intentó sustituir un cálculo '+id);
  lesson.steps[slot]=clone(p[0]);lesson.steps[slot+1]=clone(p[1]);
 }
}
const specials={};
const set=(id,slot,title,body,takeaway,exercise,figure)=>{
 const p=pair(title,body,takeaway,exercise,figure);
 if(figure)p[1].figure=clone(figure);
 (specials[id]??=[]).push([slot,p]);
};
const ordered=(title,body,items,feedback,id)=>{
 const scrambled=rotate(items,id%items.length||1);
 return order(title,body,scrambled,items.map(x=>scrambled.indexOf(x)),feedback);
};
const repair=(title,body,label,wrongWord,options,answer,feedback)=>{
 const ex=rows('repair',title,body,[{label,wrongWord,options,answer}],feedback);
 ex.activity.instruction='Sustituye el fragmento señalado por la opción que corrige la frase.';
 return ex;
};

set(490,4,'El riesgo se concreta con una fecha',
 'El riesgo no se resume diciendo «esta acción se mueve mucho». Si vas a usar el dinero para una matrícula, importa qué pasaría el día del pago. Primero identifica el pago; después cuenta los recursos disponibles sin vender la inversión. Así puedes comprobar si una caída te obligaría a vender en mal momento.',
 'La consecuencia de una pérdida depende también de para qué y cuándo necesitas el dinero.',
 ordered('Prepara la comprobación','Luis piensa invertir el dinero de una matrícula. Ordena los pasos para comprobar si podría pagar aunque la inversión cayera.',[
  'Anotar el importe y la fecha de la matrícula',
  'Comprobar qué recursos líquidos tendría en esa fecha',
  'Comparar esos recursos con el pago antes de decidir qué invertir',
 ],'Primero fijas la obligación, después reúnes los recursos de esa misma fecha y por último compruebas si la cubren.',490));

const volatility=table(['Empresa','Caja disponible mañana','Deuda que vence mañana'],[['A','30 €','20 €'],['B','5 €','15 €'],['C','20 €','10 €']],'Esta tabla muestra capacidad de pago. La amplitud semanal del precio se compara por separado.');
const volatilityPick=activity(choice('¿Dónde aparece el problema de pago?','A, B y C muestran en las barras cuánto se movió el precio esta semana. Con la caja y deuda de la tabla, señala la empresa que necesita conseguir dinero adicional para el vencimiento de mañana.', ['A','B','C'],1,'B tiene 5 € disponibles para un pago de 15 €. Su precio menos movido no elimina esa falta de dinero.'),'hotspot',{options:['A','B','C'],values:[8,2,3],answer:1,axis:'Amplitud del precio de esta semana',unit:'€',instruction:'Señala la empresa con el problema de pago. La barra más alta no es necesariamente la respuesta.'});
set(491,4,'Un precio tranquilo también necesita revisión',
 'La volatilidad describe movimientos de cotización. La capacidad de pagar se comprueba con recursos y vencimientos. Una empresa puede tener un precio casi inmóvil y, aun así, no poder pagar mañana. Conocer una sola de esas dos cosas no permite deducir la otra.',
 'El gráfico de precios y el calendario de pagos responden a preguntas diferentes.',volatilityPick,volatility);

const businessDiff=activity(choice('Distingue negocio y cotización','Compara las dos fichas. Marca los cambios que describen directamente pérdida de actividad del negocio, no solo movimiento de precio.', ['Se pierden clientes','Baja el precio'],0,'La cancelación de un cliente y las menores ventas describen actividad empresarial; la cotización es el precio al que se negocia.'),'differences',{
 options:['Cotización','Contrato principal','Ventas del periodo','Caja disponible'],
 before:['20 €','Renovado','100 €','40 €'],after:['17 €','Cancelado','70 €','40 €'],answers:[1,2],versionLabels:['Antes','Después'],instruction:'Marca las dos filas que describen directamente un deterioro de la actividad.'});
set(492,4,'Busca una explicación en el negocio',
 'Si la acción baja, primero separa lo que ocurre en la bolsa de lo que cambia dentro de la empresa. Perder un contrato y vender menos son señales del negocio. Un precio menor es una señal del mercado. Investigar las primeras ayuda a entender la causa; el gráfico por sí solo no la explica.',
 'La pérdida de actividad se investiga con clientes, ventas y costes.',businessDiff);

set(493,2,'La recuperación trabaja sobre un saldo menor',
 'Tras perder un 20 %, 100 € quedan en 80 €. La siguiente subida se aplica a esos 80 €, no a los 100 € del principio. El gráfico compara ambas etapas. Para recuperar también importa la base del porcentaje; ni el tamaño de la subida necesaria ni esperar más aseguran que ocurra.',
 'Subida y bajada no se cancelan cuando se aplican a bases distintas.',
 selection('Explica lo que muestra el gráfico','La comparación muestra una caída del 20 % seguida de una subida del 20 %. ¿Por qué el saldo final no vuelve al principio?',
 'La subida se aplica a un saldo menor que el inicial.',
 ['La duración de la caída es siempre mayor que la de la subida.','La segunda variación debe calcularse sobre el precio máximo, aunque ya no sea el saldo.'],
 'El primer 20 % se aplica a 100 €; el segundo, a los 80 € que quedan. La diferencia de bases explica el resultado.',493),figures[493]);

set(494,4,'Primero se cumplen las obligaciones prioritarias',
 'En esta liquidación simplificada se venden los recursos de la empresa y, con lo recuperado, se atienden primero las deudas que tienen prioridad sobre las acciones. Solo el resto puede corresponder a los accionistas. Ser propietario no garantiza recuperar lo pagado si no queda nada después de esas deudas.',
 'El accionista depende de lo que quede después de obligaciones prioritarias.',
 ordered('Sigue el orden de esta liquidación','Ordena la revisión para calcular si quedaría algún importe para accionistas en el caso simplificado.',[
  'Estimar cuánto se recupera al vender los activos',
  'Descontar las obligaciones con prioridad sobre acciones',
  'Comprobar si queda un resto para los accionistas',
 ],'La última cotización no es el resto disponible: antes hay que recuperar activos y atender deudas prioritarias.',494));

set(495,4,'La fecha de un pago no espera a la bolsa',
 'Cuando necesitas dinero en un mes, tu plan debe funcionar en esa fecha. Una recuperación posible dentro de varios años no cubre por sí sola ese pago. El calendario te ayuda a elegir qué dinero puede quedarse invertido y qué dinero necesitas mantener disponible para cumplir la obligación.',
 'El plazo útil del dinero lo marca la necesidad de gastarlo, no la esperanza de recuperación.',
 repair('Corrige el plan de Luis','Luis debe pagar un curso el mes próximo. Corrige el fragmento que dirige mal su comprobación.',
 'Antes de invertir para ese curso, reviso primero la fecha de la «última subida».','última subida',
 ['obligación de pago','máxima cotización histórica','noticia más favorable'],0,
 'La fecha del pago existe aunque la acción no se recupere a tiempo. Esa obligación orienta la planificación.'));

set(496,4,'No midas la concentración contando nombres',
 'La concentración depende de cuánto dinero responde a un mismo negocio. Comprar unas pocas acciones de otras empresas cambia poco si casi todo el patrimonio sigue en una sola. También cuenta el sueldo si viene del mismo empleador: un problema puede afectar al ahorro y al ingreso mensual a la vez.',
 'Revisa la parte del ahorro y de los ingresos que depende del mismo negocio.',
 truth('¿Cambió realmente la dependencia?','Ana tiene casi toda la inversión y su sueldo vinculados a Faro. Valora las propuestas.',[
  ['Comprar una posición muy pequeña de otra empresa elimina esa dependencia.',false],
  ['Revisar el peso de Faro y el origen del sueldo ayuda a medir la dependencia conjunta.',true],
  ['Tener muchas acciones de Faro significa diversificar entre empresas.',false],
 ],'Varias acciones de un mismo negocio siguen siendo la misma dependencia. El sueldo añade otra exposición a esa empresa.'));

set(497,4,'Cada riesgo necesita su propia pregunta',
 'Moneda, país y regulación no son etiquetas equivalentes. La moneda afecta a la conversión de cobros y pagos. El país puede afectar a dónde se opera. La regulación cambia qué está permitido o qué condiciones debe cumplir la empresa. Distinguirlos evita buscar una sola explicación para todo.',
 'Separa el origen del problema antes de decidir qué información revisar.',
 rows('classify','Clasifica el cambio principal','Una compañía opera en otro país. Agrupa los tres hechos por el riesgo que describen.',[
  {label:'La moneda de sus cobros pierde valor frente al euro.',options:['Moneda','País','Regulación'],answer:0},
  {label:'Un conflicto interrumpe las fábricas de esa región.',options:['Moneda','País','Regulación'],answer:1},
  {label:'Una norma prohíbe su producto principal.',options:['Moneda','País','Regulación'],answer:2},
 ],'Se mira la causa principal de cada hecho. Los riesgos también pueden combinarse.'));

set(498,4,'Querer asumir riesgo y poder hacerlo',
 'La disposición es cómo te sientes al ver una caída. La capacidad es cuánto daño podrías soportar sin dejar de pagar tus necesidades. Tener confianza no aumenta el dinero disponible. Por eso se revisan gastos próximos y reservas, además de preferencias personales.',
 'La capacidad económica se comprueba con obligaciones y recursos concretos.',
 activity(choice('Revisa la capacidad de Clara','Clara dice que tolera bien caídas. ¿Qué dos datos necesitas para comprobar si puede asumir una pérdida sin incumplir sus pagos?', ['Fechas e importes de sus pagos','Color que prefiere en el gráfico','Reserva fuera de las acciones'],0,'Pagos y reservas permiten comprobar capacidad económica, distinta de la comodidad emocional.'),'all',{
 options:['Fechas e importes de sus pagos próximos','Cuántas personas afirman tolerar caídas','Dinero disponible fuera de las acciones','La mayor subida de la acción en el pasado'],answers:[0,2],instruction:'Selecciona los dos datos que miden su capacidad económica.'}));

set(499,4,'Combina los riesgos en un escenario',
 'Revisar riesgos de uno en uno puede ocultar el efecto conjunto. Si se pierde un cliente al mismo tiempo que vence una deuda, el negocio puede tener menos dinero justo cuando necesita pagar. El objetivo no es adivinar una crisis: es comprobar cómo resistiría el plan si coincidieran dos problemas.',
 'Pregunta qué ocurre si dos riesgos relevantes aparecen a la vez.',
 selection('Elige un escenario útil','Una empresa depende de un cliente y necesita renovar deuda en tres meses. ¿Qué escenario comprueba la combinación de ambos riesgos?',
 'Pierde parte del cliente y el banco no renueva toda la deuda.',
 ['El cliente crece y la deuda se renueva sin cambios.','Se calcula la subida de la acción durante un mes favorable.'],
 'Ese escenario obliga a revisar simultáneamente el dinero que entra y el dinero que debe devolverse.',499));

set(500,4,'Bancos y plataformas especializadas',
 'Los bancos tradicionales también ofrecen este servicio: puedes comprar y vender acciones desde una cuenta de valores del banco. Sus comisiones suelen ser mayores que las de algunas plataformas especializadas en inversión. Por eso muchos inversores comparan ambas opciones antes de elegir. Pero una plataforma especializada no es siempre más barata: depende de sus tarifas y de cómo la uses. Revisa cuánto cobra por comprar y vender, por mantener registradas tus acciones —la custodia— y por cambiar de moneda si compras en otra divisa. Una oferta de «cero comisión» puede dejar otros costes fuera. Comprueba también qué entidad presta el servicio y si está autorizada. Un intermediario barato o autorizado no convierte una mala inversión en una buena.',
 'La calidad del servicio y la calidad de una inversión se investigan por separado.',
 match('¿A quién le preguntarías?','Relaciona cada duda con la información que necesitas buscar.',[
  ['¿Qué cobra por comprar y mantener la posición?','Tarifas del intermediario'],
  ['¿Quién registra y administra mis títulos?','Condiciones de custodia'],
  ['¿Está perdiendo clientes la empresa comprada?','Información del negocio'],
 ],'Las dos primeras dudas son sobre el servicio. La tercera es sobre la empresa de la inversión.'));

set(501,4,'No te quedes con el primer resultado',
 'El nombre comercial puede aparecer en distintos instrumentos y mercados. Comprueba el código, la clase de acción y la moneda antes de autorizar. Una clase es un grupo de acciones de una empresa que puede tener derechos distintos de otra clase. Un número de precio menor tampoco significa una inversión más barata.',
 'Primero identifica el instrumento; después decide si quieres esa inversión.',
 ordered('Comprueba la búsqueda','Buscas Faro clase A en euros. Ordena una revisión que evita comprar otro instrumento.',[
  'Localizar el código de la clase de acción buscada',
  'Comprobar que el resultado tiene ese código, mercado y moneda',
  'Preparar la orden del instrumento ya identificado',
 ],'Identificar primero evita tramitar una compra que solo coincide por nombre.',501));

set(502,4,'Prioridad de ejecución no significa precio fijo',
 'La orden a mercado busca ejecutar con las ofertas disponibles. El último precio de la pantalla no reserva acciones a ese precio. Si una cantidad supera lo ofrecido en el primer nivel, puede comprar también en el siguiente. Las condiciones pueden cambiar mientras se envía la orden.',
 'Aceptas incertidumbre de precio cuando no fijas un límite.',
 repair('Corrige la promesa de precio','Corrige lo que afirma este comprador sobre una orden a mercado.',
 'El precio mostrado antes de enviar la orden es un precio «garantizado».','garantizado',
 ['de referencia que puede cambiar','máximo que no puede superarse','mínimo obligatorio para el vendedor'],0,
 'La pantalla orienta, pero la ejecución usa ofertas disponibles cuando llega la orden.'));

set(503,4,'Precio aceptado y cantidad completada',
 'Puede haber vendedores dentro de tu límite, pero no suficientes acciones para completar la compra. En ese caso se ejecuta una parte y el resto puede seguir pendiente mientras la orden esté vigente. El registro permite comprobar dos cosas diferentes: si se respetó el precio máximo y si se compró toda la cantidad solicitada.',
 'Respetar el límite de precio no garantiza completar toda la cantidad.',
 rows('table','Interpreta una ejecución parcial','Completa la lectura de este registro de una compra limitada. No se pide copiar ninguna cantidad.',[
  {label:'¿Qué demuestra la ejecución registrada sobre el precio?',options:['Se respetó el máximo aceptado.','Se compró necesariamente toda la cantidad.','Se garantizó el precio de futuras ejecuciones.'],answer:0},
  {label:'¿Qué falta para considerar completa la compra?',options:['Cambiar el precio máximo aunque ya se respetó.','Que se ejecute también la cantidad que sigue pendiente.','Contar lo solicitado como si ya estuviera comprado.'],answer:1},
  {label:'¿Qué puede ocurrir con la parte restante?',options:['Se cancela automáticamente por haber una ejecución parcial.','Se ejecuta obligatoriamente antes de vencer.','Puede seguir pendiente o vencer sin ejecución.'],answer:2},
 ],'La parte ejecutada respetó el máximo, pero faltan acciones por comprar. Que quede vigente permite esperar; no obliga a que el resto se complete.'),
 table(['Registro de compra limitada','Estado'],[['Solicitadas','5 acciones'],['Máximo por acción','9 €'],['Ejecutadas','2 acciones a 8,80 €'],['Pendientes','3 acciones'],['Vigencia restante','Hasta el cierre de hoy']],'Registro inventado. Una ejecución puede respetar el precio sin completar toda la cantidad.'));

set(504,4,'Activación y ejecución son dos momentos',
 'Un stop a mercado de venta se activa al alcanzarse su condición. Entonces busca vender con ofertas disponibles. Si el precio salta por una noticia y la primera oferta es peor, puede ejecutarse por debajo del nivel del stop. Ese nivel es un disparador, no un seguro de precio.',
 'El stop a mercado activa la venta; no garantiza el precio al ejecutarla.',
 ordered('Ordena los hechos','Un stop a mercado está en 10 €. Tras una noticia, el primer precio disponible ya es 8 €. Ordena lo que describe este supuesto.',[
  'El precio cumple la condición que activa el stop',
  'La orden activada busca comprador en el mercado',
  'La venta puede usar la oferta disponible de 8 €',
 ],'La oferta que hay al ejecutar puede ser distinta del nivel que activó la orden.',504));

set(505,4,'Lee el estado de lo que falta',
 'Una ejecución parcial compra o vende solo parte de lo solicitado. Esa parte ya existe; la restante sigue sujeta al precio, a la cantidad disponible y a la fecha de vencimiento de la orden. Hay que revisar ejecutadas y pendientes por separado, para no duplicar pedidos ni dar por compradas acciones que faltan.',
 'La confirmación de ejecución es distinta de la solicitud.',
 truth('Revisa la confirmación','Se solicitaron doce acciones: cinco ejecutadas y siete pendientes hasta el cierre. Evalúa estas afirmaciones.',[
  ['Ya existe una compra de cinco acciones.',true],
  ['Es seguro que antes del cierre se comprarán las siete restantes.',false],
  ['Una nueva orden por doce podría duplicar parte de la compra prevista.',true],
 ],'La ejecución parcial debe tenerse en cuenta antes de cancelar, modificar o crear otra orden.'));

set(506,4,'Compara un uso completo del servicio',
 'Una tarifa de compra cero no describe todo el servicio. Dibuja cómo lo usarás: comprar, mantener y quizá vender. Cada etapa puede tener cargos diferentes. Comparar el mismo patrón de uso evita elegir por una tarifa llamativa que después se compensa con otra.',
 'Se comparan costes para el mismo uso, periodo y operaciones.',
 activity(choice('Elige los cargos de tu uso','Vas a hacer una compra y mantener la posición un año, sin vender ni cambiar moneda. ¿Qué cargos del contrato debes incluir en esa comparación?', ['Compra','Custodia','Venta'],0,'El uso incluye adquirir y mantener, pero no vender ni convertir moneda.'),'all',{
 options:['Comisión de compra.','Custodia durante un año.','Comisión de venta.','Conversión de moneda.'],answers:[0,1],instruction:'Selecciona los dos cargos que corresponden al uso descrito.'}));

set(507,4,'La cifra neta cuenta la historia completa',
 'Para convertir moneda compara lo que llega a la cuenta después de todos los cargos. Un proveedor puede anunciar más dólares y luego descontar una tarifa. Otro puede incluir su coste en un cambio menos favorable. No necesitas adivinar el mejor: fija el mismo importe enviado y comprueba el neto recibido.',
 'La comparación usa igual dinero enviado y el importe final recibido.',
 rows('table','Completa el recibo de cambio','Envías 100 €. Decide qué representa cada cantidad del recibo, sin calcular el resultado de otro proveedor.',[
  {label:'110 $ antes de la comisión.',options:['Importe bruto','Cargo','Importe neto'],answer:0},
  {label:'4 $ descontados por el servicio.',options:['Importe bruto','Cargo','Importe neto'],answer:1},
  {label:'106 $ que llegan a la cuenta.',options:['Importe bruto','Cargo','Importe neto'],answer:2},
 ],'El recibido neto descuenta el cargo; lo anunciado antes del cargo no es toda la comparación.'));

set(508,4,'La última pantalla es una comprobación',
 'Antes de autorizar revisa instrumento, mercado, moneda, cantidad, tipo de orden y coste total. No es repetir la búsqueda: sirve para detectar si una condición cambió al preparar la operación. Si algo no coincide con tu plan, corrígelo antes de confirmar.',
 'La confirmación debe coincidir con las condiciones que decidiste.',
 activity(choice('Selecciona lo que debes corregir','Querías Faro clase A, en euros, con máximo de 5 € por acción. La pantalla muestra clase A, euros y orden a mercado. ¿Qué dato se debe corregir?', ['Clase','Moneda','Tipo de orden'],2,'La orden a mercado no conserva el máximo por acción que querías.'),'reverse',{
 response:'El resumen dice: «Faro clase A · EUR · Orden a mercado».',
 options:['¿La orden conserva mi máximo de 5 € por acción?','¿Se está mostrando la clase A que buscaba?','¿El resumen está expresado en euros?'],answer:0,
 prompt:'El plan era comprar clase A en euros con máximo de 5 € por acción. ¿Qué pregunta revela la discrepancia del resumen?',instruction:'Elige la pregunta que señala la condición que no se respetó.'}));

set(509,2,'Elige qué condición tiene prioridad',
 'No hay una orden mejor para todas las situaciones. Si el precio máximo importa más que ejecutar enseguida, una limitada encaja con esa prioridad. Si decides aceptar el precio disponible para ejecutar, asumes otra condición. Primero define qué estás dispuesto a aceptar; después elige el tipo.',
 'El tipo de orden debe seguir tu prioridad de precio y ejecución.',
 selection('Compara dos decisiones','Los vendedores piden 9,30 €. Pedro mantiene su compra limitada a 9 €. Lola cambia su compra limitada por una orden a mercado para intentar ejecutar enseguida. ¿Qué condición cambió Lola?',
 'Dejó de fijar un máximo por acción y acepta el precio disponible.',
 ['Conservó exactamente el máximo de 9 € con un nombre distinto.','Aseguró que se comprará a 9,30 € aunque cambien las ofertas.'],
 'La nueva orden prioriza ejecución, sin conservar un máximo ni garantizar el precio visto.',509));

set(493,4,'Necesitar una subida no hace que ocurra',
 'Calcular la subida para volver al saldo inicial responde qué haría falta, no cuándo sucederá. Una pérdida puede recuperarse, tardar mucho o no recuperarse. Si necesitas el dinero pronto, esa diferencia importa: no conviertas una cuenta correcta en una promesa de mercado.',
 'El porcentaje necesario es una condición matemática, no una previsión.',
 truth('¿Qué puedes prometer con la cuenta?','Después de una pérdida, Eva calcula la subida que necesitaría para recuperar el dinero. Valora estas conclusiones.',[
  ['La cuenta identifica la subida necesaria bajo las condiciones indicadas.',true],
  ['La cuenta demuestra que la subida ocurrirá antes de un año.',false],
  ['La fecha de un pago personal sigue siendo relevante aunque conozca ese porcentaje.',true],
 ],'Se puede calcular el umbral sin conocer la fecha ni la probabilidad de alcanzarlo.'));

set(514,4,'Sigue dónde se genera el dinero',
 'La bolsa donde aparece la empresa no indica dónde están sus clientes. Para estudiar países y monedas, mira ventas y costes reales. Dos compañías que cotizan en Madrid pueden depender de economías distintas. Una cifra en euros puede ser simplemente la presentación de cobros originalmente en dólares.',
 'La exposición económica se busca en la actividad, además de la cotización.',
 activity(choice('¿Qué cambio altera la exposición?','En ambas fichas se mantiene la cotización en Madrid. Marca las dos filas que muestran un cambio real de exposición económica.', ['Ventas','Moneda'],0,'El país del cliente y la moneda de cobro cambian la actividad; un dato del mercado de cotización no la resume.'),'differences',{
 options:['Bolsa','País de clientes','Moneda de cobros','Nombre'],before:['Madrid','España','EUR','Local'],after:['Madrid','Estados Unidos','USD','Local'],answers:[1,2],instruction:'Marca las dos diferencias que afectan a dónde y en qué moneda gana dinero.'}));

set(521,4,'El número necesita una unidad',
 'Un informe puede mostrar celdas pequeñas porque usa miles o millones de euros en el encabezado. Ese encabezado forma parte del dato. Una transcripción que lo omite puede cambiar el importe por un factor muy grande. Revisa fuente y unidad antes de comparar o sumar.',
 'Una cifra de informe incluye su unidad, periodo y contexto.',
 repair('Corrige la ficha','El documento original muestra ventas 25 bajo el encabezado «miles de euros». Corrige la unidad de esta ficha.',
 'Ventas: 25 «euros».','euros',['miles de euros','millones de euros','acciones'],0,
 'Mantener la unidad del documento evita transformar 25.000 € en 25 €. No se elige la escala por el tamaño de la empresa.'));

set(524,4,'Una cadena de copias no son varias pruebas',
 'Si tres publicaciones citan el mismo mensaje, comparten una fuente. Para comprobar un contrato busca el comunicado de la empresa o un documento oficial, con su fecha. Mientras no aparezca esa confirmación, el anuncio sigue siendo un rumor. Que se repita aumenta su difusión, no su comprobación.',
 'Localiza el origen y después contrástalo con una fuente documentada.',
 ordered('Investiga el anuncio','Tres publicaciones repiten un posible contrato. Ordena los pasos para decidir si puedes anotarlo como hecho confirmado.',[
  'Seguir los enlaces hasta la fuente original',
  'Buscar un documento oficial que confirme el contrato y su fecha',
  'Anotar el hecho documentado o mantenerlo como no confirmado',
 ],'Copiar varias veces el mismo mensaje no aporta documentos independientes.',524));

set(527,4,'Etiqueta el estado de cada dato',
 'Un hecho es información sobre lo ocurrido y documentado. Una estimación calcula lo que podría pasar con unos supuestos. Una opinión expresa una valoración personal. Las tres pueden ser útiles, pero no sirven como la misma prueba. Un supuesto pendiente debe seguir visible al usar una previsión.',
 'Distingue qué ocurrió, qué se supone y qué se valora.',
 rows('classify','Ordena la ficha por tipo de información','Clasifica estas tres notas de investigación.',[
  {label:'El informe publicado confirma ventas de 70 €.',options:['Hecho','Estimación','Opinión'],answer:0},
  {label:'Podría vender 84 € si consigue dos clientes nuevos.',options:['Hecho','Estimación','Opinión'],answer:1},
  {label:'A Julia le parece una empresa atractiva.',options:['Hecho','Estimación','Opinión'],answer:2},
 ],'La condición de los dos clientes pertenece a una previsión, no a un resultado ya publicado.'));

set(534,4,'Usuario y pagador pueden ser distintos',
 'En una aplicación gratuita con anuncios, el usuario recibe el servicio y el anunciante paga por aparecer. Para entender el negocio hay que seguir ese flujo. Muchos usuarios pueden atraer anunciantes, pero no constituyen por sí solos ingresos: importa si alguien paga, por qué y cuánto.',
 'Sigue la entrega del servicio y la entrada del dinero por separado.',
 rows('diagram','Completa las relaciones','Relaciona cada participante con su función en una aplicación gratuita con anuncios.',[
  {label:'Usuario →',options:['Utiliza el servicio','Paga por mostrar un anuncio','Vende acciones de la empresa'],answer:0},
  {label:'Anunciante →',options:['Utiliza el servicio sin publicidad','Paga por mostrar un anuncio','Compra el móvil de cada usuario'],answer:1},
  {label:'Aplicación →',options:['Recibe ingresos de publicidad','Cobra necesariamente al usuario','Recibe todo el presupuesto del anunciante'],answer:0},
 ],'Los papeles explican quién usa, quién paga y de dónde llegan ingresos, sin confundirlos.'));

set(536,4,'Financia el tramo entre comprar y cobrar',
 'Un pedido no deja dinero disponible automáticamente. Si los materiales se pagan primero y el cliente paga después, hay un tramo que necesita recursos. Dibujar la secuencia ayuda a planificar cuánto hay que adelantar y por cuánto tiempo, aunque la operación vaya a ser rentable.',
 'Beneficio esperado y financiación de la espera son preguntas diferentes.',
 activity(choice('Completa la secuencia del pedido','La empresa paga materiales antes de entregar y el cliente paga al recibir. Completa el paso que explica la necesidad de financiación.', ['Buscar recursos para pagar los materiales antes del cobro','Contar todo el pedido como caja hoy','Eliminar la obligación de pagar materiales'],0,'Hay que cubrir el primer desembolso hasta que llegue el cobro.'),'sequence',{
 sequence:['Pedido confirmado','?','Materiales y entrega','Cobro del cliente'],options:['Conseguir recursos para adelantar los materiales','Registrar el cobro como si ya estuviera en el banco','Descontar el pedido de las ventas anteriores'],answer:0,instruction:'Elige el paso que falta antes de poder cumplir el pedido.'}));

set(544,4,'No confundas crecimiento total con salud de la base',
 'Los nuevos compradores pueden compensar menos compras de clientes antiguos. Por eso mira cada grupo: el total responde cuánto se vendió, pero no explica si quienes ya compraban siguen haciéndolo igual. Separar grupos ayuda a distinguir expansión y debilidad de la base anterior.',
 'Un total creciente puede ocultar que clientes anteriores compran menos.',
 activity(choice('Separa dos lecturas del informe','El total crece de 100 a 120 €. Los antiguos bajan a 80 € y los nuevos aportan 40 €. Selecciona las dos conclusiones respaldadas.', ['Aumentó el total','Los clientes antiguos aumentaron compras','Los nuevos compensaron la caída de antiguos'],0,'El crecimiento conjunto viene de nuevos compradores pese a la caída de compras de antiguos.'),'all',{
 options:['Las ventas totales aumentaron.','Los clientes antiguos compraron más.','Los nuevos compradores compensaron la caída de antiguos.','El informe demuestra que ningún cliente canceló.'],answers:[0,2],instruction:'Marca las dos conclusiones que sostienen esos importes.'}),figures[544]);

set(548,4,'Comprueba lo que ocurrió después de la promoción',
 'Una promoción puede traer a junio compras previstas para julio. Junio mejora, pero parte de julio ya se hizo antes. Para estudiar si hubo ventas nuevas, observa un periodo que incluya ambos meses y compara con una temporada equivalente. Así distingues crecer de mover ventas en el calendario.',
 'Un pico mensual puede ser un adelanto en vez de nueva demanda.',
 ordered('Diseña una comparación útil','La promoción adelanta compras de julio a junio. Ordena los pasos para evaluar si aumentó la demanda del conjunto.',[
  'Elegir un periodo que incluya junio y julio',
  'Reunir las ventas de ese periodo y del equivalente anterior',
  'Comprobar si creció el conjunto o solo se adelantaron compras',
 ],'Revisar únicamente junio deja fuera el mes del que procedían las compras adelantadas.',548));

set(551,4,'Cada subtotal responde a una pregunta',
 'El beneficio bruto muestra lo que queda tras el coste de los productos vendidos. Todavía falta pagar la estructura comercial y administrativa. El resultado operativo incorpora esos gastos; los intereses vienen en otro tramo. Seguir las etapas evita descontar dos veces una partida o saltársela.',
 'Bruto, operativo y neto no son nombres intercambiables.',
 rows('diagram','Completa el recorrido del resultado','Indica qué cálculo corresponde a cada etapa. No hay partidas adicionales en este esquema.',[
  {label:'Ventas → beneficio bruto',options:['Restar coste de ventas','Restar solo intereses','Sumar gastos administrativos'],answer:0},
  {label:'Bruto → operativo',options:['Restar otra vez coste de ventas','Restar gastos operativos','Sumar impuestos'],answer:1},
  {label:'Operativo → neto simplificado',options:['Restar intereses e impuestos','Volver a restar ventas','Sumar costes de ventas'],answer:0},
 ],'Se avanza desde el subtotal anterior; no se vuelve a descontar lo que ya contiene.'));

set(560,4,'Compara alternativas del mismo uso',
 'La competencia no se define solo por productos parecidos. Para ir al trabajo, coche y tren pueden resolver la misma necesidad. Para llevar una carga a un lugar sin estación, quizá no. Identifica primero la ocasión concreta y compara tiempo, coste y calidad de las alternativas de ese uso.',
 'Una alternativa compite cuando puede resolver la necesidad del cliente en esa ocasión.',
 rows('classify','¿Compite en esta decisión?','El cliente necesita ir solo cada día a una oficina junto a una estación. Clasifica las opciones por si resuelven ese uso.',[
  {label:'Tren con parada junto a la oficina.',options:['Alternativa para ese uso','No resuelve ese uso'],answer:0},
  {label:'Otro fabricante vende un coche útil para ese trayecto.',options:['Alternativa para ese uso','No resuelve ese uso'],answer:0},
  {label:'Un camión especializado que el cliente no puede conducir.',options:['Alternativa para ese uso','No resuelve ese uso'],answer:1},
 ],'Se comparan opciones utilizables para una necesidad concreta, no solo empresas de un mismo sector.'));

set(564,4,'Un ahorro necesita tiempo para compensar el cambio',
 'Cambiar de proveedor puede exigir migración, formación y horas de trabajo. Es un coste inicial. El ahorro posterior necesita tiempo para compensarlo. Si el uso termina antes, pagar menos cada año no basta. También se investigan diferencias de servicio, que aquí se mantienen iguales.',
 'Compara coste de cambio y ahorro durante el plazo real de uso.',
 repair('Corrige la regla de decisión','Los servicios son equivalentes, pero migrar cuesta dinero. Corrige el fragmento de esta decisión.',
 'Cambio de proveedor en cuanto el ahorro anual es «positivo».','positivo',
 ['suficiente para compensar el cambio durante el uso previsto','mayor que cero sin mirar el plazo','menor que el precio antiguo'],0,
 'Un ahorro de un año no cubre necesariamente un coste inicial mayor. El plazo forma parte de la decisión.'),figures[564]);

set(569,4,'Pide una prueba de la respuesta del cliente',
 'Para comprobar poder de precios no basta la tarifa nueva. Observa compras, bajas de clientes y el margen después del cambio. Si se mantiene la demanda pero los costes aumentaron mucho más, la mejora del precio quizá no se traduce en beneficio. La evidencia debe conectar precio, respuesta y resultado.',
 'Una subida de tarifa es un hecho; poder sostenerla necesita más evidencias.',
 activity(choice('Elige el conjunto de pruebas','La dirección anuncia una subida de tarifas como prueba de poder de precios. Selecciona las dos revisiones que añaden evidencia necesaria.', ['Clientes y compras','Márgenes','Número de notas de prensa'],0,'Se estudia la respuesta de la demanda y el efecto sobre el resultado, además del anuncio.'),'all',{
 options:['Clientes retenidos y unidades vendidas después de la subida.','Márgenes después de comparar precios y costes.','Número de veces que se repitió el anuncio.','Cotización máxima histórica.'],answers:[0,1],instruction:'Selecciona las dos revisiones del negocio que ayudan a comprobar la afirmación.'}));

set(570,4,'No confundas periodo con fecha',
 'La cuenta de resultados recorre un periodo: por ejemplo, todo el año. El balance describe una fecha: por ejemplo, el cierre de diciembre. La caja puede moverse por préstamos o compra de equipos además de resultados. Por eso un beneficio anual no equivale al saldo de banco que habrá el último día.',
 'Un resultado del año y un saldo al cierre responden a preguntas distintas.',
 match('Elige el documento adecuado','Relaciona cada pregunta con el documento que la responde directamente.',[
  ['¿Qué recursos y obligaciones había el 31 de diciembre?','Balance'],
  ['¿Qué ingresos y gastos se reconocieron durante el año?','Cuenta de resultados'],
  ['¿Qué entradas y salidas explican el dinero del año?','Estado de flujos de efectivo'],
 ],'Los tres documentos se complementan, pero no sustituyen entre sí sus preguntas.'));

set(576,4,'Una partida se descuenta una vez',
 'La cuenta avanza por subtotales. Si el operativo ya descontó producción y administración, solo falta incorporar las partidas posteriores indicadas. Volver a restar gastos incluidos produce un resultado falso, igual que olvidar intereses. Anota qué contiene cada subtotal antes de continuar.',
 'Respeta qué partidas ya están incluidas en la base del cálculo.',
 repair('Corrige el cálculo propuesto','El resultado operativo ya incorpora producción y administración. Corrige el fragmento equivocado.',
 'Para llegar al neto simplificado, resto intereses, impuestos y «otra vez administración».','otra vez administración',
 ['ninguna partida ya incluida','de nuevo producción','el total de ventas'],0,
 'Después del operativo se descuentan intereses e impuestos del supuesto, sin duplicar costes anteriores.'));

set(578,4,'Mira qué se excluye y con qué frecuencia',
 'Un resultado ajustado elimina algunas partidas con el criterio definido por quien lo presenta. Para interpretarlo, consulta la conciliación: la lista que conecta el resultado contable y el ajustado. Después revisa si esos gastos vuelven cada año. Que una empresa los llame excepcionales no hace que sean irrelevantes.',
 'La etiqueta de un ajuste no sustituye estudiar su naturaleza y frecuencia.',
 ordered('Revisa el ajuste','La empresa excluye reestructuración del resultado ajustado. Ordena una revisión antes de elegir qué cifra usar.',[
  'Localizar las partidas e importes que se excluyen',
  'Comprobar si esos costes se repiten en otros años',
  'Decidir qué lectura describe mejor el funcionamiento habitual',
 ],'La conciliación explica el puente de cifras; la frecuencia ayuda a interpretar su sentido económico.',578));

set(586,4,'Recibir, deber y pagar son momentos distintos',
 'Si recibes materiales a crédito, tienes recursos y una obligación aunque no hayas pagado hoy. Al pagar después, el banco baja y se cancela la deuda con el proveedor. El pago no compra por segunda vez el mismo material. Separar los momentos ayuda a leer balance y caja.',
 'Recibir a crédito crea una obligación; pagarla después la cancela.',
 activity(choice('Completa el ciclo de la factura','El proveedor entrega materiales y permite pagar en un mes. Completa el paso intermedio.', ['Registrar materiales y deuda con proveedor','Registrar materiales gratuitos','Esperar al pago para reconocer toda la operación'],0,'El crédito comercial da tiempo para pagar, pero no elimina la obligación.'),'sequence',{
 sequence:['Recibir los materiales','?','Llega el vencimiento','Pagar y cancelar la deuda'],options:['Registrar materiales y deuda con proveedor','Registrar un cobro por el importe de materiales','Registrar solo una compra cuando se pague'],answer:0,instruction:'Elige el registro que falta después de recibir a crédito.'}));

set(590,4,'La caja puede venir de fuera del negocio',
 'Un préstamo sube el saldo, pero también crea una obligación. Vender un edificio aporta dinero de inversión. Cobrar a clientes aporta dinero operativo. Separar estas fuentes permite preguntar si la actividad se sostiene por sí misma o si el saldo mejora por financiación o ventas de activos.',
 'Para interpretar un aumento de caja, busca su origen.',
 rows('classify','Sigue el origen de cada movimiento','Clasifica estas operaciones; los importes no cambian su naturaleza.',[
  {label:'Cobro de un cliente por servicios.',options:['Operación','Inversión','Financiación'],answer:0},
  {label:'Venta de una máquina usada.',options:['Operación','Inversión','Financiación'],answer:1},
  {label:'Préstamo recibido de un banco.',options:['Operación','Inversión','Financiación'],answer:2},
 ],'Usar un préstamo para operar no lo convierte en cobro operativo.'));

set(600,4,'El dinero pendiente tiene un calendario',
 'Vender hoy con pago a dos meses significa esperar para tener ese efectivo. Si los costes se pagan antes, la empresa financia la espera. Un retraso adicional es distinto del plazo acordado: aparece después de la fecha comprometida. Separar ambos evita tratar todo cobro pendiente como impago.',
 'Distingue el plazo pactado del retraso después del vencimiento.',
 rows('table','Lee el calendario de clientes','Completa el estado de cada factura en este ejemplo.',[
  {label:'Pago acordado para el día 30; hoy es día 20.',options:['Pendiente dentro del plazo','Retrasada después del plazo','Ya cobrada'],answer:0},
  {label:'Pago acordado para el día 10; hoy es día 20 y no se cobró.',options:['Pendiente dentro del plazo','Retrasada después del plazo','Ya cobrada'],answer:1},
  {label:'Cliente transfirió y el dinero está en el banco.',options:['Pendiente dentro del plazo','Retrasada después del plazo','Ya cobrada'],answer:2},
 ],'Una factura pendiente dentro del plazo y otra vencida requieren lecturas distintas.'));

set(607,4,'Nuevo equipo no siempre significa crecimiento',
 'Sustituir un equipo agotado por otro equivalente mantiene la capacidad. Añadir una línea aumenta capacidad y busca crecimiento. Los dos usos consumen dinero, pero responden a necesidades diferentes. Separarlos ayuda a interpretar qué parte de la inversión evita perder actividad y qué parte intenta ampliarla.',
 'Clasifica la finalidad del equipo, además de su fecha de compra.',
 rows('classify','Clasifica la finalidad','El negocio compra los siguientes equipos. Agrupa cada uso por su finalidad principal.',[
  {label:'Cambiar una máquina agotada por otra de capacidad equivalente.',options:['Mantenimiento','Crecimiento'],answer:0},
  {label:'Añadir una línea para fabricar más unidades.',options:['Mantenimiento','Crecimiento'],answer:1},
  {label:'Sustituir servidores gastados que sostienen el mismo servicio.',options:['Mantenimiento','Crecimiento'],answer:0},
 ],'La comparación es con la capacidad que se conserva o se añade, no con si el equipo es nuevo.'));

set(609,4,'Un saldo final positivo puede ocultar un día difícil',
 'El dinero debe llegar antes de un pago para servir en ese pago. Un cobro confirmado para el viernes no está disponible el martes. El calendario permite detectar un déficit temporal aunque la semana termine con saldo positivo. Después se estudia cómo cubrir ese tramo sin asumir cobros adelantados que no existen.',
 'Ordena cobros y pagos por fecha, además de sumar el total.',
 selection('¿Qué resuelve el problema del martes?','Con 12 € el lunes, un pago de 20 € el martes y un cobro de 15 € el viernes, ¿qué plan respeta el calendario?',
 'Conseguir cobertura temporal antes del martes y revisar su devolución al cobrar.',
 ['Dar por disponible el viernes desde el lunes.','Aplazar automáticamente al viernes una factura que vence el martes.'],
 'El recurso debe estar disponible antes del pago. La posterior entrada ayuda a cerrar la financiación temporal.',609),figures[609]);

set(615,4,'Un cociente mayor puede venir de una base menor',
 'El ROE divide beneficio para accionistas entre patrimonio. Si el patrimonio es menor, el cociente puede subir sin que mejore la operación. Más deuda puede explicar parte de esa menor base y añade pagos que atender. Por eso se mira la composición de financiación, no solo el porcentaje final.',
 'Más ROE no prueba por sí solo mejor negocio ni menor riesgo.',
 repair('Corrige la conclusión','A y B ganan lo mismo; B tiene menor patrimonio y más deuda. Corrige esta afirmación.',
 'El ROE mayor de B demuestra «mejor operación».','mejor operación',
 ['un cociente mayor que también puede explicarse por menor patrimonio','menos deuda que en A','más beneficio en euros que A'],0,
 'El porcentaje crece al usar menor base. Para valorar operación y riesgo se necesitan sus datos correspondientes.'),figures[615]);

set(619,4,'Buen negocio y buena compra son preguntas distintas',
 'Un negocio puede usar bien el capital y, aun así, venderse a un precio que exige demasiado crecimiento futuro. El ROIC ayuda a estudiar la calidad económica; la valoración pregunta qué pagas por esos resultados y sus perspectivas. Ninguna de las dos revisiones sustituye a la otra.',
 'El rendimiento del negocio no decide solo el precio adecuado de la acción.',
 match('Relaciona cada duda con la revisión','Separa tres preguntas antes de comprar.',[
  ['¿Usa eficazmente los recursos operativos?','Rendimiento del capital'],
  ['¿Qué exige el precio actual para resultar razonable?','Valoración'],
  ['¿Qué puede cambiar sus resultados futuros?','Perspectivas y riesgos'],
 ],'Una comparación de ROIC no contiene toda la valoración ni toda la incertidumbre futura.'));

set(625,4,'Pagado una vez no significa sostenible',
 'Si un dividendo supera lo que genera la actividad tras invertir, la diferencia necesita caja previa, venta de activos o financiación. Son fuentes diferentes. Para evaluar continuidad se pregunta si el negocio podrá cubrir futuros repartos sin deteriorar recursos ni aumentar deuda de forma que no pueda sostenerla.',
 'La fuente del dividendo importa tanto como su importe.',
 activity(choice('Investiga la continuidad del reparto','La empresa genera 20 € de caja libre y reparte 30 € con deuda para cubrir la diferencia. Marca las dos revisiones útiles.', ['Generación de caja','Financiación','Precio máximo'],0,'La continuidad depende de caja recurrente y del coste y capacidad de financiación.'),'all',{
 options:['Si la actividad puede aumentar la caja libre que sostiene futuros pagos.','Qué condiciones y vencimientos tiene la deuda que cubre la diferencia.','Si el dividendo actual es mayor que el anterior: eso basta.','Solo la mayor cotización del último mes.'],answers:[0,1],instruction:'Selecciona dos comprobaciones del negocio y su financiación.'}),figures[625]);

set(628,4,'Evalúa el conjunto, no solo los aciertos',
 'Para estudiar asignación de capital, reúne los proyectos exitosos y los fallidos con sus importes y plazos. Si solo miras el proyecto rentable, ocultas dinero que también se usó. Después distingue si los resultados ya están estabilizados o si queda por evaluar un proyecto todavía en marcha.',
 'El historial debe incluir capital comprometido en todos los proyectos relevantes.',
 ordered('Revisa el historial','La presentación destaca un proyecto exitoso y omite otro que no rindió. Ordena tu revisión.',[
  'Reunir los proyectos relevantes y todo el capital usado',
  'Comprobar resultados y tiempo de maduración de cada proyecto',
  'Evaluar el conjunto sin excluir los que no funcionaron',
 ],'El promedio o rendimiento conjunto pierde sentido si la base deja fuera inversiones fallidas.',628),figures[628]);
