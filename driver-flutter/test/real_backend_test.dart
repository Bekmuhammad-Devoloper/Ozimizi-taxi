// The app's own code against a real backend with an empty test database: login,
// socket offer, accept, every ride step, chat, fare, give-back, two-kitchen courier
// job. Skipped in a normal run. Needs the throwaway backend from test/e2e/setup.sh
// on the build server, with test/e2e/*.js copied next to it:
//   flutter test test/real_backend_test.dart --dart-define=E2E_ORDER_CMD=<dir>/order.js \
//     --dart-define=API_URL=http://127.0.0.1:6199 --dart-define=WS_URL=http://127.0.0.1:6199
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:moviy_driver/core/api.dart';
import 'package:moviy_driver/core/fare.dart';
import 'package:moviy_driver/core/live.dart';
import 'package:moviy_driver/core/store.dart';
import 'package:moviy_driver/core/util.dart';
import 'package:moviy_driver/ui/widgets.dart';

const _orderCmd = String.fromEnvironment('E2E_ORDER_CMD');

Future<void> _placeOrder() async {
  final r = await Process.run('node', [_orderCmd]);
  stdout.write(r.stdout);
  expect(r.exitCode, 0, reason: '${r.stderr}');
  expect('${r.stdout}', contains('ORDER 201'));
}

Future<T> _until<T>(T? Function() read, String what, {int seconds = 40}) async {
  for (var i = 0; i < seconds * 4; i++) {
    final v = read();
    if (v != null) return v;
    await Future<void>.delayed(const Duration(milliseconds: 250));
  }
  fail('timed out waiting for $what');
}

void main() {
  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    HttpOverrides.global = null; // real network, unlike widget tests
    SharedPreferences.setMockInitialValues({});
    PackageInfo.setMockInitialValues(appName: 'x', packageName: 'x', version: '2.0.0', buildNumber: '20', buildSignature: '');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter.baseflow.com/geolocator'),
      (call) async => call.method == 'checkPermission' ? 0 : null,
    );
  });

  test('a whole taxi job against the real backend', () async {
    expect(apiUrl, isNot(contains('moviytaxi.uz')), reason: 'test database only');
    HttpOverrides.global = null;
    api.interceptors.add(InterceptorsWrapper(onError: (e, h) {
      // ignore: avoid_print
      print('HTTP ${e.response?.statusCode} ${e.requestOptions.method} ${e.requestOptions.path}: ${e.response?.data}');
      h.next(e);
    }));

    // ---- login
    final login = await api.post('/auth/driver/login', data: {'phone': '+998901234567', 'password': 'test1234'});
    expect(login.data['access_token'], isA<String>());
    auth.setAuth(login.data['access_token'], asJson(login.data['driver'])!);
    expect(auth.driver?['isApproved'], true);
    expect(auth.driver?['fullName'], 'Sinov Haydovchi');
    await auth.refreshMe();
    expect(auth.driver?['phone'], '+998901234567');

    // ---- what the home screens read
    final accepted = await api.post('/driver/contract/accept');
    expect(accepted.data['contractAcceptedAt'], isNotNull);
    final tariff = await loadTariff();
    expect(tariff, isNotNull);
    expect(cachedTariff?['pricePerKm'], isNotNull);
    final balance = await api.get('/driver/balance');
    expect(balance.data, isA<Map>());
    expect((await api.get('/driver/orders/available')).data, isA<List>());
    expect((await api.get('/driver/orders/history')).statusCode, 200);
    expect((await api.get('/driver/announcements')).statusCode, 200);
    expect((await api.get('/driver/bonus/pending')).data, isA<List>());
    expect((await api.get('/public/driver-contract')).statusCode, 200);
    await api.post('/driver/app-version', data: {'version': '2.0.0', 'platform': 'android'});
    await deliveries.sync();
    expect(deliveries.active, isNull);

    // ---- on the line: the real socket connects
    live.start();
    // The endpoint is a switch, and a stopped run may have left the driver on the line.
    if (!auth.online) {
      final on = await api.post('/driver/online');
      auth.setDriver({'isOnline': on.data['isOnline']});
    }
    expect(auth.online, isTrue);
    await api.post('/driver/location', data: {'lat': 41.3111, 'lng': 69.2797});
    await Future<void>.delayed(const Duration(seconds: 3));

    // ---- a client orders: the offer reaches the app over the socket
    await _placeOrder();
    final offer = await _until(() => orders.incoming, 'the socket offer');
    // ignore: avoid_print
    print('offer: $offer');
    final id = offer['orderId'].toString();
    expect(offer['mode'], anyOf('personal', 'all'));
    expect(numOf(offer['offerSeconds']), greaterThan(0));
    expect(asJson(offer['pickup'])?['lat'], isNotNull);
    expect(asJson(offer['pickup'])?['address'], 'Amir Temur ko‘chasi 15');

    final current = await api.get('/driver/offers/current');
    expect(current.data['orderId'], id);

    // ---- accept, as the offer dialog does
    final acc = await api.post('/driver/orders/$id/accept');
    orders.resetDistance();
    orders.setActive({'id': acc.data['id'], ...orderFields(acc.data)});
    orders.setIncoming(null);
    expect(orders.active?['status'], 'ACCEPTED');
    expect(numOrNull(orders.active?['pickupLat']), closeTo(41.311, 0.001));
    expect(numOrNull(orders.active?['destinationLat']), closeTo(41.3265, 0.001));

    // The job can be found again after the app was closed.
    final active = await api.get('/driver/orders/active');
    expect(active.data['id'], id);

    final detail = await syncActiveOrder(id);
    expect(asJson(detail?['client'])?['firstName'], 'Sinov Mijoz');

    // ---- chat
    final sent = await api.post('/driver/orders/$id/messages', data: {'text': 'Yo‘ldaman'});
    expect(sent.statusCode, anyOf(200, 201));
    final msgs = await api.get('/driver/orders/$id/messages');
    expect(msgs.data, isA<List>());
    expect('${msgs.data}', contains('Yo‘ldaman'));

    // ---- every ride step
    Future<void> step(String path, String next) async {
      final r = await api.post('/driver/orders/$id/$path');
      if (next == 'ARRIVED') noteServerTime(r.data?['waitTickAt']);
      orders.patchActive(id, {'status': next, ...orderFields(r.data)});
      expect(orders.active?['status'], next, reason: path);
    }

    await step('on-the-way', 'ON_THE_WAY');
    await step('arrived', 'ARRIVED');
    expect(orders.active?['arrivedAt'], isNotNull);
    await step('start', 'IN_PROGRESS');
    expect(orders.active?['startedAt'], isNotNull);

    final waitOn = await api.post('/driver/orders/$id/wait/start');
    orders.patchActive(id, orderFields(waitOn.data));
    expect(orders.active?['waitStartedAt'], isNotNull);
    await Future<void>.delayed(const Duration(seconds: 2));
    final waitOff = await api.post('/driver/orders/$id/wait/stop');
    orders.patchActive(id, orderFields(waitOff.data));
    expect(orders.active?['waitStartedAt'], isNull);

    // ---- finish: the fare on the phone must be the fare on the server
    orders.addDistance(7.116, false);
    final shown = computeZonedFare(orders.trackedKm, orders.trackedOutsideKm, cachedTariff!);
    final done = await api.post('/driver/orders/$id/complete', data: {
      'distanceKm': double.parse(orders.trackedKm.toStringAsFixed(3)),
      'outsideKm': 0.0,
    });
    orders.patchActive(id, {...orderFields(done.data), 'status': 'COMPLETED', 'waitStartedAt': null});
    expect(orders.active?['status'], 'COMPLETED');
    final charged = numOf(done.data['price']);
    final waitFee = numOf(done.data['waitingFee']);
    // ignore: avoid_print
    print('shown $shown, charged $charged (waiting $waitFee)');
    expect(charged - waitFee, shown);
    expect(numOf(done.data['commission']), greaterThanOrEqualTo(0));

    final history = await api.get('/driver/orders/history');
    expect('$history', contains(id));
    orders.setActive(null);
    await auth.refreshMe();

    // ---- a second order, given back: it goes to the middle, not cancelled
    await api.post('/driver/location', data: {'lat': 41.3111, 'lng': 69.2797});
    await _placeOrder();
    final offer2 = await _until(() => orders.incoming, 'the second offer');
    final id2 = offer2['orderId'].toString();
    expect(id2, isNot(id));
    final acc2 = await api.post('/driver/orders/$id2/accept');
    orders.resetDistance();
    orders.setActive({'id': acc2.data['id'], ...orderFields(acc2.data)});
    orders.setIncoming(null);
    await api.post('/driver/orders/$id2/cancel');
    orders.setActive(null);
    final back = await api.get('/driver/orders/available');
    expect('${back.data}', contains(id2), reason: 'given-back order is in "Mavjud" again');

    // ---- a third one, declined: no error, and the server stops ringing it for me
    final declined = await api.post('/driver/orders/$id2/decline');
    expect(declined.statusCode, anyOf(200, 201));
    orders.setIncoming(null);

    // ---- off the line
    final off = await api.post('/driver/online');
    auth.setDriver({'isOnline': off.data['isOnline']});
    expect(auth.online, isFalse);
  }, skip: _orderCmd.isEmpty ? 'needs the test backend' : false, timeout: const Timeout(Duration(minutes: 4)));

  test('one courier collects from two kitchens, against the real backend', () async {
    final foodCmd = _orderCmd.replaceAll('order.js', 'food.js');
    Future<String> food(String cmd) async {
      final r = await Process.run('node', [foodCmd, cmd]);
      stdout.write(r.stdout);
      expect(r.exitCode, 0, reason: '${r.stdout} ${r.stderr}');
      return '${r.stdout}';
    }

    await food('setup');
    await auth.refreshMe();
    expect(auth.driver?['acceptDelivery'], true);
    if (!auth.online) {
      final on = await api.post('/driver/online');
      auth.setDriver({'isOnline': on.data['isOnline']});
    }
    await api.post('/driver/location', data: {'lat': 41.3111, 'lng': 69.2797});
    await Future<void>.delayed(const Duration(seconds: 2));
    orders.setIncoming(null);

    await food('order');
    final offer = await _until(() => orders.incoming?['kind'] == 'delivery' ? orders.incoming : null, 'the delivery offer');
    // ignore: avoid_print
    print('delivery offer: $offer');
    final id = offer['orderId'].toString();
    expect(asJson(offer['pickup'])?['lat'], isNotNull);

    // Accepted as in the offer dialog: the app shows both kitchens on one job.
    final accepted = await deliveries.accept(id);
    orders.setIncoming(null);
    expect(isDeliveryLive(accepted), isTrue);
    final group = (deliveries.active?['group'] as List?) ?? const [];
    expect(group.length, 2, reason: 'two kitchens, one courier');
    expect(asJson(deliveries.active?['kitchen'])?['name'], isNotNull);
    expect(numOrNull(deliveries.active?['lat']), isNotNull);
    final fees = group.map((g) => numOf(asJson(g)?['deliveryFee'])).toList();
    expect(fees.where((f) => f > 0).length, 1, reason: 'one delivery fee, on the first order');

    // Kitchens mark it ready: the status reaches the app.
    var refreshed = false;
    void onBus() => refreshed = true;
    bus.addListener(onBus);
    await food('ready');
    await _until(() => refreshed ? true : null, 'delivery_update over the socket', seconds: 15);
    bus.removeListener(onBus);
    await deliveries.sync();
    expect(deliveries.active?['status'], 'READY');

    // Collect from each kitchen, then one hand-over.
    for (final g in group) {
      await api.post('/driver/deliveries/${asJson(g)!['id']}/picked-up');
      await deliveries.sync();
    }
    final picked = (deliveries.active?['group'] as List).map((g) => asJson(g)!['status']).toSet();
    expect(picked, {'PICKED_UP'});
    final done = await api.post('/driver/deliveries/${deliveries.active!['id']}/delivered');
    expect(done.data['status'], 'DELIVERED');
    final history = await api.get('/driver/deliveries/history');
    expect('${history.data}', contains(id));
    deliveries.setActive(null);

    final off = await api.post('/driver/online');
    auth.setDriver({'isOnline': off.data['isOnline']});
  }, skip: _orderCmd.isEmpty ? 'needs the test backend' : false, timeout: const Timeout(Duration(minutes: 3)));
}
