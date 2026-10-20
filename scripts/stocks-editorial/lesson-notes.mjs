// Compatible explanatory edits: identities, questions, rewards and drafts stay intact.
export const LESSON_NOTES_IDS=[460,461,465,467,468];
export const lessonNotes={
 460:{4:'Cuando compras acciones, su precio puede subir o bajar, pero **no ganas ni pierdes ese dinero de forma definitiva hasta que las vendes**. Por ejemplo, si compras 6 acciones a 10 € cada una, habrás invertido 60 €. Si después suben a 12 €, tus acciones valdrán 72 € y tendrás una **ganancia pendiente de 12 €**. Sin embargo, ese beneficio puede desaparecer si el precio vuelve a bajar. Si decides vender las 6 acciones a 12 €, habrás conseguido una **ganancia realizada de 12 €**, antes de gastos e impuestos. Por eso, es importante distinguir entre lo que valen tus acciones mientras las conservas y el dinero que realmente obtienes al venderlas.'},
 465:{
  2:'Cuando consultas tu cuenta de inversión, verás dos conceptos importantes. **El efectivo** es el dinero que tienes en la cuenta y que puedes utilizar para comprar acciones o retirar, según las condiciones del servicio. **El valor de tus acciones** es lo que valen tus inversiones en ese momento, según su precio de mercado. Por ejemplo, si tienes 200 € en efectivo y tus acciones valen 800 €, tu patrimonio total es de 1.000 €. Si esas acciones han subido 100 €, esa ganancia ya está incluida en los 800 €. **No debes sumarla otra vez**, porque estarías contando el mismo dinero dos veces.',
  4:'Cuando compras acciones, su precio puede subir o bajar, pero **mientras no las vendas, tus ganancias o pérdidas no son definitivas**. Por ejemplo, si compras acciones por 100 € y su valor sube a 130 €, tienes una ganancia de 30 €, pero todavía no has recibido ese dinero. Si decides venderlas por 130 €, obtendrás un beneficio de 30 €, antes de gastos e impuestos. **Además, cuando vendes acciones con ganancias, normalmente tienes que pagar impuestos por el beneficio obtenido**, no por todo el dinero de la venta. En cambio, si decides conservarlas no pagas impuestos simplemente porque hayan subido de precio.'},
 467:{
  2:'Cuando recibes dividendos, puedes utilizar ese dinero para comprar más acciones de la empresa. Esto se conoce como **reinvertir los dividendos**. Por ejemplo, si tienes 10 acciones y cada una reparte 2 €, cobrarás 20 €. Si utilizas ese dinero para comprar 2 acciones más, pasarás a tener 12. Si al año siguiente la empresa vuelve a pagar 2 € por acción, recibirás 24 € en dividendos. **Así, puedes conseguir que tus dividendos generen nuevos dividendos**, aunque debes recordar que estos pagos no están garantizados y que tus acciones también pueden perder valor.',
  6:'Cuando reinviertes tus dividendos, puede que no tengas suficiente dinero para comprar todas las acciones que quieras. Por ejemplo, si recibes 11 € en dividendos y cada acción cuesta 5 €, podrás comprar 2 acciones por 10 € y te sobrará 1 €. **Ese euro se quedará en tu cuenta como efectivo**, para que puedas utilizarlo más adelante. Algunas plataformas permiten comprar fracciones de acciones, pero si la tuya solo admite acciones completas, tendrás que esperar a reunir suficiente dinero para comprar otra.'},
 468:{
  2:'Cuando consultas la **rentabilidad por dividendo** de una acción, es importante saber cómo se ha calculado. Algunas plataformas utilizan los dividendos que la empresa pagó durante el último año, mientras que otras muestran lo que se espera que pague en el futuro. Por ejemplo, si una acción cuesta 100 € y la empresa repartió 5 € por acción el año pasado, su rentabilidad por dividendo sería del 5 %. **Pero eso no significa que vaya a pagar otros 5 € el próximo año**, porque los dividendos pueden aumentar, reducirse o incluso desaparecer.',
  4:'Una empresa puede ofrecer una **rentabilidad por dividendo muy alta**, pero eso no significa que sea una buena inversión. Por ejemplo, si una acción baja de 100 € a 50 € y la empresa sigue pagando 5 € anuales por acción, su rentabilidad por dividendo pasa del 5 % al 10 %. Sin embargo, **esa caída del precio podría indicar que los inversores están preocupados por el futuro de la empresa**. Si el negocio atraviesa dificultades económicas, podría verse obligado a reducir o eliminar sus dividendos. Por eso, antes de dejarte llevar por un porcentaje elevado, es importante comprobar si la empresa gana suficiente dinero para mantener esos pagos.',
  6:'Cuando consultas la información de una acción, es importante **no sacar conclusiones a partir de un solo dato**. Por ejemplo, que una empresa pagara dividendos el año pasado no garantiza que vuelva a hacerlo. Que su rentabilidad por dividendo haya aumentado puede deberse simplemente a que el precio de sus acciones ha caído. Y si la empresa anuncia que reducirá sus dividendos, significa que los próximos pagos serán menores de lo previsto. **Por eso, antes de invertir, conviene analizar varios datos y entender qué nos dice realmente cada uno.**'}
};
export function refineLessonNotes(result){
 for(const [id,notes] of Object.entries(lessonNotes)){
  const lesson=result.lessons.find(l=>l.id===Number(id));
  for(const [index,body] of Object.entries(notes)){
   if(lesson.steps[index].type!=='learn')throw new Error(`Expected teaching screen ${id}/${index}`);
   lesson.steps[index].body=body;
  }
 }
 const pending=result.lessons.find(l=>l.id===465);
 pending.steps[0].body=pending.steps[0].body.replace(' La pendiente puede cambiar; no es dinero ingresado por una venta.','');
 pending.summary=pending.steps[0].body;
 const recovery=result.lessons.find(l=>l.id===461).steps[6];
 recovery.body+='\n\nPuedes hacer este cálculo con la calculadora «Después de una caída» de la sección Laboratorio.';
 recovery.laboratoryLink={tool:'recovery',label:'Abrir «Después de una caída» en Laboratorio'};
}
