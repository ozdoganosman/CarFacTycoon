import * as A from '../../core/actions';
import { devWeeksLeft } from '../../core/budget';
import { engineersBusy, idleEngineers } from '../../core/game';
import { researchSlots, researchSpeed } from '../../core/research';
import { yearFloat } from '../../core/time';
import { costIndex, engineerSalary } from '../../data/economy';
import { money } from '../format';
import { store, useGameState } from '../store';
import { Button, Panel } from './ui';

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
  const hire = (k: number) => store.try((st) => A.hireEngineers(st, k), `${k} mühendis işe alındı`);
  return (
    <Panel title="Mühendislik ekibi" className="team-panel">
      <p className="team-head">
        <b className="team-count">{n}</b> mühendis · {engineersBusy(s)} projede{idle > 0 ? <span className="tone-bad"> · {idle} boşta</span> : ''} · beceri{' '}
        <b>{Math.round(s.company.skill)}</b>
        <span className="muted small">
          {' '}
          · maaşlar haftada {money(n * salary)} (yılda {money(n * salary * 52)})
        </span>
      </p>
      {project && now > 0 ? (
        <p className="small">
          <b>{project.name}</b> geliştirmesi şimdiki ekiple ~<b>{now} hafta</b>; +5 mühendisle ~<b>{with5}</b>, +10 ile ~<b>{with10}</b> hafta.
        </p>
      ) : (
        !compact && <p className="small muted">Geliştirmede proje yok. Mühendisler Ar-Ge’de çalışır: araştırma hızı ×{researchSpeed(n).toFixed(1)}, {researchSlots(n)} araştırma yeri.</p>
      )}
      <div className="team-actions">
        <Button kind="primary" disabled={s.company.cash < hireCost} onClick={() => hire(1)}>
          +1 mühendis al
        </Button>
        <Button disabled={s.company.cash < 5 * hireCost} onClick={() => hire(5)}>
          +5
        </Button>
        <Button disabled={s.company.cash < 10 * hireCost} onClick={() => hire(10)}>
          +10
        </Button>
        <Button kind="ghost" disabled={n <= 1} onClick={() => store.try((st) => A.fireEngineers(st, 1), 'Bir mühendis ayrıldı')}>
          −1 çıkar
        </Button>
        <span className="muted small">
          işe alma kişi başı {money(hireCost)}, maaş haftada {money(salary)}
        </span>
      </div>
      {!compact && (
        <p className="muted small">
          Daha çok mühendis arabayı daha çabuk bitirir ama orantılı değil: bir arabada bir düzineden fazlası birbirini bekler (iki mühendis iki, yirmi mühendis sekiz kişilik iş
          çıkarır). Her 15 mühendis bir araştırma yeri daha açar. Çok hızlı büyümek ortalama tecrübeyi (beceriyi) biraz düşürür; beceri her lansmanla artar.
        </p>
      )}
    </Panel>
  );
}
