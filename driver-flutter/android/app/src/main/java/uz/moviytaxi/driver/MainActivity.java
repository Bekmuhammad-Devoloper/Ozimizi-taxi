package uz.moviytaxi.driver;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import androidx.annotation.NonNull;

import io.flutter.embedding.android.FlutterActivity;
import io.flutter.embedding.engine.FlutterEngine;
import io.flutter.plugin.common.MethodChannel;

public class MainActivity extends FlutterActivity {
    private NativeBridge bridge;

    @Override
    public void configureFlutterEngine(@NonNull FlutterEngine engine) {
        super.configureFlutterEngine(engine);
        bridge = new NativeBridge(this);
        new MethodChannel(engine.getDartExecutor().getBinaryMessenger(), NativeBridge.CHANNEL).setMethodCallHandler(bridge);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Drivers keep the app open on the dashboard while working: the screen
        // must never time out while the app is in the foreground.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        // Opened from the order alarm: show over the lock screen.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        DriverOnlineService.appInForeground = true;
        DriverOnlineService.onAppForeground();
    }

    @Override
    protected void onPause() {
        super.onPause();
        DriverOnlineService.appInForeground = false;
    }

    @Override
    protected void onDestroy() {
        DriverOnlineService.appInForeground = false;
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (bridge != null) bridge.onPermissionResult(requestCode);
    }
}
