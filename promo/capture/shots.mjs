// Captures the game screens the promo is cut from, at phone size (432 x 768 CSS px at 2.5x = 1080 x 1920).
//
// Needs the app build served locally, which carries its own fonts (from the repo root: `npx vite build --mode app`,
// then `python3 -m http.server 5191 --directory dist-app`); GAME_URL points elsewhere.
// Usage: node capture/shots.mjs [all|design|launch|factory|map|rivals|late]
// Saves come from scripts/promo-saves.balance.ts (a smart-bot campaign on today's rules).
//
// Animations are captured frame by frame on a virtual clock (canvas scenes) or by seeking the CSS
// animations, so the sequences play back smoothly at 30 fps whatever the screenshot speed.
import { createRequire } from 'module';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../public/shots');
const SEQ = join(HERE, '../public/seq');
const URL = process.env.GAME_URL ?? 'http://localhost:5191/index.html';
// The engine-sound section imports the game's audio modules, so it needs the Vite dev server in app mode
// (from the repo root: `npx vite --mode app --port 5193`).
const DEV_URL = process.env.DEV_URL ?? 'http://localhost:5193/';
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

async function open(saveName, fn, { mutate, url = URL } = {}) {
  const page = await browser.newPage({ viewport: { width: 432, height: 768 }, deviceScaleFactor: 2.5 });
  page.on('pageerror', (e) => errors.push(saveName + ': ' + String(e)));
  await page.addInitScript(CLOCK);
  // No playtest collection: the consent question would sit on the headquarters screen.
  await page.route(/supabase\.co|posthog\.com|fonts\.googleapis|fonts\.gstatic/, (r) => r.abort());
  await page.goto(url);
  const o = save(saveName);
  if (mutate) mutate(o);
  else o.modals = [];
  await page.evaluate((json) => {
    localStorage.setItem('carfactycoon.save.v1', json);
    localStorage.setItem('carfactycoon.share', 'off');
  }, JSON.stringify(o));
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

/** The best-reviewed car on sale, shown as if just launched. */
const launchOf = (o) => {
  const best = o.models.filter((m) => m.status === 'active').sort((a, b) => b.reviewScore - a.reviewScore)[0];
  o.modals = [{ kind: 'launch', modelId: best.id, venue: `${Math.floor(1900 + best.launchWeek / 52)} ABD Otomobil Fuarı` }];
};

if (want('launch')) {
  // The best-reviewed car of the 1928 save, shown as if just launched.
  await open(
    'play-1928',
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
    { mutate: launchOf },
  );
}

if (want('factory')) {
  await open('play-1928', async (p) => {
    await nav(p, 'Fabrika');
    await p.waitForTimeout(800);
    await center(p, 'canvas');
    await p.waitForTimeout(800);
    await clockFrames(p, 'factory', 150);
  });
}

// The dealer map as the network grows, and how many states sell our cars at each moment.
if (want('map')) {
  const steps = [];
  for (const year of [1903, 1908, 1928]) {
    const name = `play-${year}`;
    const o = save(name);
    // States that sell our cars: those with a dealer, and the factory's own.
    const cities = { detroit: 'MI', cleveland: 'OH', chicago: 'IL', hartford: 'CT', newyork: 'NY', stlouis: 'MO', losangeles: 'CA' };
    const home = cities[o.company.city ?? 'detroit'];
    const states = Object.entries(o.network?.states ?? {}).filter(([id, n]) => n.dealers > 0 || id === home).length;
    steps.push({ year, states });
    await open(name, async (p) => {
      await nav(p, 'Harita');
      await p.waitForTimeout(700);
      await center(p, '.usmap');
      await p.waitForTimeout(300);
      await p.locator('.usmap').first().screenshot({ path: `${OUT}/map-${year}.png` });
    });
  }
  writeFileSync(join(HERE, '../src/map.json'), JSON.stringify(steps, null, 2) + '\n');
}

// A rival answers our lead; the board wants its growth and dividend.
if (want('rivals')) {
  await open(
    'play-1928-rival',
    async (p) => {
      await p.waitForTimeout(700);
      await shot(p, 'rival');
    },
    { mutate: () => {} },
  );
  await open('play-1928', async (p) => {
    await nav(p, 'Şirket');
    await p.waitForTimeout(500);
    await p.locator('.panel:has-text("Borsa ve yönetim kurulu")').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await p.waitForTimeout(300);
    await shot(p, 'board');
  });
}

if (want('sound')) {
  // The engine on the test stand, heard: idle, a blip, full throttle to the redline and past it (the
  // valves float, it misses and pops), then back to idle. The sound is the game's own engine voice
  // rendered offline for this design; the tachometer is moved frame by frame to the same revs.
  const SECS = 5;
  await open(
    'save-design',
    async (p) => {
      await nav(p, 'Projeler');
      await p.locator('.card-item').first().click();
      await p.waitForTimeout(500);
      await p.getByRole('tab', { name: 'Motor' }).click();
      await p.waitForTimeout(600);
      await center(p, '.engine-sound');
      await p.evaluate(() => window.scrollBy(0, 40));
      await p.waitForTimeout(300);
      const run = await p.evaluate(
        async ({ secs, fps }) => {
          const S = await import('/src/ui/audio/engineSound.ts');
          const V = await import('/src/ui/audio/engineVoice.ts');
          const spec = S.engineSound.spec;
          if (!spec) throw new Error('the engine sound panel has no design');
          const sr = 44100;
          const ctx = new OfflineAudioContext(2, Math.round(sr * secs), sr);
          const out = ctx.createGain();
          out.gain.setValueAtTime(0, 0);
          out.gain.linearRampToValueAtTime(1, 0.12);
          out.connect(ctx.destination);
          const voice = new S.EngineVoice(ctx, spec, out, 0);
          let seed = 1912;
          const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
          // Throttle: idle, a blip, idle, flat out into valve float, lift off.
          const pedal = (t) => (t < 0.8 ? 0 : t < 1.15 ? 1 : t < 1.8 ? 0 : t < 3.9 ? 1 : 0);
          const dt = 1 / 250;
          let rpm = spec.idle;
          let thr = 0;
          const frames = [];
          for (let i = 0; i * dt < secs; i++) {
            const t = i * dt;
            thr += (pedal(t) - thr) * (1 - Math.exp(-dt / 0.06));
            const r = V.stepRevs(spec, voice.tone, rpm, thr, dt, t, rnd);
            rpm = r.rpm;
            voice.set(t, { rpm, throttle: r.load, level: r.level, float: r.float });
            if (r.backfire) voice.backfire(t);
            while (frames.length <= t * fps) frames.push({ rpm, float: r.float, thr, gas: pedal(t) > 0 });
          }
          const buf = await ctx.startRendering();
          const a = buf.getChannelData(0);
          const b = buf.getChannelData(1);
          const pcm = new Int16Array(a.length * 2);
          let peak = 1e-6;
          for (let i = 0; i < a.length; i++) peak = Math.max(peak, Math.abs(a[i]), Math.abs(b[i]));
          const g = 0.95 / peak;
          for (let i = 0; i < a.length; i++) {
            pcm[2 * i] = Math.round(a[i] * g * 32767);
            pcm[2 * i + 1] = Math.round(b[i] * g * 32767);
          }
          let bin = '';
          const bytes = new Uint8Array(pcm.buffer);
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          return { frames, redline: spec.redline, knock: spec.knock, sr, pcm: btoa(bin) };
        },
        { secs: SECS, fps: FPS },
      );
      // The sound, as a WAV next to the soundtrack (audio/make_audio.py mixes it in).
      const pcm = Buffer.from(run.pcm, 'base64');
      const head = Buffer.alloc(44);
      head.write('RIFF', 0);
      head.writeUInt32LE(36 + pcm.length, 4);
      head.write('WAVEfmt ', 8);
      head.writeUInt32LE(16, 16);
      head.writeUInt16LE(1, 20);
      head.writeUInt16LE(2, 22);
      head.writeUInt32LE(run.sr, 24);
      head.writeUInt32LE(run.sr * 4, 28);
      head.writeUInt16LE(4, 32);
      head.writeUInt16LE(16, 34);
      head.write('data', 36);
      head.writeUInt32LE(pcm.length, 40);
      mkdirSync(join(HERE, '../public/audio'), { recursive: true });
      writeFileSync(join(HERE, '../public/audio/engine.wav'), Buffer.concat([head, pcm]));
      writeFileSync(join(HERE, '../src/sound.json'), JSON.stringify({ redline: run.redline, rpm: run.frames.map((f) => Math.round(f.rpm)) }) + '\n');
      // The panel as the live engine draws it, frame by frame.
      const dir = seqDir('sound');
      const n = SECS * FPS;
      for (let i = 0; i < n; i++) {
        const f = run.frames[Math.min(i, run.frames.length - 1)];
        await p.evaluate(
          ({ f, redline, knock }) => {
            const max = Math.ceil((redline * 1.2) / 1000) * 1000;
            document.querySelector('.engine-sound')?.classList.add('is-running');
            const needle = document.querySelector('.tacho svg g');
            if (needle) needle.style.transform = `rotate(${-120 + (Math.min(f.rpm, max) / max) * 240}deg)`;
            const ro = document.querySelector('.tacho-readout');
            if (ro) {
              ro.textContent = `${(Math.round(f.rpm / 10) * 10).toLocaleString('tr-TR')} d/d`;
              ro.classList.toggle('is-red', f.rpm >= redline * 0.97);
            }
            const start = document.querySelector('.engine-sound-buttons button');
            if (start) {
              start.textContent = '■ Durdur';
              start.className = 'btn btn-default';
            }
            const gas = document.querySelector('.engine-gas');
            if (gas) {
              gas.disabled = false;
              gas.style.background = f.gas ? 'var(--accent)' : '';
              gas.style.color = f.gas ? '#fff' : '';
            }
            const st = document.querySelector('.engine-sound-status');
            if (st) {
              let msg = '';
              let tone = '';
              if (f.float > 0.05) {
                msg = 'Supaplar yüzüyor! Kırmızı çizginin üstünde yaylar supapları kapatamıyor: güç düşer, motor tekler ve takırdar. Uzun tutarsan supaplar pistona çarpar.';
                tone = 'tone-bad';
              } else if (knock > 0 && f.thr > 0.4 && f.rpm < redline * 0.8) {
                msg = 'Vuruntu: sıkıştırma dönemin benzinine fazla, yükte silindirler metalik tıkırdıyor.';
                tone = 'tone-warn';
              }
              st.textContent = msg;
              st.className = `small engine-sound-status ${tone}`;
            }
          },
          { f, redline: run.redline, knock: run.knock },
        );
        await p.screenshot({ path: frameFile(dir, i), type: 'jpeg', quality: 88 });
      }
    },
    {
      url: DEV_URL,
      // A six in line with overhead valves: a fuller voice than the workshop's four.
      mutate: (o) => {
        o.modals = [];
        Object.assign(o.projects[0].design.engine, { cylinders: 6, layout: 'inline', bore: 82, stroke: 110, compression: 4.3, valvetrain: 'ohv' });
      },
    },
  );
}

if (want('late')) {
  await open('play-1928', async (p) => {
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
    'play-end',
    async (p) => {
      await p.waitForTimeout(800);
      await shot(p, 'score');
    },
    { mutate: (o) => (o.modals = [{ kind: 'gameOver' }]) },
  );
  await open(
    'play-end',
    async (p) => {
      await nav(p, 'Şirket');
      await p.waitForTimeout(500);
      await p.locator('.panel:has-text("Yarış takımı")').first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(300);
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
