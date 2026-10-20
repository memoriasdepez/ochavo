import '@fontsource-variable/nunito';
import './email-action.css';
import {applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode} from 'firebase/auth';
import {createCloud} from './cloud.js';
import {readEmailAction, createEmailActionController} from './email-action-domain.js';
import {mountEmailActionUI} from './email-action-ui.js';

// Keep the one-time link only in memory. No analytics, console, local storage or redirect parameters.
const action = readEmailAction(location.search);
history.replaceState(null, '', location.pathname);
const root = document.getElementById('email-action');
let controller;
const ui = mountEmailActionUI(root, {
  onRetry: () => controller?.load(),
  onReset: (password, confirmation) => controller.reset(password, confirmation),
  onRecover: () => controller.recover(),
});

if (!action) {
  ui.update({phase: 'error', title: 'Este enlace no está completo', message: 'Abre el enlace del correo de Ochavo. Si no lo encuentras, entra en la app para solicitar uno nuevo.', retry: false});
} else {
  try {
    // Configuration comes from the app's fixed public Firebase settings, never from the email URL.
    const cloud = createCloud();
    if (!cloud) throw Error('Authentication is not configured');
    controller = createEmailActionController({action, auth: cloud.auth,
      api: {applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode}, onState: ui.update});
    void controller.load();
  } catch {
    ui.update({phase: 'error', title: 'No hemos podido conectar con Ochavo', message: 'Vuelve a la app para comprobar tu cuenta o solicita un enlace nuevo desde la pantalla de acceso.', retry: false});
  }
}

addEventListener('pagehide', () => { ui.clearPasswords(); controller?.dispose(); }, {once: true});
addEventListener('pageshow', event => {
  if (event.persisted) ui.update({phase: 'error', title: 'Abre de nuevo el enlace del correo', message: 'Por seguridad, hemos cerrado esta comprobación al salir de la página. Abre el mensaje de Ochavo para continuar.', retry: false});
});
