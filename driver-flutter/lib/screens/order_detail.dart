import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

/// One finished (or running) order from the history.
class OrderDetailScreen extends StatefulWidget {
  final String id;
  const OrderDetailScreen({super.key, required this.id});
  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  Json? _o;
  bool _loading = true;
  String? _err;

  @override
  void initState() {
    super.initState();
    api.get('/driver/orders/${widget.id}').then((r) {
      if (mounted) setState(() => _o = asJson(r.data));
    }).catchError((e) {
      if (mounted) setState(() => _err = errMsg(e, 'Buyurtma topilmadi'));
    }).whenComplete(() {
      if (mounted) setState(() => _loading = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: T('Yuklanmoqda…', color: n500)));
    final o = _o;
    if (o == null) {
      return Scaffold(
        body: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            T(_err ?? 'Buyurtma topilmadi', color: n500),
            const SizedBox(height: 20),
            SizedBox(width: 140, child: OutlineBtn('Orqaga', height: 44, onTap: () => Navigator.pop(context))),
          ]),
        ),
      );
    }
    final status = o['status'].toString();
    final isActive = const ['ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'].contains(status);
    final client = asJson(o['client']);
    final lat = numOrNull(o['pickupLat']);
    final lng = numOrNull(o['pickupLng']);
    final net = numOf(o['price']) - numOf(o['commission']);
    Widget time(String label, dynamic v) => v == null ? const SizedBox.shrink() : KV(label, fmtDateTime(v));
    return AppScaffold(children: [
      Hero2(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const BackLink(),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: Caption('Buyurtma · ${o['id'].toString().substring(0, 8).toUpperCase()}', color: n400)),
            StatusBadge(status),
          ]),
          const SizedBox(height: 10),
          Row(crossAxisAlignment: CrossAxisAlignment.baseline, textBaseline: TextBaseline.alphabetic, children: [
            T(o['price'] != null ? fmtSum(o['price']) : '—', size: 30, weight: FontWeight.w800, color: Colors.white),
            const SizedBox(width: 8),
            const T('so‘m', color: n400),
          ]),
        ]),
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
                    const Caption('Olib ketish'),
                    const SizedBox(height: 2),
                    T(textOf(o['pickupAddress']) ?? 'Manzil aniqlanmagan'),
                  ]),
                ),
              ]),
            ),
            if (lat != null && lng != null) MiniMap(lat: lat, lng: lng),
          ]),
        ),
      ),
      if (client != null)
        Section(
          child: Container(
            padding: const EdgeInsets.all(14),
            decoration: cardBox(),
            child: Row(children: [
              CircleAvatar(
                radius: 24,
                backgroundColor: const Color(0x263B9BFF),
                child: T('${client['firstName'] ?? 'K'}'.substring(0, 1).toUpperCase(), weight: FontWeight.w700, color: goldDeep),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  T('${client['firstName'] ?? ''}', weight: FontWeight.w700, maxLines: 1),
                  T('${client['phonePrimary'] ?? ''}', size: 12, color: n500),
                ]),
              ),
              PhoneButton(client['phonePrimary']?.toString()),
            ]),
          ),
        ),
      Section(
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: cardBox(),
          child: Column(children: [
            time('Yaratildi', o['createdAt']),
            time('Qabul qilindi', o['acceptedAt']),
            time('Yakunlandi', o['completedAt']),
            time('Bekor qilindi', o['cancelledAt']),
          ]),
        ),
      ),
      if (status == 'COMPLETED')
        Section(
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: cardBox(border: gold, width: 2),
            child: Column(children: [
              KV('Masofa', '${o['distanceKm'] ?? '-'} km'),
              KV('Narx', money(o['price'])),
              if (numOf(o['outsideFee']) > 0) KV('Hududdan tashqari (${numOf(o['outsideKm']).toStringAsFixed(1)} km)', money(o['outsideFee'])),
              if (numOf(o['discount']) > 0) KV('Promo chegirma (balansga qaytarildi)', '-${money(o['discount'])}'),
              if (numOf(o['bonusUsed']) > 0) KV('Mijoz bonusidan (balansga tushdi)', '+${money(o['bonusUsed'])}'),
              KV('Komissiya', '-${money(o['commission'])}'),
              const Divider(color: line),
              KV('Sof daromad', '+${money(net)}', bold: true),
            ]),
          ),
        ),
      if (isActive)
        Section(child: PrimaryButton('Faol buyurtmaga o‘tish', height: 48, fontSize: 14, onTap: () => Navigator.pushNamed(context, '/order/active'))),
    ]);
  }
}
