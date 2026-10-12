import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { guideStep } from '../../core/guide';
import {
  LESSONS,
  LESSON_CHAPTERS,
  chapterProgress,
  lessonDone,
  lessonOpen,
  lessonProgress,
  lessonsOn,
  offeredLesson,
  readLesson,
  setLessonsOn,
  skipLesson,
  type Lesson,
} from '../../core/lessons';
import { yearFloat } from '../../core/time';
import type { GameState } from '../../core/types';
import { t } from '../../i18n';
import { track } from '../analytics';
import { tx } from '../i18n';
import { findTarget, store, useGameState } from '../store';
import { Icon } from './Icon';
import { Button, Panel, Progress, Toggle } from './ui';

// The master's notebook on screen (core/lessons.ts): the lesson on offer on a slim bar above every
// screen, a bubble beside the control a lesson points at, and the notebook itself on HQ.

/** Take the player to a lesson's place and say there what to do. */
export function showLesson(s: GameState, l: Lesson) {
  const at = l.where(s);
  if (!at) return;
  store.point(at, { title: l.title, text: l.text, lessonId: l.id, meet: l.kind === 'meet' });
}

/** The lesson on offer, on a slim bar (not while the first car's guide has the top of the screen). */
export function LessonBar() {
  const s = useGameState();
  const l = guideStep(s) ? undefined : offeredLesson(s);
  const id = l?.id;
  useEffect(() => {
    if (id) track('lesson_shown', { lesson: id, chapter: l?.chapter });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!l) return null;
  const chapter = LESSON_CHAPTERS.find((c) => c.id === l.chapter)!;
  return (
    <div className="lesson-bar" role="status">
      <Icon name="scroll" size={20} className="lesson-icon" />
      <span className="lesson-text">
        <span className="lesson-chapter">{t('Usta defteri · {chapter}', { chapter: t(chapter.name) })}</span>
        <b>{t(l.title)}</b>
      </span>
      <span className="lesson-btns">
        <Button kind="primary" small onClick={() => showLesson(s, l)}>
          {l.kind === 'meet' ? t('Göster') : t('Nasıl?')}
        </Button>
        <Button kind="ghost" small onClick={() => store.act((st) => skipLesson(st, l.id))}>
          {t('Atla')}
        </Button>
      </span>
    </div>
  );
}

/** The small lessons of the first car's current step, as chips on the guide's bar. */
export function LessonChips({ lessons }: { lessons: Lesson[] }) {
  const s = useGameState();
  if (!lessons.length) return null;
  return (
    <div className="lesson-chips">
      <span className="muted small">{t('Bu adımda dene:')}</span>
      {lessons.map((l) => {
        const done = lessonDone(s, l.id);
        return (
          <button key={l.id} type="button" className={`lesson-chip ${done ? 'is-done' : ''}`} onClick={() => showLesson(s, l)}>
            <Icon name={done ? 'check' : 'sparkle'} /> {t(l.title)}
          </button>
        );
      })}
    </div>
  );
}

/** Close the bubble; a meet lesson has been read by then. */
function closeCoach() {
  const c = store.coach;
  if (c?.meet && c.lessonId) store.act((st) => readLesson(st, c.lessonId!));
  store.closeCoach();
}

/** The bubble beside the control a lesson (or the guide) points at; it follows the control as the page scrolls. */
export function CoachMark() {
  const s = useGameState();
  const c = store.coach;
  const tip = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; below: boolean } | null>(null);
  const [tick, setTick] = useState(0);

  // Follow the control: scrolling, resizing, and the page settling after the pointer moved it.
  useEffect(() => {
    if (!c) return;
    const again = () => setTick((n) => n + 1);
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    const timer = setInterval(again, 400);
    return () => {
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
      clearInterval(timer);
    };
  }, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // The control being pointed at keeps a frame while the bubble is open; touching it closes the bubble
  // (it may appear only once the screen has drawn, so it is looked for again as the bubble follows it).
  const marked = useRef<HTMLElement | null>(null);
  const unmark = () => {
    marked.current?.classList.remove('coach-target');
    marked.current?.removeEventListener('click', closeCoach);
    marked.current = null;
  };
  useEffect(() => unmark, [c?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!c || !tip.current) return setPos(null);
    const width = Math.min(340, window.innerWidth - 24);
    const h = tip.current.offsetHeight;
    const el = findTarget(c.target);
    if (el !== marked.current) {
      unmark();
      if (el) {
        el.classList.add('coach-target');
        el.addEventListener('click', closeCoach);
        marked.current = el;
      }
    }
    if (!el) {
      // Nothing to point at (a collapsed part, or a screen without one): the bubble sits under the top bar.
      setPos({ left: Math.max(12, (window.innerWidth - width) / 2), top: 76, width, below: true });
      return;
    }
    const r = el.getBoundingClientRect();
    const left = Math.max(12, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - 12));
    const below = r.bottom + 12 + h < window.innerHeight - 64 || r.top - 12 - h < 64;
    setPos({ left, top: below ? Math.min(r.bottom + 10, window.innerHeight - h - 8) : r.top - 10 - h, width, below });
  }, [c?.id, tick, s.week]);

  if (!c) return null;
  return createPortal(
    <div
      ref={tip}
      className={`coach ${pos?.below === false ? 'is-above' : ''}`}
      role="dialog"
      aria-label={c.title ? t(c.title) : undefined}
      style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { left: 0, top: 0, width: Math.min(340, window.innerWidth - 24), visibility: 'hidden' }}
    >
      {c.title && <b className="coach-title">{t(c.title)}</b>}
      <p>{tx(c.text)}</p>
      <div className="coach-btns">
        <Button kind="primary" small onClick={closeCoach}>
          {c.meet ? t('Anladım') : t('Tamam')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}

/** When a closed lesson opens, in the notebook. */
function waitsFor(s: GameState, l: Lesson): string {
  if (l.year !== undefined && yearFloat(s.week) < l.year) return t('{year}’de açılır', { year: Math.floor(l.year) });
  if (l.waits) return t(l.waits);
  if (l.passive) return t('olunca kendisi gelir');
  return t('zamanı gelince');
}

/** The notebook on HQ: the title earned, every chapter and its lessons; any open lesson can be taken from here. */
export function LessonBook() {
  const s = useGameState();
  const p = lessonProgress(s);
  // The chapter open in the list: the one with a lesson to take now, else the first not finished.
  const current =
    LESSONS.find((l) => !lessonDone(s, l.id) && lessonOpen(s, l) && !!l.where(s))?.chapter ??
    LESSON_CHAPTERS.find((c) => {
      const cp = chapterProgress(s, c.id);
      return cp.done < cp.total;
    })?.id;
  return (
    <Panel
      title={
        <>
          <Icon name="scroll" /> {t('Usta defteri')}
        </>
      }
      actions={<span className="lesson-tier">{t(p.tier)}</span>}
      className="lesson-book"
    >
      <Progress value={p.done} max={p.total} tone="accent" label={t('{done}/{total} ders', { done: p.done, total: p.total })} />
      <details className="lesson-chapters">
        <summary>{t('Bölümler ve dersler')}</summary>
        {LESSON_CHAPTERS.map((c) => {
          const cp = chapterProgress(s, c.id);
          const ls = LESSONS.filter((l) => l.chapter === c.id);
          return (
            <details key={c.id} className="lesson-part" open={c.id === current}>
              <summary>
                <span>
                  {c.id}. {t(c.name)}
                </span>
                {cp.done === cp.total ? <span className="lesson-stamp">{t('Belge')}</span> : <span className="muted small">{t('{done}/{total}', { done: cp.done, total: cp.total })}</span>}
              </summary>
              <ul className="lesson-list">
                {ls.map((l) => {
                  const done = lessonDone(s, l.id);
                  const skipped = !done && !!s.lessons?.skipped.includes(l.id);
                  const open = !done && lessonOpen(s, l) && !!l.where(s);
                  return (
                    <li key={l.id} className={done ? 'is-done' : skipped ? 'is-skipped' : open ? 'is-open' : 'is-closed'}>
                      <Icon name={done ? 'check' : open ? 'sparkle' : skipped ? 'cross' : 'lock'} />
                      <span className="lesson-name">
                        {t(l.title)}
                        {!done && !open && <small className="muted"> · {waitsFor(s, l)}</small>}
                      </span>
                      {open && (
                        <Button small kind={skipped ? 'ghost' : 'default'} onClick={() => showLesson(s, l)}>
                          {t('Göster')}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </details>
      <Toggle checked={lessonsOn(s)} onChange={(v) => store.act((st) => setLessonsOn(st, v))} label={t('Dersleri ekranın üstünde göster')} sub={t('Kapalıyken dersler yalnızca bu defterde durur.')} />
    </Panel>
  );
}
