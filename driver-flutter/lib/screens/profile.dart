import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/lang.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _model = TextEditingController(text: '${auth.driver?['carModel'] ?? ''}');
  final _color = TextEditingController(text: '${auth.driver?['carColor'] ?? ''}');
  final _plate = TextEditingController(text: '${auth.driver?['carPlate'] ?? ''}');
  bool _saving = false;
  String? _saved;
  String? _err;
  List<Json> _txs = [];

  @override
  void initState() {
    super.initState();
    auth.refreshMe().then((_) {
      if (!mounted) return;
      _model.text = '${auth.driver?['carModel'] ?? ''}';
      _color.text = '${auth.driver?['carColor'] ?? ''}';
      _plate.text = '${auth.driver?['carPlate'] ?? ''}';
    });
    api.get('/driver/balance').then((r) {
      if (mounted) setState(() => _txs = ((r.data['transactions'] as List?) ?? []).map((e) => asJson(e)!).toList());
    }).catchError((_) {});
  }

  Future<void> _photo(String field) async {
    setState(() => _err = null);
    final picked = await ImagePicker().pickImage(source: ImageSource.gallery, imageQuality: 85, maxWidth: 1600);
    if (picked == null) return;
    try {
      final ext = picked.name.split('.').last.toLowerCase();
      final type = ext == 'png' ? 'png' : (ext == 'webp' ? 'webp' : 'jpeg');
      final form = FormData.fromMap({
        'file': await MultipartFile.fromFile(picked.path, filename: picked.name, contentType: DioMediaType('image', type)),
      });
      final up = await api.post('/driver/upload', data: form);
      final url = up.data['url'];
      await api.patch('/driver/profile', data: {field: url});
      auth.setDriver({field: url});
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Yuklab bo‘lmadi'));
    }
  }

  Future<void> _save() async {
    setState(() {
      _err = null;
      _saved = null;
    });
    final m = _model.text.trim(), c = _color.text.trim(), p = _plate.text.trim().toUpperCase();
    String? e;
    if (m.length < 2) {
      e = 'Mashina modeli majburiy';
    } else if (c.length < 2) {
      e = 'Rang majburiy';
    } else if (p.length < 3) {
      e = 'Davlat raqami majburiy';
    }
    if (e != null) return setState(() => _err = tr(e!));
    setState(() => _saving = true);
    try {
      final r = await api.patch('/driver/profile', data: {'carModel': m, 'carColor': c, 'carPlate': p});
      auth.setDriver({'carModel': r.data['carModel'], 'carColor': r.data['carColor'], 'carPlate': r.data['carPlate'], 'profileComplete': r.data['profileComplete'] ?? auth.driver?['profileComplete']});
      await auth.refreshMe();
      if (mounted) setState(() => _saved = 'Saqlandi');
    } catch (err) {
      if (mounted) setState(() => _err = errMsg(err, 'Xato'));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _logout() {
    deliveries.setActive(null);
    auth.logout();
    Navigator.of(context).popUntil((r) => r.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    context.watch<AuthStore>();
    final d = auth.driver;
    final isCourier = auth.isCourier;
    final name = '${d?['fullName'] ?? '?'}';
    final initials = name.split(' ').where((s) => s.isNotEmpty).map((s) => s[0]).take(2).join().toUpperCase();
    final avatar = fileUrl(d?['avatarUrl']);
    final car = fileUrl(d?['carPhotoUrl']);
    final today = DateTime.now();
    final dayStart = DateTime(today.year, today.month, today.day);
    final todayEarnings = _txs.where((t) => t['type'] == 'COMMISSION').where((t) {
      final at = parseTime(t['createdAt']);
      return at != null && !at.isBefore(dayStart);
    }).fold<double>(0, (s, t) => s + (numOf(t['amount']) > 0 ? numOf(t['amount']) : 0));

    Widget info(IconData i, String label, String value, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            Icon(i, size: 16, color: n400),
            const SizedBox(width: 12),
            Expanded(child: T(label, size: 12, color: n500)),
            T(value, weight: strong ? FontWeight.w700 : FontWeight.w500, color: strong ? goldDeep : ink),
          ]),
        );

    return AppScaffold(children: [
      Hero2(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 28),
        child: Column(children: [
          const Align(alignment: Alignment.centerLeft, child: BackLink()),
          InkWell(
            customBorder: const CircleBorder(),
            onTap: () => _photo('avatarUrl'),
            child: Stack(children: [
              CircleAvatar(
                radius: 48,
                backgroundColor: gold,
                backgroundImage: avatar != null ? NetworkImage(avatar) : null,
                child: avatar == null ? T(initials.isEmpty ? '?' : initials, size: 24, weight: FontWeight.w800) : null,
              ),
              const Positioned(
                right: 0,
                bottom: 0,
                child: CircleAvatar(radius: 14, backgroundColor: ink, child: Icon(Icons.camera_alt_outlined, size: 14, color: gold)),
              ),
            ]),
          ),
          const SizedBox(height: 14),
          T(name, size: 18, weight: FontWeight.w700, color: Colors.white),
          T('${d?['phone'] ?? ''}', color: n400),
        ]),
      ),
      Section(
        top: 24,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Caption('Ma’lumotlar'),
          const SizedBox(height: 8),
          Container(
            decoration: cardBox(),
            child: Column(children: [
              info(isCourier ? Icons.pedal_bike : Icons.directions_car_outlined, 'Turi', isCourier ? 'Kuryer' : 'Taksi'),
              const Divider(height: 1, color: line),
              info(Icons.trending_up, 'Bugungi daromad', money(todayEarnings), strong: true),
              const Divider(height: 1, color: line),
              InkWell(
                onTap: () => Navigator.pushNamed(context, '/balance'),
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  child: Row(children: [
                    const Icon(Icons.credit_card, size: 16, color: n400),
                    const SizedBox(width: 12),
                    const Expanded(child: T('Balans', size: 12, color: n500)),
                    T(money(d?['balance']), weight: FontWeight.w500),
                    const Icon(Icons.chevron_right, size: 14, color: n400),
                  ]),
                ),
              ),
              const Divider(height: 1, color: line),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(children: [
                  const Icon(Icons.restaurant_menu, size: 16, color: n400),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      T('Ish turi', weight: FontWeight.w500),
                      T('Administrator belgilaydi', size: 11, color: n500),
                    ]),
                  ),
                  T(isCourier ? 'Kuryer' : (d?['acceptDelivery'] == true ? 'Taksi + kuryer' : 'Taksi'), weight: FontWeight.w600),
                ]),
              ),
            ]),
          ),
          if (isCourier && _err != null) ...[const SizedBox(height: 8), T(_err!, color: red)],
        ]),
      ),
      if (!isCourier)
        Section(
          top: 24,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Caption('Mashina ma’lumotlari'),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: cardBox(),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                InkWell(
                  onTap: () => _photo('carPhotoUrl'),
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: Container(
                      clipBehavior: Clip.antiAlias,
                      decoration: cardBox(radius: 12),
                      child: car != null
                          ? Image.network(car, fit: BoxFit.cover)
                          : const Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                              Icon(Icons.directions_car_outlined, size: 28, color: n400),
                              SizedBox(height: 4),
                              T('Mashina rasmini yuklash', size: 12, color: n400),
                            ]),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                _input('Model (rusmi) *', _model, 'Chevrolet Cobalt'),
                _input('Rangi *', _color, 'Oq'),
                _input('Davlat raqami *', _plate, '01 A123BC'),
                if (_err != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: T(_err!, color: red)),
                if (_saved != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: T(_saved!, color: green)),
                PrimaryButton(_saving ? 'Saqlanmoqda…' : 'Saqlash', icon: Icons.save_outlined, dark: true, busy: _saving, height: 48, fontSize: 14, onTap: _save),
              ]),
            ),
          ]),
        ),
      Section(
        top: 24,
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Caption('Xavfsizlik'),
          const SizedBox(height: 8),
          InkWell(
            onTap: () => Navigator.pushNamed(context, '/forgot'),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: cardBox(),
              child: const Row(children: [
                Icon(Icons.shield_outlined, size: 16, color: n400),
                SizedBox(width: 12),
                Expanded(child: T('Parolni o‘zgartirish', weight: FontWeight.w500)),
                Icon(Icons.chevron_right, size: 16, color: n400),
              ]),
            ),
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: () => Navigator.pushNamed(context, '/permissions'),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: cardBox(),
              child: const Row(children: [
                Icon(Icons.verified_user_outlined, size: 16, color: n400),
                SizedBox(width: 12),
                Expanded(child: T('Ilova ruxsatlari (signal uchun)', weight: FontWeight.w500)),
                Icon(Icons.chevron_right, size: 16, color: n400),
              ]),
            ),
          ),
        ]),
      ),
      Section(
        top: 24,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: cardBox(color: const Color(0x1A3B9BFF), border: const Color(0x4D3B9BFF)),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Icon(Icons.info_outline, size: 18, color: goldDeep),
            const SizedBox(width: 12),
            Expanded(
              child: T(
                isCourier
                    ? 'Profil rasmi yuklangandagina ONLINE rejimga o‘tib, yetkazish buyurtmalarini qabul qila olasiz.'
                    : 'Mashina ma’lumotlari va rasm to‘liq bo‘lgandagina ONLINE rejimga o‘tib, buyurtma qabul qila olasiz.',
                size: 12,
                color: goldDeep,
                height: 1.4,
              ),
            ),
          ]),
        ),
      ),
      Section(
        top: 24,
        child: Column(children: [
          const Row(children: [
            Expanded(child: T('Til', weight: FontWeight.w500)),
            LangToggle(),
          ]),
          const SizedBox(height: 12),
          OutlineBtn('Chiqish', icon: Icons.logout, danger: true, onTap: _logout),
        ]),
      ),
    ]);
  }

  Widget _input(String label, TextEditingController c, String hint) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Caption(label),
          const SizedBox(height: 6),
          TextField(controller: c, decoration: InputDecoration(hintText: hint)),
        ]),
      );
}
