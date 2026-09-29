import { useMemo } from 'react';
import { accelMetric, appeal, eraReference, scoreStats } from '../../core/scoring';
import { applyWorkshopPenalty, referencePrice, workshopPenalty } from '../../core/market';
import { costIndex, labourShare } from '../../data/economy';
import { ATTRS, ATTR_NAMES, importanceLabel, segmentDef } from '../../data/segments';
import { computeCarStats } from '../../core/vehicle';
import { estimateRange, factRange, isRough, rawRange } from '../../core/estimate';
import type { AttrKey, CarDesign, CarStats, DevBonus, Estimate, GameState, Scores, SegmentId } from '../../core/types';
import { isTurkish, t } from '../../i18n';
import { fmtNumber } from '../../i18n/format';
import { kmh, litres, money, secs } from '../format';
import { tx } from '../i18n';
import { CostBreakdown } from './CostBreakdown';
import { Info, RangeBar, ScoreBar } from './ui';

/** "lo–hi" for an engineers' range. */
const span = ([lo, hi]: [number, number], f: (v: number) => string) => `${f(lo)}–${f(hi)}`;
/** A decimal as the game always showed it in Turkish ("1.25"), in the player's own form elsewhere. */
const fixed = (v: number, digits: number) => (isTurkish() ? v.toFixed(digits) : fmtNumber(v, digits));

export function useCarStats(design: CarDesign, yf: number, bonus?: DevBonus): CarStats {
  const key = JSON.stringify(design) + Math.floor(yf) + JSON.stringify(bonus ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeCarStats(design, yf, bonus), [key]);
}

/** The engineers' quote for a measured quantity: a range while they are unsure. */
function estimatedRaw(k: AttrKey, st: CarStats, yf: number, seg: SegmentId, est: Estimate): string {
  const range = (v: number, digits: number) => {
    const [lo, hi] = rawRange(est, k, v);
    return `${fixed(lo, digits)}–${fixed(hi, digits)}`;
  };
  switch (k) {
    case 'accel': {
      const m = accelMetric(st, eraReference(yf, seg));
      return m.value === null || m.value >= 99 ? `${t(m.label)}: —` : `${t(m.label)}: ${t('{v} sn', { v: range(m.value, 0) })}`;
    }
    case 'topSpeed':
      return t('{v} km/s', { v: range(st.topSpeed, 0) });
    case 'economy':
      return t('{v} L/100km', { v: range(st.fuel, 1) });
    default:
      return '';
  }
}

function rawValue(k: AttrKey, st: CarStats, yf: number, seg: SegmentId): string {
  switch (k) {
    case 'accel': {
      const m = accelMetric(st, eraReference(yf, seg));
      return `${t(m.label)}: ${secs(m.value)}`;
    }
    case 'topSpeed':
      return kmh(st.topSpeed);
    case 'economy':
      return litres(st.fuel);
    default:
      return String(Math.round(st[k]));
  }
}

export function Importance({ s, segment, attr }: { s: GameState; segment: SegmentId; attr: AttrKey }) {
  const k = s.knowledge[segment][attr] ?? 0;
  if (k === 0) return <span className="imp imp-unknown" title={t('Bu alıcıların buna ne kadar önem verdiğini henüz bilmiyorsun')}>?</span>;
  const { label, level } = importanceLabel(segmentDef(segment).weights[attr]);
  if (k === 1) return <span className="imp imp-hint" title={t('İpucu: {level} olabilir (daha fazla geri bildirim gerek)', { level: t(label).toLowerCase() })}>{'●'.repeat(Math.max(1, level))}?</span>;
  return (
    <span className="imp" title={t('Önem: {level}', { level: t(label) })}>
      {'●'.repeat(level)}
      <span className="imp-off">{'●'.repeat(4 - level)}</span>
    </span>
  );
}

export function StatsPanel(props: {
  s: GameState;
  design: CarDesign;
  segment: SegmentId;
  yf: number;
  bonus?: DevBonus;
  compact?: boolean;
  note?: string;
  /** When given, show engineers' ranges instead of exact scores and keep the buyers' verdict hidden. */
  estimate?: Estimate;
  /** Scores as buyers see them (a car on sale: perceived reliability, workshop name). */
  scores?: Scores;
}) {
  const { s, design, segment, yf } = props;
  const st = useCarStats(design, yf, props.bonus);
  // Engineers know their own workshop: its inexperience is part of the estimate.
  const scores = props.scores ?? applyWorkshopPenalty(scoreStats(st, yf, segment), workshopPenalty(s));
  const hq = s.company.hq;
  const ap = appeal(scores, segment, hq, yf);
  const ci = costIndex(yf);
  const unit = st.unitCost * ci;
  const approxCost = unit * (1 + labourShare(yf) * 0.8);
  const ref = referencePrice(hq, segment, yf);
  // Price is decided at launch; while designing, the class's typical price is the yardstick.
  const target = ref;
  const est = props.estimate;
  const measurable = (k: AttrKey) => k === 'accel' || k === 'topSpeed' || k === 'economy';
  return (
    <div className="stats-panel">
      <div className="sp-head">
        {est ? (
          <div>
            <b className="sp-estimate-title">{t('Mühendis tahmini')}</b>
            <div className="muted small">
              {t('Alıcıların {segment} için ne diyeceği lansmanda belli olur. Aralıklar sınıf ortalamasına (çizgi) göre; testler aralıkları daraltır.', {
                segment: t(segmentDef(segment).name).toLowerCase(),
              })}
            </div>
            {(est.experience ?? 1) > 1.5 && (
              <div className="small tone-warn">{t('Ekibin ilk arabalarından biri: tahminler kaba ve yanılabilir. Her yeni model ekibini keskinleştirir.')}</div>
            )}
            {props.note && <div className="muted small">{props.note}</div>}
            <ClassGaps est={est} scores={scores} />
          </div>
        ) : (
          <div>
            <span className="muted small">{t('Çekicilik ({segment})', { segment: t(segmentDef(segment).name) })}</span>
            <b className={`sp-appeal ${ap >= 55 ? 'tone-good' : ap < 45 ? 'tone-bad' : ''}`}>{ap.toFixed(0)}</b>
            <span className="muted small"> / {t('sınıf ort. 50')}</span>
            {props.note && <div className="muted small">{props.note}</div>}
          </div>
        )}
      </div>
      <div className="sp-rows">
        {ATTRS.map((k) => {
          const r = est ? estimateRange(est, k, scores[k]) : null;
          return (
            <div key={k} className="sp-row">
              <div className="sp-label">
                <span>{t(ATTR_NAMES[k])}</span>
                {!est && <Importance s={s} segment={segment} attr={k} />}
              </div>
              <div className="sp-raw">
                {!est ? rawValue(k, st, yf, segment) : measurable(k) ? (isRough(est, k) ? estimatedRaw(k, st, yf, segment, est) : rawValue(k, st, yf, segment)) : isRough(est, k) ? t('kaba tahmin') : t('ölçüldü')}
              </div>
              {r ? <RangeBar lo={r.lo} hi={r.hi} rough={isRough(est!, k)} /> : <ScoreBar value={scores[k]} />}
            </div>
          );
        })}
      </div>
      {!props.compact && (
        <div className="sp-facts">
          {est && (
            <p className="sp-facts-note muted small">
              {t('Kâğıt üstündeki hesap')}
              <Info>
                <p>
                  {t(
                    'Mühendislerin çizimden çıkardığı rakamlar. Tecrübesiz ya da küçük bir ekip geniş ve yanılabilir aralık verir; her yeni model, beceri ve kalabalık bir ekip aralığı daraltır.',
                  )}
                </p>
                <p>{t('Dinamometre gücü, yol testi ağırlığı netleştirir. Kesin birim maliyeti üretim hazırlığında tedarikçiler söyler.')}</p>
              </Info>
            </p>
          )}
          <div>
            <span>{t('Güç')}</span>
            <b>{t('{v} bg', { v: est ? span(factRange(est, 'power', st.engine.powerHp), (v) => fixed(v, 0)) : fixed(st.engine.powerHp, 0) })}</b>
          </div>
          <div>
            <span>{t('Ağırlık')}</span>
            <b>{t('{v} kg', { v: est ? span(factRange(est, 'mass', st.massKg), (v) => String(Math.round(v / 5) * 5)) : Math.round(st.massKg) })}</b>
          </div>
          <div>
            <span>{t('Malzeme maliyeti')}</span>
            <b>{est ? span(factRange(est, 'cost', unit), money) : money(unit)}</b>
          </div>
          <div title={t('Malzeme + tahmini işçilik')}>
            <span>{t('Tahmini toplam maliyet')}</span>
            <b>{est ? span(factRange(est, 'cost', approxCost), money) : money(approxCost)}</b>
          </div>
          <div title={t('Bu fiyattan satarsan bayi payından sonra araç başına kalan')}>
            <span>{t('Sınıfın tipik fiyatı')}</span>
            <b className={approxCost > target * 0.9 ? 'tone-bad' : ''}>{money(ref)}</b>
          </div>
          <div title={t('1 = sıradan araç. Yüksekse hat daha yavaş çalışır.')}>
            <span>{t('Üretim zorluğu')}</span>
            <b>{est ? span(factRange(est, 'complexity', st.complexity), (v) => fixed(v, 2)) : fixed(st.complexity, 2)}</b>
          </div>
        </div>
      )}
      {!props.compact && <CostBreakdown design={design} st={st} ci={ci} yf={yf} rough={!!est} segment={segment} hq={hq} />}
    </div>
  );
}

/**
 * Where the engineers' middle estimate puts the car well behind or ahead of the class average:
 * what the buyers weigh stays hidden, but a plain gap should not wait for the launch.
 */
function ClassGaps({ est, scores }: { est: Estimate; scores: Record<AttrKey, number> }) {
  const behind: AttrKey[] = [];
  const ahead: AttrKey[] = [];
  for (const k of ATTRS) {
    const r = estimateRange(est, k, scores[k]);
    const mid = (r.lo + r.hi) / 2;
    if (mid <= 40) behind.push(k);
    else if (mid >= 60) ahead.push(k);
  }
  if (!behind.length && !ahead.length) return null;
  return (
    <div className="class-gaps small">
      {behind.length > 0 && (
        <div className="tone-warn">
          {tx('Mühendislere göre sınıf ortalamasının gerisinde kalabilir: <b>{attrs}</b>.', { attrs: behind.map((k) => t(ATTR_NAMES[k]).toLowerCase()).join(', ') })}
        </div>
      )}
      {ahead.length > 0 && (
        <div className="tone-good">
          {tx('Mühendislere göre sınıf ortalamasının önünde: <b>{attrs}</b>.', { attrs: ahead.map((k) => t(ATTR_NAMES[k]).toLowerCase()).join(', ') })}
        </div>
      )}
    </div>
  );
}
