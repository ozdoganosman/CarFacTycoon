import { describe, expect, it } from 'vitest';
import * as A from '../src/core/actions';
import { SEASONED_AFTER, setProjectAuto } from '../src/core/autopilot';
import { CHAPTERS, chapterOf, goalStatus, goalsMet } from '../src/core/goals';
import { finalScore, newGame, tick } from '../src/core/game';
import { deserialize, serialize } from '../src/core/save';
import { weekFor } from '../src/core/time';
import { isBlockingModal } from '../src/core/util';
import { costIndex } from '../src/data/economy';
import type { GameState, ModalItem } from '../src/core/types';
import { runBot } from '../scripts/bot';

// The campaign's shape: a project's steps stop the clock only while the company learns them, a project
// can go on by itself up to the launch, and each decade has three goals that count in the score.

/** A company with two cars out (the bot plays it) and nothing on the drawing board. */
function seasonedCompany() {
  const s = newGame({ companyName: 'Test', hq: 'usa', seed: 5 });
  s.week = weekFor(1912, 0);
  s.modals = [];
  s.company.cash = 3e5 * costIndex(1912);
  for (let i = 0; i < 52 * 8 && s.models.length < SEASONED_AFTER; i++) runBot(s, 1, { segments: ['family', 'city'] });
  expect(s.models.length).toBeGreaterThanOrEqual(SEASONED_AFTER);
  s.modals = [];
  s.projects = [];
  s.company.cash = 1e9;
  return s;
}

function newProject(s: GameState) {
  const r = A.startProject(s, { name: 'Yeni', segment: 'family', targetPrice: 0 });
  if (!r.ok) throw new Error(r.error);
  return s.projects.find((p) => p.id === r.id)!;
}

const phaseNotes = (s: GameState, pid: string) => s.modals.filter((m): m is Extract<ModalItem, { kind: 'phase' }> => m.kind === 'phase' && m.projectId === pid);

describe('the steps of a project', () => {
  it('stop the clock for the first cars, and wait in a corner after', () => {
    const fresh = newGame({ companyName: 'Test', hq: 'usa', seed: 5 });
    fresh.modals = [];
    const first = newProject(fresh);
    expect(A.beginDevelopment(fresh, first.id).ok).toBe(true);
    first.dev.done = first.dev.required - 1e-6;
    tick(fresh);
    const pop = phaseNotes(fresh, first.id)[0];
    expect(pop?.phase).toBe('development');
    expect(isBlockingModal(pop)).toBe(true);

    const s = seasonedCompany();
    const p = newProject(s);
    expect(A.beginDevelopment(s, p.id).ok).toBe(true);
    p.dev.done = p.dev.required - 1e-6;
    tick(s);
    const note = phaseNotes(s, p.id)[0];
    expect(note?.quiet).toBe(true);
    expect(isBlockingModal(note)).toBe(false);
    // Taken from the project screen instead: the note is no longer news.
    expect(A.finishDevelopment(s, p.id).ok).toBe(true);
    tick(s);
    expect(phaseNotes(s, p.id).some((m) => m.phase === 'development')).toBe(false);
  });

  it('can go on by itself up to the launch, and the third car’s first report waits in a corner', () => {
    const s = seasonedCompany();
    expect(A.buyLine(s).ok).toBe(true);
    const p = newProject(s);
    expect(setProjectAuto(s, p.id, true).ok).toBe(true);
    expect(A.beginDevelopment(s, p.id).ok).toBe(true);
    for (let i = 0; i < 52 * 4 && p.phase !== 'ready'; i++) tick(s);
    expect(p.phase).toBe('ready');
    // It ordered standard dies for the free line, and only the launch stopped the clock.
    expect(p.tooling).toBe('standard');
    expect(p.lineId).toBeDefined();
    const notes = phaseNotes(s, p.id);
    expect(notes.filter((m) => isBlockingModal(m)).map((m) => m.phase)).toEqual(['production']);
    // The next project goes on by itself too: the choice carries over.
    expect(newProject(s).auto).toBe(true);
    s.projects = s.projects.filter((x) => x.id === p.id);

    s.modals = [];
    const r = A.launchModel(s, p.id, { price: 1000 * costIndex(1914), markets: ['usa'], autoShow: false });
    if (!r.ok) throw new Error(r.error);
    for (let i = 0; i < 8 && !s.modals.some((m) => m.kind === 'launchReport'); i++) tick(s);
    const report = s.modals.find((m) => m.kind === 'launchReport')!;
    expect(report).toBeDefined();
    expect(isBlockingModal(report)).toBe(false);
  });

  it('stops and hands the project back when there is no line to tool', () => {
    const s = seasonedCompany();
    const p = newProject(s);
    // Every line builds a car on sale: nothing free.
    expect(s.lines.every((l) => s.models.some((m) => m.id === l.modelId && m.status === 'active'))).toBe(true);
    expect(setProjectAuto(s, p.id, true).ok).toBe(true);
    expect(A.beginDevelopment(s, p.id).ok).toBe(true);
    for (let i = 0; i < 52 * 4 && p.phase !== 'production'; i++) tick(s);
    expect(p.phase).toBe('production');
    expect(p.auto).toBeUndefined();
    const stuck = phaseNotes(s, p.id).find((m) => m.stuck);
    expect(stuck?.stuck).toBe('line');
    expect(isBlockingModal(stuck!)).toBe(true);
  });
});

describe('the decade goals', () => {
  it('chapters cover the campaign, three goals each; 1960 belongs to the fifties', () => {
    expect(CHAPTERS.map((c) => c.decade)).toEqual([1900, 1910, 1920, 1930, 1940, 1950]);
    expect(CHAPTERS.every((c) => c.goals.length === 3)).toBe(true);
    expect(new Set(CHAPTERS.flatMap((c) => c.goals.map((g) => g.id))).size).toBe(18);
    expect(chapterOf(1905).decade).toBe(1900);
    expect(chapterOf(1960).decade).toBe(1950);
  });

  it('are met once, count in the score, and keep in a save', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 6 });
    expect(goalsMet(s).met).toBe(0);
    for (let i = 0; i < 52 * 3 && !s.goals?.done['first-car']; i++) runBot(s, 1, { segments: ['family'] });
    expect(s.goals?.done['first-car']).toBeDefined();
    expect(goalStatus(s).find((g) => g.id === 'first-car')?.done).toBe(true);
    const score = finalScore(s);
    const part = score.parts[score.parts.length - 1];
    expect(part.points).toBe(10 * goalsMet(s).met);
    expect(part.max).toBe(180);
    expect(deserialize(serialize(s)).goals?.done['first-car']).toBe(s.goals!.done['first-car']);
  });

  it('a new decade prints its chapter: the three goals and the last decade’s report card', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 6 });
    for (let i = 0; i < 52 * 3 && !s.goals?.done['first-car']; i++) runBot(s, 1, { segments: ['family'] });
    s.modals = [];
    s.week = weekFor(1910, 0) - 1;
    tick(s);
    const paper = s.news?.find((n) => n.kind === 'chapter');
    expect(paper).toBeDefined();
    expect(paper!.side).toHaveLength(3);
    expect(paper!.lead.paragraphs?.some((x) => x.startsWith('✓'))).toBe(true);
    expect(s.modals.some((m) => m.kind === 'news' && m.newsId === paper!.id)).toBe(true);
    expect(s.goals?.chapters[1910]).toBeDefined();
  });

  it('a goal counting the decade’s own work starts from what the company had', () => {
    const s = newGame({ companyName: 'Test', hq: 'usa', seed: 6 });
    s.acquired = ['old'];
    s.week = weekFor(1930, 0) - 1;
    s.modals = [];
    tick(s);
    expect(goalStatus(s).find((g) => g.id === 'buy-rival')?.done).toBe(false);
    s.acquired.push('new');
    // Goals are looked at once a month.
    for (let i = 0; i < 5; i++) tick(s);
    expect(goalStatus(s).find((g) => g.id === 'buy-rival')?.done).toBe(true);
  });
});
