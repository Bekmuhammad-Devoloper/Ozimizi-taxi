import 'dart:math' as math;

import 'package:dio/dio.dart';

import 'lang.dart';

/// A server number that may arrive as a number or a string.
double numOf(dynamic v, [double fallback = 0]) {
  if (v == null) return fallback;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? fallback;
}

double? numOrNull(dynamic v) {
  if (v == null || v == '') return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

/// A text field that may be null or blank.
String? textOf(dynamic v) {
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}

/// 12000 → "12 000"
String fmtSum(dynamic v) {
  final n = numOf(v).round();
  final neg = n < 0;
  final digits = n.abs().toString();
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write(' ');
    out.write(digits[i]);
  }
  return '${neg ? '-' : ''}$out';
}

/// 75 → "01:15", 3725 → "1:02:05"
String fmtClock(num totalSec) {
  final s = math.max(0, totalSec.floor());
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final ss = s % 60;
  String p(int n) => n.toString().padLeft(2, '0');
  return h > 0 ? '$h:${p(m)}:${p(ss)}' : '${p(m)}:${p(ss)}';
}

const _months = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const _weekdays = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

DateTime? parseTime(dynamic iso) {
  if (iso == null) return null;
  return DateTime.tryParse(iso.toString())?.toLocal();
}

String _pad(int n) => n.toString().padLeft(2, '0');

/// "23:15"
String fmtTime(dynamic iso) {
  final d = parseTime(iso);
  return d == null ? '' : '${_pad(d.hour)}:${_pad(d.minute)}';
}

/// "1-oktabr · 23:15"
String fmtDateTime(dynamic iso) {
  final d = parseTime(iso);
  if (d == null) return '—';
  return '${d.day}-${_months[d.month - 1]} · ${fmtTime(iso)}';
}

/// Local calendar day, "2026-10-01", for grouping by day.
String localDayKey(dynamic iso) {
  final d = iso is DateTime ? iso.toLocal() : parseTime(iso);
  if (d == null) return '';
  return '${d.year}-${_pad(d.month)}-${_pad(d.day)}';
}

/// "Bugun", "Kecha" or "Payshanba, 1-oktabr"
String fmtDayLabel(String key) {
  if (key.isEmpty) return '';
  final p = key.split('-').map(int.parse).toList();
  final date = DateTime(p[0], p[1], p[2]);
  final now = DateTime.now();
  if (key == localDayKey(now)) return 'Bugun';
  if (key == localDayKey(now.subtract(const Duration(days: 1)))) return 'Kecha';
  return '${_weekdays[date.weekday - 1]}, ${p[2]}-${_months[p[1] - 1]}';
}

String fmtRelative(dynamic iso) {
  final d = parseTime(iso);
  if (d == null) return '—';
  final diff = DateTime.now().difference(d);
  if (diff.inSeconds < 60) return 'hozirgina';
  if (diff.inMinutes < 60) return '${diff.inMinutes} daq oldin';
  if (diff.inHours < 24) return '${diff.inHours} soat oldin';
  return fmtDateTime(iso);
}

double haversineKm(double lat1, double lng1, double lat2, double lng2) {
  const r = 6371.0;
  double rad(double d) => d * math.pi / 180;
  final dLat = rad(lat2 - lat1);
  final dLng = rad(lng2 - lng1);
  final a = math.pow(math.sin(dLat / 2), 2) +
      math.cos(rad(lat1)) * math.cos(rad(lat2)) * math.pow(math.sin(dLng / 2), 2);
  return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
}

/// The server's error message (nest may send a list), or `fallback`.
String errMsg(Object? e, String fallback) {
  if (e is DioException) {
    final d = e.response?.data;
    if (d is Map) {
      final m = d['message'];
      if (m is List) return tr(m.join(', '));
      if (m != null) return tr(m.toString());
    }
  }
  return tr(fallback);
}

/// "+998 90 123 45 67" while typing.
String maskPhone(String raw) {
  var digits = raw.replaceAll(RegExp(r'\D'), '');
  if (digits.length > 12) digits = digits.substring(0, 12);
  final d = digits.startsWith('998') ? digits : ('998$digits');
  final s = d.length > 12 ? d.substring(0, 12) : d;
  final out = StringBuffer('+998');
  if (s.length > 3) out.write(' ${s.substring(3, math.min(5, s.length))}');
  if (s.length > 5) out.write(' ${s.substring(5, math.min(8, s.length))}');
  if (s.length > 8) out.write(' ${s.substring(8, math.min(10, s.length))}');
  if (s.length > 10) out.write(' ${s.substring(10, math.min(12, s.length))}');
  return out.toString();
}
