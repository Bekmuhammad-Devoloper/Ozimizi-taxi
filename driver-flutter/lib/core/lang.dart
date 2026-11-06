import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'cyrillic.dart';

/// App language. Texts are written in Latin; `tr` converts them in Cyrillic mode.
class Lang extends ChangeNotifier {
  static const _key = 'moviy-lang';
  bool cyrillic = false;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    cyrillic = p.getString(_key) == 'cyrl';
  }

  Future<void> set(bool cyr) async {
    if (cyr == cyrillic) return;
    cyrillic = cyr;
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setString(_key, cyr ? 'cyrl' : 'latn');
  }
}

final lang = Lang();

String tr(String text) => lang.cyrillic ? toCyrillic(text) : text;
