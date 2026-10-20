import {pair,choice,match,truth,rows,activity,table,usePairs} from './helpers.mjs';

// Individually authored: point 21 deals with negotiation; point 22 follows the
// money into a company or to an existing owner. Do not blend these two aims.
export function refineMarketOpening(result){
 const at=id=>result.lessons.find(lesson=>lesson.id===id);
 const sets=[[
  pair('Una operación necesita un acuerdo',
   'Comprar en bolsa requiere encontrar a alguien dispuesto a vender. Una operación se realiza cuando las condiciones de ambos encajan: qué acción, cuántas unidades y a qué precio. A la persona o entidad situada al otro lado se la llama contraparte. Anunciar que quieres comprar todavía no significa que hayas comprado.',
   'Una intención de compra se convierte en operación cuando encuentra una venta compatible.',
   activity(choice('Qué impide cerrar la compra','Elena quiere comprar 4 acciones por un máximo de 9 € cada una. Tomás ofrece esas 4 acciones por 10 € cada una. Ninguno cambia sus condiciones. Señala la conclusión incorrecta.',[
    'Las dos propuestas se refieren a la misma cantidad.',
    'Todavía no hay un precio que ambos acepten.',
    'La compra queda realizada porque ya hay comprador y vendedor.'
   ],2,'No basta con que existan las dos partes. En este caso coinciden la acción y la cantidad, pero no el precio aceptado.'),'intruder',{options:[
    'Las dos propuestas se refieren a la misma cantidad.','Todavía no hay un precio que ambos acepten.','La compra queda realizada porque ya hay comprador y vendedor.'
   ],answer:2,instruction:'Señala la única conclusión incorrecta.'})),
  pair('Un precio puede tener poca cantidad disponible',
   'Quien vende puede ofrecer solo unas pocas acciones a un precio. Si quieres más, las otras ofertas pueden ser más caras. Imagina una tienda con dos unidades rebajadas y el resto a otro precio: la oferta más barata no se extiende automáticamente a toda tu compra. En bolsa, las cantidades disponibles también importan.',
   'El mejor precio anunciado no promete cubrir toda la cantidad que necesitas.',
   truth('Lee las ofertas, no solo el precio','Quieres comprar 5 acciones ahora. La tabla muestra todas las ofertas de venta disponibles en este ejemplo. Valora las conclusiones.',[
    ['Las cinco acciones no están ofrecidas a 10 €.',true],
    ['Aceptar otro precio podría permitir completar las cinco.',true],
    ['Ver 10 € garantiza pagar ese precio por toda la compra.',false]
   ],'A 10 € hay dos unidades. Las otras tres están ofrecidas a 11 €; comprar las cinco exige considerar ambas ofertas.'),
   table(['Precio de venta por acción','Acciones ofrecidas'],[['10 €','2'],['11 €','3']],'Ofertas inventadas, disponibles en este instante.')),
  pair('Una oferta y una compra realizada no son lo mismo',
   'Una oferta describe lo que alguien está dispuesto a hacer; una operación realizada confirma lo que ya ocurrió. Antes de negociar, las ofertas pueden retirarse o cambiar. Por eso un precio de una compra anterior cuenta una transacción pasada y no asegura que hoy siga habiendo acciones disponibles a ese importe.',
   'Distingue las propuestas que siguen abiertas de las transacciones ya confirmadas.',
   match('Cada aviso tiene una función','Relaciona cada aviso con lo que permite saber.',[
    ['«Venta confirmada: 3 acciones a 8 €»','Hubo una operación a esas condiciones'],
    ['«Se ofrecen 6 acciones a 9 €»','Hay una propuesta que aún podría cambiar'],
    ['«Oferta retirada antes de negociar»','Esa propuesta ya no está disponible']
   ],'La confirmación registra una operación. La oferta es una posibilidad actual, y la retirada elimina esa posibilidad sin que se haya cerrado una venta.')),
  pair('Las dos partes pueden tener motivos diferentes',
   'Dos inversores pueden aceptar la misma operación por razones distintas. Uno puede necesitar dinero para un pago cercano; el otro puede poder esperar años y pensar que el negocio mejorará. Ese acuerdo no revela quién tendrá razón sobre el futuro. Para entender una decisión hacen falta sus motivos y su situación, además del precio.',
   'El acuerdo sobre un precio no implica compartir necesidades ni expectativas.',
   rows('classify','Qué revela esta compraventa','Mario vende para pagar una factura este mes. Lucía compra porque puede mantener la inversión varios años. Clasifica lo que puedes concluir.',[
    {label:'Sus necesidades de dinero tienen fechas distintas.',options:['Está apoyado por el caso','No está demostrado'],answer:0},
    {label:'Ambos esperan que el precio suba en el mismo plazo.',options:['Está apoyado por el caso','No está demostrado'],answer:1},
    {label:'La operación demuestra que Lucía obtendrá beneficio.',options:['Está apoyado por el caso','No está demostrado'],answer:1}
   ],'Conocemos el pago cercano de Mario y el horizonte de Lucía. Ni compartir expectativas ni ganar dinero en el futuro se deducen del acuerdo.'))
 ],[
  pair('Dos rutas para el dinero de una compra',
   'En el mercado primario, una empresa crea y vende acciones nuevas para obtener financiación. En el mercado secundario, se compran y venden acciones que ya existen, y cobra su propietario vendedor. Estos nombres describen el origen de las acciones y el destino del pago; no dos tipos de empresa.',
   'Identifica si se crean acciones o se intercambian las que ya estaban en circulación.',
   choice('Sigue el recorrido del dinero','Norte crea acciones para financiar una nueva tienda. Un año después, Paula vende a Luis algunas de las que había comprado. Sin gastos, ¿qué recorrido es correcto?',[
    'Norte cobra por la creación inicial y Paula cobra por la venta posterior.',
    'Norte recibe el importe completo de las dos compras.',
    'Paula recibe la financiación inicial y Luis cobra por comprar después.'
   ],0,'La primera operación aporta fondos a la empresa. La segunda cambia quién posee acciones existentes: su vendedor es quien recibe el pago.')),
  pair('Una salida a bolsa puede combinar ambas rutas',
   'Una salida a bolsa es el comienzo de la negociación pública de unas acciones. En la oferta inicial pueden venderse acciones recién creadas, acciones de propietarios anteriores, o ambas. Por eso el importe total vendido no indica, por sí solo, cuánta financiación ha conseguido la empresa. Hay que separar los dos bloques.',
   'El total vendido en una oferta puede tener más de un destinatario.',
   match('Separa los bloques de una oferta','En la salida a bolsa de Faro se venden 100 € de acciones nuevas y 60 € de acciones que ya poseían sus fundadores. No hay gastos en este ejemplo. Relaciona cada importe con su destino.',[
    ['100 € del bloque de acciones nuevas','Financiación que recibe Faro'],
    ['60 € del bloque de los fundadores','Dinero que reciben los propietarios vendedores'],
    ['160 € del conjunto de la oferta','Total de compras; no todo entra en Faro']
   ],'El total reúne dos ventas diferentes. Solo el bloque recién creado aporta dinero a Faro; el otro remunera a los propietarios que venden.')),
  pair('Recibir financiación no equivale a obtener beneficio',
   'El dinero de una emisión da recursos para desarrollar un plan, pagar obligaciones u otros usos que se expliquen en la oferta. No es un beneficio conseguido al vender productos a clientes. Que la empresa reúna dinero no demuestra que el proyecto salga bien: todavía importa qué hará con él y qué resultados obtendrá.',
   'Financiar un plan y conseguir que ese plan funcione son pasos distintos.',
   activity(choice('Encuentra el salto de razonamiento','Una empresa obtiene dinero vendiendo acciones nuevas y anuncia que abrirá una fábrica el próximo año. Señala la única conclusión que no está justificada.',[
    'La empresa ha obtenido recursos para su plan.',
    'La oferta demuestra que la nueva fábrica ya genera beneficios.',
    'Para evaluar el plan habrá que estudiar su ejecución y sus resultados.'
   ],1,'Obtener financiación es un hecho distinto de construir la fábrica y de ganar dinero con ella. El anuncio todavía no acredita esos resultados.'),'intruder',{options:[
    'La empresa ha obtenido recursos para su plan.','La oferta demuestra que la nueva fábrica ya genera beneficios.','Para evaluar el plan habrá que estudiar su ejecución y sus resultados.'
   ],answer:1,instruction:'Selecciona la conclusión que adelanta un resultado aún no demostrado.'})),
  pair('Qué revisar en la documentación de la oferta',
   'Un folleto es el documento que describe una oferta de inversión. Para saber a quién llega el dinero, revisa quién vende, qué parte corresponde a acciones nuevas y qué uso prevé dar la empresa a los fondos que reciba. Una noticia sobre «mucho interés» o una subida posterior del precio no sustituye esos datos.',
   'Busca el detalle de los vendedores y de los fondos que llegarán a la empresa.',
   activity(choice('Pide el dato que responde a tu duda','Un titular dice: «La salida a bolsa ha vendido 200 millones de euros en acciones». Quieres comprobar qué dinero entra en la empresa para ampliar su actividad. ¿Qué documento te ayuda directamente?',[
    'La distribución de acciones nuevas y existentes, sus vendedores y el destino de los fondos en el folleto.',
    'El precio máximo que alcanzaron las acciones el primer día.',
    'La lista de noticias que mencionaron la salida a bolsa.'
   ],0,'El folleto permite separar financiación para la empresa de cobros de los antiguos propietarios. Ni el precio posterior ni la atención de la prensa identifica ese reparto.'),'clues',{options:[
    'La distribución de acciones nuevas y existentes, sus vendedores y el destino de los fondos en el folleto.','El precio máximo que alcanzaron las acciones el primer día.','La lista de noticias que mencionaron la salida a bolsa.'
   ],answer:0,clues:['La duda es cuánto dinero podrá utilizar la empresa.','La oferta puede incluir ventas de propietarios anteriores.'],instruction:'Elige la información que permite comprobar el destino del pago.'}))
 ]];
 sets[0][1][1].figure=structuredClone(sets[0][1][0].figure);
 sets.forEach((pairs,index)=>{
  const lesson=at(470+index);usePairs(lesson,pairs);
  lesson.minutes=6;
  lesson.bridge=index===0?'Ya sabes cómo se acuerda una operación. Ahora seguiremos el dinero: ¿lo recibe la empresa o quien vende?':'Conoces las rutas de financiación y de intercambio. A continuación verás cómo nuevas decisiones cambian los precios.';
 });
 const exam=result.exams.find(item=>item.id===47);
 exam.steps[0]={...choice('Distingue intención y ejecución','Alguien quiere comprar 8 acciones a un máximo de 7 €. La única oferta disponible pide 8 € por acción. Nadie cambia su propuesta. ¿Qué puedes concluir?',[
  'La compra está garantizada porque hay una oferta de venta.','Las condiciones aún no coinciden; no se ha confirmado la operación.'
 ],1,'La presencia de ambas partes no basta: también deben encajar sus condiciones.'),reviewLesson:470};
 exam.steps[1]={...choice('Interpreta una oferta mixta','Una salida a bolsa incluye 90 € de acciones nuevas y 30 € de acciones de una antigua propietaria. Sin gastos, ¿qué frase explica correctamente el total?',[
  'Los 120 € son financiación nueva para la empresa.','Se venden 120 € en total, pero la empresa recibe 90 € y la propietaria 30 €.'
 ],1,'La oferta combina creación de acciones e intercambio de acciones existentes. Sus importes llegan a destinatarios distintos.'),reviewLesson:471};
 for(const step of exam.steps.slice(0,2))delete step.hint;
 return result;
}
