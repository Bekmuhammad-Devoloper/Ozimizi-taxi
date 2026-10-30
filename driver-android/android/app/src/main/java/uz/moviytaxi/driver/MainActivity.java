package uz.moviytaxi.driver;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
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
        askToIgnoreBatteryOptimizations();
    }

    @Override
    public void onResume() {
        super.onResume();
        DriverOnlineService.appInForeground = true;
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

    /**
     * Doze / app-standby would cut the network of a backgrounded app within
     * minutes and orders would stop arriving. Ask once (and again every few
     * days if the driver re-enabled optimization) to exempt the app.
     */
    private void askToIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null || pm.isIgnoringBatteryOptimizations(getPackageName())) return;
            SharedPreferences prefs = getSharedPreferences("moviy", MODE_PRIVATE);
            long last = prefs.getLong("battery_ask_at", 0);
            if (System.currentTimeMillis() - last < 3L * 24 * 3600 * 1000) return;
            prefs.edit().putLong("battery_ask_at", System.currentTimeMillis()).apply();
            Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + getPackageName()));
            startActivity(i);
        } catch (Exception ignored) {
            // some OEM ROMs don't support the dialog — nothing else to do
        }
    }
}
