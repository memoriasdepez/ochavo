// The account record is independent of learning progress, so older app versions
// cannot erase it when they save their own progress format.
export function createWelcomeBackend(db, api) {
  return {
    claim(uid) {
      return api.runTransaction(db, async transaction => {
        const marker = api.doc(db, 'accountDeletions', uid);
        const target = api.doc(db, 'users', uid, 'preferences', 'onboarding');
        const progress = api.doc(db, 'users', uid, 'progress', 'main');
        const deleted = await transaction.get(marker);
        if (deleted.exists()) return false;
        const existing = await transaction.get(target);
        if (existing.exists()) return false;
        const previousProgress = await transaction.get(progress);
        transaction.set(target, { version: 1, seen: true, seenAt: api.serverTimestamp() });
        // Existing learners have already entered the app before this fix.
        return !previousProgress.exists();
      });
    },
    async remove(uid) {
      await api.deleteDoc(api.doc(db, 'users', uid, 'preferences', 'onboarding'));
    },
  };
}

export function createWelcomeController({ backend, storage }) {
  const seen = new Set(), pending = new Map(), generations = new Map();
  const key = uid => 'brote.progress.v1.welcome.' + uid;
  return {
    async claim(uid) {
      if (typeof uid !== 'string' || !uid || !backend || seen.has(uid)) return false;
      try { if (storage.getItem(key(uid)) === 'seen') { seen.add(uid); return false; } } catch {}
      if (pending.has(uid)) return false;
      const generation = generations.get(uid) || 0;
      const request = Promise.resolve().then(() => backend.claim(uid));
      pending.set(uid, request);
      try {
        const first = await request;
        if ((generations.get(uid) || 0) !== generation) return false;
        seen.add(uid);
        try { await storage.setItem(key(uid), 'seen'); } catch { /* Server claim remains authoritative. */ }
        return first === true;
      } catch {
        // A missing/failed read is never treated as a new account. Try again
        // on a later update, without blocking learning or opening a dialog.
        return false;
      } finally { if (pending.get(uid) === request) pending.delete(uid); }
    },
    async forget(uid) {
      generations.set(uid, (generations.get(uid) || 0) + 1);
      seen.delete(uid);
      await storage.removeItem(key(uid));
    },
  };
}
