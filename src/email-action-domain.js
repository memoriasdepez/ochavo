import {inspectPassword, passwordRequirementMessage} from './password-policy.js';

const MODES = new Set(['verifyEmail', 'resetPassword', 'recoverEmail']);
const OPERATION = {verifyEmail: 'VERIFY_EMAIL', recoverEmail: 'RECOVER_EMAIL'};

/** Only mode and the one-time code are needed. Never trust query configuration or destinations. */
export function readEmailAction(search) {
  const parameters = new URLSearchParams(typeof search === 'string' ? search : '');
  const modes = parameters.getAll('mode'), codes = parameters.getAll('oobCode');
  if (modes.length !== 1 || codes.length !== 1 || !MODES.has(modes[0])) return null;
  const code = codes[0];
  if (!code || code.length > 2048 || /[\s\u0000-\u001f\u007f]/u.test(code)) return null;
  return Object.freeze({mode: modes[0], code});
}

export function emailActionFailure(error) {
  switch (error?.code) {
    case 'auth/network-request-failed':
    case 'auth/timeout':
      return {kind: 'offline', title: 'No hemos podido conectar', message: 'Comprueba tu conexión y vuelve a intentarlo. Tu enlace sigue aquí mientras mantengas esta página abierta.', retry: true};
    case 'auth/expired-action-code':
      return {kind: 'expired', title: 'Este enlace ha caducado', message: 'Vuelve a Ochavo y solicita un correo nuevo. Usa el enlace del último mensaje que recibas.', retry: false};
    case 'auth/invalid-action-code':
      return {kind: 'invalid', title: 'Este enlace ya no es válido', message: 'Puede que ya lo hayas utilizado. Vuelve a Ochavo para entrar en tu cuenta; si aún no puedes, solicita un correo nuevo.', retry: false};
    case 'auth/weak-password':
    case 'auth/password-does-not-meet-requirements':
      return {kind: 'password', title: 'Revisa tu nueva contraseña', message: 'La contraseña no cumple todos los requisitos. Prueba con otra que los cumpla.', retry: false};
    default:
      return {kind: 'unavailable', title: 'No hemos podido completar este paso', message: 'Vuelve a Ochavo para comprobar tu cuenta o solicitar un enlace nuevo. Si el problema continúa, contacta con nosotros desde Ayuda.', retry: true};
  }
}

/** Firebase operations are supplied so the complete flow can be checked without real accounts. */
export function createEmailActionController({action, auth, api, onState = () => {}}) {
  let code = action?.code || '', busy = false, disposed = false, ready = false, email = '';
  const mode = action?.mode;
  const emit = state => { if (!disposed) onState({...state, mode}); };
  const invalid = () => Object.assign(new Error('Invalid email action'), {code: 'auth/invalid-action-code'});
  const failure = error => emit({phase: 'error', ...emailActionFailure(error)});
  async function run(operation) {
    if (busy || disposed) return false;
    busy = true;
    try { await operation(); return true; }
    catch (error) { failure(error); return false; }
    finally { busy = false; }
  }

  async function load() {
    return run(async () => {
      ready = false;
      if (!code || !MODES.has(mode) || !auth) throw invalid();
      emit({phase: 'loading'});
      if (mode === 'resetPassword') {
        email = await api.verifyPasswordResetCode(auth, code);
        if (disposed) return;
        ready = true;
        emit({phase: 'reset-ready'});
        return;
      }
      const information = await api.checkActionCode(auth, code);
      if (disposed) return;
      // An attacker cannot relabel a password reset or email recovery as a verification.
      if (information.operation !== OPERATION[mode]) throw invalid();
      email = typeof information.data?.email === 'string' ? information.data.email : '';
      if (mode === 'recoverEmail') {
        if (!email) throw invalid();
        ready = true;
        emit({phase: 'recover-ready', email});
        return;
      }
      await api.applyActionCode(auth, code);
      if (disposed) return;
      code = '';
      emit({phase: 'verified'});
    });
  }

  async function reset(password, confirmation) {
    if (!ready || mode !== 'resetPassword' || busy || disposed) return {accepted: false};
    if (!inspectPassword(password).valid) {
      emit({phase: 'reset-validation', field: 'password', message: passwordRequirementMessage(password)});
      return {accepted: false};
    }
    if (password !== confirmation) {
      emit({phase: 'reset-validation', field: 'confirmation', message: 'Las contraseñas no coinciden. Escribe exactamente la misma en los dos campos.'});
      return {accepted: false};
    }
    const succeeded = await run(async () => {
      emit({phase: 'reset-saving'});
      await api.confirmPasswordReset(auth, code, password);
      if (disposed) return;
      ready = false; code = ''; email = '';
      emit({phase: 'reset-done'});
    });
    // Do not retain a password or silently sign the browser into a different account.
    password = ''; confirmation = '';
    return {accepted: true, succeeded};
  }

  async function recover() {
    if (!ready || mode !== 'recoverEmail' || busy || disposed) return false;
    return run(async () => {
      emit({phase: 'recover-saving'});
      await api.applyActionCode(auth, code);
      if (disposed) return;
      ready = false; code = ''; email = '';
      emit({phase: 'recover-done'});
    });
  }

  return {load, reset, recover, dispose() { disposed = true; ready = false; code = ''; email = ''; }};
}
