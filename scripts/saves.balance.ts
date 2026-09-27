import { test } from 'vitest';
import { writeFileSync } from 'fs';
import { newGame, tick } from '../src/core/game';
import * as A from '../src/core/actions';
import { runBot, botStep } from './bot';
import { serialize } from '../src/core/save';

const OUT = process.env.SAVE_DIR ?? '/tmp';

test('generate an early launch save', () => {
  // The very first car of a new company, around 1901: who does it meet at the show?
  const s = newGame({ companyName: 'Öncü Motor', hq: 'usa', seed: 7 });
  for (let i = 0; i < 52 * 3 && !s.models.length; i++) {
    s.modals = [];
    botStep(s, { segments: ['family', 'city'] });
    tick(s);
  }
  s.modals = s.modals.filter((m) => m.kind === 'launch');
  writeFileSync(`${OUT}/save-early-launch.json`, serialize(s));
  console.log('early launch week', s.week, s.models.map((m) => m.name + ':' + m.segment).join(','), 'modals', s.modals.length);
});

test('generate a first project and a 1940 project', () => {
  // A brand-new company designing its first car: wide, green estimates.
  const s = newGame({ companyName: 'Öncü Motor', hq: 'usa', seed: 7 });
  s.modals = [];
  const r = A.startProject(s, { name: 'Model A', segment: 'family', targetPrice: 0 });
  if (!r.ok) throw new Error(r.error);
  writeFileSync(`${OUT}/save-novice.json`, serialize(s));
  // The same company in 1940, with a pickup project where diesel is on offer.
  const t = newGame({ companyName: 'Öncü Motor', hq: 'europe', seed: 8 });
  runBot(t, 52 * 40, { segments: ['family', 'city'], smart: true });
  t.modals = [];
  t.projects = [];
  const q = A.startProject(t, { name: 'Yük 40', segment: 'pickup', targetPrice: 0 });
  if (!q.ok) throw new Error(q.error);
  writeFileSync(`${OUT}/save-1940.json`, serialize(t));
});

test('generate saves', () => {
  const s = newGame({ companyName: 'Anadolu Motor', hq: 'usa', seed: 8 });
  runBot(s, 52 * 12 + 20, { segments: ['family', 'city'], smart: true });
  if (s.gameOver) throw new Error('fixture company went bankrupt');
  // A fresh project walked through the phases by hand.
  s.modals = [];
  const r = A.startProject(s, { name: 'Yıldız', segment: 'sport', targetPrice: 1500 });
  if (!r.ok) throw new Error(r.error);
  writeFileSync(`${OUT}/save-design.json`, serialize(s));
  const b = A.beginDevelopment(s, r.id);
  if (!b.ok) throw new Error(b.error);
  for (let i = 0; i < 200 && s.projects.find((p) => p.id === r.id)!.dev.done < s.projects.find((p) => p.id === r.id)!.dev.required * 1.05; i++) { tick(s); s.modals = []; }
  writeFileSync(`${OUT}/save-dev.json`, serialize(s));
  const f = A.finishDevelopment(s, r.id);
  if (!f.ok) throw new Error(f.error);
  for (let i = 0; i < 5; i++) { tick(s); s.modals = []; }
  writeFileSync(`${OUT}/save-testing.json`, serialize(s));
  A.finishTesting(s, r.id);
  writeFileSync(`${OUT}/save-production.json`, serialize(s));
  A.buyLine(s);
  const line = s.lines[s.lines.length - 1];
  for (const st of ['press_power', 'body_coach', 'paint_brush', 'asm_static'] as const) A.buyStation(s, line.id, st.startsWith('press') ? 'press' : st.startsWith('body') ? 'body' : st.startsWith('paint') ? 'paint' : 'assembly', st);
  // A screenshot fixture: make sure the tooling can be paid for.
  s.company.cash = Math.max(s.company.cash, 100000);
  const t = A.startTooling(s, r.id, line.id);
  if (!t.ok) throw new Error(t.error);
  for (let i = 0; i < 30 && s.projects.find((p) => p.id === r.id)!.phase !== 'ready'; i++) { tick(s); s.modals = []; }
  writeFileSync(`${OUT}/save-ready.json`, serialize(s));
  const l = A.launchModel(s, r.id, { price: 1500, markets: ['usa', 'europe'], autoShow: true });
  if (!l.ok) throw new Error(l.error);
  s.modals = s.modals.filter((m) => m.kind === 'launch');
  writeFileSync(`${OUT}/save-reviews.json`, serialize(s));
  s.modals = [];
  for (let i = 0; i < 4; i++) tick(s);
  s.modals = s.modals.filter((m) => m.kind === 'launchReport');
  writeFileSync(`${OUT}/save-report.json`, serialize(s));
  s.modals = [];
  for (let i = 0; i < 30; i++) { botStep(s, { segments: ['family', 'city'] }); tick(s); }
  s.modals = [{ kind: 'yearReport', year: s.years[s.years.length - 1].year }];
  writeFileSync(`${OUT}/save-mid.json`, serialize(s));
  console.log('week', s.week, 'models', s.models.map((m) => m.name + ':' + m.status).join(','), 'cash', Math.round(s.company.cash));
});
