// Collects every translatable text of the game: the first argument of t(), tx() and msg() calls in src/.
// Writes src/i18n/source.json ({ key: { tr, at } }, in order of appearance) for the translators and the
// catalog checks (tests/i18n.test.ts). The key is the same hash the game looks texts up by.
//
// Usage: node scripts/i18n-extract.mjs [--strict]   (--strict: fail on calls whose text is not a literal)
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import ts from 'typescript';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const SRC = join(ROOT, 'src');
const OUT = join(SRC, 'i18n/source.json');
const CALLS = new Set(['t', 'tx', 'msg']);

/** Same as keyOf() in src/i18n/index.ts. */
function keyOf(src) {
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function files(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
  }
  return out;
}

const found = new Map();
const dynamic = [];
const errors = [];

for (const file of files(SRC)) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('src/i18n/')) continue;
  const text = readFileSync(file, 'utf8');
  if (!/\b(t|tx|msg)\(/.test(text)) continue;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CALLS.has(node.expression.text) && node.arguments.length) {
      const arg = node.arguments[0];
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const at = `${rel}:${line}`;
      if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
        const src = arg.text;
        if (src.trim()) {
          const k = keyOf(src);
          const prev = found.get(k);
          if (prev && prev.tr !== src) errors.push(`key collision ${k}: "${prev.tr}" / "${src}"`);
          else if (!prev) found.set(k, { tr: src, at });
        }
      } else if (ts.isTemplateExpression(arg)) {
        errors.push(`${at}: ${node.expression.text}() with \${} inside the text; use {placeholders}`);
      } else if (node.expression.text !== 'msg') {
        dynamic.push(`${at}: ${node.expression.text}(${arg.getText().slice(0, 60)})`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const out = {};
for (const [k, v] of found) out[k] = v;
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
const words = [...found.values()].reduce((a, v) => a + v.tr.split(/\s+/).length, 0);
console.log(`${found.size} texts, ${words} words → ${relative(ROOT, OUT)}`);
console.log(`${dynamic.length} calls with a text from a table or a variable (translated when that text is marked with msg())`);
if (process.argv.includes('--verbose')) for (const d of dynamic) console.log('  ' + d);
for (const e of errors) console.error('ERROR ' + e);
if (errors.length) process.exit(1);
