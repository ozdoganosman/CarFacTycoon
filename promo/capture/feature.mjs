// Google Play feature graphic (1024 x 500): the game's own period map and a car from the 1928 save,
// laid out in the game page itself so its fonts and colours apply, with the tagline in one language:
// fastlane/metadata/android/<locale>/images/featureGraphic.png.
//
// Needs the app build served locally (see store.mjs); the map and the car come from the 1928 save played in
// that language.
// Usage: GAME_LANG=en node promo/capture/feature.mjs   (GAME_URL, CHROME_PATH to override)
import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const LANG = process.env.GAME_LANG ?? 'tr';
const LOCALES = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', es: 'es-419', hi: 'hi-IN', ar: 'ar' };
const OUT = join(HERE, `../../fastlane/metadata/android/${LOCALES[LANG]}/images/featureGraphic.png`);
const URL = `${process.env.GAME_URL ?? 'http://localhost:5191/index.html'}?lang=${LANG}`;
const TAGLINE = {
  tr: '1900 Amerika’sında küçük bir atölyeden<br>ülkenin otomobil devine',
  en: 'From a small workshop in 1900 America<br>to the nation’s great car maker',
  de: 'Von der kleinen Werkstatt im Amerika von 1900<br>zum großen Autohersteller des Landes',
  es: 'De un pequeño taller en los EE. UU. de 1900<br>al gran fabricante de autos del país',
  hi: '1900 के अमेरिका की एक छोटी वर्कशॉप से<br>देश की सबसे बड़ी कार कंपनी तक',
  ar: 'من ورشة صغيرة في أمريكا عام 1900<br>إلى أكبر صانع سيارات في البلاد',
}[LANG];

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
const own = join(HERE, 'saves', `play-1928-${LANG}.json.gz`);
const save = JSON.parse(gunzipSync(readFileSync(LANG !== 'tr' && existsSync(own) ? own : join(HERE, 'saves', 'play-1928.json.gz'))).toString('utf8'));
save.modals = [];
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
await page.locator('.start-actions .btn-default').first().click();
// The dealer map in the language of the page, at the scale the video uses (432 px wide at 2.5x).
const mapPage = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
await mapPage.route(/supabase\.co|posthog\.com/, (r) => r.abort());
await mapPage.goto(URL);
await mapPage.evaluate((json) => {
  localStorage.setItem('carfactycoon.save.v1', json);
  localStorage.setItem('carfactycoon.share', 'off');
}, JSON.stringify(save));
await mapPage.reload();
await mapPage.locator('.start-actions .btn-default').first().click();
await mapPage.locator('[data-nav="markets"]').first().click();
await mapPage.waitForTimeout(800);
const map = 'data:image/png;base64,' + (await mapPage.locator('.usmap').first().screenshot()).toString('base64');
await mapPage.close();
await page.locator('[data-nav="models"]').first().click();
await page.locator('button.link', { hasText: car.name }).first().click();
await page.waitForTimeout(500);
// The game's car drawing (CarSVG, 440 x 180), not one of the charts on the same screen.
const svg = await page.locator('svg[role=img][viewBox="0 0 440 180"]').first().evaluate((el) => el.outerHTML);

await page.evaluate(
  ({ map, svg, tagline, rtl }) => {
    document.body.innerHTML = `
<div id="fg">
  <img class="map" src="${map}" alt="">
  <div class="fade"></div>
  <div class="text">
    <h1>CarFacTycoon</h1>
    <p>${tagline}</p>
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
    // Right-to-left: the picture mirrored, the words on the right.
    if (rtl)
      css.textContent += `
      #fg { direction: rtl; }
      .map { left: -86px; transform: rotate(3deg); }
      .fade { background: linear-gradient(270deg, #1f1c18 0%, #1f1c18 50%, rgba(31,28,24,.8) 58%, rgba(31,28,24,0) 74%),
                          linear-gradient(0deg, rgba(31,28,24,.9) 0%, rgba(31,28,24,0) 30%); }
      .text { left: auto; right: 56px; text-align: right; }
      .car { right: auto; left: 40px; transform: scaleX(-1); }
      .years { direction: ltr; unicode-bidi: isolate; }`;
    document.head.appendChild(css);
  },
  { map, svg, tagline: TAGLINE, rtl: LANG === 'ar' },
);
await page.waitForTimeout(500);
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: 1024, height: 500 } });
console.log('wrote', OUT, 'car', car.name);
await browser.close();
