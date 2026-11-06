// Uzbek Latin → Cyrillic (keep in sync with backend/src/common/utils/cyrillic.ts).
// All texts are written in Latin; the Cyrillic version is derived from them.

const _apos = "'‘’ʻʼ`";
const _vowels = 'aeiouAEIOU';
const _letters = <String, String>{
  'a': 'а', 'b': 'б', 'c': 'с', 'd': 'д', 'e': 'е', 'f': 'ф', 'g': 'г', 'h': 'ҳ', 'i': 'и', 'j': 'ж', 'k': 'к',
  'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о', 'p': 'п', 'q': 'қ', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'v': 'в',
  'w': 'в', 'x': 'х', 'y': 'й', 'z': 'з',
};
const _digraphs = <String, String>{'sh': 'ш', 'ch': 'ч', 'yo': 'ё', 'yu': 'ю', 'ya': 'я', 'ye': 'е'};

// Foreign words the letter rules would spoil.
const _words = <String, String>{
  'taxi': 'такси',
  'yandex': 'яндекс',
  'dashboard': 'дашборд',
  'online': 'онлайн',
  'offline': 'офлайн',
  'telegram': 'телеграм',
};
// Names and acronyms that stay in Latin.
const _keep = <String>{
  'apk', 'gps', 'qr', 'sms', 'pwa', 'csv', 'pin', 'vip', 'ios', 'iphone', 'android', 'xiaomi', 'redmi', 'poco',
  'huawei', 'samsung', 'openstreetmap', 'osm', 'click', 'payme', 'uzcard', 'humo',
};

bool _isUpper(String c) => c != c.toLowerCase();

String _matchCase(String src, String out) {
  if (src.length > 1 && src == src.toUpperCase()) return out.toUpperCase();
  return _isUpper(src[0]) ? out[0].toUpperCase() + out.substring(1) : out;
}

String _convertWord(String word) {
  final plain = word.replaceFirst(RegExp("['‘’ʻʼ`]+\$"), '');
  final tail = word.substring(plain.length);
  final low = plain.toLowerCase();
  if (_keep.contains(low)) return word;
  if (_words.containsKey(low)) return _matchCase(plain, _words[low]!) + tail;
  final out = StringBuffer();
  for (var i = 0; i < plain.length; i++) {
    final c = plain[i];
    final l = c.toLowerCase();
    final next = i + 1 < plain.length ? plain[i + 1] : '';
    final upper = _isUpper(c);
    void put(String s) => out.write(upper ? s.toUpperCase() : s);
    if (_apos.contains(c)) {
      out.write('ъ'); // tutuq belgisi (ma’lumot)
      continue;
    }
    if ((l == 'o' || l == 'g') && next.isNotEmpty && _apos.contains(next)) {
      put(l == 'o' ? 'ў' : 'ғ');
      i++;
      continue;
    }
    final pair = l + next.toLowerCase();
    // yo‘l → йўл: the o‘ wins over "yo".
    final oApos = pair == 'yo' && i + 2 < plain.length && _apos.contains(plain[i + 2]);
    if (_digraphs.containsKey(pair) && !oApos) {
      put(_digraphs[pair]!);
      i++;
      continue;
    }
    if (l == 'e') {
      final prev = i > 0 ? plain[i - 1] : '';
      // э at the start or after a vowel; after и it is е (klient → клиент).
      final hard = prev.isEmpty || (_vowels.contains(prev) && prev.toLowerCase() != 'i') || _apos.contains(prev);
      put(hard ? 'э' : 'е');
      continue;
    }
    put(_letters[l] ?? c);
  }
  return out.toString() + tail;
}

final _skip1 = RegExp(r'[@#\\]|://|www\.|^/|[A-Za-z]_[A-Za-z]|\.(uz|com|dev|ru|org|me|io)\b', caseSensitive: false);
final _skip2 = RegExp(r'[A-Za-z].*\d');
final _chunk = RegExp(r'\S+');
final _word = RegExp("[A-Za-z][A-Za-z'‘’ʻʼ`]*");

/// Links, handles, plate numbers and codes stay as written.
String toCyrillic(String text) {
  return text.replaceAllMapped(_chunk, (m) {
    final chunk = m.group(0)!;
    if (_skip1.hasMatch(chunk) || _skip2.hasMatch(chunk)) return chunk;
    return chunk.replaceAllMapped(_word, (w) => _convertWord(w.group(0)!));
  });
}
