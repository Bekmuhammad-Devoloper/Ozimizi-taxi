import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../core/voice_nav.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

const _label = {
  'NEW': 'Tasdiq kutilmoqda',
  'COOKING': 'Tayyorlanmoqda',
  'READY': 'Tayyor',
  'PICKED_UP': 'Yo‘lda',
  'DELIVERED': 'Yetkazildi',
  'CANCELLED': 'Bekor qilindi',
  'REJECTED': 'Bekor qilindi',
};
const _stepIndex = {'NEW': 0, 'COOKING': 0, 'READY': 0, 'PICKED_UP': 1, 'DELIVERED': 2};
const _stopLabel = {
  'NEW': 'Oshxona hali tasdiqlamadi',
  'COOKING': 'Tayyorlanmoqda',
  'READY': 'Tayyor — olib keting',
  'PICKED_UP': 'Olindi ✓',
  'DELIVERED': 'Yetkazildi',
};

/// The courier's job: kitchen(s) → client, with cash to collect.
class ActiveDeliveryScreen extends StatefulWidget {
  const ActiveDeliveryScreen({super.key});
  @override
  State<ActiveDeliveryScreen> createState() => _ActiveDeliveryScreenState();
}

class _ActiveDeliveryScreenState extends State<ActiveDeliveryScreen> {
  bool _loading = true;
  bool _busy = false;
  String? _err;
  Timer? _poll;
  int _pushSeen = -1;

  Future<void> _refresh() => deliveries.sync().whenComplete(() {
        if (mounted) setState(() => _loading = false);
      });

  @override
  void initState() {
    super.initState();
    _refresh();
    // The kitchen may mark it ready, the client / admin may cancel it.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) {
      if (isDeliveryLive(deliveries.active)) _refresh();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _nav.dispose();
    super.dispose();
  }

  final _nav = VoiceNav();

  void _finish() {
    deliveries.setActive(null);
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  List<Json>? get _group {
    final g = deliveries.active?['group'];
    return g is List && g.length > 1 ? g.map((e) => asJson(e)!).toList() : null;
  }

  double _sum(String k) {
    final d = deliveries.active!;
    final g = _group;
    return g != null ? g.fold<double>(0, (s, x) => s + numOf(x[k])) : numOf(d[k]);
  }

  bool get _allPicked {
    final g = _group;
    if (g != null) return g.every((x) => x['status'] == 'PICKED_UP' || x['status'] == 'DELIVERED');
    return deliveries.active?['status'] == 'PICKED_UP';
  }

  Future<void> _act(String path, String id) async {
    final d = deliveries.active!;
    final g = _group;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await api.post('/driver/deliveries/$id/$path');
      if (g != null && path == 'picked-up') {
        await deliveries.sync(); // the next kitchen becomes the current stop
        return;
      }
      final data = asJson(r.data) ?? {};
      deliveries.setActive(g != null && path == 'delivered'
          ? {...d, ...data, 'group': g.map((x) => {...x, 'status': 'DELIVERED'}).toList()}
          : {...d, ...data});
      if (path == 'delivered') auth.refreshMe();
    } catch (e) {
      await deliveries.sync(); // the server may have moved on
      if (mounted) setState(() => _err = errMsg(e, 'Xato'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickedUp(Json stop) async {
    if (stop['status'] == 'COOKING' &&
        !await confirmDialog(context, 'Oshxona hali “tayyor” deb belgilamagan. Buyurtmani qo‘lingizga oldingizmi?')) {
      return;
    }
    await _act('picked-up', stop['id'].toString());
  }

  Future<void> _delivered() async {
    if (!await confirmDialog(context, 'Buyurtma mijozga topshirildi va ${money(_sum('total'))} naqd olindimi?')) return;
    await _act('delivered', deliveries.active!['id'].toString());
  }

  Future<void> _release() async {
    if (!await confirmDialog(context, 'Buyurtmani qaytarasizmi? U boshqa kuryerga taklif qilinadi.')) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      await api.post('/driver/deliveries/${deliveries.active!['id']}/release');
      deliveries.setActive(null);
      if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
    } catch (e) {
      deliveries.sync();
      if (mounted) setState(() => _err = errMsg(e, 'Qaytarib bo‘lmadi'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    context.watch<DeliveryStore>();
    final pushes = context.select<Bus, int>((b) => b.delivery);
    if (pushes != _pushSeen) {
      if (_pushSeen != -1) Future.microtask(_refresh);
      _pushSeen = pushes;
    }
    final d = deliveries.active;
    if (d == null) {
      return Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            T(_loading ? 'Yuklanmoqda…' : 'Faol yetkazish yo‘q.', color: n500),
            if (!_loading) ...[
              const SizedBox(height: 20),
              SizedBox(width: 160, child: OutlineBtn('Bosh sahifa', height: 44, onTap: () => Navigator.of(context).popUntil((r) => r.isFirst))),
            ],
          ]),
        ),
      );
    }
    final status = d['status'].toString();
    final cancelled = status == 'CANCELLED' || status == 'REJECTED';
    final group = _group;
    final allPicked = _allPicked;
    final commission = numOf(d['courierCommission']);
    // Voice directions: to the kitchen until the food is collected, then to the client.
    final navKitchen = asJson(d['kitchen']);
    _nav.follow(
      !isDeliveryLive(d)
          ? null
          : allPicked
              ? (numOrNull(d['lat']) != null && numOrNull(d['lng']) != null ? Pt(numOf(d['lat']), numOf(d['lng'])) : null)
              : (numOrNull(navKitchen?['lat']) != null && numOrNull(navKitchen?['lng']) != null
                  ? Pt(numOf(navKitchen!['lat']), numOf(navKitchen['lng']))
                  : null),
      'dest',
    );
    final hero = Hero2(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Caption('🍽 Yetkazish', color: n400),
              T('#${d['number']}', size: 16, weight: FontWeight.w700, color: Colors.white),
            ]),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: cancelled ? red : gold, borderRadius: BorderRadius.circular(99)),
            child: Caption(_label[status] ?? status, color: cancelled ? Colors.white : ink),
          ),
        ]),
        if (!cancelled) ...[
          const SizedBox(height: 18),
          StepProgress(labels: const ['Oshxona', 'Yo‘lda', 'Yetkazildi'], current: _stepIndex[status] ?? 0),
        ],
      ]),
    );

    if (cancelled) {
      return AppScaffold(children: [
        hero,
        Section(
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(20),
            decoration: cardBox(color: redBg, border: redLine),
            child: Column(children: [
              const Icon(Icons.cancel_outlined, size: 28, color: red),
              const SizedBox(height: 8),
              const T('Buyurtma bekor qilindi', size: 16, weight: FontWeight.w700, color: redText),
              const SizedBox(height: 4),
              T('#${d['number']}${asJson(d['kitchen'])?['name'] != null ? ' · ${asJson(d['kitchen'])!['name']}' : ''}${d['cancelledBy'] == 'client' ? ' · mijoz bekor qildi' : (d['cancelledBy'] == 'admin' ? ' · administrator bekor qildi' : '')}', size: 12, color: redText, align: TextAlign.center),
              if (d['pickedUpAt'] != null) ...[
                const SizedBox(height: 10),
                const T('Buyurtmani oshxonaga qaytaring yoki administrator bilan bog‘laning.', size: 12, weight: FontWeight.w600, color: redText, align: TextAlign.center),
              ],
            ]),
          ),
        ),
        Section(top: 24, child: PrimaryButton('Bosh sahifa', icon: Icons.check, onTap: _finish)),
      ]);
    }

    if (status == 'DELIVERED') {
      final fee = _sum('deliveryFee');
      return AppScaffold(children: [
        hero,
        Section(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: cardBox(border: gold, width: 2),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Row(children: [
                Icon(Icons.check_circle_outline, size: 20, color: goldDeep),
                SizedBox(width: 8),
                T('Yetkazildi', size: 16, weight: FontWeight.w700),
              ]),
              const SizedBox(height: 10),
              KV('Mijozdan olingan naqd', money(_sum('total')), bold: true),
              KV('Taomlar', money(_sum('itemsTotal'))),
              KV('Yetkazish haqi', money(fee)),
              KV('Komissiya', '-${money(commission)}'),
              const Divider(color: line),
              KV('Sof daromad', '+${money(fee - commission)}', bold: true),
              if (d['deliveredAt'] != null) ...[
                const SizedBox(height: 6),
                T(fmtDateTime(d['deliveredAt']), size: 12, color: n500),
              ],
            ]),
          ),
        ),
        Section(top: 24, child: PrimaryButton('Bosh sahifa', icon: Icons.check, onTap: _finish)),
      ]);
    }

    final kitchen = asJson(d['kitchen']);
    final items = (d['items'] as List? ?? const []).map((e) => asJson(e)!).toList();
    final itemsCount = items.fold<double>(0, (s, i) => s + numOf(i['qty'])).round();

    final kitchenCard = kitchen == null
        ? const SizedBox.shrink()
        : Section(
            child: Container(
              clipBehavior: Clip.antiAlias,
              decoration: cardBox(),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const CircleAvatar(radius: 22, backgroundColor: Color(0x263B9BFF), child: Icon(Icons.soup_kitchen_outlined, size: 18, color: goldDeep)),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        const Caption('Oshxona'),
                        T('${kitchen['name']}', weight: FontWeight.w700),
                        if (textOf(kitchen['address']) != null) T('${kitchen['address']}', size: 12, color: n600),
                      ]),
                    ),
                    if (textOf(kitchen['phone']) != null) PhoneButton('${kitchen['phone']}'),
                  ]),
                ),
                Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 12), child: _KitchenStatus(d)),
                if (!allPicked && kitchen['lat'] != null) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(14, 0, 14, 12),
                    child: NavButton(label: 'Oshxonaga yo‘l ko‘rsatish', lat: numOf(kitchen['lat']), lng: numOf(kitchen['lng'])),
                  ),
                  MiniMap(lat: numOf(kitchen['lat']), lng: numOf(kitchen['lng']), route: _nav.line, me: _nav.me),
                ],
              ]),
            ),
          );

    final lat = numOf(d['lat']), lng = numOf(d['lng']);
    final clientCard = Section(
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: cardBox(),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(children: [
              CircleAvatar(
                radius: 22,
                backgroundColor: const Color(0x263B9BFF),
                child: T((textOf(d['clientName']) ?? 'M').substring(0, 1).toUpperCase(), size: 18, weight: FontWeight.w700, color: goldDeep),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Caption('Mijoz'),
                  T(textOf(d['clientName']) ?? 'Mijoz', weight: FontWeight.w700, maxLines: 1),
                  if (textOf(d['phone']) != null) T('${d['phone']}', size: 12, color: n500),
                ]),
              ),
              if (textOf(d['phone']) != null) PhoneButton('${d['phone']}'),
            ]),
          ),
          const Divider(height: 1, color: line),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.location_on_outlined, size: 16, color: goldDeep),
              const SizedBox(width: 8),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Caption('Yetkazish manzili'),
                  const SizedBox(height: 2),
                  T(textOf(d['address']) ?? '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}'),
                  if (d['distanceKm'] != null) T('oshxonadan ≈ ${d['distanceKm']} km', size: 12, color: n500),
                ]),
              ),
            ]),
          ),
          if (textOf(d['comment']) != null)
            Container(
              margin: const EdgeInsets.fromLTRB(14, 0, 14, 12),
              padding: const EdgeInsets.all(10),
              decoration: cardBox(color: const Color(0x1A3B9BFF), border: const Color(0x4D3B9BFF), radius: 12),
              child: T('${d['comment']}', size: 12, color: goldDeep),
            ),
          Padding(padding: const EdgeInsets.fromLTRB(14, 0, 14, 12), child: NavButton(label: 'Mijozga yo‘l ko‘rsatish', lat: lat, lng: lng)),
          if (allPicked) MiniMap(lat: lat, lng: lng, route: _nav.line, me: _nav.me),
        ]),
      ),
    );

    return AppScaffold(onRefresh: _refresh, children: [
      hero,
      if (group != null) _stops(group, d['id'].toString()),
      // The current target first: the kitchen, then the client.
      if (allPicked) ...[clientCard, kitchenCard] else ...[kitchenCard, clientCard],
      Section(
        child: Container(
          decoration: cardBox(),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 8), child: Caption('Buyurtma tarkibi · $itemsCount ta')),
            for (final it in items)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                child: Row(children: [
                  Expanded(child: T('${numOf(it['qty']).round()} × ${it['name']}')),
                  T(fmtSum(numOf(it['price']) * numOf(it['qty'])), color: n600),
                ]),
              ),
            const Divider(color: line),
            Padding(padding: const EdgeInsets.fromLTRB(16, 0, 16, 10), child: KV('Taomlar', money(d['itemsTotal']))),
          ]),
        ),
      ),
      Section(
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.all(20),
          decoration: cardBox(color: ink, border: ink),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Caption('Mijozdan olinadi (naqd)', color: gold),
            const SizedBox(height: 8),
            SumLine(fmtSum(_sum('total')), size: 44, color: Colors.white, unitSize: 16),
            const SizedBox(height: 8),
            T('Taomlar ${fmtSum(_sum('itemsTotal'))} + yetkazish ${fmtSum(_sum('deliveryFee'))} so‘m${group != null ? ' · ${group.length} ta oshxona' : ''}', size: 12, color: n400),
          ]),
        ),
      ),
      Section(
        top: 12,
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: cardBox(),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Caption('Sizning haqingiz'),
                const SizedBox(height: 6),
                T(fmtSum(_sum('deliveryFee')), size: 22, weight: FontWeight.w800),
              ]),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: cardBox(color: const Color(0x1A3B9BFF), border: const Color(0x663B9BFF)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Caption('Komissiya', color: goldDeep),
                const SizedBox(height: 6),
                if (commission > 0)
                  T(fmtSum(commission), size: 22, weight: FontWeight.w800)
                else
                  const T('Yetkazilgach balansdan yechiladi', size: 11, color: goldDeep),
              ]),
            ),
          ),
        ]),
      ),
      if (_err != null) Section(top: 12, child: T(_err!, color: red)),
      Section(
        top: 24,
        child: Column(children: [
          if (!allPicked && status == 'NEW')
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: T('${kitchen?['name'] ?? 'Oshxona'} buyurtmani hali tasdiqlamadi — tasdiqlashi bilan xabar keladi.', color: n600, align: TextAlign.center),
            ),
          if (!allPicked && (status == 'COOKING' || status == 'READY'))
            PrimaryButton(group != null ? '${kitchen?['name'] ?? 'Oshxona'}dan oldim' : 'Buyurtmani oldim', icon: Icons.inventory_2_outlined, busy: _busy, onTap: () => _pickedUp(d)),
          if (!allPicked && const ['NEW', 'COOKING', 'READY'].contains(status)) ...[
            const SizedBox(height: 12),
            OutlineBtn('Qaytarish', icon: Icons.undo, danger: true, height: 44, onTap: _busy ? null : _release),
          ],
          if (allPicked)
            PrimaryButton(group != null ? 'Hammasi yetkazildi, ${money(_sum('total'))} oldim' : 'Yetkazildi, pulni oldim', icon: Icons.check_circle_outline, busy: _busy, onTap: _delivered),
        ]),
      ),
    ]);
  }

  /// One client, several kitchens: every pick-up stop with its state.
  Widget _stops(List<Json> group, String current) {
    final done = group.where((g) => g['status'] == 'PICKED_UP' || g['status'] == 'DELIVERED').length;
    return Section(
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: cardBox(border: gold, width: 2),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Padding(padding: const EdgeInsets.fromLTRB(16, 12, 16, 8), child: T('🍽 ${group.length} ta oshxonadan yig‘asiz · $done/${group.length} olindi', weight: FontWeight.w700)),
          for (var i = 0; i < group.length; i++) _stop(group[i], i, current),
        ]),
      ),
    );
  }

  Widget _stop(Json g, int i, String current) {
    final picked = g['status'] == 'PICKED_UP' || g['status'] == 'DELIVERED';
    final canPick = g['status'] == 'COOKING' || g['status'] == 'READY';
    final count = ((g['items'] as List?) ?? const []).fold<double>(0, (s, it) => s + numOf(it['qty'])).round();
    final k = asJson(g['kitchen']);
    return Container(
      color: g['id'] == current ? const Color(0x1A3B9BFF) : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(children: [
        CircleAvatar(
          radius: 16,
          backgroundColor: picked ? const Color(0xFF10B981) : ink,
          child: picked ? const Icon(Icons.check, size: 16, color: Colors.white) : T('${i + 1}', weight: FontWeight.w700, color: Colors.white),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            T('${k?['name'] ?? 'Oshxona'}', weight: FontWeight.w700, maxLines: 1),
            T('#${g['number']} · $count ta taom · ${_stopLabel[g['status']] ?? g['status']}', size: 12, color: n500),
          ]),
        ),
        if (textOf(k?['phone']) != null && !picked)
          IconButton(icon: const Icon(Icons.phone, size: 16), onPressed: () => callPhone('${k!['phone']}')),
        if (canPick)
          TextButton(
            style: TextButton.styleFrom(backgroundColor: gold, foregroundColor: ink, minimumSize: const Size(0, 36)),
            onPressed: _busy ? null : () => _pickedUp(g),
            child: const T('Oldim', size: 12, weight: FontWeight.w700),
          ),
      ]),
    );
  }
}

/// Kitchen-side state: still cooking (with an estimate), ready, picked up.
class _KitchenStatus extends StatelessWidget {
  final Json d;
  const _KitchenStatus(this.d);

  Widget _pill(IconData i, String text, Color fg, Color bg, Color border) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99), border: Border.all(color: border)),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(i, size: 12, color: fg),
          const SizedBox(width: 6),
          Flexible(child: T(text, size: 12, weight: FontWeight.w700, color: fg)),
        ]),
      );

  @override
  Widget build(BuildContext context) {
    final s = d['status'];
    if (s == 'PICKED_UP') {
      return Align(alignment: Alignment.centerLeft, child: _pill(Icons.check, 'Olindi${d['pickedUpAt'] != null ? ' · ${fmtTime(d['pickedUpAt'])}' : ''}', n600, const Color(0xFFF5F5F5), line));
    }
    if (s == 'READY') {
      return Align(alignment: Alignment.centerLeft, child: _pill(Icons.check_circle_outline, 'Tayyor — olib keting${d['readyAt'] != null ? ' · ${fmtTime(d['readyAt'])}' : ''}', green, greenBg, greenLine));
    }
    String? eta;
    final accepted = parseTime(d['acceptedAt']);
    final prep = numOrNull(d['prepMinutes']);
    if (accepted != null && prep != null) {
      final at = accepted.add(Duration(minutes: prep.round()));
      final left = at.difference(DateTime.now()).inMinutes + 1;
      eta = left > 0 ? '≈ $left daq qoldi (${fmtTime(at.toIso8601String())})' : 'tez orada tayyor bo‘ladi';
    } else if (prep != null) {
      eta = '~${prep.round()} daq';
    }
    return Wrap(spacing: 8, runSpacing: 4, crossAxisAlignment: WrapCrossAlignment.center, children: [
      _pill(Icons.schedule, 'Tayyorlanmoqda', orangeText, orangeBg, orangeLine),
      if (eta != null) T(eta, size: 12, color: n500),
    ]);
  }
}
