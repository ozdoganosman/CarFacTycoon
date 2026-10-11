import { designEngineers } from '../../core/research';
import { teamOutput } from '../../core/development';
import {
  annualUnits,
  buildEngineering,
  buildPlant,
  companyWorkScale,
  engineeringCost,
  engineeringLevel,
  nextEngineering,
  ownsPlant,
  plantCapacity,
  plantCoverage,
  plantSaving,
  plantStep,
} from '../../core/investments';
import { yearFloat } from '../../core/time';
import { ENGINEERING_LEVELS, ENGINEERING_UPKEEP, MIN_PLANT, SUPPLIER_PLANTS } from '../../data/investments';
import { t } from '../../i18n';
import { tx } from '../i18n';
import { cars, dec, inYear, money, num, pct } from '../format';
import { store, useGameState } from '../store';
import { Badge, Button, Info, Panel } from './ui';

// What a grown company spends on (core/investments.ts): its engineering organisation (Company
// screen) and its own supplier plants (Factory screen).

/**
 * The engineering organisation: how big a team can work on one car, the work a car takes at the
 * company's size, and the next level with its price.
 */
export function EngineeringPanel() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const lv = engineeringLevel(s);
  const next = nextEngineering(s);
  const scale = companyWorkScale(s);
  // The engineers developing cars (the laboratory's work alone: research.ts).
  const n = designEngineers(s);
  const output = teamOutput(n, lv.span);
  const cost = next ? engineeringCost(next, yf) : 0;
  const open = next && next.year <= yf;
  return (
    <Panel
      title={
        <>
          {t('Mühendislik teşkilatı')}{' '}
          <Info>
            {t(
              'Büyük bir şirketin arabası daha çok mühendislik ister: yüksek hacim için kalıplar, daha çok tip, koordine edilecek tedarikçiler, binlerce bayi için kılavuzlar. Kalabalık bir ekip ise çizimleri, deneyleri ve kararları bekler: teşkilat, bir projede en çok kaç mühendisin işinin birden yürüyebileceğini belirler. Her düzey araştırmayı da hızlandırır; binaların yıllık gideri bedellerinin {upkeep} kadarıdır.',
              { upkeep: pct(ENGINEERING_UPKEEP, 0) },
            )}
          </Info>
        </>
      }
    >
      <p>
        {tx('<b>{name}</b>: bir projede en çok ~{span} mühendisin işi birden yürür. Bugün {n} mühendis ~{output} kişilik iş çıkarıyor.', {
          name: t(lv.name),
          span: lv.span,
          n,
          output: dec(output, 0),
        })}
      </p>
      {scale > 1.05 && (
        <p className="small">
          {tx('Şirketin büyüklüğü (son iki yılda yılda ~{units} araç) yeni bir arabanın mühendislik işini <b>×{x}</b> yapıyor.', {
            units: cars(annualUnits(s)),
            x: dec(scale, 2),
          })}
        </p>
      )}
      <ol className="ladder">
        {ENGINEERING_LEVELS.slice(1).map((x) => (
          <li key={x.level} className={x.level <= lv.level ? 'is-done' : x.level === next?.level ? 'is-next' : ''}>
            <b>{t(x.name)}</b> <span className="muted small">{x.year > yf ? t('{year} gelir', { year: inYear(x.year) }) : t('~{span} kişilik iş', { span: x.span })}</span>
          </li>
        ))}
      </ol>
      {next ? (
        <div className="invest-next">
          <span className="small">
            {tx('Sıradaki: <b>{name}</b>. {desc} Bir projede ~{span} kişilik iş, araştırma +{research}; yılda ~{upkeep} gider.', {
              name: t(next.name),
              desc: t(next.desc),
              span: next.span,
              research: pct(next.research - lv.research, 0),
              upkeep: money(cost * ENGINEERING_UPKEEP),
            })}
          </span>
          <Button
            kind="primary"
            disabled={!open || s.company.cash < cost}
            onClick={() => store.try((st) => buildEngineering(st), t('{name} kuruldu', { name: t(next.name) }))}
          >
            {open ? t('{name} kur ({cost})', { name: t(next.name), cost: money(cost) }) : t('{year} gelir', { year: inYear(next.year) })}
          </Button>
        </div>
      ) : (
        <p className="muted small">{t('Teşkilat en üst düzeyde.')}</p>
      )}
    </Panel>
  );
}

/** The company's own supplier plants: how many of the cars each supplies, what it saves, and the next step with its payback. */
export function PlantsPanel() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  return (
    <Panel
      title={
        <>
          {t('Tedarik fabrikaları')}{' '}
          <Info>
            {t(
              'Tedarikçilerin sattığını kendin yaparsan, fabrikanın yettiği arabaların malzemesi ucuzlar. Bir fabrika yılda belli sayıda arabaya yeter ve en az {min} arabalık kurulur: ancak yüksek bir hacimde kendini öder. Şirket büyüdükçe fabrikayı da büyütmek gerekir. Ödeme süresi geçen yılın malzeme harcamasıyla hesaplanır.',
              { min: num(MIN_PLANT) },
            )}
          </Info>
        </>
      }
    >
      <div className="plants">
        {SUPPLIER_PLANTS.map((p) => {
          const owned = ownsPlant(s, p.id);
          const open = p.year <= yf;
          const step = open ? plantStep(s, p, yf) : null;
          const coverage = plantCoverage(s, p.id);
          return (
            <div key={p.id} className={`plant ${owned ? 'is-owned' : ''} ${open ? '' : 'is-locked'}`}>
              <div className="plant-head">
                <b>{t(p.name)}</b> <Info>{t(p.desc)}</Info>
                <span className="small">{t('malzeme −{cut}', { cut: pct(p.cut, 1) })}</span>
              </div>
              {!open ? (
                <span className="small muted">{t('{year} gelir', { year: inYear(p.year) })}</span>
              ) : (
                <>
                  {owned && (
                    <span className="small">
                      <Badge tone={coverage >= 0.95 ? 'good' : 'warn'}>{t('Kuruldu')}</Badge>{' '}
                      {t('yılda {count} araba · arabalarının {share} kadarına yetiyor · yılda ~{saving} kazandırıyor', {
                        count: num(plantCapacity(s, p.id)),
                        share: pct(coverage, 0),
                        saving: money(plantSaving(s, p)),
                      })}
                    </span>
                  )}
                  {step && (
                    <>
                      <span className={`small ${step.payback <= 4 ? 'tone-good' : step.payback > 10 ? 'tone-bad' : 'muted'}`}>
                        {step.payback === Infinity
                          ? t('Henüz araba üretilmiyor.')
                          : step.payback > 30
                            ? t('Bu hacimle kendini ödemez.')
                            : t('Bu hacimle ~{years} yılda öder.', { years: dec(step.payback, 1) })}
                      </span>
                      <Button small disabled={s.company.cash < step.cost} onClick={() => store.try((st) => buildPlant(st, p.id), owned ? t('{name} büyütüldü', { name: t(p.name) }) : t('{name} kuruldu', { name: t(p.name) }))}>
                        {owned
                          ? t('Yılda {count} arabaya büyüt ({cost})', { count: num(step.to), cost: money(step.cost) })
                          : t('Yılda {count} arabalık kur ({cost})', { count: num(step.to), cost: money(step.cost) })}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
