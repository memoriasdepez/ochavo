import {order,choice} from './helpers.mjs';
import {readableParagraphs} from './clear-writing.mjs';

export const ORDER_NOTES_REVISION='stocks-order-notes-2026-10-28';
export const orderNotes={
 504:{
  0:`Un stop es una herramienta que sirve para comprar o vender automáticamente cuando una inversión alcanza un precio que hemos elegido. Pero cuidado, porque ese precio solo activa la orden y no garantiza que la operación se haga exactamente a ese valor. Si el precio cambia muy rápido, podríamos acabar comprando más caro o vendiendo más barato.

También existe el **stop limitado**, con el que establecemos un precio máximo de compra o mínimo de venta. Así evitamos aceptar un precio peor, aunque corremos el riesgo de que la operación no llegue a realizarse.

**Por ejemplo:** tenemos una acción y ponemos un stop de venta a 9 €. Si el precio cae bruscamente, nuestra orden podría ejecutarse a 8 €. Es decir, el stop se activó a 9 €, pero terminamos vendiendo a 8 €.`,
  2:`**El precio que eliges para activar un stop de mercado no garantiza que vendas a ese precio.** Cuando se activa, la orden intenta vender al mejor precio disponible en ese momento.

**Por ejemplo:** imagina que tienes una acción y decides venderla automáticamente si baja a 9 €. Cuando llega a ese precio, se activa la venta, pero puede que en ese instante solo haya compradores dispuestos a pagar 8,50 €. Por tanto, podrías acabar vendiendo por menos de los 9 € que habías elegido.`,
  4:`**Un stop también puede activarse por una caída puntual del precio, aunque después la acción vuelva a subir.** Esto es importante porque podrías acabar vendiendo una inversión que, en realidad, querías mantener.

**Por ejemplo:** imagina que compras una acción a 10 € y colocas un stop de venta a 9 €. Un día, el precio cae brevemente hasta los 9 € y tu stop se activa, vendiendo tus acciones. Sin embargo, poco después, el precio se recupera y sube hasta los 11 €. Tú ya habrías vendido y te perderías esa recuperación.

Por eso, **colocar un stop demasiado cerca del precio actual puede provocar ventas innecesarias**, especialmente en inversiones que tienen muchas subidas y bajadas.`,
  6:`**Un stop no tiene por qué quedarse siempre en el mismo precio. Puedes ir subiéndolo a medida que tu inversión gana valor para proteger parte de los beneficios.** De hecho, existe un tipo de stop llamado *stop dinámico* que puede hacerlo automáticamente.

**Por ejemplo:** imagina que compras una acción a 10 € y colocas un stop dinámico un 10 % por debajo de su precio. Si la acción sube hasta los 15 €, el stop también subirá, situándose en 13,50 €. Si después el precio comienza a caer, el stop se mantendrá en ese nivel y activará la venta cuando la acción llegue a 13,50 €.

Así puedes **dejar que tus beneficios crezcan mientras limitas lo que podrías perder si el precio empieza a caer**, aunque el precio final de venta no está garantizado.`
 },
 505:{
  2:`**La vigencia de una orden indica cuánto tiempo puede permanecer pendiente.** Si solo se ejecuta una parte, el resto puede seguir esperando hasta que se complete, se cancele o termine el plazo establecido.

**Las acciones que ya se han comprado o vendido forman parte de una operación realizada, pero las que siguen pendientes todavía no.** Además, el dinero necesario para completar la compra puede seguir reservado, por lo que no podrás utilizarlo para otras inversiones mientras la orden siga abierta.`,
  4:`**Una orden de compra o venta puede ejecutarse en varias operaciones diferentes.** Esto ocurre cuando no hay suficientes acciones disponibles al mismo precio y el bróker necesita completar la orden poco a poco.

**Por ejemplo:** imagina que quieres comprar 100 acciones con una orden de mercado. Primero compras 40 a 10 €, después otras 30 a 10,10 € y finalmente las últimas 30 a 10,20 €. Aunque hayas dado una sola orden, habrás comprado acciones a tres precios distintos.`
 },
 507:{
  0:`**Si tienes euros y quieres comprar acciones en dólares, tendrás que cambiar tu dinero de una moneda a otra.** Tu bróker puede cobrarte una comisión por hacerlo o aplicarte un tipo de cambio algo peor que el del mercado.

**Por ejemplo:** si un euro equivale a 1,10 dólares, por cada 100 € deberías recibir 110 dólares. Sin embargo, si tu bróker aplica un cambio menos favorable, podrías recibir solo 108 dólares. Por eso, **lo importante es comprobar cuánto dinero recibes realmente después del cambio.**`,
  4:`Cuando compras acciones en dólares, **también debes tener en cuenta que el valor de ambas monedas cambia constantemente**. Esto significa que puedes ganar o perder dinero por el tipo de cambio, aunque el precio de tus acciones no se mueva.

**Por ejemplo:** imagina que cambias 1.000 € por 1.100 dólares y compras acciones estadounidenses. Un tiempo después, tus acciones siguen valiendo 1.100 dólares, pero el dólar ha perdido valor frente al euro. Al convertir esos dólares de nuevo a euros, recibes solo 950 €.

Por eso, al invertir en otra moneda, **tu rentabilidad depende tanto del precio de las acciones como de la evolución del tipo de cambio.**`,
  6:`Cuando compras acciones en otra moneda, **puedes tener que pagar por cambiar divisas más de una vez**. Primero, cuando conviertes tus euros en dólares para invertir y, después, cuando vendes las acciones y quieres recuperar tus euros.`
 }
};

export function refineOrderNotes(result){
 const at=id=>result.lessons.find(l=>l.id===id);
 for(const [id,edits] of Object.entries(orderNotes)){
  const lesson=at(Number(id));
  for(const [index,body] of Object.entries(edits)){
   if(lesson.steps[index].type!=='learn')throw new Error(`Expected teaching screen ${id}/${index}`);
   lesson.steps[index].body=readableParagraphs(body);
  }
  if(edits[0])lesson.summary=lesson.steps[0].body;
 }
 const stop=at(504);
 stop.steps[2].figure.rows=[['Nivel que activa el stop a mercado','9 €'],['Oferta disponible al ejecutar la venta','8,50 €']];
 stop.steps[4].title='Una caída breve también puede activar la venta';
 stop.steps[4].takeaway='Un rebote posterior no deshace una venta que el stop ya ha ejecutado.';
 stop.steps[5]=order('Reconstruye la caída y el rebote','Compraste a 12 € y pusiste un stop de mercado en 11 €. El precio cae, la venta se ejecuta a 10,90 € y después la acción se recupera hasta 13 €. Ordena lo que sucede desde la activación del stop.',[
  'La acción se recupera hasta 13 €, pero ya has vendido y no participas en ese rebote.',
  'El precio cae hasta el nivel que activa el stop de venta.',
  'La orden encuentra comprador y vendes a 10,90 €.'
 ],[1,2,0],'Primero se activa el stop; después, en este caso, vendes a 10,90 €. Cuando el precio rebota hasta 13 € ya no tienes esas acciones: la recuperación no anula la venta ni las recompra automáticamente. Los 11 € eran el nivel de activación, no un precio de venta garantizado.');
 stop.steps[6].title='Un stop que acompaña las subidas';
 stop.steps[6].takeaway='El stop dinámico de venta sube con los nuevos máximos y no retrocede cuando el precio baja.';
 stop.steps[7]=choice('Qué hace el stop cuando llega el retroceso','Tienes un stop dinámico de venta un 10 % por debajo del precio máximo alcanzado desde que lo activaste. La acción sube de 18 € a 20 € y luego baja a 19 €. ¿Qué debe ocurrir con el nivel de activación?',[
  'Baja a 17,10 €, porque debe seguir siempre al precio actual.',
  'Se mantiene en 18 €; si el precio llega a ese nivel se activa la venta, sin asegurar el precio final.',
  'Se mantiene en 18 € y garantiza que cualquier venta se hará exactamente a 18 €.'
 ],1,'El máximo alcanzado es 20 €. Un 10 % son 2 €, así que el nivel sube a 18 €. Al retroceder a 19 €, el nivel no baja a 17,10 €. Si después se alcanza 18 €, se activa la venta; como ocurre con el stop de mercado, su ejecución puede hacerse a otro precio.');
 stop.steps[7].calculator=true;
 stop.editorialRevision=ORDER_NOTES_REVISION;
 const fx=at(507);
 fx.steps[4].title='La moneda también influye en tu resultado';
 fx.steps[4].takeaway='Una acción puede mantener su valor en dólares y perder valor al convertirla a euros.';
 // The replaced prose no longer contains the Alphabet example; do not attach its attribution to a fictional FX scenario.
 delete fx.steps[4].realExample;delete fx.steps[4].sources;delete fx.sources;
 fx.steps[6].title='El cambio también puede costar al volver a euros';
 fx.steps[6].takeaway='Revisa los costes de conversión tanto al invertir como al recuperar tus euros.';
}
