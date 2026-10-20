const PREFIX = 'brote.progress.v1.';

// Only progress belongs here. Firebase continues to own its authentication storage.
export async function createNativeProgressStorage({preferences, fallback} = {}) {
  if (!preferences) throw new Error('Falta el almacenamiento del dispositivo.');
  const cache = new Map(), pending = new Map();
  let inFlight = null;
  // Anonymous copies from older releases remain untouched and are never loaded or migrated.
  const legacyGuestKeys = new Set([PREFIX + 'guest', PREFIX + 'game.guest']);
  const validKey = key => typeof key === 'string' && key.startsWith(PREFIX) && key.length > PREFIX.length && !legacyGuestKeys.has(key);
  const checkKey = key => { if (!validKey(key)) throw new Error('Solo se puede guardar progreso en este almacén.'); };

  // A failed read must not turn an existing account into an apparently empty one.
  const {keys} = await preferences.keys();
  for (const key of keys.filter(validKey)) {
    const {value} = await preferences.get({key});
    if (value !== null && value !== undefined) cache.set(key, value);
  }

  async function flush() {
    if (inFlight) {
      await inFlight;
      if (pending.size) return flush();
      return;
    }
    if (!pending.size) return;
    const request = (async () => {
      while (pending.size) {
        const [key, operation] = pending.entries().next().value;
        if (operation.value === null) await preferences.remove({key});
        else await preferences.set({key, value: operation.value});
        // A newer edit to this key may have arrived while the bridge was busy.
        if (pending.get(key) === operation) pending.delete(key);
      }
    })();
    inFlight = request;
    try { await request; }
    finally { if (inFlight === request) inFlight = null; }
  }

  const storage = {
    getItem(key) { checkKey(key); return cache.get(key) ?? null; },
    setItem(key, value) {
      checkKey(key);
      const text = String(value);
      cache.set(key, text);
      pending.set(key, {value: text});
      return flush();
    },
    removeItem(key) {
      checkKey(key);
      cache.delete(key);
      pending.set(key, {value: null});
      return flush();
    },
    flush
  };

  // Migrate a previous WebView cache, never browser auth keys or other data.
  // Native values already present are authoritative after a completed migration.
  if (fallback) {
    const previous = [];
    for (let index = 0; index < fallback.length; index++) {
      const key = fallback.key(index);
      if (!validKey(key)) continue;
      const value = fallback.getItem(key);
      if (value !== null) previous.push([key, value]);
    }
    for (const [key, value] of previous) {
      if (!cache.has(key)) await storage.setItem(key, value);
    }
    await flush();
    for (const [key, value] of previous) {
      if (fallback.getItem(key) === value) fallback.removeItem(key);
    }
  }
  return storage;
}
