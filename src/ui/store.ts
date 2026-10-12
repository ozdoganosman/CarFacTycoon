import { useSyncExternalStore } from 'react';
import { newGame, tick, type NewGameOptions } from '../core/game';
import { loadLocal, saveLocal } from '../core/save';
import { syncTick } from './claudeLink';
import { observeGame, trackScreen } from './analytics';
import { isBlockingModal, recordError } from '../core/util';
import { areaSeen, updateAreas, type Area } from '../core/guide';
import { LESSON_CHAPTERS, checkLessons, chapterProgress, lessonById, lessonProgress, noteUse, startLesson, type LessonAt } from '../core/lessons';
import { list, msg, t } from '../i18n';
import type { ModalItem } from '../core/types';

/**
 * After these the player has work to do, or has just made a big decision, so the clock stays stopped
 * once they are closed: at full speed a year could otherwise run by unnoticed after a historical event
 * or a recall. Only the explainer cards and unlock notes let the clock run on as it was.
 */
const STAY_PAUSED = new Set<ModalItem['kind']>(['phase', 'launch', 'launchReport', 'gameOver', 'insolvency', 'stall', 'event', 'recall', 'service']);
import type { GameState } from '../core/types';

// A tiny external store: the simulation mutates GameState in place and bumps a
// version number so React re-renders. The clock runs one game week per step.

export type Speed = 0 | 1 | 2 | 3;
const INTERVALS: Record<Exclude<Speed, 0>, number> = { 1: 900, 2: 400, 3: 150 };

/** The menu names of the screens that open on the way to the first car (as in Nav). */
const AREA_LABEL: Record<Area, string> = {
  research: msg('Ar-Ge'),
  finance: msg('Finans'),
  factory: msg('Fabrika'),
  markets: msg('Harita'),
  company: msg('Şirket'),
};

export type Screen =
  | { id: 'hq' }
  | { id: 'projects' }
  | { id: 'research' }
  | { id: 'project'; projectId: string; tab?: string }
  | { id: 'models' }
  | { id: 'model'; modelId: string; tab?: string }
  | { id: 'factory' }
  | { id: 'markets'; tab?: string }
  | { id: 'finance' }
  | { id: 'company'; tab?: string }
  | { id: 'cards' }
  | { id: 'settings' };

class GameStore {
  state: GameState | null = null;
  speed: Speed = 0;
  lastSpeed: Exclude<Speed, 0> = 1;
  screen: Screen = { id: 'hq' };
  toast: { text: string; tone: 'good' | 'bad' | 'info'; id: number } | null = null;
  /** Pending in-game confirmation (browser confirm() is not available everywhere). */
  question: { title: string; body: string; confirm: string; danger?: boolean; resolve: (ok: boolean) => void } | null = null;
  /** The newspaper issue open in the reader (not part of the saved game). */
  newsOpen: string | null = null;
  /**
   * A bubble beside a control, saying what to do there (a lesson, or a step of the first-car guide).
   * `meet`: the lesson only shows the place; reading it is enough. Not part of the saved game.
   */
  coach: { target?: string; title?: string; text: string; lessonId?: string; meet?: boolean; screen: Screen['id']; id: number } | null = null;
  version = 0;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private weeksSinceSave = 0;
  /** Speed to return to once the decision that stopped the clock is answered. */
  private resumeSpeed: Exclude<Speed, 0> | null = null;
  /** Speed to return to when the newspaper is closed. */
  private newsResume: Exclude<Speed, 0> | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  /** Reading the paper stops the clock; closing it carries on at the same speed. */
  openNews(id: string) {
    this.newsOpen = id;
    if (this.speed !== 0) {
      this.newsResume = this.speed;
      this.run(0);
    }
    this.notify();
  }

  closeNews() {
    this.newsOpen = null;
    const speed = this.newsResume;
    this.newsResume = null;
    if (speed && this.state && !this.state.gameOver && !this.state.modals.some(isBlockingModal)) this.run(speed);
    this.notify();
    // Putting the paper down is a natural break (src/ui/ads.ts decides whether it shows anything).
    void import('./ads').then((m) => m.ads.breakpoint());
  }

  notify() {
    // On the way to the first car the menu opens screen by screen (core/guide.ts).
    if (this.state) {
      const fresh = updateAreas(this.state);
      areaSeen(this.state, this.screen.id);
      if (fresh.length) this.setToast(t('Menüde yeni: {names}', { names: list(fresh.map((a) => t(AREA_LABEL[a]))) }), 'good');
      this.lessons(this.state);
    }
    this.version++;
    for (const l of this.listeners) l();
    // Only once the player has agreed to share (see analytics.ts); otherwise these return at once.
    trackScreen(this.state ? this.screen.id : 'start');
    observeGame(this.state);
  }

  /** Lessons the game shows done: a word for the one the player was doing, and for a chapter finished. */
  private lessons(s: GameState) {
    const complete = (id: number) => {
      const p = chapterProgress(s, id);
      return p.done === p.total;
    };
    const before = LESSON_CHAPTERS.filter((c) => complete(c.id)).map((c) => c.id);
    const fresh = checkLessons(s);
    if (!fresh.length) return;
    if (this.coach?.lessonId && fresh.includes(this.coach.lessonId)) this.coach = null;
    // An older save counts many at once: that is no news.
    if (fresh.length > 3) return;
    const chapter = LESSON_CHAPTERS.find((c) => !before.includes(c.id) && complete(c.id));
    if (chapter) {
      this.setToast(t('Usta defteri: “{chapter}” bölümü tamam. Unvanın: {tier}.', { chapter: t(chapter.name), tier: t(lessonProgress(s).tier) }), 'good');
      return;
    }
    const shown = fresh.map((id) => lessonById(id)!).filter((l) => !l.passive);
    if (shown.length) this.setToast(t('Ders tamam: {title}', { title: t(shown[shown.length - 1].title) }), 'good');
  }

  /**
   * Take the player to a place and point at a control there: the screen (and tab) first, then, once it
   * has drawn, the control scrolled into view with a pulse and the bubble beside it.
   */
  point(at: LessonAt, bubble?: { title?: string; text: string; lessonId?: string; meet?: boolean }) {
    const sc = this.screen;
    const place = at.place as Screen;
    const same = sc.id === place.id && JSON.stringify(sc) === JSON.stringify(place);
    if (!same) this.go(place);
    if (bubble?.lessonId && this.state) startLesson(this.state, bubble.lessonId);
    this.coach = bubble ? { ...bubble, target: at.target, screen: place.id, id: Date.now() } : null;
    this.notify();
    // After the screen (and a tab) has drawn.
    setTimeout(() => {
      const el = findTarget(at.target);
      if (!el) return;
      // A tall panel shows from its top (its title), a button sits in the middle of the screen.
      el.scrollIntoView({ behavior: 'smooth', block: el.offsetHeight > window.innerHeight * 0.5 ? 'start' : 'center' });
      el.classList.remove('guide-pulse');
      void el.offsetWidth;
      el.classList.add('guide-pulse');
      setTimeout(() => el.classList.remove('guide-pulse'), 2600);
      this.notify();
    }, 120);
  }

  closeCoach() {
    this.coach = null;
    this.notify();
  }

  start(opts: NewGameOptions) {
    this.state = newGame(opts);
    this.screen = { id: 'hq' };
    this.setSpeed(0);
    this.save();
    this.notify();
  }

  load(state: GameState) {
    this.state = state;
    this.screen = { id: 'hq' };
    this.setSpeed(0);
    this.notify();
  }

  loadSaved(): boolean {
    const s = loadLocal();
    if (!s) return false;
    this.load(s);
    return true;
  }

  quit() {
    this.save();
    this.setSpeed(0);
    this.state = null;
    this.notify();
  }

  save() {
    if (this.state) saveLocal(this.state);
    this.weeksSinceSave = 0;
  }

  /** Run a mutation against the game state, then re-render. */
  act<T>(fn: (s: GameState) => T): T | undefined {
    if (!this.state) return undefined;
    let r: T;
    try {
      r = fn(this.state);
    } catch (e) {
      this.fail('action', e);
      return undefined;
    }
    // The decision that stopped the clock has been answered: carry on.
    if (this.resumeSpeed && !this.state.gameOver && !this.state.modals.some(isBlockingModal)) {
      const speed = this.resumeSpeed;
      this.resumeSpeed = null;
      this.run(speed);
    }
    this.notify();
    return r;
  }

  /** Run an action returning {ok, error}; shows the error as a toast. */
  try(fn: (s: GameState) => { ok: boolean; error?: string } | undefined, success?: string): boolean {
    const r = this.act(fn);
    if (r && !r.ok) {
      this.showToast(r.error ?? t('Olmadı.'), 'bad');
      return false;
    }
    if (success) this.showToast(success, 'good');
    return true;
  }

  showToast(text: string, tone: 'good' | 'bad' | 'info' = 'info') {
    this.setToast(text, tone);
    this.notify();
  }

  private setToast(text: string, tone: 'good' | 'bad' | 'info') {
    const id = Date.now();
    this.toast = { text, tone, id };
    setTimeout(() => {
      if (this.toast?.id === id) {
        this.toast = null;
        this.notify();
      }
    }, 3200);
  }

  ask(q: { title: string; body: string; confirm: string; danger?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      this.question = {
        ...q,
        resolve: (ok) => {
          this.question = null;
          this.notify();
          resolve(ok);
        },
      };
      this.notify();
    });
  }

  go(screen: Screen) {
    this.screen = screen;
    // The bubble belongs to the screen it points at.
    if (this.coach && this.coach.screen !== screen.id) this.coach = null;
    this.notify();
  }

  /** The player goes on to work that needs the clock stopped (a project screen): forget any pending auto-resume. */
  keepPaused() {
    this.resumeSpeed = null;
    this.newsResume = null;
    if (this.speed !== 0) this.run(0);
  }

  /** A full-screen advertisement: stop the clock, and start it again as it was once it is gone. */
  pauseFor(): () => void {
    const speed = this.speed;
    if (speed !== 0) this.run(0);
    return () => {
      const s = this.state;
      if (speed !== 0 && this.speed === 0 && s && !s.gameOver && !this.newsOpen && !s.modals.some(isBlockingModal)) this.run(speed);
    };
  }

  /** The player's own choice of speed (also cancels a pending auto-resume). */
  setSpeed(speed: Speed) {
    if (speed === 3 && this.state) noteUse(this.state, 'speed3');
    this.resumeSpeed = null;
    this.newsResume = null;
    this.run(speed);
  }

  private run(speed: Speed) {
    this.speed = speed;
    if (speed !== 0) this.lastSpeed = speed;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (speed !== 0) this.timer = setInterval(() => this.step(), INTERVALS[speed]);
    this.notify();
  }

  /** Stop the clock for a decision, remembering how fast it was running (unless the player has work to do next). */
  private holdForDecision() {
    if (this.speed === 0) return;
    const stay = this.state?.modals.some((m) => isBlockingModal(m) && STAY_PAUSED.has(m.kind));
    this.resumeSpeed = stay ? null : this.speed;
    this.run(0);
  }

  /** Something broke: stop the clock, keep the error for the bug report and tell the player. */
  fail(at: string, e: unknown) {
    console.error(e);
    if (this.state) {
      recordError(this.state, at, e);
      syncTick(this.state);
    }
    this.resumeSpeed = null;
    this.run(0);
    this.showToast(t('Oyunda bir hata oluştu ve oyun durdu. Hata kaydedildi; Claude’a gönderilecek.'), 'bad');
  }

  togglePause() {
    this.setSpeed(this.speed === 0 ? this.lastSpeed : 0);
  }

  step() {
    const s = this.state;
    if (!s) return;
    if (s.gameOver) {
      this.setSpeed(0);
      return;
    }
    // Decisions pause the clock; the year report only waits in a corner.
    if (s.modals.some(isBlockingModal)) {
      this.holdForDecision();
      return;
    }
    try {
      tick(s);
    } catch (e) {
      this.fail('tick', e);
      return;
    }
    this.weeksSinceSave++;
    if (this.weeksSinceSave >= 13) this.save();
    syncTick(s);
    if (s.gameOver) this.setSpeed(0);
    else if (s.modals.some(isBlockingModal)) this.holdForDecision();
    this.notify();
  }
}

export const store = new GameStore();

/** The first control on screen among 'a|b|c' (data-guide), or none. */
export function findTarget(target?: string): HTMLElement | null {
  if (!target || typeof document === 'undefined') return null;
  for (const id of target.split('|')) {
    for (const el of document.querySelectorAll<HTMLElement>(`[data-guide="${id}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) return el;
    }
  }
  return null;
}

/** Re-render on every store change; returns the (mutable) game state. */
export function useGame(): { state: GameState | null; version: number } {
  const version = useSyncExternalStore(store.subscribe, store.getVersion);
  return { state: store.state, version };
}

export function useGameState(): GameState {
  useSyncExternalStore(store.subscribe, store.getVersion);
  if (!store.state) throw new Error('No game in progress');
  return store.state;
}
