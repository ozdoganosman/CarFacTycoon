import type { PostHog } from 'posthog-js';
import { finalScore } from '../core/game';
import { yearFloat } from '../core/time';
import type { GameState } from '../core/types';
import { playerId } from './collector';

// How people play the public build, in PostHog (EU region): the screens they visit,
// their key decisions, each year's result, how games end, errors, and session
// recordings. It starts only after the player agrees to share (the same yes as for
// playtests) and never on claude.ai. PostHog's own library loads only then.

export const POSTHOG_KEY = 'phc_uCR4WdnU86EJ4L3PRVkLXYiNmcwgbRU32r5XUH6oLKY9';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

type Props = Record<string, unknown>;

let ph: PostHog | null = null;
/** The latest screen and game, kept even before analytics runs so it can start from them. */
const current: { screen: string | null; game: GameState | null } = { screen: null, game: null };
let starting: Promise<void> | null = null;
let stopped = false;
const queue: [string, Props][] = [];

const onClaude = () => typeof window !== 'undefined' && !!(window as unknown as { claude?: unknown }).claude;

/** Whether analytics runs (or is starting) in this page. */
export const analyticsActive = () => !stopped && (ph !== null || starting !== null);

/** The player said yes: load PostHog and start sending. */
export function startAnalytics(): Promise<void> {
  stopped = false;
  if (ph) {
    ph.opt_in_capturing();
    ph.startSessionRecording();
    catchUp();
    return Promise.resolve();
  }
  if (starting) return starting;
  if (!POSTHOG_KEY || typeof window === 'undefined' || onClaude()) return Promise.resolve();
  starting = import('posthog-js')
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        ui_host: 'https://eu.posthog.com',
        // One id per browser, the same one the saved games carry.
        bootstrap: { distinctID: playerId() },
        person_profiles: 'always',
        persistence: 'localStorage',
        // The game is one page: screens are sent as page views by hand.
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: true,
        disable_surveys: true,
      });
      ph = posthog;
      if (stopped) return posthog.opt_out_capturing();
      for (const [event, props] of queue.splice(0)) posthog.capture(event, props);
      catchUp();
    })
    .catch(() => {
      starting = null;
    });
  return starting;
}

/** Where the player is right now (a paused game sends no updates by itself). */
function catchUp() {
  if (current.screen) trackScreen(current.screen);
  observeGame(current.game);
}

/** The player said no, or took the yes back. */
export function stopAnalytics() {
  stopped = true;
  queue.length = 0;
  lastScreen = null;
  seen = null;
  if (ph) {
    ph.stopSessionRecording();
    ph.opt_out_capturing();
  }
}

export function track(event: string, props: Props = {}) {
  if (stopped) return;
  if (ph) ph.capture(event, props);
  else if (starting) queue.push([event, props]);
}

let lastScreen: string | null = null;

/** A screen of the game, as a page view (so PostHog's web analytics and paths show it); repeats are skipped. */
export function trackScreen(screen: string) {
  current.screen = screen;
  if (!analyticsActive() || screen === lastScreen || typeof location === 'undefined') return;
  lastScreen = screen;
  track('$pageview', { $current_url: `${location.origin}${location.pathname}#${screen}`, screen });
}

// ---------------- what happens in the game ----------------

interface Seen {
  seed: number;
  // The newest entries already sent: both logs are trimmed at the front, so counting is not enough.
  lastDecision: object | null;
  lastError: object | null;
  year: number;
  over: boolean;
}
let seen: Seen | null = null;

const yearOf = (s: GameState) => Math.floor(yearFloat(s.week));

function glance(s: GameState) {
  return {
    game_year: yearOf(s),
    week: s.week,
    cash: Math.round(s.company.cash),
    reputation: Math.round(s.company.reputation),
    engineers: s.company.engineers,
    models_on_sale: s.models.filter((m) => m.status === 'active').length,
    projects: s.projects.length,
    lines: s.lines.length,
    hq: s.company.hq,
    difficulty: s.settings.difficulty ?? 'normal',
    engineer_mode: s.settings.engineerMode,
  };
}

/** The entries after `last` (all of them if nothing was sent yet; none if `last` is gone, i.e. the game was loaded again). */
function newSince<T extends object>(list: T[], last: object | null): T[] {
  if (list.at(-1) === last) return [];
  if (!last) return list;
  const i = list.lastIndexOf(last as T);
  return i < 0 ? [] : list.slice(i + 1);
}

/**
 * Called whenever the game changes: sends what is new since last time. Cheap when
 * nothing happened (a few comparisons), and silent until analytics runs.
 */
export function observeGame(s: GameState | null) {
  current.game = s;
  if (!s || !analyticsActive()) return;
  const decisions = s.decisions ?? [];
  const errors = s.errors ?? [];
  const year = yearOf(s);
  if (!seen || seen.seed !== s.seed) {
    track(s.week <= 1 ? 'game_started' : 'game_resumed', glance(s));
    seen = { seed: s.seed, lastDecision: decisions.at(-1) ?? null, lastError: errors.at(-1) ?? null, year, over: !!s.gameOver };
    return;
  }
  for (const d of newSince(decisions, seen.lastDecision)) {
    track('decision', { kind: d.key.split(':')[0], key: d.key, text: d.text, game_year: Math.floor(yearFloat(d.week)) });
  }
  seen.lastDecision = decisions.at(-1) ?? null;
  // An older save of the same game was loaded: pick up from there.
  if (year < seen.year) seen.year = year;
  if (!s.gameOver) seen.over = false;
  if (year > seen.year) {
    const y = s.years[s.years.length - 1];
    track('year_end', { ...glance(s), year: y?.year ?? year - 1, revenue: y ? Math.round(y.revenue) : null, profit: y ? Math.round(y.profit) : null, units: y ? Math.round(y.unitsSold) : null });
    seen.year = year;
  }
  for (const e of newSince(errors, seen.lastError)) track('game_error', { at: e.at, message: e.message, game_year: Math.floor(yearFloat(e.week)) });
  seen.lastError = errors.at(-1) ?? null;
  if (s.gameOver && !seen.over) {
    const score = s.gameOver.reason === 'end' ? finalScore(s) : null;
    track('game_over', { ...glance(s), reason: s.gameOver.reason, score: score?.total ?? null, tier: score?.tier ?? null, sales_rank: score?.rank ?? null });
    seen.over = true;
  }
}
