import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/fare.dart';
import '../core/live.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

/// Street pickups: one button, the fare runs from GPS and the waiting clock.
class TaximeterScreen extends StatefulWidget {
  const TaximeterScreen({super.key});
  @override
  State<TaximeterScreen> createState() => _TaximeterScreenState();
}

class _TaximeterScreenState extends State<TaximeterScreen> {
  bool _busy = false;
  String? _err;

  @override
  void initState() {
    super.initState();
    loadTariff();
    final a = orders.active;
    if (a?['source'] == 'street') {
      syncActiveOrder(a!['id'].toString());
    } else if (!orders.hasLiveOrder) {
      _findServerRide().then((o) {
        if (o == null || orders.hasLiveOrder || !mounted) return;
        orders.resetDistance();
        orders.setActive(o);
      });
    }
  }

  /// A street ride still running on the server (lost response, cleared data…).
  Future<Json?> _findServerRide() async {
    try {
      final r = await api.get('/driver/orders/history');
      if (r.data is! List) return null;
      for (final x in r.data as List) {
        if (x['source'] == 'street' && x['status'] == 'IN_PROGRESS') {
          return {'id': x['id'], ...orderFields(x), 'source': 'street'};
        }
      }
    } catch (_) {}
    return null;
  }

  Future<Map<String, double>?> _position() async {
    final fresh = live.lastKnown(const Duration(seconds: 15));
    if (fresh != null) return fresh;
    try {
      final p = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 12)),
      );
      return {'lat': p.latitude, 'lng': p.longitude};
    } catch (_) {
      return live.lastKnown();
    }
  }

  Future<void> _start() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final pos = await _position();
      if (pos == null) {
        setState(() => _err = 'Joylashuv aniqlanmadi — GPS yoqilganini tekshiring va qayta bosing.');
        return;
      }
      final r = await api.post('/driver/street/start', data: pos);
      noteServerTime(r.data?['startedAt']);
      orders.resetDistance();
      orders.setActive({'id': r.data['id'], ...orderFields(r.data), 'source': 'street'});
    } catch (e) {
      // The ride may already exist (lost response / double tap) — take it.
      final existing = await _findServerRide();
      if (existing != null && !orders.hasLiveOrder) {
        orders.resetDistance();
        orders.setActive(existing);
        return;
      }
      if (mounted) setState(() => _err = errMsg(e, 'Safarni boshlab bo‘lmadi. Internetni tekshiring.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finish() async {
    final cur = orders.active;
    if (_busy || cur == null || cur['source'] != 'street' || cur['status'] != 'IN_PROGRESS') return;
    final id = cur['id'].toString();
    final km = orders.trackedKm;
    final outKm = orders.trackedOutsideKm;
    final t = cachedTariff;
    final est = t != null ? computeZonedFare(km, outKm, t) + waitFeeFor(liveWaitSec(cur), t) : null;
    final ok = await confirmDialog(context, 'Safarni tugatasizmi?${est != null ? '\nNarx: ${money(est)}' : ''}\nMasofa: ${km.toStringAsFixed(2)} km');
    if (!ok || !mounted) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await api.post('/driver/orders/$id/complete', data: {
        'distanceKm': double.parse((km > 500 ? 500.0 : km).toStringAsFixed(3)),
        'outsideKm': double.parse((outKm > 500 ? 500.0 : outKm).toStringAsFixed(3)),
      });
      orders.patchActive(id, {...orderFields(r.data), 'status': 'COMPLETED', 'waitStartedAt': null});
      auth.refreshMe();
    } catch (e) {
      // The server may have finished it although the answer was lost.
      try {
        final f = await api.get('/driver/orders/$id');
        if (f.data?['id'] == id && f.data['status'] != 'IN_PROGRESS') {
          orders.patchActive(id, {...orderFields(f.data), 'waitStartedAt': null});
          return;
        }
      } catch (_) {}
      if (mounted) setState(() => _err = errMsg(e, 'Yakunlab bo‘lmadi. Internetni tekshiring.'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _home() {
    orders.resetDistance();
    orders.setActive(null);
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  Widget _blocked(String text, String cta, VoidCallback tap) => Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.local_taxi, size: 32, color: gold),
              const SizedBox(height: 12),
              T(text, color: n600, align: TextAlign.center),
              const SizedBox(height: 20),
              PrimaryButton(cta, height: 44, fontSize: 14, onTap: tap),
            ]),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    context.watch<OrderStore>();
    context.watch<DeliveryStore>();
    final active = orders.active;
    final ride = active?['source'] == 'street' ? active : null;
    if (auth.isCourier) {
      return _blocked('Taksometr faqat taksi haydovchilari uchun.', 'Bosh sahifa', () => Navigator.pop(context));
    }
    if (ride == null && isLiveOrder(active)) {
      return _blocked('Sizda faol buyurtma bor — avval uni yakunlang.', 'Faol buyurtmaga o‘tish', () => Navigator.pushReplacementNamed(context, '/order/active'));
    }
    if (ride == null && isDeliveryLive(deliveries.active)) {
      return _blocked('Sizda faol yetkazish bor — avval uni yakunlang.', 'Yetkazishga o‘tish', () => Navigator.pushReplacementNamed(context, '/delivery/active'));
    }
    final status = ride?['status'];
    final running = status == 'IN_PROGRESS';
    final done = status == 'COMPLETED';
    final cancelled = status == 'CANCELLED';
    return Ticker1s(builder: (_) {
      final tariff = cachedTariff;
      final waitSec = ride != null ? liveWaitSec(ride) : 0.0;
      final waitFee = waitFeeFor(waitSec, tariff);
      final distanceFare = tariff != null ? computeZonedFare(orders.trackedKm, orders.trackedOutsideKm, tariff) : 0.0;
      final total = distanceFare + waitFee;
      final startedAt = DateTime.tryParse('${ride?['startedAt'] ?? ride?['createdAt'] ?? ''}');
      final rideSec = startedAt != null ? (serverNow() - startedAt.millisecondsSinceEpoch) / 1000 : 0.0;
      final gps = orders.gpsStatus;
      final waiting = ride?['waitStartedAt'] != null;
      final pill = running ? (waiting ? 'Kutish' : 'Safarda') : (done ? 'Yakunlandi' : (cancelled ? 'Bekor qilindi' : 'Bo‘sh'));
      return AppScaffold(children: [
        Hero2(
          child: Column(children: [
            Row(children: [
              InkWell(
                onTap: () => Navigator.of(context).popUntil((r) => r.isFirst),
                child: const CircleAvatar(radius: 18, backgroundColor: Color(0x1AFFFFFF), child: Icon(Icons.arrow_back, size: 16, color: Colors.white)),
              ),
              const SizedBox(width: 12),
              const Icon(Icons.local_taxi, size: 18, color: gold),
              const SizedBox(width: 8),
              const Expanded(child: T('Taksometr', weight: FontWeight.w700, color: Colors.white)),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: cancelled ? red : (running && waiting ? const Color(0xFFFB923C) : gold), borderRadius: BorderRadius.circular(99)),
                child: Caption(pill, color: cancelled ? Colors.white : ink),
              ),
            ]),
            if (running) ...[
              const SizedBox(height: 22),
              const Caption('Yo‘l haqi', color: gold),
              const SizedBox(height: 4),
              T(tariff != null ? fmtSum(total) : '—', size: 56, weight: FontWeight.w800, color: Colors.white),
              const T('so‘m', color: n400),
              if (tariff != null) ...[
                const SizedBox(height: 8),
                T('Yo‘l ${fmtSum(distanceFare)} + kutish ${fmtSum(waitFee)}', size: 12, color: n400),
              ],
              if (tariff != null && zoneActive(tariff) && orders.trackedOutsideKm > 0) ...[
                const SizedBox(height: 4),
                T('Hududdan tashqari: ${orders.trackedOutsideKm.toStringAsFixed(2)} km · 1 km ${fmtSum(tariff['outsidePricePerKm'])} so‘m', size: 12, weight: FontWeight.w600, color: const Color(0xFFFCD34D)),
              ],
              const SizedBox(height: 18),
              Row(children: [
                _stat('Masofa', orders.trackedKm.toStringAsFixed(2), 'km'),
                const SizedBox(width: 8),
                _stat('Safar vaqti', fmtClock(rideSec < 0 ? 0 : rideSec), ''),
                const SizedBox(width: 8),
                _stat('Kutish', fmtClock(waitSec), '', highlight: waiting),
              ]),
            ],
            if (ride == null) ...[
              const SizedBox(height: 18),
              const T('Ko‘chadan olingan yo‘lovchi uchun (bot yoki ilovadan emas). Mijoz mashinaga o‘tirgach “Klient oldim” ni bosing — narx GPS masofa va kutish vaqti bo‘yicha hisoblanadi.', color: Color(0xFFD4D4D4), height: 1.4),
            ],
          ]),
        ),
        if (running && ride != null)
          Section(
            child: Column(children: [
              if (gps == 'denied' || gps == 'unavailable')
                Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(10),
                  decoration: cardBox(color: orangeBg, border: orangeLine, radius: 12),
                  child: T(gps == 'denied' ? 'Joylashuvga ruxsat berilmagan — masofa hisoblanmayapti.' : 'GPS signali yo‘q — masofa hisoblanmayapti. GPS yoqilganini tekshiring.', size: 12, weight: FontWeight.w500, color: orangeText),
                ),
              WaitPanel(
                title: 'Kutish',
                seconds: waitSec,
                fee: waitFee,
                tariff: tariff,
                counting: isWaitCounting(ride),
                moving: ride['waitMoving'] == true,
                toggleRunning: waiting,
                togglePending: orders.waitPending,
                onToggle: () => toggleWait((m) {
                  if (mounted) setState(() => _err = m);
                }),
              ),
              if (tariff != null) ...[
                const SizedBox(height: 10),
                T('Komissiya: ${money(commissionFor(total, tariff))}', size: 11, color: n500),
              ],
            ]),
          ),
        if (done && ride != null) Section(child: _summary(ride)),
        if (cancelled)
          Section(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: cardBox(color: redBg, border: redLine),
              child: const Column(children: [
                Icon(Icons.cancel_outlined, size: 28, color: red),
                SizedBox(height: 8),
                T('Safar bekor qilindi', size: 16, weight: FontWeight.w700, color: redText),
                SizedBox(height: 4),
                T('Administrator tomonidan bekor qilingan.', size: 12, color: redText),
              ]),
            ),
          ),
        if (_err != null) Section(top: 12, child: T(_err!, color: red)),
        Section(
          top: 24,
          child: Column(children: [
            if (ride == null) PrimaryButton('Klient oldim', icon: Icons.person_add_alt_1, height: 80, fontSize: 20, busy: _busy, onTap: _start),
            if (running) PrimaryButton('Safarni tugatish', icon: Icons.flag_outlined, height: 80, fontSize: 20, dark: true, busy: _busy, onTap: _finish),
            if (done || cancelled) ...[
              PrimaryButton('Yangi mijoz', icon: Icons.person_add_alt_1, height: 80, fontSize: 20, onTap: () {
                setState(() => _err = null);
                orders.resetDistance();
                orders.setActive(null);
              }),
              const SizedBox(height: 12),
              OutlineBtn('Bosh sahifa', icon: Icons.home_outlined, onTap: _home),
            ],
            if (ride == null && tariff != null) ...[
              const SizedBox(height: 12),
              TariffLine(tariff),
            ],
          ]),
        ),
      ]);
    });
  }

  Widget _stat(String label, String value, String unit, {bool highlight = false}) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          decoration: cardBox(
            color: highlight ? const Color(0x26FB923C) : const Color(0x0DFFFFFF),
            border: highlight ? const Color(0x66FB923C) : const Color(0x1AFFFFFF),
            radius: 12,
          ),
          child: Column(children: [
            T(tr2(label), size: 9, weight: FontWeight.w700, color: n400),
            const SizedBox(height: 4),
            T(unit.isEmpty ? value : '$value $unit', size: 16, weight: FontWeight.w800, color: Colors.white, maxLines: 1),
          ]),
        ),
      );

  String tr2(String s) => s.toUpperCase();

  Widget _summary(Json ride) {
    final price = numOf(ride['price']);
    final commission = numOf(ride['commission']);
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: cardBox(border: gold, width: 2),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Row(children: [
          Icon(Icons.check_circle_outline, size: 20, color: goldDeep),
          SizedBox(width: 8),
          T('Safar yakunlandi', size: 16, weight: FontWeight.w700),
        ]),
        const SizedBox(height: 10),
        const Caption('Mijozdan olinadi (naqd)'),
        const SizedBox(height: 4),
        T(money(price), size: 36, weight: FontWeight.w800),
        const Divider(color: line, height: 24),
        KV('Masofa', '${numOf(ride['distanceKm']).toStringAsFixed(2)} km'),
        KV('Kutish (${fmtClock(numOf(ride['waitingSeconds']))})', money(ride['waitingFee'])),
        if (numOf(ride['outsideFee']) > 0) KV('Hududdan tashqari (${numOf(ride['outsideKm']).toStringAsFixed(1)} km)', money(ride['outsideFee'])),
        KV('Komissiya', '-${money(commission)}'),
        const Divider(color: line),
        KV('Sof daromad', '+${money(price - commission)}', bold: true),
      ]),
    );
  }
}
