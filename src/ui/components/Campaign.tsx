import type { CSSProperties } from 'react';
import { SCORE_TIERS, finalScore, type FinalScore } from '../../core/game';
import { chapterOf, goalStatus } from '../../core/goals';
import { yearOf } from '../../core/time';
import { t } from '../../i18n';
import { useGameState } from '../store';
import { Icon } from './Icon';
import { Info, Panel } from './ui';

// The campaign on HQ: where the company stands on the score's scale now (the same score as at the
// end), and the running decade's three goals (core/goals.ts).

/** The score's tiers as a bar, with a mark where the score stands. */
export function ScoreScale({ score }: { score: FinalScore }) {
  return (
    <div className="score-scale" aria-hidden>
      {[...SCORE_TIERS].reverse().map((tier, i, arr) => {
        const next = arr[i + 1]?.min ?? score.max;
        return (
          <span key={tier.name} className={score.tier === tier.name ? 'is-on' : ''} style={{ flex: next - tier.min }}>
            {t(tier.name)}
            <small>{tier.min}+</small>
          </span>
        );
      })}
      <i style={{ insetInlineStart: `${Math.min(100, (score.total / score.max) * 100)}%` }} />
    </div>
  );
}

export function CampaignPanel() {
  const s = useGameState();
  const year = yearOf(s.week);
  const def = chapterOf(year);
  const score = finalScore(s);
  const next = [...SCORE_TIERS].reverse().find((x) => x.min > score.total);
  const goals = goalStatus(s, def);
  const yearsLeft = Math.max(1, Math.min(def.decade + 10, 1961) - year);
  return (
    <Panel title={t('{decade}: {name}', { decade: t(def.label), name: t(def.name) })} className="campaign">
      <p className="campaign-tier">
        <Icon name="trophy" /> <b>{t(score.tier)}</b> · {t('{score} puan', { score: score.total })}
      </p>
      {next && <p className="muted small campaign-next">{t('{tier} için {n} puan daha', { tier: t(next.name), n: next.min - score.total })}</p>}
      <ScoreScale score={score} />
      <h4 className="campaign-head">
        {t('On yılın hedefleri')} <span className="muted small">{t('{n} yıl kaldı', { n: yearsLeft })}</span>
      </h4>
      <ul className="goals">
        {goals.map((g) => (
          <li key={g.id} className={g.done ? 'is-done' : ''}>
            <span className="goal-mark" aria-label={g.done ? t('Tamam') : t('Sürüyor')}>
              {g.done ? '✓' : ''}
            </span>
            <span className="goal-text">
              {g.text} {!g.done && <Info>{g.hint}</Info>}
              {g.progress && <small className="muted"> · {g.progress}</small>}
              {!g.done && g.share > 0 && <i className="goal-bar" style={{ '--p': g.share } as CSSProperties} />}
            </span>
          </li>
        ))}
      </ul>
      <details className="score-parts">
        <summary>{t('Puanın parçaları')}</summary>
        <table className="table compact">
          <tbody>
            {score.parts.map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td className="al-r">{p.value}</td>
                <td className="al-r">
                  <b>{p.points}</b> <span className="muted small">/ {p.max}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Panel>
  );
}
