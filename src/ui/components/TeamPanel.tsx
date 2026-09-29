import * as A from '../../core/actions';
import { devWeeksLeft } from '../../core/budget';
import { engineersBusy, idleEngineers } from '../../core/game';
import { labSlots, labSpeed } from '../../core/research';
import { yearFloat } from '../../core/time';
import { costIndex, engineerSalary } from '../../data/economy';
import { t } from '../../i18n';
import { dec, money } from '../format';
import { store, useGameState } from '../store';
import { Button, Panel } from './ui';
import { tx } from '../i18n';

/**
 * The engineering team, where the player looks for it: how many, what they cost, how much sooner the
 * car in development would be ready with more of them, and the buttons to hire or let go.
 */
export function TeamPanel({ compact }: { compact?: boolean }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const n = s.company.engineers;
  const salary = engineerSalary(yf);
  const hireCost = 40 * costIndex(yf);
  const idle = idleEngineers(s);
  const project = s.projects.find((p) => p.phase === 'development') ?? s.projects.find((p) => p.phase === 'design');
  const now = project ? devWeeksLeft(s, project) : 0;
  const with5 = project ? devWeeksLeft(s, project, 5) : 0;
  const with10 = project ? devWeeksLeft(s, project, 10) : 0;
  const hire = (k: number) => store.try((st) => A.hireEngineers(st, k), t('{n} mühendis işe alındı', { n: k }));
  return (
    <Panel title={t('Mühendislik ekibi')} className="team-panel">
      <p className="team-head">
        {tx('<count>{n}</count> mühendis', { n }, { count: (c, k) => <b key={k} className="team-count">{c}</b> })} · {t('{n} projede', { n: engineersBusy(s) })}
        {idle > 0 ? <span className="tone-bad"> · {t('{n} boşta', { n: idle })}</span> : ''} · {tx('beceri <b>{skill}</b>', { skill: Math.round(s.company.skill) })}
        <span className="muted small">
          {' '}
          · {t('maaşlar haftada {week} (yılda {year})', { week: money(n * salary), year: money(n * salary * 52) })}
        </span>
      </p>
      {project && now > 0 ? (
        <p className="small">
          {tx('<b>{name}</b> geliştirmesi şimdiki ekiple ~<b>{n} hafta</b>; +5 mühendisle ~<b>{with5}</b>, +10 ile ~<b>{with10}</b> hafta.', {
            name: project.name,
            n: now,
            with5,
            with10,
          })}
        </p>
      ) : (
        !compact && (
          <p className="small muted">
            {t('Geliştirmede proje yok. Mühendisler Ar-Ge’de çalışır: araştırma hızı ×{speed}, {n} araştırma yeri (Ar-Ge ekranından ayrıca Ar-Ge uzmanı alınabilir).', {
              speed: dec(labSpeed(s), 1),
              n: labSlots(s),
            })}
          </p>
        )
      )}
      <div className="team-actions">
        <Button kind="primary" disabled={s.company.cash < hireCost} onClick={() => hire(1)}>
          {t('+1 mühendis al')}
        </Button>
        <Button disabled={s.company.cash < 5 * hireCost} onClick={() => hire(5)}>
          +5
        </Button>
        <Button disabled={s.company.cash < 10 * hireCost} onClick={() => hire(10)}>
          +10
        </Button>
        <Button kind="ghost" disabled={n <= 1} onClick={() => store.try((st) => A.fireEngineers(st, 1), t('Bir mühendis ayrıldı'))}>
          {t('−1 çıkar')}
        </Button>
        <span className="muted small">
          {t('işe alma kişi başı {hire}, maaş haftada {salary}', { hire: money(hireCost), salary: money(salary) })}
        </span>
      </div>
      {!compact && (
        <p className="muted small">
          {t(
            'Daha çok mühendis arabayı daha çabuk bitirir ama orantılı değil: bir arabada bir düzineden fazlası birbirini bekler (iki mühendis iki, yirmi mühendis sekiz kişilik iş çıkarır). Her 15 mühendis bir araştırma yeri daha açar. Çok hızlı büyümek ortalama tecrübeyi (beceriyi) biraz düşürür; beceri her lansmanla artar.',
          )}
        </p>
      )}
    </Panel>
  );
}
