// Rebuilds a save sent with the in-game "Claude'a gönder" button.
//
//   node scripts/playtest.mjs <out_dir> <playtest id> [save.json]
//
// <out_dir> is where the artifact database documents were downloaded:
// <out_dir>/playtests/<id>.json and <out_dir>/playtests/<id>/chunks/<n>.json.
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { gunzipSync } from 'zlib';

const [dir, id, out = `playtest-${id}.json`] = process.argv.slice(2);
if (!dir || !id) {
  console.error('usage: node scripts/playtest.mjs <out_dir> <playtest id> [save.json]');
  process.exit(1);
}
// A downloaded document is either the body itself or wrapped with its metadata.
const body = (file) => {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  return doc && typeof doc.data === 'object' && doc.data !== null && !Array.isArray(doc.data) ? doc.data : doc;
};
const main = body(join(dir, 'playtests', `${id}.json`));
const chunkDir = join(dir, 'playtests', id, 'chunks');
const pieces = readdirSync(chunkDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => body(join(chunkDir, f)))
  .sort((a, b) => a.i - b.i);
if (pieces.length !== main.chunks) throw new Error(`expected ${main.chunks} pieces, found ${pieces.length}`);
const text = pieces.map((p) => p.data).join('');
const json = main.encoding === 'gzip-base64' ? gunzipSync(Buffer.from(text, 'base64')).toString('utf8') : text;
JSON.parse(json);
writeFileSync(out, json);
console.log(`${main.summary?.company} · ${main.summary?.date} · note: ${main.note || '—'}\nsaved ${out} (${json.length} bytes)`);
