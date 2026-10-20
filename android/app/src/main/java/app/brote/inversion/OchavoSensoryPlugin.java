package app.brote.inversion;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.SoundPool;
import android.os.Build;
import android.view.HapticFeedbackConstants;
import android.view.View;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** Brief local effects. No recording, audio routing changes, or extra permissions. */
@CapacitorPlugin(name = "OchavoSensory")
public class OchavoSensoryPlugin extends Plugin {
    private SoundPool soundPool;
    private final Map<String, Integer> sounds = new HashMap<>();
    private final Set<Integer> ready = new HashSet<>();
    private int playingStream;
    private boolean foreground = true;
    private boolean receiverRegistered;
    private final BroadcastReceiver quietReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!"allowed".equals(quietReason())) stopSound();
        }
    };

    @Override public void load() {
        // Sonification is governed by the system-sound stream, not media playback.
        soundPool = new SoundPool.Builder().setMaxStreams(1).setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
        ).build();
        soundPool.setOnLoadCompleteListener((pool, soundId, status) ->
            getActivity().runOnUiThread(() -> { if (soundPool == pool && status == 0) ready.add(soundId); })
        );
        for (String kind : new String[] { "correct", "chest", "badge" }) {
            try (AssetFileDescriptor asset = getContext().getAssets().openFd("public/sounds/" + kind + ".wav")) {
                sounds.put(kind, soundPool.load(asset, 1));
            } catch (IOException ignored) {
                // A missing sample disables feedback, never the lesson.
            }
        }
        IntentFilter filter = new IntentFilter(AudioManager.RINGER_MODE_CHANGED_ACTION);
        filter.addAction(NotificationManager.ACTION_INTERRUPTION_FILTER_CHANGED);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(quietReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(quietReceiver, filter);
        }
        receiverRegistered = true;
    }

    /** Recheck immediately before every sound and haptic; never infer from preferences. */
    private String quietReason() {
        if (!foreground || getActivity().isFinishing()) return "background";
        AudioManager audio = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audio == null) return "audio_state_unknown";
        if (audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) return "silent";
        if (audio.getStreamVolume(AudioManager.STREAM_SYSTEM) <= 0 || audio.isStreamMute(AudioManager.STREAM_SYSTEM)) return "volume_zero";
        NotificationManager notifications = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        if (notifications == null) return "audio_state_unknown";
        if (notifications.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL) return "do_not_disturb";
        return "allowed";
    }

    private void resolve(PluginCall call, boolean played, boolean hapticPlayed, String reason) {
        JSObject result = new JSObject();
        result.put("played", played);
        result.put("hapticPlayed", hapticPlayed);
        result.put("reason", reason);
        call.resolve(result);
    }

    @PluginMethod public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (!Boolean.TRUE.equals(call.getBoolean("enabled", false))) {
                stopSound();
                resolve(call, false, false, "disabled");
                return;
            }
            String kind = call.getString("kind", "");
            Integer soundId = sounds.get(kind);
            if (soundId == null) { resolve(call, false, false, "invalid_or_missing_kind"); return; }
            String quiet = quietReason();
            if (!"allowed".equals(quiet)) { stopSound(); resolve(call, false, false, quiet); return; }
            if (soundPool == null || !ready.contains(soundId)) { resolve(call, false, false, "audio_loading"); return; }
            stopSound();
            playingStream = soundPool.play(soundId, 0.48f, 0.48f, 1, 0, 1f);
            boolean haptic = false;
            if (playingStream != 0 && Boolean.TRUE.equals(call.getBoolean("haptics", true)) && "allowed".equals(quietReason())) {
                View view = getBridge().getWebView();
                // No ignore flags: respects global/view haptic settings; no VIBRATE permission.
                int effect = Build.VERSION.SDK_INT >= 30 ? HapticFeedbackConstants.CONFIRM : HapticFeedbackConstants.KEYBOARD_TAP;
                haptic = view != null && view.performHapticFeedback(effect);
            }
            resolve(call, playingStream != 0, haptic, playingStream != 0 ? "played" : "audio_unavailable");
        });
    }

    private void stopSound() {
        if (soundPool != null && playingStream != 0) soundPool.stop(playingStream);
        playingStream = 0;
    }

    @PluginMethod public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> { stopSound(); call.resolve(); });
    }

    @Override protected void handleOnPause() {
        foreground = false;
        getActivity().runOnUiThread(this::stopSound);
    }

    @Override protected void handleOnResume() { foreground = true; }

    @Override protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> {
            foreground = false;
            stopSound();
            if (receiverRegistered) {
                getContext().unregisterReceiver(quietReceiver);
                receiverRegistered = false;
            }
            if (soundPool != null) { soundPool.release(); soundPool = null; }
            ready.clear();
            sounds.clear();
        });
    }
}
