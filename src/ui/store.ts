import { useSyncExternalStore } from 'react';
import { newGame, tick, type NewGameOptions } from '../core/game';
import { loadLocal, saveLocal } from '../core/save';
import { syncTick } from './claudeLink';
import { isBlockingModal, recordError } from '../core/util';
import type { ModalItem } from '../core/types';

/** After these the player has work to do, so the clock stays stopped once they are closed. */
const STAY_PAUSED = new Set<ModalItem['kind']>(['phase', 'launch', 'launchReport', 'gameOver', 'insolvency', 'stall']);
import type { GameState } from '../core/types';

// A tiny external store: the simulation mutates GameState in place and bumps a
// version number so React re-renders. The clock runs one game week per step.

export type Speed = 0 | 1 | 2 | 3;
const INTERVALS: Record<Exclude<Speed, 0>, number> = { 1: 900, 2: 400, 3: 150 };

export type Screen =
  | { id: 'hq' }
  | { id: 'projects' }
  | { id: 'research' }
  | { id: 'project'; projectId: string }
  | { id: 'models' }
  | { id: 'model'; modelId: string }
  | { id: 'factory' }
  | { id: 'markets' }
  | { id: 'finance' }
  | { id: 'company' }
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
  }

  notify() {
    this.version++;
    for (const l of this.listeners) l();
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
      this.showToast(r.error ?? 'Olmadı.', 'bad');
      return false;
    }
    if (success) this.showToast(success, 'good');
    return true;
  }

  showToast(text: string, tone: 'good' | 'bad' | 'info' = 'info') {
    const id = Date.now();
    this.toast = { text, tone, id };
    this.notify();
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
    this.notify();
  }

  /** The player's own choice of speed (also cancels a pending auto-resume). */
  setSpeed(speed: Speed) {
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
    this.showToast('Oyunda bir hata oluştu ve oyun durdu. Hata kaydedildi; Claude’a gönderilecek.', 'bad');
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
