import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { setProjectAuto } from '../src/core/autopilot';
import { newGame, tick } from '../src/core/game';
import { guideStep } from '../src/core/guide';
import {
  LESSONS,
  LESSON_CHAPTERS,
  LESSON_GAP,
  checkLessons,
  guideLessons,
  lessonDone,
  lessonOpen,
  noteUse,
  offeredLesson,
  readLesson,
  skipLesson,
  startLesson,
} from '../src/core/lessons';
import { setRacingLevel } from '../src/core/racing';
import { researchDefs } from '../src/core/research';
import { deserialize, serialize } from '../src/core/save';
import { weekFor, yearFloat } from '../src/core/time';
import { FOCUS_KEYS } from '../src/core/development';
import { TESTS } from '../src/core/testing';
import type { GameState } from '../src/core/types';
import { runBot } from '../scripts/bot';

// The master's notebook (src/core/lessons.ts): a lesson for each thing the game lets a player do, done
// when the player has done it (read from the game), offered one at a time a few weeks apart.

/** A company with its first car out (the bot plays it), nothing on the drawing board. */
function withCar(): GameState {
  const s = newGame({ companyName: 'Test', hq: 'usa', seed: 12 });
  for (let i = 0; i < 52 * 5 && s.models.length === 0; i++) runBot(s, 1, { segments: ['family'] });
  expect(s.models).toHaveLength(1);
  s.projects = [];
  s.modals = [];
  s.company.cash = 1e7;
  return s;
}
const base = withCar();
const copy = (s: GameState) => deserialize(serialize(s));

function project(s: GameState, phase: GameState['projects'][number]['phase'] = 'design') {
  const r = A.startProject(s, { name: 'Yeni', segment: 'family', targetPrice: 0 });
  if (!r.ok) throw new Error(r.error);
  const p = s.projects.find((x) => x.id === r.id)!;
  p.phase = phase;
  return p;
}

/** For each lesson, the player's own way of doing it (meet lessons: reading them). */
const HOW: Record<string, (s: GameState) => void> = {
  project: (s) => project(s),
  sound: (s) => noteUse(s, 'sound'),
  paint: (s) => expect(A.setProjectPaint(s, project(s).id, undefined).ok).toBe(true),
  priorities: (s) => A.togglePriority(s, project(s).id, FOCUS_KEYS[0]),
  develop: (s) => expect(A.beginDevelopment(s, project(s).id).ok).toBe(true),
  prototypes: (s) => {
    const p = project(s, 'development');
    p.dev.done = p.dev.required;
    expect(A.finishDevelopment(s, p.id).ok).toBe(true);
  },
  testplan: (s) => expect(A.setTestPlan(s, project(s, 'testing').id, TESTS[0].id, 6).ok).toBe(true),
  tooling: (s) => expect(A.startTooling(s, project(s, 'production').id, s.lines[0].id, 'soft').ok).toBe(true),
  price: (s) => noteUse(s, 'priceGuide'),
  launch: () => undefined,
  why: (s) => readLesson(s, 'why'),
  'price-change': (s) => A.setModelPrice(s, s.models[0].id, s.models[0].price + 10),
  capacity: (s) => readLesson(s, 'capacity'),
  network: (s) => readLesson(s, 'network'),
  ads: (s) => A.setAdLevel(s, 2),
  research: (s) => {
    // In 1900 everything there is, is known: a few years on there is something to research.
    s.week = weekFor(1908, 0);
    const yf = yearFloat(s.week);
    const def = researchDefs().find((d) => d.year <= yf && !s.research?.known.includes(d.id))!;
    expect(A.queueResearch(s, def.id).ok).toBe(true);
  },
  lab: (s) => expect(A.setLabShare(s, 0.25).ok).toBe(true),
  money: (s) => readLesson(s, 'money'),
  second: (s) => project(s),
  parts: (s) => expect(A.setSupplier(s, project(s, 'production').id, 'engine', 'cheap').ok).toBe(true),
  line: (s) => expect(A.buildWorkshopLine(s, s.models[0].id).ok).toBe(true),
  bottleneck: (s) => expect(A.setLineNightShift(s, s.lines[0].id, true).ok).toBe(true),
  hire: (s) => expect(A.hireEngineers(s, 1).ok).toBe(true),
  org: (s) => readLesson(s, 'org'),
  platform: (s) => expect(A.setProjectPlatform(s, project(s).id, s.platforms[0].id).ok).toBe(true),
  auto: (s) => {
    s.models.push({ ...s.models[0], id: 'second' });
    expect(setProjectAuto(s, project(s).id, true).ok).toBe(true);
  },
  refresh: (s) => expect(A.startFacelift(s, s.models[0].id).ok).toBe(true),
  renew: (s) => expect(A.modernizeLine(s, s.lines[0].id, false).ok).toBe(true),
  retire: (s) => A.retireModel(s, s.models[0].id),
  poster: (s) => readLesson(s, 'poster'),
  recall: (s) => noteUse(s, 'recall'),
  racing: (s) => {
    s.week = weekFor(1907, 0);
    expect(setRacingLevel(s, 1).ok).toBe(true);
  },
  board: (s) => readLesson(s, 'board'),
  plants: (s) => readLesson(s, 'plants'),
  buyers: (s) => expect(A.marketResearch(s, 'family').ok).toBe(true),
  acquire: (s) => readLesson(s, 'acquire'),
  wages: (s) => s.firedEvents.push('five_dollar'),
  military: (s) => {
    s.flags.militaryUntil = yearFloat(s.week) + 2;
    expect(A.setLineMilitary(s, s.lines[0].id, true).ok).toBe(true);
  },
  crash: (s) => readLesson(s, 'crash'),
  rivals: (s) => readLesson(s, 'rivals'),
  suv: (s) => readLesson(s, 'suv'),
  techcenter: (s) => readLesson(s, 'techcenter'),
  twotone: (s) => {
    s.week = weekFor(1951, 0);
    expect(A.setProjectPaint(s, project(s).id, 'black', 'black').ok).toBe(true);
  },
  speed: (s) => noteUse(s, 'speed3'),
  cards: (s) => readLesson(s, 'cards'),
  save: (s) => readLesson(s, 'save'),
  engineer: (s) => readLesson(s, 'engineer'),
  feedback: (s) => readLesson(s, 'feedback'),
};

describe('the master’s notebook', () => {
  it('has a lesson for each thing, in chapters, each id once', () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
    expect(LESSONS.length).toBeGreaterThanOrEqual(45);
    for (const c of LESSON_CHAPTERS) expect(LESSONS.some((l) => l.chapter === c.id)).toBe(true);
    expect(LESSONS.every((l) => LESSON_CHAPTERS.some((c) => c.id === l.chapter))).toBe(true);
    expect(Object.keys(HOW).sort()).toEqual(LESSONS.map((l) => l.id).sort());
  });

  it('every lesson is done by doing what it asks', () => {
    for (const l of LESSONS) {
      const s = copy(base);
      checkLessons(s);
      if (lessonDone(s, l.id)) continue; // the first car's own steps
      HOW[l.id](s);
      checkLessons(s);
      expect(lessonDone(s, l.id), l.id).toBe(true);
    }
  });

  it('a played game counts what it already did, and an older save too', () => {
    const s = copy(base);
    const fresh = checkLessons(s);
    for (const id of ['project', 'develop', 'prototypes', 'tooling', 'launch']) expect(fresh).toContain(id);
    // A save from before the notebook: what it used is rebuilt from its decisions.
    const old = copy(base);
    delete old.used;
    delete old.lessons;
    const loaded = deserialize(serialize(old));
    expect(loaded.used?.dev).toBeDefined();
    checkLessons(loaded);
    expect(lessonDone(loaded, 'launch')).toBe(true);
  });

  it('offers one lesson at a time, a few weeks after the last one, and the player can skip or pick any', () => {
    const s = copy(base);
    checkLessons(s);
    // Just done with the first car: a pause first.
    s.lessons!.lastWeek = s.week;
    expect(offeredLesson(s)).toBeUndefined();
    s.week += LESSON_GAP;
    const first = offeredLesson(s)!;
    expect(first.chapter).toBe(2);
    expect(first.where(s)).not.toBeNull();
    skipLesson(s, first.id);
    expect(offeredLesson(s)).toBeUndefined();
    s.week += LESSON_GAP;
    const next = offeredLesson(s)!;
    expect(next.id).not.toBe(first.id);
    // From the notebook: any open lesson, right away.
    startLesson(s, 'lab');
    expect(offeredLesson(s)?.id).toBe('lab');
    A.setLabShare(s, 0.1);
    checkLessons(s);
    expect(s.lessons!.active).toBeUndefined();
    expect(offeredLesson(s)).toBeUndefined();
    // Switched off: nothing on offer (the notebook still has them).
    s.week += LESSON_GAP;
    s.settings.lessons = false;
    expect(offeredLesson(s)).toBeUndefined();
  });

  it('lessons wait for their year and their feature', () => {
    const s = copy(base);
    const byId = (id: string) => LESSONS.find((l) => l.id === id)!;
    expect(lessonOpen(s, byId('racing'))).toBe(false);
    expect(lessonOpen(s, byId('parts'))).toBe(false);
    expect(lessonOpen(s, byId('recall'))).toBe(false);
    s.week = weekFor(1906, 6);
    expect(lessonOpen(s, byId('racing'))).toBe(true);
    project(s, 'production');
    expect(lessonOpen(s, byId('parts'))).toBe(true);
  });

  it('the first car’s steps show their small lessons on the guide’s bar', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 3 });
    s.modals = [];
    const p = project(s);
    expect(guideStep(s)?.kind).toBe('design');
    expect(guideLessons(s, 'design').map((l) => l.id)).toEqual(['paint', 'sound', 'priorities']);
    A.setProjectPaint(s, p.id, undefined);
    checkLessons(s);
    expect(lessonDone(s, 'paint')).toBe(true);
    expect(guideLessons(s, 'design').map((l) => l.id)).toContain('paint');
    expect(A.beginDevelopment(s, p.id).ok).toBe(true);
    tick(s);
    expect(guideLessons(s, 'development').map((l) => l.id)).toEqual(['priorities']);
  });
});
