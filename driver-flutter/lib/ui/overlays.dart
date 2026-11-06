import 'dart:async';

import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api.dart';
import '../core/native.dart' as native;
import '../core/store.dart';
import '../core/util.dart';
import '../main.dart' show goTo;
import 'kit.dart';
import 'widgets.dart';

/// Above every screen: the ringing offer, bonus requests, the contract, updates.
class AppOverlays extends StatelessWidget {
  final Widget child;
  const AppOverlays({super.key, required this.child});
  @override
  Widget build(BuildContext context) {
    final incoming = context.select<OrderStore, Json?>((s) => s.incoming);
    final bonus = context.select<OrderStore, Json?>((s) => s.bonusRequest);
    final driver = context.select<AuthStore, Json?>((s) => s.driver);
    final token = context.select<AuthStore, String?>((s) => s.token);
    final update = context.select<Bus, Json?>((b) => b.updatePrompt);
    return Stack(children: [
      child,
      if (token != null) const _UpdateBanner(),
      if (update != null) _UpdateDialog(update),
      if (bonus != null) _BonusDialog(bonus, key: ValueKey(bonus['id'])),
      if (token != null && driver != null && driver['contractAcceptedAt'] == null && driver['id'] != null) const _ContractGate(),
      if (incoming != null) _IncomingOffer(incoming, key: ValueKey('${incoming['orderId']}-${incoming['receivedAt']}')),
    ]);
  }
}

// ---- the ringing offer -------------------------------------------------------

class _IncomingOffer extends StatefulWidget {
  final Json o;
  const _IncomingOffer(this.o, {super.key});
  @override
  State<_IncomingOffer> createState() => _IncomingOfferState();
}

class _IncomingOfferState extends State<_IncomingOffer> {
  Timer? _t;
  bool _busy = false;

  int get _total => numOf(widget.o['offerSeconds'], 15).round();
  int get _left {
    final passed = (DateTime.now().millisecondsSinceEpoch - numOf(widget.o['receivedAt'])) / 1000;
    final l = (_total - passed).ceil();
    return l < 0 ? 0 : l;
  }

  String get _id => widget.o['orderId'].toString();

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(milliseconds: 500), (_) {
      if (!mounted) return;
      if (_left == 0) {
        // Time is up: a personal offer moves on to the next driver on the server.
        native.stopAlarm(_id);
        orders.setIncoming(null);
        return;
      }
      setState(() {});
    });
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  void _decline() {
    native.stopAlarm(_id);
    // Passes a personal offer on at once; in the middle it stops the re-rings for me.
    api.post('/driver/orders/$_id/decline').then((_) {}, onError: (_) {});
    orders.setIncoming(null);
  }

  Future<void> _accept() async {
    if (_busy) return;
    native.stopAlarm(_id);
    setState(() => _busy = true);
    final delivery = widget.o['kind'] == 'delivery';
    try {
      if (delivery) {
        await deliveries.accept(_id);
      } else {
        final r = await api.post('/driver/orders/$_id/accept');
        orders.resetDistance();
        orders.setActive({'id': r.data['id'], ...orderFields(r.data)});
      }
      orders.setIncoming(null);
      goTo(delivery ? '/delivery/active' : '/order/active');
    } catch (e) {
      final m = errMsg(e, 'Qabul qilib bo‘lmadi');
      orders.setIncoming(null);
      final ctx = context;
      if (ctx.mounted) ScaffoldMessenger.maybeOf(ctx)?.showSnackBar(SnackBar(content: Text(m)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final o = widget.o;
    final delivery = o['kind'] == 'delivery';
    final all = o['mode'] == 'all';
    final pickup = asJson(o['pickup']);
    final dest = asJson(o['destination']);
    final pLat = numOrNull(pickup?['lat']);
    final pLng = numOrNull(pickup?['lng']);
    final left = _left;
    final prep = o['readyAt'] != null ? 'Tayyor ✅' : (o['prepMinutes'] != null ? '~${o['prepMinutes']} daqiqa' : 'Tayyorlanmoqda');
    return Material(
      color: Colors.black45,
      child: SafeArea(
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.92),
            decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, mainAxisSize: MainAxisSize.min, children: [
                Row(children: [
                  Expanded(child: T(delivery ? '🍽 Yetkazish${o['number'] != null ? ' #${o['number']}' : ''}' : 'Yangi buyurtma', size: 18, weight: FontWeight.w700)),
                  Container(
                    width: 48,
                    height: 48,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: left <= 5 ? red : gold, shape: BoxShape.circle),
                    child: T('$left', size: 18, weight: FontWeight.w800, color: left <= 5 ? Colors.white : ink),
                  ),
                ]),
                const SizedBox(height: 6),
                Caption(
                  all ? 'Hammaga yuborildi — birinchi qabul qilgan oladi' : (delivery ? 'Faqat sizga taklif — eng yaqin kuryersiz' : 'Faqat sizga taklif — eng yaqin haydovchisiz'),
                  color: all ? red : const Color(0xFF047857),
                ),
                const SizedBox(height: 14),
                if (delivery) ...[
                  KV('Oshxona', textOf(pickup?['address']) ?? textOf(o['kitchenName']) ?? 'Manzil aniqlanmagan'),
                  KV('Oshxonagacha', '${numOf(o['distanceFromDriver']).toStringAsFixed(1)} km', bold: true),
                  if (dest != null) KV('Qayerga', '${textOf(dest['address']) ?? '${numOf(dest['lat']).toStringAsFixed(4)}, ${numOf(dest['lng']).toStringAsFixed(4)}'}${o['estimatedKm'] != null ? '\noshxonadan ≈ ${o['estimatedKm']} km' : ''}'),
                  if (o['itemsCount'] != null) KV('Taomlar', '${o['itemsCount']} ta', bold: true),
                  KV('Tayyorlash', prep, bold: true),
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: cardBox(color: ink, border: ink, radius: 12),
                    child: Column(children: [
                      if (o['total'] != null)
                        Row(children: [
                          const Expanded(child: T('Mijozdan olinadi', size: 12, color: n400)),
                          T('${money(o['total'])} (naqd)', size: 16, weight: FontWeight.w800, color: Colors.white),
                        ]),
                      if (o['estimatedPrice'] != null) ...[
                        const SizedBox(height: 6),
                        Row(children: [
                          const Expanded(child: T('Sizning haqingiz', size: 12, color: n400)),
                          T(money(o['estimatedPrice']), size: 16, weight: FontWeight.w800, color: gold),
                        ]),
                      ],
                    ]),
                  ),
                ] else ...[
                  KV('Olib ketish', textOf(pickup?['address']) ?? 'Manzil aniqlanmagan'),
                  if (dest != null) KV('Qayerga', textOf(dest['address']) ?? '${numOf(dest['lat']).toStringAsFixed(4)}, ${numOf(dest['lng']).toStringAsFixed(4)}'),
                  KV('Sizgacha masofa', '${numOf(o['distanceFromDriver']).toStringAsFixed(1)} km', bold: true),
                  if (o['estimatedPrice'] != null) KV('Taxminiy safar', '≈ ${o['estimatedKm']} km · ${money(o['estimatedPrice'])}', bold: true),
                ],
                if (pLat != null && pLng != null) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: MiniMap(lat: pLat, lng: pLng, aspect: delivery ? 2 : 16 / 9),
                  ),
                ],
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(flex: 4, child: OutlineBtn('Rad etish', height: 56, onTap: _decline)),
                  const SizedBox(width: 12),
                  Expanded(flex: 6, child: PrimaryButton('Qabul qilish', dark: true, busy: _busy, onTap: _accept)),
                ]),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

// ---- bonus request -----------------------------------------------------------

class _BonusDialog extends StatefulWidget {
  final Json r;
  const _BonusDialog(this.r, {super.key});
  @override
  State<_BonusDialog> createState() => _BonusDialogState();
}

class _BonusDialogState extends State<_BonusDialog> {
  bool _busy = false;
  String? _err;

  Future<void> _decide(bool approve) async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _err = null;
    });
    final r = widget.r;
    try {
      await api.post('/driver/bonus/${r['id']}/${approve ? 'approve' : 'reject'}');
      final a = orders.active;
      if (approve && a?['id'] == r['orderId']) {
        orders.patchActive(a!['id'].toString(), {'bonusUsed': '${numOf(a['bonusUsed']) + numOf(r['amount'])}'});
      }
      orders.setBonusRequest(null);
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Xato, qayta urinib ko‘ring'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = widget.r;
    return Material(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Row(children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(color: const Color(0x263B9BFF), borderRadius: BorderRadius.circular(16)),
                child: const Icon(Icons.savings_outlined, color: goldDeep),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Caption('Bonusdan to‘lov'),
                  T('${r['clientName'] ?? ''}', weight: FontWeight.w700),
                ]),
              ),
            ]),
            const SizedBox(height: 14),
            T('Mijoz safar uchun ${money(r['amount'])}ni bonus balansidan to‘lamoqchi. Tasdiqlasangiz, bu summa sizning balansingizga tushadi.', color: n600, height: 1.4),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: cardBox(color: const Color(0xFFFAFAFA)),
              child: Column(children: [
                KV('Safar narxi', money(r['price'])),
                KV('Bonusdan (balansga)', '+${money(r['amount'])}'),
                KV('Naqd olasiz', money(r['cashAfter']), bold: true),
              ]),
            ),
            if (_err != null) ...[const SizedBox(height: 10), T(_err!, color: red)],
            const SizedBox(height: 16),
            Row(children: [
              Expanded(child: OutlineBtn('Yo‘q', icon: Icons.close, danger: true, onTap: _busy ? null : () => _decide(false))),
              const SizedBox(width: 8),
              Expanded(
                child: SizedBox(
                  height: 48,
                  child: FilledButton.icon(
                    style: FilledButton.styleFrom(backgroundColor: const Color(0xFF16A34A), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
                    onPressed: _busy ? null : () => _decide(true),
                    icon: const Icon(Icons.check, size: 18),
                    label: const T('Ha, tasdiqlayman', size: 12, weight: FontWeight.w700, color: Colors.white),
                  ),
                ),
              ),
            ]),
          ]),
        ),
      ),
    );
  }
}

// ---- contract ----------------------------------------------------------------

/// Blocks the app until the driver has accepted the agreement once.
class _ContractGate extends StatefulWidget {
  const _ContractGate();
  @override
  State<_ContractGate> createState() => _ContractGateState();
}

class _ContractGateState extends State<_ContractGate> {
  bool _checked = false;
  bool _busy = false;
  String? _err;

  Future<void> _accept() async {
    setState(() {
      _busy = true;
      _err = null;
    });
    try {
      final r = await api.post('/driver/contract/accept');
      auth.setDriver({'contractAcceptedAt': r.data['contractAcceptedAt']});
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Saqlab bo‘lmadi, qayta urinib ko‘ring'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Hero2(
          padding: EdgeInsets.fromLTRB(24, 28, 24, 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(Icons.description_outlined, size: 28, color: gold),
            SizedBox(height: 10),
            T('Haydovchi shartnomasi', size: 20, weight: FontWeight.w800, color: Colors.white),
            SizedBox(height: 4),
            T('Ishni boshlashdan oldin shartnoma shartlarini o‘qib, rozilik bildiring.', color: Color(0xFFD4D4D4)),
          ]),
        ),
        const Expanded(child: SingleChildScrollView(padding: EdgeInsets.all(24), child: ContractText())),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 24, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Checkbox(value: _checked, activeColor: gold, onChanged: (v) => setState(() => _checked = v == true)),
                const Expanded(child: T('Shartnoma shartlari bilan tanishdim va ularga roziman', weight: FontWeight.w600)),
              ]),
              if (_err != null) T(_err!, color: red),
              const SizedBox(height: 8),
              PrimaryButton(_busy ? 'Saqlanmoqda…' : '✅ Tasdiqlayman', dark: true, busy: _busy, onTap: _checked ? _accept : null),
            ]),
          ),
        ),
      ]),
    );
  }
}

// ---- app update --------------------------------------------------------------

const _apkPath = '/downloads/moviytaxi-driver-flutter.apk';

Future<void> _openApk() => launchUrl(Uri.parse('$siteUrl$_apkPath'), mode: LaunchMode.externalApplication);

int _cmp(String a, String b) {
  List<int> p(String v) => RegExp(r'\d+').allMatches(v).map((m) => int.parse(m.group(0)!)).toList();
  final x = p(a), y = p(b);
  for (var i = 0; i < (x.length > y.length ? x.length : y.length); i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/// A newer APK on the server: a banner that downloads it (hidden for 24 h when closed).
class _UpdateBanner extends StatefulWidget {
  const _UpdateBanner();
  @override
  State<_UpdateBanner> createState() => _UpdateBannerState();
}

class _UpdateBannerState extends State<_UpdateBanner> {
  String? _installed;
  String? _latest;
  bool _closed = false;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    try {
      final info = await PackageInfo.fromPlatform();
      final r = await api.get('$siteUrl/downloads/version-flutter.json');
      if (mounted) {
        setState(() {
          _installed = info.version;
          _latest = r.data?['version']?.toString();
        });
      }
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    if (_closed || _installed == null || _latest == null || _cmp(_installed!, _latest!) >= 0) {
      return const SizedBox.shrink();
    }
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: Material(
        color: goldDark,
        child: SafeArea(
          bottom: false,
          child: Row(children: [
            Expanded(
              child: InkWell(
                onTap: _openApk,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    T('Yangi versiya $_latest — yangilash', weight: FontWeight.w700, color: Colors.white),
                    T('Sizda: $_installed · bosing, yuklab olinadi', size: 11, color: Colors.white70),
                  ]),
                ),
              ),
            ),
            IconButton(onPressed: () => setState(() => _closed = true), icon: const Icon(Icons.close, size: 16, color: Colors.white)),
          ]),
        ),
      ),
    );
  }
}

/// Admin's "please update" broadcast.
class _UpdateDialog extends StatelessWidget {
  final Json a;
  const _UpdateDialog(this.a);
  @override
  Widget build(BuildContext context) => Material(
        color: Colors.black38,
        child: Align(
          alignment: Alignment.bottomCenter,
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: const BoxDecoration(color: Colors.white, borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
            child: SafeArea(
              top: false,
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                T(textOf(a['title']) ?? 'Ilovaning yangi versiyasi', size: 18, weight: FontWeight.w700),
                const SizedBox(height: 6),
                T(textOf(a['text']) ?? 'Ilovani yangilang — yangi imkoniyatlar va tuzatishlar qo‘shildi.', color: n600),
                const SizedBox(height: 18),
                PrimaryButton('Yangilash', icon: Icons.download, onTap: () {
                  bus.showUpdate(null);
                  _openApk();
                }),
                const SizedBox(height: 8),
                OutlineBtn('Keyinroq', height: 44, onTap: () => bus.showUpdate(null)),
              ]),
            ),
          ),
        ),
      );
}
