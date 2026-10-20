const accountError = (code, message) => Object.assign(new Error(message), {code});
const registered = user => Boolean(user?.uid && !user.isAnonymous);
const sameIdentity = (getUser, user) => {
  if (getUser() !== user) throw accountError('account/identity-changed', 'La cuenta cambió. Vuelve a intentarlo con la cuenta actual.');
};

/** Repair only the known profile/token verification mismatch during account admission. */
export async function ensureVerifiedSession({getUser, getTokenResult, refreshToken, user = getUser()}) {
  sameIdentity(getUser, user);
  if (!registered(user) || !user.emailVerified) return user;
  const token = await getTokenResult(user);
  sameIdentity(getUser, user);
  if (!user.emailVerified) return user;
  if (token?.claims?.email_verified === true) return user;
  await refreshToken(user, true);
  sameIdentity(getUser, user);
  const renewed = await getTokenResult(user);
  sameIdentity(getUser, user);
  if (!user.emailVerified || renewed?.claims?.email_verified !== true) {
    throw accountError('account/verification-required', 'La sesión todavía no confirma tu correo. Revisa la verificación y vuelve a intentarlo.');
  }
  return user;
}

/** Retry both account stores after an explicit refresh, without clearing local drafts. */
export function createSessionRecovery({getUser, reloadUser, refreshToken, retryProgress, retryGame}) {
  let active = null;
  function recover() {
    const user = getUser();
    if (!registered(user)) return Promise.reject(accountError('account/auth-required', 'Inicia sesión con tu cuenta para continuar.'));
    if (active?.user === user) return active.promise;
    const entry = {user, promise: null};
    entry.promise = (async () => {
      await reloadUser(user);
      sameIdentity(getUser, user);
      if (!user.emailVerified) return {user, verified: false, progress: null, game: null};
      // emailVerified belongs to the reloaded profile; rules evaluate the ID token.
      await refreshToken(user, true);
      sameIdentity(getUser, user);
      if (!user.emailVerified) return {user, verified: false, progress: null, game: null};
      const retry = callback => Promise.resolve().then(() => {
        sameIdentity(getUser, user);
        return callback(user);
      });
      const [progress, game] = await Promise.allSettled([retry(retryProgress), retry(retryGame)]);
      sameIdentity(getUser, user);
      return {user, verified: true, progress, game};
    })().finally(() => { if (active === entry) active = null; });
    active = entry;
    return entry.promise;
  }
  return {recover};
}

/** Local durability is required; a failed or slow cloud upload must not trap a session. */
export async function prepareSignOut({
  getUser, flushInputs = () => {}, flushProgressLocal, flushGameLocal, flushProgress,
  timeoutMs = 3000,
}) {
  const user = getUser();
  await flushInputs();
  sameIdentity(getUser, user);
  const local = await Promise.allSettled([
    Promise.resolve().then(flushProgressLocal),
    Promise.resolve().then(flushGameLocal),
  ]);
  sameIdentity(getUser, user);
  if (local.some(result => result.status === 'rejected' || result.value === false)) {
    throw accountError('storage/write-failed', 'No se pudo guardar en este dispositivo antes de cerrar sesión. Reintenta para conservar tu progreso.');
  }
  let timer;
  const remote = Promise.resolve().then(() => {
    sameIdentity(getUser, user);
    return flushProgress();
  }).then(value => ({status: 'fulfilled', value}), reason => ({status: 'rejected', reason}));
  let result;
  try {
    result = await Promise.race([
      remote,
      new Promise(resolve => { timer = setTimeout(() => resolve({status: 'timeout'}), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
  sameIdentity(getUser, user);
  return {user, remote: result};
}
