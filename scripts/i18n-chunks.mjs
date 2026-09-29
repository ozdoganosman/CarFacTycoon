// Splits the texts still missing from a catalog into chunks for translators, and merges translated
// chunks back into the catalog after checking them (placeholders, tags, plural forms).
//
//   node scripts/i18n-chunks.mjs split <lang> <outDir> [words per chunk=6000]
//       → <outDir>/<lang>-<i>.json: [{ key, tr, en?, at }] (en: the English text, when there is one, as a reference)
//   node scripts/i18n-chunks.mjs check <lang> <file>...   → checks translated chunks, changes nothing
//   node scripts/i18n-chunks.mjs merge <lang> <file>...
//       → adds the { key: translation } files to src/i18n/locales/<lang>.json; bad entries are listed and left out
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const [, , cmd, lang, ...rest] = process.argv;
const source = JSON.parse(readFileSync('src/i18n/source.json', 'utf8'));
const catPath = `src/i18n/locales/${lang}.json`;
const catalog = JSON.parse(readFileSync(catPath, 'utf8'));
const english = lang === 'en' ? {} : JSON.parse(readFileSync('src/i18n/locales/en.json', 'utf8'));

const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const tags = (s) => [...s.matchAll(/<\/?([a-zA-Z]+)\s*\/?>/g)].map((m) => m[0].replace(/\s/g, '')).sort();

function problems(key, value) {
  const src = source[key];
  if (!src) return ['not in source.json'];
  const out = [];
  const want = holes(src.tr);
  const forms = typeof value === 'string' ? [['', value]] : Object.entries(value);
  if (typeof value !== 'string' && (typeof value !== 'object' || !value.other)) out.push('plural forms without "other"');
  for (const [form, text] of forms) {
    if (typeof text !== 'string' || !text.trim()) {
      out.push(`${form || 'text'} is empty`);
      continue;
    }
    const got = holes(text);
    const extra = got.filter((h) => !want.includes(h));
    const missing = want.filter((h) => !got.includes(h) && !(form && form !== 'other' && h === 'n'));
    if (extra.length) out.push(`${form} unknown placeholders ${extra}`);
    if (missing.length) out.push(`${form} missing placeholders ${missing}`);
    if (tags(text).join() !== tags(src.tr).join()) out.push(`${form} tags differ`);
  }
  return out;
}

if (cmd === 'split') {
  const [outDir, per = '6000'] = rest;
  mkdirSync(outDir, { recursive: true });
  const todo = Object.entries(source).filter(([k]) => catalog[k] === undefined);
  const chunks = [];
  let cur = [];
  let words = 0;
  for (const [key, v] of todo) {
    cur.push({ key, tr: v.tr, ...(v.ctx ? { context: v.ctx } : {}), ...(english[key] ? { en: english[key] } : {}), at: v.at });
    words += v.tr.split(/\s+/).length;
    if (words >= Number(per)) {
      chunks.push(cur);
      cur = [];
      words = 0;
    }
  }
  if (cur.length) chunks.push(cur);
  chunks.forEach((c, i) => writeFileSync(join(outDir, `${lang}-${i + 1}.json`), JSON.stringify(c, null, 1) + '\n'));
  console.log(`${todo.length} texts to translate into ${lang} → ${chunks.length} chunks in ${outDir}`);
} else if (cmd === 'check') {
  // Checks translated chunks without touching the catalog.
  let ok = 0;
  let bad = 0;
  for (const file of rest) {
    const part = JSON.parse(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(part)) {
      const p = problems(key, value);
      if (p.length) {
        bad++;
        console.log(`${key}: ${p.join('; ')} — ${JSON.stringify(value).slice(0, 160)}`);
      } else ok++;
    }
  }
  console.log(`${ok} good, ${bad} with problems`);
  if (bad) process.exit(1);
} else if (cmd === 'merge') {
  let added = 0;
  const bad = [];
  for (const file of rest) {
    const part = JSON.parse(readFileSync(file, 'utf8'));
    for (const [key, value] of Object.entries(part)) {
      const p = problems(key, value);
      if (p.length) bad.push(`${file} ${key}: ${p.join('; ')} — ${JSON.stringify(value).slice(0, 120)}`);
      else {
        catalog[key] = value;
        added++;
      }
    }
  }
  // Keep the catalog in the order of the texts in the code.
  const ordered = {};
  for (const k of Object.keys(source)) if (catalog[k] !== undefined) ordered[k] = catalog[k];
  writeFileSync(catPath, JSON.stringify(ordered, null, 1) + '\n');
  console.log(`${lang}: +${added}, ${Object.keys(ordered).length}/${Object.keys(source).length} translated`);
  for (const b of bad) console.log('SKIPPED ' + b);
} else {
  console.log('usage: split <lang> <outDir> [words] | merge <lang> <files...>');
  process.exit(1);
}
