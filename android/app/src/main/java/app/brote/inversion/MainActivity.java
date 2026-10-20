package app.brote.inversion;

import com.getcapacitor.BridgeActivity;
import android.content.pm.ApplicationInfo;
import android.os.Bundle;
import android.webkit.WebView;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OchavoSensoryPlugin.class);
        super.onCreate(savedInstanceState);
        // Inspect the actual Android app during QA; release builds always disable it.
        // https://developer.android.com/develop/ui/views/layout/webapps/debug-chrome-devtools
        WebView.setWebContentsDebuggingEnabled(
            (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0
        );
    }
}
