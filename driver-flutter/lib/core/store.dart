import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'native.dart' as native;
import 'util.dart';

typedef Json = Map<String, dynamic>;

Json? asJson(dynamic v) => v is Map ? v.cast<String, dynamic>() : null;

/// Who is logged in. `driver` is the server's driver object.
class AuthStore extends ChangeNotifier {
  static const _key = 'taxi-driver-auth';
  String? token;
  Json? driver;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_key);
    if (raw != null) {
      try {
        final j = jsonDecode(raw) as Map;
        token = j['token'] as String?;
        driver = asJson(j['driver']);
      } catch (_) {}
    }
    // Coming from the old (web) app: its service kept the login.
    if (token == null) {
      token = await native.legacyToken();
      if (token != null) await _save();
    }
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, jsonEncode({'token': token, 'driver': driver}));
  }

  void setAuth(String t, Json d) {
    token = t;
    driver = d;
    notifyListeners();
    _save();
  }

  /// Merge fields into the driver.
  void setDriver(Json patch) {
    driver = {...?driver, ...patch};
    notifyListeners();
    _save();
  }

  Future<void> refreshMe() async {
    try {
      final r = await api.get('/driver/me');
      if (r.data is Map) setDriver(asJson(r.data)!);
    } catch (_) {}
  }

  void logout() {
    if (token == null && driver == null) return;
    native.serviceStop();
    token = null;
    driver = null;
    notifyListeners();
    _save();
  }

  bool get online => driver?['isOnline'] == true;
  bool get isCourier => driver?['kind'] == 'courier';
  bool get takesDeliveries => isCourier || driver?['acceptDelivery'] == true;
}

/// The ride in progress, the offer ringing now and the ride's GPS distance.
class OrderStore extends ChangeNotifier {
  static const _key = 'taxi-driver-order';
  Json? active;
  Json? incoming;
  Json? bonusRequest;
  String gpsStatus = 'searching'; // searching | ok | denied | unavailable
  double trackedKm = 0;
  double trackedOutsideKm = 0;
  bool waitPending = false;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_key);
    if (raw == null) return;
    try {
      final j = jsonDecode(raw) as Map;
      active = asJson(j['active']);
      trackedKm = numOf(j['km']);
      trackedOutsideKm = numOf(j['outsideKm']);
    } catch (_) {}
  }

  Future<void> _save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, jsonEncode({'active': active, 'km': trackedKm, 'outsideKm': trackedOutsideKm}));
  }

  void touch() => notifyListeners();

  void setActive(Json? o) {
    active = o;
    notifyListeners();
    _save();
  }

  /// Merge fields into the CURRENT active order; no-op when it is another one.
  void patchActive(String id, Json patch) {
    if (active == null || active!['id'] != id || patch.isEmpty) return;
    active = {...active!, ...patch};
    notifyListeners();
    _save();
  }

  void setIncoming(Json? o) {
    incoming = o;
    notifyListeners();
  }

  void setBonusRequest(Json? r) {
    bonusRequest = r;
    notifyListeners();
  }

  void setGps(String s) {
    if (s == gpsStatus) return;
    gpsStatus = s;
    notifyListeners();
  }

  void setWaitPending(bool v) {
    waitPending = v;
    notifyListeners();
  }

  void addDistance(double km, bool outside) {
    trackedKm += km;
    if (outside) trackedOutsideKm += km;
    notifyListeners();
    _save();
  }

  void resetDistance() {
    trackedKm = 0;
    trackedOutsideKm = 0;
    notifyListeners();
    _save();
  }

  bool get hasLiveOrder => isLiveOrder(active);
}

bool isLiveOrder(Json? o) => o != null && o['status'] != 'COMPLETED' && o['status'] != 'CANCELLED';

/// Fields of a server order the app keeps.
Json orderFields(dynamic d) {
  final j = asJson(d);
  if (j == null) return {};
  const keys = [
    'status', 'pickupLat', 'pickupLng', 'pickupAddress', 'destinationAddress', 'destinationLat', 'destinationLng',
    'distanceKm', 'price', 'commission', 'discount', 'bonusUsed', 'arrivedAt', 'startedAt', 'waitingMinutes',
    'waitingFee', 'outsideKm', 'outsideFee', 'waitingSeconds', 'waitStartedAt', 'waitTickAt', 'cancelPenalty',
    'source', 'createdAt',
  ];
  return {for (final k in keys) if (j.containsKey(k)) k: j[k]};
}

// NEW: a group's kitchen that has not accepted yet, already assigned to this courier.
const liveDeliveryStatuses = ['NEW', 'COOKING', 'READY', 'PICKED_UP'];

bool isDeliveryLive(Json? d) => d != null && liveDeliveryStatuses.contains(d['status']);

/// The food delivery in progress.
class DeliveryStore extends ChangeNotifier {
  static const _key = 'taxi-driver-delivery';
  Json? active;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_key);
    if (raw == null) return;
    try {
      active = asJson(jsonDecode(raw));
    } catch (_) {}
  }

  void setActive(Json? d) {
    active = d;
    notifyListeners();
    SharedPreferences.getInstance().then((p) => d == null ? p.remove(_key) : p.setString(_key, jsonEncode(d)));
  }

  Future<Json?>? _syncing;

  /// Re-read the active delivery from the server.
  Future<Json?> sync() => _syncing ??= _sync().whenComplete(() => _syncing = null);

  Future<Json?> _sync() async {
    final startId = active?['id'];
    try {
      final r = await api.get('/driver/deliveries/active');
      final data = asJson(r.data);
      final isView = data != null && data['id'] != null;
      // Accepted / released meanwhile — don't overwrite with a stale answer.
      if (active?['id'] != startId && !isView) return active;
      if (isView) {
        setActive(data);
        return data;
      }
      final local = active;
      if (!isDeliveryLive(local)) return local;
      try {
        final h = await api.get('/driver/deliveries/history');
        final list = h.data is List ? h.data as List : const [];
        final found = list.cast<dynamic>().map(asJson).where((x) => x?['id'] == local!['id']);
        if (active?['id'] != local!['id']) return active;
        if (found.isNotEmpty && !liveDeliveryStatuses.contains(found.first!['status'])) {
          final merged = {...local, ...found.first!};
          setActive(merged);
          return merged;
        }
      } catch (_) {
        return active;
      }
      // Not ours any more (e.g. taken back by the admin).
      setActive(null);
      return null;
    } catch (_) {
      return active;
    }
  }

  /// Take a delivery (offer dialog or the "Mavjud" list).
  Future<Json?> accept(String id) async {
    final r = await api.post('/driver/deliveries/$id/accept');
    final d = asJson(r.data);
    if (d != null) setActive(d);
    return sync();
  }
}

/// New admin message / passenger message: screens refresh on these.
class Bus extends ChangeNotifier {
  int announcement = 0;
  int orderMessage = 0;
  int delivery = 0;
  Json? updatePrompt;
  void onAnnouncement() {
    announcement++;
    notifyListeners();
  }

  void onOrderMessage() {
    orderMessage++;
    notifyListeners();
  }

  void onDelivery() {
    delivery++;
    notifyListeners();
  }

  void showUpdate(Json? a) {
    updatePrompt = a;
    notifyListeners();
  }
}

final auth = AuthStore();
final orders = OrderStore();
final deliveries = DeliveryStore();
final bus = Bus();
