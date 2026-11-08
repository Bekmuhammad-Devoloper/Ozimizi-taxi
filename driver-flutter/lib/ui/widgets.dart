import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/fare.dart';
import '../core/lang.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../main.dart' show navKey;
import 'kit.dart';

/// Screen frame of a logged-in page, with the bottom menu on the two main tabs.
class AppScaffold extends StatelessWidget {
  final List<Widget> children;
  final bool nav;
  final Future<void> Function()? onRefresh;
  const AppScaffold({super.key, required this.children, this.nav = false, this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final list = ListView(
      padding: EdgeInsets.only(bottom: nav ? 16 : 28),
      physics: const AlwaysScrollableScrollPhysics(),
      children: children,
    );
    return Scaffold(
      body: onRefresh != null ? RefreshIndicator(onRefresh: onRefresh!, child: list) : list,
      bottomNavigationBar: nav ? const BottomNav() : null,
    );
  }
}

class BottomNav extends StatelessWidget {
  const BottomNav({super.key});
  @override
  Widget build(BuildContext context) {
    final route = ModalRoute.of(context)?.settings.name;
    final onOrders = route == '/orders';
    Widget item(IconData icon, String label, bool active, VoidCallback tap) => Expanded(
          child: InkWell(
            onTap: active ? null : tap,
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(icon, size: 22, color: active ? gold : n500),
              const SizedBox(height: 3),
              T(label, size: 11, weight: FontWeight.w700, color: active ? gold : n500),
            ]),
          ),
        );
    return SafeArea(
      child: Container(
        height: 62,
        margin: const EdgeInsets.fromLTRB(12, 0, 12, 10),
        decoration: BoxDecoration(color: ink, borderRadius: BorderRadius.circular(24)),
        child: Row(children: [
          item(Icons.home_outlined, 'Asosiy', !onOrders, () => navKey.currentState?.popUntil((r) => r.isFirst)),
          item(Icons.assignment_outlined, 'Buyurtma', onOrders, () => Navigator.pushNamed(context, '/orders')),
        ]),
      ),
    );
  }
}

/// Re-renders every second for live timers.
class Ticker1s extends StatefulWidget {
  final WidgetBuilder builder;
  const Ticker1s({super.key, required this.builder});
  @override
  State<Ticker1s> createState() => _Ticker1sState();
}

class _Ticker1sState extends State<Ticker1s> {
  Timer? _t;
  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context);
}

// ---- ride meter ------------------------------------------------------------

class WaitPanel extends StatelessWidget {
  final String title;
  final double seconds;
  final double fee;
  final Tariff? tariff;
  final bool counting;
  final bool moving;
  final bool? toggleRunning;
  final bool togglePending;
  final VoidCallback? onToggle;
  const WaitPanel({
    super.key,
    required this.title,
    required this.seconds,
    required this.fee,
    required this.tariff,
    required this.counting,
    this.moving = false,
    this.toggleRunning,
    this.togglePending = false,
    this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final free = numOf(tariff?['waitingFreeMinutes']);
    final ppm = numOf(tariff?['waitingPricePerMinute']);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: cardBox(color: counting ? orangeBg : Colors.white, border: counting ? orangeLine : line),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          const Icon(Icons.schedule, size: 12, color: n500),
          const SizedBox(width: 6),
          Expanded(child: Caption(title)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(color: counting ? const Color(0xB3FED7AA) : const Color(0xFFF5F5F5), borderRadius: BorderRadius.circular(99)),
            child: Caption(counting ? 'Hisoblanmoqda' : 'O‘chiq', color: counting ? const Color(0xFF7C2D12) : n500),
          ),
        ]),
        const SizedBox(height: 12),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Caption('Kutish vaqti'),
              const SizedBox(height: 2),
              T(fmtClock(seconds), size: 28, weight: FontWeight.w800),
            ]),
          ),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Caption('Kutish haqi'),
              const SizedBox(height: 2),
              SumLine(fmtSum(fee), size: 28, unitSize: 12, unitColor: n500),
            ]),
          ),
        ]),
        const SizedBox(height: 8),
        T(ppm > 0 ? '${free.round()} daqiqa bepul, keyin ${fmtSum(ppm)} so‘m/daq' : 'Kutish pullik emas', size: 11, color: n500),
        if (counting) ...[
          const SizedBox(height: 4),
          T(moving ? '🚗 Harakatda — vaqt hisoblanmayapti' : '⏸ Mashina turibdi — vaqt hisoblanmoqda',
              size: 11, weight: FontWeight.w600, color: moving ? n500 : const Color(0xFFC2410C)),
        ],
        if (toggleRunning != null) ...[
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: TextButton(
              onPressed: togglePending ? null : onToggle,
              style: TextButton.styleFrom(
                backgroundColor: toggleRunning! ? ink : const Color(0xFFFFEDD5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: toggleRunning! ? BorderSide.none : const BorderSide(color: orangeLine)),
              ),
              child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                if (togglePending)
                  SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: toggleRunning! ? gold : orangeText))
                else
                  Icon(toggleRunning! ? Icons.play_circle_outline : Icons.pause, size: 20, color: toggleRunning! ? gold : orangeText),
                const SizedBox(width: 8),
                T(toggleRunning! ? 'Davom etish' : 'Kutish', size: 16, weight: FontWeight.w700, color: toggleRunning! ? gold : orangeText),
              ]),
            ),
          ),
        ],
      ]),
    );
  }
}

class FareCard extends StatelessWidget {
  final double distanceFare;
  final double waitFee;
  final Tariff tariff;
  final String distanceLabel;
  const FareCard({super.key, required this.distanceFare, required this.waitFee, required this.tariff, this.distanceLabel = 'Yo‘l'});
  @override
  Widget build(BuildContext context) {
    final total = distanceFare + waitFee;
    final pct = numOf(tariff['commissionPercent']);
    return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: cardBox(),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Caption('Jami narx'),
            const SizedBox(height: 6),
            Fit(T(fmtSum(total), size: 24, weight: FontWeight.w800)),
            const SizedBox(height: 6),
            T('$distanceLabel ${fmtSum(distanceFare)} + kutish ${fmtSum(waitFee)}', size: 11, color: n500),
          ]),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: cardBox(color: const Color(0x1A3B9BFF), border: const Color(0x663B9BFF)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Caption('Komissiya${pct > 0 ? ' ${pct.round()}%' : ''}', color: goldDeep),
            const SizedBox(height: 6),
            Fit(T(fmtSum(commissionFor(total, tariff)), size: 24, weight: FontWeight.w800)),
          ]),
        ),
      ),
    ]);
  }
}

class TariffLine extends StatelessWidget {
  final Tariff tariff;
  const TariffLine(this.tariff, {super.key});
  @override
  Widget build(BuildContext context) {
    final tiers = tariff['tiers'] as List?;
    final pct = numOf(tariff['commissionPercent']);
    final base = tiers != null && tiers.isNotEmpty
        ? 'Pog‘onali tarif (${tiers.length} pog‘ona) · keyin ${fmtSum(tariff['pricePerKm'])} so‘m/km'
        : 'Tarif: ${fmtSum(tariff['pricePerKm'])} so‘m/km · minimum ${fmtSum(tariff['minimumFare'])} so‘m';
    final com = pct > 0 ? '${pct.round()}%' : '${fmtSum(tariff['commissionPerOrder'])} so‘m';
    return T('$base · komissiya $com', size: 11, color: n500, align: TextAlign.center);
  }
}

// ---- waiting toggle (mid-ride pause) ----------------------------------------

DateTime _lastWaitTap = DateTime.fromMillisecondsSinceEpoch(0);

/// "Kutish" / "Davom etish" that always does what the driver sees: the wanted
/// state is read at tap time, the screen switches immediately, taps are ignored
/// while the request is in flight, and on an error the server state is re-read.
Future<void> toggleWait(void Function(String?) onError) async {
  final cur = orders.active;
  if (cur == null || cur['status'] != 'IN_PROGRESS' || orders.waitPending) return;
  final now = DateTime.now();
  if (now.difference(_lastWaitTap).inMilliseconds < 700) return;
  _lastWaitTap = now;
  final id = cur['id'].toString();
  final on = cur['waitStartedAt'] == null;
  final before = <String, dynamic>{
    'waitStartedAt': cur['waitStartedAt'],
    'waitTickAt': cur['waitTickAt'],
    'waitingSeconds': cur['waitingSeconds'] ?? 0,
    'waitMoving': cur['waitMoving'] ?? false,
  };
  final nowMs = serverNow();
  final nowIso = DateTime.fromMillisecondsSinceEpoch(nowMs).toUtc().toIso8601String();
  orders.setWaitPending(true);
  onError(null);
  orders.patchActive(
    id,
    on
        ? {'waitStartedAt': nowIso, 'waitTickAt': nowIso, 'waitMoving': false}
        : {'waitingSeconds': liveWaitSec(cur, nowMs).round(), 'waitStartedAt': null, 'waitTickAt': null, 'waitMoving': false},
  );
  try {
    final r = await api.post('/driver/orders/$id/wait/${on ? 'start' : 'stop'}');
    if (on) noteServerTime(r.data?['waitStartedAt']);
    if (orders.active?['status'] == 'IN_PROGRESS') {
      orders.patchActive(id, {...orderFields(r.data), 'waitMoving': false});
    }
  } catch (e) {
    if (orders.active?['status'] == 'IN_PROGRESS') orders.patchActive(id, before);
    onError(errMsg(e, on ? 'Kutishni yoqib bo‘lmadi' : 'Kutishni to‘xtatib bo‘lmadi'));
    try {
      final f = await api.get('/driver/orders/$id');
      if (f.data?['id'] == id && orders.active?['status'] == 'IN_PROGRESS') {
        orders.patchActive(id, orderFields(f.data));
        if (f.data['status'] == 'IN_PROGRESS' && (f.data['waitStartedAt'] != null) == on) onError(null);
      }
    } catch (_) {}
  } finally {
    orders.setWaitPending(false);
  }
}

/// Re-read the active order from the server; an order that ended there is
/// always taken. Returns the server order (with `client`).
/// Opens a ride from a list. One still going becomes the current job and opens
/// to work on (it may have been accepted from the card over other apps while
/// the app was closed); a finished one opens its details.
Future<void> openRide(BuildContext context, Json o) async {
  final id = '${o['id']}';
  final nav = Navigator.of(context);
  if (rideStatuses.contains(o['status'])) {
    try {
      final d = asJson((await api.get('/driver/orders/$id')).data);
      if (d != null && rideStatuses.contains(d['status'])) {
        adoptRide({...d, 'id': d['id'] ?? id});
        nav.pushNamed(d['source'] == 'street' ? '/taximeter' : '/order/active');
        return;
      }
    } catch (_) {
      // offline — the details screen still shows what is known
    }
  }
  nav.pushNamed('/order/detail', arguments: id);
}

Future<Json?> syncActiveOrder(String id) async {
  final statusBefore = orders.active?['id'] == id ? orders.active!['status'] : null;
  try {
    final r = await api.get('/driver/orders/$id');
    final data = asJson(r.data);
    if (data == null || data['id'] != id) return null;
    final cur = orders.active;
    if (cur == null || cur['id'] != id) return data;
    final f = orderFields(data);
    if ((data['status'] == 'COMPLETED' || data['status'] == 'CANCELLED') && cur['status'] != data['status']) {
      orders.patchActive(id, {...f, 'waitStartedAt': null});
      return data;
    }
    const always = ['pickupAddress', 'destinationAddress', 'destinationLat', 'destinationLng', 'source'];
    const quietOnly = ['status', 'arrivedAt', 'startedAt', 'waitingSeconds', 'waitStartedAt', 'waitTickAt'];
    final quiet = !orders.waitPending && cur['status'] == statusBefore && isLiveOrder(cur);
    orders.patchActive(id, {
      for (final k in always) if (f.containsKey(k)) k: f[k],
      if (quiet) for (final k in quietOnly) if (f.containsKey(k)) k: f[k],
    });
    return data;
  } catch (_) {
    return null;
  }
}

// ---- chat -------------------------------------------------------------------

const _quick = ['Yetib keldim 🚕', '2 daqiqada yetaman', 'Qayerdasiz?', 'Kutib turibman'];

class OrderChat extends StatefulWidget {
  final String orderId;
  final bool enabled;
  const OrderChat({super.key, required this.orderId, required this.enabled});
  @override
  State<OrderChat> createState() => _OrderChatState();
}

class _OrderChatState extends State<OrderChat> {
  List<Json> _msgs = [];
  final _text = TextEditingController();
  bool _busy = false;
  bool _open = false;
  int _seen = 0;
  Timer? _t;
  int _pushSeen = 0;

  Future<void> _load() async {
    try {
      final r = await api.get('/driver/orders/${widget.orderId}/messages');
      if (r.data is List && mounted) setState(() => _msgs = (r.data as List).map((e) => asJson(e)!).toList());
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    _load();
    _t = Timer.periodic(const Duration(seconds: 8), (_) => _load());
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Future<void> _send(String t) async {
    final clean = t.trim();
    if (clean.isEmpty || _busy) return;
    setState(() => _busy = true);
    try {
      await api.post('/driver/orders/${widget.orderId}/messages', data: {'text': clean});
      _text.clear();
      await _load();
    } catch (_) {
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Instant refresh when the socket receives a passenger message.
    final pushes = context.select<Bus, int>((b) => b.orderMessage);
    if (pushes != _pushSeen) {
      _pushSeen = pushes;
      Future.microtask(_load);
    }
    if (_open) _seen = _msgs.length;
    final seenClient = _msgs.take(_seen).where((m) => m['sender'] == 'client').length;
    final unread = _msgs.where((m) => m['sender'] == 'client').length - seenClient;
    return Section(
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: cardBox(),
        child: Column(children: [
          InkWell(
            onTap: () => setState(() => _open = !_open),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                const CircleAvatar(radius: 16, backgroundColor: Color(0x263B9BFF), child: Icon(Icons.chat_bubble_outline, size: 16, color: goldDeep)),
                const SizedBox(width: 8),
                const Expanded(child: T('Mijoz bilan chat', weight: FontWeight.w700)),
                if (!_open && unread > 0)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    margin: const EdgeInsets.only(right: 8),
                    decoration: BoxDecoration(color: Colors.red, borderRadius: BorderRadius.circular(99)),
                    child: T('$unread', size: 10, weight: FontWeight.w700, color: Colors.white),
                  ),
                T(_open ? 'Yopish' : 'Ochish', size: 12, color: n500),
              ]),
            ),
          ),
          if (_open) ...[
            const Divider(height: 1, color: line),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 256),
              child: _msgs.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(20),
                      child: T('Hali xabar yo‘q. Mijoz sizga botdan yozishi mumkin.', size: 12, color: n500, align: TextAlign.center),
                    )
                  : ListView(
                      shrinkWrap: true,
                      reverse: true,
                      padding: const EdgeInsets.all(12),
                      children: [
                        for (final m in _msgs.reversed)
                          Align(
                            alignment: m['sender'] == 'driver' ? Alignment.centerRight : Alignment.centerLeft,
                            child: Container(
                              constraints: const BoxConstraints(maxWidth: 240),
                              margin: const EdgeInsets.only(bottom: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                              decoration: cardBox(color: m['sender'] == 'driver' ? ink : Colors.white, border: m['sender'] == 'driver' ? ink : line),
                              child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                                Align(alignment: Alignment.centerLeft, child: T('${m['text']}', color: m['sender'] == 'driver' ? Colors.white : ink)),
                                T(fmtTime(m['createdAt']), size: 10, color: n400),
                              ]),
                            ),
                          ),
                      ],
                    ),
            ),
            if (widget.enabled) ...[
              SizedBox(
                height: 40,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                  children: [
                    for (final q in _quick)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ActionChip(
                          visualDensity: VisualDensity.compact,
                          backgroundColor: const Color(0x263B9BFF),
                          side: BorderSide.none,
                          label: T(q, size: 12, weight: FontWeight.w600, color: goldDeep),
                          onPressed: _busy ? null : () => _send(q),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  Expanded(child: TextField(controller: _text, decoration: InputDecoration(hintText: tr('Mijozga xabar…')))),
                  const SizedBox(width: 8),
                  IconButton.filled(
                    style: IconButton.styleFrom(backgroundColor: ink, foregroundColor: gold),
                    onPressed: _busy ? null : () => _send(_text.text),
                    icon: const Icon(Icons.send, size: 16),
                  ),
                ]),
              ),
            ] else
              const Padding(
                padding: EdgeInsets.all(14),
                child: T('Safar yakunlangan — chat yopiq.', size: 12, color: n500),
              ),
          ],
        ]),
      ),
    );
  }
}

// ---- contract ---------------------------------------------------------------

class ContractText extends StatefulWidget {
  const ContractText({super.key});
  @override
  State<ContractText> createState() => _ContractTextState();
}

class _ContractTextState extends State<ContractText> {
  String? _text;
  bool _err = false;
  @override
  void initState() {
    super.initState();
    api.get('/public/driver-contract').then((r) {
      if (mounted) setState(() => _text = r.data['text']?.toString());
    }).catchError((_) {
      if (mounted) setState(() => _err = true);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_err) return const T('Shartnoma matnini yuklab bo‘lmadi. Internetni tekshiring.', color: red);
    if (_text == null) return const T('Yuklanmoqda…', color: n500);
    return T(_text!, size: 13, height: 1.45);
  }
}

Future<void> showContractSheet(BuildContext context) => showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (c) => SizedBox(
        height: MediaQuery.of(c).size.height * 0.85,
        child: Column(children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 8, 8),
            child: Row(children: [
              const Expanded(child: T('📄 Haydovchi shartnomasi', size: 16, weight: FontWeight.w800)),
              TextButton(onPressed: () => Navigator.pop(c), child: const T('Yopish', color: n500, weight: FontWeight.w600)),
            ]),
          ),
          const Divider(height: 1, color: line),
          const Expanded(child: SingleChildScrollView(padding: EdgeInsets.all(20), child: ContractText())),
        ]),
      ),
    );
