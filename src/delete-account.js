/** Confirm remote deletion before cleaning the device; never turn a partial result into success. */
export async function deleteAccountWithProgress({user, authenticate, removeProgress, deleteIdentity, getCurrentUser, store}) {
  await authenticate(user);
  await store.pause();
  let cloudBlocked=false;
  try {
    if (user.emailVerified) {await removeProgress(user.uid);cloudBlocked=true;}
    await deleteIdentity(user);
  } catch (error) {
    // The account may still exist. Resume only its own session, retaining the local copy.
    const current = getCurrentUser();
    if (current?.uid === user.uid) {
      try { await store.select(current); } catch { /* Keep the original deletion failure and local copy. */ }
    }
    const message=cloudBlocked
      ? 'Se ha eliminado el progreso en la nube y bloqueado nuevas subidas, pero no hemos podido confirmar el borrado de la cuenta. Conservamos la copia local de tu progreso. Reintenta «Eliminar cuenta» con tu contraseña; si el problema continúa, contacta desde Ayuda.'
      : 'No se pudo completar la eliminación. Conservamos la copia local de tu progreso. Revisa tu cuenta y el estado de sincronización antes de reintentar; si el problema continúa, contacta desde Ayuda.';
    throw new Error(message, {cause: error});
  }
  try {
    await store.forget(user.uid);
    return {message: 'Tu cuenta y su progreso se han eliminado, incluida la copia de esta cuenta en este dispositivo.'};
  } catch {
    return {message: 'Tu cuenta y su progreso en la nube se han eliminado. No se pudo borrar la copia local de esta cuenta. Para eliminarla, borra los datos de Ochavo de este dispositivo. Antes de hacerlo, comprueba que el progreso de otras cuentas de este dispositivo está sincronizado.'};
  }
}
