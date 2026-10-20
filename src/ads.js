const STORAGE_PREFIX = 'brote.progress.v1.ads.';
const ATTEMPT_LIMIT = 128;

/** Account-local cadence, independent of course history and learning rewards. */
export function lessonAdsStorageKey(owner) {
  return typeof owner === 'string' && owner.trim() ? STORAGE_PREFIX + owner : null;
}

/** Record saved results; present only when the user leaves the result screen. */
export function createLessonAds({
  adapter = null, getPremium = () => false, consent = () => false,
  getOwner = () => null, storage = null, onError = () => {}
} = {}) {
  let session = null, pending = null, showing = false;
  let recording = Promise.resolve();
  const memory = new Map();
  const report = error => { try { onError(error); } catch { /* Reporting cannot interrupt progress. */ } };
  const ownerNow = () => {
    try { const owner = getOwner(); return lessonAdsStorageKey(owner) ? owner : null; }
    catch (error) { report(error); return null; }
  };
  const getSession = () => {
    const owner = ownerNow();
    if (!session || session.owner !== owner) {
      session = {owner, state: null};
      pending = null;
    }
    return session;
  };
  const isCurrent = candidate => getSession() === candidate;
  const available = () => Boolean(adapter && typeof adapter.showInterstitial === 'function');

  async function readState(candidate) {
    if (candidate.state) return candidate.state;
    const key = lessonAdsStorageKey(candidate.owner);
    const text = storage ? await storage.getItem(key) : memory.get(key);
    const value = text ? JSON.parse(text) : null;
    if (value && (value.version !== 1 || !Number.isSafeInteger(value.completed) || value.completed < 0 ||
      !Array.isArray(value.attempts) || value.attempts.some(id => typeof id !== 'string' || !id))) {
      throw new Error('No se pudo leer el contador de anuncios de esta cuenta.');
    }
    candidate.state = value
      ? {version: 1, completed: value.completed, attempts: [...new Set(value.attempts)].slice(-ATTEMPT_LIMIT)}
      : {version: 1, completed: 0, attempts: []};
    return candidate.state;
  }

  async function record(candidate, result) {
    if (!candidate.owner || !isCurrent(candidate)) return false;
    try {
      const state = await readState(candidate);
      if (!isCurrent(candidate) || state.attempts.includes(result.attemptId)) return false;
      // A visible later result replaces a missed opportunity. A cancelled
      // result whose durable save finishes late must not erase a newer one.
      const allowAd = result.allowAd !== false;
      if (allowAd) pending = null;
      const premium = Boolean(getPremium());
      state.attempts = [...state.attempts, result.attemptId].slice(-ATTEMPT_LIMIT);
      if (!premium) state.completed += 1;
      const key = lessonAdsStorageKey(candidate.owner), value = JSON.stringify(state);
      // Persist before queueing: reloading cannot repeat the same opportunity.
      if (storage) await storage.setItem(key, value);
      else memory.set(key, value);
      if (!isCurrent(candidate) || !allowAd || premium || state.completed % 2 !== 0 || !available()) return false;
      if (!await consent() || !isCurrent(candidate) || getPremium()) return false;
      pending = {session: candidate, attemptId: result.attemptId};
      return true;
    } catch (error) { report(error); return false; }
  }

  function afterCompletion(result = {}) {
    const candidate = getSession();
    if (!result || !['lesson', 'exam'].includes(result.kind) || typeof result.attemptId !== 'string' ||
      !result.attemptId.trim() || (result.kind === 'exam' && result.passed !== true) || !candidate.owner) {
      return Promise.resolve(false);
    }
    // Serial writes also support asynchronous Capacitor Preferences storage.
    const operation = recording.then(() => record(candidate, result));
    recording = operation.catch(error => { report(error); return false; });
    return recording;
  }

  async function showPending() {
    const candidate = getSession();
    await recording;
    if (!isCurrent(candidate) || !pending || pending.session !== candidate) return false;
    // Consume before provider/consent awaits, concurrent calls or reentry.
    pending = null;
    if (showing || !available()) return false;
    showing = true;
    try {
      if (getPremium() || !await consent() || !isCurrent(candidate) || getPremium()) return false;
      const result = await adapter.showInterstitial();
      return result !== false && isCurrent(candidate);
    } catch (error) { report(error); return false; }
    finally { showing = false; }
  }

  function discardPending() {
    // Also invalidate a completion that is still awaiting a durable write.
    pending = null;
    session = {owner: ownerNow(), state: null};
  }

  async function forget(owner) {
    const key = lessonAdsStorageKey(owner);
    if (!key) return false;
    if (getSession().owner === owner) discardPending();
    // An in-flight write must finish before the account cache is removed.
    const operation = recording.then(async () => {
      memory.delete(key);
      try { if (storage) await storage.removeItem(key); return true; }
      catch (error) { report(error); return false; }
    });
    recording = operation;
    return operation;
  }

  return {afterCompletion, showPending, discardPending, reset: discardPending, forget};
}
