import 'package:dio/dio.dart';

import 'store.dart';

/// Production by default; `--dart-define=API_URL=...` for a local backend.
const apiUrl = String.fromEnvironment('API_URL', defaultValue: 'https://moviytaxi.uz/api');
const wsUrl = String.fromEnvironment('WS_URL', defaultValue: 'https://moviytaxi.uz');
const siteUrl = String.fromEnvironment('SITE_URL', defaultValue: 'https://moviytaxi.uz');

final Dio api = _build();

Dio _build() {
  final d = Dio(BaseOptions(
    baseUrl: apiUrl,
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 30),
  ));
  d.interceptors.add(InterceptorsWrapper(
    onRequest: (o, h) {
      final t = auth.token;
      if (t != null) o.headers['Authorization'] = 'Bearer $t';
      h.next(o);
    },
    onError: (e, h) {
      if (e.response?.statusCode == 401) auth.logout();
      h.next(e);
    },
  ));
  return d;
}

/// Uploaded files come as server paths.
String? fileUrl(dynamic v) {
  if (v == null || v.toString().isEmpty) return null;
  final s = v.toString();
  if (s.startsWith('http')) return s;
  return '$siteUrl${s.startsWith('/') ? '' : '/'}$s';
}
