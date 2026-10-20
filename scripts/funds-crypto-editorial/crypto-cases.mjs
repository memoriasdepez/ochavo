import { CRYPTO_CASES_FIRST } from './crypto-cases-first.mjs';
import { CRYPTO_CASES_MIDDLE } from './crypto-cases-middle.mjs';
import { CRYPTO_CASES_LATE } from './crypto-cases-late.mjs';
import { CRYPTO_TRANSFER_EARLY } from './crypto-transfer-early.mjs';

export const CRYPTO_CASES = [...CRYPTO_CASES_FIRST, ...CRYPTO_CASES_MIDDLE, ...CRYPTO_CASES_LATE];
if (CRYPTO_CASES.length !== 300) throw new Error('Cripto necesita 300 situaciones, una por punto del índice');
if (new Set(CRYPTO_CASES.map(c => c.scene)).size !== 300) throw new Error('Hay escenas duplicadas en Cripto');
for (const [id, transfer] of Object.entries(CRYPTO_TRANSFER_EARLY)) CRYPTO_CASES[Number(id) - 1150].transfer = transfer;

// Escenarios distintos para comprobar transferencia en los dos primeros exámenes.
// Ningún caso representa una transacción real ni pide introducir credenciales.
const introductoryExams = `Una plataforma ofrece una ficha digital que puede transferirse y otra no transferible. El comprador no ha leído sus condiciones.¦Debe comprobar qué puede poseer y transferir realmente en cada oferta.¦Basta con que ambas se llamen digitales para que tengan iguales derechos.
El banco de Eva le debe euros; una app estima en euros el valor de sus unidades cripto.¦La unidad de visualización común no convierte ambos saldos en la misma obligación.¦Mostrar euros hace que ambas entidades deban devolver esa misma cantidad fija.
Dos proyectos usan una red compartida y activos distintos. Un análisis agrupa todo bajo el nombre de la red.¦Compartir sistema no convierte los proyectos y activos en una única cosa.¦Todo activo de la red debe tener las mismas funciones y derechos.
Un servicio entrega tokens de acceso y avisa de que la operación requiere otra moneda para pagar la red.¦Hay que distinguir el activo utilizado y el que paga los costes.¦Recibir tokens de acceso elimina la necesidad de comprobar el activo de comisión.
Un token permite reservar entradas, pero su emisor no promete ingresos de taquilla.¦El derecho descrito es de uso, sin poder añadir un derecho de cobro no reconocido.¦Reservar entradas implica participar en todos los ingresos del espectáculo.
Una votación con tokens elige mejoras de una aplicación; los accionistas de la sociedad son otras personas.¦Los participantes de la votación no se convierten por ello en accionistas.¦Votar una mejora les concede una participación equivalente en la sociedad.
Un comercio acepta un activo para pagar y un comprador espera que su precio suba.¦Aceptación como pago y rentabilidad esperada son cuestiones diferentes.¦La aceptación del comercio garantiza la subida esperada por el comprador.
Una red tiene más usuarios, pero reduce la cantidad de su moneda necesaria por operación.¦El efecto sobre demanda necesita estudiar ambos cambios y cómo se utiliza el activo.¦El aumento de usuarios determina por sí solo el mismo aumento de demanda de moneda.
Una posición conserva sus unidades, pero ya no hay compradores al precio al que se adquirió.¦Su valor realizable puede haber disminuido sin cambio de cantidad.¦Conservar unidades basta para recuperar íntegro el precio pagado.
La ficha de una oferta explica la red y su precio, pero omite lo que permite hacer el token.¦Falta aclarar los derechos y riesgos del activo antes de entender la compra.¦Conocer red y precio permite deducir automáticamente todo lo que se recibe.
Un registro muestra varios envíos a una misma dirección, sin nombres de personas.¦Permite seguir movimientos, pero no atribuir identidades sin evidencia adicional.¦El número de envíos demuestra el mismo número de clientes distintos.
Un participante trae una copia del registro que incluye una operación contraria a las reglas de la red.¦La copia necesita validarse conforme a esas reglas, aunque sea completa.¦Tener una copia completa vuelve válida cualquier operación que aparezca en ella.
Una aplicación suma un importe ya gastado junto a otros todavía disponibles.¦La suma confunde historial de recepción y disponibilidad actual.¦Todo importe recibido alguna vez sigue disponible para un nuevo gasto.
Una pantalla muestra bien el destinatario, pero añade una instrucción distinta de la que se quería realizar.¦El destino correcto no acredita que toda la operación sea la deseada.¦Comprobar el destinatario hace innecesario revisar las instrucciones.
Un comercio ve una propuesta de operación, pero no encuentra su inclusión en el historial de bloques.¦Debe distinguir la solicitud del registro ya incorporado.¦La propuesta por sí sola demuestra inclusión definitiva.
Dos copias contienen datos antiguos distintos y al comprobar sus huellas se detecta una diferencia.¦La comprobación ayuda a identificar una inconsistencia que debe resolverse según las reglas.¦Encontrar huellas enlazadas permite ignorar cualquier discrepancia de datos.
Un participante instala un nodo para verificar el registro, sin configurar creación de bloques.¦La verificación no implica automáticamente participar en minería ni recibir sus recompensas.¦Instalar cualquier nodo obliga a la red a pagar recompensas de minería.
Una solicitud tiene autorización válida, pero intenta gastar fondos que ya no están disponibles.¦Debe cumplir también disponibilidad y otras reglas; la firma no basta.¦Una autorización válida permite gastar el mismo importe indefinidamente.
Una dirección visible tiene activos, pero un contrato fuera de la red los compromete frente a otra persona.¦La observación del saldo no revela por sí sola todas las obligaciones.¦La visibilidad pública elimina la posibilidad de compromisos externos.
Un usuario localiza una operación con importe parecido, pero su referencia y destinatario son diferentes.¦No puede dar por verificado su pago con una operación ajena.¦Coincidir en el importe aproximado basta para confirmar el movimiento buscado.`;

const examRows = introductoryExams.trim().split('\n');
if (examRows.length !== 20) throw new Error('Faltan escenarios de examen inicial de Cripto');
for (const [index, row] of examRows.entries()) {
  const fields = row.split('¦');
  if (fields.length !== 3 || fields.some(s => !s.trim())) throw new Error(`Examen Cripto inicial incompleto ${index}`);
  CRYPTO_CASES[index].exam = Object.fromEntries(['scene', 'correct', 'wrong'].map((key, i) => [key, fields[i].trim()]));
}
