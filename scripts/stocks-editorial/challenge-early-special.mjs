import {choice, activity, rows} from './helpers.mjs';

// These challenges apply only to already explained ideas. They replace one
// qualitative exercise, never its teaching screen or a numerical procedure.
const reverseData = {
  490: [
    'La matrícula vence en septiembre. Luis puede cubrir una parte con dinero de su cuenta, pero el resto depende de vender la inversión antes de esa fecha.',
    '¿Qué parte de su obligación depende de convertir la inversión en dinero a tiempo?',
    '¿Qué pérdida podría experimentar la inversión antes de septiembre?',
    '¿Qué rentabilidad necesitaría para financiar también el curso del año siguiente?',
    'El texto conecta una obligación con los recursos disponibles para pagarla. No aporta una estimación de la caída ni un presupuesto para el año siguiente.'
  ],
  500: [
    'El contrato identifica a la entidad que ejecuta las órdenes, a la que mantiene el registro de las acciones y las tarifas de ambos servicios. La lista de productos aparece en otro apartado.',
    '¿Qué servicios contratarías, quién los presta y qué costes corresponden a ellos?',
    '¿Qué acciones del listado encajan mejor con el riesgo que puedes asumir?',
    '¿Qué derechos de voto tiene cada clase de acción del listado?',
    'Se han documentado ejecución, custodia y tarifas. Elegir inversiones o comparar sus derechos necesita información sobre los productos y el inversor.'
  ],
  510: [
    'El resumen reúne los valores actuales de todas las posiciones en euros. Al revisar sus negocios, se descubre que las de mayor peso venden al mismo cliente.',
    '¿Dónde se concentra la cartera y qué dependencia puede afectar a varias posiciones?',
    '¿Qué posición ha proporcionado más rentabilidad desde su fecha de compra?',
    '¿Qué posición sería más barata en relación con sus cobros futuros?',
    'Los valores actuales y la dependencia compartida permiten revisar la concentración. No conocemos los costes de compra ni una valoración de cobros futuros.'
  ],
  520: [
    'La empresa cobra por entregar equipos a clínicas. Los contratos identifican al comprador, la entrega y el pago; la fabricación necesita materiales y personal.',
    '¿Qué actividad genera los ingresos y qué recursos requiere realizarla?',
    '¿Cómo ha cambiado la rentabilidad obtenida sobre esos recursos?',
    '¿Qué parte de las ventas del mercado pertenece a esta empresa?',
    'La cadena de entrega, contrato y pago explica el negocio. No incluye una medida de rentabilidad ni el tamaño del mercado.'
  ],
  530: [
    'Los trabajadores usan el programa, el hospital firma el contrato y su departamento de compras paga al proveedor. El servicio se presta durante el periodo contratado.',
    '¿Qué papeles tienen usuario, cliente que contrata y entidad que paga?',
    '¿Qué coste tendría sustituir el programa por otra solución?',
    '¿Cómo se compara su precio con el de otros proveedores?',
    'El recorrido identifica funciones distintas en la compra. No describe migración a otro programa ni precios de competidores.'
  ],
  550: [
    'El alquiler se mantiene mientras la tienda use el mismo local. Las bolsas aumentan con las ventas. Si necesita otro local, el compromiso de alquiler también cambiaría.',
    '¿Qué gastos responden a las unidades y cuáles cambian al modificar la capacidad?',
    '¿Cuánto margen neto obtiene la tienda después de intereses e impuestos?',
    '¿Qué ingresos cubrirían todos los costes durante un año de menor demanda?',
    'La respuesta distingue variación con unidades y salto de capacidad. No ofrece ingresos ni importes para medir margen o cobertura anual.'
  ],
  560: [
    'Para resolver la misma reunión, varios clientes consideran una videollamada, desplazarse o usar un sistema de mensajes. La elección cambia según el trabajo que deban realizar juntos.',
    '¿Qué alternativas compiten por resolver la necesidad concreta del cliente?',
    '¿Cuál de esas empresas tiene una mayor cuota en su sector bursátil?',
    '¿Qué alternativa conserva mayor beneficio por cada euro vendido?',
    'La necesidad del cliente permite identificar competidores reales aunque pertenezcan a categorías distintas. El texto no compara cuotas ni márgenes empresariales.'
  ],
  570: [
    'El beneficio recoge lo ocurrido de enero a marzo. El saldo de caja describe el dinero existente el último día de marzo. Que aparezcan en el mismo informe no les da el mismo alcance temporal.',
    '¿Qué diferencia temporal hay entre el resultado del trimestre y el saldo de caja?',
    '¿Qué movimientos concretos explican la diferencia entre beneficio y caja?',
    '¿Cómo se compara el beneficio del trimestre con el del año anterior?',
    'Las fechas separan una actividad acumulada de una situación en una fecha. Explicar movimientos o crecimiento necesita otras cifras.'
  ],
  590: [
    'El negocio aportó efectivo, pero la empresa dedicó más dinero a comprar equipos. Después recibió un préstamo. El informe reúne estos movimientos con la caja que tenía al comenzar.',
    '¿Cómo contribuyeron operación, inversión y financiación al cambio de caja?',
    '¿Qué rentabilidad futura producirán los equipos adquiridos?',
    '¿Qué parte del beneficio publicado procede de una venta extraordinaria?',
    'El recorrido explica fuentes y usos de efectivo. No demuestra el rendimiento futuro de los equipos ni descompone el beneficio contable.'
  ],
  600: [
    'La mercancía ya se entregó y se facturó. El contrato permite pagar dentro de varios meses, y esa fecha todavía no ha llegado. La cuenta bancaria aún no refleja el cobro.',
    '¿Por qué una venta reconocida puede seguir pendiente de cobro sin haber vencido?',
    '¿Con qué frecuencia incumple ese cliente sus compromisos de pago?',
    '¿Qué parte de la factura se convierte en beneficio para el vendedor?',
    'Entrega, vencimiento y cobro son fechas distintas. El texto explica crédito comercial pactado, pero no un historial de incumplimientos ni el margen de la venta.'
  ],
  610: [
    'Los beneficios corresponden al mismo periodo y a actividades comparables. Se ha medido también el capital utilizado con el mismo criterio; una empresa requiere muchos más recursos para obtener ese resultado.',
    '¿Qué hace falta comparar para distinguir ganar lo mismo de utilizar mejor el capital?',
    '¿Qué empresa podría devolver antes todas sus deudas?',
    '¿Qué empresa ofrece mayor rentabilidad al precio actual de sus acciones?',
    'Beneficio comparable y recursos empleados permiten estudiar eficiencia. Para capacidad de pago o atractivo bursátil faltan obligaciones, cobros y precios.'
  ],
  620: [
    'La caja disponible se contrasta con pagos necesarios y con propuestas de inversión, devolución de deuda y reparto. Para cada propuesta se anotan el desembolso y los resultados esperados.',
    '¿Qué información permite comparar usos del dinero dentro del mismo presupuesto?',
    '¿Qué uso ha creado más valor para el accionista después de ejecutarse?',
    '¿Qué parte del saldo actual procede de beneficios y qué parte de deuda nueva?',
    'El presupuesto conecta necesidades con alternativas aún por decidir. No registra resultados posteriores ni reconstruye el origen histórico de toda la caja.'
  ],
  630: [
    'La cotización cae tras perderse un contrato. Para revisar el valor, el analista calcula qué cobros dependían de él y qué costes podrían ajustarse; no usa la caída bursátil como estimación de esos cambios.',
    '¿Qué evidencia permite revisar las expectativas económicas detrás de un cambio de precio?',
    '¿Qué caída porcentual separa la acción de su máximo de la sesión?',
    '¿Qué precio aceptaron compradores y vendedores en la última operación?',
    'Se estudia el efecto del contrato sobre cobros y costes. Las otras preguntas describen cotización y operaciones, datos que no aparecen en la respuesta.'
  ],
  654: [
    'La remuneración incluye acciones nuevas sujetas a condiciones. La revisión identifica los títulos que podrían entregarse y cómo se repartiría la propiedad entre los títulos existentes y los adicionales.',
    '¿Cómo puede la remuneración en acciones modificar el reparto de derechos?',
    '¿Cuánto efectivo ha salido de la cuenta en la fecha de entrega?',
    '¿Qué rentabilidad obtendrá quien venda esas acciones más adelante?',
    'El análisis trata títulos y reparto de propiedad. No ofrece un movimiento bancario ni una cotización futura.'
  ],
  671: [
    'Dos empresas tienen un múltiplo sobre ventas parecido. Antes de considerarlas equivalentes, la revisión estudia cuánto resultado y caja conservan, y los costes y recursos necesarios para mantener esa conversión.',
    '¿Por qué la misma relación entre precio y ventas puede describir economías distintas?',
    '¿Qué empresa ha experimentado la mayor subida de cotización este año?',
    '¿Qué diferencia en sus impuestos explica todo el margen de ambas empresas?',
    'La conversión sostenible de ventas en resultado cambia el significado del múltiplo. No se ofrecen movimientos bursátiles ni una atribución específica a impuestos.'
  ],
  680: [
    'Una cadena cobra las ventas de sus tiendas y soporta locales y personal. Otra cobra a franquiciados por utilizar su marca y necesita una estructura diferente para hacerlo.',
    '¿Qué diferencias en ingresos, costes y recursos deben revisarse antes de elegir comparables?',
    '¿Qué marca consigue una mayor fidelidad de sus clientes finales?',
    '¿Qué empresa tiene menor deuda en relación con su valor bursátil?',
    'El reparto de actividad explica modelos diferentes pese a vender productos parecidos. No se aporta una medida de fidelidad ni datos de deuda y cotización.'
  ],
  690: [
    'La ampliación tardará varios años en ponerse en marcha. Los costes y márgenes cambiarán durante ese proceso; el presupuesto detallado abarca la transición antes de tratar la actividad como estable.',
    '¿Cómo debe conectarse el horizonte detallado con el calendario de cambios operativos?',
    '¿Qué tasa de descuento corresponde al riesgo de los cobros previstos?',
    '¿Qué margen alcanzará la empresa una vez terminada la ampliación?',
    'Los plazos de la transición justifican el horizonte. El texto no determina una tasa ni cuantifica el margen final.'
  ],
  521: [
    'Se localizó el informe oficial, se comprobó su fecha y se conservaron la página, el encabezado de unidades y las notas que definen el dato compartido en redes.',
    '¿Qué permite comprobar el origen y el significado de la cifra difundida?',
    '¿Qué causa económica explica la variación de esa cifra respecto al año anterior?',
    '¿Qué dato resulta más importante para valorar el negocio completo?',
    'Origen, fecha y definición permiten contrastar la cifra. Explicar su variación o decidir su importancia requiere revisar más información.'
  ],
  531: [
    'Los clientes pagan porque la solución termina una tarea en menos tiempo. La alternativa gratuita cubre parte de la tarea, pero exige un paso manual que esos clientes quieren evitar.',
    '¿Qué problema adicional resuelve la opción de pago frente a la alternativa disponible?',
    '¿Qué margen conserva el proveedor al atender a esos clientes?',
    '¿Qué frecuencia de uso tienen los clientes después del primer año?',
    'El paso manual muestra la diferencia de utilidad que motiva el pago. No conocemos costes del proveedor ni comportamiento posterior.'
  ],
  561: [
    'Reparar cuesta menos, pero requiere esperar. Comprar permite utilizar el aparato antes. Aplazar mantiene el dinero disponible, aunque la necesidad siga sin resolverse.',
    '¿Qué compromisos entre coste, tiempo y utilidad debe comparar el cliente?',
    '¿Qué opción produce mayor beneficio para la empresa que vende aparatos?',
    '¿Qué opción prefieren con mayor frecuencia los clientes de ese mercado?',
    'Se explican las consecuencias para el cliente de cada opción. No se describe el margen del vendedor ni se aporta una encuesta de preferencias.'
  ]
};

// Each row repairs one causal or scope error in the same situation. All
// alternatives fit the sentence; grammar does not identify the answer.
const repairData = {
  495: [
    'Una inversión podría recuperarse dentro de años. Su propietario necesita parte del dinero para una factura del mes próximo. Corrige las tres conclusiones del borrador.',
    [
      ['Para revisar la necesidad de vender importa «la fecha esperada de recuperación».', 'la fecha esperada de recuperación', 'la fecha en que debe hacerse el pago', 'el plazo habitual de una inversión en acciones', 'el horizonte que maneja la empresa'],
      ['Creer en la recuperación «resuelve el problema de liquidez de la factura».', 'resuelve el problema de liquidez de la factura', 'no aporta el efectivo necesario para esa factura', 'permite medir cuánto dinero quedará al vender', 'convierte la obligación próxima en un riesgo empresarial'],
      ['La mejora del negocio y el pago «comparten el mismo horizonte».', 'comparten el mismo horizonte', 'pueden pertenecer a horizontes diferentes', 'deben evaluarse con el horizonte más largo', 'pueden compararse usando la fecha de compra']
    ],
    'La obligación personal tiene su propia fecha. Una recuperación empresarial posible puede llegar después y no aporta hoy el efectivo necesario.'
  ],
  505: [
    'Una orden se ejecuta en parte y el resto sigue abierto hasta el cierre. Corrige qué se puede afirmar de la solicitud y de sus dos partes.',
    [
      ['La cantidad que figura en la solicitud «describe las acciones ya compradas».', 'describe las acciones ya compradas', 'incluye acciones ejecutadas y otras todavía pendientes', 'describe la cantidad que continuará abierta al cierre', 'incluye únicamente la cantidad disponible al primer precio'],
      ['El resto pendiente «se considera ejecutado al precio de la primera parte».', 'se considera ejecutado al precio de la primera parte', 'requiere comprobar si encuentra ofertas dentro de su vigencia', 'se considera cancelado cuando se confirma la primera parte', 'requiere conservar la cotización inicial como precio de referencia'],
      ['Cuando termine la vigencia, la parte pendiente «puede seguir abierta con las mismas condiciones».', 'puede seguir abierta con las mismas condiciones', 'deja de estar abierta por esa orden', 'se incorpora a la parte que ya se compró', 'se vuelve a solicitar con el último precio publicado']
    ],
    'Solicitud y ejecución son estados distintos. La parte restante necesita condiciones de mercado compatibles mientras la orden siga vigente; la vigencia no confirma una compra posterior.'
  ],
  515: [
    'Dos fabricantes dependen del mismo proveedor exclusivo para un componente esencial. Corrige el análisis de su riesgo conjunto.',
    [
      ['La conexión entre ambas posiciones «se determina por el nombre de cada fabricante».', 'se determina por el nombre de cada fabricante', 'se encuentra en el recurso esencial que comparten', 'se determina por su cotización individual', 'se encuentra en el reparto inicial de dinero entre ambas'],
      ['Una interrupción del proveedor «afecta únicamente a la empresa que lo contrata primero».', 'afecta únicamente a la empresa que lo contrata primero', 'puede afectar a las dos aunque sean empresas distintas', 'afecta según la bolsa en la que cotice cada fabricante', 'puede compensarse por tener dos nombres en la cartera'],
      ['Para valorar esa dependencia conviene revisar «el número de proveedores de productos no esenciales».', 'el número de proveedores de productos no esenciales', 'la disponibilidad de sustitutos para ese componente', 'la diferencia de precios entre las dos acciones', 'la rentabilidad histórica de cada fabricante']
    ],
    'La fuente común de riesgo es el componente sin sustituto. Dos nombres no la separan; investigar alternativas permite valorar la dependencia concreta.'
  ],
  525: [
    'Un resumen compara ventas de un trimestre expresadas en miles de euros con beneficio anual expresado en euros. Corrige las conclusiones sobre la comparación.',
    [
      ['Convertir miles a euros «iguala también el periodo de ambas cifras».', 'iguala también el periodo de ambas cifras', 'corrige la escala pero deja pendiente el periodo', 'corrige el periodo pero deja pendiente la escala', 'iguala también la definición de ambas partidas'],
      ['Usar la misma moneda «hace equivalentes ventas y beneficio».', 'hace equivalentes ventas y beneficio', 'deja distinta la magnitud que describe cada dato', 'permite comparar ambas partidas como ingresos', 'convierte las dos partidas en cobros del periodo'],
      ['El encabezado de la tabla «solo aclara el formato de impresión».', 'solo aclara el formato de impresión', 'forma parte del significado y la escala de la cifra', 'define la calidad económica del negocio', 'sustituye las fechas que figuran en el informe']
    ],
    'Moneda, unidad, periodo y definición cumplen funciones distintas. Arreglar una de ellas no homogeneiza automáticamente las demás.'
  ],
  535: [
    'Una marca fija el precio que cobra a su distribuidor. Ese distribuidor decide en qué tiendas ofrece el producto. Corrige la lectura de esas facultades.',
    [
      ['Fijar el precio al distribuidor «da a la marca acceso directo a las tiendas».', 'da a la marca acceso directo a las tiendas', 'no describe quién decide el acceso a las tiendas', 'determina dónde comprará el cliente final', 'permite sustituir el canal sin cambiar ingresos'],
      ['La dependencia comercial se estudia «comprobando solo el coste de fabricación».', 'comprobando solo el coste de fabricación', 'revisando quién permite llegar al comprador', 'comprobando solo la etiqueta del precio', 'revisando quién diseña el producto'],
      ['Si cambia el acceso a tiendas, los ingresos «dependen únicamente de mantener el producto igual».', 'dependen únicamente de mantener el producto igual', 'pueden cambiar aunque el producto siga igual', 'pueden evaluarse usando solo el precio fijado', 'dependen de la fecha en que se diseñó la marca']
    ],
    'Precio y acceso al comprador son facultades distintas. El producto puede mantenerse mientras una decisión del canal altera sus posibilidades de venta.'
  ],
  545: [
    'Las ventas crecen más despacio que el mercado. Además, una tabla mezcla ventas de la empresa en una región con ventas del mercado mundial. Corrige el análisis de cuota.',
    [
      ['Crecer en ventas «demuestra ganar cuota».', 'demuestra ganar cuota', 'puede coexistir con una pérdida de cuota', 'permite mantener la cuota del año anterior', 'equivale al crecimiento del mercado'],
      ['Para medir cuota regional, el denominador debe incluir «el mercado mundial».', 'el mercado mundial', 'el mercado definido para esa misma región', 'las ventas totales de la empresa en todas las regiones', 'las ventas regionales del año anterior'],
      ['Corregir el ámbito geográfico «explica por qué cambió la cuota».', 'explica por qué cambió la cuota', 'hace pertinente la medida sin explicar todavía su causa', 'iguala el crecimiento de empresa y mercado', 'convierte el crecimiento de ventas en crecimiento de cuota']
    ],
    'La cuota requiere empresa y mercado comparables. Crecer menos que ese mercado puede reducirla; definir bien el denominador permite medir el cambio, pero no explica por sí solo su causa.'
  ],
  555: [
    'La operación mejora, los intereses aumentan y el margen neto disminuye. Corrige la interpretación de qué parte del resultado cambió.',
    [
      ['El margen neto menor «demuestra un empeoramiento de la fabricación y venta».', 'demuestra un empeoramiento de la fabricación y venta', 'puede reflejar financiación además de operación', 'describe únicamente el cambio del precio de venta', 'puede atribuirse a la caja inicial'],
      ['Para aislar la operación conviene «tratar los intereses como coste de producción».', 'tratar los intereses como coste de producción', 'separar resultado operativo y costes financieros', 'comparar el resultado neto sin revisar partidas', 'separar ventas y costes sin revisar su periodo'],
      ['Comparar solo el margen final «aísla la eficiencia operativa de los dos negocios».', 'aísla la eficiencia operativa de los dos negocios', 'puede mezclar diferencias operativas y de financiación', 'elimina el efecto de la deuda sobre el resultado', 'permite medir la capacidad de pago de cada deuda']
    ],
    'El resultado final reúne varios escalones. Una diferencia neta puede proceder de intereses aunque la actividad opere mejor; separarlos evita atribuirla a producción o ventas.'
  ],
  565: [
    'Una planta tiene gran capacidad instalada, pero utiliza una parte pequeña. Su estructura se reparte entre las unidades que realmente fabrica. Corrige la revisión de costes.',
    [
      ['La capacidad instalada «mide la producción realmente vendida».', 'mide la producción realmente vendida', 'describe lo que podría producir con esos recursos', 'describe las unidades que ya cubren los costes fijos', 'mide la demanda disponible para la planta'],
      ['Para repartir la estructura por unidad interesa «la capacidad máxima sin revisar su uso».', 'la capacidad máxima sin revisar su uso', 'la producción realizada en el periodo', 'el número de clientes de la empresa', 'el tamaño anunciado de la instalación'],
      ['Ser una empresa grande «prueba que sus costes unitarios son inferiores».', 'prueba que sus costes unitarios son inferiores', 'necesita contrastarse con utilización y costes reales', 'permite usar la capacidad instalada como producción', 'hace innecesaria la comparación con otras plantas']
    ],
    'Tamaño, capacidad y utilización no son la misma medida. Si se producen pocas unidades, una estructura grande puede generar un coste elevado por unidad.'
  ],
  575: [
    'Las ventas y el resultado operativo se mantienen, pero aumentan los intereses y cae el resultado después de ellos. Corrige la explicación de la caída.',
    [
      ['El cambio aparece en «el escalón de ventas y producción».', 'el escalón de ventas y producción', 'el escalón de financiación', 'el escalón de cobros de clientes', 'el escalón de inversión en equipos'],
      ['Para atribuirlo a la actividad habría que «deducirlo del resultado final sin más revisión».', 'deducirlo del resultado final sin más revisión', 'encontrar cambios en sus partidas operativas', 'usar el coste de la deuda como medida de ventas', 'buscar el precio actual de la acción'],
      ['La capacidad de generar resultado operativo «equivale al dinero final disponible para el accionista».', 'equivale al dinero final disponible para el accionista', 'debe distinguirse de lo que queda tras financiación e impuestos', 'puede sustituirse por los intereses pagados', 'se determina por el número de bancos prestamistas']
    ],
    'Localizar primero el escalón que cambió evita confundir operación y financiación. Los pagos e impuestos posteriores pueden reducir lo que queda sin que bajen las ventas.'
  ],
  585: [
    'Un grupo reconoce fondo de comercio por la prima pagada al adquirir un negocio. Después ese negocio pierde clientes. Corrige la lectura de la partida.',
    [
      ['El importe del fondo de comercio «representa efectivo disponible para pagar deuda».', 'representa efectivo disponible para pagar deuda', 'se relaciona con expectativas pagadas en la adquisición', 'representa ventas ya cobradas del negocio adquirido', 'se relaciona con la cotización diaria del grupo'],
      ['La pérdida de clientes «se resuelve conservando el valor contable anterior».', 'se resuelve conservando el valor contable anterior', 'puede cuestionar las expectativas que sostenían esa prima', 'se mide por la prima pagada en su día', 'puede atribuirse al importe de caja del comprador'],
      ['Para revisar recuperación interesa «la cuantía pagada sin revisar lo ocurrido después».', 'la cuantía pagada sin revisar lo ocurrido después', 'si el negocio adquirido sostiene las expectativas', 'el precio actual de cualquier negocio del sector', 'si el grupo mantiene el mismo número de acciones']
    ],
    'La prima pagada no es una reserva de dinero. Su respaldo económico depende de lo que consiga el negocio adquirido después de la compra.'
  ],
  595: [
    'La venta de una fábrica aporta efectivo mientras disminuye la caja generada por clientes. Corrige qué puede inferirse de la mejora del saldo.',
    [
      ['La entrada por la fábrica «mide una mejora de los cobros recurrentes».', 'mide una mejora de los cobros recurrentes', 'procede de desprenderse de un activo', 'procede de vender más productos a clientes', 'mide una reducción de los pagos operativos'],
      ['Para revisar la actividad habitual conviene «atribuirle el efectivo de la fábrica».', 'atribuirle el efectivo de la fábrica', 'separar los cobros de clientes de esa operación', 'comparar únicamente el saldo bancario final', 'usar el precio recibido como beneficio del periodo'],
      ['La mejora de liquidez de hoy «describe también la capacidad operativa posterior».', 'describe también la capacidad operativa posterior', 'puede acompañarse de menos recursos para operar', 'permite extrapolar el mismo cobro a cada año', 'sustituye la revisión de equipos restantes']
    ],
    'Vender un activo es una fuente de efectivo distinta de cobrar a clientes. Puede mejorar el saldo actual mientras reduce los recursos que producirían resultados después.'
  ],
  605: [
    'La empresa cobra antes a clientes, pero también adelanta sus pagos a proveedores. El ciclo publicado usa promedios de días. Corrige la interpretación.',
    [
      ['Cobrar antes «basta para demostrar que todo el ciclo se acortó».', 'basta para demostrar que todo el ciclo se acortó', 'debe estudiarse junto con existencias y pagos', 'compensa por definición adelantar pagos', 'permite conservar el ciclo del periodo anterior'],
      ['El promedio de días «fija la fecha de cobro de cada factura».', 'fija la fecha de cobro de cada factura', 'resume operaciones que pueden tener fechas diferentes', 'describe solo las facturas que ya vencieron', 'sustituye el calendario de pagos próximos'],
      ['Para prever necesidad de dinero en una campaña interesa «aplicar el promedio sin revisar las fechas».', 'aplicar el promedio sin revisar las fechas', 'contrastar el resumen con operaciones y estacionalidad', 'usar únicamente el plazo más corto de cobro', 'trasladar el beneficio anual al mes de campaña']
    ],
    'El ciclo combina existencias, cobros y pagos. Un promedio ayuda a resumirlo, pero las fechas concretas pueden crear necesidades que no aparecen en esa medida.'
  ],
  615: [
    'La empresa sustituye parte del patrimonio por deuda. Su ROE mejora sin una mejora de producción; después se plantea una caída de la actividad. Corrige el análisis.',
    [
      ['El ROE mayor «demuestra que la operación utiliza mejor sus recursos».', 'demuestra que la operación utiliza mejor sus recursos', 'puede reflejar el cambio en financiación y patrimonio', 'describe una reducción de pagos financieros', 'mide directamente la seguridad del dividendo'],
      ['Si la operación empeora, las obligaciones de deuda «se ajustan al beneficio del accionista».', 'se ajustan al beneficio del accionista', 'siguen exigiendo atender sus pagos', 'se transforman en aportaciones del propietario', 'se aplazan al recuperarse la cotización'],
      ['La amplificación por deuda «afecta solo al escenario favorable».', 'afecta solo al escenario favorable', 'también puede aumentar pérdidas y presión financiera', 'se limita al cambio contable del patrimonio', 'permite evaluar el riesgo con el ROE favorable']
    ],
    'Más deuda puede elevar el rendimiento sobre un patrimonio menor. Sus pagos permanecen cuando la operación empeora, de modo que el escenario favorable no basta para medir vulnerabilidad.'
  ],
  625: [
    'La compañía reparte un dividendo que supera el efectivo generado y toma deuda para cubrir la diferencia. Corrige las conclusiones del informe.',
    [
      ['Recibir el dividendo «identifica que procede de excedente operativo».', 'identifica que procede de excedente operativo', 'no identifica por sí solo el origen de su financiación', 'identifica la rentabilidad de las nuevas inversiones', 'demuestra que se redujeron las obligaciones financieras'],
      ['Revisar la sostenibilidad exige «comparar el dividendo con el de otras marcas».', 'comparar el dividendo con el de otras marcas', 'relacionar reparto, generación de caja y financiación', 'comparar únicamente su importe con el del año anterior', 'relacionar reparto y popularidad de la acción'],
      ['La deuda usada para repartir «mantiene intactas las obligaciones futuras».', 'mantiene intactas las obligaciones futuras', 'añade compromisos que debe atender la empresa', 'se cancela al recibirlo los accionistas', 'se compensa con el importe distribuido']
    ],
    'El cobro del accionista no informa del origen económico. Financiar un reparto con deuda añade compromisos aunque la entrada de dinero para el accionista sea real.'
  ],
  635: [
    'Una valoración compara empresas; otra proyecta flujos. Sus resultados difieren. Corrige qué debe revisarse antes de elegir una estimación.',
    [
      ['Proyectar flujos «retira la necesidad de explicar supuestos».', 'retira la necesidad de explicar supuestos', 'requiere explicar cobros, recursos y riesgo futuros', 'permite usar la cotización como flujo del negocio', 'sustituye la investigación de actividad por una tasa'],
      ['La diferencia entre métodos «demuestra cuál de ellos está equivocado».', 'demuestra cuál de ellos está equivocado', 'invita a revisar las bases y supuestos de ambos', 'permite conservar la cifra más cercana al precio', 'demuestra que faltó usar el mismo múltiplo'],
      ['Para contrastarlos conviene «igualar sus resultados antes de investigar».', 'igualar sus resultados antes de investigar', 'entender qué hipótesis causan la diferencia', 'usar el promedio como evidencia de valor', 'eliminar del análisis el resultado menos favorable']
    ],
    'Los dos enfoques dependen de bases y supuestos. Diferir no identifica automáticamente el error: investigar sus causas permite valorar qué estimación tiene mejor respaldo.'
  ],
  645: [
    'Dos cadenas usan locales similares. Una posee sus locales y otra tiene arrendamientos de largo plazo. El analista mezcla criterios al comparar múltiplos. Corrige el borrador.',
    [
      ['El uso de locales arrendados «elimina compromisos económicos por esos locales».', 'elimina compromisos económicos por esos locales', 'exige revisar obligaciones y tratamiento de sus pagos', 'permite comparar solo el valor de los locales propios', 'convierte los pagos en ingresos de la cadena'],
      ['La coherencia de un múltiplo se revisa «solo en su numerador».', 'solo en su numerador', 'en numerador y resultado utilizados conjuntamente', 'solo en el importe de ventas publicado', 'en el parecido comercial de los escaparates'],
      ['Si las cifras incluyen pagos de forma distinta, la diferencia «se atribuye a mejor operación».', 'se atribuye a mejor operación', 'puede proceder del criterio aplicado', 'se atribuye al tamaño de la cadena', 'puede eliminarse cambiando el nombre del múltiplo']
    ],
    'Los compromisos no desaparecen por arrendar. Para atribuir una diferencia al negocio, el valor y el resultado comparados deben tratar esos pagos de forma coherente.'
  ],
  655: [
    'Los empleados tienen opciones que permiten recibir acciones al cumplir condiciones. No todas se han ejercido. Corrige la revisión del reparto potencial.',
    [
      ['La revisión de esos derechos «empieza cuando ya se han ejercido todos».', 'empieza cuando ya se han ejercido todos', 'incluye las condiciones de los derechos aún potenciales', 'puede hacerse mirando solo las acciones actuales', 'incluye únicamente los derechos que no tienen calendario'],
      ['Para estudiar qué puede convertirse en acciones interesa «solo el nombre del plan».', 'solo el nombre del plan', 'precio de ejercicio, cantidad y calendario', 'el precio de compra del accionista anterior', 'el dividendo del último ejercicio'],
      ['Tener un derecho a recibir acciones «equivale a que ya se haya ejercido».', 'equivale a que ya se haya ejercido', 'debe distinguirse de cumplir condiciones y ejercerlo', 'equivale a una salida de caja ya realizada', 'debe interpretarse como una cancelación de acciones']
    ],
    'El derecho potencial no es todavía una acción entregada. Sus condiciones permiten revisar un posible aumento de títulos sin afirmar que ya se produjo.'
  ],
  665: [
    'Una venta excepcional eleva el beneficio utilizado en el PER. El precio de la acción no cambió. Corrige las conclusiones sobre el múltiplo.',
    [
      ['El PER menor «prueba una mejora del beneficio habitual».', 'prueba una mejora del beneficio habitual', 'puede proceder de una operación que no se repetirá', 'describe una reducción de precio de la acción', 'puede atribuirse al aumento de ventas recurrentes'],
      ['Para estudiar continuidad del resultado conviene «extrapolar la cifra total de ese año».', 'extrapolar la cifra total de ese año', 'separar la venta singular de la actividad habitual', 'usar el máximo beneficio publicado', 'comparar solo el PER de la sesión anterior'],
      ['Que el precio se mantenga «hace comparable el beneficio de referencia».', 'hace comparable el beneficio de referencia', 'no elimina el efecto del ingreso extraordinario', 'permite atribuir la bajada del PER a menos riesgo', 'iguala la capacidad de producir beneficios futuros']
    ],
    'El denominador creció por un resultado singular. El PER puede bajar sin mejora recurrente ni cambio del precio, por lo que debe revisarse qué beneficio podría continuar.'
  ],
  675: [
    'La empresa aplaza la renovación de equipos que pronto necesitará. El flujo libre del año sube y el múltiplo sobre esa caja parece atractivo. Corrige su lectura.',
    [
      ['El flujo más alto «demuestra mayor caja recurrente de clientes».', 'demuestra mayor caja recurrente de clientes', 'puede reflejar inversión necesaria que se ha aplazado', 'describe un menor coste de los equipos nuevos', 'puede tratarse como liberación permanente de recursos'],
      ['Para utilizar ese año como referencia interesa «mantener su cifra sin revisar la reposición».', 'mantener su cifra sin revisar la reposición', 'revisar qué inversión reaparecerá después', 'comparar solo el saldo de caja al cierre', 'revisar únicamente el precio actual de la acción'],
      ['El múltiplo bajo «resuelve la duda sobre inversión pendiente».', 'resuelve la duda sobre inversión pendiente', 'puede apoyarse en un flujo poco representativo', 'demuestra que la renovación no es relevante', 'permite conservar el aplazamiento como hipótesis estable']
    ],
    'La inversión aplazada mejora el flujo de hoy, pero puede exigir dinero después. Revisar reposición evita confundir un año favorable con una base sostenible.'
  ],
  685: [
    'Dos informes cubren doce meses, pero clasifican el mismo gasto de forma distinta. Además, otra tabla incorpora una cifra de nueve meses. Corrige la comparación.',
    [
      ['Que ambos periodos principales duren doce meses «iguala el criterio de sus resultados».', 'iguala el criterio de sus resultados', 'deja pendiente revisar políticas y ajustes', 'permite mantener todos los gastos como están', 'demuestra que la diferencia es operativa'],
      ['La cifra de nueve meses «puede sustituir a la anual por compartir moneda».', 'puede sustituir a la anual por compartir moneda', 'requiere un periodo compatible antes de comparar', 'puede usarse como beneficio anual ajustado', 'requiere únicamente cambiar el título de su columna'],
      ['Antes de atribuir diferencias al negocio conviene «ordenar los resultados de mayor a menor».', 'ordenar los resultados de mayor a menor', 'homogeneizar periodo, definición y ajustes', 'conservar el tratamiento más favorable de cada uno', 'comparar únicamente los porcentajes publicados']
    ],
    'Periodo y criterio contable son comprobaciones independientes. Compartir moneda o duración no hace equivalentes partidas clasificadas de modo distinto.'
  ]
};

const rotate=(values,offset)=>values.map((_,i)=>values[(i+offset)%values.length]);
export const earlySpecialChallenges = {};
for(const [raw,data] of Object.entries(reverseData)){
  const id=Number(raw),[response,right,wrongA,wrongB,feedback]=data;
  const options=rotate([right,wrongA,wrongB],id%3),answer=options.indexOf(right);
  const base=choice('Encuentra la pregunta que sí queda respondida',
    'Lee la respuesta del analista. Elige la pregunta que responde de forma directa; las otras necesitan información que no aparece en ella.',options,answer,feedback);
  base.hint='Comprueba qué hechos ofrece la respuesta y cuáles harían falta para resolver cada pregunta.';
  earlySpecialChallenges[id]={slot:7,exercise:activity(base,'reverse',{response,options,answer,instruction:'Selecciona la pregunta respondida por este análisis.'})};
}
for(const [raw,data] of Object.entries(repairData)){
  const id=Number(raw),[scene,lines,feedback]=data;
  const entries=lines.map(([label,wrongWord,right,wrongA,wrongB],index)=>{
    const options=rotate([right,wrongA,wrongB],(id+index)%3);
    return {label,wrongWord,options,answer:options.indexOf(right)};
  });
  const exercise=rows('repair','Repara el razonamiento',scene,entries,feedback);
  exercise.hint='Corrige la relación entre hechos y conclusión. Las tres frases pertenecen al mismo caso.';
  exercise.activity.hint=exercise.hint;
  exercise.activity.instruction='Sustituye el fragmento señalado en cada frase. Completa las tres correcciones.';
  earlySpecialChallenges[id]={slot:5,exercise};
}
