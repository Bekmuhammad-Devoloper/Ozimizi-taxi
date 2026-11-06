import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'lang.dart';

/// The Android side: background service, alarm, permissions (see NativeBridge.java).
const _ch = MethodChannel('uz.moviytaxi.driver/native');

Future<T?> _call<T>(String method, [Map<String, dynamic>? args]) async {
  try {
    return await _ch.invokeMethod<T>(method, args);
  } on MissingPluginException {
    return null; // not on Android (tests)
  } on PlatformException {
    return null;
  }
}

Future<bool> serviceStart(String token, String apiBase) async =>
    (await _call<bool>('start', {'token': token, 'apiBase': apiBase})) ?? false;
Future<void> serviceStop() => _call('stop');
Future<bool> serviceRunning() async => (await _call<bool>('status')) ?? false;
Future<void> stopAlarm([String? orderId]) => _call('stopAlarm', {'orderId': orderId});
Future<String?> legacyToken() => _call<String>('legacyToken');
Future<void> notify(String title, String body) =>
    _call('notify', {'title': tr(title), 'body': tr(body)});
Future<void> openAppSettings() => _call('openAppSettings');

/// Navigation voice: says the clips (res/raw/nav_<name>.mp3) one after another.
Future<void> navSay(List<String> clips) => _call('navSay', {'clips': clips});
Future<void> navStop() => _call('navStop');

class AppInfo {
  final String version;
  final String platform;
  const AppInfo(this.version, this.platform);
}

const permKinds = ['location', 'backgroundLocation', 'notifications', 'battery', 'overlay', 'fullScreen', 'autostart'];
const _autostartKey = 'moviy-autostart-asked';

/// true granted · false missing · null not relevant on this phone.
Future<Map<String, bool?>> permissionState() async {
  final r = await _call<Map>('permissionState');
  if (r == null) return {for (final k in permKinds) k: null};
  final p = await SharedPreferences.getInstance();
  return {
    'location': r['location'] == true,
    'backgroundLocation': r['backgroundLocation'] == true,
    'notifications': r['notifications'] == true,
    'battery': r['battery'] == true,
    'overlay': r['overlay'] == true,
    'fullScreen': r['fullScreen'] == true,
    // Android can't tell whether "autostart" is on: opening its screen once counts.
    'autostart': r['autostartScreen'] == true ? (p.getBool(_autostartKey) ?? false) : null,
  };
}

Future<Map<String, bool?>> askPermission(String kind) async {
  await _call('askPermission', {'kind': kind});
  if (kind == 'autostart') {
    final p = await SharedPreferences.getInstance();
    await p.setBool(_autostartKey, true);
  }
  return permissionState();
}
