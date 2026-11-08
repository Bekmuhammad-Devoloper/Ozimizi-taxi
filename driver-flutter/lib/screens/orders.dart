import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

/// "Mavjud" (orders free to take) and "Tarix".
class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late bool _availableTab = auth.online;
  List<Json> _available = [];
  List<Json> _deliveries = [];
  List<Json> _history = [];
  List<Json> _deliveryHistory = [];
  bool _loading = true;
  String? _accepting;
  Timer? _poll;

  List<Json> _list(dynamic d) => d is List ? d.map((e) => asJson(e)!).toList() : [];

  Future<void> _fetchAvailable() async {
    if (!auth.isCourier) {
      try {
        final r = await api.get('/driver/orders/available');
        if (mounted) setState(() => _available = _list(r.data));
      } catch (_) {}
    }
    if (auth.takesDeliveries) {
      try {
        final r = await api.get('/driver/deliveries/available');
        if (mounted) setState(() => _deliveries = _list(r.data));
      } catch (_) {}
    }
  }

  Future<void> _fetchHistory() async {
    try {
      final r = await api.get('/driver/orders/history');
      if (mounted) setState(() => _history = _list(r.data));
    } catch (_) {}
    try {
      final r = await api.get('/driver/deliveries/history');
      if (mounted) setState(() => _deliveryHistory = _list(r.data));
    } catch (_) {}
  }

  @override
  void initState() {
    super.initState();
    Future.wait([_fetchAvailable(), _fetchHistory()]).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
    // Available orders refresh by themselves.
    _poll = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_availableTab && auth.online) _fetchAvailable();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    super.dispose();
  }

  Future<void> _accept(String id) async {
    if (_accepting != null) return;
    setState(() => _accepting = id);
    try {
      final r = await api.post('/driver/orders/$id/accept');
      orders.resetDistance();
      orders.setActive({'id': r.data['id'], ...orderFields(r.data)});
      if (mounted) Navigator.pushReplacementNamed(context, '/order/active');
    } catch (e) {
      if (mounted) toast(context, errMsg(e, 'Qabul qilib bo‘lmadi'));
      _fetchAvailable();
    } finally {
      if (mounted) setState(() => _accepting = null);
    }
  }

  Future<void> _takeDelivery(String id) async {
    if (_accepting != null) return;
    setState(() => _accepting = id);
    try {
      await deliveries.accept(id);
      if (mounted) Navigator.pushReplacementNamed(context, '/delivery/active');
    } catch (e) {
      if (mounted) toast(context, errMsg(e, 'Olib bo‘lmadi'));
      _fetchAvailable();
    } finally {
      if (mounted) setState(() => _accepting = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    Widget tab(String label, bool active, VoidCallback tap) => Expanded(
          child: InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: tap,
            child: Container(
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: active ? ink : Colors.transparent, borderRadius: BorderRadius.circular(12)),
              child: T(label, size: 12, weight: FontWeight.w700, color: active ? gold : n500),
            ),
          ),
        );
    return AppScaffold(
      nav: true,
      onRefresh: () => Future.wait([_fetchAvailable(), _fetchHistory()]),
      children: [
        const Hero2(
          padding: EdgeInsets.fromLTRB(24, 24, 24, 24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            T('Buyurtmalar', size: 24, weight: FontWeight.w800, color: Colors.white),
            SizedBox(height: 4),
            T('Mavjud va tarix', color: n400),
          ]),
        ),
        Section(
          top: 12,
          child: Container(
            padding: const EdgeInsets.all(4),
            decoration: cardBox(),
            child: Row(children: [
              tab('Mavjud (${_available.length + _deliveries.length})', _availableTab, () => setState(() => _availableTab = true)),
              const SizedBox(width: 4),
              tab('Tarix (${_history.length + _deliveryHistory.length})', !_availableTab, () => setState(() => _availableTab = false)),
            ]),
          ),
        ),
        Section(
          top: 20,
          child: _loading
              ? const T('Yuklanmoqda…', color: n500)
              : (_availableTab ? _availableList() : _historyList()),
        ),
      ],
    );
  }

  Widget _empty(IconData icon, String title, [String? sub]) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 44),
        child: Column(children: [
          Icon(icon, size: 32, color: n300),
          const SizedBox(height: 12),
          T(title, color: n500, align: TextAlign.center),
          if (sub != null) ...[const SizedBox(height: 4), T(sub, size: 12, color: n400, align: TextAlign.center)],
        ]),
      );

  Widget _availableList() {
    if (!auth.online) {
      return _empty(Icons.circle_outlined, 'Siz offline', 'Buyurtmalarni ko‘rish uchun bosh sahifadan ONLINE’ga o‘ting');
    }
    if (_available.isEmpty && _deliveries.isEmpty) {
      return _empty(Icons.inbox_outlined, 'Hozircha buyurtmalar yo‘q', 'Avtomatik yangilanadi');
    }
    return Column(children: [
      for (final o in _deliveries) _deliveryCard(o),
      for (final o in _available)
        Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: cardBox(),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.location_on_outlined, size: 16, color: goldDeep),
              const SizedBox(width: 8),
              Expanded(
                child: T(textOf(o['pickupAddress']) ?? '${numOf(o['pickupLat']).toStringAsFixed(5)}, ${numOf(o['pickupLng']).toStringAsFixed(5)}'),
              ),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.schedule, size: 12, color: n500),
              const SizedBox(width: 4),
              T(fmtRelative(o['createdAt']), size: 12, color: n500),
              const SizedBox(width: 12),
              StatusBadge('${o['status']}'),
            ]),
            const SizedBox(height: 12),
            PrimaryButton(
              _accepting == o['id'] ? 'Qabul qilinmoqda...' : 'Qabul qilish',
              icon: Icons.check,
              height: 44,
              fontSize: 14,
              busy: _accepting == o['id'],
              onTap: () => _accept(o['id'].toString()),
            ),
          ]),
        ),
    ]);
  }

  Widget _deliveryCard(Json o) {
    final pickup = asJson(o['pickup']);
    final dest = asJson(o['destination']);
    final id = o['orderId'].toString();
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: cardBox(border: const Color(0x803B9BFF), width: 2),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Caption('🍽 Yetkazish #${o['number']}', color: goldDeep)),
          T('${numOf(o['distanceFromDriver']).toStringAsFixed(1)} km', size: 12, weight: FontWeight.w600, color: n600),
        ]),
        const SizedBox(height: 10),
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.restaurant_menu, size: 16, color: goldDeep),
          const SizedBox(width: 8),
          Expanded(child: T(textOf(pickup?['address']) ?? textOf(o['kitchenName']) ?? 'Oshxona')),
        ]),
        if (dest != null) ...[
          const SizedBox(height: 6),
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.location_on_outlined, size: 16, color: n400),
            const SizedBox(width: 8),
            Expanded(child: T(textOf(dest['address']) ?? '${numOf(dest['lat']).toStringAsFixed(5)}, ${numOf(dest['lng']).toStringAsFixed(5)}', color: n600)),
          ]),
        ],
        const SizedBox(height: 10),
        Wrap(spacing: 12, runSpacing: 4, children: [
          if (o['itemsCount'] != null) T('${o['itemsCount']} ta taom', size: 12, color: n500),
          if (o['estimatedKm'] != null) T('≈ ${o['estimatedKm']} km yo‘l', size: 12, color: n500),
          T(o['readyAt'] != null ? '✅ Tayyor' : (o['prepMinutes'] != null ? 'Tayyorlash ~${o['prepMinutes']} daq' : 'Tayyorlanmoqda'), size: 12, color: n500),
          T(fmtRelative(o['createdAt']), size: 12, color: n500),
        ]),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: cardBox(color: const Color(0xFFFAFAFA), radius: 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Caption('Mijozdan naqd'),
                T(money(o['total']), weight: FontWeight.w700),
              ]),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: cardBox(color: const Color(0x1A3B9BFF), border: const Color(0x663B9BFF), radius: 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Caption('Sizning haqingiz', color: goldDeep),
                T(money(o['estimatedPrice']), weight: FontWeight.w700),
              ]),
            ),
          ),
        ]),
        const SizedBox(height: 12),
        PrimaryButton(_accepting == id ? 'Olinmoqda...' : 'Olish', icon: Icons.check, height: 44, fontSize: 14, busy: _accepting == id, onTap: () => _takeDelivery(id)),
      ]),
    );
  }

  Widget _historyList() {
    if (_history.isEmpty && _deliveryHistory.isEmpty) return _empty(Icons.inbox_outlined, 'Tarix bo‘sh');
    final entries = <({dynamic at, Json o, bool delivery})>[
      for (final o in _history) (at: o['createdAt'], o: o, delivery: false),
      for (final d in _deliveryHistory) (at: d['createdAt'], o: d, delivery: true),
    ]..sort((a, b) => (b.at ?? '').toString().compareTo((a.at ?? '').toString()));
    final grouped = <String, List<({dynamic at, Json o, bool delivery})>>{};
    for (final e in entries) {
      (grouped[localDayKey(e.at)] ??= []).add(e);
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      for (final g in grouped.entries) ...[
        Caption(fmtDayLabel(g.key)),
        const SizedBox(height: 8),
        for (final e in g.value) e.delivery ? _deliveryHistoryItem(e.o) : _taxiHistoryItem(e.o),
        const SizedBox(height: 18),
      ],
    ]);
  }

  Widget _taxiHistoryItem(Json o) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () => openRide(context, o),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: cardBox(),
            child: Row(children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    StatusBadge('${o['status']}'),
                    const SizedBox(width: 8),
                    T(fmtTime(o['createdAt']), size: 12, color: n500),
                  ]),
                  const SizedBox(height: 8),
                  T('📍 ${textOf(o['pickupAddress']) ?? '${numOf(o['pickupLat']).toStringAsFixed(4)}, ${numOf(o['pickupLng']).toStringAsFixed(4)}'}', color: n600, maxLines: 1),
                  const SizedBox(height: 4),
                  T(o['distanceKm'] != null ? '${o['distanceKm']} km' : 'masofa —', size: 12, color: n500),
                ]),
              ),
              const SizedBox(width: 10),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                T(o['price'] != null ? fmtSum(o['price']) : '—', size: 16, weight: FontWeight.w700),
                const T('so‘m', size: 10, color: n500),
              ]),
              const Icon(Icons.chevron_right, size: 16, color: n300),
            ]),
          ),
        ),
      );

  Widget _deliveryHistoryItem(Json d) {
    final live = isDeliveryLive(d);
    final body = Container(
      padding: const EdgeInsets.all(16),
      decoration: cardBox(border: live ? const Color(0x803B9BFF) : line),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              StatusBadge('${d['status']}'),
              const SizedBox(width: 8),
              T(fmtTime(d['createdAt']), size: 12, color: n500),
              const SizedBox(width: 8),
              T('🍽 #${d['number']}', size: 12, weight: FontWeight.w600, color: n600),
            ]),
            const SizedBox(height: 8),
            T('🍽 ${asJson(d['kitchen'])?['name'] ?? 'Oshxona'}', color: n600, maxLines: 1),
            const SizedBox(height: 4),
            T('→ ${textOf(d['address']) ?? '${numOf(d['lat']).toStringAsFixed(4)}, ${numOf(d['lng']).toStringAsFixed(4)}'}', size: 12, color: n500, maxLines: 1),
          ]),
        ),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          T(fmtSum(d['deliveryFee']), size: 16, weight: FontWeight.w700),
          const T('so‘m', size: 10, color: n500),
        ]),
        if (live) const Icon(Icons.chevron_right, size: 16, color: n300),
      ]),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: live ? InkWell(onTap: () => Navigator.pushNamed(context, '/delivery/active'), child: body) : body,
    );
  }
}
