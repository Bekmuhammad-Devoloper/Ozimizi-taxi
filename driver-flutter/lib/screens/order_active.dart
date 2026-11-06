import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/fare.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../core/voice_nav.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

const _steps = ['ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
const _stepShort = ['Qabul', 'Yo‘lda', 'Keldim', 'Safar', 'Tugadi'];
const _label = {
  'ACCEPTED': 'Qabul qilindi',
  'ON_THE_WAY': 'Yo‘lda',
  'ARRIVED': 'Yetib keldim',
  'IN_PROGRESS': 'Safar boshlandi',
  'COMPLETED': 'Yakunlandi',
  'CANCELLED': 'Bekor qilindi',
};

class ActiveOrderScreen extends StatefulWidget {
  const ActiveOrderScreen({super.key});
  @override
  State<ActiveOrderScreen> createState() => _ActiveOrderScreenState();
}

class _ActiveOrderScreenState extends State<ActiveOrderScreen> {
  bool _busy = false;
  String? _err;
  Json? _client;
  String? _syncedId;
  final _nav = VoiceNav();

  @override
  void dispose() {
    _nav.dispose();
    super.dispose();
  }

  void _home() => Navigator.of(context).popUntil((r) => r.isFirst);

  void _maybeSync(String id) {
    if (_syncedId == id) return;
    _syncedId = id;
    loadTariff();
    syncActiveOrder(id).then((d) {
      if (d?['client'] != null && mounted) setState(() => _client = asJson(d!['client']));
    });
  }

  Future<void> _transition(String id, String path, String next) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await api.post('/driver/orders/$id/$path');
      if (next == 'ARRIVED') noteServerTime(r.data?['waitTickAt']);
      orders.patchActive(id, {'status': next, ...orderFields(r.data)});
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Xato'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _complete(String id) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await api.post('/driver/orders/$id/complete', data: {
        'distanceKm': double.parse(orders.trackedKm.toStringAsFixed(3)),
        'outsideKm': double.parse((orders.trackedOutsideKm > 500 ? 500.0 : orders.trackedOutsideKm).toStringAsFixed(3)),
      });
      orders.patchActive(id, {...orderFields(r.data), 'status': 'COMPLETED', 'waitStartedAt': null});
      auth.refreshMe();
    } catch (e) {
      // The server may have finished it although the answer was lost.
      try {
        final f = await api.get('/driver/orders/$id');
        if (f.data?['status'] != null && orders.active?['id'] == id && f.data['status'] != orders.active!['status']) {
          orders.patchActive(id, orderFields(f.data));
          return;
        }
      } catch (_) {}
      if (mounted) setState(() => _err = errMsg(e, 'Yakunlab bo‘lmadi'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _giveBack(String id) async {
    if (!await confirmDialog(context, 'Buyurtmani qaytarasizmi? U boshqa haydovchilarga o‘rtaga tushadi.')) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await api.post('/driver/orders/$id/cancel');
      orders.setActive(null);
      _home();
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Bekor qilib bo‘lmadi'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<OrderStore>();
    final a = orders.active;
    if (a == null) {
      return Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const T('Faol buyurtma yo‘q.', color: n500),
            const SizedBox(height: 20),
            SizedBox(width: 160, child: OutlineBtn('Bosh sahifa', onTap: _home, height: 44)),
          ]),
        ),
      );
    }
    final id = a['id'].toString();
    _maybeSync(id);
    // Street pickups have their own screen.
    if (a['source'] == 'street') {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) Navigator.pushReplacementNamed(context, '/taximeter');
      });
    }
    final status = a['status'].toString();
    return Ticker1s(builder: (_) {
      final tariff = cachedTariff;
      final waitSec = liveWaitSec(a);
      final waitFee = waitFeeFor(waitSec, tariff);
      final distanceFare = tariff != null ? computeZonedFare(orders.trackedKm, orders.trackedOutsideKm, tariff) : 0.0;
      final pLat = numOrNull(a['pickupLat']);
      final pLng = numOrNull(a['pickupLng']);
      final dLat = numOrNull(a['destinationLat']);
      final dLng = numOrNull(a['destinationLng']);
      final goingToPickup = status == 'ACCEPTED' || status == 'ON_THE_WAY' || status == 'ARRIVED';
      final showDest = dLat != null && dLng != null && (status == 'ARRIVED' || status == 'IN_PROGRESS');
      // Voice directions: to the passenger first, then to the destination.
      final toPickup = status == 'ACCEPTED' || status == 'ON_THE_WAY';
      final riding = status == 'IN_PROGRESS' && a['source'] != 'street' && dLat != null && dLng != null;
      _nav.follow(
        toPickup && pLat != null && pLng != null
            ? Pt(pLat, pLng)
            : riding
                ? Pt(dLat, dLng)
                : null,
        toPickup ? 'pickup' : 'dest',
      );
      return AppScaffold(children: [
        Hero2(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              InkWell(onTap: _home, child: const Padding(padding: EdgeInsets.only(right: 10), child: Icon(Icons.arrow_back, size: 18, color: n300))),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Caption('Buyurtma', color: n400),
                  T('#${id.substring(0, 8).toUpperCase()}', size: 16, weight: FontWeight.w700, color: Colors.white),
                ]),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: gold, borderRadius: BorderRadius.circular(99)),
                child: Caption(_label[status] ?? status, color: ink),
              ),
            ]),
            const SizedBox(height: 18),
            StepProgress(labels: _stepShort, current: _steps.indexOf(status)),
          ]),
        ),
        NavCard(_nav),
        if (_client != null)
          Section(
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: cardBox(),
              child: Row(children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: const Color(0x263B9BFF),
                  child: T('${_client!['firstName'] ?? 'K'}'.substring(0, 1).toUpperCase(), size: 18, weight: FontWeight.w700, color: goldDeep),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    T('${_client!['firstName'] ?? ''}', weight: FontWeight.w700, maxLines: 1),
                    T('${_client!['phonePrimary'] ?? ''}', size: 12, color: n500),
                  ]),
                ),
                PhoneButton(_client!['phonePrimary']?.toString()),
              ]),
            ),
          ),
        Section(
          child: Container(
            clipBehavior: Clip.antiAlias,
            decoration: cardBox(),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Padding(
                padding: const EdgeInsets.all(14),
                child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: goldDeep),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Caption('Olib ketish joyi'),
                      const SizedBox(height: 2),
                      T(textOf(a['pickupAddress']) ?? 'Manzil aniqlanmagan'),
                      if (textOf(a['destinationAddress']) != null) ...[
                        const SizedBox(height: 4),
                        T('→ ${a['destinationAddress']}', color: n600),
                      ],
                    ]),
                  ),
                ]),
              ),
              if ((goingToPickup && pLat != null && pLng != null) || showDest)
                Padding(
                  padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                  child: Column(children: [
                    if (goingToPickup && pLat != null && pLng != null) NavButton(label: 'Mijozga yo‘l ko‘rsatish', lat: pLat, lng: pLng),
                    if (showDest) ...[
                      if (goingToPickup) const SizedBox(height: 8),
                      NavButton(label: 'Manzilga yo‘l ko‘rsatish', lat: dLat, lng: dLng, secondary: goingToPickup),
                    ],
                  ]),
                ),
              if (riding)
                MiniMap(lat: dLat, lng: dLng, route: _nav.line, me: _nav.me)
              else if (pLat != null && pLng != null)
                MiniMap(lat: pLat, lng: pLng, route: _nav.line, me: _nav.me),
            ]),
          ),
        ),
        if (status == 'ARRIVED')
          Section(
            child: Column(children: [
              WaitPanel(title: 'Mijozni kutish', seconds: waitSec, fee: waitFee, tariff: tariff, counting: isWaitCounting(a), moving: a['waitMoving'] == true),
              if (tariff != null) ...[
                const SizedBox(height: 12),
                FareCard(distanceFare: distanceFare, waitFee: waitFee, tariff: tariff, distanceLabel: 'Minimal'),
              ],
            ]),
          ),
        OrderChat(orderId: id, enabled: isLiveOrder(a)),
        if (status == 'IN_PROGRESS')
          Section(
            child: Column(children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20),
                decoration: cardBox(color: ink, border: ink),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Caption('Bosib o‘tilgan masofa', color: gold),
                  const SizedBox(height: 8),
                  Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
                    T(orders.trackedKm.toStringAsFixed(2), size: 44, weight: FontWeight.w800, color: Colors.white),
                    const SizedBox(width: 8),
                    const T('km', size: 16, color: n400),
                  ]),
                  const SizedBox(height: 8),
                  const T('GPS orqali avtomatik kuzatilmoqda', size: 12, color: n400),
                  if (tariff != null && zoneActive(tariff) && orders.trackedOutsideKm > 0) ...[
                    const SizedBox(height: 4),
                    T('Hududdan tashqari: ${orders.trackedOutsideKm.toStringAsFixed(2)} km · 1 km ${fmtSum(tariff['outsidePricePerKm'])} so‘m', size: 12, weight: FontWeight.w600, color: const Color(0xFFFCD34D)),
                  ],
                ]),
              ),
              const SizedBox(height: 12),
              WaitPanel(
                title: 'Kutish (jami)',
                seconds: waitSec,
                fee: waitFee,
                tariff: tariff,
                counting: isWaitCounting(a),
                moving: a['waitMoving'] == true,
                toggleRunning: a['waitStartedAt'] != null,
                togglePending: orders.waitPending,
                onToggle: () => toggleWait((m) {
                  if (mounted) setState(() => _err = m);
                }),
              ),
              if (tariff != null) ...[
                const SizedBox(height: 12),
                FareCard(distanceFare: distanceFare, waitFee: waitFee, tariff: tariff),
                const SizedBox(height: 12),
                TariffLine(tariff),
              ],
            ]),
          ),
        if (status == 'COMPLETED') Section(child: _summary(a)),
        if (status == 'CANCELLED')
          Section(
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(20),
              decoration: cardBox(color: redBg, border: redLine),
              child: const Column(children: [
                Icon(Icons.cancel_outlined, size: 28, color: red),
                SizedBox(height: 8),
                T('Buyurtma bekor qilindi', size: 16, weight: FontWeight.w700, color: redText),
              ]),
            ),
          ),
        if (_err != null) Section(top: 12, child: T(_err!, color: red)),
        Section(
          top: 24,
          child: Column(children: [
            if (status == 'ACCEPTED')
              PrimaryButton('Yo‘lga chiqdim', icon: Icons.navigation_rounded, busy: _busy, onTap: () => _transition(id, 'on-the-way', 'ON_THE_WAY')),
            if (status == 'ON_THE_WAY')
              PrimaryButton('Yetib keldim', icon: Icons.check_circle_outline, busy: _busy, onTap: () => _transition(id, 'arrived', 'ARRIVED')),
            if (status == 'ARRIVED')
              PrimaryButton('Safarni boshlash', icon: Icons.play_arrow, busy: _busy, onTap: () => _transition(id, 'start', 'IN_PROGRESS')),
            if (status == 'IN_PROGRESS')
              PrimaryButton('Safarni tugatish', icon: Icons.flag_outlined, busy: _busy, onTap: () => _complete(id)),
            if (status == 'COMPLETED' || status == 'CANCELLED')
              PrimaryButton('Bosh sahifa', icon: Icons.check, onTap: () {
                orders.setActive(null);
                _home();
              }),
            if (goingToPickup) ...[
              const SizedBox(height: 12),
              OutlineBtn('Buyurtmani qaytarish', icon: Icons.cancel_outlined, danger: true, height: 44, onTap: _busy ? null : () => _giveBack(id)),
            ],
          ]),
        ),
      ]);
    });
  }

  Widget _summary(Json a) {
    final price = numOf(a['price']);
    final commission = numOf(a['commission']);
    final discount = numOf(a['discount']);
    final bonus = numOf(a['bonusUsed']);
    final cash = price - discount - bonus;
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
        KV('Masofa', '${a['distanceKm']} km'),
        const Divider(color: line),
        KV('Sof daromad', '+${money(price - commission)}', bold: true),
        KV('Narx', money(price)),
        if (numOf(a['waitingFee']) > 0) KV('Kutish (${a['waitingMinutes'] ?? 0} daq)', '+${money(a['waitingFee'])}'),
        if (numOf(a['outsideFee']) > 0) KV('Hududdan tashqari (${numOf(a['outsideKm']).toStringAsFixed(1)} km)', money(a['outsideFee'])),
        KV('Komissiya', '-${money(commission)}'),
        if (discount > 0) KV('Promo chegirma (balansga qaytarildi)', '-${money(discount)}'),
        if (bonus > 0) KV('Mijoz bonusidan (balansga tushdi)', '+${money(bonus)}'),
        const Divider(color: line),
        KV('Naqd olinadi', money(cash < 0 ? 0 : cash), bold: true),
      ]),
    );
  }
}
