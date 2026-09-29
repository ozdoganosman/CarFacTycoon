import { isTurkish } from '../i18n';
import { fmtNumber, fmtPercent } from '../i18n/format';

// Turkish suffixes after numbers follow how the number is read aloud: "%6’sı"
// (altı), "%10’u" (on), "%25’i" (beş), "%40’ı" (kırk). In the other languages the helpers give the
// plain number or percentage (the translated sentence carries the grammar).

const UNITS = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

/** The last word spoken for a whole number. */
function lastWordInt(n: number): string {
  const x = Math.abs(Math.round(n));
  if (x === 0) return 'sıfır';
  if (x % 10) return UNITS[x % 10];
  if (x % 100) return TENS[(x % 100) / 10];
  if (x % 1000) return 'yüz';
  if (x % 1e6) return 'bin';
  if (x % 1e9) return 'milyon';
  return 'milyar';
}

/** The last word spoken for a number as written with `digits` decimals ("2,5" → "beş"). */
export function lastWord(n: number, digits = 0): string {
  const text = Math.abs(n).toFixed(digits);
  const [int, frac] = text.split('.');
  if (frac && Number(frac) > 0) return lastWordInt(Number(frac.replace(/0+$/, '')));
  return lastWordInt(Number(int));
}

const VOWELS = 'aıoueiöü';
function lastVowel(word: string): string {
  for (let i = word.length - 1; i >= 0; i--) if (VOWELS.includes(word[i])) return word[i];
  return 'e';
}
const high = (v: string) => ('aı'.includes(v) ? 'ı' : 'ou'.includes(v) ? 'u' : 'ei'.includes(v) ? 'i' : 'ü');
const low = (v: string) => ('aıou'.includes(v) ? 'a' : 'e');
const endsInVowel = (w: string) => VOWELS.includes(w[w.length - 1]);
const voiceless = (w: string) => 'pçtksşhf'.includes(w[w.length - 1]);

export type SuffixKind = 'poss' | 'possAcc' | 'abl' | 'loc';

/** The suffix (without the apostrophe) a word takes. */
export function suffixFor(word: string, kind: SuffixKind): string {
  const v = lastVowel(word);
  switch (kind) {
    case 'poss':
      return (endsInVowel(word) ? 's' : '') + high(v);
    case 'possAcc':
      return (endsInVowel(word) ? 's' : '') + high(v) + 'n' + high(v);
    case 'abl':
      return (voiceless(word) ? 't' : 'd') + low(v) + 'n';
    case 'loc':
      return (voiceless(word) ? 't' : 'd') + low(v);
  }
}

/** A number with its suffix: num(6, 'poss') → "6’sı", num(2.5, 'poss', 1) → "2,5’i". */
export function withSuffix(n: number, kind: SuffixKind, digits = 0): string {
  if (!isTurkish()) return fmtNumber(n, digits);
  const shown = n.toLocaleString('tr-TR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${shown}’${suffixFor(lastWord(n, digits), kind)}`;
}

/** A share as a percentage with a suffix: pct(0.06, 'poss') → "%6’sı". */
export function pctWith(share: number, kind: SuffixKind, digits = 0): string {
  if (!isTurkish()) return fmtPercent(share, digits);
  return `%${withSuffix(share * 100, kind, digits)}`;
}
