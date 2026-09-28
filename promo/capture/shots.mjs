// Captures the game screens the promo is cut from, at phone size (432 x 768 CSS px at 2.5x = 1080 x 1920).
//
// Needs the game served at http://localhost:4173 (from the repo root: `npx vite build && npx vite preview --port 4173`).
// Usage: node capture/shots.mjs [all|design|launch|factory|late]
//
// Animations are captured frame by frame on a virtual clock (canvas scenes) or by seeking the CSS
// animations, so the sequences play back smoothly at 30 fps whatever the screenshot speed.
import { createRequire } from 'module';
import { mkdirSync, readFileSync, rmSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../public/shots');
const SEQ = join(HERE, '../public/seq');
const URL = process.env.GAME_URL ?? 'http://localhost:4173/';
const FPS = 30;

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
const save = (name) => JSON.parse(gunzipSync(readFileSync(join(HERE, 'saves', `${name}.json.gz`))).toString('utf8'));

// A clock the capture advances by hand: requestAnimationFrame callbacks and performance.now()
// only move when __step() is called once frozen.
const CLOCK = `(() => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let frozen = false, vt = 0, queue = [];
  performance.now = () => (frozen ? vt : realNow());
  window.requestAnimationFrame = (cb) => { if (!frozen) return realRaf(cb); queue.push(cb); return queue.length; };
  window.__freeze = () => { vt = realNow(); frozen = true; };
  window.__step = (ms) => { vt += ms; const q = queue; queue = []; for (const cb of q) cb(vt); };
})();`;

async function open(saveName, fn, { mutate } = {}) {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
  page.on('pageerror', (e) => errors.push(saveName + ': ' + String(e)));
  await page.addInitScript(CLOCK);
  await page.goto(URL);
  const o = save(saveName);
  if (mutate) mutate(o);
  else o.modals = [];
  await page.evaluate((json) => localStorage.setItem('carfactycoon.save.v1', json), JSON.stringify(o));
  await page.reload();
  await page.getByRole('button', { name: 'Kaldığın yerden devam et' }).click();
  await page.waitForTimeout(500);
  // The "game paused" banner would sit on every shot.
  await page.addStyleTag({ content: '.pause-banner{display:none!important}' });
  await page.mouse.move(216, 420);
  await fn(page);
  await page.close();
}

const shot = (p, name) => p.screenshot({ path: `${OUT}/${name}.png` });
const nav = async (p, text) => {
  await p.locator('.nav-item', { hasText: text }).first().click();
  await p.waitForTimeout(400);
};
const center = (p, sel) => p.locator(sel).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
/** Sets a React-controlled range input. */
const setRange = (p, sel, value) =>
  p.locator(sel).first().evaluate((el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);

function seqDir(name) {
  const dir = join(SEQ, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}
const frameFile = (dir, i) => join(dir, `${String(i).padStart(4, '0')}.jpg`);

/** n frames of a canvas animation, 1/30 s apart on the virtual clock. */
async function clockFrames(p, name, n) {
  const dir = seqDir(name);
  await p.evaluate(() => window.__freeze());
  for (let i = 0; i < n; i++) {
    await p.evaluate((ms) => window.__step(ms), 1000 / FPS);
    await p.screenshot({ path: frameFile(dir, i), type: 'jpeg', quality: 88 });
  }
}

/** n frames of the page's CSS animations, seeked to 1/30 s steps from their start. */
async function cssFrames(p, name, n) {
  const dir = seqDir(name);
  await p.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
  for (let i = 0; i < n; i++) {
    await p.evaluate((t) => document.getAnimations().forEach((a) => (a.currentTime = t)), (i * 1000) / FPS);
    await p.screenshot({ path: frameFile(dir, i), type: 'jpeg', quality: 88 });
  }
  await p.evaluate(() => document.getAnimations().forEach((a) => a.play()));
}

const which = process.argv[2] ?? 'all';
const want = (k) => which === 'all' || which === k;

if (want('design')) {
  await open('save-design', async (p) => {
    await nav(p, 'Projeler');
    await p.locator('.card-item').first().click();
    await p.waitForTimeout(500);
    await shot(p, 'design-top');
    await p.getByRole('tab', { name: 'Motor' }).click();
    await p.waitForTimeout(400);
    await center(p, '.anim--engineBlock');
    await setRange(p, '.anim--engineBlock input[type=range]', 0.8);
    await p.waitForTimeout(600);
    await clockFrames(p, 'engine', 150);
    await p.getByRole('tab', { name: /Süspansiyon/ }).click();
    await p.waitForTimeout(500);
    await center(p, '[class*="anim--susp"], [class*="anim--Susp"]');
    await p.mouse.wheel(0, 60);
    await p.waitForTimeout(800);
    await clockFrames(p, 'susp', 150);
  });
}

if (want('launch')) {
  // The best-reviewed car of the 1928 save, shown as if just launched.
  await open(
    'promo-1928',
    async (p) => {
      await cssFrames(p, 'reveal', 60);
      await p.waitForTimeout(1800);
      await shot(p, 'reveal-crowd');
      await p.getByRole('button', { name: /Dergiler ne diyor/ }).click();
      // Reviews arrive one by one (0.4 s, then every 1.1 s).
      for (let i = 1; i <= 4; i++) {
        await p.waitForTimeout(i === 1 ? 900 : 1100);
        await shot(p, `review-${i}`);
      }
      await p.waitForTimeout(1200);
      await shot(p, 'review-final');
    },
    { mutate: (o) => (o.modals = [{ kind: 'launch', modelId: 'm745', venue: '1924 ABD Otomobil Fuarı' }]) },
  );
}

if (want('factory')) {
  await open('promo-1928', async (p) => {
    await nav(p, 'Fabrika');
    await p.waitForTimeout(800);
    await center(p, 'canvas');
    await p.waitForTimeout(800);
    await clockFrames(p, 'factory', 150);
  });
}

if (want('late')) {
  await open('promo-1928', async (p) => {
    await p.waitForTimeout(300);
    await shot(p, 'hq-1928');
    await nav(p, 'Ar-Ge');
    await p.waitForTimeout(300);
    await shot(p, 'research-top');
    await p.locator('.rrow-main').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await p.mouse.wheel(0, -60);
    await p.waitForTimeout(300);
    await shot(p, 'research');
    await nav(p, 'Merkez');
    await p.locator('.archive button, .archive a').first().scrollIntoViewIfNeeded().catch(() => {});
    await p.locator('.archive button, .archive a').first().click().catch(() => {});
    await p.waitForTimeout(900);
    await shot(p, 'paper');
    await p.mouse.wheel(0, 500);
    await p.waitForTimeout(300);
    await shot(p, 'paper-2');
  });
  await open(
    'promo-end',
    async (p) => {
      await p.waitForTimeout(800);
      await shot(p, 'score');
    },
    { mutate: (o) => (o.modals = [{ kind: 'gameOver' }]) },
  );
  await open(
    'promo-end',
    async (p) => {
      await nav(p, 'Şirket');
      await p.waitForTimeout(500);
      await shot(p, 'company');
    },
    {
      mutate: (o) => {
        o.modals = [];
        o.gameOver = undefined;
      },
    },
  );
}

console.log('errors', JSON.stringify(errors));
await browser.close();
