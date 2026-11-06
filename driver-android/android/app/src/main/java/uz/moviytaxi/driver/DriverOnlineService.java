package uz.moviytaxi.driver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Runs while the driver is ONLINE — even when the app is swiped away.
 *
 *  - long-polls GET /driver/inbox (25 s) for new orders and other events;
 *  - on a new order: 15 s loud alarm (looping chime on the alarm stream +
 *    vibration) + the order card over other apps with Accept / Decline
 *    (heads-up / full-screen notification when that can't be drawn or the
 *    screen is locked);
 *  - sends GPS to PATCH /driver/location every ~10 s while the app is in the
 *    background (in the foreground the web app's socket does it);
 *  - stops itself when the server says the driver went offline, on 401, or
 *    when the app calls MoviyDriver.stop() (driver pressed "Liniyadan chiqish").
 *
 * The JWT and API base are kept in SharedPreferences so a sticky restart
 * after the process was killed can resume; OnlineRestartReceiver brings the
 * service back after a reboot, a swipe or a kill while the driver is online.
 */
public class DriverOnlineService extends Service {
    private static final String TAG = "MoviyOnline";
    static final String PREFS = "moviy_online";
    static final String ACTION_START = "uz.moviytaxi.driver.ONLINE_START";
    static final String ACTION_STOP = "uz.moviytaxi.driver.ONLINE_STOP";
    static final String ACTION_STOP_ALARM = "uz.moviytaxi.driver.STOP_ALARM";

    private static final String CH_ONLINE = "moviy_online";
    private static final String CH_ALARM = "moviy_order_alarm_v2";
    private static final String CH_INFO = "moviy_info";
    private static final int NOTIF_ONLINE = 4100;
    private static final int NOTIF_ALARM = 4101;

    static volatile boolean running = false;
    static volatile boolean appInForeground = false;

    private volatile boolean polling = false;
    private Thread pollThread;
    private PowerManager.WakeLock wakeLock;
    private LocationManager locationManager;
    private LocationListener locationListener;
    private long lastLocationSent = 0;
    private final Handler main = new Handler(Looper.getMainLooper());

    private MediaPlayer player;
    private String ringingOrderId;
    private Runnable alarmTimeout;
    private Runnable vibrateLoop;
    private OrderOverlay overlay;
    private PowerManager.WakeLock screenLock;

    private static volatile DriverOnlineService instance;

    /** The app came to the front: its own offer dialog takes over from the card. */
    static void onAppForeground() {
        DriverOnlineService s = instance;
        if (s != null) s.main.post(s::hideOverlay);
    }

    // ---------------------------------------------------------------- life

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        if (ACTION_STOP.equals(action)) {
            prefs().edit().putBoolean("online", false).apply();
            OnlineRestartReceiver.cancel(this);
            stopEverything();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP_ALARM.equals(action)) {
            String id = intent.getStringExtra("orderId");
            stopAlarm(id);
            return START_STICKY;
        }
        if (intent != null && ACTION_START.equals(action)) {
            prefs().edit()
                .putString("token", intent.getStringExtra("token"))
                .putString("apiBase", intent.getStringExtra("apiBase"))
                .putBoolean("online", true)
                .apply();
        }
        // Sticky restart (intent == null) or explicit start.
        if (!prefs().getBoolean("online", false) || token() == null) {
            stopEverything();
            return START_NOT_STICKY;
        }
        if (!goForeground()) {
            stopEverything();
            return START_NOT_STICKY;
        }
        running = true;
        instance = this;
        OnlineRestartReceiver.scheduleRegular(this);
        acquireWakeLock();
        startLocation();
        startPolling();
        return START_STICKY;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App swiped away — keep working while the driver is online. Some phones
        // kill the service with the task, so a restart is booked just in case.
        if (prefs().getBoolean("online", false)) OnlineRestartReceiver.schedule(this, 3000);
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        // Stopped on purpose (or could not start) = running already false: no quick retry.
        boolean wasRunning = running;
        polling = false;
        running = false;
        stopAlarm(null);
        stopLocation();
        releaseWakeLock();
        instance = null;
        // Killed by the system while online → come back.
        if (wasRunning && prefs().getBoolean("online", false)) OnlineRestartReceiver.schedule(this, 5000);
        super.onDestroy();
    }

    private void stopEverything() {
        polling = false;
        running = false;
        stopAlarm(null);
        stopLocation();
        releaseWakeLock();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Exception ignored) {
        }
        stopSelf();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    private String token() {
        return prefs().getString("token", null);
    }

    private String apiBase() {
        String b = prefs().getString("apiBase", "https://moviytaxi.uz/api");
        return b.endsWith("/") ? b.substring(0, b.length() - 1) : b;
    }

    // --------------------------------------------------------- notifications

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel online = new NotificationChannel(CH_ONLINE, "Liniyada", NotificationManager.IMPORTANCE_LOW);
        online.setDescription("Liniyada ekaningizni ko‘rsatadi, buyurtmalarni kutadi");
        online.setShowBadge(false);
        nm.createNotificationChannel(online);

        NotificationChannel alarm = new NotificationChannel(CH_ALARM, "Buyurtma signali", NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("Yangi buyurtma — 15 soniyalik kuchli signal");
        alarm.setSound(null, null); // the chime is played by the service (alarm stream)
        alarm.enableVibration(false); // vibration is driven by the service
        alarm.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        alarm.setBypassDnd(true);
        nm.createNotificationChannel(alarm);

        NotificationChannel info = new NotificationChannel(CH_INFO, "Xabarlar (fonda)", NotificationManager.IMPORTANCE_DEFAULT);
        info.setDescription("Ilova yopiq paytdagi xabarlar, e’lonlar va bonus so‘rovlari");
        nm.createNotificationChannel(info);
    }

    private PendingIntent openAppIntent(String orderId) {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (orderId != null) i.putExtra("orderId", orderId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(this, orderId != null ? orderId.hashCode() : 0, i, flags);
    }

    private Notification onlineNotification() {
        return new NotificationCompat.Builder(this, CH_ONLINE)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(0xFF3B9BFF)
            .setContentTitle("Moviy Taxi — liniyadasiz")
            .setContentText("Buyurtmalar kutilmoqda. Ilova yopiq bo‘lsa ham signal keladi.")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openAppIntent(null))
            .build();
    }

    private boolean goForeground() {
        ensureChannels();
        Notification n = onlineNotification();
        if (Build.VERSION.SDK_INT >= 29 && hasLocationPermission()) {
            try {
                startForeground(NOTIF_ONLINE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                return true;
            } catch (Exception e) {
                // Restarted from the background: "location" may be refused.
                Log.w(TAG, "location foreground refused: " + e);
            }
        }
        try {
            if (Build.VERSION.SDK_INT >= 34) startForeground(NOTIF_ONLINE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(NOTIF_ONLINE, n);
            return true;
        } catch (Exception e) {
            Log.w(TAG, "startForeground failed: " + e);
            return false;
        }
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void infoNotification(String title, String body) {
        if (appInForeground) return; // the web app shows it itself
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification n = new NotificationCompat.Builder(this, CH_INFO)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setColor(0xFF3B9BFF)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(null))
            .build();
        nm.notify((int) (System.currentTimeMillis() % 100000) + 5000, n);
    }

    // ----------------------------------------------------------------- alarm

    private void startAlarm(final String orderId, int seconds, String title, String body, final JSONObject offer) {
        main.post(() -> {
            stopAlarmInternal();
            ringingOrderId = orderId;
            int secs = Math.max(5, Math.min(60, seconds));

            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            boolean screenOn = pm == null || pm.isInteractive();
            if (!screenOn) wakeScreen(pm, secs);
            boolean cardShown = !appInForeground && showOverlay(orderId, secs, title, offer);

            // Card on an unlocked screen is enough; otherwise the notification
            // (full-screen on a locked phone) opens the app over the lock screen.
            if (!appInForeground && !(cardShown && screenOn)) {
                NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    PendingIntent open = openAppIntent(orderId);
                    Notification n = new NotificationCompat.Builder(this, CH_ALARM)
                        .setSmallIcon(R.drawable.ic_stat_notify)
                        .setColor(0xFF3B9BFF)
                        .setContentTitle(title)
                        .setContentText(body)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_CALL)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setAutoCancel(true)
                        .setTimeoutAfter(secs * 1000L)
                        .setContentIntent(open)
                        .setFullScreenIntent(open, true)
                        .addAction(0, "Ochish va qabul qilish", open)
                        .build();
                    nm.notify(NOTIF_ALARM, n);
                }
            }

            try {
                player = new MediaPlayer();
                player.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build());
                player.setDataSource(this, Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.order_alert));
                player.setLooping(true);
                player.prepare();
                player.start();
            } catch (Exception e) {
                Log.w(TAG, "alarm sound failed: " + e);
            }

            final Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            vibrateLoop = new Runnable() {
                @Override
                public void run() {
                    try {
                        if (vib != null) {
                            if (Build.VERSION.SDK_INT >= 26) {
                                vib.vibrate(VibrationEffect.createWaveform(new long[]{0, 700, 300, 700}, -1));
                            } else {
                                vib.vibrate(new long[]{0, 700, 300, 700}, -1);
                            }
                        }
                    } catch (Exception ignored) {
                    }
                    main.postDelayed(this, 2500);
                }
            };
            main.post(vibrateLoop);
            alarmTimeout = () -> stopAlarm(orderId);
            main.postDelayed(alarmTimeout, secs * 1000L);
        });
        // Tell the server the phone is ringing (admin timeline).
        new Thread(() -> request("POST", "/driver/orders/" + orderId + "/ring", "{\"via\":\"service\"}", 10_000)).start();
    }

    /** Stop the alarm; with an orderId only if that order is the one ringing. */
    void stopAlarm(final String orderId) {
        main.post(() -> {
            if (orderId != null && ringingOrderId != null && !orderId.equals(ringingOrderId)) return;
            stopAlarmInternal();
        });
    }

    private String clean(JSONObject o, String key) {
        if (o == null) return "";
        String s = o.optString(key, "");
        return "null".equals(s) ? "" : s;
    }

    private boolean showOverlay(final String orderId, int secs, String title, final JSONObject p) {
        if (!OrderOverlay.allowed(this)) return false;
        if (overlay == null) overlay = new OrderOverlay(getApplicationContext());
        final String kind = clean(p, "kind");
        String from = clean(p.optJSONObject("pickup"), "address");
        String to = clean(p.optJSONObject("destination"), "address");
        StringBuilder meta = new StringBuilder(String.format(java.util.Locale.US, "%.1f km uzoqlikda", p.optDouble("distanceFromDriver", 0)));
        double price = p.optDouble("estimatedPrice", 0);
        if (price > 0) {
            meta.append(String.format(java.util.Locale.US, " · ~%,.0f so‘m", price).replace(',', ' '));
        }
        return overlay.show(title, from, to, meta.toString(), secs, new OrderOverlay.Actions() {
            @Override
            public void accept() {
                acceptFromOverlay(orderId, kind);
            }

            @Override
            public void decline() {
                stopAlarm(orderId);
                new Thread(() -> request("POST", "/driver/orders/" + orderId + "/decline", "{}", 10_000)).start();
            }
        });
    }

    private void acceptFromOverlay(final String orderId, final String kind) {
        if (overlay != null) overlay.showNote("Qabul qilinmoqda…");
        // The sound stops at once; the card stays until the answer comes.
        main.post(this::silenceAlarm);
        final String path = "delivery".equals(kind)
            ? "/driver/deliveries/" + orderId + "/accept"
            : "/driver/orders/" + orderId + "/accept";
        new Thread(() -> {
            Response r = request("POST", path, "{}", 15_000);
            main.post(() -> {
                if (r.code >= 200 && r.code < 300) {
                    stopAlarmInternal();
                    openApp(orderId);
                    return;
                }
                String msg = "Qabul qilib bo‘lmadi";
                try {
                    if (r.body != null) msg = new JSONObject(r.body).optString("message", msg);
                } catch (Exception ignored) {
                }
                if (overlay != null) overlay.showNote(msg);
                main.postDelayed(this::stopAlarmInternal, 2500);
            });
        }).start();
    }

    private void openApp(String orderId) {
        try {
            Intent i = new Intent(this, MainActivity.class);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            i.putExtra("orderId", orderId);
            startActivity(i);
        } catch (Exception e) {
            Log.w(TAG, "open app failed: " + e);
        }
    }

    private void hideOverlay() {
        if (overlay != null) overlay.hide();
    }

    /** The screen is off: light it up for as long as the offer rings. */
    private void wakeScreen(PowerManager pm, int secs) {
        try {
            if (screenLock != null && screenLock.isHeld()) screenLock.release();
            screenLock = pm.newWakeLock(
                PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "MoviyTaxi:order");
            screenLock.setReferenceCounted(false);
            screenLock.acquire(secs * 1000L);
        } catch (Exception e) {
            Log.w(TAG, "wake screen failed: " + e);
        }
    }

    private void stopAlarmInternal() {
        hideOverlay();
        try {
            if (screenLock != null && screenLock.isHeld()) screenLock.release();
        } catch (Exception ignored) {
        }
        silenceAlarm();
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(NOTIF_ALARM);
        ringingOrderId = null;
    }

    private void silenceAlarm() {
        if (alarmTimeout != null) main.removeCallbacks(alarmTimeout);
        if (vibrateLoop != null) main.removeCallbacks(vibrateLoop);
        alarmTimeout = null;
        vibrateLoop = null;
        try {
            Vibrator vib = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vib != null) vib.cancel();
        } catch (Exception ignored) {
        }
        if (player != null) {
            try {
                player.stop();
            } catch (Exception ignored) {
            }
            player.release();
            player = null;
        }
    }

    // --------------------------------------------------------------- polling

    private void startPolling() {
        if (polling) return;
        polling = true;
        pollThread = new Thread(this::pollLoop, "moviy-inbox");
        pollThread.start();
    }

    private void pollLoop() {
        Long after = null;
        int failures = 0;
        while (polling) {
            String path = "/driver/inbox" + (after != null ? "?after=" + after : "");
            Response r = request("GET", path, null, 40_000);
            if (!polling) break;
            if (r.code == 401 || r.code == 403) {
                Log.w(TAG, "token rejected — stopping");
                prefs().edit().putBoolean("online", false).apply();
                main.post(this::stopEverything);
                break;
            }
            if (r.code != 200 || r.body == null) {
                failures++;
                sleep(Math.min(30_000, 2_000L * failures));
                continue;
            }
            failures = 0;
            try {
                JSONObject j = new JSONObject(r.body);
                if (j.optBoolean("offline", false)) {
                    // Went offline (maybe from another phone) — stop working.
                    prefs().edit().putBoolean("online", false).apply();
                    main.post(this::stopEverything);
                    break;
                }
                boolean firstSync = after == null;
                after = j.optLong("last", after == null ? 0 : after);
                if (firstSync) {
                    // Just (re)started: an offer may already be ringing for this driver.
                    resumeCurrentOffer();
                    continue;
                }
                JSONArray events = j.optJSONArray("events");
                if (events == null) continue;
                for (int k = 0; k < events.length(); k++) handleEvent(events.getJSONObject(k));
            } catch (Exception e) {
                Log.w(TAG, "bad inbox payload: " + e);
            }
        }
    }

    private void resumeCurrentOffer() {
        if (appInForeground) return;
        Response r = request("GET", "/driver/offers/current", null, 15_000);
        if (r.code != 200 || r.body == null || r.body.isEmpty() || "null".equals(r.body)) return;
        try {
            JSONObject p = new JSONObject(r.body);
            if (p.optString("orderId", "").isEmpty()) return;
            ringOffer(p, p.optInt("remainingSeconds", p.optInt("offerSeconds", 15)));
        } catch (Exception e) {
            Log.w(TAG, "bad current offer: " + e);
        }
    }

    private void ringOffer(JSONObject p, int seconds) {
        String orderId = p.optString("orderId");
        boolean all = "all".equals(p.optString("mode"));
        boolean delivery = "delivery".equals(p.optString("kind"));
        double km = p.optDouble("distanceFromDriver", 0);
        String addr = clean(p.optJSONObject("pickup"), "address");
        String title = delivery
            ? (all ? "🍽 Yetkazish hammaga — tez oling!" : "🍽 Yetkazish sizga!")
            : (all ? "🚕 Buyurtma hammaga — tez oling!" : "🚕 Yangi buyurtma sizga!");
        String body = String.format(java.util.Locale.US, "%.1f km uzoqlikda%s — %d soniya ichida qabul qiling",
            km, addr.isEmpty() ? "" : " · " + addr, seconds);
        startAlarm(orderId, seconds, title, body, p);
    }

    private void handleEvent(JSONObject e) {
        String event = e.optString("event");
        JSONObject p = e.optJSONObject("payload");
        if (p == null) p = new JSONObject();
        switch (event) {
            case "new_order": {
                ringOffer(p, p.optInt("offerSeconds", 15));
                break;
            }
            case "order_offer_expired":
            case "order_taken":
                stopAlarm(p.optString("orderId", null));
                break;
            case "order_cancelled":
                stopAlarm(p.optString("orderId", null));
                infoNotification("❌ Buyurtma bekor qilindi", "Mijoz yoki admin buyurtmani bekor qildi.");
                break;
            case "order_message":
                infoNotification("💬 Mijozdan xabar", p.optString("text", ""));
                break;
            case "announcement":
                infoNotification("📢 " + p.optString("title", "Xabar"), p.optString("text", ""));
                break;
            case "bonus_request":
                infoNotification("💰 Bonusdan to‘lov so‘rovi", "Mijoz safar uchun bonusdan to‘lamoqchi — ilovada tasdiqlang.");
                break;
            default:
                break;
        }
    }

    // -------------------------------------------------------------- location

    private void startLocation() {
        if (locationListener != null || !hasLocationPermission()) return;
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;
        locationListener = new LocationListener() {
            @Override
            public void onLocationChanged(Location loc) {
                onFix(loc);
            }

            @Override
            public void onStatusChanged(String provider, int status, Bundle extras) {
            }

            @Override
            public void onProviderEnabled(String provider) {
            }

            @Override
            public void onProviderDisabled(String provider) {
            }
        };
        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 10_000, 10, locationListener, Looper.getMainLooper());
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 15_000, 20, locationListener, Looper.getMainLooper());
            }
        } catch (SecurityException e) {
            Log.w(TAG, "no location permission: " + e);
        }
    }

    private void stopLocation() {
        if (locationManager != null && locationListener != null) {
            try {
                locationManager.removeUpdates(locationListener);
            } catch (Exception ignored) {
            }
        }
        locationListener = null;
    }

    private void onFix(Location loc) {
        // In the foreground the web app already streams GPS over its socket.
        if (appInForeground) return;
        if (loc.hasAccuracy() && loc.getAccuracy() > 80) return;
        long now = System.currentTimeMillis();
        if (now - lastLocationSent < 9_000) return;
        lastLocationSent = now;
        final String body = String.format(java.util.Locale.US, "{\"lat\":%.7f,\"lng\":%.7f}", loc.getLatitude(), loc.getLongitude());
        new Thread(() -> request("POST", "/driver/location", body, 15_000)).start();
    }

    // ------------------------------------------------------------------ http

    private static class Response {
        int code;
        String body;
    }

    private Response request(String method, String path, String json, int timeoutMs) {
        Response r = new Response();
        HttpURLConnection c = null;
        try {
            URL url = new URL(apiBase() + path);
            c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod(method);
            c.setConnectTimeout(15_000);
            c.setReadTimeout(timeoutMs);
            c.setRequestProperty("Authorization", "Bearer " + token());
            c.setRequestProperty("Accept", "application/json");
            if (json != null) {
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                try (OutputStream os = c.getOutputStream()) {
                    os.write(json.getBytes(StandardCharsets.UTF_8));
                }
            }
            r.code = c.getResponseCode();
            InputStream is = r.code < 400 ? c.getInputStream() : c.getErrorStream();
            if (is != null) {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                }
                r.body = sb.toString();
            }
        } catch (Exception e) {
            r.code = -1;
        } finally {
            if (c != null) c.disconnect();
        }
        return r;
    }

    // ------------------------------------------------------------------ misc

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm == null) return;
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MoviyTaxi:online");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {
        }
        wakeLock = null;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }
}
