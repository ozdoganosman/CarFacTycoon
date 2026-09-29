// Google Play feature graphic (1024 x 500): the game's own period map and a car from the 1928 save,
// laid out in the game page itself so its fonts and colours apply.
//
// Needs the app build served locally (see store.mjs) and public/shots/map-1928.png from `node capture/shots.mjs map`.
// Usage: node promo/capture/feature.mjs   (GAME_URL, CHROME_PATH to override)
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../docs/play/feature-graphic.png');
const URL = process.env.GAME_URL ?? 'http://localhost:5191/index.html';

function loadPlaywright() {
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try {
      return require(p);
    } catch {
      /* try the next */
    }
  }
  throw new Error('Playwright not found: npm i -D playwright');
}
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
const save = JSON.parse(gunzipSync(readFileSync(join(HERE, 'saves', 'play-1928.json.gz'))).toString('utf8'));
save.modals = [];
const map = 'data:image/png;base64,' + readFileSync(join(HERE, '../public/shots/map-1928.png')).toString('base64');
// The family car that sells best.
const car = save.models.filter((m) => m.status === 'active' && m.segment === 'family').sort((a, b) => b.unitsSold - a.unitsSold)[0];

const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
await page.route(/supabase\.co|posthog\.com/, (r) => r.abort());
await page.goto(URL);
await page.evaluate((json) => {
  localStorage.setItem('carfactycoon.save.v1', json);
  localStorage.setItem('carfactycoon.share', 'off');
}, JSON.stringify(save));
await page.reload();
await page.getByRole('button', { name: 'Kaldığın yerden devam et' }).click();
await page.locator('.nav-item', { hasText: 'Modeller' }).first().click();
await page.locator('button.link', { hasText: car.name }).first().click();
await page.waitForTimeout(500);
const svg = await page.locator('svg[aria-label$="gövdeli araç çizimi"]').first().evaluate((el) => el.outerHTML);

await page.evaluate(
  ({ map, svg }) => {
    document.body.innerHTML = `
<div id="fg">
  <img class="map" src="${map}" alt="">
  <div class="fade"></div>
  <div class="text">
    <h1>CarFacTycoon</h1>
    <p>1900 Amerika’sında küçük bir atölyeden<br>ülkenin otomobil devine</p>
    <div class="years">1900 – 1960</div>
  </div>
  <div class="car">${svg}</div>
</div>`;
    const css = document.createElement('style');
    css.textContent = `
      html, body { margin: 0; background: #1f1c18; overflow: hidden; }
      #fg { position: relative; width: 1024px; height: 500px; overflow: hidden;
        background: radial-gradient(120% 140% at 20% 40%, #3a342c 0%, #1f1c18 60%); }
      .map { position: absolute; left: 450px; top: -24px; width: 660px; transform: rotate(-3deg);
        filter: saturate(0.9) sepia(0.15); border-radius: 6px; box-shadow: 0 20px 60px rgba(0,0,0,.6); }
      .fade { position: absolute; inset: 0;
        background: linear-gradient(90deg, #1f1c18 0%, #1f1c18 50%, rgba(31,28,24,.8) 58%, rgba(31,28,24,0) 74%),
                    linear-gradient(0deg, rgba(31,28,24,.9) 0%, rgba(31,28,24,0) 30%); }
      .text { position: absolute; left: 56px; top: 118px; color: #f3ead8; }
      h1 { font-family: var(--font-display); font-weight: 700; font-size: 76px; line-height: 1; margin: 0 0 22px; letter-spacing: -0.5px; }
      p { font-family: var(--font-ui); font-size: 25px; line-height: 1.4; margin: 0; color: #e6dac2; }
      .years { margin-top: 26px; display: inline-block; font-family: var(--font-display); font-size: 20px; letter-spacing: 3px;
        color: #f3ead8; background: #b0452c; padding: 7px 16px 6px; border-radius: 4px; }
      .car { position: absolute; right: 40px; bottom: 26px; width: 370px; filter: drop-shadow(0 14px 18px rgba(0,0,0,.55)); }
      .car svg { width: 100%; height: auto; display: block; }`;
    document.head.appendChild(css);
  },
  { map, svg },
);
await page.waitForTimeout(500);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1024, height: 500 } });
console.log('wrote', OUT, 'car', car.name);
await browser.close();
