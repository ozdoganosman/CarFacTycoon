import { readFileSync, readdirSync } from 'fs';
import { afterEach, describe, expect, it } from 'vitest';
import { LANGS, keyOf, list, setLanguage, t, tc, type Catalog, type Plural } from '../src/i18n';
import { fmtMoney, fmtNumber, fmtPercent } from '../src/i18n/format';
import { formatDate } from '../src/core/time';
import { money } from '../src/core/util';
import { pctWith } from '../src/core/turkish';

// The catalogs against the texts in the code (src/i18n/source.json, written by scripts/i18n-extract.mjs).

const source: Record<string, { tr: string; at: string }> = JSON.parse(readFileSync('src/i18n/source.json', 'utf8'));
const locales = readdirSync('src/i18n/locales').filter((f) => f.endsWith('.json'));

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<\/?([a-zA-Z]+)\s*\/?>/g)].map((m) => m[0].replace(/\s/g, '')).sort();

afterEach(() => setLanguage('tr', null));

describe('catalogs', () => {
  for (const file of locales) {
    const cat: Catalog = JSON.parse(readFileSync(`src/i18n/locales/${file}`, 'utf8'));
    it(`${file}: every entry belongs to a text in the code, with the same placeholders and tags`, () => {
      const problems: string[] = [];
      for (const [k, v] of Object.entries(cat)) {
        const src = source[k];
        if (!src) {
          problems.push(`${k}: no such text in the code (run node scripts/i18n-extract.mjs, then drop it)`);
          continue;
        }
        const want = holes(src.tr);
        const forms: [string, string][] = typeof v === 'string' ? [['', v]] : Object.entries(v as Plural).map(([f, s]) => [f, s ?? '']);
        if (typeof v !== 'string' && !(v as Plural).other) problems.push(`${k}: plural forms without "other"`);
        for (const [form, text] of forms) {
          const got = holes(text);
          const extra = got.filter((h) => !want.includes(h));
          if (extra.length) problems.push(`${k}${form && '.' + form}: unknown placeholders ${extra.join(', ')} in "${text}"`);
          // A plural form may leave out the count ("one car"); everything else must be there.
          const missing = want.filter((h) => !got.includes(h) && !(form && form !== 'other' && h === 'n'));
          if (missing.length) problems.push(`${k}${form && '.' + form}: missing ${missing.join(', ')} in "${text}" (source "${src.tr}")`);
          if (tags(text).join() !== tags(src.tr).join()) problems.push(`${k}${form && '.' + form}: tags differ from "${src.tr}" in "${text}"`);
        }
      }
      expect(problems).toEqual([]);
      const done = Object.keys(cat).length;
      console.log(`${file}: ${done}/${Object.keys(source).length} texts translated`);
    });
  }
});

describe('the language helpers', () => {
  it('Turkish stays exactly as the game always wrote it', () => {
    expect(money(1_234_567)).toBe('$1.23 mn');
    expect(money(41_000)).toBe('$41 bin');
    expect(money(2600)).toBe('$2.600');
    expect(fmtPercent(0.125)).toBe('%12.5');
    expect(pctWith(0.06, 'poss')).toBe('%6’sı');
    expect(formatDate(0)).toBe('Ocak 1900');
    expect(t('{n} araç', { n: 3 })).toBe('3 araç');
    expect(list(['a', 'b', 'c'])).toBe('a, b ve c');
  });

  it('other languages: their own numbers, dates and plural forms', () => {
    const k = keyOf('{n} araç');
    setLanguage('en', { [k]: { one: '{n} car', other: '{n} cars' } });
    expect(t('{n} araç', { n: 1 })).toBe('1 car');
    expect(t('{n} araç', { n: 3 })).toBe('3 cars');
    expect(t('Bilinmeyen metin')).toBe('Bilinmeyen metin');
    setLanguage('en', { [keyOf('Açık')]: 'Open', [keyOf('tema\u0004Açık')]: 'Light' });
    expect(t('Açık')).toBe('Open');
    expect(tc('tema', 'Açık')).toBe('Light');
    setLanguage('en', { [k]: { one: '{n} car', other: '{n} cars' } });
    expect(fmtMoney(1_234_567)).toBe('$1.23M');
    expect(fmtMoney(41_000)).toBe('$41K');
    expect(fmtNumber(2600)).toBe('2,600');
    expect(fmtPercent(0.125)).toBe('12.5%');
    expect(pctWith(0.06, 'poss')).toBe('6%');
    expect(formatDate(0)).toBe('January 1900');
    expect(list(['a', 'b', 'c'])).toBe('a, b, and c');
    setLanguage('de', null);
    expect(fmtMoney(1_234_567)).toBe('$1,23 Mio.');
    expect(formatDate(26 * 52 + 30)).toBe('Juli 1926');
    setLanguage('ar', { [k]: { zero: 'لا سيارات', one: 'سيارة واحدة', two: 'سيارتان', few: '{n} سيارات', many: '{n} سيارة', other: '{n} سيارة' } });
    expect(t('{n} araç', { n: 2 })).toBe('سيارتان');
    expect(t('{n} araç', { n: 5 })).toBe('5 سيارات');
    expect(fmtNumber(1234)).toBe('1,234');
  });

  it('every language the game offers has a catalog file', () => {
    for (const l of LANGS.filter((x) => x.id !== 'tr' && !x.hidden)) expect(locales).toContain(`${l.id}.json`);
  });
});
