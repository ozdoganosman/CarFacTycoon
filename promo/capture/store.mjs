// Google Play phone screenshots: 432 x 768 CSS px at 2.5x = 1080 x 1920 (9:16), from the app build, in one
// language: fastlane/metadata/android/<locale>/images/phoneScreenshots/01-harita.jpg … 08-gazete.jpg.
//
// Needs the app build served locally (from the repo root: `npx vite build --mode app`, then serve dist-app,
// e.g. `python3 -m http.server 5191 --directory dist-app`). Saves come from scripts/promo-saves.balance.ts
// (play-*.json.gz in Turkish, play-*-<lang>.json.gz played in that language).
// Usage: GAME_LANG=en node promo/capture/store.mjs   (GAME_LANG: tr en de es hi ar; GAME_URL, CHROME_PATH to override)
import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const LANG = process.env.GAME_LANG ?? 'tr';
export const LOCALES = { tr: 'tr-TR', en: 'en-US', de: 'de-DE', es: 'es-419', hi: 'hi-IN', ar: 'ar' };
const OUT = join(HERE, `../../fastlane/metadata/android/${LOCALES[LANG]}/images/phoneScreenshots`);
const URL = `${process.env.GAME_URL ?? 'http://localhost:5191/index.html'}?lang=${LANG}`;

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
mkdirSync(OUT, { recursive: true });
const errors = [];
/** The save played in this language, if there is one. */
const save = (n) => {
  const own = join(HERE, 'saves', `${n}-${LANG}.json.gz`);
  const file = LANG !== 'tr' && existsSync(own) ? own : join(HERE, 'saves', `${n}.json.gz`);
  return JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
};

async function open(name, fn, mutate) {
  const ctx = await browser.newContext({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  await p.route(/supabase\.co|posthog\.com|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await p.goto(URL);
  const o = save(name);
  if (mutate) mutate(o);
  else o.modals = [];
  await p.evaluate((json) => {
    localStorage.setItem('carfactycoon.save.v1', json);
    localStorage.setItem('carfactycoon.share', 'off');
  }, JSON.stringify(o));
  await p.reload();
  // "Continue where you left off": the start screen's only plain button.
  await p.locator('.start-actions .btn-default').first().tap();
  await p.waitForTimeout(600);
  // The "game paused" banner would sit on every shot.
  await p.addStyleTag({ content: '.pause-banner{display:none!important}' });
  await fn(p);
  await ctx.close();
}
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.jpg`, type: 'jpeg', quality: 90 });
const nav = async (p, id) => {
  const b = p.locator(`[data-nav="${id}"]`).first();
  await b.scrollIntoViewIfNeeded();
  await b.tap();
  await p.waitForTimeout(500);
};
const center = (p, sel) => p.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
const top = (p, sel) => p.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'start' }));

/** The best-reviewed car on sale, shown as if just launched. */
const launchOf = (o) => {
  const best = o.models.filter((m) => m.status === 'active').sort((a, b) => b.reviewScore - a.reviewScore)[0];
  const venues = { tr: 'ABD Otomobil Fuarı', en: 'US Auto Show', de: 'US-Automobilausstellung', es: 'Salón del Automóvil de EE. UU.', hi: 'अमेरिकी ऑटो शो', ar: 'معرض السيارات الأمريكي' };
  o.modals = [{ kind: 'launch', modelId: best.id, venue: `${Math.floor(1900 + best.launchWeek / 52)} ${venues[LANG]}` }];
};

await open('play-1928', async (p) => {
  await nav(p, 'markets');
  await p.waitForTimeout(600);
  // The network's summary, the view buttons and the map together.
  await top(p, '.panel:has(.usmap)');
  await p.evaluate(() => window.scrollBy(0, -12));
  await p.waitForTimeout(400);
  await shot(p, '01-harita');
});
// The hand-made design save is Turkish: its car gets a name in the language of the shot.
const STAR = { tr: 'Yıldız', en: 'Star', de: 'Stern', es: 'Estrella', hi: 'तारा', ar: 'النجم' };
await open('save-design', async (p) => {
  await nav(p, 'projects');
  await p.locator('.card-item').first().tap();
  await p.waitForTimeout(600);
  await center(p, 'svg[role=img]').catch(() => {});
  await p.waitForTimeout(300);
  await shot(p, '02-tasarim');
  await p.locator('[data-tab="engine"]').first().tap();
  await p.waitForTimeout(500);
  await center(p, '.anim--engineBlock');
  await p.waitForTimeout(1200);
  await shot(p, '03-motor');
}, (o) => {
  o.modals = [];
  o.projects[0].name = STAR[LANG];
});
await open(
  'play-1928',
  async (p) => {
    await p.waitForTimeout(3200);
    // "What do the magazines say?"
    await p.locator('.modal-actions .btn-primary').first().tap();
    await p.waitForTimeout(5600);
    await shot(p, '04-lansman');
  },
  launchOf,
);
await open('play-1928', async (p) => {
  await nav(p, 'factory');
  await p.waitForTimeout(600);
  await center(p, 'canvas');
  await p.waitForTimeout(1500);
  await shot(p, '05-fabrika');
  await nav(p, 'company');
  await p.waitForTimeout(500);
  await top(p, '.board-panel');
  await p.waitForTimeout(300);
  await shot(p, '06-borsa');
  await nav(p, 'hq');
  await p.locator('.archive button, .archive a').first().scrollIntoViewIfNeeded().catch(() => {});
  await p.locator('.archive button, .archive a').first().tap().catch(() => {});
  await p.waitForTimeout(1000);
  await shot(p, '08-gazete');
});
await open(
  'play-1928-rival',
  async (p) => {
    await p.waitForTimeout(700);
    await shot(p, '07-rakip');
  },
  () => {},
);
console.log(LANG, OUT, 'errors', JSON.stringify(errors));
await browser.close();
