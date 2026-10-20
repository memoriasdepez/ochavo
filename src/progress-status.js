export const progressMessages = {
  loading: 'Recuperando tu progreso…',
  'signed-out': 'Inicia sesión para continuar',
  unverified: 'Confirma tu correo para continuar',
  saving: 'Guardando en tu cuenta…',
  'saving-local': 'Guardando en este dispositivo.',
  saved: 'Progreso sincronizado',
  error: 'Pendiente de sincronizar. Puedes reintentarlo.',
  offline: 'Sin conexión. Guardado en este dispositivo.',
  'storage-error': 'No se pudo guardar en este dispositivo. No cierres la app.',
  'storage-invalid': 'No se pudo leer la copia del progreso. Conservamos sus datos. Contacta desde Ayuda antes de borrar datos del dispositivo.',
  'update-required': 'Tu progreso está guardado con una versión más reciente de Ochavo. Actualiza la app desde TestFlight o tu tienda; en la web, recarga la página. No borres la app ni sus datos.',
  'deletion-pending': 'Esta cuenta se ha eliminado o su eliminación está en curso. La sincronización está bloqueada. Puedes cerrar sesión o reintentar «Eliminar cuenta».',
};

// Losing the network says nothing about the durability of a pending local write.
export function disconnectedProgressStatus(current) {
  return ['signed-out', 'unverified', 'loading', 'saving-local', 'storage-error', 'storage-invalid', 'deletion-pending', 'update-required'].includes(current) ? current : 'offline';
}

export async function retryProgress(store, getStatus) {
  await store.retry();
  if (['signed-out', 'unverified'].includes(getStatus())) return {message: progressMessages[getStatus()]};
  // Native Preferences acknowledges account writes asynchronously.
  const durable = await store.flushLocal();
  const status = getStatus();
  if (!durable || status === 'storage-error') throw new Error(progressMessages['storage-error']);
  if (status === 'deletion-pending') throw new Error(progressMessages['deletion-pending']);
  if (status === 'update-required') throw new Error(progressMessages['update-required']);
  if (status === 'loading' || status === 'saving-local') return {message: progressMessages[status]};
  if (status === 'saved') return {message: 'Progreso sincronizado.'};
  return {message: 'Tu progreso se ha guardado en este dispositivo. La sincronización con tu cuenta sigue pendiente.'};
}
