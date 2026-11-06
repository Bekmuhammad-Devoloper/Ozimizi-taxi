import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:moviy_driver/core/cyrillic.dart';
import 'package:moviy_driver/core/fare.dart';
import 'package:moviy_driver/core/util.dart';
import 'package:moviy_driver/core/voice_nav.dart';

void main() {
  const flat = {'pricePerKm': 3000, 'minimumFare': 10000};

  test('fare without tiers matches the server formula', () {
    expect(computeFare(7.116, flat), 21000);
    expect(computeFare(1, flat), 10000);
  });

  test('tiers: first covering tier, then extra km', () {
    const t = {
      'pricePerKm': 2000,
      'minimumFare': 0,
      'tiers': [
        {'uptoKm': 1, 'price': 7000},
        {'uptoKm': 5, 'price': 15000},
      ],
    };
    expect(computeFare(0.4, t), 7000);
    expect(computeFare(3, t), 15000);
    expect(computeFare(7, t), 19000);
  });

  group('zone', () {
    final square = [
      {'lat': 41.28, 'lng': 69.22},
      {'lat': 41.28, 'lng': 69.28},
      {'lat': 41.32, 'lng': 69.28},
      {'lat': 41.32, 'lng': 69.22},
    ];
    final zoned = {...flat, 'zonePolygon': square, 'outsidePricePerKm': 5000};

    test('polygon', () {
      expect(insidePolygon(41.30, 69.25, square), isTrue);
      expect(insidePolygon(41.337, 69.25, square), isFalse);
    });

    test('same answer as the backend test: 7.116 km, 4.448 outside', () {
      expect(computeZonedFare(7.116, 4.448, zoned), 32000);
    });

    test('price 0 or no polygon turns it off', () {
      expect(zoneActive({...flat, 'zonePolygon': square, 'outsidePricePerKm': 0}), isFalse);
      expect(zoneActive(flat), isFalse);
      expect(computeZonedFare(7.116, 4.448, flat), 21000);
    });
  });

  test('waiting fee', () {
    const t = {'waitingFreeMinutes': 3, 'waitingPricePerMinute': 500};
    expect(waitFeeFor(120, t), 0);
    expect(waitFeeFor(240, t), 500);
    expect(waitFeeFor(241, t), 1000);
  });

  test('live waiting: counts since the last tick only while standing', () {
    final tick = DateTime.fromMillisecondsSinceEpoch(1000000).toUtc().toIso8601String();
    final o = {'status': 'IN_PROGRESS', 'waitingSeconds': 10, 'waitStartedAt': tick, 'waitTickAt': tick};
    expect(liveWaitSec(o, 1005000), 15);
    expect(liveWaitSec({...o, 'waitMoving': true}, 1005000), 10);
    expect(liveWaitSec({'status': 'IN_PROGRESS', 'waitingSeconds': 10}, 1005000), 10);
  });

  test('cyrillic matches the web and bot converter', () {
    const samples = {
      'Taksi buyurtma berish': 'Такси буюртма бериш',
      'Haydovchi bo‘lish': 'Ҳайдовчи бўлиш',
      'O‘zim olib ketaman': 'Ўзим олиб кетаман',
      'Yo‘l ko‘rsatish': 'Йўл кўрсатиш',
      'ma’lumot': 'маълумот',
      'So‘m: 12 000 so‘m/km': 'Сўм: 12 000 сўм/км',
      'MOVIY TAXI': 'МОВИЙ ТАКСИ',
      'Eslatma: yetkazish': 'Эслатма: етказиш',
      'APK yuklab oling: https://moviytaxi.uz/app': 'APK юклаб олинг: https://moviytaxi.uz/app',
      '01A123BC raqam': '01A123BC рақам',
      'Klientlar': 'Клиентлар',
      'Telegram va Yandex': 'Телеграм ва Яндекс',
      'qo‘ng‘iroq': 'қўнғироқ',
    };
    samples.forEach((lat, cyr) => expect(toCyrillic(lat), cyr));
  });

  test('money and clock', () {
    expect(fmtSum(12000), '12 000');
    expect(fmtSum(-5000), '-5 000');
    expect(fmtClock(75), '01:15');
    expect(fmtClock(3725), '1:02:05');
  });

  test('phone mask', () {
    expect(maskPhone('+998 901234567'), '+998 90 123 45 67');
    expect(maskPhone('90'), '+998 90');
  });

  group('voice navigation', () {
    final route = parseRoute(jsonDecode(File('test/fixtures/osrm_route.json').readAsStringSync()))!;

    /// Drives the whole line in 15 m hops; returns everything said, in order.
    List<List<String>> drive(NavTracker t) {
      final said = <List<String>>[];
      var travelled = 0.0;
      for (var i = 0; i < route.line.length - 1; i++) {
        final a = route.line[i], b = route.line[i + 1];
        final len = route.cum[i + 1] - route.cum[i];
        final hops = (len / 15).ceil().clamp(1, 10000);
        for (var h = 0; h < hops; h++) {
          final f = h / hops;
          final u = t.update(Pt(a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f));
          if (u.say != null) said.add(u.say!);
          travelled = route.cum[i] + len * f;
          expect(u.lost, isFalse, reason: 'on the line at $travelled m');
        }
      }
      final end = t.update(route.line.last);
      if (end.say != null) said.add(end.say!);
      return said;
    }

    test('reads turns from a real route', () {
      expect(route.total, closeTo(5768, 120));
      expect(route.maneuvers.first.icon, 'left'); // depart and straight "continue" are not turns
      expect(route.maneuvers.last.arrive, isTrue);
      expect(route.maneuvers.last.at, route.total);
      final ats = route.maneuvers.map((m) => m.at).toList();
      for (var i = 1; i < ats.length; i++) {
        expect(ats[i], greaterThanOrEqualTo(ats[i - 1]));
      }
    });

    test('driving the route: start, each turn in order, then arrival', () {
      final said = drive(NavTracker(route, 'pickup'));
      expect(said.first.first, 'start');
      expect(said.last, ['arrive_pickup']);
      // Every turn gets its "hozir", in route order.
      final nows = said.where((c) => c.contains('now')).map((c) => c[c.indexOf('now') + 1]).toList();
      final turns = route.maneuvers.where((m) => !m.arrive).map((m) => m.clips.first).toList();
      expect(nows, turns);
      // The long stretch counts down before its turn.
      expect(said.any((c) => c.first == 'd1000' && c.contains('keep_right')), isTrue);
      expect(said.any((c) => c.first == 'd300'), isTrue);
    });

    test('no phrase is repeated while standing still', () {
      final t = NavTracker(route, 'dest');
      final p = route.line[3];
      final first = t.update(p);
      expect(first.say, isNotNull);
      for (var i = 0; i < 20; i++) {
        expect(t.update(p).say, isNull);
      }
    });

    test('leaving the route asks for a new one, and stays quiet meanwhile', () {
      final t = NavTracker(route, 'dest');
      t.update(route.line[0]);
      const far = Pt(41.40, 69.40);
      final u1 = t.update(far);
      expect(u1.lost, isFalse);
      expect(u1.say, isNull);
      final u2 = t.update(far);
      expect(u2.lost, isTrue);
      expect(u2.say, isNull);
      expect(t.update(route.line[0]).lost, isFalse);
    });

    test('a rebuilt route does not say "start" again', () {
      final t = NavTracker(route, 'dest', sayStart: false);
      expect(t.update(route.line[0]).say?.contains('start') ?? false, isFalse);
    });

    test('roundabout exit is spoken, broken answers give no route', () {
      final r = parseRoute({
        'routes': [
          {
            'duration': 60,
            'geometry': {
              'coordinates': [
                [69.0, 41.0],
                [69.01, 41.0],
              ],
            },
            'legs': [
              {
                'steps': [
                  {'distance': 500, 'name': 'A', 'maneuver': {'type': 'depart'}},
                  {'distance': 300, 'name': 'B', 'maneuver': {'type': 'roundabout', 'modifier': 'right', 'exit': 2}},
                  {'distance': 0, 'name': '', 'maneuver': {'type': 'arrive'}},
                ],
              },
            ],
          },
        ],
      })!;
      expect(r.maneuvers.first.clips, ['roundabout', 'exit2']);
      expect(parseRoute({'code': 'NoRoute'}), isNull);
      expect(parseRoute(null), isNull);
    });

    test('distance text', () {
      expect(fmtDist(84), '80 m');
      expect(fmtDist(1234), '1.2 km');
    });
  });
}
