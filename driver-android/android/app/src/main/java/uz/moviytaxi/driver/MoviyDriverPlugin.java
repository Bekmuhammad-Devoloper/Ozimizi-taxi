package uz.moviytaxi.driver;

import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bridge from the web app to DriverOnlineService:
 *   MoviyDriver.start({ token, apiBase })  — driver went ONLINE
 *   MoviyDriver.stop()                     — driver went OFFLINE / logged out
 *   MoviyDriver.stopAlarm({ orderId })     — accepted / declined in the app
 *   MoviyDriver.status()                   — { running }
 */
@CapacitorPlugin(name = "MoviyDriver")
public class MoviyDriverPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String token = call.getString("token");
        String apiBase = call.getString("apiBase", "https://moviytaxi.uz/api");
        if (token == null || token.isEmpty()) {
            call.reject("token required");
            return;
        }
        Intent i = new Intent(getContext(), DriverOnlineService.class);
        i.setAction(DriverOnlineService.ACTION_START);
        i.putExtra("token", token);
        i.putExtra("apiBase", apiBase);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve(status());
        } catch (Exception e) {
            call.reject("service start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().getSharedPreferences(DriverOnlineService.PREFS, 0).edit().putBoolean("online", false).apply();
        if (DriverOnlineService.running) {
            Intent i = new Intent(getContext(), DriverOnlineService.class);
            i.setAction(DriverOnlineService.ACTION_STOP);
            try {
                getContext().startService(i);
            } catch (Exception ignored) {
                getContext().stopService(new Intent(getContext(), DriverOnlineService.class));
            }
        }
        call.resolve(status());
    }

    @PluginMethod
    public void stopAlarm(PluginCall call) {
        if (DriverOnlineService.running) {
            Intent i = new Intent(getContext(), DriverOnlineService.class);
            i.setAction(DriverOnlineService.ACTION_STOP_ALARM);
            i.putExtra("orderId", call.getString("orderId"));
            try {
                getContext().startService(i);
            } catch (Exception ignored) {
            }
        }
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(status());
    }

    /** App version for the admin's "which version is this driver on" view. */
    @PluginMethod
    public void info(PluginCall call) {
        JSObject r = new JSObject();
        try {
            android.content.pm.PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            r.put("version", pi.versionName);
            r.put("build", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode);
        } catch (Exception e) {
            r.put("version", "unknown");
        }
        r.put("platform", "android");
        r.put("androidSdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    private JSObject status() {
        JSObject r = new JSObject();
        r.put("running", DriverOnlineService.running);
        return r;
    }
}
