import Capacitor

class OchavoBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(OchavoSensoryPlugin())
    }
}
