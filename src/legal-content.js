import { BUSINESS } from './business.js';

/*
 * Original Spanish copy, checked against the implementation and these primary
 * sources on 2026-10-10. Recheck when data flows, providers or company details change.
 * GDPR, arts. 6, 12–22, 44–49:
 * https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=es
 * https://www.aepd.es/derechos-y-deberes/ejerce-tus-derechos
 * https://www.aepd.es/preguntas-frecuentes/1-tus-derechos/2-tus-derechos-de-proteccion-de-datos/FAQ-0106-cual-es-el-plazo-para-responder-cuando-se-ejercitan-estos-derechos
 * https://firebase.google.com/support/privacy
 * https://firebase.google.com/docs/auth/admin/manage-sessions
 * https://firebase.google.com/terms/data-processing-terms
 * https://cloud.google.com/terms/data-processing-addendum
 * https://cloud.google.com/terms/sccs
 * https://policies.google.com/privacy?hl=es
 * Company identification, LSSI art. 10:
 * https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758#a10
 * Current company registration and address:
 * https://www.boe.es/diario_borme/txt.php?id=BORME-A-2026-102-52
 * Account deletion route, public request channel and retained data:
 * https://support.google.com/googleplay/android-developer/answer/13327111?hl=es
 * Planned native purchases, currently unavailable pending store configuration:
 * https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy
 * https://www.revenuecat.com/docs/dashboard-and-metrics/customer-profile
 * https://www.revenuecat.com/privacy
 * https://www.revenuecat.com/dpa
 * Optional consumables and precontractual purchase information, checked 2026-10-07:
 * https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a97
 * https://www.boe.es/buscar/act.php?id=BOE-A-2007-20555#a103
 *
 * The links describe provider terms, not a completed audit of this company's
 * contractual arrangements. Never invent a registry entry or contact address.
 */
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const paragraph = html => '<p>' + html + '</p>';
const section = (title, html) => '<section><h2>' + escape(title) + '</h2>' + html + '</section>';
const list = (items, ordered = false) => {
  const tag = ordered ? 'ol' : 'ul';
  return '<' + tag + '>' + items.map(item => '<li>' + item + '</li>').join('') + '</' + tag + '>';
};
const external = (url, label) => '<a href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">' + escape(label) + '</a>';
const validEmail = value => typeof value === 'string' && /^[^\s<>@"\\]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value.trim());

function publicUrl(path = '/') {
  const url = new URL(String(BUSINESS.siteUrl));
  if (url.protocol !== 'https:' || url.username || url.password) throw Error('BUSINESS.siteUrl debe ser una URL HTTPS pública.');
  return new URL(path, url.origin).href;
}

function publicLink(path, label, button = false) {
  return '<a' + (button ? ' class="br-legal-button"' : '') + ' href="' + escape(publicUrl(path)) + '">' + escape(label) + '</a>';
}

function emailLink(field, label, button = false) {
  const email = BUSINESS[field];
  if (!validEmail(email)) return '<span>Contacto por correo postal: ' + escape(BUSINESS.address) + '.</span>';
  // The address is intentionally absent from visible text, title and aria-label.
  // A mailto click opens the user's editor; it never sends or adds account data.
  return '<a' + (button ? ' class="br-legal-button"' : '') + ' href="mailto:' + escape(encodeURIComponent(email.trim()).replace(/%40/g, '@')) + '">' + escape(label) + '</a>';
}

function companyDetails({ privacy = false, registry = false } = {}) {
  const fields = [
    ['Responsable', escape(BUSINESS.name)],
    ['Dirección postal', escape(BUSINESS.address)],
    ['Contacto', privacy ? emailLink('privacyEmail', 'Enviar consulta sobre privacidad') : emailLink('supportEmail', 'Enviar correo a Ochavo')],
  ];
  // Full trader identification belongs in the legal notice, not every help screen.
  // Keep personal identifiers and the D-U-N-S out of all public app pages.
  if (registry) {
    fields.splice(1, 0, ['NIF', escape(BUSINESS.taxId)]);
    fields.push(['Correo electrónico', escape(BUSINESS.supportEmail)]);
    fields.push(['Teléfono de contacto', '<a href="tel:' + escape(BUSINESS.supportPhone) + '">' + escape(BUSINESS.supportPhone) + '</a>']);
  }
  if (registry && typeof BUSINESS.registry === 'string' && BUSINESS.registry.trim()) fields.push(['Registro', escape(BUSINESS.registry.trim())]);
  return '<dl class="br-legal-contact">' + fields.map(([label, html]) => '<div><dt>' + label + '</dt><dd>' + html + '</dd></div>').join('') + '</dl>';
}

function dateMarkup() {
  const date = String(BUSINESS.policyDate ?? '');
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T12:00:00Z') : null;
  const label = parsed && Number.isFinite(parsed.getTime())
    ? new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parsed)
    : date;
  return '<p class="br-legal-updated">Última actualización: <time datetime="' + escape(date) + '">' + escape(label) + '</time>.</p>';
}

// Shared retention disclosure: the security marker is distinct from course data.
function deletionMarkerContent() {
  return paragraph('Al iniciar la eliminación conservamos en Firestore un marcador de seguridad con solo el identificador interno de la cuenta (UID) y la fecha de eliminación solicitada. No contiene correo, nombre, contraseña, respuestas ni progreso. Impide que una sesión que siguiera abierta en otro dispositivo vuelva a subir datos de esa cuenta.') +
    paragraph('Este marcador no se borra automáticamente. Permanece hasta una actuación de mantenimiento administrativo que comprueba que la cuenta ya no existe en Authentication y que han pasado al menos dos horas desde la creación del marcador. Las dos horas son un mínimo de seguridad, no un plazo garantizado de retirada. Mientras no se realice ese mantenimiento, se conserva el identificador y la fecha para esa finalidad.');
}

function backupRetentionContent() {
  return paragraph('Para recuperar el servicio ante una avería, hacemos una copia diaria de los datos de Firestore. Cada copia se conserva durante 7 días desde su creación y no se utiliza para el funcionamiento habitual de la app. Al borrar tu cuenta se retiran sus datos del servicio activo, pero pueden permanecer en una copia anterior hasta que venza esa retención. Las copias no incluyen las cuentas de Firebase Authentication. Antes de recuperar datos desde una copia, se comprueban las cuentas eliminadas para no volver a activar sus datos.');
}

function subscriptionManagementContent() {
  return paragraph('<strong>Eliminar tu cuenta de Ochavo no cancela una suscripción.</strong> Desinstalar la app tampoco detiene su renovación. Si tienes una suscripción, puedes gestionarla o cancelar su renovación en el servicio donde la contrataste: ' + external('https://apps.apple.com/account/subscriptions', 'Gestionar suscripciones de Apple') + ' o ' + external('https://play.google.com/store/account/subscriptions', 'Gestionar suscripciones de Google Play') + '. Para una compra web, utiliza Perfil → Ochavo Plus → Gestionar mi suscripción web o el enlace de gestión de los correos de compra de RevenueCat. No necesitas mantener tu cuenta de Ochavo para solicitar su borrado.') +
    paragraph('Cancelar la renovación y pedir un reembolso son gestiones distintas. La tienda informa de la fecha hasta la que sigue el acceso y tramita las solicitudes que correspondan; Ochavo no promete la devolución automática de un importe.');
}

function purchaseInformationContent() {
  return paragraph('<strong>Las compras todavía no están disponibles.</strong> Estamos preparando Ochavo Plus y los paquetes opcionales de vidas y gemas; la configuración y validación de los pagos web y de las tiendas está pendiente. Esta información no activa un pago.') +
    paragraph('Ochavo Plus está previsto como una suscripción renovable de <strong>9,99 € al mes</strong>, con vidas ilimitadas y acceso a todos los casos mientras esté activa. Antes de contratarla, el formulario de pago o la tienda mostrará el precio total y la moneda aplicables, la duración y las condiciones de renovación. El acceso de Plus depende de que la suscripción siga vigente.') +
    paragraph('También está previsto un paquete de <strong>5 vidas</strong>, de compra única, por <strong>0,99 €</strong>. El precio final será el que muestre la tienda o el formulario de pago web antes de confirmar. Las vidas compradas se gastan al utilizarlas y no se pierden por el reinicio de las vidas gratuitas diarias.') +
    paragraph('Los paquetes de gemas previstos son <strong>200 gemas por 1,99 €</strong>, <strong>600 gemas por 4,99 €</strong> y <strong>1500 gemas por 9,99 €</strong>. Cada paquete será una compra única, sin renovación automática; comprar gemas será opcional y seguirás pudiendo ganarlas gratis al aprender. Antes de confirmar se mostrará la cantidad de gemas y el importe total en dinero. Las gemas están vinculadas a tu cuenta, no se transfieren a otras personas ni se canjean por efectivo, y no sustituyen a Plus para abrir casos.') +
    paragraph('Cuando se activen las compras, el saldo de gemas incluirá las ganadas y las compradas. Al gastar se usarán primero las ganadas. Si una compra se anula o reembolsa, se retirarán las gemas de esa compra. Si ya las gastaste, las nuevas compras de gemas compensarán primero esa cantidad pendiente; tus gemas ganadas al aprender no se retirarán por ese ajuste. Si ves un saldo incorrecto, puedes pedir que lo revisemos desde Ayuda.') +
    paragraph('Para comprar o restaurar compras necesitarás iniciar sesión en la misma cuenta de Ochavo, con el correo verificado y conexión, y utilizar la cuenta de la tienda que corresponda. Restaurar sirve para recuperar el acceso reconocido por la tienda; no vuelve a añadir vidas ya consumidas ni gemas compradas ya gastadas. En compras web, utiliza Comprobar compras con tu misma cuenta; el acceso, las vidas y las gemas confirmados se comparten entre la web, Android e iPhone. No compartas contraseñas ni envíes datos de tarjeta a Ochavo.') +
    paragraph('En las compras a distancia, el plazo general de desistimiento es de 14 días naturales desde la contratación. Las excepciones para servicios ejecutados o contenido digital requieren los requisitos legales y, cuando corresponda, consentimiento expreso previo, reconocimiento de la pérdida del derecho y confirmación en un soporte duradero. Crear una cuenta, aceptar estas condiciones o usar gemas gratuitas no supone renunciar a ese derecho. Antes de habilitar las compras, el formulario mostrará la información y las opciones que correspondan. Se mantienen tus derechos legales como consumidor, incluidos los relativos a contenidos o servicios que no se ajusten a lo contratado. Para consultas sobre una compra, utiliza ' + emailLink('supportEmail', 'Enviar una consulta sobre compras') + '.') +
    subscriptionManagementContent();
}

function promotionInformationContent() {
  return paragraph('Ochavo puede regalar acceso Plus de por vida mediante códigos promocionales de un solo uso. El canje necesita una cuenta activa con el correo confirmado y conexión. El acceso queda unido a esa cuenta, incluye vidas ilimitadas y todo el contenido de Plus, y no caduca al terminar la beta. No pide tarjeta, no tiene renovaciones y no genera cargos.') +
    paragraph('Cada código puede utilizarse una sola vez y no se puede trasladar a otra cuenta después del canje. Antes de usarlo, comprueba que has iniciado sesión en la cuenta que quieres conservar. Si eliminas la cuenta, se elimina también su acceso promocional y el código utilizado no vuelve a estar disponible. Los códigos sin usar pueden desactivarse; un código desactivado ya no permite el canje.') +
    paragraph('Este acceso gratuito no contrata ni cancela suscripciones de pago. Si ya tienes una suscripción, revisa su renovación en Apple o Google Play, o en el portal de gestión de compras web, según donde la contrataste, para evitar futuros cobros. La promoción no realiza un reembolso automático.');
}

function privacyContent() {
  return [
    '<p class="br-legal-summary">Ochavo guarda tu avance para que puedas retomar el aprendizaje. Aquí explicamos qué información se utiliza, dónde se conserva y cómo puedes gestionarla.</p>',
    section('Quién es responsable', companyDetails({ privacy: true })),
    section('Qué datos utilizamos',
      list([
        '<strong>Cuenta.</strong> Correo, nombre si decides indicarlo, un identificador de usuario (UID), estado de verificación, proveedor de acceso y metadatos de creación, acceso y sesión. La contraseña se utiliza mediante Firebase Authentication; no forma parte del documento de progreso.',
        '<strong>Aprendizaje.</strong> Lecciones y casos completados, respuestas y borradores, paso pendiente, pistas e intentos, resultados de exámenes y fechas de guardado y sincronización. Los puntos se calculan a partir de esos resultados. También conservamos la posición necesaria para retomar cada recorrido y caso.',
        '<strong>Vidas, gemas y logros.</strong> Saldo de gemas, vidas disponibles, días de actividad, racha actual y mejor racha, insignias y casos desbloqueados. Guardamos registros de las recompensas y de los usos de gemas, con fecha, identificador de intento y resultado, para mantener el saldo y evitar duplicar una operación al reintentar. Estos registros están asociados a tu cuenta; no son anónimos mientras exista esa asociación.',
        '<strong>Invitaciones.</strong> Si usas esta función, conservamos tu código, la vinculación entre el código y las cuentas participantes, la fecha y si se ha cumplido el requisito de la invitación. Quien invita ve el número de invitaciones válidas y sus recompensas, no el nombre, correo ni progreso de la persona invitada. Los comprobantes que recibe por una invitación válida contienen un identificador aleatorio y la fecha, sin los datos de identidad del invitado. Ochavo no accede a tu agenda de contactos ni envía invitaciones por ti.',
        '<strong>Consultas y avisos de errores.</strong> Si nos escribes por correo, recibimos tu dirección de remitente, el mensaje y los archivos que decidas adjuntar. Desde una cuenta verificada puedes enviar un aviso dentro de Ochavo: guardamos su categoría, tu explicación, la fecha y el identificador de tu cuenta en Firestore. Se añade automáticamente la ubicación que muestra el formulario (camino, mundo, punto y paso, cuando corresponda), sin adjuntar respuestas ni datos de acceso. La versión de la app y la plataforma se añaden solo si marcas esa opción. Los avisos son privados: otros usuarios no pueden consultarlos. Revisa el texto antes de pulsar Enviar aviso.',
        '<strong>Promociones gratuitas.</strong> Al canjear un código, guardamos su identificador protegido, el identificador de tu cuenta y la fecha de canje para confirmar el acceso Plus y evitar reutilizaciones. Los administradores autorizados pueden crear y desactivar códigos pendientes; se registra quién los creó, la fecha y una etiqueta opcional. El panel muestra el estado de los códigos, no el correo ni el progreso de quien los usa. El texto completo del código no se guarda en la base de datos.',
        '<strong>Seguridad de la eliminación.</strong> Al solicitar el borrado, un marcador conserva únicamente el identificador interno de la cuenta y la fecha, para impedir que una sesión antigua vuelva a guardar su progreso. Su conservación se explica más abajo.',
        '<strong>Funcionamiento y seguridad.</strong> Los proveedores pueden tratar información técnica, como dirección IP, navegador y registros de solicitudes, de acuerdo con las políticas de sus servicios.',
      ]) +
      paragraph('No solicitamos tarjetas, cuentas bancarias, saldos financieros ni inversiones reales para aprender. El contenido combina situaciones ficticias y casos históricos documentados; las simulaciones se identifican como tales. Las gemas pueden ganarse gratis y estamos preparando paquetes de compra opcional. No se transfieren a otras personas ni se canjean por efectivo. Las compras de Plus, vidas y gemas todavía no están disponibles. No hay anuncios reales activos ni Crashlytics. La analítica opcional se limita a la web, como se explica abajo; cualquier ensayo publicitario se limitará a anuncios de prueba y no supone que la publicidad comercial esté habilitada.')),
    section('Newsletters y promociones por correo',
      paragraph('Solo si marcas la casilla opcional, podremos usar el correo de tu cuenta para enviarte newsletters, novedades y promociones de Ochavo. La base es tu consentimiento, artículo 6.1.a del RGPD. Registrarte o aceptar la analítica no te suscribe. Las cuentas anteriores permanecen sin suscripción hasta que la elijan.') +
      paragraph('Guardamos tu elección, la fecha del servidor, la versión del texto y su origen, además del historial de cambios, para acreditar el consentimiento y respetar las bajas. Puedes retirarlo desde Perfil → Privacidad y correos. Cada campaña que se habilite ofrecerá también una baja sencilla y gratuita. La retirada no afecta a los correos necesarios para verificar y gestionar la cuenta. Tenemos preparado Sender como proveedor de campañas, sin sincronización automática desde la app. Cuando se habiliten los envíos, solo se trasladará el correo de cuentas verificadas con consentimiento vigente; no se enviarán nombres, teléfonos, progreso ni respuestas. Las bajas y solicitudes de eliminación se tramitarán también en ese proveedor cuando haya datos allí. Consulta la ' + external('https://www.sender.net/privacy-policy/', 'política de privacidad de Sender') + '.') +
      paragraph('La elección y su historial se conservan mientras exista tu cuenta y se eliminan al borrar sus datos. No enviamos comunicaciones promocionales a direcciones que no estén verificadas o no tengan consentimiento vigente.')),
    section('Cookies y analítica opcional: solo web',
      paragraph('Con tu permiso, MEMORIAS MEDIA SL utiliza Google Analytics 4, de Google, para conocer visitas, sesiones, uso de caminos, inicio y finalización de lecciones y resultados de exámenes. La base es tu consentimiento, artículo 6.1.a del RGPD y artículo 22.2 de la LSSI. No cargamos la etiqueta ni enviamos eventos antes de aceptar. Rechazar tiene la misma facilidad que aceptar y no limita el aprendizaje. Android e iOS no recogen esta analítica.') +
      paragraph('Los informes usan identificadores del navegador y datos técnicos de conexión y dispositivo. No enviamos tu correo, nombre, UID de cuenta, respuestas, texto libre ni parámetros de los enlaces de invitación o recuperación. Estos datos no se describen como anónimos. Las señales de Google y la personalización publicitaria están desactivadas.') +
      paragraph('Google Analytics puede guardar las cookies _ga y _ga_<identificador> en este dominio para distinguir navegadores y sesiones, con duración configurada de hasta dos años. Tu elección de analítica se guarda durante seis meses en el almacenamiento local; después volveremos a preguntarte. Puedes cambiarla desde Privacidad y correos, también en la pantalla de acceso. Al rechazar retiramos las cookies de analítica accesibles en este dominio y detenemos la medición; esto no borra retroactivamente los datos enviados antes de la retirada.') +
      paragraph('Google puede procesar datos fuera del Espacio Económico Europeo. Consulta su ' + external('https://policies.google.com/privacy?hl=es', 'política de privacidad') + ' y su ' + external('https://support.google.com/analytics/answer/6004245?hl=es', 'información sobre protección de datos de Analytics') + '. La medición no se aplica a las páginas legales públicas.')),
    section('Datos de compras, cuando se habiliten',
      paragraph('Cuando se habilite la integración de compras, RevenueCat, Inc. tratará por cuenta de Ochavo el identificador interno de tu cuenta y los datos necesarios para comprobar la compra: producto, tienda, referencia de transacción, fechas, renovación, estado de pago y acceso asociado. El historial estará vinculado a tu cuenta, aunque no use tu nombre como identificador. Ochavo registrará también las cantidades de vidas y gemas compradas, consumidas y disponibles, separadas de las recompensas ganadas, para confirmar entregas, gastos y ajustes por reembolsos. Se empleará para entregar lo comprado, recuperar el acceso, evitar duplicados y gestionar incidencias; RevenueCat también ofrece informes de estas compras.') +
      paragraph('Apple o Google Play tramitarán el cobro mediante su sistema de compras. Ochavo y RevenueCat no recibirán tus datos de tarjeta a través de esta integración nativa. En la web, cuando se habilite, Stripe procesará el pago y RevenueCat gestionará la suscripción o compra. El formulario del proveedor pedirá el correo de recibos, los datos de pago y, cuando sean necesarios, datos de facturación. No guardamos el número completo de tarjeta ni su código de seguridad en la base de datos de Ochavo. Estos servicios también pueden tratar datos técnicos para prestar y proteger el pago. La base para verificar y prestar la compra solicitada será la ejecución del contrato, artículo 6.1.b del RGPD; las obligaciones de conservación que resulten aplicables se atenderán conforme al artículo 6.1.c. El análisis de las compras para detectar incidencias y entender el funcionamiento del servicio se basará en el interés legítimo del artículo 6.1.f: mantener y mejorar esta función, sin usar ese historial para seguimiento publicitario. Esta preparación no envía por sí sola compras a RevenueCat: todavía no están habilitadas.')),
    section('Para qué se usan y con qué base',
      list([
        '<strong>Prestar el servicio que solicitas:</strong> crear y mantener la cuenta, verificar el correo, recuperar el acceso, guardar y sincronizar el aprendizaje, gestionar vidas, gemas y logros, y tramitar las invitaciones que decidas utilizar. La base es la ejecución del servicio de Ochavo, artículo 6.1.b del RGPD.',
        '<strong>Seguridad y atención de consultas generales:</strong> prevenir accesos indebidos y abusos, evitar recompensas o cargos duplicados en gemas, impedir que sesiones antiguas restauren datos tras una eliminación, resolver incidencias y responder a tus mensajes. La base es el interés legítimo del artículo 6.1.f del RGPD: proteger el servicio, la consistencia de los saldos y la decisión de borrar la cuenta, y atender a quien contacta, usando la información necesaria para cada fin y sin destinarla a publicidad.',
        '<strong>Atender derechos y obligaciones legales:</strong> gestionar las solicitudes de protección de datos y las obligaciones aplicables, conforme al artículo 6.1.c del RGPD.',
      ]) +
      paragraph('Para acceder al aprendizaje de Ochavo necesitas una cuenta. El correo y la contraseña son necesarios; el nombre es opcional. Ayuda, Privacidad, Aviso legal y las opciones de eliminación se pueden consultar sin iniciar sesión. Las respuestas se corrigen automáticamente para explicar el resultado, abrir niveles y aplicar las reglas de vidas y recompensas; no se usan para evaluar tu situación financiera ni para decidir créditos o inversiones.')),
    section('Qué queda en tu dispositivo',
      paragraph('La web conserva la sesión y copias del progreso y del juego en el almacenamiento del navegador. En Android e iOS, estas copias se guardan mediante Preferences y la sesión se mantiene con la persistencia de Firebase Authentication. También se guarda si ya has visto la bienvenida y qué operación está pendiente de confirmación, para poder reintentarla sin repetir su efecto.') +
      paragraph('Las copias de aprendizaje y juego se vinculan a la cuenta con la que has iniciado sesión. Al cambiar de cuenta no se mezclan los avances, las vidas ni las gemas de distintas personas. Necesitas confirmar el correo y tener conexión para sincronizar el progreso.') +
      paragraph('Con una cuenta verificada, responder en el recorrido, entregar exámenes o modificar vidas y gemas requiere conexión para confirmar la operación. Sin conexión puedes consultar las explicaciones que estén disponibles en el dispositivo. Los casos de estudio necesitan una suscripción Plus activa y conexión para comprobar el acceso; los borradores que ya hayas guardado se conservan. En la web, abrir o recargar la página puede necesitar internet. Cerrar sesión no equivale a borrar las copias locales. Puedes retirarlas desde los ajustes de almacenamiento del dispositivo o los ajustes de datos del sitio del navegador; antes sincroniza lo que quieras conservar.') +
      paragraph('Las versiones públicas de Privacidad, Aviso legal, Eliminación y Ayuda se pueden consultar sin entrar en la app: no cargan el código de Authentication ni del curso. Al abrirlas, el servicio que entrega la página puede seguir tratando los datos técnicos propios de la conexión.')),
    section('Proveedores y ubicación',
      paragraph('Utilizamos Google Firebase para la autenticación, el progreso, los datos de juego e invitaciones y la entrega de la web. La base de Firestore está configurada en Madrid. Firebase Authentication procesa datos en Estados Unidos y Hosting utiliza infraestructura global: la ubicación de Firestore no significa que todo el tratamiento se realice en la Unión Europea. Consulta la ' + external('https://firebase.google.com/support/privacy', 'información de privacidad y ubicaciones de Firebase') + '.') +
      paragraph('El buzón corporativo de atención utiliza Hostinger. Al enviar una consulta se emplean ese servicio y el proveedor de correo que hayas elegido, conforme a sus condiciones. Puedes consultar la ' + external('https://www.hostinger.com/legal/privacy-policy', 'política de privacidad de Hostinger') + ', que describe los destinatarios y las garantías aplicables a las transferencias internacionales.') +
      paragraph('RevenueCat será un proveedor de la función de compras únicamente cuando esta se habilite. Su documentación identifica tratamiento en Estados Unidos y condiciones para las transferencias internacionales, incluidas cláusulas contractuales tipo. Puedes consultar su ' + external('https://www.revenuecat.com/dpa', 'acuerdo de tratamiento y lista de proveedores') + ' y su ' + external('https://www.revenuecat.com/privacy', 'información de privacidad') + '. La ubicación de Firestore en Madrid no se extiende a los datos tratados por ese servicio.') +
      paragraph('Stripe será el proveedor de pagos web cuando se habilite esa función. Puede tratar datos para procesar el pago, prevenir el fraude y cumplir sus obligaciones, con el papel que corresponda a cada actividad. Consulta su ' + external('https://stripe.com/es/privacy', 'política de privacidad') + ' y su ' + external('https://stripe.com/legal/dpa', 'acuerdo de tratamiento de datos') + ', que explican también las transferencias internacionales. No utilizamos la compra como consentimiento para recibir promociones.') +
      paragraph('Google publica condiciones de tratamiento y garantías para transferencias internacionales, incluidas cláusulas contractuales tipo para los supuestos a los que sean aplicables. Están disponibles en los ' + external('https://firebase.google.com/terms/data-processing-terms', 'términos de tratamiento de Firebase') + ', el ' + external('https://cloud.google.com/terms/data-processing-addendum', 'anexo de tratamiento de Google Cloud') + ' y sus ' + external('https://cloud.google.com/terms/sccs', 'cláusulas contractuales tipo') + '. Puedes pedirnos información sobre el tratamiento de tus datos mediante el contacto de privacidad.') +
      paragraph('No publicamos tu progreso ni lo vendemos a anunciantes. Puede acceder a la información quien necesite atender el servicio o tu solicitud, los proveedores que lo hacen posible y las autoridades cuando exista una obligación legal.')),
    section('Durante cuánto tiempo',
      paragraph('La cuenta, el progreso, los datos de juego y los registros de sus operaciones se conservan mientras mantengas la cuenta. Al solicitar su eliminación se inicia el procedimiento descrito más abajo. Las copias locales se mantienen hasta su borrado en el dispositivo o la eliminación de los datos de la app o del navegador. Los mensajes de soporte se conservan el tiempo necesario para resolver la consulta y posibles incidencias o reclamaciones, y durante las obligaciones legales aplicables.') +
      paragraph('Cuando existan compras, los datos necesarios para verificar el acceso se conservarán mientras sean necesarios para esa función y para resolver incidencias. Los comprobantes sujetos a obligaciones legales se limitarán a esas finalidades durante el tiempo exigible. El borrado de Firebase no elimina por sí solo los registros de Apple, Google Play o RevenueCat, ni los registros de Stripe correspondientes a un pago web. Puedes solicitar la revisión de esos datos mediante el contacto de privacidad: tramitaremos la petición sobre los datos que nos corresponda gestionar y te informaremos de cualquier conservación necesaria.') +
      deletionMarkerContent() + backupRetentionContent() +
      paragraph('Según la ' + external('https://firebase.google.com/support/privacy', 'información de conservación de Firebase') + ', Authentication conserva registros de IP unas semanas y completa la eliminación de otros datos de autenticación de sus sistemas activos y copias de respaldo dentro de los 180 días posteriores al inicio del borrado en ese servicio. Hosting conserva datos de IP durante unos meses. Estos ciclos técnicos no son un plazo de espera para usar la opción de eliminar tu cuenta.') +
      paragraph('El borrado de la cuenta no implica la desaparición instantánea de todas las copias técnicas del proveedor. Si alguna información de una consulta debe conservarse por una obligación legal o para atender una reclamación, su uso queda limitado a esa finalidad durante el tiempo que resulte necesario.')),
    section('Conservación de promociones', paragraph('El permiso de acceso promocional se conserva mientras exista la cuenta. Al eliminarla se retira ese permiso y su identificador del código canjeado. Conservamos el identificador protegido del código, su estado consumido y la fecha de uso, sin el identificador de la cuenta eliminada, para impedir que vuelva a canjearse. Si la cuenta era administradora, se retiran sus permisos, su identificador y las etiquetas de los códigos que creó; los que no se hayan usado quedan desactivados.')),
    section('Protección de los datos',
      paragraph('Las conexiones con el servidor se realizan mediante HTTPS. El acceso a los datos de cuenta está restringido mediante autenticación y reglas del servidor; otras cuentas no pueden consultar tu progreso ni tus avisos. Las credenciales privadas del servidor no se distribuyen en la web ni en los instaladores. Los proveedores aplican además sus medidas de seguridad. Si detectas un posible acceso indebido, utiliza el contacto de privacidad sin enviar contraseñas ni códigos de acceso.')),
    section('Cómo borrar tu cuenta y qué ocurre con las copias',
      paragraph('En Ochavo, abre Cuenta, inicia sesión y elige Eliminar cuenta. La operación solicita contraseña y confirmación. Primero registra el marcador de seguridad y elimina el progreso y los datos de juego de esa cuenta en Firestore, incluidos sus registros de recompensas y usos de gemas. También elimina sus avisos de errores enviados desde la app y retira su código de invitación y las vinculaciones de invitaciones en las que participa. Después elimina el perfil de Firebase Authentication y las copias locales de esa cuenta. Si falla la limpieza local, la app lo indica por separado: retira esas copias desde los ajustes del dispositivo o del navegador.') +
      paragraph('Si falla la eliminación del perfil después de registrar el marcador, el marcador se mantiene, el guardado de esa cuenta queda bloqueado y se conserva la copia local. Reintenta Eliminar cuenta o contacta desde Ayuda. No des por completada la eliminación si la app muestra ese error.') +
      paragraph('<strong>Desinstalar Ochavo no borra tu cuenta.</strong> Esta versión tampoco puede borrar remotamente copias locales que permanezcan en otros dispositivos. Revisa los datos de Ochavo en cada uno de ellos. Una solicitud enviada por correo requiere tramitación manual y no borra automáticamente los datos del dispositivo.') +
      subscriptionManagementContent() +
      paragraph(publicLink('/eliminar-cuenta/', 'Ver las opciones de eliminación y solicitud por correo') + '.')),
    section('Tus derechos y cómo contactar',
      paragraph('Puedes solicitar acceso, rectificación, supresión, limitación del tratamiento y, cuando proceda, portabilidad. También puedes oponerte a los tratamientos basados en interés legítimo por motivos relacionados con tu situación. El ejercicio de estos derechos es gratuito en los términos del RGPD.') +
      paragraph(emailLink('privacyEmail', 'Enviar una solicitud de privacidad') + ' o escribe a ' + escape(BUSINESS.name) + ', ' + escape(BUSINESS.address) + '. Indica qué necesitas y el correo de tu cuenta. No envíes tu contraseña. Si existen dudas razonables sobre la identidad, podremos pedir solo la información adicional necesaria para comprobarla.') +
      paragraph('El RGPD establece un plazo general de un mes para informar sobre las actuaciones relativas a una solicitud de derechos. Si su complejidad o número justifican ampliarlo, permite hasta dos meses adicionales, informando de la ampliación y sus motivos dentro del primer mes. Este plazo de respuesta no significa que debas esperar para iniciar el borrado desde Ochavo.') +
      paragraph('Puedes presentar una reclamación ante la ' + external('https://www.aepd.es/', 'Agencia Española de Protección de Datos (AEPD)') + '. Su página ' + external('https://www.aepd.es/derechos-y-deberes/ejerce-tus-derechos', 'Ejerce tus derechos') + ' explica las condiciones y plazos previstos por la normativa.')),
    section('Cambios en esta información',
      paragraph('La fecha de esta página identifica la versión de la información de privacidad. Si cambia la forma de tratar tus datos, actualizaremos esta información y comunicaremos los cambios que corresponda antes de aplicar nuevas finalidades.')),
  ].join('');
}

function legalContent() {
  return [
    '<p class="br-legal-summary">Ochavo es una aplicación educativa para aprender inversión mediante explicaciones, ejercicios y simulaciones.</p>',
    section('Titular y contacto', companyDetails({ registry: true }) +
      paragraph('Sitio web: ' + publicLink('/', 'Abrir Ochavo') + '. Versión de la app: ' + escape(BUSINESS.appVersion) + '.') +
      paragraph('Datos de domicilio e inscripción publicados en el ' + external('https://www.boe.es/diario_borme/txt.php?id=BORME-A-2026-102-52', 'BORME de 1 de junio de 2026') + '.')),
    section('Condiciones de uso: qué ofrece Ochavo',
      paragraph('El contenido se organiza en lecciones, exámenes y casos de estudio. Combina situaciones ficticias con empresas y acontecimientos históricos documentados; cada caso distingue los datos publicados de las simulaciones. No son instrucciones para comprar activos ni asesoramiento personalizado de inversión. Ochavo no ejecuta operaciones ni custodia dinero.') +
      paragraph('Las vidas, gemas, rachas e insignias forman parte de la práctica. Las gemas pueden ganarse gratis; también se preparan paquetes de compra opcional, todavía no disponibles. No se transfieren a otras personas ni se canjean por efectivo. Puedes gastar 20 gemas para recuperar hasta cinco vidas gratuitas; las cinco vidas diarias se renuevan a las 00:00, hora de España peninsular (Europe/Madrid). Las cuentas nuevas comienzan con 200 gemas. El primer mundo de Acciones se puede saltar gratis; saltar otros mundos disponibles cuesta 200 gemas y abre el siguiente sin aprobar su examen ni obtener sus recompensas. Las gemas no se utilizan para abrir nuevos casos. La app indica qué casos tienes disponibles; Plus está previsto para acceder a todos mientras la suscripción esté activa.') +
      paragraph('El acceso a la cuenta y la sincronización necesitan conexión. En una cuenta verificada también se necesita para confirmar respuestas del recorrido, entregas de exámenes y operaciones con gemas. Sin conexión puedes consultar las explicaciones disponibles en el dispositivo. Los casos de estudio necesitan acceso Plus activo, por suscripción o promoción, y conexión para comprobarlo. En la web, abrir o recargar la página puede requerir internet.')),
    section('Ochavo Plus y paquetes de vidas y gemas', purchaseInformationContent()),
    section('Códigos de acceso gratuito', promotionInformationContent()),
    section('Publicidad', paragraph('No hay anuncios comerciales activos en esta versión. Se pueden preparar ensayos con anuncios identificados como pruebas. Si se incorpora publicidad real, antes se actualizará esta información y se ofrecerán las opciones de privacidad que correspondan; no se presenta aquí como una función ya disponible.')),
    section('Uso de la cuenta',
      paragraph('Para acceder al aprendizaje necesitas registrarte o iniciar sesión. Facilita un correo al que tengas acceso, conserva tu contraseña de forma segura y no utilices cuentas ajenas. Confirma tu correo para guardar y sincronizar el avance. La ayuda y la información legal están disponibles sin iniciar sesión.') +
      paragraph('La cuenta es para tu uso personal. No intentes acceder a datos ajenos, manipular compras, saldos o recompensas ni interferir con el funcionamiento del servicio. Registrarte no contrata una suscripción ni permite cobrarte. La aceptación de estas condiciones no autoriza newsletters, analítica o publicidad: esas elecciones se gestionan por separado.') +
      paragraph('Si detectas un error o un posible acceso no autorizado, ' + emailLink('supportEmail', 'contacta con Ochavo') + '. No incluyas contraseñas ni códigos de verificación en el mensaje.')),
    section('Contenidos y enlaces',
      paragraph('Puedes utilizar los contenidos para tu aprendizaje personal. Esta autorización no cede su propiedad ni permite redistribuirlos o explotarlos comercialmente fuera de los límites legales. Las marcas y nombres de empresas utilizados en ejemplos pertenecen a sus titulares; su presencia no implica que patrocinen o recomienden Ochavo.') +
      paragraph('Respeta los derechos de autor de los contenidos y de las fuentes enlazadas. Los enlaces externos permiten ampliar la información; al abrirlos accedes a servicios con sus propias condiciones y políticas. Las explicaciones y simulaciones simplifican la realidad y pueden necesitar correcciones o actualizaciones.') +
      paragraph('Si encuentras un problema en una explicación, puedes indicar la lección y el punto que conviene revisar mediante ' + publicLink('/ayuda/', 'Ayuda y contacto') + '.')),
    section('Alcance educativo y funcionamiento',
      paragraph('Las cifras de las calculadoras dependen de las hipótesis que introduzcas. Los resultados históricos, patrones de gráficos y ejemplos del curso no garantizan rendimientos futuros. El curso no tiene en cuenta tu patrimonio, objetivos ni tolerancia al riesgo; las decisiones de inversión reales requieren una valoración propia. No gestionamos inversiones ni recibimos órdenes de compra o venta.') +
      paragraph('Podemos corregir el contenido y actualizar la aplicación. Los cambios relevantes en estas condiciones o en servicios contratados se comunicarán cuando corresponda; publicar una nueva versión no equivale por sí solo a obtener tu consentimiento para nuevas finalidades. Pueden producirse interrupciones técnicas y puedes solicitar ayuda si afectan a tu acceso o progreso. Estas condiciones no excluyen responsabilidades ni garantías que la ley considere irrenunciables.')),
    section('Consultas, reclamaciones y ley aplicable',
      paragraph('Puedes presentar una consulta o reclamación mediante ' + emailLink('supportEmail', 'Enviar correo a Ochavo') + ' o los datos de contacto del titular indicados al principio. Explica el problema y, si afecta a una compra, su referencia; no envíes datos completos de tarjeta.') +
      paragraph('Se aplica la legislación española, sin privarte de la protección obligatoria que te corresponda como consumidor en tu país de residencia ni de tu derecho a acudir a los tribunales competentes. No se impone que las reclamaciones de consumidores se tramiten exclusivamente en Melilla.')),
    section('Datos personales y eliminación',
      paragraph('La ' + publicLink('/privacidad/', 'política de privacidad') + ' explica el tratamiento de los datos, sus ubicaciones y tus derechos. Puedes ' + publicLink('/eliminar-cuenta/', 'eliminar la cuenta desde Ochavo o solicitar ayuda por correo') + '. Desinstalar la app no elimina por sí solo la cuenta del servicio.')),
  ].join('');
}

function deleteContent() {
  return [
    '<p class="br-legal-summary">Puedes eliminar tu cuenta desde Ochavo o pedir a ' + escape(BUSINESS.name) + ' que tramite tu solicitud. No necesitas tener instalada la app para escribirnos.</p>',
    section('Eliminar desde Ochavo',
      list([
        'Abre Ochavo y entra en Cuenta. Si has cerrado sesión, accede con el correo de la cuenta que quieres eliminar.',
        'Elige Eliminar cuenta, introduce tu contraseña actual y marca la confirmación.',
        'Confirma la eliminación y comprueba el resultado. La app distingue entre un error al borrar la cuenta y un fallo al limpiar la copia local después de borrarla. Sigue la indicación que aparezca; si tienes dudas, contacta con nosotros.',
      ], true) +
      '<div class="br-legal-actions">' + publicLink('/?cuenta=eliminar', 'Abrir Ochavo para eliminar mi cuenta', true) + '</div>' +
      paragraph('Este enlace abre el acceso a la cuenta. No elimina nada por sí solo. Si has olvidado la contraseña, usa Recuperar en la ventana de Cuenta.')),
    section('Solicitar la eliminación por correo',
      paragraph('Puedes escribir sin iniciar sesión en Ochavo. Indica que solicitas eliminar tu cuenta y el correo con el que te registraste. Si puedes, envía la solicitud desde esa misma dirección para facilitar su comprobación. No incluyas tu contraseña, códigos de acceso ni documentos de identidad de entrada.') +
      '<div class="br-legal-actions">' + emailLink('privacyEmail', 'Solicitar eliminación por correo', true) + '</div>' +
      paragraph('El enlace abre tu aplicación de correo. Revisa y envía tú el mensaje; abrirlo no envía ninguna solicitud. La atención de estas solicitudes es manual y puede requerir comprobar que eres titular de la cuenta. No hay un borrado automático por enviar el correo.') +
      paragraph('Si no utilizas una aplicación de correo, puedes escribir por vía postal a ' + escape(BUSINESS.name) + ', ' + escape(BUSINESS.address) + ', indicando un medio para responderte.')),
    section('Qué se elimina',
      list([
        'La cuenta y su perfil de acceso en Firebase Authentication, incluidos el correo y el nombre opcional asociados al perfil.',
        'El progreso vinculado a esa cuenta en Firestore: lecciones, casos, borradores, resultados de ejercicios y exámenes y datos de sincronización.',
        'Sus vidas, gemas, rachas, insignias, casos desbloqueados y registros de recompensas y usos de gemas, incluidos los saldos de vidas y gemas compradas cuando se habiliten.',
        'Sus avisos de errores enviados dentro de Ochavo y vinculados a esa cuenta.',
        'Su código de invitación, las vinculaciones de invitaciones en las que participa y los comprobantes de invitaciones recibidos por esa cuenta.',
        'Su acceso promocional y sus permisos de administración de códigos, si los tiene. El código usado permanece marcado como consumido, sin el identificador de la cuenta eliminada, para impedir su reutilización. Si la cuenta creó códigos, se retira su identificador y la etiqueta, y se desactivan los que sigan disponibles.',
        'Después del borrado de la cuenta, se intenta eliminar su copia local en ese dispositivo. Si esta limpieza falla, la app lo avisa para que puedas borrar los datos desde los ajustes del dispositivo o del navegador.',
      ]) +
      paragraph('Los puntos, gemas y logros de la cuenta dejan de estar disponibles al eliminarla. Los comprobantes sin nombre, correo ni identificador del invitado ya entregados a otra persona pueden permanecer junto con la recompensa de esa otra cuenta. Si vuelves a registrarte, se crea una cuenta nueva; no se restaura automáticamente la anterior.')),
    section('Qué dato mínimo se conserva por seguridad', deletionMarkerContent()),
    section('Copias de recuperación', backupRetentionContent()),
    section('Si tienes compras o una suscripción', subscriptionManagementContent() +
      paragraph('Las compras todavía no están disponibles en esta versión. Cuando se habiliten, borrar Firebase no borrará automáticamente los comprobantes de compra de la tienda, de RevenueCat o de Stripe. Puedes pedirnos que revisemos y tramitemos la eliminación de los datos que nos corresponda gestionar; los sujetos a conservación legal se mantendrán solo para esa finalidad.')),
    section('Qué debes tener en cuenta',
      paragraph('La eliminación empieza registrando el marcador y retirando el progreso, los datos de juego y las invitaciones indicadas. Si una parte falla, la eliminación puede quedar incompleta. Si falla la eliminación del perfil de Firebase Authentication, se conservan el marcador y la copia local; el guardado de esa cuenta queda bloqueado. Reintenta Eliminar cuenta o contacta desde Ayuda para completar el proceso.') +
      paragraph('<strong>Desinstalar la aplicación no elimina la cuenta del servicio.</strong> Cerrar sesión tampoco la borra. Esta versión no puede borrar a distancia las copias locales que puedan quedar en otros teléfonos o navegadores. Una solicitud por correo tampoco puede limpiar esos dispositivos remotamente.') +
      paragraph('Para retirar esas copias, borra los datos de Ochavo desde los ajustes de almacenamiento del dispositivo o los ajustes de datos del sitio del navegador. Esto puede quitar también otros avances guardados allí: sincroniza antes cualquier información que quieras conservar.') +
      paragraph('Los registros operativos y copias técnicas de proveedores siguen sus ciclos de eliminación. Las consultas o información que deba conservarse por obligaciones legales se mantienen solo con esa finalidad. Consulta los criterios en la ' + publicLink('/privacidad/', 'política de privacidad') + '.')),
  ].join('');
}

function helpContent() {
  return [
    '<p class="br-legal-summary">Si algo no funciona o una explicación no se entiende, puedes contactar directamente con el equipo de Ochavo.</p>',
    section('Avisos desde una lección', paragraph('Con tu cuenta verificada, pulsa Informar de un problema al final de una explicación, ejercicio o pregunta de examen. El formulario muestra su ubicación y permite enviar el aviso directamente al equipo. El envío no modifica tus respuestas ni consume vidas o gemas. También puedes abrirlo desde Ayuda. Los avisos enviados desde la app se borran al eliminar la cuenta.')) +
    section('Ayuda con la app',
      '<div class="br-legal-actions">' + emailLink('supportEmail', 'Enviar una consulta a Ochavo', true) + '</div>' +
      paragraph('Explica qué intentabas hacer, qué ocurrió y si usabas Android, iPhone o la web. Puedes indicar la lección o el texto del error. Antes de adjuntar una captura, revisa que no muestre datos que no quieras compartir.') +
      paragraph('El enlace solo abre tu editor de correo. No envía el mensaje ni añade automáticamente tu cuenta, tus respuestas o información del dispositivo. No envíes contraseñas ni códigos de verificación.')),
    section('Acceso y progreso',
      paragraph('Si olvidaste la contraseña, abre Cuenta y elige Recuperar. Si no llega el mensaje, comprueba la dirección y la carpeta de spam. Para sincronizar el progreso, verifica el correo, conecta el dispositivo y espera a que Ochavo muestre «Progreso sincronizado».') +
      paragraph('Necesitas una cuenta para acceder al aprendizaje. Puedes consultar Ayuda y la información legal antes de entrar. Si aparece un error de guardado, conserva la app y sus datos mientras reintentas o pides ayuda. Para recuperar tu avance en otro dispositivo, inicia sesión en la misma cuenta, con el correo verificado y conexión. No se mezclan los avances de cuentas distintas.')),
    section('Vidas, gemas y conexión',
      paragraph('Los errores del recorrido consumen vidas. Las cinco vidas gratuitas se renuevan cada día; además, puedes gastar 20 gemas para recuperar hasta cinco. Las gemas se ganan gratis dentro de Ochavo y se preparan paquetes de compra opcional, todavía no disponibles. No se transfieren a otras personas ni se canjean por efectivo; no sirven para abrir nuevos casos. La app indica qué casos tienes disponibles. Puedes consultar las reglas desde los indicadores de vidas, gemas y racha.') +
      paragraph('Con una cuenta verificada necesitas conexión para confirmar respuestas del recorrido, entregar exámenes, registrar la visita diaria o gastar gemas. Sin conexión puedes consultar las explicaciones disponibles en el dispositivo. Los casos de estudio necesitan una suscripción Plus activa y conexión para comprobar el acceso. Si una operación queda pendiente, reinténtala cuando vuelva la conexión antes de iniciar otra; no repitas un gasto para intentar forzar la confirmación.')),
    section('Plus, compras y restauración', purchaseInformationContent()),
    section('Invitaciones',
      paragraph('Compartir un enlace no envía mensajes desde Ochavo ni genera por sí solo una recompensa. La persona invitada debe vincular el código antes de completar su primera lección, confirmar su cuenta y completar esa lección. Solo puede vincular una invitación y no puede ser la propia. Quien invita ve las invitaciones válidas y sus recompensas, sin acceso al nombre, correo ni avance de la otra persona.')),
    section('Privacidad o eliminación',
      paragraph(emailLink('privacyEmail', 'Enviar consulta sobre privacidad') + '. También puedes consultar la ' + publicLink('/privacidad/', 'información sobre tus datos') + ' y las ' + publicLink('/eliminar-cuenta/', 'opciones para eliminar la cuenta') + '.') +
      paragraph('Si empezaste a eliminar una cuenta y apareció un error, su guardado puede quedar bloqueado para impedir que otra sesión restaure datos. Conserva la copia local, reintenta Eliminar cuenta o pide ayuda. No envíes tu contraseña ni códigos de acceso.')),
    section('Contacto postal', paragraph(escape(BUSINESS.name) + ', ' + escape(BUSINESS.address) + '.')),
  ].join('');
}

/** Shared HTML fragment for the app's dialog and static public pages. No auth/DOM access. */
export function renderLegalContent(kind) {
  const renderers = { privacy: privacyContent, legal: legalContent, delete: deleteContent, help: helpContent };
  if (!Object.hasOwn(renderers, kind)) throw new RangeError('Tipo de información desconocido.');
  return '<div class="br-legal-content">' + dateMarkup() + renderers[kind]() + '</div>';
}
