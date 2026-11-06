package uz.moviytaxi.driver;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.HashMap;
import java.util.Map;

import io.flutter.plugin.common.MethodCall;
import io.flutter.plugin.common.MethodChannel;

/**
 * Bridge from Dart (lib/core/native.dart) to the Android side:
 *   start / stop / status / stopAlarm — DriverOnlineService
 *   permissionState / askPermission / openAppSettings — first-start screen
 *   legacyToken — the login kept by the older web-based app's service
 *   notify — a notification while the app is in the background
 *   navSay / navStop — the navigation voice
 */
final class NativeBridge implements MethodChannel.MethodCallHandler {
    static final String CHANNEL = "uz.moviytaxi.driver/native";
    private static final int REQ_PERMISSION = 7100;

    private final Activity activity;
    private MethodChannel.Result pending;
    private VoicePlayer voice;

    NativeBridge(Activity activity) {
        this.activity = activity;
    }

    private VoicePlayer voice() {
        if (voice == null) voice = new VoicePlayer(activity);
        return voice;
    }

    @Override
    public void onMethodCall(@NonNull MethodCall call, @NonNull MethodChannel.Result result) {
        switch (call.method) {
            case "start":
                start(call.argument("token"), call.argument("apiBase"), result);
                break;
            case "stop":
                stop();
                result.success(null);
                break;
            case "status":
                result.success(DriverOnlineService.running);
                break;
            case "stopAlarm":
                stopAlarm(call.argument("orderId"));
                result.success(null);
                break;
            case "legacyToken":
                result.success(activity.getSharedPreferences(DriverOnlineService.PREFS, Context.MODE_PRIVATE).getString("token", null));
                break;
            case "notify":
                DriverOnlineService.notifyInfo(activity, call.argument("title"), call.argument("body"));
                result.success(null);
                break;
            case "permissionState":
                result.success(permissions());
                break;
            case "askPermission":
                ask(call.argument("kind"), result);
                break;
            case "openAppSettings":
                openAppSettings();
                result.success(null);
                break;
            case "navSay":
                voice().say(call.argument("clips"));
                result.success(null);
                break;
            case "navStop":
                if (voice != null) voice.stop();
                result.success(null);
                break;
            default:
                result.notImplemented();
        }
    }

    private void start(String token, String apiBase, MethodChannel.Result result) {
        if (token == null || token.isEmpty()) {
            result.success(false);
            return;
        }
        Intent i = new Intent(activity, DriverOnlineService.class);
        i.setAction(DriverOnlineService.ACTION_START);
        i.putExtra("token", token);
        i.putExtra("apiBase", apiBase != null ? apiBase : "https://moviytaxi.uz/api");
        try {
            ContextCompat.startForegroundService(activity, i);
            result.success(true);
        } catch (Exception e) {
            result.success(false);
        }
    }

    private void stop() {
        activity.getSharedPreferences(DriverOnlineService.PREFS, Context.MODE_PRIVATE).edit().putBoolean("online", false).apply();
        OnlineRestartReceiver.cancel(activity);
        if (!DriverOnlineService.running) return;
        Intent i = new Intent(activity, DriverOnlineService.class);
        i.setAction(DriverOnlineService.ACTION_STOP);
        try {
            activity.startService(i);
        } catch (Exception ignored) {
            activity.stopService(new Intent(activity, DriverOnlineService.class));
        }
    }

    private void stopAlarm(String orderId) {
        if (!DriverOnlineService.running) return;
        Intent i = new Intent(activity, DriverOnlineService.class);
        i.setAction(DriverOnlineService.ACTION_STOP_ALARM);
        i.putExtra("orderId", orderId);
        try {
            activity.startService(i);
        } catch (Exception ignored) {
        }
    }

    // ------------------------------------------------------------ permissions

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(activity, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private Map<String, Object> permissions() {
        Map<String, Object> r = new HashMap<>();
        boolean location = granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION);
        r.put("location", location);
        r.put("backgroundLocation", Build.VERSION.SDK_INT < 29 ? location : granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION));
        r.put("notifications", NotificationManagerCompat.from(activity).areNotificationsEnabled());
        boolean battery = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
            battery = pm == null || pm.isIgnoringBatteryOptimizations(activity.getPackageName());
        }
        r.put("battery", battery);
        r.put("overlay", OrderOverlay.allowed(activity));
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            fullScreen = nm == null || nm.canUseFullScreenIntent();
        }
        r.put("fullScreen", fullScreen);
        r.put("autostartScreen", autostartScreenExists());
        return r;
    }

    private void ask(String kind, MethodChannel.Result result) {
        if (kind == null) {
            result.success(permissions());
            return;
        }
        switch (kind) {
            case "location":
                request(result, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION);
                return;
            case "backgroundLocation":
                // Android 11+ opens the app's location page ("Allow all the time").
                if (!granted(Manifest.permission.ACCESS_FINE_LOCATION) && !granted(Manifest.permission.ACCESS_COARSE_LOCATION)) {
                    request(result, Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION);
                } else if (Build.VERSION.SDK_INT >= 29) {
                    request(result, Manifest.permission.ACCESS_BACKGROUND_LOCATION);
                } else {
                    result.success(permissions());
                }
                return;
            case "notifications":
                if (Build.VERSION.SDK_INT >= 33 && !granted(Manifest.permission.POST_NOTIFICATIONS)) {
                    request(result, Manifest.permission.POST_NOTIFICATIONS);
                } else {
                    openNotificationSettings();
                    result.success(permissions());
                }
                return;
            case "battery":
                openSettings(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                break;
            case "overlay":
                openSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
                break;
            case "fullScreen":
                openSettings("android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT");
                break;
            case "autostart":
                openAutostart();
                break;
            default:
                break;
        }
        // The answer comes later — the screen re-checks when it is shown again.
        result.success(permissions());
    }

    private void request(MethodChannel.Result result, String... perms) {
        if (pending != null) {
            pending.success(permissions());
        }
        pending = result;
        ActivityCompat.requestPermissions(activity, perms, REQ_PERMISSION);
    }

    /** Called from MainActivity.onRequestPermissionsResult. */
    void onPermissionResult(int requestCode) {
        if (requestCode != REQ_PERMISSION || pending == null) return;
        MethodChannel.Result r = pending;
        pending = null;
        r.success(permissions());
    }

    private void openSettings(String action) {
        try {
            Intent i = new Intent(action);
            i.setData(Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(i);
        } catch (Exception e) {
            openAppSettings();
        }
    }

    private void openAppSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + activity.getPackageName()));
            activity.startActivity(i);
        } catch (Exception ignored) {
        }
    }

    private void openNotificationSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, activity.getPackageName());
            activity.startActivity(i);
        } catch (Exception e) {
            openAppSettings();
        }
    }

    // Phone makers' own "autostart" screens: without this they kill background apps.
    private static final String[][] AUTOSTART = {
        {"com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"},
        {"com.letv.android.letvsafe", "com.letv.android.letvsafe.AutobootManageActivity"},
        {"com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"},
        {"com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"},
        {"com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"},
        {"com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"},
        {"com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"},
        {"com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity"},
        {"com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"},
        {"com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity"},
        {"com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"},
        {"com.asus.mobilemanager", "com.asus.mobilemanager.entry.FunctionActivity"},
    };

    private boolean autostartScreenExists() {
        for (String[] c : AUTOSTART) {
            Intent i = new Intent().setClassName(c[0], c[1]);
            if (activity.getPackageManager().resolveActivity(i, 0) != null) return true;
        }
        return false;
    }

    private void openAutostart() {
        for (String[] c : AUTOSTART) {
            try {
                Intent i = new Intent().setClassName(c[0], c[1]);
                if (activity.getPackageManager().resolveActivity(i, 0) == null) continue;
                activity.startActivity(i);
                return;
            } catch (Exception ignored) {
                // this phone guards that screen — try the next one
            }
        }
        openAppSettings();
    }
}
