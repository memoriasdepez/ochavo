import {PASSWORD_POLICY, PASSWORD_REQUIREMENTS_TEXT} from './password-policy.js';

const COPY = {
  loading: ['Estamos comprobando tu enlace', 'Solo tardará un momento.'],
  verified: ['¡Correo confirmado!', 'Tu cuenta de Ochavo ya está lista. Vuelve a la app para continuar aprendiendo.'],
  'reset-ready': ['Elige una contraseña nueva', 'Guárdala en un lugar seguro. La utilizarás la próxima vez que entres en Ochavo.'],
  'reset-done': ['¡Contraseña actualizada!', 'Ya puedes volver a Ochavo y entrar con tu contraseña nueva.'],
  'recover-ready': ['¿Quieres recuperar tu correo anterior?', 'Si no has pedido cambiar el correo de tu cuenta, puedes deshacer ese cambio.'],
  'recover-done': ['Correo anterior recuperado', 'El cambio se ha deshecho. Por seguridad, te recomendamos cambiar tu contraseña desde la pantalla de acceso de Ochavo.'],
};

export function clearPasswordFields(fields) {
  for (const {input, toggle} of fields) {
    input.value = ''; input.type = 'password';
    toggle.textContent = 'Mostrar'; toggle.setAttribute('aria-pressed', 'false');
    input.removeAttribute('aria-invalid');
  }
}

export function mountEmailActionUI(root, {onRetry, onReset, onRecover}) {
  const document = root.ownerDocument || globalThis.document;
  const title = root.querySelector('#action-title'), description = root.querySelector('#action-description');
  const status = root.querySelector('#action-status'), controls = root.querySelector('#action-controls');
  let fields = [];
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, callback, secondary = false) => {
    const node = el('button', secondary ? 'oa-button oa-button--secondary' : 'oa-button', text);
    node.type = 'button'; node.addEventListener('click', callback);
    return node;
  };
  const back = (text = 'Volver a Ochavo') => {
    const link = el('a', 'oa-button', text); link.href = '/'; return link;
  };
  const disable = busy => {
    root.setAttribute('aria-busy', String(busy));
    for (const field of controls.querySelectorAll('input, button')) field.disabled = busy;
  };
  function replaceControls(...children) {
    clearPasswordFields(fields); fields = [];
    controls.replaceChildren(...children);
  }
  function passwordField(form, id, labelText) {
    const wrapper = el('div', 'oa-field');
    const label = el('label', '', labelText); label.htmlFor = id;
    const input = el('input'); input.id = id; input.name = id; input.type = 'password';
    input.required = true; input.autocomplete = 'new-password'; input.maxLength = PASSWORD_POLICY.maxLength;
    input.setAttribute('aria-describedby', 'password-requirements action-status');
    const entry = el('div', 'oa-password-entry');
    const toggle = button('Mostrar', () => {
      const visible = input.type === 'password'; input.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? 'Ocultar' : 'Mostrar'; toggle.setAttribute('aria-pressed', String(visible));
    }, true);
    toggle.className = 'oa-password-toggle';
    toggle.setAttribute('aria-label', `${labelText}: mostrar u ocultar`);
    toggle.setAttribute('aria-controls', id); toggle.setAttribute('aria-pressed', 'false');
    input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); status.textContent = ''; });
    entry.append(input, toggle); wrapper.append(label, entry); form.append(wrapper);
    const result = {input, toggle}; fields.push(result); return result;
  }
  function resetForm() {
    const form = el('form', 'oa-form'); form.noValidate = true;
    const password = passwordField(form, 'new-password', 'Nueva contraseña');
    password.input.minLength = PASSWORD_POLICY.minLength;
    const requirements = el('p', 'oa-help', PASSWORD_REQUIREMENTS_TEXT); requirements.id = 'password-requirements';
    form.append(requirements);
    const confirmation = passwordField(form, 'new-password-confirmation', 'Confirma la nueva contraseña');
    const submit = el('button', 'oa-button', 'Guardar contraseña'); submit.type = 'submit'; form.append(submit);
    const localFields = [password, confirmation];
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const result = await onReset(password.input.value, confirmation.input.value);
      if (result?.accepted) clearPasswordFields(localFields);
    });
    controls.append(form);
    const link = back(); link.classList.add('oa-link'); controls.append(link);
  }

  function update(view) {
    if (view.phase === 'reset-validation') {
      status.setAttribute('role', 'alert'); status.textContent = view.message;
      const field = fields[view.field === 'confirmation' ? 1 : 0]?.input;
      field?.setAttribute('aria-invalid', 'true'); field?.focus(); return;
    }
    if (['reset-saving', 'recover-saving'].includes(view.phase)) {
      disable(true); status.setAttribute('role', 'status'); status.textContent = 'Guardando el cambio…'; return;
    }
    disable(false); root.dataset.state = view.phase;
    status.textContent = ''; status.setAttribute('role', view.phase === 'error' ? 'alert' : 'status');
    const [heading, body] = COPY[view.phase] || [view.title || 'Este enlace no está completo', view.message || 'Abre el enlace que te hemos enviado por correo para continuar.'];
    title.textContent = heading; description.textContent = body;
    replaceControls();
    if (view.phase === 'loading') { root.setAttribute('aria-busy', 'true'); return; }
    if (view.phase === 'reset-ready' || (view.phase === 'error' && view.kind === 'password')) {
      resetForm(); if (view.phase === 'error') status.textContent = view.message;
    } else if (view.phase === 'recover-ready') {
      const email = el('p', 'oa-recovery-email', view.email);
      controls.append(email, button('Restaurar mi correo anterior', () => { void onRecover(); }), back('Cancelar y volver a Ochavo'));
    } else {
      if (view.phase === 'error' && view.retry) controls.append(button('Volver a intentarlo', () => { void onRetry(); }));
      controls.append(back(['verified', 'reset-done', 'recover-done'].includes(view.phase) ? 'Continuar en Ochavo' : 'Volver a Ochavo'));
      if (view.phase === 'error') controls.append(el('p', 'oa-help', 'Si solicitas otro correo y no lo encuentras, revisa también la bandeja de SPAM.'));
    }
    if (['verified', 'reset-done', 'recover-done', 'error'].includes(view.phase)) title.focus({preventScroll: true});
  }
  return {update, clearPasswords() { clearPasswordFields(fields); }, destroy() { replaceControls(); }};
}
