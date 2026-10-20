import {ETF_MIDDLE} from './etfs-cases-middle.mjs';
import {ETF_LATE} from './etfs-cases-late.mjs';
// Fictional situations, in the exact order of the approved ETF index.
// scene | justified interpretation | plausible error | useful investigation
export const ETF_CASE_TEXT = `
# 1
Ana quiere que su fondo deje de comprar una empresa solo para ella.¦La cartera común sigue las reglas del fondo.¦Su aportación crea una cartera distinta dentro del mismo fondo.¦Leer la política que determina las compras de la cartera.
En la cuenta de Luis figuran dos participaciones; el fondo tiene cien empresas.¦Luis tiene dos unidades del fondo.¦Luis tiene dos acciones directas de cada empresa.¦Consultar qué inversiones hay detrás de esas participaciones.
Una ficha enumera acciones de comercios y préstamos a empresas.¦La cartera combina propiedad de empresas y deuda.¦Todos los elementos dan los mismos derechos de accionista.¦Separar los pesos de acciones y bonos.
Marta compra participaciones a otra persona a las once de la mañana.¦La operación encaja con un fondo negociado en bolsa.¦La compra intradía demuestra que el fondo sigue un índice.¦Comprobar por separado el modo de negociación y la estrategia.
Pablo quiere excluir una empresa que el ETF mantiene en cartera.¦Comprar ese ETF implica aceptar esa exposición mientras siga dentro.¦Puede eliminarla de su participación sin cambiar el fondo.¦Examinar las posiciones antes de elegir el producto.
Una gestora cobra su comisión durante un año con pérdidas.¦Cobrar por gestionar no implica asegurar el resultado.¦El cobro demuestra que la gestora debe cubrir toda pérdida.¦Leer funciones, costes y protección en la documentación.
La pantalla muestra el precio de la última operación; quedan pocas ofertas.¦La próxima operación puede hacerse a otro precio.¦El precio anterior queda reservado para cualquier comprador.¦Revisar las ofertas disponibles antes de confirmar.
Un ETF reparte su dinero entre muchos bancos del mismo país.¦Reduce la dependencia de un banco, pero conserva riesgos comunes.¦El número de bancos impide una caída del conjunto.¦Investigar los riesgos compartidos por esas inversiones.
Un producto llamado Global solo admite empresas de mercados desarrollados.¦El nombre amplio no incluye necesariamente todos los mercados.¦Global implica que todos los países están representados.¦Consultar el universo admitido y las posiciones publicadas.
Te entregan una ficha con cien empresas, dos posiciones dominantes y ningún bono.¦Es una cartera de acciones cuya concentración debe explicarse.¦Cien nombres bastan para describirla como equilibrada.¦Mirar cuánto dinero pesa en las mayores posiciones.
# 2
Una gran posición baja mientras varias pequeñas suben.¦El resultado depende de cuánto pesa cada posición.¦Contar empresas que suben basta para conocer el resultado.¦Revisar los pesos junto a los movimientos de precio.
El fondo recibe un dividendo, pero sus inversiones bajan de valor.¦El ingreso y la caída forman parte del mismo resultado.¦Cobrar el dividendo demuestra que el fondo ganó dinero.¦Comparar valor inicial, valor final e ingresos del periodo.
Eva quiere que los ingresos permanezcan invertidos sin cobrarlos en su cuenta.¦Una clase de acumulación responde a ese destino del dinero.¦Una clase de distribución reinvierte automáticamente todo cobro externo.¦Confirmar la política de ingresos de la clase concreta.
Una gráfica excluye repartos y otra los incluye.¦Las dos gráficas están midiendo resultados diferentes.¦Sus subidas se pueden ordenar como si midieran lo mismo.¦Comprobar qué hace cada serie con los ingresos repartidos.
El saldo de Nora subió después de que ingresara más dinero.¦Hace falta separar su aportación del resultado de la inversión.¦Todo aumento del saldo procede de una rentabilidad positiva.¦Reconstruir las entradas de dinero y sus fechas.
Raúl reinvierte un cobro y el mercado cae después.¦También el dinero reinvertido participa en esa caída.¦Reinvertir protege el cobro frente a pérdidas futuras.¦Distinguir la reinversión de una garantía de rendimiento.
Una cifra de resultado ya descuenta los gastos del fondo; queda una comisión externa.¦Hay que incorporar la comisión externa sin restar otra vez los gastos internos.¦Para ser prudente se deben restar dos veces todos los gastos.¦Identificar qué costes contiene ya la cifra publicada.
Una inversión gana euros y la cesta habitual del hogar sube todavía más.¦Se puede ganar dinero y perder poder de compra a la vez.¦Toda ganancia en euros permite comprar más que antes.¦Comparar el resultado con la subida de los precios relevantes.
Una persona necesita pronto el dinero de una inversión que ha caído.¦El plazo disponible influye en su capacidad para esperar.¦La necesidad de cobrar pronto hace que la inversión se recupere antes.¦Revisar cuándo necesita el dinero y qué pérdida puede asumir.
Dos clases terminaron a precios distintos; una hizo pagos y la otra no.¦Hay que sumar los pagos externos al valor que queda.¦La clase con el precio final mayor fue necesariamente mejor.¦Igualar periodo, aportación inicial y tratamiento de los cobros.
# 3
Un índice excluye empresas pequeñas aunque represente un mercado conocido.¦Resume el segmento seleccionado por sus reglas.¦Su nombre significa que contiene todas las empresas del mercado.¦Leer el universo y los criterios de admisión.
Un ETF queda ligeramente por debajo de su referencia.¦La diferencia no basta por sí sola para afirmar que dejó de seguirla.¦Seguir un índice obliga a igualar su resultado exacto.¦Comprobar periodo, ingresos y costes comparados.
Una empresa cambia de país de domicilio y deja de cumplir una regla del índice.¦Puede salir por la regla aunque siga siendo rentable.¦Solo las empresas que pierden dinero pueden ser excluidas.¦Identificar el requisito concreto que ya no cumple.
Dos empresas suben igual, pero una ocupa mucho más dinero del índice.¦La posición con mayor peso influye más en el conjunto.¦Ambas producen el mismo efecto por tener la misma subida porcentual.¦Consultar los pesos antes del movimiento.
Una empresa es enorme, pero gran parte de sus acciones no se negocia libremente.¦Ajustar por acciones disponibles puede reducir su peso respecto a su tamaño total.¦Toda acción emitida cuenta igual para cualquier índice ajustado.¦Comprobar qué proporción considera disponible la metodología.
Todas las empresas empiezan con el mismo peso y una sube mucho.¦Los pesos pueden separarse antes del siguiente ajuste.¦Igual peso significa igualdad constante sin operaciones.¦Leer cuándo vuelve a ajustarse el reparto.
Un índice asigna peso usando dividendos en vez de tamaño bursátil.¦El criterio elegido cambia la exposición de la cartera.¦Cualquier regla de pesos reproduce exactamente la capitalización.¦Comparar la variable y los límites empleados para ponderar.
El comité anuncia cambios que entrarán en vigor el mes siguiente.¦La fecha de anuncio y la de aplicación cumplen funciones distintas.¦Anunciar el cambio implica que la cartera ya está actualizada.¦Comprobar la fecha efectiva y las posiciones posteriores.
Dos referencias incluyen el mismo país y ofrecen resultados distintos.¦Pueden diferir en empresas, pesos o tratamiento de ingresos.¦Compartir país obliga a obtener idéntica rentabilidad.¦Comparar metodología y versión de cada índice.
Una empresa deja de cumplir los requisitos y otra entra en su lugar.¦Después de revisar integrantes también hay que revisar los pesos.¦Cambiar nombres sin revisar el reparto completa siempre la actualización.¦Aplicar selección, ponderación y calendario de la metodología.
# 4
Dos pantallas muestran símbolos distintos pero el mismo ISIN.¦Pueden ser cotizaciones de la misma clase.¦Los símbolos distintos demuestran que son fondos sin relación.¦Comprobar bolsa, moneda e identificador de la clase.
Un fondo promete seguir grandes empresas europeas y otro pequeñas globales.¦Persiguen exposiciones diferentes antes de comparar rentabilidades.¦La etiqueta ETF hace equivalentes sus objetivos.¦Leer el objetivo y la referencia completa de cada uno.
La ficha solo enseña las diez mayores inversiones.¦El resto de la cartera sigue siendo desconocido en esa lista.¦Las inversiones no mostradas necesariamente tienen peso cero.¦Buscar las posiciones completas con su fecha.
Una ficha tiene un país dominante y sectores variados.¦Diversificar sectores no elimina esa concentración geográfica.¦Tener varios sectores garantiza repartir por países.¦Revisar ambas distribuciones por separado.
La gestora y el domicilio legal del fondo pertenecen a países distintos.¦Son datos distintos de la estructura del producto.¦El país de la gestora determina siempre el domicilio del fondo.¦Consultar domicilio, entidad gestora y estructura legal.
Dos clases invierten en la misma cartera; una reparte ingresos y otra los reinvierte.¦Las condiciones de la clase pueden cambiar sin cambiar el mercado invertido.¦Misma cartera implica condiciones idénticas para el inversor.¦Comparar la clase concreta, no solo el nombre del fondo.
El resumen de riesgos presenta escenarios con resultados favorables.¦Son escenarios condicionados y deben leerse con sus advertencias.¦El mejor escenario es una rentabilidad prometida por el fondo.¦Revisar hipótesis, riesgos y costes del documento.
Una duda sobre un límite de inversión no se resuelve en la ficha comercial.¦El folleto puede detallar reglas que el resumen omite.¦Si no sale en publicidad, el límite no existe.¦Consultar el apartado correspondiente del folleto vigente.
Una cartera publicada hace un año contradice una ficha de este mes.¦Primero hay que comparar fecha, clase y fuente.¦La tabla más detallada siempre describe mejor la cartera actual.¦Buscar documentación oficial de fechas comparables.
Una ficha de análisis tiene costes y rentabilidad, pero ningún objetivo.¦Todavía falta saber qué exposición se está evaluando.¦Rentabilidad y costes bastan para identificar lo que compra el fondo.¦Completar objetivo, posiciones, riesgos y fecha de los datos.
# 5
La cartera compra todas las inversiones del índice con sus pesos previstos.¦Ese diseño corresponde a una réplica física completa.¦Tener todas las inversiones elimina cualquier desviación futura.¦Comprobar costes, efectivo y fechas de ajuste.
Un índice tiene miles de bonos y el fondo mantiene una muestra.¦La selección busca representar el comportamiento del conjunto.¦Menos títulos implica que el fondo no intenta seguir la referencia.¦Revisar el criterio de selección y las diferencias observadas.
El fondo obtiene el resultado de un índice mediante un contrato de intercambio.¦El contrato introduce una relación con quien promete ese resultado.¦La palabra índice elimina el riesgo del contrato.¦Identificar la contraparte y las garantías previstas.
La entidad que debe cumplir el intercambio tiene problemas financieros.¦Hay que estudiar la obligación pendiente frente a esa contraparte.¦El resultado del índice cancela cualquier incumplimiento de la entidad.¦Revisar exposición, garantías y procedimientos por incumplimiento.
Existe una garantía, pero su valor puede cambiar y su venta llevar tiempo.¦Una garantía mitiga riesgos sin asegurar recuperación inmediata y completa.¦Llamarla garantía significa que nunca puede faltar dinero.¦Examinar valoración, liquidez y posibilidad de ejecutar la garantía.
El fondo mantiene algo de efectivo para atender movimientos y pagos.¦Puede cumplir una función operativa y afectar al seguimiento.¦Toda posición de efectivo demuestra abandono del objetivo del fondo.¦Comprobar cuánto efectivo hay y para qué se mantiene.
El índice sustituye varias empresas y el fondo debe adaptarse.¦La adaptación puede exigir operaciones y costes.¦Los cambios de índice se incorporan sin ninguna negociación.¦Revisar cómo y cuándo se aplica la nueva composición.
El fondo presta temporalmente títulos a cambio de una remuneración.¦Conserva exposición económica y añade condiciones de devolución.¦Prestar un título equivale a venderlo definitivamente.¦Leer garantías, prestatarios y reglas de devolución.
Los ingresos del préstamo reducen algunos costes del fondo.¦Hay que valorar también los riesgos y el reparto de esos ingresos.¦Cualquier ingreso adicional mejora el producto sin contrapartidas.¦Comprobar qué recibe el fondo y qué riesgos asume.
Dos ETFs siguen la misma referencia mediante métodos distintos.¦Objetivo común no implica mecanismos y riesgos operativos iguales.¦La rentabilidad de un mes permite ignorar sus contratos y carteras.¦Comparar réplica, garantías, costes y seguimiento conjuntamente.
`;
export function parseCases(text, expected){
 const rows=text.trim().split(/\r?\n/).filter(s=>s.trim()&&!s.startsWith('#')).map(s=>{const fields=s.split('¦').map(x=>x.trim());if(fields.length!==4)throw Error('Expected four case fields: '+s);const [scene,correct,wrong,check]=fields;return {scene,correct,wrong,check};});
 if(rows.length!==expected)throw Error('Expected '+expected+' cases, got '+rows.length);return rows;
}
export const ETF_CASES=parseCases(ETF_CASE_TEXT+ETF_MIDDLE+ETF_LATE,200);
