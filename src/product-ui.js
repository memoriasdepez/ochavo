import { BUSINESS } from './business.js';
import { renderLegalContent } from './legal-content.js';

const WELCOME_KEY = 'brote.onboarding.v1';
const CATEGORIES = Object.freeze({
  funcionamiento: 'Algo no funciona',
  progreso: 'Progreso o guardado',
  contenido: 'Una explicación o un ejercicio',
  cuenta: 'Acceso a mi cuenta',
  otro: 'Otro problema',
});
let productInstance = 0;

/** Plain report text only: preserve paragraphs, remove control characters. */
export function sanitizeReportText(value, maxLength = 2000) {
  if (typeof value !== 'string') return '';
  const limit = Number.isInteger(maxLength) && maxLength >= 0 ? Math.min(maxLength, 10000) : 2000;
  return value.replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\t/g, ' ')
    .slice(0, limit).trim();
}

/** Accept one address, never mail headers, parameters or multiple recipients. */
export function supportAddress(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim();
  return /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,63}$/i.test(email)
    ? email : '';
}

/** Never serialize context: only a validated version and a known platform. */
export function buildSupportDraft({ category, text, includeContext = false, context = {}, email = '' } = {}) {
  const label = Object.hasOwn(CATEGORIES, category) ? CATEGORIES[category] : CATEGORIES.otro;
  const subject = `Ochavo · ${label}`;
  let body = `Reporte de Ochavo\nCategoría: ${label}\n\nQué ha ocurrido:\n${sanitizeReportText(text)}`;
  if (includeContext) {
    const rawVersion = context?.appVersion ?? context?.version;
    const version = typeof rawVersion === 'string' && /^\d{1,3}(?:\.\d{1,3}){1,3}(?:[-+][a-z\d.-]{1,24})?$/i.test(rawVersion)
      ? rawVersion : 'Sin especificar';
    const platforms = { web: 'Navegador web', browser: 'Navegador web', android: 'Android', ios: 'iPhone / iPad' };
    const key = typeof context?.platform === 'string' ? context.platform.toLowerCase() : '';
    const platform = Object.hasOwn(platforms, key) ? platforms[key] : 'Sin especificar';
    body += `\n\nDatos técnicos añadidos con mi consentimiento:\nVersión de Ochavo: ${version}\nPlataforma: ${platform}`;
  }
  const recipient = supportAddress(email);
  return {
    subject,
    body,
    mailto: recipient ? `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : '',
  };
}

/** Presentation only. Account actions are handed back to the host app. */
export function mountProductUI({ onOpenAccount, onDeleteAccount, getContext, onReport, claimWelcome, getWelcomeOwner } = {}) {
  const slot = document.getElementById('br-help-slot');
  if (!slot) throw new Error('Product UI requires #br-help-slot.');
  const prefix = `br-product-${++productInstance}`;
  let section = 'help';
  let welcomeStep = 0;
  let welcomeSeenThisSession = false;
  let disposed = false;
  let opener = null;
  let pendingAction = null;
  let welcomeRequest = null;
  let welcomeOwner = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, action, variant = 'secondary') {
    const node = el('button', `br-product-button br-product-button--${variant}`, label);
    node.type = 'button';
    if (action) node.addEventListener('click', action);
    return node;
  }

  function paragraph(text, className = 'br-product-copy') {
    return el('p', className, text);
  }

  const helpButton = button('Ayuda', () => open('help'), 'header');
  helpButton.setAttribute('aria-haspopup', 'dialog');
  helpButton.setAttribute('aria-label', 'Abrir la ayuda de Ochavo');
  slot.append(helpButton);

  const dialog = el('dialog', 'br-product-dialog');
  dialog.id = `${prefix}-dialog`;
  helpButton.setAttribute('aria-controls', dialog.id);
  const header = el('header', 'br-product-header');
  const title = el('h2', 'br-product-title');
  title.id = `${prefix}-title`;
  title.tabIndex = -1;
  dialog.setAttribute('aria-labelledby', title.id);
  const closeButton = button('Cerrar', () => dialog.close(), 'quiet');
  closeButton.setAttribute('aria-label', 'Cerrar la ayuda');
  header.append(title, closeButton);
  const notice = el('p', 'br-product-notice');
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');
  notice.hidden = true;
  const error = el('p', 'br-product-notice br-product-notice--error');
  error.setAttribute('role', 'alert');
  error.id = `${prefix}-error`;
  error.hidden = true;
  const content = el('div', 'br-product-content');
  dialog.append(header, notice, error, content);
  document.body.append(dialog);

  function clearNotice() {
    notice.textContent = '';
    error.textContent = '';
    notice.hidden = true;
    error.hidden = true;
  }

  function announce(text, isError = false) {
    clearNotice();
    const target = isError ? error : notice;
    target.textContent = text;
    target.hidden = false;
  }

  function canFocus(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected || node.disabled || node.closest('[hidden]')) return false;
    const owner = node.closest('dialog');
    return !owner || owner.open;
  }

  function anotherDialogOpen() {
    return Array.from(document.querySelectorAll('dialog[open]')).some(node => node !== dialog);
  }

  function markWelcomeSeen() {
    welcomeSeenThisSession = true;
    try { window.localStorage.setItem(WELCOME_KEY, 'seen'); } catch { /* Learning does not require storage for onboarding. */ }
  }

  function wasWelcomeSeen() {
    if (welcomeSeenThisSession) return true;
    try { return window.localStorage.getItem(WELCOME_KEY) === 'seen'; } catch { return false; }
  }

  function onClose() {
    const action = pendingAction;
    pendingAction = null;
    if (section === 'report') content.replaceChildren();
    if (disposed) return;
    if (action) {
      // The first dialog has left the top layer before account UI is opened.
      Promise.resolve().then(action).catch(() => {
        if (!disposed && open('help')) announce('No se pudo abrir la cuenta. Vuelve a intentarlo desde el botón Cuenta.', true);
      });
    } else {
      const owner = opener instanceof HTMLElement ? opener.closest('dialog') : null;
      if (canFocus(opener) && (owner?.open || !anotherDialogOpen())) {
        opener.focus({ preventScroll: true });
      } else if (!anotherDialogOpen() && canFocus(helpButton)) {
        helpButton.focus({ preventScroll: true });
      }
    }
  }

  function onCancel(event) {
    event.preventDefault();
    dialog.close();
  }
  dialog.addEventListener('close', onClose);
  dialog.addEventListener('cancel', onCancel);

  function handOff(callback) {
    if (typeof callback !== 'function') {
      announce('Esta opción todavía no está disponible. Puedes acceder desde el botón Cuenta.', true);
      return;
    }
    pendingAction = callback;
    dialog.close();
  }

  async function copyText(value, { fallback, address = false } = {}) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (!disposed) announce(address ? 'Dirección copiada. Puedes pegarla en tu aplicación de correo.' : 'Texto copiado. Puedes pegarlo en tu aplicación de correo.');
    } catch {
      if (disposed) return;
      if (fallback?.isConnected) {
        fallback.focus();
        fallback.select();
        announce('No se pudo copiar automáticamente. El texto está seleccionado: utiliza la opción Copiar de tu dispositivo.', true);
      } else {
        // Do not reveal the email address as a visible clipboard fallback.
        announce('No se pudo copiar la dirección. Utiliza el botón para abrir tu aplicación de correo.', true);
      }
    }
  }

  function backToHelp() {
    return button('Volver a Ayuda', () => show('help'), 'quiet');
  }

  function actionGrid(items) {
    const grid = el('div', 'br-product-actions');
    items.forEach(([label, action, variant]) => grid.append(button(label, action, variant)));
    return grid;
  }

  function renderHelp() {
    title.textContent = 'Estamos para ayudarte';
    content.append(paragraph('Encuentra una respuesta, revisa tu cuenta o cuéntanos qué ha ocurrido.'));
    content.append(actionGrid([
      ['Mi cuenta y mi progreso', () => handOff(onOpenAccount)],
      ['Informar de un problema', () => {if(!onReport?.())show('report');}],
      ['Contactar', () => show('contact')],
      ['Ver la bienvenida', () => show('welcome')],
    ]));
    const heading = el('h3', 'br-product-subtitle', 'Preguntas frecuentes');
    const faq = el('div', 'br-product-faq');
    const answers = [
      ['¿Necesito una cuenta para empezar?', 'Sí. Crea una cuenta o inicia sesión para entrar en Ochavo. Confirma tu correo para guardar y sincronizar tu aprendizaje. Ayuda, Privacidad y Aviso legal se pueden consultar antes de entrar.'],
      ['¿Cómo sé si mi progreso está guardado?', 'Mira el mensaje de guardado en la cabecera. «Guardado en este dispositivo» se refiere a la copia local; «Progreso sincronizado» confirma el guardado en tu cuenta. Si hay un error, conserva los datos del navegador y prueba a sincronizar desde Cuenta.'],
      ['No recibo el correo de verificación', 'Comprueba que escribiste bien tu correo y revisa la carpeta de spam. En Cuenta puedes reenviar el mensaje. Después de abrir su enlace, vuelve a Ochavo y pulsa «Ya he verificado mi correo».'],
      ['¿Puedo continuar sin conexión?', 'Necesitas conexión para entrar en tu cuenta, confirmar respuestas del recorrido, entregar exámenes, registrar la visita diaria o gastar gemas. Si tu sesión sigue abierta, puedes consultar las explicaciones disponibles en el dispositivo sin conexión. Los casos de estudio necesitan Plus activo y conexión para comprobar el acceso; tus borradores guardados se conservan. En la web, abrir o recargar la página puede necesitar internet.'],
      ['¿Cómo funcionan las vidas y las gemas?', 'Los errores en las lecciones consumen una vida. En un examen se descuentan al entregar, sin bajar de cero. Las cinco vidas gratuitas se renuevan cada día sin coste; también puedes gastar 20 gemas para recuperar hasta cinco. Las gemas se ganan en Ochavo: no se compran con dinero ni se transfieren, y no se utilizan para abrir nuevos casos. Cada cuenta nueva empieza con 200 gemas; también puedes usarlas para saltar un mundo por 200, sin aprobar su examen ni obtener sus recompensas. Pulsa sus indicadores para ver las reglas.'],
      ['¿Qué cuenta para la racha?', 'Entrar en días consecutivos, según la hora de España peninsular. Con una cuenta verificada, la visita debe confirmarse con conexión. Si falta un día, la siguiente visita inicia otra racha. Puedes consultar la actual y la mejor desde Perfil.'],
      ['¿Cómo funcionan los exámenes y los casos?', 'Cada bloque de diez lecciones termina con un examen de diez preguntas. Necesitas ocho aciertos para superarlo y vidas disponibles para entregarlo, salvo que tengas el beneficio de vidas ilimitadas activo. Los casos permiten practicar sin gastar vidas. La app indica cuáles tienes disponibles; Ochavo Plus está previsto para acceder a todos mientras esté activa la suscripción.'],
      ['¿Qué es Ochavo Plus?', 'Está prevista una suscripción renovable de 9,99 € al mes, con vidas ilimitadas y acceso a todos los casos mientras esté activa. Las compras todavía no están disponibles: faltan la configuración y validación de los pagos. Antes de confirmar una compra verás el precio, la moneda y la renovación aplicables, en el pago web o en tu tienda de aplicaciones.'],
      ['¿Puedo comprar cinco vidas?', 'Está previsto un paquete de 5 vidas de compra única; todavía no está disponible. Su precio será el que muestre el formulario de pago o la tienda antes de confirmar. Las vidas compradas se gastan al utilizarlas y no desaparecen al renovarse las vidas gratuitas. No repitas la compra si hay una confirmación pendiente.'],
      ['¿Cómo se restauran o cancelan las compras?', 'Cuando se habiliten, entra en la misma cuenta de Ochavo, con correo verificado y conexión, y usa Restaurar compras con la cuenta de Apple o Google que corresponda. Restaurar no repone vidas ya consumidas. Para compras web, usa Comprobar compras con la misma cuenta; puedes gestionar o cancelar desde Ochavo Plus o el enlace de los correos de compra. Las suscripciones de Apple y Google se gestionan en su tienda. Eliminar la cuenta o desinstalar Ochavo no cancela esa suscripción.'],
      ['¿Hay anuncios?', 'No hay anuncios comerciales activos en esta versión. Cualquier ensayo se limitará a anuncios identificados como pruebas; la publicidad real no está habilitada.'],
      ['¿Qué ve la persona que me invita?', 'Ve el número de invitaciones válidas y sus recompensas, no tu nombre, correo ni respuestas. El código debe vincularse antes de completar la primera lección. Compartirlo no genera una recompensa por sí solo: la persona invitada debe confirmar su cuenta y completar esa lección.'],
      ['Una operación ha quedado pendiente', 'Conserva los datos de la app y reintenta cuando tengas conexión. Ochavo conserva el mismo intento para comprobar si ya se había confirmado, sin aplicar dos veces su efecto. Espera esa confirmación antes de iniciar otra operación con gemas.'],
      ['¿Cómo elimino mi cuenta?', 'Desde Cuenta, escribe tu contraseña y confirma el borrado. Se eliminan la cuenta, su progreso y sus datos de vidas, gemas, rachas, logros e invitaciones según el alcance explicado en «Privacidad y borrado». Si tienes una suscripción, eliminar la cuenta no cancela su renovación: gestiona la de Apple o Google en su tienda, y la de la web desde Ochavo Plus o el enlace de los correos de compra.'],
    ];
    answers.forEach(([question, answer]) => {
      const details = el('details', 'br-product-question');
      details.append(el('summary', '', question), paragraph(answer));
      faq.append(details);
    });
    content.append(heading, faq);
    const links = el('div', 'br-product-links');
    links.append(
      button('Privacidad', () => show('privacy'), 'link'),
      button('Empresa y aviso legal', () => show('legal'), 'link'),
      button('Privacidad y borrado', () => show('delete'), 'link'),
    );
    content.append(links);
  }

  const welcomePages = [
    {
      title: 'Elige por dónde empezar',
      body: 'Acciones, ETFs y Cripto tienen su propio camino. Cada uno empieza desde cero, explica las ideas antes de ponerlas en práctica y conserva su avance cuando cambias a otro.',
      note: 'Los ejemplos combinan simulaciones y casos históricos documentados; sirven para aprender, no para recomendar inversiones.',
      visual: ['Una idea', 'Un ejemplo', 'Tu criterio'],
    },
    {
      title: 'Lee, prueba y comprueba',
      body: 'Cada camino combina explicaciones, escenarios visuales, cálculos, decisiones y ejercicios para relacionar ideas. Cada respuesta tiene una explicación; equivocarte también te ayuda a saber qué repasar.',
      note: 'Cada diez lecciones hay un examen. Se supera con ocho aciertos de diez. Los casos de Plus permiten practicar sin gastar vidas; requieren conexión para comprobar el acceso.',
      visual: ['Comprender', 'Practicar', 'Repasar'],
    },
    {
      title: 'Tu avance, paso a paso',
      body: 'Crea una cuenta o inicia sesión para aprender en Ochavo. Confirma tu correo para guardar y sincronizar el progreso. El mensaje de la cabecera te indica dónde se ha guardado.',
      note: 'Con una cuenta verificada, conecta para confirmar respuestas y usar vidas o gemas. La ayuda y la cuenta están en la cabecera.',
      visual: ['Aprender', 'Guardar', 'Retomar'],
    },
  ];

  function renderWelcome() {
    title.textContent = 'Bienvenido a Ochavo';
    const data = welcomePages[welcomeStep];
    const steps = el('ol', 'br-product-welcome-steps');
    steps.setAttribute('aria-label', 'Pasos de la bienvenida');
    welcomePages.forEach((_, index) => {
      const item = el('li', '', String(index + 1));
      item.setAttribute('aria-label', `Paso ${index + 1} de 3`);
      if (index === welcomeStep) item.setAttribute('aria-current', 'step');
      steps.append(item);
    });
    const card = el('section', 'br-product-welcome-card');
    card.append(el('h3', '', data.title), paragraph(data.body));
    const visual = el('div', 'br-product-welcome-visual');
    visual.setAttribute('aria-hidden', 'true');
    data.visual.forEach(word => visual.append(el('span', '', word)));
    card.append(visual, paragraph(data.note, 'br-product-small'));
    const actions = el('div', 'br-product-welcome-actions');
    actions.append(button('Saltar', () => dialog.close(), 'quiet'));
    if (welcomeStep > 0) actions.append(button('Atrás', () => { welcomeStep--; render(); }, 'quiet'));
    actions.append(button(welcomeStep === 2 ? 'Empezar' : 'Continuar', () => {
      if (welcomeStep === 2) dialog.close();
      else { welcomeStep++; render(); }
    }, 'primary'));
    content.append(steps, card, actions);
  }

  function contactButtons(recipient, subject) {
    const actions = el('div', 'br-product-actions');
    const address = supportAddress(recipient);
    if (address) {
      const send = el('a', 'br-product-button br-product-button--primary', 'Enviar correo');
      send.href = `mailto:${encodeURIComponent(address)}?subject=${encodeURIComponent(subject)}`;
      actions.append(send, button('Copiar dirección', () => copyText(address, { address: true })));
    } else {
      actions.append(paragraph('El canal de correo está pendiente de confirmar.', 'br-product-small'));
    }
    return actions;
  }

  function renderContact() {
    title.textContent = 'Contacta con Ochavo';
    content.append(
      paragraph('Para dudas sobre la app o para hacernos una sugerencia, prepara un correo. Se abrirá tu aplicación de correo y podrás revisarlo antes de enviarlo.'),
      contactButtons(BUSINESS.supportEmail, 'Consulta sobre Ochavo'),
      paragraph('Si no se abre tu aplicación de correo, puedes copiar la dirección y pegarla en el servicio que utilices.', 'br-product-small'),
    );
    const company = el('section', 'br-product-card');
    company.append(
      el('h3', 'br-product-subtitle', 'Quién está detrás de Ochavo'),
      paragraph(BUSINESS.name),
      paragraph(`NIF: ${BUSINESS.taxId}`, 'br-product-small'),
      paragraph(BUSINESS.address, 'br-product-small'),
      button('Ver el aviso legal', () => show('legal'), 'link'),
    );
    content.append(company, backToHelp());
  }

  function renderReport() {
    title.textContent = 'Comunicar un error';
    content.append(paragraph('Describe qué intentabas hacer y qué ocurrió. No incluyas contraseñas, tu correo, datos personales ni información de acceso.'));
    const form = el('form', 'br-product-form');
    form.noValidate = true;
    const categoryLabel = el('label', 'br-product-label', '¿Dónde está el problema?');
    const category = el('select', 'br-product-input');
    category.id = `${prefix}-category`;
    categoryLabel.htmlFor = category.id;
    Object.entries(CATEGORIES).forEach(([value, label]) => {
      const option = el('option', '', label);
      option.value = value;
      category.append(option);
    });
    const textLabel = el('label', 'br-product-label', 'Cuéntanos qué ha ocurrido');
    const text = el('textarea', 'br-product-input br-product-textarea');
    text.id = `${prefix}-report-text`;
    textLabel.htmlFor = text.id;
    text.required = true;
    text.minLength = 10;
    text.maxLength = 2000;
    text.rows = 5;
    text.setAttribute('aria-describedby', `${prefix}-report-hint ${error.id}`);
    const hint = paragraph('Entre 10 y 2.000 caracteres. Si ocurre en una lección, puedes indicar su número y el paso.', 'br-product-small');
    hint.id = `${prefix}-report-hint`;
    const consentLabel = el('label', 'br-product-consent');
    const consent = el('input', 'br-product-checkbox');
    consent.type = 'checkbox';
    consent.id = `${prefix}-include-context`;
    consentLabel.htmlFor = consent.id;
    consentLabel.append(consent, el('span', '', 'Añadir la versión de Ochavo y la plataforma que utilizo.'));
    const consentHelp = paragraph('Es opcional. No se añaden tu correo, identificadores de cuenta ni datos de acceso.', 'br-product-small');
    const prepare = button('Preparar borrador', null, 'primary');
    prepare.type = 'submit';
    form.append(categoryLabel, category, textLabel, text, hint, consentLabel, consentHelp, prepare);
    const preview = el('section', 'br-product-card br-product-draft');
    preview.hidden = true;
    const previewLabel = el('label', 'br-product-label', 'Revisa el texto del borrador');
    const draftText = el('textarea', 'br-product-input br-product-textarea');
    draftText.id = `${prefix}-draft`;
    draftText.readOnly = true;
    draftText.rows = 7;
    previewLabel.htmlFor = draftText.id;
    const previewActions = el('div', 'br-product-actions');
    preview.append(previewLabel, draftText,
      paragraph('Ochavo no envía este reporte. Abre tu correo, revisa el borrador y decide si quieres enviarlo.', 'br-product-small'),
      previewActions,
      paragraph('Si no se abre el correo, copia el texto y la dirección para preparar el mensaje manualmente.', 'br-product-small'));
    const resetDraft = () => {
      preview.hidden = true;
      previewActions.replaceChildren();
      draftText.value = '';
      text.removeAttribute('aria-invalid');
      clearNotice();
    };
    text.addEventListener('input', resetDraft);
    category.addEventListener('change', resetDraft);
    consent.addEventListener('change', resetDraft);
    form.addEventListener('submit', event => {
      event.preventDefault();
      clearNotice();
      const description = sanitizeReportText(text.value);
      if (description.length < 10) {
        text.setAttribute('aria-invalid', 'true');
        announce('Describe el problema con al menos 10 caracteres para poder entender qué ocurrió.', true);
        text.focus();
        return;
      }
      let context = {};
      if (consent.checked && typeof getContext === 'function') {
        try { context = getContext() || {}; } catch { /* Optional diagnostics must not block a report. */ }
      }
      const draft = buildSupportDraft({ category: category.value, text: description, includeContext: consent.checked,
        context: { appVersion: context.appVersion ?? context.version ?? BUSINESS.appVersion, platform: context.platform },
        email: BUSINESS.supportEmail });
      draftText.value = `Asunto: ${draft.subject}\n\n${draft.body}`;
      previewActions.replaceChildren();
      if (draft.mailto) {
        const openMail = el('a', 'br-product-button br-product-button--primary', 'Abrir mi correo');
        openMail.href = draft.mailto;
        previewActions.append(openMail);
      }
      previewActions.append(button('Copiar texto', () => copyText(draftText.value, { fallback: draftText })));
      const address = supportAddress(BUSINESS.supportEmail);
      if (address) previewActions.append(button('Copiar dirección', () => copyText(address, { address: true })));
      preview.hidden = false;
      draftText.focus();
      announce(address ? 'Borrador preparado. Todavía no se ha enviado ningún mensaje.' : 'Borrador preparado. El canal de correo está pendiente; puedes copiar y conservar el texto.');
    });
    content.append(form, preview, backToHelp());
  }

  function renderLegal(kind) {
    title.textContent = { privacy: 'Tu privacidad', legal: 'Empresa y aviso legal', delete: 'Privacidad y borrado' }[kind];
    const wrapper = el('div', 'br-product-legal');
    // This local renderer is a trusted, reviewed module, never user or server HTML.
    wrapper.innerHTML = renderLegalContent(kind);
    wrapper.addEventListener('click', event => {
      const anchor = event.target.closest('a[href]');
      if (!anchor) return;
      try {
        const url = new URL(anchor.href, BUSINESS.siteUrl);
        if (url.origin === new URL(BUSINESS.siteUrl).origin && url.searchParams.get('cuenta') === 'eliminar') {
          event.preventDefault();
          handOff(onDeleteAccount);
        } else if (url.origin === new URL(BUSINESS.siteUrl).origin) {
          const route = url.pathname.replace(/\/+$/, '') || '/';
          const sections = { '/privacidad': 'privacy', '/aviso-legal': 'legal', '/eliminar-cuenta': 'delete', '/ayuda': 'help' };
          if (Object.hasOwn(sections, route)) {
            event.preventDefault();
            show(sections[route]);
          } else if (route === '/') {
            event.preventDefault();
            dialog.close();
          }
        }
      } catch { /* Ordinary legal links use their original behavior. */ }
    });
    content.append(wrapper);
    if (kind === 'delete' && !wrapper.querySelector('a[href*="cuenta=eliminar"]')) {
      content.append(button('Ir a eliminar mi cuenta', () => handOff(onDeleteAccount)));
    }
    content.append(backToHelp());
  }

  function render() {
    clearNotice();
    content.replaceChildren();
    dialog.dataset.section = section;
    if (section === 'welcome') renderWelcome();
    else if (section === 'report') renderReport();
    else if (section === 'contact') renderContact();
    else if (['privacy', 'legal', 'delete'].includes(section)) renderLegal(section);
    else renderHelp();
    dialog.scrollTop = 0;
    if (dialog.open) title.focus({ preventScroll: true });
  }

  function show(next) {
    section = ['help', 'welcome', 'report', 'contact', 'privacy', 'legal', 'delete'].includes(next) ? next : 'help';
    if (section === 'welcome') welcomeStep = 0;
    render();
    if (section === 'welcome' && dialog.open) markWelcomeSeen();
  }

  function open(next = 'help') {
    if (disposed) return false;
    if(next==='report'&&onReport?.())return true;
    if (!dialog.open) opener = document.activeElement;
    show(next);
    if (!dialog.open) dialog.showModal();
    if (section === 'welcome') markWelcomeSeen();
    title.focus({ preventScroll: true });
    return true;
  }

  function maybeWelcome() {
    if (claimWelcome) {
      const owner = getWelcomeOwner?.();
      if (!owner || disposed || dialog.open || anotherDialogOpen()) return false;
      if (welcomeOwner === owner) { welcomeOwner = null; return open('welcome'); }
      if (welcomeRequest) return false;
      welcomeRequest = Promise.resolve().then(() => claimWelcome(owner)).then(first => {
        if (!first || disposed || getWelcomeOwner?.() !== owner) return false;
        welcomeOwner = owner;
        if (dialog.open || anotherDialogOpen()) return false;
        welcomeOwner = null;
        return open('welcome');
      }).catch(() => false).finally(() => { welcomeRequest = null; });
      return welcomeRequest;
    }
    if (disposed || dialog.open || anotherDialogOpen() || wasWelcomeSeen()) return false;
    return open('welcome');
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pendingAction = null;
    dialog.removeEventListener('close', onClose);
    dialog.removeEventListener('cancel', onCancel);
    if (dialog.open) dialog.close();
    dialog.remove();
    helpButton.remove();
  }

  return { open, maybeWelcome, dispose };
}
