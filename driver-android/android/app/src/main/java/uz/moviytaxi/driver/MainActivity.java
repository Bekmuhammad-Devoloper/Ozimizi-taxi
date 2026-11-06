package uz.moviytaxi.driver;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Native bridge to the background "online" service.
        registerPlugin(MoviyDriverPlugin.class);
        super.onCreate(savedInstanceState);
        // Drivers keep the app open on the dashboard while working: the screen
        // must never time out while the app is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Opened from the order alarm: show over the lock screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        // Battery / location / notification permissions are asked by the
        // first-start screen of the web app (MoviyDriver.askPermission).
    }

    @Override
    public void onResume() {
        super.onResume();
        DriverOnlineService.appInForeground = true;
        DriverOnlineService.onAppForeground();
    }

    /**
     * While the driver is ONLINE keep the WebView running in the background
     * (socket + in-app alarm). Offline, let Android pause it to save battery —
     * the background service is the one that rings when the app is closed.
     */
    @Override
    public void onPause() {
        super.onPause();
        DriverOnlineService.appInForeground = false;
        if (!DriverOnlineService.running) return;
        try {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv != null) {
                wv.onResume();
                wv.resumeTimers();
            }
        } catch (Exception ignored) {
            // best effort
        }
    }

    @Override
    public void onDestroy() {
        DriverOnlineService.appInForeground = false;
        super.onDestroy();
    }
}
