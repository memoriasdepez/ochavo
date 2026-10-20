import AVFAudio
import Capacitor
import UIKit

/** Ambient effects obey the iPhone's Silent switch and don't interrupt other audio. */
@objc(OchavoSensoryPlugin)
public class OchavoSensoryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "OchavoSensoryPlugin"
    public let jsName = "OchavoSensory"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]
    private var player: AVAudioPlayer?
    private var observers: [NSObjectProtocol] = []

    public override func load() {
        for name in [UIApplication.willResignActiveNotification, AVAudioSession.interruptionNotification] {
            observers.append(NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] _ in
                self?.stopSound()
            })
        }
    }

    deinit {
        for observer in observers { NotificationCenter.default.removeObserver(observer) }
        player?.stop()
    }

    private func resolve(_ call: CAPPluginCall, played: Bool, reason: String) {
        call.resolve(["played": played, "hapticPlayed": false, "reason": reason])
    }

    @objc func play(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            guard call.getBool("enabled") == true else {
                self.stopSound()
                self.resolve(call, played: false, reason: "disabled")
                return
            }
            guard UIApplication.shared.applicationState == .active else {
                self.resolve(call, played: false, reason: "background")
                return
            }
            guard let kind = call.getString("kind"), ["correct", "chest", "badge"].contains(kind) else {
                self.resolve(call, played: false, reason: "invalid_kind")
                return
            }
            guard let soundURL = Bundle.main.url(forResource: kind, withExtension: "wav", subdirectory: "public/sounds") else {
                self.resolve(call, played: false, reason: "missing_sample")
                return
            }
            do {
                let session = AVAudioSession.sharedInstance()
                // Never .playback: it bypasses Silent. Configure again after any ad/SDK audio.
                try session.setCategory(.ambient, mode: .default, options: [])
                try session.setActive(true)
                guard session.outputVolume > 0, UIApplication.shared.applicationState == .active else {
                    self.resolve(call, played: false, reason: "volume_zero_or_background")
                    return
                }
                self.stopSound()
                let effect = try AVAudioPlayer(contentsOf: soundURL)
                effect.volume = 0.48
                effect.numberOfLoops = 0
                effect.prepareToPlay()
                self.player = effect
                let started = effect.play()
                // iOS has no public reliable Silent-switch getter. Haptics can play in
                // Silent even when ambient audio is muted. Don't guess from volume,
                // isOutputMuted (session mute), or timing tricks: omit vibration here.
                self.resolve(call, played: started, reason: started ? "ambient_system_controls_silence" : "audio_unavailable")
            } catch {
                self.stopSound()
                self.resolve(call, played: false, reason: "audio_unavailable")
            }
        }
    }

    private func stopSound() {
        player?.stop()
        player = nil
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.stopSound()
            call.resolve()
        }
    }
}
