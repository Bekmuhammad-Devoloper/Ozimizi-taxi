package uz.moviytaxi.driver;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.SystemClock;
import android.util.Log;

import androidx.core.content.ContextCompat;

/**
 * Brings the online service back while the driver is online: after a reboot,
 * an app update, the task being swiped away / the process killed, and on a
 * periodic check. The driver pressing "Liniyadan chiqish" turns all this off.
 */
public class OnlineRestartReceiver extends BroadcastReceiver {
    private static final String ACTION_CHECK = "uz.moviytaxi.driver.ONLINE_CHECK";
    private static final long CHECK_EVERY_MS = 10 * 60 * 1000L;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ctx.getSharedPreferences(DriverOnlineService.PREFS, Context.MODE_PRIVATE).getBoolean("online", false)) return;
        if (!DriverOnlineService.running) {
            try {
                ContextCompat.startForegroundService(ctx, new Intent(ctx, DriverOnlineService.class));
            } catch (Exception e) {
                Log.w("MoviyOnline", "restart failed: " + e);
            }
        }
        schedule(ctx, CHECK_EVERY_MS);
    }

    private static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, OnlineRestartReceiver.class).setAction(ACTION_CHECK);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getBroadcast(ctx, 7001, i, flags);
    }

    /** Next check in `delayMs` (works in Doze too; inexact is fine here). */
    static void schedule(Context ctx, long delayMs) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        long at = SystemClock.elapsedRealtime() + delayMs;
        try {
            if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending(ctx));
            else am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, at, pending(ctx));
        } catch (Exception e) {
            Log.w("MoviyOnline", "schedule failed: " + e);
        }
    }

    static void scheduleRegular(Context ctx) {
        schedule(ctx, CHECK_EVERY_MS);
    }

    static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx));
    }
}
