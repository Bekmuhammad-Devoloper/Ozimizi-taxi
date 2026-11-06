import 'dart:async';

import 'package:flutter/material.dart';

import '../core/api.dart';
import '../core/lang.dart';
import '../core/store.dart';
import '../core/util.dart';
import '../ui/kit.dart';
import '../ui/widgets.dart';

/// Mobile auth layout: dark brand header + the form.
class AuthShell extends StatelessWidget {
  final String subtitle;
  final Widget child;
  const AuthShell({super.key, required this.subtitle, required this.child});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SingleChildScrollView(
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Hero2(
            padding: const EdgeInsets.fromLTRB(24, 32, 24, 28),
            child: Column(children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(20),
                child: Image.asset('assets/logo.jpg', width: 84, height: 84, fit: BoxFit.cover),
              ),
              const SizedBox(height: 12),
              const T('MOVIY TAXI', size: 17, weight: FontWeight.w800, color: gold, spacing: 3),
              const SizedBox(height: 4),
              T(subtitle, color: const Color(0xFFE5E5E5)),
            ]),
          ),
          const SizedBox(height: 18),
          const Center(child: LangToggle()),
          const SizedBox(height: 18),
          Padding(padding: const EdgeInsets.fromLTRB(24, 0, 24, 28), child: child),
        ]),
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final IconData icon;
  final String label;
  final Widget child;
  const _Field(this.icon, this.label, this.child);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Icon(icon, size: 18, color: n400),
            const SizedBox(width: 8),
            T(tr(label).toUpperCase(), size: 12, weight: FontWeight.w600, color: n500),
          ]),
          const SizedBox(height: 8),
          child,
        ]),
      );
}

class _PhoneInput extends StatelessWidget {
  final TextEditingController c;
  const _PhoneInput(this.c);
  @override
  Widget build(BuildContext context) => TextField(
        controller: c,
        keyboardType: TextInputType.phone,
        decoration: const InputDecoration(hintText: '+998 90 123 45 67'),
        onChanged: (v) {
          final m = maskPhone(v);
          if (m != v) c.value = TextEditingValue(text: m, selection: TextSelection.collapsed(offset: m.length));
        },
      );
}

class _PasswordInput extends StatefulWidget {
  final TextEditingController c;
  const _PasswordInput(this.c);
  @override
  State<_PasswordInput> createState() => _PasswordInputState();
}

class _PasswordInputState extends State<_PasswordInput> {
  bool _show = false;
  @override
  Widget build(BuildContext context) => TextField(
        controller: widget.c,
        obscureText: !_show,
        decoration: InputDecoration(
          suffixIcon: IconButton(
            icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18, color: n500),
            onPressed: () => setState(() => _show = !_show),
          ),
        ),
      );
}

String _clean(String phone) => phone.replaceAll(RegExp(r'\s'), '');

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController(text: '+998 ');
  final _pass = TextEditingController();
  String? _err;
  bool _loading = false;

  Future<void> _submit() async {
    final p = _clean(_phone.text);
    if (p.length < 13) return setState(() => _err = tr('Telefon raqam to‘liq emas'));
    if (_pass.text.length < 6) return setState(() => _err = tr('Parol kamida 6 belgi'));
    setState(() {
      _err = null;
      _loading = true;
    });
    try {
      final r = await api.post('/auth/driver/login', data: {'phone': p, 'password': _pass.text});
      auth.setAuth(r.data['access_token'], asJson(r.data['driver'])!);
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Kirib bo‘lmadi'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AuthShell(
        subtitle: 'Haydovchi hisobiga kiring',
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Field(Icons.phone_outlined, 'Telefon raqam', _PhoneInput(_phone)),
          _Field(Icons.lock_outline, 'Parol', _PasswordInput(_pass)),
          ErrorBox(_err),
          const SizedBox(height: 24),
          PrimaryButton('Kirish', dark: true, busy: _loading, onTap: _submit),
          const SizedBox(height: 14),
          TextButton(onPressed: () => Navigator.pushNamed(context, '/forgot'), child: const T('Parolni unutdingizmi?', color: n500)),
          TextButton(
            onPressed: () => Navigator.pushNamed(context, '/register'),
            child: const T('Yangi hisob — Ro‘yxatdan o‘tish', weight: FontWeight.w600),
          ),
        ]),
      );
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController(text: '+998 ');
  final _pass = TextEditingController();
  final _confirm = TextEditingController();
  bool _agree = false;
  bool _loading = false;
  String? _err;

  Future<void> _submit() async {
    final p = _clean(_phone.text);
    String? e;
    if (_name.text.trim().length < 2) {
      e = 'Ismni to‘liq kiriting';
    } else if (p.length < 13) {
      e = 'Telefon raqam to‘liq emas';
    } else if (_pass.text.length < 6) {
      e = 'Parol kamida 6 belgi';
    } else if (_pass.text != _confirm.text) {
      e = 'Parollar mos kelmadi';
    } else if (!_agree) {
      e = 'Shartnoma shartlariga rozilik bildiring';
    }
    if (e != null) return setState(() => _err = tr(e!));
    setState(() {
      _err = null;
      _loading = true;
    });
    try {
      final r = await api.post('/auth/driver/register', data: {
        'fullName': _name.text.trim(),
        'phone': p,
        'password': _pass.text,
        'contractAccepted': true,
      });
      auth.setAuth(r.data['access_token'], asJson(r.data['driver'])!);
      if (mounted) Navigator.of(context).popUntil((x) => x.isFirst);
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Ro‘yxatdan o‘tib bo‘lmadi'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AuthShell(
        subtitle: 'Yangi haydovchi hisobi',
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          _Field(Icons.person_outline, 'Ism familiya', TextField(controller: _name, textCapitalization: TextCapitalization.words)),
          _Field(Icons.phone_outlined, 'Telefon raqam', _PhoneInput(_phone)),
          _Field(Icons.lock_outline, 'Parol (kamida 6 belgi)', _PasswordInput(_pass)),
          _Field(Icons.lock_outline, 'Parolni qaytaring', _PasswordInput(_confirm)),
          Container(
            padding: const EdgeInsets.all(8),
            decoration: cardBox(color: const Color(0xFFFAFAFA), radius: 12),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Checkbox(value: _agree, activeColor: gold, onChanged: (v) => setState(() => _agree = v == true)),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const SizedBox(height: 6),
                  const T('Haydovchi shartnomasi shartlari bilan tanishdim va roziman.'),
                  TextButton(
                    style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 30)),
                    onPressed: () => showContractSheet(context),
                    child: const T('Shartnomani o‘qish', color: Color(0xFF1D4ED8), weight: FontWeight.w600),
                  ),
                ]),
              ),
            ]),
          ),
          ErrorBox(_err),
          const SizedBox(height: 24),
          PrimaryButton('Ro‘yxatdan o‘tish', dark: true, busy: _loading, onTap: _agree ? _submit : null),
          const SizedBox(height: 10),
          TextButton(onPressed: () => Navigator.pop(context), child: const T('← Hisobingiz bormi? Kirish', color: n500)),
        ]),
      );
}

class ForgotScreen extends StatefulWidget {
  const ForgotScreen({super.key});
  @override
  State<ForgotScreen> createState() => _ForgotScreenState();
}

class _ForgotScreenState extends State<ForgotScreen> {
  final _phone = TextEditingController(text: '+998 ');
  bool _loading = false;
  String? _err;

  Future<void> _submit() async {
    final p = _clean(_phone.text);
    if (p.length < 13) return setState(() => _err = tr('Telefon raqam to‘liq emas'));
    setState(() {
      _err = null;
      _loading = true;
    });
    try {
      await api.post('/auth/driver/forgot', data: {'phone': p});
      if (mounted) Navigator.pushNamed(context, '/reset', arguments: p);
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Xato'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AuthShell(
        subtitle: 'Parolni tiklash',
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const T('Telefon raqamingizni kiriting. Sizga 6 raqamli tasdiqlash kodi yuboriladi.', color: n600),
          const SizedBox(height: 20),
          _Field(Icons.phone_outlined, 'Telefon raqam', _PhoneInput(_phone)),
          ErrorBox(_err),
          const SizedBox(height: 24),
          PrimaryButton('Kod yuborish', dark: true, busy: _loading, onTap: _submit),
          const SizedBox(height: 10),
          TextButton(onPressed: () => Navigator.pop(context), child: const T('← Login sahifaga qaytish', color: n500)),
        ]),
      );
}

class ResetScreen extends StatefulWidget {
  final String? phone;
  const ResetScreen({super.key, this.phone});
  @override
  State<ResetScreen> createState() => _ResetScreenState();
}

class _ResetScreenState extends State<ResetScreen> {
  late final _phone = TextEditingController(text: widget.phone != null ? maskPhone(widget.phone!) : '+998 ');
  final _code = TextEditingController();
  final _pass = TextEditingController();
  bool _loading = false;
  bool _done = false;
  String? _err;

  Future<void> _submit() async {
    final p = _clean(_phone.text);
    String? e;
    if (p.length < 13) {
      e = 'Telefon raqam to‘liq emas';
    } else if (_code.text.length != 6) {
      e = 'Kod to‘liq emas';
    } else if (_pass.text.length < 6) {
      e = 'Yangi parol kamida 6 belgi';
    }
    if (e != null) return setState(() => _err = tr(e!));
    setState(() {
      _err = null;
      _loading = true;
    });
    try {
      await api.post('/auth/driver/reset', data: {'phone': p, 'code': _code.text, 'newPassword': _pass.text});
      setState(() => _done = true);
      Timer(const Duration(milliseconds: 1500), () {
        if (mounted) Navigator.of(context).popUntil((x) => x.isFirst);
      });
    } catch (e) {
      if (mounted) setState(() => _err = errMsg(e, 'Tiklab bo‘lmadi'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_done) {
      return AuthShell(
        subtitle: 'Yangi parol o‘rnatish',
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: cardBox(color: greenBg, border: greenLine, radius: 12),
          child: const Column(children: [
            T('Parol yangilandi', color: green, weight: FontWeight.w600),
            SizedBox(height: 4),
            T('Login sahifasiga yo‘naltirilmoqda…', color: green),
          ]),
        ),
      );
    }
    return AuthShell(
      subtitle: 'Yangi parol o‘rnatish',
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        _Field(Icons.phone_outlined, 'Telefon raqam', _PhoneInput(_phone)),
        _Field(
          Icons.key_outlined,
          'Tasdiqlash kodi',
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, letterSpacing: 10),
            decoration: const InputDecoration(counterText: ''),
          ),
        ),
        _Field(Icons.lock_outline, 'Yangi parol', _PasswordInput(_pass)),
        ErrorBox(_err),
        const SizedBox(height: 24),
        PrimaryButton('Parolni saqlash', dark: true, busy: _loading, onTap: _submit),
        const SizedBox(height: 10),
        TextButton(onPressed: () => Navigator.of(context).popUntil((x) => x.isFirst), child: const T('← Login sahifaga qaytish', color: n500)),
      ]),
    );
  }
}

/// Waits for the admin's approval; polls and moves on by itself.
class PendingScreen extends StatefulWidget {
  const PendingScreen({super.key});
  @override
  State<PendingScreen> createState() => _PendingScreenState();
}

class _PendingScreenState extends State<PendingScreen> {
  Timer? _t;
  bool _checking = false;
  DateTime _at = DateTime.now();

  @override
  void initState() {
    super.initState();
    _check();
    _t = Timer.periodic(const Duration(seconds: 8), (_) => _check());
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  Future<void> _check() async {
    if (mounted) setState(() => _checking = true);
    await auth.refreshMe();
    if (mounted) {
      setState(() {
        _checking = false;
        _at = DateTime.now();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final d = auth.driver;
    String p(int n) => n.toString().padLeft(2, '0');
    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(children: [
              Container(
                width: 96,
                height: 96,
                decoration: BoxDecoration(shape: BoxShape.circle, color: const Color(0x263B9BFF), border: Border.all(color: const Color(0x663B9BFF), width: 2)),
                child: const Icon(Icons.schedule, size: 42, color: goldDeep),
              ),
              const SizedBox(height: 28),
              const T('Admin tasdiqlashi kutilmoqda', size: 22, weight: FontWeight.w800, align: TextAlign.center),
              const SizedBox(height: 8),
              const T('Hisobingiz yaratildi. Foydalanishni boshlash uchun admin sizni tasdiqlashi kerak. Tasdiqlangach, bu sahifa avtomatik yangilanadi.', color: n500, align: TextAlign.center, height: 1.4),
              if (d != null) ...[
                const SizedBox(height: 24),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: cardBox(),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Caption('Hisobingiz'),
                    const SizedBox(height: 4),
                    T('${d['fullName'] ?? ''}', weight: FontWeight.w700),
                    T('${d['phone'] ?? ''}', color: n500),
                  ]),
                ),
              ],
              const SizedBox(height: 18),
              T('Oxirgi tekshiruv: ${p(_at.hour)}:${p(_at.minute)}:${p(_at.second)}', size: 12, color: n400),
              const SizedBox(height: 24),
              OutlineBtn(_checking ? 'Tekshirilmoqda…' : 'Hozir tekshirish', icon: Icons.refresh, onTap: _checking ? null : _check),
              const SizedBox(height: 12),
              PrimaryButton('Chiqish', dark: true, icon: Icons.logout, height: 48, fontSize: 14, onTap: auth.logout),
              const SizedBox(height: 24),
              const T('Tasdiqlanmaguncha buyurtmalarni qabul qilolmaysiz. Savol bo‘lsa admin bilan bog‘laning.', size: 11, color: n400, align: TextAlign.center),
            ]),
          ),
        ),
      ),
    );
  }
}
