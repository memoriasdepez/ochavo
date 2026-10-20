import { Capacitor, registerPlugin } from '@capacitor/core';

const OchavoSensory = registerPlugin('OchavoSensory');
const kinds = new Set(['correct', 'chest', 'badge']);
const quiet = reason => ({ played: false, hapticPlayed: false, reason });

/**
 * Sounds on native phones must go through the platform's silent-mode policy.
 * Never fall back to web audio or navigator.vibrate if a native plugin is absent.
 * This adapter is injectable so its failure/silent branches can be tested in Node.
 */
export function createNativeSensoryAdapter({ platform = Capacitor, plugin = OchavoSensory } = {}) {
  const native = platform.isNativePlatform() && ['android', 'ios'].includes(platform.getPlatform());
  return {
    native,
    async play(kind, { enabled = true, haptics = true } = {}) {
      if (!native) return quiet('not_native');
      if (!kinds.has(kind)) return quiet('invalid_kind');
      if (enabled !== true) return quiet('disabled');
      try {
        const result = await plugin.play({ kind, enabled: true, haptics: haptics === true });
        return {
          played: result?.played === true,
          hapticPlayed: result?.hapticPlayed === true,
          reason: typeof result?.reason === 'string' ? result.reason : 'unknown',
        };
      } catch {
        // Feedback never delays an exercise or exposes a native exception to users.
        return quiet('native_unavailable');
      }
    },
    async stop() {
      if (!native) return false;
      try { await plugin.stop(); return true; } catch { return false; }
    },
  };
}

export const nativeSensory = createNativeSensoryAdapter();
