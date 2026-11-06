import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../main.dart' show goTo;
import 'api.dart';
import 'fare.dart';
import 'native.dart' as native;
import 'store.dart';
import 'util.dart';

/// Keeps the app connected while the driver is online or on a job: socket,
/// GPS, and the Android background service that follows the online switch.
class Live with WidgetsBindingObserver {
  io.Socket? _socket;
  String? _socketToken;
  StreamSubscription<Position>? _gps;
  Timer? _locationTimer;
  bool _started = false;
  bool _serviceWanted = false;
  String? _serviceToken;
  String? _reportedFor;
  Map<String, double>? _lastPos;
  Map<String, double>? _lastCounted;
  String? _countedFor;
  DateTime? _lastFixAt;
  Map<String, double>? _lastFix;

  void start() {
    if (_started) return;
    _started = true;
    WidgetsBinding.instance.addObserver(this);
    auth.addListener(_apply);
    orders.addListener(_apply);
    deliveries.addListener(_apply);
    _apply();
    _syncJobs();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _syncJobs();
      loadCurrentOffer();
    }
  }

  bool get _enabled =>
      auth.token != null && (auth.online || orders.hasLiveOrder || isDeliveryLive(deliveries.active));

  void _apply() {
    final token = auth.token;
    // The service follows the online switch.
    final wantService = token != null && auth.online;
    if (wantService && (!_serviceWanted || _serviceToken != token)) {
      native.serviceStart(token, apiUrl);
    } else if (!wantService && _serviceWanted) {
      native.serviceStop();
    }
    _serviceWanted = wantService;
    _serviceToken = token;

    if (token != null && _reportedFor != token) {
      _reportedFor = token;
      _reportVersion();
      loadTariff();
      deliveries.sync();
    }
    if (_enabled) {
      _connect(token!);
      _startGps();
    } else {
      _disconnect();
      _stopGps();
    }
  }

  Future<void> _reportVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      await api.post('/driver/app-version', data: {'version': info.version, 'platform': 'android'});
    } catch (_) {
      _reportedFor = null; // offline at start — try again later
    }
  }

  // ---- socket --------------------------------------------------------------

  void _connect(String token) {
    if (_socket != null && _socketToken == token) return;
    _disconnect();
    _socketToken = token;
    final s = io.io(
      '$wsUrl/drivers',
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .setAuth({'token': token})
          .enableForceNew()
          .enableReconnection()
          .setReconnectionDelay(1500)
          .setReconnectionDelayMax(10000)
          .setTimeout(8000)
          .build(),
    );
    _socket = s;
    s.on('new_order', (p) => _onNewOrder(asJson(p)));
    s.on('delivery_update', (p) => _onDeliveryUpdate(asJson(p)));
    s.on('order_offer_expired', (p) => _closeOffer(asJson(p)?['orderId']));
    s.on('order_taken', (p) => _closeOffer(asJson(p)?['orderId']));
    s.on('bonus_request', (p) => _onBonusRequest(asJson(p)));
    s.on('order_message', (p) {
      bus.onOrderMessage();
    });
    s.on('driver_offline', (_) => auth.setDriver({'isOnline': false}));
    s.on('announcement', (p) => _onAnnouncement(asJson(p)));
    s.on('wait_tick', (p) => _onWaitTick(asJson(p)));
    s.on('order_cancelled', (p) {
      final id = asJson(p)?['orderId'];
      if (id != null) orders.patchActive(id.toString(), {'status': 'CANCELLED', 'waitStartedAt': null});
    });
    s.onConnect((_) {
      if (_lastPos != null) s.emit('location_update', _lastPos);
      loadCurrentOffer();
      if (deliveries.active != null) deliveries.sync();
    });
    _locationTimer?.cancel();
    _locationTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_lastPos != null) _socket?.emit('location_update', _lastPos);
    });
    // Requests that arrived while the app was closed.
    api.get('/driver/bonus/pending').then((r) {
      if (r.data is List && (r.data as List).isNotEmpty) orders.setBonusRequest(asJson((r.data as List).first));
    }).catchError((_) {});
    loadCurrentOffer();
  }

  void _disconnect() {
    _locationTimer?.cancel();
    _locationTimer = null;
    _socket?.dispose();
    _socket = null;
    _socketToken = null;
  }

  // ---- offers --------------------------------------------------------------

  bool get _hasActiveJob => orders.hasLiveOrder || isDeliveryLive(deliveries.active);

  Json _offerFrom(Json p, {int? receivedAt}) => {
        ...p,
        'mode': p['mode'] == 'all' ? 'all' : 'personal',
        'offerSeconds': numOf(p['offerSeconds']) > 0 ? numOf(p['offerSeconds']).round() : 15,
        'receivedAt': receivedAt ?? DateTime.now().millisecondsSinceEpoch,
      };

  void _onNewOrder(Json? p) {
    if (p == null || p['orderId'] == null) return;
    // Busy with a ride or a delivery — don't ring over it (it stays in "Mavjud").
    if (_hasActiveJob) return;
    orders.setIncoming(_offerFrom(p));
    // Admin timeline: this phone is ringing (deduplicated on the server).
    api.post('/driver/orders/${p['orderId']}/ring', data: {'via': 'app'}).then((_) {}, onError: (_) {});
    _ensureAlarm();
  }

  /// The service rings (alarm stream + vibration). If it is not running, at
  /// least buzz: never a silent offer.
  Future<void> _ensureAlarm() async {
    if (await native.serviceRunning()) return;
    for (var i = 0; i < 5 && orders.incoming != null; i++) {
      HapticFeedback.vibrate();
      SystemSound.play(SystemSoundType.alert);
      await Future<void>.delayed(const Duration(seconds: 3));
    }
  }

  void _closeOffer(dynamic orderId) {
    native.stopAlarm(orderId?.toString());
    if (orders.incoming?['orderId'] == orderId) orders.setIncoming(null);
  }

  /// The offer ringing for me right now (app opened from the alarm, or a socket
  /// reconnect): show the dialog with the time that is left.
  Future<void> loadCurrentOffer() async {
    if (auth.token == null) return;
    try {
      final r = await api.get('/driver/offers/current');
      final d = asJson(r.data);
      if (d?['orderId'] == null) return;
      if (orders.incoming?['orderId'] == d!['orderId'] || _hasActiveJob) return;
      final total = numOf(d['offerSeconds']) > 0 ? numOf(d['offerSeconds']) : 15;
      final left = numOf(d['remainingSeconds']) > 0 ? numOf(d['remainingSeconds']) : total;
      orders.setIncoming(_offerFrom(
        d,
        receivedAt: DateTime.now().millisecondsSinceEpoch - ((total - left) * 1000).round(),
      ));
    } catch (_) {
      // offline — the socket will deliver it
    }
  }

  /// Accepted from the card over other apps (or on another phone): the job
  /// lives on the server, so pick it up whenever the app comes to the front.
  Future<void> _syncJobs() async {
    if (auth.token == null) return;
    try {
      final r = await api.get('/driver/orders/active');
      final d = asJson(r.data);
      if (d?['id'] != null && orders.active?['id'] != d!['id']) {
        orders.resetDistance();
        orders.setActive({'id': d['id'], ...orderFields(d)});
        orders.setIncoming(null);
        goTo(d['source'] == 'street' ? '/taximeter' : '/order/active');
        return;
      }
      final before = deliveries.active?['id'];
      final del = await deliveries.sync();
      if (isDeliveryLive(del) && del!['id'] != before) {
        orders.setIncoming(null);
        goTo('/delivery/active');
      }
    } catch (_) {}
  }

  void _onDeliveryUpdate(Json? u) {
    final cur = deliveries.active;
    final status = u?['status'];
    if (cur != null && status != null && cur['id'] == u?['orderId']) {
      if (status == 'READY' && cur['status'] == 'COOKING') {
        HapticFeedback.mediumImpact();
        deliveries.setActive({...cur, 'status': status, 'readyAt': cur['readyAt'] ?? DateTime.now().toUtc().toIso8601String()});
        native.notify('🍽 Buyurtma tayyor', '#${cur['number']} — ${asJson(cur['kitchen'])?['name'] ?? 'Oshxona'}: buyurtmani olib keting');
      } else if (status == 'CANCELLED' && cur['status'] != 'CANCELLED') {
        HapticFeedback.mediumImpact();
        deliveries.setActive({...cur, 'status': status, 'cancelledAt': DateTime.now().toUtc().toIso8601String()});
        native.notify('❌ Yetkazish bekor qilindi', '#${cur['number']} buyurtma bekor qilindi');
      }
    }
    bus.onDelivery();
  }

  void _onBonusRequest(Json? p) {
    orders.setBonusRequest(p);
    HapticFeedback.mediumImpact();
  }

  void _onAnnouncement(Json? a) {
    if (a?['kind'] == 'update') bus.showUpdate(a);
    bus.onAnnouncement();
  }

  /// Waiting meter tick from the server (counts only while standing still).
  void _onWaitTick(Json? t) {
    noteServerTime(t?['waitTickAt']);
    if (orders.waitPending || t?['orderId'] == null) return;
    final cur = orders.active;
    if (cur == null || cur['id'] != t!['orderId'] || !isWaitCounting(cur)) return;
    orders.patchActive(t['orderId'].toString(), {
      'waitingSeconds': numOf(t['waitingSeconds'], numOf(cur['waitingSeconds'])),
      'waitTickAt': t['waitTickAt'] ?? cur['waitTickAt'],
      'waitMoving': t['moving'] == true,
    });
  }

  // ---- GPS -----------------------------------------------------------------

  Future<void> _startGps() async {
    if (_gps != null) return;
    final perm = await Geolocator.checkPermission();
    if (!_enabled || _gps != null) return;
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      orders.setGps('denied');
      return;
    }
    if (!await Geolocator.isLocationServiceEnabled()) {
      orders.setGps('unavailable');
      return;
    }
    _gps = Geolocator.getPositionStream(
      locationSettings: AndroidSettings(
        accuracy: LocationAccuracy.high,
        intervalDuration: const Duration(seconds: 2),
        distanceFilter: 0,
      ),
    ).listen(
      _onFix,
      onError: (_) {
        orders.setGps('unavailable');
        _gps?.cancel();
        _gps = null;
      },
    );
  }

  void _stopGps() {
    _gps?.cancel();
    _gps = null;
    _lastPos = null;
  }

  void _onFix(Position pos) {
    // A fix worse than 60 m would add phantom distance.
    if (pos.accuracy > 60) return;
    final lat = pos.latitude, lng = pos.longitude;
    _lastFix = {'lat': lat, 'lng': lng};
    _lastFixAt = DateTime.now();
    final active = orders.active;
    if (active?['status'] == 'IN_PROGRESS') {
      // Measure from the last *counted* point, not the previous fix: fixes
      // come seconds and metres apart, dropping each one under-counts the ride.
      if (_countedFor != active!['id']) {
        _countedFor = active['id']?.toString();
        _lastCounted = null;
      }
      _lastCounted ??= {'lat': lat, 'lng': lng};
      final last = _lastCounted!;
      final delta = haversineKm(last['lat']!, last['lng']!, lat, lng);
      if (delta >= 0.01 && delta <= 1.5) {
        orders.addDistance(delta, isOutsideZone((last['lat']! + lat) / 2, (last['lng']! + lng) / 2));
        _lastCounted = {'lat': lat, 'lng': lng};
      }
    } else {
      _lastCounted = null;
    }
    final first = _lastPos == null;
    _lastPos = {'lat': lat, 'lng': lng};
    orders.setGps('ok');
    // Until the server knows where we are, no orders are sent to us.
    if (first) _socket?.emit('location_update', _lastPos);
  }

  /// Last GPS fix, if it is not older than `maxAge`.
  Map<String, double>? lastKnown([Duration maxAge = const Duration(minutes: 2)]) {
    if (_lastFix == null || DateTime.now().difference(_lastFixAt!) > maxAge) return null;
    return _lastFix;
  }
}

final live = Live();
