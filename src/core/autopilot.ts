import { finishDevelopment, finishTesting, startTooling, toolingQuote } from './actions';
import { suggestedLine } from './factory';
import { TESTS } from './testing';
import type { GameState, ModalItem, Project, ProjectPhase } from './types';
import { decide, log, pushModal } from './util';
import { t } from '../i18n';

// The steps of a project, once the company knows them. Its first two cars stop the clock at every
// step (the steps are being learnt); after that a finished step waits in a corner instead. A project
// can also go on by itself (Project.auto): once the design is signed off the engineers polish a
// little, build the prototypes and test as planned, and the dies are ordered in the standard grade for
// the car's natural line. Only the launch, where the price is set, waits for the player. When it
// cannot go on (no free line, not enough money) it stops, says why and hands the project back.

/** Cars out before a project's steps stop being pop-ups. */
export const SEASONED_AFTER = 2;
export const seasoned = (s: GameState) => s.models.length >= SEASONED_AFTER;

/** How far past the target the engineers polish before the prototypes are built. */
export const AUTO_POLISH = 1.1;

/** A finished step of a project: a pop-up, or a corner note once the company is seasoned. The launch always stops the clock. */
export function phaseNote(s: GameState, p: Project, phase: ProjectPhase) {
  pushModal(s, { kind: 'phase', projectId: p.id, phase, ...(phase !== 'production' && seasoned(s) ? { quiet: true } : {}) });
}

const isNoteOf = (m: ModalItem, p: Project) => m.kind === 'phase' && m.projectId === p.id && !!m.quiet;

/** The project went on by itself: one corner note per project, the latest. */
function autoNote(s: GameState, p: Project, phase: ProjectPhase) {
  s.modals = s.modals.filter((m) => !isNoteOf(m, p));
  pushModal(s, { kind: 'phase', projectId: p.id, phase, quiet: true, auto: true });
}

/** The project cannot go on by itself: stop the clock and hand it back to the player. */
function stuck(s: GameState, p: Project, why: 'line' | 'cash') {
  delete p.auto;
  s.modals = s.modals.filter((m) => !isNoteOf(m, p));
  log(s, why === 'line' ? t('{name}: kendiliğinden ilerleyemedi, boşta hat yok.', { name: p.name }) : t('{name}: kendiliğinden ilerleyemedi, kalıplara para yetmiyor.', { name: p.name }), 'warn');
  pushModal(s, { kind: 'phase', projectId: p.id, phase: 'testing', stuck: why });
}

/** Take the next step of a project that goes on by itself, when its current one is done. */
export function autoAdvance(s: GameState, p: Project) {
  if (!p.auto) return;
  if (p.phase === 'development') {
    if (p.dev.done >= p.dev.required * AUTO_POLISH && finishDevelopment(s, p.id).ok) autoNote(s, p, 'development');
    return;
  }
  if (p.phase === 'testing') {
    if (!TESTS.every((x) => p.tests[x.id].done >= p.tests[x.id].planned)) return;
    // A facelift reworks the dies of the car's own lines here; it needs the money now.
    if (!finishTesting(s, p.id).ok) return stuck(s, p, 'cash');
    if (p.productionReadyWeek !== undefined) return autoNote(s, p, 'testing');
  }
  if (p.phase === 'production' && p.productionReadyWeek === undefined) {
    const line = suggestedLine(s, p);
    if (!line) return stuck(s, p, 'line');
    const tier = p.tooling ?? 'standard';
    if (s.company.cash < toolingQuote(s, p, line.id, tier).cost) return stuck(s, p, 'cash');
    if (startTooling(s, p.id, line.id, tier).ok) autoNote(s, p, 'testing');
  }
}

/** Corner notes about a step the player has since taken (from the project screen) are no longer news. */
export function dropStaleNotes(s: GameState) {
  s.modals = s.modals.filter((m) => {
    if (m.kind !== 'phase' || !m.quiet || m.auto) return true;
    const p = s.projects.find((x) => x.id === m.projectId);
    return !!p && p.phase === m.phase;
  });
}

/** A new project goes on by itself if the player's last choice was so (and the company is seasoned). */
export const autoByDefault = (s: GameState): { auto?: true } => (seasoned(s) && s.flags.autoProjects ? { auto: true } : {});

/** Let a project go on by itself, or take it back. The choice carries over to the next projects. */
export function setProjectAuto(s: GameState, pid: string, on: boolean): { ok: true } | { ok: false; error: string } {
  const p = s.projects.find((x) => x.id === pid);
  if (!p) return { ok: false, error: t('Proje bulunamadı.') };
  if (p.phase === 'ready') return { ok: false, error: t('Araba hazır: lansmanı sen yaparsın.') };
  if (on) p.auto = true;
  else delete p.auto;
  s.flags.autoProjects = on ? 1 : 0;
  decide(s, 'auto:' + pid, `${p.name}: ${on ? 'kendiliğinden ilerlesin' : 'adımları oyuncu atar'}`);
  // A step already waiting is taken at once.
  if (on) {
    s.modals = s.modals.filter((m) => !(m.kind === 'phase' && m.projectId === pid && m.quiet));
    autoAdvance(s, p);
  }
  return { ok: true };
}
