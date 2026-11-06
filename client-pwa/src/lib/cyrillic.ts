// Uzbek Latin → Cyrillic (keep in sync with backend/src/common/utils/cyrillic.ts).
// All texts are written in Latin; the Cyrillic version is derived from them.

const APOS = "'‘’ʻʼ`";
const VOWELS = 'aeiouAEIOU';
const LETTERS: Record<string, string> = {
  a: 'а', b: 'б', c: 'с', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м',
  n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
};
const DIGRAPHS: Record<string, string> = { sh: 'ш', ch: 'ч', yo: 'ё', yu: 'ю', ya: 'я', ye: 'е' };

// Foreign words the letter rules would spoil.
const WORDS: Record<string, string> = {
  taxi: 'такси',
  yandex: 'яндекс',
  dashboard: 'дашборд',
  online: 'онлайн',
  offline: 'офлайн',
  telegram: 'телеграм',
};
// Names and acronyms that stay in Latin.
const KEEP = new Set([
  'apk', 'gps', 'qr', 'sms', 'pwa', 'csv', 'pin', 'vip', 'ios', 'iphone', 'android', 'xiaomi', 'redmi', 'poco',
  'huawei', 'samsung', 'openstreetmap', 'osm', 'click', 'payme', 'uzcard', 'humo',
]);

const matchCase = (src: string, out: string) => {
  if (src.length > 1 && src === src.toUpperCase()) return out.toUpperCase();
  return src[0] === src[0].toUpperCase() ? out[0].toUpperCase() + out.slice(1) : out;
};

function convertWord(word: string): string {
  const plain = word.replace(/['‘’ʻʼ`]+$/, '');
  const tail = word.slice(plain.length);
  const low = plain.toLowerCase();
  if (KEEP.has(low)) return word;
  if (WORDS[low]) return matchCase(plain, WORDS[low]) + tail;
  let out = '';
  for (let i = 0; i < plain.length; i++) {
    const c = plain[i];
    const l = c.toLowerCase();
    const next = plain[i + 1] ?? '';
    const upper = c !== l;
    const put = (s: string) => {
      out += upper ? s.toUpperCase() : s;
    };
    if (APOS.includes(c)) {
      out += 'ъ'; // tutuq belgisi (ma’lumot)
      continue;
    }
    if ((l === 'o' || l === 'g') && next && APOS.includes(next)) {
      put(l === 'o' ? 'ў' : 'ғ');
      i++;
      continue;
    }
    const pair = l + next.toLowerCase();
    // yo‘l → йўл: the o‘ wins over "yo".
    const oApos = pair === 'yo' && !!plain[i + 2] && APOS.includes(plain[i + 2]);
    if (DIGRAPHS[pair] && !oApos) {
      put(DIGRAPHS[pair]);
      i++;
      continue;
    }
    if (l === 'e') {
      const prev = plain[i - 1];
      // э at the start or after a vowel; after и it is е (klient → клиент).
      put(!prev || (VOWELS.includes(prev) && prev.toLowerCase() !== 'i') || APOS.includes(prev) ? 'э' : 'е');
      continue;
    }
    put(LETTERS[l] ?? c);
  }
  return out + tail;
}

/** Links, handles, plate numbers, codes: left as written. */
function skipChunk(chunk: string): boolean {
  return (
    /[@#\\]|:\/\/|www\.|^\/|[A-Za-z]_[A-Za-z]|\.(uz|com|dev|ru|org|me|io)\b/i.test(chunk) ||
    /[A-Za-z].*\d/.test(chunk)
  );
}

function convertPlain(text: string): string {
  return text.replace(/\S+/g, (chunk) =>
    skipChunk(chunk) ? chunk : chunk.replace(/[A-Za-z][A-Za-z'‘’ʻʼ`]*/g, convertWord),
  );
}

/** `html`: the text is Telegram HTML — tags, entities and <code> stay untouched. */
export function toCyrillic(text: string, opts: { html?: boolean } = {}): string {
  const guard = opts.html
    ? /(<(?:code|pre)[^>]*>[\s\S]*?<\/(?:code|pre)>|<[^>]+>|&[a-zA-Z#0-9]+;|`[^`]*`)/
    : /(`[^`\n]*`)/;
  return text
    .split(guard)
    .map((part, i) => (i % 2 ? part : convertPlain(part)))
    .join('');
}
