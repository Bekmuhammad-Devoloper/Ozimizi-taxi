// Every screen rendered on a phone-sized view against a scripted backend:
// layout overflows and exceptions fail the test, the real flows are walked
// through (offer → accept → ride → complete), and `--update-goldens` writes
// screenshots to test/goldens for a look at the design.
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:moviy_driver/core/api.dart';
import 'package:moviy_driver/core/fare.dart';
import 'package:moviy_driver/core/lang.dart';
import 'package:moviy_driver/core/store.dart';
import 'package:moviy_driver/main.dart';
import 'package:moviy_driver/screens/auth.dart';
import 'package:moviy_driver/screens/balance.dart';
import 'package:moviy_driver/screens/dashboard.dart';
import 'package:moviy_driver/screens/delivery.dart';
import 'package:moviy_driver/screens/order_active.dart';
import 'package:moviy_driver/screens/order_detail.dart';
import 'package:moviy_driver/screens/orders.dart';
import 'package:moviy_driver/screens/permissions.dart';
import 'package:moviy_driver/screens/profile.dart';
import 'package:moviy_driver/screens/taximeter.dart';
import 'package:moviy_driver/ui/kit.dart';
import 'package:moviy_driver/ui/overlays.dart';

class FakeBackend implements HttpClientAdapter {
  final requests = <String>[];
  final bodies = <String, dynamic>{};
  final routes = <String, dynamic>{};

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? body, Future<void>? cancel) async {
    final key = '${o.method} ${o.path}';
    requests.add(key);
    bodies[key] = o.data;
    if (!routes.containsKey(key)) {
      return ResponseBody.fromString(jsonEncode({'message': 'no route $key'}), 404, headers: {
        Headers.contentTypeHeader: ['application/json'],
      });
    }
    return ResponseBody.fromString(jsonEncode(routes[key]), 200, headers: {
      Headers.contentTypeHeader: ['application/json'],
    });
  }

  @override
  void close({bool force = false}) {}
}

final fake = FakeBackend();

const _driver = {
  'id': 'd1',
  'fullName': 'Muhriddin Sodiqov',
  'phone': '+998901234567',
  'balance': '150000.00',
  'isOnline': true,
  'isApproved': true,
  'profileComplete': true,
  'contractAcceptedAt': '2026-01-01T00:00:00Z',
  'carModel': 'Chevrolet Cobalt',
  'carColor': 'Oq',
  'carPlate': '01A123BC',
  'kind': 'taxi',
  'acceptDelivery': true,
};

final _now = DateTime.now().toUtc().toIso8601String();

Map<String, dynamic> _order(String status, [Map<String, dynamic> extra = const {}]) => {
      'id': 'aaaaaaaa-1111-2222-3333-444444444444',
      'status': status,
      'pickupLat': 40.54,
      'pickupLng': 71.06,
      'pickupAddress': 'Mustaqillik ko‘chasi, 12-uy, juda uzun manzil nomi bilan sinov uchun',
      'destinationLat': 40.56,
      'destinationLng': 71.08,
      'destinationAddress': 'Navoiy ko‘chasi, 5',
      'createdAt': _now,
      ...extra,
    };

Map<String, dynamic> _delivery(String status, {List? group, String id = 'dddddddd-1'}) => {
      'id': id,
      'number': 123,
      'status': status,
      'items': [
        {'name': 'Lag‘mon', 'price': 30000, 'qty': 2},
        {'name': 'Somsa', 'price': 8000, 'qty': 3},
      ],
      'itemsTotal': 84000,
      'deliveryFee': 13000,
      'total': 97000,
      'distanceKm': 3.2,
      'address': 'Navoiy ko‘chasi, 5-uy',
      'lat': 40.56,
      'lng': 71.08,
      'phone': '+998901112233',
      'comment': 'Eshik oldida kuting',
      'prepMinutes': 20,
      'acceptedAt': _now,
      'createdAt': _now,
      'clientName': 'Aziz',
      'kitchen': {'name': 'Milliy Taomlar Oshxonasi', 'address': 'Bozor yonida', 'phone': '+998907778899', 'lat': 40.55, 'lng': 71.07},
      if (group != null) 'group': group,
    };

const _tariff = {
  'pricePerKm': 3000,
  'minimumFare': 10000,
  'commissionPerOrder': 500,
  'commissionPercent': 10,
  'waitingFreeMinutes': 3,
  'waitingPricePerMinute': 500,
  'roundTo': 1000,
  'tiers': [],
  'zonePolygon': [
    {'lat': 40.5, 'lng': 71.0},
    {'lat': 40.5, 'lng': 71.1},
    {'lat': 40.6, 'lng': 71.1},
    {'lat': 40.6, 'lng': 71.0},
  ],
  'outsidePricePerKm': 5000,
};

void _baseRoutes() {
  fake.routes.addAll({
    'GET /driver/me': _driver,
    'GET /driver/orders/history': [
      _order('COMPLETED', {'price': '25000.00', 'commission': '2500.00', 'distanceKm': '7.100', 'completedAt': _now}),
      _order('CANCELLED'),
    ],
    'GET /driver/deliveries/history': [_delivery('DELIVERED')],
    'GET /driver/announcements': [
      {'id': '1', 'title': 'Yangi tarif', 'text': 'Ertadan yangi tarif kuchga kiradi.', 'createdAt': _now},
      {'id': '2', 'title': 'E’lon', 'text': 'Eski xabar', 'createdAt': _now},
    ],
    'GET /driver/orders/available': [_order('PENDING')],
    'GET /driver/deliveries/available': [
      {
        'kind': 'delivery',
        'orderId': 'dddddddd-2',
        'number': 124,
        'pickup': {'lat': 40.55, 'lng': 71.07, 'address': '🍽 3 ta oshxona: Milliy Taomlar, Osh Markazi, Pizza'},
        'destination': {'lat': 40.56, 'lng': 71.08, 'address': 'Navoiy 5'},
        'distanceFromDriver': 1.2,
        'estimatedKm': 3.2,
        'estimatedPrice': 13000,
        'itemsCount': 5,
        'total': 97000,
        'prepMinutes': 15,
        'createdAt': _now,
      },
    ],
    'GET /driver/tariff': _tariff,
    'GET /driver/balance': {
      'balance': '-12000.00',
      'transactions': [
        {'id': 't1', 'amount': '-2500.00', 'type': 'COMMISSION', 'orderId': 'aaaaaaaa-1111', 'createdAt': _now},
        {'id': 't2', 'amount': '50000.00', 'type': 'TOPUP', 'note': 'Koordinator', 'createdAt': _now},
      ],
    },
    'GET /public/driver-contract': {'text': 'Shartnoma matni. ' * 40},
    'GET /driver/deliveries/active': null,
    'POST /driver/online': {'isOnline': true},
  });
  final msgs = [
    {'id': 'm1', 'sender': 'client', 'text': 'Qayerdasiz?', 'createdAt': _now},
    {'id': 'm2', 'sender': 'driver', 'text': 'Yetib keldim 🚕', 'createdAt': _now},
  ];
  fake.routes['GET /driver/orders/aaaaaaaa-1111-2222-3333-444444444444/messages'] = msgs;
  fake.routes['GET /driver/orders/aaaaaaaa-1111-2222-3333-444444444444'] = {
    ..._order('ACCEPTED'),
    'client': {'firstName': 'Aziz', 'phonePrimary': '+998901112233'},
  };
}

void _phone(WidgetTester t) {
  t.view.physicalSize = const Size(360 * 2, 780 * 2);
  t.view.devicePixelRatio = 2;
  addTearDown(t.view.reset);
}

Future<void> _show(WidgetTester t, Widget home, {String? name, bool extraTall = false}) async {
  _phone(t);
  if (extraTall) t.view.physicalSize = const Size(360 * 2, 2400 * 2);
  await t.pumpWidget(appProviders(MaterialApp(
    navigatorKey: navKey,
    theme: appTheme(),
    debugShowCheckedModeBanner: false,
    home: home,
    builder: (c, child) => AppOverlays(child: child ?? const SizedBox.shrink()),
    onGenerateRoute: appRoute,
  )));
  await t.pump(const Duration(milliseconds: 300));
  await t.pump(const Duration(milliseconds: 300));
  if (name != null) {
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$name.png'));
  }
}

Future<void> _end(WidgetTester t) async {
  await t.pumpWidget(const SizedBox.shrink());
  await t.pump(const Duration(seconds: 1));
}

void _reset() {
  fake.requests.clear();
  fake.routes.clear();
  _baseRoutes();
  auth.setAuth('token', Map<String, dynamic>.from(_driver));
  orders.setActive(null);
  orders.setIncoming(null);
  orders.setBonusRequest(null);
  orders.resetDistance();
  orders.gpsStatus = 'ok';
  deliveries.setActive(null);
  cachedTariff = Map<String, dynamic>.from(_tariff);
  lang.cyrillic = false;
  mapsEnabled = false;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    PackageInfo.setMockInitialValues(appName: 'x', packageName: 'x', version: '2.0.0', buildNumber: '20', buildSignature: '');
    api.httpClientAdapter = fake;
    final f = FontLoader('Inter')..addFont(rootBundle.load('assets/fonts/InterVariable.ttf'));
    await f.load();
  });

  setUp(_reset);

  testWidgets('login, register, forgot, reset, pending', (t) async {
    auth.logout();
    await _show(t, const LoginScreen(), name: 'login');
    await _end(t);
    await _show(t, const RegisterScreen(), name: 'register');
    await _end(t);
    await _show(t, const ForgotScreen());
    await _end(t);
    await _show(t, const ResetScreen(phone: '+998901234567'));
    await _end(t);
    auth.setAuth('token', {..._driver, 'isApproved': false});
    await _show(t, const PendingScreen(), name: 'pending');
    await _end(t);
  });

  testWidgets('login sends the phone without spaces and stores the session', (t) async {
    auth.logout();
    fake.routes['POST /auth/driver/login'] = {'access_token': 'abc', 'driver': _driver};
    await _show(t, const LoginScreen());
    await t.enterText(find.byType(TextField).at(0), '901234567');
    await t.enterText(find.byType(TextField).at(1), 'secret12');
    await t.tap(find.text('Kirish'));
    await t.pump(const Duration(milliseconds: 300));
    expect(jsonEncode(fake.bodies['POST /auth/driver/login']), contains('+998901234567'));
    expect(auth.token, 'abc');
    await _end(t);
  });

  testWidgets('permissions screen', (t) async {
    await _show(t, PermissionScreen(onDone: () {}), name: 'permissions');
    await _end(t);
  });

  testWidgets('dashboard online and offline', (t) async {
    await _show(t, const DashboardScreen(), name: 'dashboard_online', extraTall: true);
    await _end(t);
    fake.routes['GET /driver/me'] = {..._driver, 'isOnline': false};
    auth.setDriver({'isOnline': false});
    await _show(t, const DashboardScreen(), name: 'dashboard_offline');
    await _end(t);
  });

  testWidgets('orders: available and history', (t) async {
    await _show(t, const OrdersScreen(), name: 'orders_available', extraTall: true);
    await t.tap(find.textContaining('Tarix'));
    await t.pump(const Duration(milliseconds: 200));
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/orders_history.png'));
    await _end(t);
  });

  testWidgets('taxi offer → accept → all ride steps → complete', (t) async {
    const id = 'aaaaaaaa-1111-2222-3333-444444444444';
    fake.routes.addAll({
      'POST /driver/orders/$id/accept': _order('ACCEPTED'),
      'POST /driver/orders/$id/on-the-way': _order('ON_THE_WAY'),
      'POST /driver/orders/$id/arrived': _order('ARRIVED', {'arrivedAt': _now, 'waitTickAt': _now}),
      'POST /driver/orders/$id/start': _order('IN_PROGRESS', {'startedAt': _now}),
      'POST /driver/orders/$id/complete': _order('COMPLETED', {
        'price': '32000.00',
        'commission': '3200.00',
        'distanceKm': '7.116',
        'outsideKm': '4.448',
        'outsideFee': '22000.00',
      }),
    });
    orders.setIncoming({
      'orderId': id,
      'pickup': {'lat': 40.54, 'lng': 71.06, 'address': 'Mustaqillik ko‘chasi, 12-uy'},
      'destination': {'lat': 40.56, 'lng': 71.08, 'address': 'Navoiy 5'},
      'distanceFromDriver': 1.25,
      'estimatedKm': 4.5,
      'estimatedPrice': 15000,
      'mode': 'personal',
      'offerSeconds': 15,
      'receivedAt': DateTime.now().millisecondsSinceEpoch,
    });
    await _show(t, const DashboardScreen(), name: 'offer_taxi');
    // Lists build lazily: a tall view keeps every button on screen.
    t.view.physicalSize = const Size(360 * 2, 2400 * 2);
    await t.pump();
    await t.tap(find.text('Qabul qilish'));
    await t.pump(const Duration(milliseconds: 300));
    await t.pump(const Duration(milliseconds: 500));
    expect(orders.active?['status'], 'ACCEPTED');
    expect(orders.incoming, isNull);
    expect(find.byType(ActiveOrderScreen), findsOneWidget);
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/order_accepted.png'));

    Future<void> step(String label, String status, [String? golden]) async {
      final b = find.text(label);
      await t.ensureVisible(b);
      await t.pump();
      await t.tap(b);
      await t.pump(const Duration(milliseconds: 300));
      await t.pump(const Duration(milliseconds: 300));
      expect(orders.active?['status'], status);
      if (golden != null) await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/$golden.png'));
    }

    await step('Yo‘lga chiqdim', 'ON_THE_WAY');
    await step('Yetib keldim', 'ARRIVED', 'order_arrived');
    await step('Safarni boshlash', 'IN_PROGRESS');
    orders.addDistance(2.668, false);
    orders.addDistance(4.448, true);
    await t.pump(const Duration(seconds: 1));
    await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/order_in_progress.png'));
    await step('Safarni tugatish', 'COMPLETED', 'order_completed');
    final sent = fake.bodies['POST /driver/orders/$id/complete'];
    expect(sent['distanceKm'], 7.116);
    expect(sent['outsideKm'], 4.448);
    await _end(t);
  });

  testWidgets('waiting button: starts on the tap, stops on the next one', (t) async {
    const id = 'aaaaaaaa-1111-2222-3333-444444444444';
    orders.setActive(_order('IN_PROGRESS', {'startedAt': _now, 'waitingSeconds': 0}));
    fake.routes['GET /driver/orders/$id'] = _order('IN_PROGRESS', {'startedAt': _now});
    fake.routes['POST /driver/orders/$id/wait/start'] = _order('IN_PROGRESS', {'waitStartedAt': _now, 'waitTickAt': _now});
    fake.routes['POST /driver/orders/$id/wait/stop'] = _order('IN_PROGRESS', {'waitStartedAt': null, 'waitTickAt': null, 'waitingSeconds': 30});
    await _show(t, const ActiveOrderScreen(), extraTall: true);
    await t.tap(find.text('Kutish'));
    await t.pump(const Duration(milliseconds: 300));
    expect(orders.active?['waitStartedAt'], isNotNull);
    // The double-tap guard works on real time.
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 750)));
    await t.pump(const Duration(seconds: 1));
    await t.tap(find.text('Davom etish'));
    await t.pump(const Duration(milliseconds: 300));
    expect(orders.active?['waitStartedAt'], isNull);
    expect(orders.active?['waitingSeconds'], 30);
    await _end(t);
  });

  testWidgets('giving the order back returns to home', (t) async {
    const id = 'aaaaaaaa-1111-2222-3333-444444444444';
    orders.setActive(_order('ON_THE_WAY'));
    fake.routes['POST /driver/orders/$id/cancel'] = _order('PENDING');
    await _show(t, const ActiveOrderScreen(), extraTall: true);
    await t.tap(find.text('Buyurtmani qaytarish'));
    await t.pump(const Duration(milliseconds: 300));
    await t.tap(find.text('Ha'));
    await t.pump(const Duration(milliseconds: 300));
    expect(orders.active, isNull);
    expect(fake.requests, contains('POST /driver/orders/$id/cancel'));
    await _end(t);
  });

  testWidgets('taximeter: empty, running, finished', (t) async {
    fake.routes['POST /driver/street/start'] = _order('IN_PROGRESS', {'id': 'stst-1', 'source': 'street', 'startedAt': _now});
    await _show(t, const TaximeterScreen(), name: 'taximeter_empty');
    await t.tap(find.text('Klient oldim'));
    await t.pump(const Duration(milliseconds: 100));
    await _end(t);
    orders.setActive(_order('IN_PROGRESS', {'id': 'stst-1', 'source': 'street', 'startedAt': _now}));
    orders.addDistance(3.5, false);
    fake.routes['GET /driver/orders/stst-1'] = _order('IN_PROGRESS', {'id': 'stst-1', 'source': 'street', 'startedAt': _now});
    await _show(t, const TaximeterScreen(), name: 'taximeter_running');
    await _end(t);
    orders.setActive(_order('COMPLETED', {'id': 'stst-1', 'source': 'street', 'price': '12000.00', 'commission': '1200.00', 'distanceKm': '3.500', 'waitingSeconds': 65, 'waitingFee': '0.00'}));
    fake.routes['GET /driver/orders/stst-1'] = orders.active;
    await _show(t, const TaximeterScreen(), name: 'taximeter_done');
    await _end(t);
  });

  testWidgets('delivery: one kitchen, group of kitchens, delivered, cancelled', (t) async {
    final g1 = _delivery('READY', id: 'g1');
    final g2 = {..._delivery('COOKING', id: 'g2'), 'number': 124, 'deliveryFee': 0, 'total': 40000, 'itemsTotal': 40000, 'kitchen': {'name': 'Osh Markazi', 'phone': '+998907770000', 'lat': 40.51, 'lng': 71.01}};
    final g3 = {..._delivery('NEW', id: 'g3'), 'number': 125, 'deliveryFee': 0, 'total': 30000, 'itemsTotal': 30000, 'kitchen': {'name': 'Pizza', 'lat': 40.52, 'lng': 71.02}};
    deliveries.setActive(_delivery('COOKING'));
    fake.routes['GET /driver/deliveries/active'] = deliveries.active;
    await _show(t, const ActiveDeliveryScreen(), name: 'delivery_cooking', extraTall: true);
    await _end(t);

    final group = {...g1, 'group': [g1, g2, g3]};
    deliveries.setActive(group);
    fake.routes['GET /driver/deliveries/active'] = group;
    await _show(t, const ActiveDeliveryScreen(), name: 'delivery_group', extraTall: true);
    expect(find.textContaining('3 ta oshxonadan'), findsOneWidget);
    expect(find.text('Oldim'), findsNWidgets(2)); // READY and COOKING, not NEW
    await _end(t);

    final allPicked = {
      ...g1,
      'status': 'PICKED_UP',
      'group': [
        {...g1, 'status': 'PICKED_UP'},
        {...g2, 'status': 'PICKED_UP'},
        {...g3, 'status': 'PICKED_UP'},
      ],
    };
    deliveries.setActive(allPicked);
    fake.routes['GET /driver/deliveries/active'] = allPicked;
    await _show(t, const ActiveDeliveryScreen(), name: 'delivery_group_ready', extraTall: true);
    expect(find.textContaining('Hammasi yetkazildi'), findsOneWidget);
    await _end(t);

    final done = {..._delivery('DELIVERED'), 'courierCommission': 1300, 'deliveredAt': _now};
    deliveries.setActive(done);
    fake.routes['GET /driver/deliveries/active'] = done;
    await _show(t, const ActiveDeliveryScreen(), name: 'delivery_done');
    await _end(t);

    final off = {..._delivery('CANCELLED'), 'cancelledBy': 'client', 'pickedUpAt': _now};
    deliveries.setActive(off);
    fake.routes['GET /driver/deliveries/active'] = off;
    await _show(t, const ActiveDeliveryScreen(), name: 'delivery_cancelled');
    await _end(t);
  });

  testWidgets('delivery offer dialog', (t) async {
    orders.setIncoming({
      'kind': 'delivery',
      'orderId': 'dddddddd-2',
      'number': 124,
      'mode': 'all',
      'offerSeconds': 15,
      'receivedAt': DateTime.now().millisecondsSinceEpoch,
      'pickup': {'lat': 40.55, 'lng': 71.07, 'address': '🍽 3 ta oshxona: Milliy Taomlar, Osh Markazi, Pizza'},
      'destination': {'lat': 40.56, 'lng': 71.08, 'address': 'Navoiy 5'},
      'distanceFromDriver': 1.2,
      'estimatedKm': 3.2,
      'estimatedPrice': 13000,
      'itemsCount': 5,
      'total': 97000,
      'prepMinutes': 15,
    });
    await _show(t, const DashboardScreen(), name: 'offer_delivery');
    await t.tap(find.text('Rad etish'));
    await t.pump(const Duration(milliseconds: 200));
    expect(orders.incoming, isNull);
    expect(fake.requests, contains('POST /driver/orders/dddddddd-2/decline'));
    await _end(t);
  });

  testWidgets('offer closes by itself when the time is up', (t) async {
    orders.setIncoming({
      'orderId': 'x1',
      'pickup': {'lat': 40.54, 'lng': 71.06},
      'distanceFromDriver': 1.0,
      'mode': 'personal',
      'offerSeconds': 15,
      'receivedAt': DateTime.now().millisecondsSinceEpoch - 16000,
    });
    await _show(t, const DashboardScreen());
    await t.pump(const Duration(seconds: 1));
    expect(orders.incoming, isNull);
    await _end(t);
  });

  testWidgets('bonus request and contract gate', (t) async {
    orders.setBonusRequest({'id': 'b1', 'orderId': 'o', 'amount': 5000, 'clientName': 'Aziz', 'price': 25000, 'cashAfter': 20000});
    await _show(t, const DashboardScreen(), name: 'bonus');
    await _end(t);
    orders.setBonusRequest(null);
    fake.routes['GET /driver/me'] = {..._driver, 'contractAcceptedAt': null};
    auth.setDriver({'contractAcceptedAt': null});
    await _show(t, const DashboardScreen(), name: 'contract');
    await _end(t);
  });

  testWidgets('balance, profile, order detail', (t) async {
    await _show(t, const BalanceScreen(), name: 'balance');
    await _end(t);
    await _show(t, const ProfileScreen(), name: 'profile', extraTall: true);
    await _end(t);
    fake.routes['GET /driver/orders/o1'] = _order('COMPLETED', {
      'id': 'o1aaaaaaaaaa',
      'price': '32000.00',
      'commission': '3200.00',
      'distanceKm': '7.116',
      'outsideKm': '4.448',
      'outsideFee': '22000.00',
      'client': {'firstName': 'Aziz', 'phonePrimary': '+998901112233'},
    });
    await _show(t, const OrderDetailScreen(id: 'o1'), name: 'order_detail', extraTall: true);
    await _end(t);
  });

  testWidgets('cyrillic: dashboard and login', (t) async {
    await lang.set(true);
    await _show(t, const DashboardScreen(), name: 'cyr_dashboard');
    expect(find.text('Балaнс'.replaceAll('a', 'а').toUpperCase()), findsOneWidget);
    await _end(t);
    auth.logout();
    await _show(t, const LoginScreen(), name: 'cyr_login');
    expect(find.text('Кириш'), findsOneWidget);
    await _end(t);
    await lang.set(false);
  });

  testWidgets('narrow phone (320 px): nothing overflows', (t) async {
    orders.setActive(_order('IN_PROGRESS', {'startedAt': _now}));
    t.view.physicalSize = const Size(320 * 2, 568 * 2);
    t.view.devicePixelRatio = 2;
    addTearDown(t.view.reset);
    Future<void> show(Widget w) async {
      await t.pumpWidget(appProviders(MaterialApp(navigatorKey: navKey, theme: appTheme(), home: w, onGenerateRoute: appRoute)));
      await t.pump(const Duration(milliseconds: 300));
      await _end(t);
    }

    await show(const DashboardScreen());
    await show(const OrdersScreen());
    await show(const ActiveOrderScreen());
    await show(const BalanceScreen());
    await show(const ProfileScreen());
  });
}
