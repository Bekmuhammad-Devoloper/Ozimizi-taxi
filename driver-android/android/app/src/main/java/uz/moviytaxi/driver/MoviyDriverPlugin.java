package uz.moviytaxi.driver;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Bridge from the web app to DriverOnlineService:
 *   MoviyDriver.start({ token, apiBase })  — driver went ONLINE
 *   MoviyDriver.stop()                     — driver went OFFLINE / logged out
 *   MoviyDriver.stopAlarm({ orderId })     — accepted / declined in the app
 *   MoviyDriver.status()                   — { running }
 *   MoviyDriver.permissionState()          — what the first-start screen still needs
 *   MoviyDriver.askPermission({ kind })    — location | backgroundLocation | notifications | battery
 *   MoviyDriver.openAppSettings()          — for a permission denied for good
 */
@CapacitorPlugin(
    name = "MoviyDriver",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "backgroundLocation", strings = { "android.permission.ACCESS_BACKGROUND_LOCATION" }),
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }),
    }
)
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

    @PluginMethod
    public void permissionState(PluginCall call) {
        call.resolve(permissions());
    }

    @PluginMethod
    public void askPermission(PluginCall call) {
        String kind = call.getString("kind", "");
        JSObject now = permissions();
        if (now.optBoolean(kind, false)) {
            call.resolve(now);
            return;
        }
        switch (kind) {
            case "location":
                requestPermissionForAlias("location", call, "permissionAnswered");
                return;
            case "backgroundLocation":
                // Android 11+ opens the app's location page ("Allow all the time").
                if (!now.optBoolean("location", false)) requestPermissionForAlias("location", call, "permissionAnswered");
                else requestPermissionForAlias("backgroundLocation", call, "permissionAnswered");
                return;
            case "notifications":
                if (Build.VERSION.SDK_INT >= 33 && !granted("android.permission.POST_NOTIFICATIONS")) {
                    requestPermissionForAlias("notifications", call, "permissionAnswered");
                } else {
                    openNotificationSettings();
                    call.resolve(permissions());
                }
                return;
            case "battery":
                try {
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    i.setData(Uri.parse("package:" + getContext().getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(i);
                } catch (Exception e) {
                    openAppSettingsNow();
                }
                // The answer comes later — the web app re-checks when it is shown again.
                call.resolve(permissions());
                return;
            default:
                call.reject("unknown permission: " + kind);
        }
    }

    @PermissionCallback
    private void permissionAnswered(PluginCall call) {
        call.resolve(permissions());
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        openAppSettingsNow();
        call.resolve();
    }

    private void openAppSettingsNow() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private void openNotificationSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            openAppSettingsNow();
        }
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject permissions() {
        Context ctx = getContext();
        JSObject r = new JSObject();
        boolean location = granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION);
        r.put("location", location);
        r.put("backgroundLocation", Build.VERSION.SDK_INT < 29 ? location : granted("android.permission.ACCESS_BACKGROUND_LOCATION"));
        r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        boolean battery = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            battery = pm == null || pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
        }
        r.put("battery", battery);
        r.put("androidSdk", Build.VERSION.SDK_INT);
        return r;
    }

    private JSObject status() {
        JSObject r = new JSObject();
        r.put("running", DriverOnlineService.running);
        return r;
    }
}
