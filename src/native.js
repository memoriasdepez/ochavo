import { Capacitor } from '@capacitor/core';

export const isAndroidNative = (platform = Capacitor) =>
  platform.isNativePlatform() && platform.getPlatform() === 'android';

export const isNativeMobile = (platform = Capacitor) =>
  platform.isNativePlatform() && ['android', 'ios'].includes(platform.getPlatform());

/** Keep token events and a browser-return refresh attached to the current identity. */
export function createAuthLifecycle({
  getUser, reloadUser, refreshToken, selectUser, isBusy = () => false,
  onUser = () => {}, onReady = () => {},
}) {
  let generation = 0;
  let selection = null;
  const refreshes = new Map();

  function select(user) {
    if (getUser() !== user || isBusy()) return Promise.resolve(false);
    const verified = Boolean(user?.emailVerified);
    if (selection?.user === user && selection.verified === verified) return selection.promise;
    const ticket = ++generation;
    const entry = { user, verified, promise: null };
    onUser(user);
    entry.promise = (async () => {
      try { await selectUser(user); }
      catch (error) {
        // A late failure belongs to its original selection, just like a late success.
        if (ticket !== generation || getUser() !== user) return false;
        throw error;
      }
      if (ticket !== generation || getUser() !== user) return false;
      onReady();
      return true;
    })().finally(() => { if (selection === entry) selection = null; });
    selection = entry;
    return entry.promise;
  }

  function refresh({ background = false } = {}) {
    const user = getUser();
    if (!user || (background && isBusy())) return Promise.resolve(null);
    if (user.emailVerified) return Promise.resolve(user);
    // Manual work may replace a deferred background refresh while the UI is busy.
    const key = background ? 'background' : 'manual';
    const existing = refreshes.get(key);
    if (existing?.user === user) return existing.promise;
    const current = () => getUser() === user && (!background || !isBusy());
    const entry = { user, promise: null };
    entry.promise = (async () => {
      await reloadUser(user);
      if (!current()) return null;
      if (user.emailVerified) {
        await refreshToken(user);
        if (!current()) return null;
        await select(user);
        if (!current()) return null;
      } else {
        // A still-unverified account does not need a store selection or course reset.
        onUser(user);
        onReady();
      }
      return user;
    })().finally(() => { if (refreshes.get(key) === entry) refreshes.delete(key); });
    refreshes.set(key, entry);
    return entry.promise;
  }

  return { select, refresh };
}

function topDialog(document) {
  const focused = document?.activeElement?.closest?.('dialog[open]');
  if (focused?.open) return focused;
  return [...(document?.querySelectorAll('dialog[open]') || [])].at(-1) || null;
}

/**
 * Android and iOS share App/Network. Browsers keep their existing DOM lifecycle.
 * Injected adapters let tests exercise the real event handlers without an emulator.
 * APIs: https://capacitorjs.com/docs/apis/app and /docs/apis/network (v8).
 */
export async function mountNativeLifecycle({
  store, getCourse = () => globalThis.BroteCourse,
  document = globalThis.document, isBusy = () => false,
  onConnection = () => {}, onResume = async () => {}, onError = () => {},
  platform = Capacitor,
  loadPlugins = async () => {
    const [{ App }, { Network }] = await Promise.all([import('@capacitor/app'), import('@capacitor/network')]);
    return { app: App, network: Network };
  },
}) {
  if (!isNativeMobile(platform)) return { native: false, dispose: async () => {}, resumeIfPending: async () => {} };
  const android = isAndroidNative(platform);
  const { app, network } = await loadPlugins();
  let disposed = false;
  let navigating = false;
  let resuming = null;
  let pendingResume = false;
  const handles = [];
  const report = error => { if (!disposed) onError(error); };
  const run = fn => { Promise.resolve().then(fn).catch(report); };
  const flushInputs = () => {
    if (store.isReady?.() === false) return;
    getCourse()?.flushInputs?.();
  };

  async function pause() {
    if (disposed) return;
    // Capture the current input immediately, before the OS can suspend the WebView.
    flushInputs();
    const results = await Promise.allSettled([store.flushLocal?.(), store.flush()]);
    for (const result of results) if (result.status === 'rejected') report(result.reason);
  }

  async function back() {
    // iOS has no hardware back/minimize API; navigation stays in the app's UI.
    if (!android) return 'unsupported';
    if (disposed || navigating || isBusy()) return 'blocked';
    navigating = true;
    try {
      const dialog = topDialog(document);
      if (dialog) {
        if (dialog.getAttribute('aria-busy') === 'true') return 'blocked';
        // Cancellation never clicks a confirmation. Respect an existing cancel veto.
        const EventClass = document?.defaultView?.Event || globalThis.Event;
        const allowed = dialog.dispatchEvent(new EventClass('cancel', { cancelable: true }));
        if (allowed && dialog.open) dialog.close();
        return 'dialog';
      }
      // The access screen has no learning progress to flush or path to return to.
      if (store.isReady?.() === false) {
        await app.minimizeApp();
        return 'minimized';
      }
      const course = getCourse();
      if (course?.backToPath?.()) return 'path';
      if (!course?.backToPath) flushInputs();
      if (await store.flushLocal?.() === false || disposed || isBusy()) return 'blocked';
      run(() => store.flush());
      await app.minimizeApp();
      return 'minimized';
    } finally {
      navigating = false;
    }
  }

  function resume() {
    if (disposed) return Promise.resolve(false);
    if (isBusy()) { pendingResume = true; return Promise.resolve(false); }
    if (resuming) return resuming;
    pendingResume = false;
    resuming = (async () => {
      try { onConnection(await network.getStatus()); } catch (error) { report(error); }
      if (disposed) return false;
      if (isBusy()) { pendingResume = true; return false; }
      try { await onResume(); } catch (error) { report(error); }
      if (disposed) return false;
      if (isBusy()) { pendingResume = true; return false; }
      await store.retry();
      return true;
    })().finally(() => { resuming = null; });
    return resuming;
  }

  try {
    if (android) handles.push(await app.addListener('backButton', () => run(back)));
    // Android: Activity.onPause. iOS: didEnterBackgroundNotification.
    handles.push(await app.addListener('pause', () => { pause().catch(report); }));
    handles.push(await app.addListener('resume', () => run(resume)));
    handles.push(await network.addListener('networkStatusChange', status => {
      if (disposed) return;
      onConnection(status);
      if (status.connected) run(resume);
    }));
    try { onConnection(await network.getStatus()); } catch (error) { report(error); }
    // Also recheck an account after a cold start from the verification browser.
    pendingResume = true;
  } catch (error) {
    disposed = true;
    await Promise.allSettled(handles.map(handle => handle.remove()));
    throw error;
  }

  return {
    native: true, back, pause, resume,
    resumeIfPending: () => pendingResume ? resume().catch(report) : Promise.resolve(false),
    async dispose() {
      disposed = true;
      pendingResume = false;
      await Promise.allSettled(handles.map(handle => handle.remove()));
    },
  };
}
