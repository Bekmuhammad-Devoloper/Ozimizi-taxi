import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

bool _meterShown = false;

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Json> _history = [];
  List<Json> _deliveries = [];
  bool _busy = false;
  String? _err;
  List<Json> _ann = [];
  int _annSeen = -1;

  @override
  void initState() {
    super.initState();
    _load();
    // The summary of a finished delivery was left — forget it.
    if (deliveries.active?['status'] == 'DELIVERED') deliveries.setActive(null);
    // App restarted with a street ride running: back to the taximeter, once.
    if (!_meterShown) {
      _meterShown = true;
      final a = orders.active;
      if (a?['source'] == 'street' && a?['status'] == 'IN_PROGRESS') {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) Navigator.pushNamed(context, '/taximeter');
        });
      }
    }
  }

  Future<void> _load() async {
    await auth.refreshMe();
    try {
      final r = await api.get('/driver/orders/history');
      if (r.data is List && mounted) setState(() => _history = (r.data as List).map((e) => asJson(e)!).toList());
    } catch (_) {}
    try {
      final r = await api.get('/driver/deliveries/history');
      if (r.data is List && mounted) setState(() => _deliveries = (r.data as List).map((e) => asJson(e)!).toList());
    } catch (_) {}
    await _loadAnnouncements();
  }

  Future<void> _loadAnnouncements() async {
    try {
      final r = await api.get('/driver/announcements');
      if (r.data is List && mounted) setState(() => _ann = (r.data as List).map((e) => asJson(e)!).toList());
    } catch (_) {}
  }

  Future<void> _toggle() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      if (!auth.online) {
        // Ask for GPS first: without a fix no orders come.
        var p = await Geolocator.checkPermission();
        if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
      }
      final r = await api.post('/driver/online');
      auth.setDriver({'isOnline': r.data['isOnline']});
    } catch (e) {
      setState(() => _err = errMsg(e, 'Xato'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Taxi rides + food deliveries (the courier's fee counts as the price).
  List<Json> get _all {
    const statusMap = {'DELIVERED': 'COMPLETED', 'CANCELLED': 'CANCELLED', 'REJECTED': 'CANCELLED', 'PICKED_UP': 'IN_PROGRESS'};
    final out = [
      ..._history,
      for (final d in _deliveries)
        {
          'id': 'delivery-${d['id']}',
          'status': statusMap[d['status']] ?? 'ACCEPTED',
          'distanceKm': d['distanceKm'],
          'price': d['deliveryFee'] ?? 0,
          'commission': d['courierCommission'] ?? 0,
          'createdAt': d['deliveredAt'] ?? d['createdAt'],
          'deliveryNo': d['number'],
        },
    ];
    out.sort((a, b) => (b['createdAt'] ?? '').toString().compareTo((a['createdAt'] ?? '').toString()));
    return out;
  }

  ({double revenue, int count, double km}) _sum(List<Json> list, bool Function(DateTime) match) {
    double rev = 0, km = 0;
    var n = 0;
    for (final o in list) {
      if (o['status'] != 'COMPLETED') continue;
      final t = parseTime(o['createdAt']);
      if (t == null || !match(t)) continue;
      n++;
      rev += numOf(o['price']) - numOf(o['commission']);
      km += numOf(o['distanceKm']);
    }
    return (revenue: rev, count: n, km: km);
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthStore>();
    context.watch<OrderStore>();
    context.watch<DeliveryStore>();
    final annPush = context.select<Bus, int>((b) => b.announcement);
    if (annPush != _annSeen) {
      _annSeen = annPush;
      Future.microtask(_loadAnnouncements);
    }

    final d = auth.driver;
    final online = auth.online;
    final live = orders.hasLiveOrder ? orders.active : null;
    final street = live?['source'] == 'street';
    final del = deliveries.active;
    final all = _all;
    final now = DateTime.now();
    final todayKey = localDayKey(now);
    final yKey = localDayKey(now.subtract(const Duration(days: 1)));
    final cutoff = now.subtract(const Duration(days: 7));
    final today = _sum(all, (t) => localDayKey(t) == todayKey);
    final yest = _sum(all, (t) => localDayKey(t) == yKey);
    final week = _sum(all, (t) => t.isAfter(cutoff));
    final gps = orders.gpsStatus;
    final gpsWarning = !online || gps == 'ok'
        ? null
        : gps == 'denied'
            ? 'Joylashuvga ruxsat berilmagan — buyurtmalar kelmaydi. Telefon sozlamalarida joylashuvga ruxsat bering.'
            : gps == 'unavailable'
                ? 'Joylashuv aniqlanmadi — buyurtmalar kelmaydi. GPS yoqilganini tekshiring.'
                : 'Joylashuv aniqlanmoqda… buyurtmalar GPS topilgach kela boshlaydi.';

    return AppScaffold(
      nav: true,
      onRefresh: _load,
      children: [
        Hero2(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 28),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              ClipRRect(borderRadius: BorderRadius.circular(10), child: Image.asset('assets/logo.jpg', width: 40, height: 40, fit: BoxFit.cover)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const T('MOVIY TAXI', size: 10, color: n400, spacing: 2),
                  T(d?['fullName']?.toString() ?? '—', weight: FontWeight.w600, color: Colors.white, maxLines: 1),
                ]),
              ),
              IconButton(
                style: IconButton.styleFrom(backgroundColor: const Color(0x1AFFFFFF)),
                icon: const Icon(Icons.person_outline, size: 18, color: Color(0xFFE5E5E5)),
                onPressed: () => Navigator.pushNamed(context, '/profile'),
              ),
            ]),
            const SizedBox(height: 20),
            Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Caption('Balans', color: n400),
                  const SizedBox(height: 4),
                  Wrap(crossAxisAlignment: WrapCrossAlignment.end, children: [
                    T(fmtSum(d?['balance']), size: 30, weight: FontWeight.w800, color: Colors.white),
                    const SizedBox(width: 6),
                    const T('so‘m', color: n400),
                  ]),
                ]),
              ),
              const SizedBox(width: 12),
              if (d?['isApproved'] == false)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: cardBox(color: const Color(0xFFFFEDD5), border: const Color(0xFFFDBA74), radius: 12),
                  child: const T('Tasdiq kutilmoqda', weight: FontWeight.w700, color: orangeText),
                )
              else if (d?['profileComplete'] == false)
                FilledButton.icon(
                  style: FilledButton.styleFrom(backgroundColor: gold, foregroundColor: ink),
                  icon: const Icon(Icons.warning_amber, size: 16),
                  label: const T('Profilni to‘ldiring', weight: FontWeight.w700),
                  onPressed: () => Navigator.pushNamed(context, '/profile'),
                )
              else
                Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Caption(online ? 'Online' : 'Offline', color: online ? gold : n400),
                  Switch(
                    value: online,
                    activeTrackColor: gold,
                    onChanged: _busy ? null : (_) => _toggle(),
                  ),
                ]),
            ]),
            if (_err != null) ...[
              const SizedBox(height: 10),
              T(_err!, size: 12, color: const Color(0xFFFCA5A5)),
            ],
          ]),
        ),
        if (gpsWarning != null)
          Section(
            top: 12,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: cardBox(color: gps == 'searching' ? const Color(0xFFF5F5F5) : orangeBg, border: gps == 'searching' ? line : orangeLine, radius: 12),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(Icons.warning_amber, size: 14, color: gps == 'searching' ? n600 : orangeText),
                const SizedBox(width: 8),
                Expanded(child: T(gpsWarning, size: 12, weight: FontWeight.w500, color: gps == 'searching' ? n600 : orangeText)),
              ]),
            ),
          ),
        if (live != null)
          _JobLink(
            caption: street ? 'Taksometr ishlayapti' : 'Faol buyurtma',
            text: street ? 'Safar davom etmoqda — taksometrni ochish' : (textOf(live['pickupAddress']) ?? 'Buyurtmani ochish'),
            icon: Icons.local_taxi,
            onTap: () => Navigator.pushNamed(context, street ? '/taximeter' : '/order/active'),
          ),
        if (!auth.isCourier && live == null && !isDeliveryLive(del))
          Section(
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              onTap: () => Navigator.pushNamed(context, '/taximeter'),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: cardBox(color: ink, border: const Color(0x4D3B9BFF)),
                child: Row(children: [
                  Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: gold, borderRadius: BorderRadius.circular(16)),
                    child: const Text('🚖', style: TextStyle(fontSize: 24)),
                  ),
                  const SizedBox(width: 16),
                  const Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      T('Taksometr', size: 18, weight: FontWeight.w800, color: Colors.white),
                      SizedBox(height: 2),
                      T('Ko‘chadan olingan mijoz uchun', size: 12, color: n400),
                    ]),
                  ),
                  const Icon(Icons.chevron_right, color: gold),
                ]),
              ),
            ),
          ),
        if (isDeliveryLive(del))
          _JobLink(
            caption: 'Faol yetkazish #${del!['number']}',
            text: del['status'] == 'COOKING'
                ? '${asJson(del['kitchen'])?['name'] ?? 'Oshxona'} — tayyorlanmoqda'
                : del['status'] == 'READY'
                    ? 'Buyurtma tayyor — oshxonadan oling'
                    : 'Mijozga yetkazing: ${del['address'] ?? ''}',
            icon: Icons.restaurant,
            onTap: () => Navigator.pushNamed(context, '/delivery/active'),
          ),
        if (del?['status'] == 'CANCELLED')
          Section(
            top: 12,
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: cardBox(color: redBg, border: redLine),
              child: Row(children: [
                const Icon(Icons.cancel_outlined, size: 18, color: red),
                const SizedBox(width: 10),
                Expanded(child: T('Yetkazish #${del!['number']} bekor qilindi', weight: FontWeight.w600, color: redText)),
                TextButton(onPressed: () => deliveries.setActive(null), child: const T('OK', weight: FontWeight.w700, color: redText)),
              ]),
            ),
          ),
        if (online) ...[
          Section(top: 28, child: _StatRow('Bugungi natijalar', today.revenue, today.count, today.km)),
          Section(
            top: 28,
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Expanded(child: Caption('So‘nggi buyurtmalar')),
                InkWell(
                  onTap: () => Navigator.pushNamed(context, '/orders'),
                  child: const Row(children: [T('Hammasi', size: 12, color: n500), Icon(Icons.chevron_right, size: 14, color: n500)]),
                ),
              ]),
              const SizedBox(height: 10),
              if (all.isEmpty)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: cardBox(),
                  child: const Column(children: [
                    Icon(Icons.auto_awesome, size: 20, color: gold),
                    SizedBox(height: 8),
                    T('Hozircha buyurtma yo‘q.\nBirinchi buyurtmani kuting!', color: n500, align: TextAlign.center),
                  ]),
                )
              else
                for (final o in all.take(3))
                  Container(
                    margin: const EdgeInsets.only(bottom: 8),
                    padding: const EdgeInsets.all(16),
                    decoration: cardBox(),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            StatusBadge('${o['status']}'),
                            if (o['deliveryNo'] != null) ...[
                              const SizedBox(width: 8),
                              T('🍽 #${o['deliveryNo']}', size: 12, weight: FontWeight.w600, color: n600),
                            ],
                          ]),
                          const SizedBox(height: 8),
                          T(fmtDateTime(o['createdAt']), size: 12, color: n500),
                        ]),
                      ),
                      T(numOrNull(o['price']) != null ? money(o['price']) : '—', weight: FontWeight.w600),
                    ]),
                  ),
            ]),
          ),
          _AnnouncementCard(_ann),
        ] else ...[
          Section(top: 28, child: _StatRow('Kechagi natijalar', yest.revenue, yest.count, yest.km)),
          Section(
            top: 20,
            child: Container(
              padding: const EdgeInsets.all(20),
              decoration: cardBox(color: ink, border: ink),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Row(children: [
                  Expanded(child: Caption('Hafta bo‘yicha', color: gold)),
                  T('oxirgi 7 kun', size: 10, color: n400),
                ]),
                const SizedBox(height: 10),
                T(money(week.revenue), size: 28, weight: FontWeight.w800, color: Colors.white),
                const SizedBox(height: 10),
                T('${week.count} buyurtma    ${week.km.toStringAsFixed(1)} km', size: 12, color: const Color(0xFFD4D4D4)),
              ]),
            ),
          ),
          Section(
            top: 20,
            child: InkWell(
              onTap: () => Navigator.pushNamed(context, '/orders'),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: cardBox(),
                child: const Row(children: [
                  Expanded(child: T('Barcha buyurtmalar tarixi', weight: FontWeight.w600)),
                  Icon(Icons.chevron_right, size: 16, color: n400),
                ]),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _JobLink extends StatelessWidget {
  final String caption;
  final String text;
  final IconData icon;
  final VoidCallback onTap;
  const _JobLink({required this.caption, required this.text, required this.icon, required this.onTap});
  @override
  Widget build(BuildContext context) => Section(
        top: 12,
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: gold, borderRadius: BorderRadius.circular(16)),
            child: Row(children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: ink, borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, size: 20, color: gold),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Caption(caption, color: ink),
                  T(text, weight: FontWeight.w600, maxLines: 1),
                ]),
              ),
              const Icon(Icons.chevron_right, size: 18, color: ink),
            ]),
          ),
        ),
      );
}

class _StatRow extends StatelessWidget {
  final String title;
  final double revenue;
  final int count;
  final double km;
  const _StatRow(this.title, this.revenue, this.count, this.km);
  @override
  Widget build(BuildContext context) {
    Widget card(IconData i, String label, String value, String unit) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: cardBox(),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(i, size: 16, color: goldDark),
              const SizedBox(height: 4),
              Caption(label),
              const SizedBox(height: 4),
              T(value, size: 17, weight: FontWeight.w700, maxLines: 1),
              T(unit.isEmpty ? ' ' : unit, size: 10, color: n500),
            ]),
          ),
        );
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Caption(title),
      const SizedBox(height: 10),
      Row(children: [
        card(Icons.trending_up, 'Daromad', fmtSum(revenue), 'so‘m'),
        const SizedBox(width: 8),
        card(Icons.tag, 'Buyurtma', '$count', ''),
        const SizedBox(width: 8),
        card(Icons.route, 'Masofa', km.toStringAsFixed(1), 'km'),
      ]),
    ]);
  }
}

class _AnnouncementCard extends StatefulWidget {
  final List<Json> items;
  const _AnnouncementCard(this.items);
  @override
  State<_AnnouncementCard> createState() => _AnnouncementCardState();
}

class _AnnouncementCardState extends State<_AnnouncementCard> {
  bool _open = false;
  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    final latest = items.isEmpty ? null : items.first;
    return Section(
      top: 28,
      bottom: 12,
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: cardBox(color: ink, border: ink),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.campaign_outlined, size: 14, color: gold),
            const SizedBox(width: 6),
            const Expanded(child: Caption('Admin xabarlari', color: gold)),
            if (latest != null) T(fmtDateTime(latest['createdAt']), size: 10, color: n400),
          ]),
          const SizedBox(height: 8),
          if (latest == null)
            const T('Hozircha yangi xabar yo‘q. Admin e’lonlari shu yerda ko‘rinadi.', color: Color(0xFFD4D4D4))
          else ...[
            T('${latest['title']}', weight: FontWeight.w700, color: Colors.white),
            const SizedBox(height: 4),
            T('${latest['text']}', color: const Color(0xFFD4D4D4), height: 1.4),
            if (items.length > 1)
              TextButton(
                style: TextButton.styleFrom(padding: EdgeInsets.zero),
                onPressed: () => setState(() => _open = !_open),
                child: T(_open ? 'Yopish' : 'Oldingi xabarlar (${items.length - 1})', size: 12, weight: FontWeight.w600, color: gold),
              ),
            if (_open)
              for (final a in items.skip(1))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    T('${a['title']}', size: 12, weight: FontWeight.w600, color: Colors.white),
                    T('${a['text']}', size: 12, color: n400),
                    T(fmtDateTime(a['createdAt']), size: 10, color: n500),
                  ]),
                ),
          ],
        ]),
      ),
    );
  }
}
