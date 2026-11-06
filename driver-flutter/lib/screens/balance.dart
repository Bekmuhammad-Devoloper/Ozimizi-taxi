import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

class BalanceScreen extends StatefulWidget {
  const BalanceScreen({super.key});
  @override
  State<BalanceScreen> createState() => _BalanceScreenState();
}

class _BalanceScreenState extends State<BalanceScreen> {
  dynamic _balance = 0;
  List<Json> _txs = [];
  List<Json> _history = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    api.get('/driver/balance').then((r) {
      if (!mounted) return;
      setState(() {
        _balance = r.data['balance'];
        _txs = ((r.data['transactions'] as List?) ?? []).map((e) => asJson(e)!).toList();
      });
    }).catchError((_) {}).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
    api.get('/driver/orders/history').then((r) {
      if (r.data is List && mounted) setState(() => _history = (r.data as List).map((e) => asJson(e)!).toList());
    }).catchError((_) {});
  }

  /// Net earnings per period from completed rides: fare (cash) − commission.
  (double, double, double) get _summary {
    final now = DateTime.now();
    final day = DateTime(now.year, now.month, now.day);
    final week = now.subtract(const Duration(days: 7));
    final month = now.subtract(const Duration(days: 30));
    double d = 0, w = 0, m = 0;
    for (final o in _history) {
      if (o['status'] != 'COMPLETED') continue;
      final at = parseTime(o['completedAt'] ?? o['createdAt']);
      if (at == null) continue;
      final net = numOf(o['price']) - numOf(o['commission']);
      if (!at.isBefore(day)) d += net;
      if (at.isAfter(week)) w += net;
      if (at.isAfter(month)) m += net;
    }
    return (d, w, m);
  }

  String _label(String t) => const {
        'COMMISSION': 'Buyurtma komissiyasi',
        'TOPUP': 'Balans to‘ldirildi',
        'WITHDRAW': 'Yechib olindi',
        'ADJUSTMENT': 'Tuzatish',
      }[t] ?? t;

  String? _detail(Json t) {
    final orderId = t['orderId']?.toString();
    if (orderId != null) {
      final ref = 'Buyurtma #${orderId.substring(0, 8).toUpperCase()}';
      if (t['type'] == 'ADJUSTMENT' && '${t['note'] ?? ''}'.startsWith('Promo')) return '$ref · promo chegirma qaytarildi';
      return ref;
    }
    return textOf(t['note']);
  }

  @override
  Widget build(BuildContext context) {
    final negative = numOf(_balance) < 0;
    final s = _summary;
    Widget period(String label, double v) => Expanded(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: cardBox(),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Caption(label),
              const SizedBox(height: 4),
              T(fmtSum(v), size: 17, weight: FontWeight.w700, maxLines: 1),
              const T('so‘m', size: 10, color: n500),
            ]),
          ),
        );
    return AppScaffold(children: [
      Hero2(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 28),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const BackLink(),
          const SizedBox(height: 10),
          const Row(children: [
            Icon(Icons.account_balance_wallet_outlined, size: 18, color: gold),
            SizedBox(width: 8),
            Caption('Joriy balans', color: gold),
          ]),
          const SizedBox(height: 10),
          T(fmtSum(_balance), size: 44, weight: FontWeight.w800, color: negative ? const Color(0xFFF87171) : Colors.white),
          const T('so‘m', color: n400),
          if (negative) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: cardBox(color: const Color(0x26EF4444), border: const Color(0x4DF87171), radius: 12),
              child: const T('Balansingiz manfiy — bu buyurtmalar komissiyasidan qolgan qarz. Iltimos, balansni to‘ldiring.', size: 12, color: Color(0xFFFECACA), height: 1.4),
            ),
          ],
        ]),
      ),
      Section(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Caption('Sof daromad (naqd − komissiya)'),
          const SizedBox(height: 8),
          Row(children: [
            period('Bugun', s.$1),
            const SizedBox(width: 8),
            period('Hafta', s.$2),
            const SizedBox(width: 8),
            period('Oy', s.$3),
          ]),
        ]),
      ),
      Section(
        top: 28,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Caption('Tranzaksiyalar'),
          const SizedBox(height: 10),
          if (_loading) const T('Yuklanmoqda…', color: n500),
          if (!_loading && _txs.isEmpty) const T('Tranzaksiyalar yo‘q', color: n500),
          for (final t in _txs) _tx(t),
        ]),
      ),
    ]);
  }

  Widget _tx(Json t) {
    final amt = numOf(t['amount']);
    final pos = amt >= 0;
    final detail = _detail(t);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: cardBox(),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CircleAvatar(
          radius: 18,
          backgroundColor: pos ? greenBg : redBg,
          child: Icon(pos ? Icons.south_west : Icons.north_east, size: 18, color: pos ? green : red),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            T(_label('${t['type']}'), weight: FontWeight.w500),
            const SizedBox(height: 2),
            T(fmtDateTime(t['createdAt']), size: 12, color: n500),
            if (detail != null) ...[
              const SizedBox(height: 4),
              T(detail, size: 12, color: n500, maxLines: 1),
            ],
          ]),
        ),
        T('${pos ? '+' : ''}${fmtSum(amt)}', weight: FontWeight.w600, color: pos ? green : red),
      ]),
    );
  }
}
