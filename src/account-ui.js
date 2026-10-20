/**
 * Account presentation only. Authentication, persistence and conflict handling
 * belong to the supplied callbacks and to update(view).
 *
 * onSignup({ displayName, email, password }), onLogin({ email, password }),
 * onReset(email), onDeleteAccount(password); the other callbacks take no args.
 * Callbacks may resolve to { message } and should throw for unsuccessful actions.
 * update({accessRequired, authLoading}) coordinates the exterior access screen.
 * open('signup'|'login'|'reset') chooses an auth form; closing returns to that
 * exterior screen. A true-to-false accessRequired transition closes this dialog
 * after pending account work; it does not affect later voluntary account visits.
 * Load account.css alongside this module.
 */
import {BUSINESS} from './business.js';
import {NEWSLETTER_LABEL} from './communication-preferences.js';
import {PASSWORD_POLICY, PASSWORD_REQUIREMENTS_TEXT, inspectPassword, passwordRequirementMessage} from './password-policy.js';
let accountInstance = 0;

export function mountAccountUI(callbacks = {}) {
  const accountSlot = document.getElementById("br-account-slot");
  const syncSlot = document.getElementById("br-sync-slot");
  if (!accountSlot || !syncSlot) {
    throw new Error("Account UI requires #br-account-slot and #br-sync-slot.");
  }

  const prefix = `br-account-${++accountInstance}`;
  let view = {
    ready: false,
    configured: false,
    authLoading: false,
    accessRequired: false,
    user: null,
    status: "",
    statusText: "",
    busy: false,
  };
  let mode = "signup";
  let localBusy = false;
  let visibleScreen = "";
  let deletionRequested = false;
  let gateReleasePending = false;
  const rules = [];
  const passwordFields = [];
  const passwordChecklists = [];
  const dialogs = [];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const string = (value) => (typeof value === "string" ? value : "");
  const locked = () => localBusy || Boolean(view.busy);
  const available = (name) => typeof callbacks[name] === "function";
  const canUseAccount = () => view.ready && view.configured && !view.authLoading;
  const control = (node, disabledWhen = locked) => {
    rules.push({ node, disabledWhen });
    return node;
  };
  const button = (text, variant = "secondary") => {
    const node = el("button", `br-account-button br-account-button--${variant}`, text);
    node.type = "button";
    return node;
  };

  function messageBox(container, suffix) {
    const error = el("p", "br-account-notice br-account-notice--error");
    error.id = `${prefix}-${suffix}-error`;
    error.setAttribute("role", "alert");
    error.setAttribute("aria-atomic", "true");
    error.hidden = true;
    const status = el("p", "br-account-notice br-account-notice--status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.setAttribute("aria-atomic", "true");
    status.hidden = true;
    container.append(error, status);
    return { error, status };
  }

  function clearMessage(box) {
    box.error.textContent = "";
    box.status.textContent = "";
    box.error.hidden = true;
    box.status.hidden = true;
  }

  function showMessage(box, text, isError = false) {
    clearMessage(box);
    if (!text) return;
    const node = isError ? box.error : box.status;
    node.hidden = false;
    // Handler messages and user data are always rendered as text.
    node.textContent = string(text);
  }

  function canFocus(node) {
    if (!(node instanceof HTMLElement) || !node.isConnected || node.disabled) return false;
    if (node.closest("[hidden]")) return false;
    const parentDialog = node.closest("dialog");
    return !parentDialog || parentDialog.open;
  }

  function makeDialog(suffix, heading) {
    const dialog = el("dialog", "br-account-dialog");
    dialog.id = `${prefix}-${suffix}`;
    dialog.setAttribute("aria-labelledby", `${dialog.id}-title`);
    const header = el("header", "br-account-dialog-header");
    const title = el("h2", "br-account-title", heading);
    title.id = `${dialog.id}-title`;
    title.tabIndex = -1;
    const close = button("Cerrar", "quiet");
    close.classList.add("br-account-close");
    close.setAttribute("aria-label", "Cerrar esta ventana");
    control(close);
    close.addEventListener("click", () => { if (!locked()) dialog.close(); });
    header.append(title, close);
    dialog.append(header);
    let opener = null;

    // showModal supplies the native focus trap and makes the page behind inert.
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (!locked()) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.querySelectorAll('input[type="password"], input[data-password]').forEach((input) => {
        input.value = "";
        input.type = "password";
        input.removeAttribute("aria-invalid");
      });
      dialog.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
        toggle.textContent = "Mostrar";
        toggle.setAttribute("aria-pressed", "false");
        toggle.setAttribute("aria-label", "Mostrar " + toggle.dataset.passwordLabel);
      });
      passwordChecklists.forEach(refresh => refresh());
      if (canFocus(opener)) opener.focus({ preventScroll: true });
      else if (canFocus(accountButton)) accountButton.focus({ preventScroll: true });
    });
    document.body.append(dialog);
    const record = {
      dialog,
      title,
      open(focusTarget = title) {
        if (dialog.open) return;
        opener = document.activeElement;
        dialog.showModal();
        requestAnimationFrame(() => {
          if (dialog.open && canFocus(focusTarget)) focusTarget.focus({ preventScroll: true });
        });
      },
    };
    dialogs.push(record);
    return record;
  }

  function field(form, { suffix, label, type = "text", autocomplete, required = true, hint, minLength = 0, passwordLabel = "contraseña" }) {
    const group = el("div", "br-account-field");
    const inputId = `${prefix}-${suffix}`;
    const labelNode = el("label", "br-account-label", label);
    labelNode.htmlFor = inputId;
    const input = el("input", "br-account-input");
    input.id = inputId;
    input.name = suffix;
    input.type = type;
    input.required = required;
    if (autocomplete) input.autocomplete = autocomplete;
    if (type === "email") {
      input.inputMode = "email";
      input.autocapitalize = "none";
      input.spellcheck = false;
    }
    group.append(labelNode);
    if (type === "password") {
      input.minLength = minLength;
      input.dataset.password = "true";
      const row = el("div", "br-account-password-row");
      const toggle = button("Mostrar", "quiet");
      toggle.dataset.passwordToggle = "true";
      toggle.dataset.passwordLabel = passwordLabel;
      toggle.setAttribute("aria-label", "Mostrar " + passwordLabel);
      toggle.setAttribute("aria-controls", inputId);
      toggle.setAttribute("aria-pressed", "false");
      toggle.addEventListener("click", () => {
        const reveal = input.type === "password";
        input.type = reveal ? "text" : "password";
        toggle.textContent = reveal ? "Ocultar" : "Mostrar";
        toggle.setAttribute("aria-pressed", String(reveal));
        toggle.setAttribute("aria-label", (reveal ? "Ocultar " : "Mostrar ") + passwordLabel);
      });
      control(toggle);
      row.append(input, toggle);
      group.append(row);
      passwordFields.push({ input, toggle });
    } else {
      group.append(input);
    }
    if (hint) {
      const helper = el("p", "br-account-help", hint);
      helper.id = `${inputId}-help`;
      input.setAttribute("aria-describedby", helper.id);
      group.append(helper);
    }
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    control(input, () => locked() || !canUseAccount());
    form.append(group);
    return input;
  }

  function clearPasswords() {
    passwordFields.forEach(({ input, toggle }) => {
      input.value = "";
      input.type = "password";
      input.removeAttribute("aria-invalid");
      toggle.textContent = "Mostrar";
      toggle.setAttribute("aria-pressed", "false");
      toggle.setAttribute("aria-label", "Mostrar " + toggle.dataset.passwordLabel);
    });
    passwordChecklists.forEach(refresh => refresh());
  }

  function passwordChecklist(input) {
    input.dataset.signupPassword = 'true';
    input.maxLength = PASSWORD_POLICY.maxLength;
    input.autocapitalize = 'none';
    input.spellcheck = false;
    const list = el('ul', 'br-account-password-checklist');
    list.id = `${input.id}-requirements`;
    list.setAttribute('aria-label', 'Requisitos de la contraseña');
    const entries = inspectPassword('').checks.map(check => {
      const item = el('li', 'br-account-password-check');
      item.dataset.requirement = check.id;
      const marker = el('span', 'br-account-password-marker');
      marker.setAttribute('aria-hidden', 'true');
      const label = el('span', '', check.label);
      const status = el('span', 'br-account-visually-hidden');
      item.append(marker, label, status);
      list.append(item);
      return {item, marker, status};
    });
    const summary = el('p', 'br-account-help br-account-password-summary');
    summary.id = `${input.id}-summary`;
    summary.setAttribute('role', 'status');
    summary.setAttribute('aria-live', 'polite');
    summary.setAttribute('aria-atomic', 'true');
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), list.id].filter(Boolean).join(' '));
    const group = input.parentElement.parentElement;
    group.append(list, summary);
    function refresh() {
      const result = inspectPassword(input.value);
      result.checks.forEach((check, index) => {
        const {item, marker, status} = entries[index];
        item.dataset.met = String(check.met);
        item.hidden = check.id === 'maxLength' && check.met;
        marker.textContent = check.met ? '✓' : '○';
        status.textContent = check.met ? ': cumplido' : ': pendiente';
      });
      summary.textContent = result.valid ? 'Cumple todos los requisitos.' : input.value ? 'Completa los requisitos pendientes.' : 'Puedes pegar una contraseña de tu gestor de contraseñas.';
    }
    input.addEventListener('input', refresh);
    input.addEventListener('change', refresh);
    passwordChecklists.push(refresh);
    refresh();
    return refresh;
  }

  function validate(form, box) {
    form.querySelectorAll("[aria-invalid]").forEach((input) => input.removeAttribute("aria-invalid"));
    const invalid = Array.from(form.querySelectorAll("input")).find((input) =>
      !input.checkValidity() || (input.dataset.password && input.value.length < input.minLength) || (input.dataset.signupPassword && !inspectPassword(input.value).valid),
    );
    if (!invalid) return true;
    let text = "Revisa el campo indicado antes de continuar.";
    if (invalid.type === "email") text = "Escribe una dirección de correo válida.";
    else if (invalid.dataset.signupPassword) text = passwordRequirementMessage(invalid.value);
    else if (invalid.dataset.passwordConfirmation) text = "Vuelve a escribir tu contraseña para confirmarla.";
    else if (invalid.dataset.password) text = "Escribe la contraseña actual de tu cuenta.";
    else if (invalid.type === "checkbox") text = "Confirma que quieres eliminar la cuenta y su progreso guardado.";
    invalid.setAttribute("aria-invalid", "true");
    showMessage(box, text, true);
    invalid.focus();
    return false;
  }

  async function run(name, args, box, onSuccess) {
    if (locked()) return;
    const allowed = name === 'onLogout' ? Boolean(view.user) : canUseAccount();
    if (!allowed || !available(name) || (name === 'onRetrySync' && !view.user)) {
      showMessage(box, "No se puede completar esta acción ahora. Reintenta cuando se recupere el acceso o consulta Ayuda.", true);
      return;
    }
    localBusy = true;
    showMessage(box, "Un momento…");
    render();
    try {
      const result = await callbacks[name](...args);
      if (onSuccess) onSuccess();
      showMessage(box, string(result?.message));
    } catch (error) {
      showMessage(box, string(error?.message) || "No hemos podido completar la solicitud. Vuelve a intentarlo.", true);
    } finally {
      localBusy = false;
      render();
    }
  }

  const accountButton = button("Cuenta", "account");
  accountButton.setAttribute("aria-haspopup", "dialog");
  accountButton.setAttribute("aria-label", "Abrir la cuenta de Ochavo");
  accountSlot.replaceChildren(accountButton);

  const syncRow = el("div", "br-account-sync");
  const syncText = el("p", "br-account-sync-text");
  syncText.setAttribute("role", "status");
  syncText.setAttribute("aria-live", "polite");
  syncText.setAttribute("aria-atomic", "true");
  const syncRetry = button("Reintentar", "quiet");
  syncRetry.setAttribute("aria-label", "Reintentar la sincronización del progreso");
  const syncLogout = button("Cerrar sesión", "quiet");
  const syncActions = el("div", "br-account-sync-actions");
  syncActions.append(syncRetry, syncLogout);
  syncRow.append(syncText, syncActions);
  syncSlot.replaceChildren(syncRow);

  const mainModal = makeDialog("main", "Tu cuenta de Ochavo");
  accountButton.setAttribute("aria-controls", mainModal.dialog.id);
  const testNotice = el("p", "br-account-notice br-account-notice--status", "Modo de prueba: estas cuentas son simuladas y no se envían correos reales.");
  testNotice.hidden = true;
  mainModal.dialog.append(testNotice);
  const notices = messageBox(mainModal.dialog, "main");
  const deletionRequestNote = el("p", "br-account-notice br-account-notice--status", "Para eliminar tu cuenta, inicia sesión. Después podrás revisar qué se borra y confirmar con tu contraseña. Entrar no elimina nada.");
  deletionRequestNote.hidden = true;
  mainModal.dialog.append(deletionRequestNote);
  mainModal.dialog.addEventListener('close', () => { deletionRequested = false; });

  function informationButton(label, section) {
    const link = button(label, 'quiet');
    control(link);
    link.addEventListener('click', () => callbacks.onOpenInfo?.(section));
    return link;
  }

  const waiting = el("section", "br-account-section");
  waiting.append(el("p", "br-account-description", "Estamos preparando el acceso a tu cuenta y recuperando tu progreso."));

  const unavailable = el("section", "br-account-section");
  unavailable.append(
    el("p", "br-account-description", "No se puede acceder al servicio de cuentas en este momento."),
    el("p", "br-account-help", "Necesitas una cuenta para entrar en Ochavo. Reintenta más tarde o contacta desde Ayuda."),
  );

  const auth = el("section", "br-account-section");
  auth.append(el("p", "br-account-description", "Crea una cuenta o inicia sesión para aprender y guardar tu progreso en Ochavo."));
  const tabs = el("div", "br-account-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Acceso a tu cuenta");
  auth.append(tabs);
  const authForms = {};
  const modeLabels = { signup: "Registro", login: "Acceso", reset: "Recuperar" };
  const modeNames = Object.keys(modeLabels);

  modeNames.forEach((name) => {
    const tab = el("button", "br-account-tab", modeLabels[name]);
    tab.type = "button";
    tab.id = `${prefix}-tab-${name}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", `${prefix}-panel-${name}`);
    control(tab, locked);
    tabs.append(tab);
    const panel = el("section", "br-account-panel");
    panel.id = `${prefix}-panel-${name}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    const form = el("form", "br-account-form");
    form.noValidate = true;
    const fields = {};
    if (name === "signup") {
      const privacyNotice = el('div', 'br-account-privacy');
      privacyNotice.append(el('p', 'br-account-help', `${BUSINESS.name} usará tus datos para crear tu cuenta y guardar tu aprendizaje, vidas, gemas y logros. El nombre es opcional. Puedes consultar cómo se tratan tus datos y ejercer tus derechos.`), informationButton('Consultar privacidad', 'privacy'));
      form.append(privacyNotice);
      fields.displayName = field(form, { suffix: "signup-name", label: "Nombre (opcional)", autocomplete: "nickname", required: false });
      fields.displayName.maxLength = 80;
    }
    fields.email = field(form, { suffix: `${name}-email`, label: "Correo electrónico", type: "email", autocomplete: "email" });
    if (name !== "reset") {
      fields.password = field(form, {
        suffix: `${name}-password`, label: "Contraseña", type: "password",
        autocomplete: name === "signup" ? "new-password" : "current-password",
        minLength: name === "signup" ? PASSWORD_POLICY.minLength : 0,
        hint: name === "signup" ? "Elige una contraseña larga y exclusiva para Ochavo." : "Escribe la contraseña actual de tu cuenta.",
      });
      if (name === 'signup') {
        fields.refreshPassword = passwordChecklist(fields.password);
        fields.passwordConfirmation = field(form, {
          suffix: 'signup-password-confirmation', label: 'Confirmar contraseña', type: 'password',
          autocomplete: 'new-password', passwordLabel: 'confirmación de contraseña',
          hint: 'Vuelve a escribir la misma contraseña.',
        });
        fields.passwordConfirmation.dataset.passwordConfirmation = 'true';
        fields.passwordConfirmation.maxLength = PASSWORD_POLICY.maxLength;
        fields.passwordConfirmation.autocapitalize = 'none';
        fields.passwordConfirmation.spellcheck = false;
        fields.password.addEventListener('input', () => fields.passwordConfirmation.removeAttribute('aria-invalid'));
      }
    } else {
      form.append(el("p", "br-account-help", `Solicita un correo para elegir una contraseña nueva. ${PASSWORD_REQUIREMENTS_TEXT}`));
    }
    if(name==='signup'){
      const label=el('label','br-newsletter-consent');
      fields.newsletter=el('input');fields.newsletter.id=`${prefix}-signup-newsletter`;fields.newsletter.type='checkbox';fields.newsletter.name='newsletter';fields.newsletter.checked=false;
      control(fields.newsletter,()=>locked()||!canUseAccount());
      label.append(fields.newsletter,el('span','',NEWSLETTER_LABEL));form.append(label,el('p','br-account-help','Puedes cambiar esta elección o darte de baja desde Perfil → Privacidad y correos.'));
    }
    const submit = button({ signup: "Crear cuenta", login: "Entrar", reset: "Enviar correo de recuperación" }[name], "primary");
    submit.type = "submit";
    const handler = { signup: "onSignup", login: "onLogin", reset: "onReset" }[name];
    control(submit, () => locked() || !canUseAccount() || !available(handler));
    if (name === 'signup') {
      const termsNotice = el('p', 'br-account-help');
      termsNotice.append(el('span', '', 'Al pulsar Crear cuenta aceptas las '), informationButton('condiciones de uso', 'legal'), el('span', '', '. La privacidad y los permisos opcionales se explican por separado.'));
      form.append(termsNotice);
    }
    form.append(submit);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (locked()) return;
      fields.email.value = fields.email.value.trim();
      fields.refreshPassword?.();
      if (!validate(form, notices)) return;
      if (name === 'signup' && fields.password.value !== fields.passwordConfirmation.value) {
        fields.passwordConfirmation.setAttribute('aria-invalid', 'true');
        showMessage(notices, 'Las contraseñas no coinciden. Revisa la confirmación antes de continuar.', true);
        fields.passwordConfirmation.focus();
        return;
      }
      const email = fields.email.value;
      const args = name === "reset" ? [email] : [{
        ...(name === "signup" ? { displayName: fields.displayName.value.trim(), newsletter:fields.newsletter.checked } : {}),
        email,
        password: fields.password.value,
      }];
      run(handler, args, notices, ()=>{clearPasswords();if(name==='signup')fields.newsletter.checked=false;});
    });
    panel.append(form);
    auth.append(panel);
    authForms[name] = { tab, panel, form, fields };
    tab.addEventListener("click", () => setMode(name));
    tab.addEventListener("keydown", (event) => {
      if (locked()) return;
      let next;
      const current = modeNames.indexOf(name);
      if (event.key === "ArrowRight") next = modeNames[(current + 1) % modeNames.length];
      if (event.key === "ArrowLeft") next = modeNames[(current - 1 + modeNames.length) % modeNames.length];
      if (event.key === "Home") next = modeNames[0];
      if (event.key === "End") next = modeNames[modeNames.length - 1];
      if (next) {
        event.preventDefault();
        setMode(next);
        authForms[next].tab.focus();
      }
    });
  });

  function setMode(next) {
    if (!authForms[next] || locked()) return;
    mode = next;
    clearMessage(notices);
    clearPasswords();
    render();
  }

  const profile = el("section", "br-account-section");
  const identity = el("div", "br-account-identity");
  const displayName = el("p", "br-account-display-name");
  const email = el("p", "br-account-email");
  const verificationLabel = el("p", "br-account-verification");
  identity.append(displayName, email, verificationLabel);
  profile.append(identity);

  function profileAction(label, name, box = notices) {
    const node = button(label);
    control(node, () => locked() || (name !== 'onLogout' && !canUseAccount()) || !view.user || !available(name) || (name === 'onRetrySync' && view.status === 'deletion-pending'));
    node.addEventListener("click", () => run(name, [], box));
    return node;
  }

  const verification = el("div", "br-account-card");
  verification.append(el("p", "br-account-description", "Abre el enlace que te hemos enviado para verificar tu correo. Después vuelve aquí y pulsa «Ya he verificado mi correo»."));
  verification.append(el("p", "br-account-help", "¿No encuentras el correo? Revisa la carpeta de spam o correo no deseado."));
  const verificationActions = el("div", "br-account-actions");
  verificationActions.append(
    profileAction("Reenviar correo de verificación", "onResendVerification"),
    profileAction("Ya he verificado mi correo", "onRefreshVerification"),
  );
  verification.append(verificationActions);
  profile.append(verification);

  const progressCard = el("div", "br-account-card");
  progressCard.append(el("h3", "br-account-subtitle", "Tu progreso"));
  const profileStatus = el("p", "br-account-description");
  progressCard.append(profileStatus, profileAction("Sincronizar de nuevo", "onRetrySync"));
  profile.append(progressCard);
  syncRetry.addEventListener("click", () => {
    if (!mainModal.dialog.open) mainModal.open();
    run("onRetrySync", [], notices);
  });
  control(syncRetry, () => locked() || !canUseAccount() || !view.user || view.status === 'deletion-pending' || !available("onRetrySync"));
  syncLogout.addEventListener("click", () => logout());
  control(syncLogout, () => locked() || !view.user || !available("onLogout"));

  const accountActions = el("div", "br-account-actions br-account-session-actions");
  accountActions.append(profileAction("Cerrar sesión", "onLogout"));
  const openDelete = button("Eliminar cuenta", "danger-quiet");
  control(openDelete, () => locked() || !canUseAccount() || !view.user || !available("onDeleteAccount"));
  accountActions.append(openDelete);
  mainModal.dialog.append(waiting, unavailable, auth, profile, accountActions);
  const informationLinks = el('footer', 'br-account-information');
  informationLinks.append(informationButton('Ayuda y contacto', 'help'), informationButton('Privacidad', 'privacy'), informationButton('Aviso legal', 'legal'));
  mainModal.dialog.append(informationLinks);

  const deleteModal = makeDialog("delete", "Eliminar cuenta y progreso");
  const deleteDescription = el("p", "br-account-description", "Se eliminarán tu cuenta de Ochavo, su progreso, vidas, gemas, rachas y logros. Esta acción no se puede deshacer. Si tienes una suscripción, eliminar la cuenta no cancela su renovación: se gestiona en Apple o Google Play, según dónde la contrataste. Escribe tu contraseña y confirma que quieres continuar.");
  deleteDescription.id = `${prefix}-delete-description`;
  deleteModal.dialog.setAttribute("aria-describedby", deleteDescription.id);
  const deleteForm = el("form", "br-account-form");
  deleteForm.noValidate = true;
  const deletePassword = field(deleteForm, {
    suffix: "delete-password", label: "Contraseña actual", type: "password",
    autocomplete: "current-password", hint: "Escribe la contraseña actual de tu cuenta.",
  });
  const confirmLabel = el("label", "br-account-confirmation");
  const deleteConsent = el("input", "br-account-checkbox");
  deleteConsent.type = "checkbox";
  deleteConsent.required = true;
  deleteConsent.id = `${prefix}-delete-consent`;
  confirmLabel.htmlFor = deleteConsent.id;
  confirmLabel.append(deleteConsent, el("span", "", "Entiendo que se eliminarán mi cuenta, su progreso y sus vidas, gemas y logros."));
  deleteForm.append(confirmLabel);
  control(deleteConsent, () => locked() || !view.user);
  const deleteNotices = messageBox(deleteForm, "delete");
  const deleteActions = el("div", "br-account-actions");
  const cancelDelete = button("Conservar mi cuenta");
  control(cancelDelete);
  cancelDelete.addEventListener("click", () => { if (!locked()) deleteModal.dialog.close(); });
  const confirmDelete = button("Eliminar cuenta y progreso", "danger");
  confirmDelete.type = "submit";
  control(confirmDelete, () => locked() || !canUseAccount() || !view.user || !deleteConsent.checked || !available("onDeleteAccount"));
  deleteConsent.addEventListener("change", () => {
    deleteConsent.removeAttribute("aria-invalid");
    render();
  });
  deleteActions.append(cancelDelete, confirmDelete);
  deleteForm.append(deleteActions);
  const deleteDetails = el('p', 'br-account-help', 'Se borran los datos de aprendizaje y juego de esta cuenta, su código de invitación y las vinculaciones de invitaciones en las que participa, y se limpian sus copias de este dispositivo. Las copias de otros dispositivos deben borrarse allí. Se conserva un registro mínimo de seguridad para impedir que una sesión anterior vuelva a subir datos; su retirada requiere mantenimiento. Los comprobantes sin identidad de la persona invitada ya entregados a otra persona pueden permanecer con su recompensa.');
  deleteModal.dialog.append(deleteDescription, deleteDetails, informationButton('Más información sobre el borrado', 'delete'), deleteForm);
  deleteModal.dialog.addEventListener("close", () => {
    deleteConsent.checked = false;
    render();
  });
  function showDeleteConfirmation() {
    deleteConsent.checked = false;
    clearMessage(deleteNotices);
    render();
    deleteModal.open(cancelDelete);
  }
  openDelete.addEventListener("click", showDeleteConfirmation);
  deleteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (locked() || !view.user || !validate(deleteForm, deleteNotices)) return;
    await run("onDeleteAccount", [deletePassword.value], deleteNotices, () => {
      clearPasswords();
      deleteModal.dialog.close();
    });
    if (!deleteModal.dialog.open && deleteNotices.status.textContent) {
      showMessage(notices, deleteNotices.status.textContent);
    }
  });

  function syncDescription() {
    if (string(view.statusText)) return view.statusText;
    if (view.authLoading || !view.ready) return "Preparando el acceso a tu cuenta…";
    if (!view.configured) return "El servicio de cuentas no está disponible. Consulta Ayuda.";
    if (!view.user) return "Crea una cuenta o inicia sesión para entrar en Ochavo.";
    if (!view.user.emailVerified) return "Revisa el correo de verificación de tu cuenta.";
    return "Consulta aquí el estado de tu progreso.";
  }

  function render() {
    testNotice.hidden = !view.emulator;
    const screen = view.authLoading || !view.ready ? "waiting" : !view.configured ? "unavailable" : view.user ? "profile" : "auth";
    waiting.hidden = screen !== "waiting";
    unavailable.hidden = screen !== "unavailable";
    auth.hidden = screen !== "auth";
    profile.hidden = screen !== "profile";
    const description = syncDescription();
    if (syncText.textContent !== description) syncText.textContent = description;
    profileStatus.textContent = description;
    const problem = /error|fail|offline|conflict/i.test(string(view.status));
    syncRow.dataset.state = problem ? "problem" : "normal";
    syncRetry.hidden = !(canUseAccount() && view.user && problem && available("onRetrySync"));
    syncLogout.hidden = !(view.user && (problem || !canUseAccount()) && available("onLogout"));
    syncActions.hidden = syncRetry.hidden && syncLogout.hidden;
    accountActions.hidden = !view.user;
    accountButton.textContent = view.user ? "Mi cuenta" : "Cuenta";
    accountButton.setAttribute("aria-label", view.user ? "Abrir mi cuenta de Ochavo" : "Abrir la cuenta de Ochavo");

    modeNames.forEach((name) => {
      const active = name === mode;
      authForms[name].tab.setAttribute("aria-selected", String(active));
      authForms[name].tab.tabIndex = active ? 0 : -1;
      authForms[name].panel.hidden = !active;
    });
    displayName.textContent = string(view.user?.displayName) || "Cuenta de Ochavo";
    email.textContent = string(view.user?.email);
    verificationLabel.textContent = view.user?.emailVerified ? "Correo verificado" : "Correo pendiente de verificar";
    verificationLabel.dataset.verified = String(Boolean(view.user?.emailVerified));
    verification.hidden = Boolean(view.user?.emailVerified);
    progressCard.hidden = !view.user?.emailVerified;
    rules.forEach(({ node, disabledWhen }) => { node.disabled = Boolean(disabledWhen()); });
    dialogs.forEach(({ dialog }) => dialog.setAttribute("aria-busy", String(locked())));
    deletionRequestNote.hidden = !deletionRequested || Boolean(view.user);

    if (!view.user || !view.configured) {
      if (deleteModal.dialog.open) deleteModal.dialog.close();
    }
    if (visibleScreen && visibleScreen !== screen && mainModal.dialog.open) {
      mainModal.title.focus({ preventScroll: true });
    }
    visibleScreen = screen;
    if (gateReleasePending && !locked() && !deletionRequested) {
      gateReleasePending = false;
      if (mainModal.dialog.open) mainModal.dialog.close();
    }
    if(deletionRequested && view.user && canUseAccount() && !locked() && mainModal.dialog.open) {
      deletionRequested = false;
      gateReleasePending = false;
      queueMicrotask(() => { if(view.user && !locked() && mainModal.dialog.open) showDeleteConfirmation(); });
    }
  }

  function openAccount(nextMode) {
    if(locked()) return;
    if (Object.hasOwn(authForms, nextMode)) mode = nextMode;
    deletionRequested = false;
    clearMessage(notices);
    render();
    const focusTarget = visibleScreen === "auth" ? authForms[mode].fields.email : mainModal.title;
    mainModal.open(focusTarget);
  }
  accountButton.addEventListener("click", () => openAccount());

  async function logout() {
    if (locked() || !view.user || !available('onLogout')) return;
    deletionRequested = false;
    clearMessage(notices);
    render();
    mainModal.open();
    await run('onLogout', [], notices);
  }

  function requestDeletion() {
    if(locked()) return false;
    deletionRequested = true;
    mode = 'login';
    clearMessage(notices);
    render();
    mainModal.open(view.user ? mainModal.title : authForms.login.fields.email);
    render();
    return true;
  }

  function update(next = {}) {
    const priorEmail = string(view.user?.email);
    const priorSignedIn = Boolean(view.user);
    const priorRequired = Boolean(view.accessRequired);
    view = { ...view, ...next };
    if (view.accessRequired) gateReleasePending = false;
    else if (priorRequired) gateReleasePending = true;
    if (priorSignedIn !== Boolean(view.user) || priorEmail !== string(view.user?.email)) {
      clearPasswords();
      deleteConsent.checked = false;
      clearMessage(notices);
      clearMessage(deleteNotices);
    }
    render();
  }

  render();
  return { update, open: openAccount, requestDeletion, logout };
}
