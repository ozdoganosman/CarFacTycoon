// Downloads the promo's Google Fonts (OFL) into public/fonts so renders need no network.
// Usage: node capture/fonts.mjs
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../public/fonts');
const CSS = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=Special+Elite&family=Oswald:wght@500;700&display=block';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

mkdirSync(OUT, { recursive: true });
const css = await (await fetch(CSS, { headers: { 'user-agent': UA } })).text();
const faces = [];
for (const m of css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face \{([^}]*)\}/g)) {
  const [, subset, body] = m;
  if (subset !== 'latin' && subset !== 'latin-ext') continue;
  const family = /font-family: '([^']+)'/.exec(body)[1];
  const weight = /font-weight: (\d+)/.exec(body)[1];
  const url = /src: url\(([^)]+)\)/.exec(body)[1];
  const range = /unicode-range: ([^;]+);/.exec(body)[1];
  const file = `${family.replace(/ /g, '')}-${subset}.woff2`;
  faces.push({ family, weight, range, file, url });
}
for (const url of new Set(faces.map((f) => f.url))) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  for (const f of faces.filter((x) => x.url === url)) writeFileSync(join(OUT, f.file), buf);
}
writeFileSync(join(OUT, 'fonts.json'), JSON.stringify(faces.map(({ url: _url, ...f }) => f), null, 2) + '\n');
console.log(faces.map((f) => `${f.family} ${f.weight} ${f.file}`).join('\n'));
