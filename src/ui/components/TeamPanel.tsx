import * as A from '../../core/actions';
import { SHORT_CASH_WEEKS, cashWeeks, devWeeksLeft } from '../../core/budget';
import { engineersBusy, idleEngineers } from '../../core/game';
import { designEngineers, labSlots, labSpeed } from '../../core/research';
import { yearFloat } from '../../core/time';
import { engineerSalary } from '../../data/economy';
import type { GameState } from '../../core/types';
import { t } from '../../i18n';
import { dec, money } from '../format';
import { store, useGameState } from '../store';
import { Button, Panel } from './ui';
import { teamOutput } from '../../core/development';
import { engineeringLevel, teamSpan } from '../../core/investments';
import { tx } from '../i18n';

/**
 * Hire engineers; a hire that leaves the cash for less than a year is asked about first (players
 * hired dozens with no car on sale and went bankrupt, October 2026).
 */
export async function hireEngineers(s: GameState, k: number) {
  const weeks = cashWeeks(s, k);
  if (weeks < SHORT_CASH_WEEKS) {
    const now = cashWeeks(s);
    const ok = await store.ask({
      title: t('Kasa çabuk tükenebilir'),
      body:
        t('Bu alımdan ve projelerin kalan masraflarından (prototip, test, kalıp) sonra kasa şimdiki giderle ~{n} hafta yeter.', { n: Math.floor(weeks) }) +
        ' ' +
        (Number.isFinite(now) ? t('Alım olmadan ~{n} hafta yeterdi.', { n: Math.floor(now) }) + ' ' : '') +
        t('Her mühendis satış olsa da olmasa da maaş alır; para araba satışa çıkmadan biterse kredi gerekir, o da biterse şirket batar.'),
      confirm: t('Yine de al'),
      danger: true,
    });
    if (!ok) return;
  }
  store.try((st) => A.hireEngineers(st, k), t('{n} mühendis işe alındı', { n: k }));
}

/** How long the cash lasts, now and with the hires on offer; nothing while the company earns its keep. */
export function cashRunway(s: GameState, offers: number[]): string | null {
  const now = cashWeeks(s);
  if (!Number.isFinite(now)) return null;
  const w = (k: number) => Math.floor(cashWeeks(s, k));
  return offers.length >= 2
    ? t('Projelerin kalan masrafları çıkınca kasa şimdiki giderle ~{n} hafta yeter; +{a} mühendisle ~{wa}, +{b} ile ~{wb} hafta.', { n: Math.floor(now), a: offers[0], wa: w(offers[0]), b: offers[1], wb: w(offers[1]) })
    : t('Projelerin kalan masrafları çıkınca kasa şimdiki giderle ~{n} hafta yeter; +{a} mühendisle ~{wa} hafta.', { n: Math.floor(now), a: offers[0], wa: w(offers[0]) });
}

/**
 * The engineering team, where the player looks for it: how many, what they cost, how much sooner the
 * car in development would be ready with more of them, and the buttons to hire or let go.
 */
export function TeamPanel({ compact }: { compact?: boolean }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const n = s.company.engineers;
  const salary = engineerSalary(yf);
  const hireCost = A.hireCost(yf);
  const idle = idleEngineers(s);
  const project = s.projects.find((p) => p.phase === 'development') ?? s.projects.find((p) => p.phase === 'design');
  const now = project ? devWeeksLeft(s, project) : 0;
  const with5 = project ? devWeeksLeft(s, project, 5) : 0;
  const with10 = project ? devWeeksLeft(s, project, 10) : 0;
  const hire = (k: number) => hireEngineers(s, k);
  const runway = cashRunway(s, [5, 10]);
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
      {/* How much of the team's work gets done at once, with the organisation it has (core/investments.ts). */}
      {n > 12 && (
        <p className="small">
          {tx('Teşkilat: <b>{org}</b> · {n} mühendis ~{output} kişilik iş çıkarıyor.', { org: t(engineeringLevel(s).name), n, output: dec(teamOutput(designEngineers(s), teamSpan(s)), 0) })}{' '}
          <button type="button" className="link small" onClick={() => store.go({ id: 'company', tab: 'general' })}>
            {t('Teşkilatı büyüt')}
          </button>
        </p>
      )}
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
            {t('Geliştirmede proje yok. Mühendisler Ar-Ge’de çalışır: araştırma hızı ×{speed}, {n} araştırma yeri (Ar-Ge ekranında mühendislerin bir payı laboratuvara verilebilir).', {
              speed: dec(labSpeed(s), 1),
              n: labSlots(s),
            })}
          </p>
        )
      )}
      {runway && <p className={`small ${cashWeeks(s, 5) < SHORT_CASH_WEEKS ? 'tone-warn' : 'muted'}`}>{runway}</p>}
      <div className="team-actions" data-guide="hire">
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
