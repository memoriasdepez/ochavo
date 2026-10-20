import {pair,choice,multi,numeric,match,order,rows,truth,activity,table,usePairs} from './helpers.mjs';

export const COMPOUND_WORLD_REVISION='stocks-compound-2026-10-11';

// Four teaching/exercise pairs keep existing exercise reward slots stable. The
// calculators are optional teaching interactions, never scored questions. Their
// editable values cannot change an exercise's fixed premises or answer key.
const lab=(p,kind,values,title,prompt)=>{
 p[0].growthLab={kind,title,prompt,values,compareYears:[15,30]};return p;
};
const all=(title,body,options,answers,explanation)=>activity(multi(title,body,options,answers,explanation),'all',{
 options,answers,instruction:'Selecciona todas las conclusiones justificadas por el caso.'
});
const repair=(title,body,label,wrongWord,options,answer,explanation)=>activity(choice(title,body,options,answer,explanation),'repair',{
 rows:[{label,wrongWord,options,answer}],instruction:'Sustituye la parte marcada por la expresión correcta.'
});
const illustrated=(exercise,figure)=>({...exercise,figure});
const classify=(title,body,entries,explanation)=>rows('classify',title,body,entries.map(([label,answer])=>({label,options:['Lo sabemos','Falta información'],answer})),explanation);

function lessons(){return [
 [
  pair('La ganancia necesita una referencia',
   'Dos personas pueden ganar la misma cantidad de euros y haber obtenido resultados muy distintos. Si una gana 50 € con 500 € y otra gana 50 € con 1.000 €, la primera ha ganado más por cada euro invertido. El porcentaje sirve para poner ambas ganancias sobre una base comparable. Antes de compararlas, comprueba también que hablan del mismo plazo y que incluyen los mismos conceptos, como los dividendos y los gastos.',
   'Compara lo ganado con el dinero que hizo falta invertir y con el tiempo transcurrido.',
   choice('Quién hizo rendir más cada euro','Durante el mismo año, Alba gana 80 € sobre 800 € y Bruno gana 120 € sobre 2.000 €. Los importes ya incluyen dividendos y gastos. ¿Qué comparación es correcta?',[
    'Bruno obtiene el porcentaje mayor porque gana más euros.',
    'Alba obtiene el porcentaje mayor, aunque gana menos euros.',
    'No se pueden comparar porque comenzaron con cantidades distintas.'
   ],1,'Alba obtiene 80 ÷ 800 = 10 % y Bruno 120 ÷ 2.000 = 6 %. Bruno gana más euros; Alba obtiene más ganancia por cada euro invertido.')),
  pair('Cómo calcular el porcentaje sin mezclar cantidades',
   'Primero calcula el resultado de la inversión: valor final más los cobros recibidos, menos lo invertido y los gastos que no estén ya descontados. Después divide ese resultado entre el capital inicial y multiplica por 100. En esta lección no añadimos ni retiramos dinero durante el periodo. Por ejemplo, pasar de 400 € a 440 €, sin otros cobros ni gastos, da 40 ÷ 400 × 100 = 10 %. La base es lo que pusiste al empezar, no lo que tienes al final.',
   'La ganancia va arriba en la división; el capital de partida, abajo.',
   numeric('Reúne los dos componentes','Compraste acciones por 500 €. Un año después valen 530 € y has recibido 10 € de dividendos que conservas aparte. No hubo gastos ni otras aportaciones. ¿Cuál es la rentabilidad total en porcentaje?',8,'%',
    'El resultado es 530 + 10 − 500 = 40 €. Dividir 40 entre los 500 € iniciales y multiplicar por 100 da un 8 %. El dividendo también forma parte del resultado.')),
  pair('El porcentaje siempre pertenece a un periodo',
   '«He ganado un 12 %» es una frase incompleta si no sabemos cuándo comenzó y terminó la inversión. Puede describir un mes, un año o toda una década. La rentabilidad acumulada reúne el cambio de todo ese periodo. Todavía no te dice cuánto equivale por año. En el próximo punto aprenderás a hacer esa conversión con una calculadora: se llama rentabilidad anualizada.',
   'Una cifra acumulada necesita fecha de inicio y fecha de final.',
   match('Ponle la etiqueta adecuada','Relaciona cada dato con lo que describe. No necesitas hacer cuentas.',[
    ['«La ganancia total ha sido de 90 €»','Resultado expresado en dinero'],
    ['«Un 12 % desde enero hasta diciembre»','Porcentaje con un periodo definido'],
    ['«Un 12 %, sin indicar fechas»','Porcentaje al que le falta el plazo']
   ],'Los euros cuantifican la ganancia. Un porcentaje permite relacionarla con el capital, pero necesita un plazo para compararlo con otro resultado.')),
  pair('Más saldo no siempre significa más rentabilidad',
   'El saldo de una cuenta puede crecer porque la inversión produce resultados o porque tú ingresas dinero nuevo. Una aportación no es una ganancia. Si empiezas con 1.000 €, añades 200 € al final y acabas con 1.250 €, 200 € del aumento proceden de tu bolsillo. Para estudiar la rentabilidad de planes con varios ingresos también importan las fechas de esos ingresos. No basta con comparar el saldo inicial y el final.',
   'Separa el dinero añadido del resultado producido por la inversión.',
   truth('Lee un saldo con una aportación','Empiezas con 600 €. Justo al terminar el año ingresas 100 € y entonces el saldo total es de 730 €. No hay gastos ni retiros. Valora estas frases.',[
    ['Los 130 € de aumento son todos ganancias de la inversión.',false],
    ['La inversión ha producido 30 € antes de ese ingreso final.',true],
    ['El ingreso de 100 € ha estado invertido durante todo ese año.',false]
   ],'Antes del ingreso final había 630 €. Los 30 € de diferencia respecto a los 600 € iniciales sí son resultado; los otros 100 € son una aportación que acaba de llegar.'))
 ],
 [
  pair('Dos relojes para el mismo resultado',
   'La rentabilidad acumulada responde a «¿cuánto cambió mi inversión en todo el periodo?». La anualizada responde a otra pregunta: «¿qué porcentaje constante por año produciría ese mismo resultado si las ganancias se quedaran invertidas?». Se abrevia CAGR, por sus siglas en inglés. Pasar de 100 € a 121 € en dos años supone un 21 % acumulado. Su equivalente anual es el 10 %: 100 × 1,10 × 1,10 = 121. La segunda subida se aplica a 110 €, no a 100 €.',
   'El CAGR convierte un resultado de varios años en una tasa anual equivalente.',
   match('Cada dato responde a una pregunta','Una inversión pasa de 200 € a 242 € en dos años, sin añadir ni sacar dinero. Relaciona las tres cifras con su significado.',[
    ['42 €','Ganancia expresada en dinero'],
    ['21 % acumulado','Cambio respecto al capital inicial durante los dos años'],
    ['10 % anualizado','Tasa constante que llevaría de 200 € a 242 € en dos años']
   ],'200 × 1,10 × 1,10 = 242. Los 42 € y el 21 % describen el resultado total; el 10 % expresa su equivalente por año.')),
  lab(pair('Una calculadora para comparar plazos',
   'Para calcular el CAGR necesitas tres datos: capital inicial, capital final y años transcurridos. La calculadora busca qué crecimiento repetido cada año conecta las dos cantidades. Prueba aquí 1.000 € y 2.000 €. Cambia el plazo de 15 a 30 años, manteniendo ambos importes: llegar al mismo destino con el doble de tiempo exige una tasa anual menor. Las barras comparan el principio y el final; no reconstruyen las subidas y bajadas que ocurrieron entre ambos.',
   'El mismo resultado acumulado puede corresponder a tasas anuales muy diferentes.',
   choice('El plazo cambia la lectura','Una inversión A pasa de 500 € a 1.000 € en 10 años. B pasa de 500 € a 1.000 € en 20 años. No hay aportaciones, retiros ni cobros aparte. ¿Qué afirmación es correcta?',[
    'Tienen el mismo CAGR porque las dos duplicaron el capital.',
    'A tiene mayor CAGR porque consigue la misma multiplicación en menos tiempo.',
    'B tiene mayor CAGR porque permaneció invertida durante más años.'
   ],1,'La acumulada es del 100 % en ambas. A necesita una tasa anual equivalente mayor para duplicar el dinero en la mitad de tiempo.')),
   'cagr',{initial:1000,final:2000,years:15},'Explora el mismo destino con dos plazos','Mantén 1.000 € y 2.000 €. Compara 15 y 30 años y observa la tasa anual equivalente.'),
  pair('Anualizar no es dividir entre los años',
   'Si una inversión gana un 21 % en dos años, dividir 21 entre 2 da 10,5 %. Esa división reparte el cambio como si cada año se aplicara a la misma base. El CAGR tiene en cuenta que el primer resultado se queda invertido: al 10 %, el primer año añade 10 € a cada 100 € y el segundo añade 11 €. Por eso su equivalente es 10 %, no 10,5 %. No hace falta memorizar la fórmula; sí entender por qué la división rápida puede engañar.',
   'El crecimiento anual equivalente incorpora el resultado del año anterior.',
   repair('Corrige una comparación','Una nota afirma: «Pasar de 100 € a 144 € en dos años equivale a un 22 % anualizado». Recuerda que 100 × 1,20 × 1,20 = 144. Corrige solo el dato anual.',
    'La tasa anualizada es «22 %».','22 %',['20 %','22 %','44 %'],0,
    'Un 20 % repetido dos años lleva de 100 € a 120 € y después a 144 €. El 44 % es acumulado; dividirlo entre dos no da su tasa anualizada.')),
  pair('Cuándo sirve esta calculadora y cuándo no',
   'El CAGR calculado solo con el principio y el final sirve cuando no hay entradas ni salidas de dinero durante el periodo. Si aportas ahorros nuevos, parte del saldo final viene de esos ingresos y la calculadora los confundiría con ganancias. Además, una tasa anualizada resume el resultado: no significa que cada año fuera igual y no promete que se repita. La herramienta queda disponible en Laboratorio → CAGR, también después de terminar la lección.',
   'Usa el CAGR con los datos y límites que necesita; es un resumen, no una promesa.',
   all('En qué casos puedes usarla directamente','Elige los casos en los que el capital inicial, el final y el plazo bastan para calcular el CAGR de la inversión con esta herramienta.',[
    'Inviertes 1.000 €, reinviertes los cobros y no haces aportaciones ni retiros durante cinco años.',
    'Empiezas con 1.000 € y añades 200 € cada mes durante cinco años.',
    'Inviertes 1.000 € y acabas con 800 € tres años después, sin movimientos intermedios.',
    'Retiras parte del dinero todos los años y solo conoces el saldo que queda al final.'
   ],[0,2],'La herramienta también admite pérdidas. Lo que impide usarla directamente son las entradas o salidas intermedias que los tres datos no recogen.'))
 ],
 [
  pair('La media de los porcentajes cuenta una parte',
   'La media simple suma los porcentajes de cada año y divide entre el número de años. Un año de +20 % y otro de −20 % dan una media del 0 %. Sin embargo, 100 € suben primero a 120 € y después bajan a 96 €: la pérdida se aplica a una base mayor. Para saber cuánto dinero queda hay que encadenar los cambios, multiplicando por 1 más cada porcentaje dividido entre 100. Para una caída del 20 %, el factor es 0,80.',
   'El saldo final se calcula aplicando cada variación al saldo que deja la anterior.',
   numeric('Comprueba otra combinación','Empiezas con 200 €. El primer año ganas un 25 % y el segundo pierdes un 20 %. No añades ni retiras dinero. ¿Cuánto queda al terminar? Aplica primero × 1,25 y después × 0,80.',200,'€',
    '200 × 1,25 = 250 €; después 250 × 0,80 = 200 €. La media simple de +25 % y −20 % es positiva, pero el capital ha vuelto al punto de partida.')),
  pair('La media que sí conecta el principio y el final',
   'La media geométrica encadena los factores de crecimiento en vez de promediar los porcentajes por separado. Su resultado anual coincide con el CAGR cuando no hay aportaciones ni retiros. En el ejemplo anterior de +20 % y −20 %, el capital termina por debajo del inicial, así que esa tasa anual equivalente es negativa, aunque la media simple sea cero. Cuando leas «rentabilidad media», comprueba qué media han usado y qué periodo abarca.',
   'La media simple describe porcentajes; la geométrica describe el crecimiento compuesto equivalente.',
   truth('Qué media explica el resultado','Una ficha muestra dos años: +50 % y −50 %. Una inversión de 100 € termina en 75 €, sin movimientos de dinero. Valora las conclusiones.',[
    ['La media simple de los dos porcentajes es 0 %.',true],
    ['El CAGR también debe ser 0 % porque hay una subida y una bajada iguales.',false],
    ['La tasa anual equivalente es negativa porque el capital final es menor.',true]
   ],'La media simple es (50 − 50) ÷ 2 = 0 %. Pero 100 × 1,50 × 0,50 = 75: para conectar 100 con 75 hace falta un crecimiento anual equivalente negativo.')),
  pair('El promedio puede ocultar un camino agitado',
   'Dos series pueden tener la misma media simple y acabar en importes distintos. Si partes de 100 €, dos años de +10 % dejan 121 €. Una subida del 30 % seguida de una caída del 10 % deja 117 €. Ambas series tienen media simple del 10 %, pero la segunda pierde parte del crecimiento compuesto por la combinación de subidas y bajadas más grandes. Además, soportar esas caídas puede resultar difícil si necesitas sacar el dinero a mitad de camino.',
   'Mira los resultados encadenados y las oscilaciones que la media no muestra.',
   illustrated(rows('table','Compara dos recorridos','Las dos inversiones parten de 100 €, sin aportaciones ni retiros. Completa cada afirmación usando la tabla.',[
    {label:'Qué inversión termina con mayor saldo.',options:['A','B','Acaban igual'],answer:0},
    {label:'Qué comparación da la media simple anual.',options:['A tiene mayor media','B tiene mayor media','Las dos tienen la misma media'],answer:2},
    {label:'En cuál hubo un año con pérdidas.',options:['A','B','En ninguna'],answer:1}
   ],'A termina con 121 € y B con 117 €, aunque ambas tienen media simple del 10 %. La bajada de B también es una diferencia del recorrido que conviene conocer.'),
   table(['Inversión','Año 1','Año 2','Saldo final'],[['A','+10 %','+10 %','121 €'],['B','+30 %','−10 %','117 €']]))),
  lab(pair('Un resumen no reconstruye los años reales',
   'Al introducir el capital inicial y el final en la calculadora CAGR, obtienes una tasa de crecimiento anual equivalente. Muchas historias distintas pueden acabar en el mismo punto: una subida constante o varios años de avances y caídas. Por eso, una tasa anualizada sirve para comparar resultados, pero necesitas los datos de cada año para conocer el recorrido. Cambia aquí el saldo final y observa cómo cambia la tasa; las barras de inicio y final no pueden contar la historia intermedia.',
   'Para conocer las caídas necesitas datos del recorrido, además de la tasa anualizada.',
   choice('Qué dato pedirías ahora','Dos inversiones tuvieron el mismo CAGR durante los mismos cinco años, sin aportaciones ni retiros. Te preocupa haber tenido que vender después de una caída. ¿Qué información responde mejor a esa preocupación?',[
    'La evolución de su valor durante esos años y la magnitud de las caídas.',
    'Solo el saldo final de cada una, porque el CAGR ya describe todos los años.',
    'La media simple de sus porcentajes, sin mirar los valores intermedios.'
   ],0,'La evolución durante el periodo permite observar las caídas. Un único resumen del principio al final no dice lo que habría ocurrido al vender antes.')),
   'cagr',{initial:1000,final:1170,years:2},'Distingue el resumen del recorrido','Las barras comparan el inicio y el final. La tasa calculada es una equivalencia anual, no el resultado real de cada año.')
 ],
 [
  pair('El mismo dinero puede comprar menos',
   'La inflación es la subida general de los precios. No reduce los euros escritos en tu cuenta, pero sí lo que puedes comprar con ellos. Si una compra que costaba 100 € pasa a costar 105 €, conservar 100 € ya no alcanza para pagarla entera. A esa capacidad de comprar bienes y servicios la llamamos poder adquisitivo o poder de compra. La inflación general resume muchos precios; tus gastos concretos pueden subir más o menos.',
   'El saldo en euros y la capacidad de compra son medidas distintas.',
   choice('Qué ha cambiado realmente','El dinero de Laura sigue siendo 1.000 €. La misma cesta de productos que antes costaba 1.000 € cuesta ahora 1.080 €. ¿Qué descripción es correcta?',[
    'Laura ha perdido 80 € de su cuenta.',
    'Su saldo no ha cambiado, pero ya no compra la cesta completa.',
    'Su capacidad de compra no ha cambiado porque conserva 1.000 €.'
   ],1,'No ha desaparecido dinero de la cuenta. Lo que ha aumentado es el precio de la misma compra, por lo que ese saldo permite adquirir menos.')),
  pair('Dos formas de contar el efecto de la inflación',
   'Puedes preguntar cuánto costará una compra en el futuro o cuánto valdrá entonces el poder de compra de una cantidad fija. Son dos miradas sobre el mismo cambio de precios. Con una inflación constante del 3 %, una cesta de 1.000 € costaría unos 1.558 € al cabo de 15 años. A la inversa, 1.000 € guardados sin rendimiento comprarían entonces aproximadamente lo que hoy compras con 642 €. Esos 642 € son una equivalencia, no un descuento en tu cuenta.',
   'Distingue el precio futuro de una compra del valor de tu dinero medido en compras de hoy.',
   match('Pon cada cifra en su sitio','En este ejemplo, una cesta cuesta hoy 100 € y el próximo año 110 €. Relaciona las cifras con su significado.',[
    ['110 €','Precio futuro de la misma cesta'],
    ['100 € guardados sin rendimiento','Saldo que permanece igual'],
    ['Unos 90,91 € de hoy','Poder de compra equivalente de esos 100 € el próximo año']
   ],'100 ÷ 1,10 ≈ 90,91. El saldo sigue en 100 €, pero su capacidad de compra equivale a la de unos 90,91 € de hoy.')),
  lab(pair('Treinta años hacen visible un cambio pequeño',
   'Una subida de precios moderada, repetida durante mucho tiempo, puede cambiar bastante el presupuesto. Con un 3 % constante, la cesta de 1.000 € del ejemplo costaría unos 2.427 € en 30 años. Usa la calculadora para comparar 15 y 30 años. Después cambia la inflación del 3 % al 2 % o al 4 %, sin tocar el resto: verás cuánto depende el resultado de ese supuesto. No estamos prediciendo la inflación futura; estamos viendo sus posibles efectos.',
   'Los cambios de precios también se acumulan sobre los de años anteriores.',
   truth('Cómo leer un escenario a largo plazo','Una simulación usa un 3 % de inflación cada año durante 30 años. Valora estas afirmaciones.',[
    ['El cálculo muestra lo que ocurriría si se mantuviera ese supuesto.',true],
    ['Un 3 % constante durante 30 años encarece una cesta exactamente un 90 %.',false],
    ['Probar también un 2 % y un 4 % ayuda a ver cuánto depende el resultado de la inflación.',true]
   ],'Cada subida se aplica al precio que dejó la anterior, así que no basta con 3 × 30. Variar la hipótesis ayuda a comprender su efecto; no convierte el escenario en una predicción.')),
   'inflation',{amount:1000,years:30,inflationRate:3},'Mira qué pasa en 15 y 30 años','Compara los dos plazos. Luego cambia solo la inflación y observa el poder de compra que conservaría la misma cantidad.'),
  pair('Usa la inflación para interpretar objetivos',
   'Un objetivo lejano puede expresarse en euros del futuro o en lo que quieres poder comprar. Decir «quiero tener 20.000 € dentro de 30 años» no define la misma capacidad de compra que «quiero el equivalente a 20.000 € de hoy». Para explorar esa diferencia, tienes esta herramienta también en Laboratorio → Inflación. Úsala como una ayuda para entender escenarios y revisa los precios que afectan a tu objetivo concreto.',
   'Al fijar una cantidad lejana, aclara si hablas de euros futuros o de capacidad de compra actual.',
   all('Qué preguntas aclaran el objetivo','Sergio dice: «Dentro de 20 años quiero tener 10.000 € para una reforma». ¿Qué preguntas ayudan a interpretar ese objetivo?',[
    '¿Los 10.000 € describen el coste de la reforma hoy o el presupuesto que espera tener entonces?',
    '¿Cómo cambiaría la cantidad necesaria si los precios subieran más de lo previsto?',
    '¿Puede dar por hecho que todo costará lo mismo porque el objetivo está expresado en euros?',
    '¿La evolución general de precios refleja bien los materiales y trabajos que necesitará?'
   ],[0,1,3],'Hace falta aclarar la fecha de referencia, probar otras subidas de precios y considerar los gastos concretos. La moneda no mantiene por sí sola su poder de compra.'))
 ],
 [
  pair('Ganar euros y ganar capacidad de compra',
   'La rentabilidad nominal indica cómo cambia el número de euros. La rentabilidad real ajusta ese cambio por la inflación: te dice si el dinero permite comprar más o menos. Si tu inversión crece un 4 % y los precios un 6 %, tienes más euros pero menos capacidad de compra. Para hablar de mejora real necesitas comparar ambos cambios durante el mismo periodo.',
   'Una ganancia nominal puede convivir con una pérdida de poder de compra.',
   classify('Separa las dos medidas','Una inversión gana un 5 % en un año. La cesta de referencia sube un 7 % ese mismo año. Clasifica las afirmaciones.',[
    ['El número de euros de la inversión ha aumentado.',0],
    ['El dinero final compra menos de esa cesta que al principio.',0],
    ['Todos los productos comprados por el inversor han subido exactamente un 7 %.',1]
   ],'El cambio de la inversión es menor que el de la cesta, así que pierde poder de compra respecto a ella. El índice de una cesta no demuestra que todos sus productos subieran igual.')),
  pair('Una división para obtener la medida exacta',
   'Para calcular la rentabilidad real, divide el factor de crecimiento del dinero entre el factor de crecimiento de los precios, resta 1 y multiplica por 100. Si el dinero crece un 10 % y los precios un 5 %, la cuenta es (1,10 ÷ 1,05 − 1) × 100 ≈ 4,76 %. Restar 10 − 5 da una aproximación del 5 %, pero no el valor exacto. Si ambos empezaron en 100 €, también puedes dividir directamente sus importes finales.',
   'La cuenta exacta compara cuánto crece el dinero con cuánto crece el precio de la compra.',
   numeric('Calcula la mejora de poder de compra','La inversión y la cesta empezaron ambas en 100 €. Al cabo de un año, la inversión vale 112 € y la cesta cuesta 108 €. Calcula (112 ÷ 108 − 1) × 100 y redondea a dos decimales.',3.70,'%',
    '112 ÷ 108 ≈ 1,037037. Al restar 1 y multiplicar por 100 resulta una rentabilidad real aproximada del 3,70 %. Restar 12 − 8 daría un 4 %, que es una aproximación.')),
  pair('Una curva creciente también necesita contexto',
   'Al mirar un gráfico de inversión, comprueba si está expresado en euros de cada momento o en poder de compra equivalente al de hoy. Con un 5 % nominal constante y un 3 % de inflación constante, 1.000 € se convierten en unos 4.322 € en 30 años. Sin embargo, equivaldrían aproximadamente a 1.781 € de poder de compra de hoy: 4.322 ÷ 1,03 elevado a 30, usando los valores sin redondear. El resultado sigue siendo positivo, pero el crecimiento real es bastante menor que el nominal.',
   'Antes de interpretar un gráfico, identifica en qué euros están expresadas sus cifras.',
   illustrated(choice('Qué muestra la tabla','Las dos columnas describen la misma inversión hipotética de 1.000 €, al 5 % nominal y con un 3 % de inflación anual constante, sin aportaciones, gastos ni impuestos. ¿Qué lectura es correcta?',[
    'La columna de poder de compra es dinero adicional que se suma al saldo.',
    'Los euros nominales crecen más que su capacidad de compra porque también suben los precios.',
    'La diferencia entre las columnas es una comisión cobrada por la inversión.'
   ],1,'Son dos maneras de expresar el mismo dinero. La segunda descuenta el cambio de precios para poder comparar con lo que compraba el capital inicial.'),
   table(['Plazo','Saldo en euros','Poder de compra en euros de hoy'],[['15 años','≈ 2.079 €','≈ 1.334 €'],['30 años','≈ 4.322 €','≈ 1.781 €']],'Escenario hipotético. Valores redondeados; las tasas constantes no son una previsión.'))),
  pair('No ajustes dos veces la misma cifra',
   'Cuando un informe ya expresa la rentabilidad en términos reales, la inflación ya está descontada. Volver a restarla falsearía el resultado. Tampoco confundas «real» con «garantizada»: la palabra solo indica el ajuste por precios. En un escenario futuro, tanto la rentabilidad como la inflación siguen siendo supuestos que pueden cambiar.',
   'Real significa ajustada por inflación, no segura ni libre de otros costes.',
   repair('Corrige la etiqueta de un informe','Un informe estima «un 2 % anual real». Alguien resume: «Es un 2 % al que todavía falta descontar la inflación». Sustituye la parte errónea.',
    'El 2 % real es una tasa «antes de descontar la inflación».','antes de descontar la inflación',[
     'después de ajustar por la inflación','antes de descontar la inflación','que garantiza ganar un 2 % cada año'
    ],0,'Una tasa real ya incorpora el ajuste por precios. Que sea una estimación significa que no está garantizada; no debe descontarse la inflación una segunda vez.'))
 ],
 [
  pair('Dejar que el resultado siga trabajando',
   'El interés compuesto aparece cuando el resultado se incorpora al capital sobre el que se calculará el siguiente. Imagina 1.000 € y una rentabilidad del 10 % constante: el primer año suma 100 €, así que el segundo empieza con 1.100 €. Ese segundo año suma 110 €, no 100 €. En acciones no se promete un interés fijo: el ejemplo representa una rentabilidad hipotética con los resultados reinvertidos, incluidos los dividendos si los hay.',
   'Cada periodo parte del saldo acumulado, no vuelve a empezar desde el capital inicial.',
   order('Reconstruye el segundo año','Ya ha terminado el primer año de una inversión y decides reinvertir su ganancia. Ordena lo que ocurre para calcular el siguiente año.',[
    'Aplicar la rentabilidad del nuevo año a ese saldo.',
    'Incorporar al capital la ganancia que acaba de obtenerse.',
    'Obtener el nuevo saldo después del resultado de ese año.'
   ],[1,0,2],'Primero la ganancia pasa a formar parte del capital. Después el nuevo porcentaje se aplica a ese saldo y produce el siguiente resultado.')),
  lab(pair('Ver la curva ayuda a entenderlo',
   'En el gráfico, la línea de dinero aportado indica lo que salió de tu bolsillo. La de saldo incluye también los resultados acumulados. Empieza con 1.000 €, sin nuevas aportaciones y con un 5 % anual constante. A los 15 años el saldo hipotético ronda 2.079 €; a los 30, 4.322 €. El segundo tramo de 15 años añade más euros porque comienza con una base mayor. Explora el gráfico antes de continuar: la separación de las líneas hace visible el efecto.',
   'Con una tasa positiva constante, la ganancia en euros aumenta a medida que crece la base.',
   choice('Por qué la curva se va levantando','Una simulación no añade dinero nuevo y aplica el mismo porcentaje positivo cada año. En los últimos años suma más euros por año que al principio. ¿Qué lo explica?',[
    'El porcentaje anual debe haber aumentado aunque no se muestre.',
    'El mismo porcentaje se aplica a un saldo que ya incluye ganancias anteriores.',
    'La calculadora ha contado las ganancias como nuevas aportaciones del usuario.'
   ],1,'No hace falta subir el porcentaje ni añadir dinero. La base sobre la que se aplica ese porcentaje ya es mayor gracias a los resultados reinvertidos.')),
   'compound',{initial:1000,monthly:0,years:30,annualRate:5},'Observa la diferencia entre 15 y 30 años','Mantén las aportaciones mensuales en cero para aislar el efecto de reinvertir. Cambia el plazo y recorre la curva.'),
  pair('Reinvertir y retirar no producen el mismo final',
   'Si sacas las ganancias, ese dinero deja de formar parte de la base invertida. Con 1.000 € al 10 % durante dos años, retirar cada ganancia anual deja 1.000 € invertidos y 200 € aparte. Reinvertir todo deja 1.210 € dentro de la inversión. En esta comparación los cobros retirados no generan rendimiento fuera. Los 10 € de diferencia proceden de aplicar el segundo 10 % a los 100 € ganados el primer año.',
   'Lo que retiras deja de participar en el crecimiento de esa inversión.',
   numeric('Cuánto aporta reinvertir','Dos planes empiezan con 500 € y obtienen un 10 % anual constante durante dos años. A reinvierte todo. B retira la ganancia al final de cada año y la guarda sin rendimiento. ¿Cuántos euros más tiene A al final, contando en B el capital y los cobros guardados?',5,'€',
    'A termina con 500 × 1,10 × 1,10 = 605 €. B conserva 500 € invertidos y dos cobros de 50 €: 600 € en total. Reinvertir ha añadido 5 € en este ejemplo.')),
  lab(pair('Compuesto no significa que siempre suba',
   'El mecanismo también incorpora pérdidas. Si un año baja el capital, el siguiente comienza desde una base menor. Cambia la tasa de la calculadora a un valor negativo y verás una curva descendente. La forma ascendente de los ejemplos anteriores dependía de haber supuesto una tasa positiva constante; no era una propiedad garantizada de las acciones. Encontrarás la herramienta cuando la necesites en Laboratorio → Interés compuesto.',
   'La calculadora muestra las consecuencias de una tasa; no asegura que esa tasa se consiga.',
   truth('Distingue el mecanismo de la promesa','Valora estas afirmaciones después de explorar el interés compuesto.',[
    ['Reinvertir una ganancia aumenta la base que participa en los siguientes resultados.',true],
    ['Una curva dibujada al 7 % demuestra que una acción dará un 7 % todos los años.',false],
    ['Con resultados negativos repetidos, el capital también cambia de forma compuesta.',true]
   ],'El mecanismo consiste en encadenar resultados. El signo y la magnitud de esos resultados dependen de la inversión; una simulación no los garantiza.')),
   'compound',{initial:1000,monthly:0,years:15,annualRate:-3},'El mismo mecanismo también incorpora pérdidas','Observa el escenario al −3 %. Después cambia la tasa a un 3 % positivo, manteniendo el resto igual.')
 ],
 [
  lab(pair('No es lo mismo añadir quince años al principio que al final',
   'Con 1.000 € y un 5 % anual constante, los primeros 15 años añaden aproximadamente 1.079 €; los 15 siguientes añaden unos 2.243 €. En ambos tramos pasa el mismo tiempo y usamos la misma tasa. Lo que cambia es la base desde la que empieza cada tramo. Mantén la aportación mensual en cero para ver este efecto sin mezclarlo con ahorro nuevo. El gráfico muestra por qué la diferencia entre plazos puede ser tan grande.',
   'Con crecimiento positivo constante, los años adicionales actúan sobre un capital cada vez mayor.',
   choice('Qué comparación aísla el efecto del tiempo','Quieres comprobar solo cómo influye el plazo en una simulación. ¿Qué dos configuraciones deberías comparar?',[
    '1.000 € al 5 % durante 15 años y 1.000 € al 5 % durante 30 años, ambas sin aportaciones.',
    '1.000 € al 5 % durante 15 años y 2.000 € al 7 % durante 30 años.',
    '1.000 € sin aportaciones durante 15 años y 1.000 € con 100 € mensuales durante 30 años.'
   ],0,'Para atribuir la diferencia al plazo hay que mantener iguales el capital inicial, la tasa y las aportaciones. Si cambian varias cosas, no sabrás qué parte explica cada una.')),
   'compound',{initial:1000,monthly:0,years:30,annualRate:5},'Compara dos horizontes sin cambiar nada más','Alterna 15 y 30 años. Fíjate en los euros añadidos durante cada tramo, no solo en el saldo final.'),
  lab(pair('Una pequeña variación de tasa se amplía con los años',
   'Ahora mantén los 1.000 € y los 30 años, y cambia solo la tasa del 5 % al 3 % o al 7 %. Los saldos hipotéticos son aproximadamente 4.322 €, 2.427 € y 7.612 €, respectivamente. No significa que debas elegir una inversión porque anuncie el porcentaje más alto. Significa que un plan a largo plazo puede depender mucho de una tasa que todavía no conoces. Es mejor ver varios escenarios que confundir uno solo con el futuro.',
   'Probar tasas distintas muestra cuánto depende el resultado de una hipótesis incierta.',
   illustrated(rows('table','Lee los escenarios sin convertirlos en promesas','La tabla parte de 1.000 €, sin aportaciones y con tasas constantes. Completa las conclusiones.',[
    {label:'Entre los escenarios del 3 % y el 7 %, la separación en euros es mayor…',options:['A los 15 años','A los 30 años','Es igual en ambos plazos'],answer:1},
    {label:'El escenario del 7 % demuestra…',options:['Lo que ocurriría con ese supuesto','La tasa que obtendrá cualquier acción','Que el plazo elimina las pérdidas'],answer:0}
   ],'A 30 años la diferencia entre los dos supuestos es mayor. Ninguno de esos resultados está garantizado: son consecuencias calculadas de tasas constantes.'),
   table(['Tasa hipotética','15 años','30 años'],[['3 % anual','≈ 1.558 €','≈ 2.427 €'],['7 % anual','≈ 2.759 €','≈ 7.612 €']]))),
   'compound',{initial:1000,monthly:0,years:30,annualRate:5},'Cambia una sola hipótesis','Prueba un 3 %, un 5 % y un 7 % con el mismo plazo. Observa cuánto cambia el resultado final.'),
  pair('Tener años por delante no elimina las necesidades cercanas',
   'La simulación supone que puedes dejar el dinero invertido todo el plazo. En la vida real puede haber gastos antes: una mudanza, una factura o una caída de ingresos. Si necesitas vender antes del final, el precio de ese momento importa. Un plan a 30 años y una reserva para pagar dentro de seis meses responden a necesidades distintas. Una curva ascendente no demuestra que siempre puedas recuperar el dinero justo cuando lo necesites sin perder.',
   'El horizonte del cálculo debe encajar con la fecha en que podrías necesitar el dinero.',
   all('Qué revisar antes de usar el escenario','Inés estudia un plan a 30 años, pero puede necesitar una parte del dinero el año que viene. ¿Qué cuestiones son relevantes?',[
    'Separar la necesidad próxima del dinero que podría mantener a largo plazo.',
    'Comprobar qué pasaría si tuviera que vender después de una caída.',
    'Dar por hecho que un escenario positivo a 30 años cubre cualquier gasto el año próximo.',
    'Reconocer que la curva constante no muestra todas las oscilaciones posibles.'
   ],[0,1,3],'El cálculo a largo plazo no responde por sí solo a una necesidad cercana. Importan la fecha de uso, las posibles caídas y los límites de la simulación.')),
  pair('Convierte la calculadora en un experimento',
   'Una buena comparación mantiene todo igual salvo la variable que quieres estudiar. Para el tiempo, cambia los años. Para la tasa, conserva el plazo. Para el ahorro nuevo, cambia las aportaciones. Luego describe qué observas y qué supuesto lo provoca. Así puedes aprender del gráfico sin necesidad de memorizar una cifra. Si alteras tres campos a la vez, el resultado cambia, pero pierdes claridad sobre la causa.',
   'Cambia una cosa cada vez para entender de dónde sale la diferencia.',
   match('Elige el experimento apropiado','Relaciona cada duda con el único dato que conviene cambiar primero.',[
    ['«¿Qué cambia si espero 15 años más?»','Años, manteniendo capital, tasa y aportaciones'],
    ['«¿Qué pasa si el crecimiento es menor de lo esperado?»','Tasa, manteniendo capital, plazo y aportaciones'],
    ['«¿Qué efecto tendría ahorrar cada mes?»','Aportación mensual, manteniendo el resto']
   ],'Cada comparación aísla una causa. Después puedes combinar escenarios, pero primero necesitas identificar el efecto de cada variable.'))
 ],
 [
  pair('El ahorro nuevo y el rendimiento hacen trabajos diferentes',
   'Una aportación periódica es dinero que incorporas de forma repetida, por ejemplo al final de cada mes. El saldo combina lo que has puesto y lo que ha producido la inversión. Si empiezas con 1.000 € y añades 100 € al mes durante 15 años, habrás aportado 19.000 €: los 1.000 € iniciales más 180 ingresos de 100 €. Un saldo mayor que ese importe refleja ganancias; el resto es ahorro que tú has añadido.',
   'Antes de llamar ganancia al saldo, separa cuánto dinero has aportado.',
   match('No llames beneficio a todo el saldo','Un plan termina con 12.000 €. La persona ha aportado en total 9.000 €, incluido el dinero inicial, y no ha retirado nada. Relaciona cada cifra.',[
    ['9.000 €','Dinero puesto por la persona'],
    ['3.000 €','Resultado acumulado de la inversión'],
    ['12.000 €','Saldo que reúne aportaciones y resultado']
   ],'El resultado es la diferencia entre el saldo y las aportaciones: 12.000 − 9.000 = 3.000 €. Confundir los 12.000 € con beneficio exageraría la rentabilidad.')),
  pair('Cada aportación empieza su propio reloj',
   'El dinero inicial puede participar en todo el plazo. Una aportación que llega después solo participa desde que entra. Nuestra calculadora supone aportaciones al final de cada mes: primero se aplica el rendimiento del mes al saldo anterior y después se suma el ingreso nuevo. Ese ingreso no gana por el mes que ya terminó. El modelo convierte la tasa anual indicada en una tasa mensual equivalente para que ambos plazos sean coherentes.',
   'La fecha de entrada determina cuánto tiempo participa cada cantidad en el crecimiento.',
   order('Ordena un mes con aportación final','Ya tienes un saldo invertido al comenzar el mes. Ordena cómo termina ese mes y empieza el siguiente en el modelo de la calculadora.',[
    'Añadir la aportación prevista para el final del mes.',
    'Usar el saldo que queda como base del mes siguiente.',
    'Aplicar el rendimiento mensual al dinero que ya estaba invertido.'
   ],[2,0,1],'El dinero nuevo entra después del rendimiento del mes que termina. Desde entonces forma parte del saldo que participa en el mes siguiente.')),
  lab(pair('Dos líneas: lo que pones y lo que acumulas',
   'Prueba 1.000 € iniciales, 100 € al final de cada mes y un 5 % anual constante. A los 15 años, el saldo simulado ronda 28.561 €, con 19.000 € aportados. A los 30 años ronda 85.860 €, con 37.000 € aportados. La distancia entre las líneas es el resultado acumulado, no una nueva aportación. Después cambia la aportación a cero y observa cómo se transforma el plan: el gráfico separa el esfuerzo de ahorro del efecto del crecimiento.',
   'El gráfico permite distinguir el ahorro propio de los resultados acumulados.',
   truth('Qué puedes atribuir al plan','Una simulación muestra 37.000 € aportados y aproximadamente 85.860 € de saldo a 30 años, sin retiros. Valora estas frases.',[
    ['Los 85.860 € son todos beneficios.',false],
    ['Parte del saldo procede de los ingresos periódicos del usuario.',true],
    ['La diferencia entre saldo y aportaciones representa el resultado del modelo.',true]
   ],'Los 37.000 € son dinero aportado. La diferencia aproximada de 48.860 € corresponde al rendimiento simulado, que depende de los supuestos elegidos.')),
   'compound',{initial:1000,monthly:100,years:30,annualRate:5},'Explora un plan con ahorro mensual','Compara 15 y 30 años. Después cambia 100 € mensuales por cero y distingue las dos fuentes del saldo.'),
  lab(pair('Si cambia tu capacidad de ahorro, cambia el escenario',
   'Puedes decidir una aportación que encaje con tu presupuesto, aunque la rentabilidad de la inversión no esté bajo tu control. Compara 50 €, 100 € y 150 € mensuales manteniendo la misma tasa y el mismo plazo. Un plan con aportaciones constantes supone que puedes sostenerlas; si en la práctica hay meses sin aportar, el resultado será distinto. El CAGR de principio y final no mide bien estos planes porque confundiría tus nuevos ingresos con ganancias.',
   'Para estudiar aportaciones usa Interés compuesto; no atribuyas el ahorro nuevo al CAGR.',
   choice('Qué herramienta responde a su pregunta','Pablo quiere ver qué cambiaría si aportase 50 € al mes en lugar de 100 €, manteniendo 20 años y la misma tasa hipotética. ¿Qué debería hacer?',[
    'Usar la calculadora CAGR con el saldo inicial y el final, sin introducir las aportaciones.',
    'Usar Interés compuesto y cambiar solo la aportación mensual, comparando saldo y dinero aportado.',
    'Cambiar simultáneamente la aportación, el plazo y la tasa hasta obtener un saldo parecido.'
   ],1,'Interés compuesto incorpora los ingresos periódicos y separa lo aportado del resultado. Cambiar solo el ingreso mensual permite estudiar su efecto.')),
   'compound',{initial:1000,monthly:100,years:30,annualRate:5},'Pon a prueba otra aportación','Mantén tasa y años. Prueba 50 €, 100 € y 150 € mensuales y observa tanto el saldo como el dinero aportado.')
 ],
 [
  pair('Un coste anual también reduce el capital del futuro',
   'Una comisión cobrada cada año no afecta solo al saldo de ese momento. El dinero que sale deja de estar invertido y ya no puede producir resultados después. Por eso la diferencia entre dos planes con distintos costes puede crecer con los años. Para estudiar ese efecto aquí mantenemos iguales la inversión inicial, las aportaciones y el rendimiento antes de costes. Así no atribuimos al coste una diferencia que en realidad viene de otras condiciones.',
   'Un coste repetido resta dinero hoy y también reduce la base de los resultados futuros.',
   choice('Qué comparación permite estudiar el coste','Dos simulaciones pretenden mostrar el efecto de una comisión anual. ¿Cuál de estas comparaciones lo aísla mejor?',[
    'Mismo capital, plazo, aportaciones y rendimiento bruto; distinta comisión anual.',
    'Mayor comisión y mayor rendimiento bruto en un plan, con plazos distintos.',
    'Un plan a un año sin aportaciones frente a otro a 30 años con ingresos mensuales.'
   ],0,'Hay que mantener iguales las otras variables. Así la diferencia del resultado procede de la comisión aplicada en el modelo.')),
  pair('Bruto, neto y el orden del cálculo',
   'Bruto significa antes de descontar los costes indicados; neto, después. En esta calculadora, cada año se aplica primero el rendimiento bruto y después la comisión al saldo resultante. Si 100 € ganan un 10 %, pasan a 110 €; una comisión del 2 % sobre esos 110 € deja 107,80 €. La rentabilidad neta es un 7,80 %, no un 8 % exacto. Si un dato ya es neto de esa comisión, no debes descontarla otra vez.',
   'Comprueba qué costes incluye una tasa y sobre qué saldo se cobran.',
   repair('Evita contar el coste dos veces','Una simulación ofrece un rendimiento anual del 4 % «después de la comisión». Alguien escribe: «Todavía hay que restar esa misma comisión al 4 %». Corrige la instrucción.',
    'Para esa comisión, hay que «descontarla de nuevo».','descontarla de nuevo',[
     'usar el 4 % sin volver a descontarla','descontarla de nuevo','sumarla al capital como una ganancia'
    ],0,'El 4 % ya incluye esa comisión. Restarla otra vez reduciría dos veces el resultado por el mismo concepto. Otros costes, si los hubiera, necesitarían información propia.')),
  lab(pair('Ve la diferencia a 15 y a 30 años',
   'Explora 10.000 € iniciales, sin aportaciones, un 7 % anual bruto constante y una comisión anual del 1,5 %. A 15 años, la diferencia frente al escenario sin comisión ronda 5.597 €; a 30 años, 27.750 €. Esa diferencia final no es solo la suma de comisiones pagadas: también incluye los resultados que ese dinero ya no pudo generar. El gráfico sirve para hacer visible ese efecto acumulado. Puedes repetir el cálculo en Laboratorio → Comisiones.',
   'La distancia final reúne el coste cobrado y su efecto sobre los resultados posteriores.',
   illustrated(rows('table','Lee la comparación','Las cifras corresponden a los mismos 10.000 € iniciales y al mismo 7 % bruto constante; solo cambia la comisión anual. Elige cómo interpretar los datos.',[
    {label:'Qué ocurre con la diferencia entre ambos saldos al pasar de 15 a 30 años.',options:['Se amplía','Se mantiene igual','Desaparece'],answer:0},
    {label:'Qué incluye esa diferencia final.',options:['Solo las comisiones cobradas','Comisiones y resultados que ese dinero dejó de producir','Solo la inflación'],answer:1}
   ],'La distancia aumenta porque la comisión se repite y deja menos saldo invertido. Por eso el impacto final no se limita a sumar los recibos de cada año.'),
   table(['Plazo','Sin comisión','Con comisión anual del 1,5 %'],[['15 años','≈ 27.590 €','≈ 21.994 €'],['30 años','≈ 76.123 €','≈ 48.373 €']],'Ejemplo hipotético: rendimiento bruto constante del 7 %, sin aportaciones, impuestos ni inflación.'))),
   'fees',{initial:10000,monthly:0,years:30,annualRate:7,annualFee:1.5},'Haz visible el coste acumulado','Alterna 15 y 30 años. Después cambia solo la comisión para comprobar cómo se separan las curvas.'),
  pair('Una comparación justa no termina en el precio',
   'Una comisión más baja mejora el resultado si todo lo demás es igual. En productos distintos también pueden cambiar los activos, el riesgo, los servicios y las condiciones de salida. Primero compara costes completos sobre una base coherente; después revisa si las inversiones responden a la misma necesidad. Una tasa neta pasada resume lo que ocurrió, no prueba qué plan funcionará mejor a partir de ahora.',
   'Aislar los costes ayuda a entenderlos; elegir una inversión requiere mirar también lo que ofrece y arriesga.',
   all('Qué revisar en dos ofertas','Dos productos anuncian comisiones diferentes. Elige las comprobaciones que permiten compararlos con más sentido.',[
    'Si las tasas publicadas son brutas o ya descuentan los costes.',
    'Si invierten en activos y riesgos comparables.',
    'Si el precio menor garantiza por sí solo el mejor resultado futuro.',
    'Si existen otros gastos o condiciones de salida además de la comisión anual.'
   ],[0,1,3],'Hace falta saber qué incluye cada cifra y qué se está comparando. Un coste menor es una ventaja a igualdad de condiciones, pero no garantiza por sí solo el resultado futuro.'))
 ],
 [
  pair('Primero ordena los datos de la comparación',
   'Vamos a reunir lo aprendido en un caso. Tienes dos inversiones que partieron de 1.000 €, reinvirtieron sus cobros y no recibieron aportaciones ni retiros. A terminó en 1.210 € tras dos años; B, en 1.400 € tras cinco. B ganó más euros en total, pero dispuso de más tiempo. Antes de decidir qué resultado anual fue mayor, separa tres medidas: ganancia en euros, rentabilidad acumulada y tasa anualizada. Las cifras del caso ya descuentan todos sus costes.',
   'Empieza comparando medidas con el mismo significado y el mismo alcance.',
   rows('table','Prepara la comparación','A pasó de 1.000 € a 1.210 € en dos años. B pasó de 1.000 € a 1.400 € en cinco años. Ambas cifras son netas de costes y no hubo aportaciones ni retiros.',[
    {label:'Cuál tiene mayor ganancia total en euros.',options:['A','B','Igual'],answer:1},
    {label:'Cuál tuvo más tiempo para obtenerla.',options:['A','B','Igual'],answer:1},
    {label:'Qué medida falta para comparar el crecimiento equivalente por año.',options:['CAGR','Saldo final sin plazo','Otra vez la ganancia en euros'],answer:0}
   ],'B ganó 400 € frente a 210 €, pero tardó cinco años en vez de dos. Para comparar el crecimiento equivalente anual hay que anualizar ambos resultados.')),
  lab(pair('Ahora compara en años',
   'La tasa anualizada de A es el 10 %: 1.000 × 1,10 × 1,10 = 1.210. La de B ronda el 6,96 % anual. Usa la calculadora para comprobar ambos: primero introduce los datos de A y después los de B, incluido su plazo. Aunque B ganó más euros, A tuvo mayor crecimiento anual equivalente. Eso todavía no convierte a A en la mejor opción para cualquier persona: solo aclara esta parte de la comparación histórica.',
   'El mayor resultado acumulado no tiene por qué ser la mayor tasa anualizada.',
   choice('Aplica el criterio a dos plazos nuevos','C pasa de 500 € a 605 € en dos años. D pasa de 500 € a 605 € en cuatro años. Sin movimientos intermedios y con costes ya descontados, ¿cuál tiene mayor CAGR?',[
    'C, porque llega al mismo saldo final en menos tiempo.',
    'D, porque dispone de más años para repartir la ganancia.',
    'Las dos tienen el mismo CAGR porque ganan los mismos euros.'
   ],0,'Con los mismos importes inicial y final, el plazo más corto necesita un crecimiento anual equivalente mayor. La acumulada es igual; el CAGR no.')),
   'cagr',{initial:1000,final:1400,years:5},'Comprueba A y B con la calculadora','B usa 1.000 €, 1.400 € y 5 años. Para A cambia el final a 1.210 € y el plazo a 2 años.'),
  pair('Una buena comparación pregunta también por lo que no ve',
   'El caso anterior no cuenta las caídas que ocurrieron entre el inicio y el final. Tampoco sabemos si ambas inversiones asumieron riesgos parecidos ni si podrías haber mantenido el dinero durante el periodo. Una mayor rentabilidad pasada no responde a esas preguntas. Además, si quieres saber cuánto aumentó la capacidad de compra, debes ajustar por la inflación del mismo periodo. Costes, inflación y riesgo contestan dudas diferentes; no los sustituyas por un único porcentaje.',
   'La rentabilidad es una pieza de la decisión; el recorrido y las condiciones también importan.',
   truth('Qué demuestra el resultado de A','Sabemos que A tuvo mayor CAGR que B en los periodos descritos. Valora qué se deduce de ese dato.',[
    ['A produjo mayor crecimiento anual equivalente en esos periodos.',true],
    ['A necesariamente sufrió caídas menores que B.',false],
    ['Ya sabemos que A repetirá su CAGR durante los próximos 30 años.',false]
   ],'La tasa permite comparar el crecimiento equivalente observado. No revela por sí sola la intensidad de las caídas ni garantiza el rendimiento futuro.')),
  lab(pair('Del resultado pasado a un escenario que puedas entender',
   'Para explorar un plan futuro, usa una tasa como hipótesis, no como certeza. Empieza aquí con 1.000 €, 100 € mensuales y un 5 % anual constante. Compara 15 y 30 años; después prueba una tasa menor y observa si tu conclusión cambia. El dinero aportado y el resultado deben seguir separados. Ya sabes dónde repetirlo: Laboratorio reúne Interés compuesto, CAGR, Comisiones e Inflación. Son herramientas para hacer preguntas mejores, no para adivinar el mercado.',
   'Un escenario útil hace visibles sus supuestos y te deja comprobar qué pasa cuando cambian.',
   all('Qué debe acompañar a tu conclusión','Has simulado un plan con aportaciones mensuales a 30 años. Elige la información que debe acompañar al saldo final para que otra persona lo entienda.',[
    'Capital inicial, aportaciones, plazo y tasa anual supuesta.',
    'Cuánto dinero has aportado y qué parte es resultado del modelo.',
    'Una afirmación de que el gráfico garantiza ese saldo.',
    'Si se han tenido en cuenta costes e inflación y cómo cambia el resultado con otros supuestos.'
   ],[0,1,3],'Sin esos datos, una cifra final parece más precisa de lo que es. Explicar sus supuestos y límites permite interpretar el escenario sin confundirlo con una promesa.')),
   'compound',{initial:1000,monthly:100,years:30,annualRate:5},'Construye una comparación completa','Compara 15 y 30 años. Después baja la tasa al 3 % manteniendo todo lo demás y describe qué ha cambiado.')
 ]
]}

function exam(){return [
 choice('Comparar ganancias con bases distintas','Durante el mismo año, Eva gana 60 € sobre 600 € y Dani gana 90 € sobre 1.500 €. Todo está neto de costes. ¿Quién obtuvo más ganancia por cada euro invertido?',[
  'Eva, aunque Dani ganó más euros.','Dani, porque 90 € son más que 60 €.','Obtuvieron el mismo porcentaje.'
 ],0,'Eva obtiene un 10 % y Dani un 6 %. La ganancia en euros y la rentabilidad porcentual no ordenan necesariamente las inversiones igual.'),
 choice('Interpretar una tasa anualizada','Una inversión pasa de 400 € a 484 € en dos años, sin aportaciones ni retiros. Su CAGR es del 10 %. ¿Qué significa?',[
  'Ganó exactamente el mismo número de euros en cada año.',
  'Un 10 % anual reinvertido produciría el mismo resultado final.',
  'Su ganancia acumulada de los dos años es del 10 %.'
 ],1,'400 × 1,10 × 1,10 = 484. La tasa es una equivalencia anual; no reconstruye los resultados reales de cada año. La acumulada es del 21 %.'),
 multi('Leer una media sin perder de vista el capital','Una inversión sube un 25 % y al año siguiente baja un 25 %, sin aportaciones. Selecciona las dos conclusiones correctas.',[
  'Su media simple es 0 %.',
  'Su capital final es igual al inicial.',
  'Su CAGR es negativo.'
 ],[0,2],'Los factores son 1,25 y 0,75; su producto es 0,9375. Queda menos capital aunque la media simple de los porcentajes sea cero.'),
 choice('Interpretar un escenario de inflación','Una calculadora muestra que 2.000 € guardados sin rendimiento dentro de 30 años equivaldrían a unos 824 € de poder de compra de hoy, con inflación constante del 3 %. ¿Qué está diciendo?',[
  'La cuenta perderá euros hasta mostrar un saldo de 824 €.',
  'Ese dinero compraría aproximadamente lo que hoy se compra con 824 €, si se cumple el supuesto.',
  'Los 824 € son una comisión que debe pagarse por la inflación.'
 ],1,'El saldo nominal permanece en 2.000 €. La cifra equivalente describe su capacidad de compra bajo el supuesto de inflación, no un cargo en la cuenta.'),
 numeric('Comparar dinero y precios','Una inversión y una cesta de referencia empezaron en 100 €. Al final, la inversión vale 110 € y la cesta cuesta 104 €. Calcula la rentabilidad real: (110 ÷ 104 − 1) × 100. Redondea a dos decimales.',5.77,'%',
  'La relación es 110 ÷ 104 ≈ 1,057692. La mejora real es aproximadamente del 5,77 %, menor que el crecimiento nominal del 10 %.'),
 match('Reconocer qué ocurre con las ganancias','Relaciona cada comportamiento con su efecto en la base de esa inversión.',[
  ['Reinvertir una ganancia','La ganancia participa en los resultados siguientes'],
  ['Retirar una ganancia y guardarla aparte sin rendimiento','Ese dinero deja de producir resultados dentro del plan'],
  ['Sufrir una pérdida','El periodo siguiente empieza con una base menor']
 ],'El interés compuesto encadena el saldo de cada periodo. Las cantidades retiradas quedan fuera y las pérdidas reducen la base futura.'),
 multi('Diseñar una comparación de escenarios','Quieres estudiar un plan a largo plazo sin confundir un supuesto con una garantía. Selecciona todas las prácticas adecuadas.',[
  'Comparar 15 y 30 años manteniendo las demás variables iguales.',
  'Probar una tasa menor para ver cuánto depende el saldo del crecimiento supuesto.',
  'Dar por seguro el resultado de la curva más alta.',
  'Comprobar si podrías necesitar parte del dinero antes del final del plazo.'
 ],[0,1,3],'Un escenario sirve para explorar efectos. Cambiar una variable, probar un supuesto menos favorable y revisar el plazo de uso hacen la comparación más útil.'),
 order('Una aportación al final del mes','Ordena los pasos del modelo con aportación mensual al final del periodo.',[
  'Sumar el ingreso nuevo al final del mes.',
  'Aplicar el rendimiento mensual al saldo que ya estaba invertido.',
  'Empezar el mes siguiente con el saldo resultante.'
 ],[1,0,2],'El ingreso que llega al final no obtiene el rendimiento del mes ya terminado. Participa desde el mes siguiente.'),
 choice('Entender el impacto total de los costes','Dos simulaciones solo difieren en una comisión anual. A 30 años, la de mayor coste termina con 8.000 € menos. ¿Cómo debes interpretar esa distancia?',[
  'Son necesariamente 8.000 € de comisiones cobradas directamente.',
  'Incluye comisiones y el efecto de haber tenido menos dinero produciendo resultados.',
  'Es una pérdida debida a la inflación, aunque ambas usen la misma.'
 ],1,'El dinero descontado por costes también deja de participar en los resultados posteriores. La diferencia final puede superar la suma de las comisiones cobradas.'),
 multi('Cerrar una comparación de inversiones','Dos inversiones publican un CAGR pasado diferente. Selecciona todas las comprobaciones relevantes antes de usarlo para una decisión.',[
  'Los plazos, los movimientos de dinero y qué costes incluyen las cifras.',
  'Las caídas, los riesgos y cuándo podrías necesitar el dinero.',
  'Si el resultado en euros también representa una mejora de poder de compra.',
  'Solo cuál es el CAGR mayor, porque determina cuál ganará en el futuro.'
 ],[0,1,2],'Una comparación requiere datos coherentes y contexto. La tasa pasada no garantiza el futuro ni sustituye el análisis de costes, inflación, riesgos y necesidades.')
]}

export function refineCompoundWorld(result){
 const authored=lessons();
 if(authored.length!==10)throw Error('Compound world must contain ten lessons');
 for(let index=0;index<authored.length;index++){
  const lesson=result.lessons.find(item=>item.id===480+index);
  if(!lesson)throw Error('Missing compound lesson '+(480+index));
  usePairs(lesson,authored[index]);
  lesson.editorialRevision=COMPOUND_WORLD_REVISION;
  lesson.minutes=[7,10,9,9,9,10,10,10,10,10][index];
  lesson.story.hideDuringPractice=true;
 }
 const checkpoint=result.exams.find(item=>item.id===48);
 if(!checkpoint)throw Error('Missing compound exam 48');
 checkpoint.editorialRevision=COMPOUND_WORLD_REVISION;
 checkpoint.steps=exam().map((step,index)=>{
  delete step.hint;
  if(step.activity)delete step.activity.hint;
  return {...step,reviewLesson:480+index};
 });
 return result;
}
