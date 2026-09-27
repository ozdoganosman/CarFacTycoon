import { useMemo } from 'react';
import { accelMetric, appeal, eraReference, scoreStats } from '../../core/scoring';
import { applyWorkshopPenalty, consumerPrice, ownershipTax, referencePrice, workshopPenalty } from '../../core/market';
import { costIndex, labourShare } from '../../data/economy';
import { ATTRS, ATTR_NAMES, importanceLabel, segmentDef } from '../../data/segments';
import { activeTax } from '../../data/markets';
import { computeCarStats } from '../../core/vehicle';
import { estimateRange, isRough, rawRange } from '../../core/estimate';
import type { AttrKey, CarDesign, CarStats, DevBonus, Estimate, GameState, SegmentId } from '../../core/types';
import { kmh, litres, money, secs } from '../format';
import { RangeBar, ScoreBar } from './ui';

export function useCarStats(design: CarDesign, yf: number, bonus?: DevBonus): CarStats {
  const key = JSON.stringify(design) + Math.floor(yf) + JSON.stringify(bonus ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => computeCarStats(design, yf, bonus), [key]);
}

/** The engineers' quote for a measured quantity: a range while they are unsure. */
function estimatedRaw(k: AttrKey, st: CarStats, yf: number, seg: SegmentId, est: Estimate): string {
  const range = (v: number, digits: number, unit: string) => {
    const [lo, hi] = rawRange(est, k, v);
    return `${lo.toFixed(digits)}–${hi.toFixed(digits)} ${unit}`;
  };
  switch (k) {
    case 'accel': {
      const m = accelMetric(st, eraReference(yf, seg));
      return m.value === null || m.value >= 99 ? `${m.label}: —` : `${m.label}: ${range(m.value, 0, 'sn')}`;
    }
    case 'topSpeed':
      return range(st.topSpeed, 0, 'km/s');
    case 'economy':
      return range(st.fuel, 1, 'L/100km');
    default:
      return '';
  }
}

function rawValue(k: AttrKey, st: CarStats, yf: number, seg: SegmentId): string {
  switch (k) {
    case 'accel': {
      const m = accelMetric(st, eraReference(yf, seg));
      return `${m.label}: ${secs(m.value)}`;
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
  if (k === 0) return <span className="imp imp-unknown" title="Bu alıcıların buna ne kadar önem verdiğini henüz bilmiyorsun">?</span>;
  const { label, level } = importanceLabel(segmentDef(segment).weights[attr]);
  if (k === 1) return <span className="imp imp-hint" title={`İpucu: ${label.toLowerCase()} olabilir (daha fazla geri bildirim gerek)`}>{'●'.repeat(Math.max(1, level))}?</span>;
  return (
    <span className="imp" title={`Önem: ${label}`}>
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
}) {
  const { s, design, segment, yf } = props;
  const st = useCarStats(design, yf, props.bonus);
  // Engineers know their own workshop: its inexperience is part of the estimate.
  const scores = applyWorkshopPenalty(scoreStats(st, yf, segment), workshopPenalty(s));
  const hq = s.company.hq;
  const ap = appeal(scores, segment, hq, yf);
  const ci = costIndex(yf);
  const unit = st.unitCost * ci;
  const approxCost = unit * (1 + labourShare(yf) * 0.8);
  const ref = referencePrice(hq, segment, yf);
  // Price is decided at launch; while designing, the class's typical price is the yardstick.
  const target = ref;
  const eu = activeTax('europe', yf);
  const est = props.estimate;
  const measurable = (k: AttrKey) => k === 'accel' || k === 'topSpeed' || k === 'economy';
  return (
    <div className="stats-panel">
      <div className="sp-head">
        {est ? (
          <div>
            <b className="sp-estimate-title">Mühendis tahmini</b>
            <div className="muted small">
              Alıcıların {segmentDef(segment).name.toLowerCase()} için ne diyeceği lansmanda belli olur. Aralıklar sınıf ortalamasına (çizgi) göre; testler aralıkları daraltır.
            </div>
            {(est.experience ?? 1) > 1.5 && (
              <div className="small tone-warn">Ekibin ilk arabalarından biri: tahminler kaba ve yanılabilir. Her yeni model ekibini keskinleştirir.</div>
            )}
            {props.note && <div className="muted small">{props.note}</div>}
          </div>
        ) : (
          <div>
            <span className="muted small">Çekicilik ({segmentDef(segment).name})</span>
            <b className={`sp-appeal ${ap >= 55 ? 'tone-good' : ap < 45 ? 'tone-bad' : ''}`}>{ap.toFixed(0)}</b>
            <span className="muted small"> / sınıf ort. 50</span>
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
                <span>{ATTR_NAMES[k]}</span>
                {!est && <Importance s={s} segment={segment} attr={k} />}
              </div>
              <div className="sp-raw">
                {!est ? rawValue(k, st, yf, segment) : measurable(k) ? (isRough(est, k) ? estimatedRaw(k, st, yf, segment, est) : rawValue(k, st, yf, segment)) : isRough(est, k) ? 'kaba tahmin' : 'ölçüldü'}
              </div>
              {r ? <RangeBar lo={r.lo} hi={r.hi} rough={isRough(est!, k)} /> : <ScoreBar value={scores[k]} />}
            </div>
          );
        })}
      </div>
      {!props.compact && (
        <div className="sp-facts">
          <div>
            <span>Güç</span>
            <b>{st.engine.powerHp.toFixed(0)} bg</b>
          </div>
          <div>
            <span>Ağırlık</span>
            <b>{Math.round(st.massKg)} kg</b>
          </div>
          <div>
            <span>Malzeme maliyeti</span>
            <b>{money(unit)}</b>
          </div>
          <div title="Malzeme + tahmini işçilik">
            <span>Tahmini toplam maliyet</span>
            <b>{money(approxCost)}</b>
          </div>
          <div title="Bu fiyattan satarsan bayi payından sonra araç başına kalan">
            <span>Sınıfın tipik fiyatı</span>
            <b className={approxCost > target * 0.9 ? 'tone-bad' : ''}>{money(ref)}</b>
          </div>
          <div title="1 = sıradan araç. Yüksekse hat daha yavaş çalışır.">
            <span>Üretim zorluğu</span>
            <b>{st.complexity.toFixed(2)}</b>
          </div>
          {eu && (
            <div title={eu.label}>
              <span>Avrupa vergisi</span>
              <b>
                {eu.kind === 'racHp' ? `${st.engine.taxHp.toFixed(1)} vergi bg · ` : ''}
                {money(ownershipTax('europe', st, yf))}
              </b>
            </div>
          )}
          {hq !== 'europe' && s.markets.europe.unlocked && (
            <div>
              <span>Avrupa’da alıcıya fiyat</span>
              <b>{money(consumerPrice(target, 'europe', true, st, yf).total)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
