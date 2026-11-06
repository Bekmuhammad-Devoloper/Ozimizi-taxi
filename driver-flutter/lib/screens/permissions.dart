import 'package:flutter/material.dart';

import '../core/native.dart' as native;
import '../ui/kit.dart';
import 'auth.dart';

class _Step {
  final String kind;
  final IconData icon;
  final String title;
  final String why;
  const _Step(this.kind, this.icon, this.title, this.why);
}

const _steps = [
  _Step('location', Icons.location_on_outlined, 'Joylashuv (lokatsiya)', 'Eng yaqin buyurtmalar sizga kelishi va masofa to‘g‘ri hisoblanishi uchun'),
  _Step('backgroundLocation', Icons.navigation_outlined, 'Fonda joylashuv — “Har doim ruxsat”', 'Ilova yopiq yoki ekran o‘chiq bo‘lsa ham safar hisoblanib turadi'),
  _Step('notifications', Icons.notifications_none, 'Bildirishnomalar', 'Yangi buyurtma kelganda baland signal va xabar chiqishi uchun'),
  _Step('battery', Icons.battery_charging_full, 'Batareya cheklovini o‘chirish', 'Telefon ilovani uxlatib qo‘ymasligi — buyurtmalar uzilmay kelishi uchun'),
  _Step('overlay', Icons.layers_outlined, 'Boshqa ilovalar ustida ko‘rsatish', 'Boshqa ilovada yoki bosh ekranda bo‘lsangiz ham buyurtma ekranga chiqadi'),
  _Step('fullScreen', Icons.lock_outline, 'Qulflangan ekranda ko‘rsatish', 'Telefon qulflangan bo‘lsa ham buyurtma ekranda ochiladi'),
  _Step('autostart', Icons.power_settings_new, 'Avtozapusk', 'Ochilgan oynada Moviy Taxi’ni yoqing — telefon ilovani o‘chirib qo‘ymasligi uchun'),
];

bool _seenThisStart = false;

List<String> _missing(Map<String, bool?> st) => [for (final s in _steps) if (st[s.kind] == false) s.kind];

/// Is the permissions screen needed? Once per app start.
Future<bool> needsPermissionScreen() async {
  if (_seenThisStart) return false;
  return _missing(await native.permissionState()).isNotEmpty;
}

/// First thing in the app: asks, one by one, for everything needed to receive
/// orders. Returning from Android settings re-checks. "Davom etish" opens once
/// every permission was granted or asked.
class PermissionScreen extends StatefulWidget {
  final VoidCallback onDone;
  const PermissionScreen({super.key, required this.onDone});
  @override
  State<PermissionScreen> createState() => _PermissionScreenState();
}

class _PermissionScreenState extends State<PermissionScreen> with WidgetsBindingObserver {
  Map<String, bool?>? _st;
  final Set<String> _asked = {};
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _refresh();
  }

  Future<void> _refresh() async {
    final st = await native.permissionState();
    if (mounted) setState(() => _st = st);
  }

  Future<void> _ask(String kind) async {
    setState(() => _busy = true);
    final st = await native.askPermission(kind);
    if (!mounted) return;
    setState(() {
      _st = st;
      _asked.add(kind);
      _busy = false;
    });
  }

  void _finish() {
    _seenThisStart = true;
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final st = _st;
    final todo = st == null ? <String>[] : _missing(st);
    final next = todo.where((k) => !_asked.contains(k)).firstOrNull;
    final canContinue = st != null && st['location'] != false && todo.every(_asked.contains);
    return AuthShell(
      subtitle: 'Ishni boshlashdan oldin ruxsatlar',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const T('Buyurtmalar o‘z vaqtida kelishi uchun ilovaga quyidagi ruxsatlarni bering. Har birini bosing va telefon so‘raganda “Ruxsat berish”ni tanlang.', color: n600, height: 1.4),
        const SizedBox(height: 16),
        for (final s in _steps)
          if (st == null || st[s.kind] != null) _row(s, st),
        if (todo.any(_asked.contains))
          TextButton.icon(
            onPressed: native.openAppSettings,
            icon: const Icon(Icons.settings, size: 15, color: n600),
            label: const T('Telefon sozlamalarini ochish', color: n600, weight: FontWeight.w600),
          ),
        const SizedBox(height: 24),
        if (next != null && !canContinue)
          PrimaryButton('Ruxsat berish', busy: _busy || st == null, onTap: () => _ask(next))
        else
          PrimaryButton('Davom etish', onTap: canContinue ? _finish : null),
        if (st?['location'] == false && _asked.contains('location'))
          const Padding(
            padding: EdgeInsets.only(top: 10),
            child: T('Joylashuvsiz buyurtma olib bo‘lmaydi — sozlamalardan joylashuvga ruxsat bering.', size: 12, color: red, align: TextAlign.center),
          ),
      ]),
    );
  }

  Widget _row(_Step s, Map<String, bool?>? st) {
    final ok = st?[s.kind] == true;
    final wasAsked = _asked.contains(s.kind);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: _busy || ok ? null : () => _ask(s.kind),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: cardBox(color: ok ? greenBg : Colors.white, border: ok ? greenLine : line),
          child: Row(children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: ok ? const Color(0xFF10B981) : const Color(0x263B9BFF), borderRadius: BorderRadius.circular(12)),
              child: Icon(ok ? Icons.check : s.icon, size: 20, color: ok ? Colors.white : goldDeep),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                T(s.title, weight: FontWeight.w700),
                const SizedBox(height: 2),
                T(ok ? 'Ruxsat berilgan' : (wasAsked ? 'Berilmadi — qayta bosing yoki sozlamalardan yoqing' : s.why), size: 12, color: n500, height: 1.3),
              ]),
            ),
          ]),
        ),
      ),
    );
  }
}
