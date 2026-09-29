import { labourShare } from '../../data/economy';
import { BODIES, CHASSIS, FEATURES, GEARBOX_TYPES, SUSPENSIONS, VALVETRAINS, byId } from '../../data/tech';
import type { CarDesign, CarStats, CostPart, MarketId, SegmentId } from '../../core/types';
import { eraReference } from '../../core/scoring';
import { isTurkish, lower, msg, t } from '../../i18n';
import { fmtNumber } from '../../i18n/format';
import { money, pct as percent } from '../format';
import { Info } from './ui';

const NAMES: Record<CostPart, string> = {
  engine: msg('Motor'),
  gearbox: msg('Şanzıman'),
  chassis: msg('Şasi'),
  body: msg('Gövde'),
  suspension: msg('Süspansiyon'),
  running: msg('Tekerlek, fren, direksiyon'),
  interior: msg('İç mekân'),
  styling: msg('Stil ve kaporta işçiliği'),
  electrics: msg('Elektrik'),
  features: msg('Diğer donanım'),
};

const pct = (v: number) => percent(v, 0);
/** A decimal as the game always showed it in Turkish ("1.25"), in the player's own form elsewhere. */
const fixed = (v: number, digits: number) => (isTurkish() ? v.toFixed(digits) : fmtNumber(v, digits));
const sizeText = (x: number) => (x < 0.34 ? t('küçük boy') : x < 0.67 ? t('orta boy') : t('büyük boy'));

/** What drives each part, in the designer's own choices. */
function drivers(design: CarDesign, st: CarStats): Record<CostPart, string> {
  const e = design.engine;
  const feats = design.features.map((f) => byId(FEATURES, f));
  const elec = feats.filter((f) => f.electric).map((f) => lower(t(f.name)));
  const other = feats.filter((f) => !f.electric).map((f) => lower(t(f.name)));
  const size = sizeText(design.size);
  const bodyDef = byId(BODIES, design.body);
  const body = design.features.includes('steelBody') ? t('{body}, çelik (+%20)', { body: t(bodyDef.name) }) : t(bodyDef.name);
  const engine = {
    n: e.cylinders,
    litres: fixed(st.engine.displacementCc / 1000, 1),
    valvetrain: t(byId(VALVETRAINS, e.valvetrain).name),
  };
  return {
    engine: st.engine.diesel
      ? t('{n} silindir, {litres} L, {valvetrain}, dizel: silindir sayısı ve hacim pahalıdır', engine)
      : t('{n} silindir, {litres} L, {valvetrain}: silindir sayısı ve hacim pahalıdır', engine),
    gearbox: t('{n} vites, {type}: her vites bir dişli takımı daha', { n: design.gearbox.gears, type: lower(t(byId(GEARBOX_TYPES, design.gearbox.type).name)) }),
    chassis: `${t(byId(CHASSIS, design.chassis).name)}, ${size}`,
    body: bodyDef.closed ? t('{body}, {size}: kapalı gövde açığından pahalıdır', { body, size }) : `${body}, ${size}`,
    suspension: `${t(byId(SUSPENSIONS, design.suspension).name)}, ${size}`,
    running: t('{size}: araba büyüdükçe büyür', { size }),
    interior: t('iç donanım {pct}: karesiyle pahalanır, yarıya indirmek bu kalemi çeyreğe düşürür', { pct: pct(design.interior) }),
    styling: t('stil {pct}', { pct: pct(design.styling) }),
    electrics: elec.length ? t('dinamo ve kablolama, {list}', { list: elec.join(', ') }) : t('dinamo ve kablolama'),
    features: other.length ? other.join(', ') : t('yok'),
  };
}

/** The unit cost taken apart, biggest first, so the designer sees where money can be saved. */
export function CostBreakdown({ design, st, ci, yf, rough, segment, hq }: { design: CarDesign; st: CarStats; ci: number; yf: number; rough: boolean; segment: SegmentId; hq: MarketId }) {
  // The class's typical car: what the rivals' prices are built on.
  const typical = eraReference(yf, segment).byMarket[hq].unitCost * ci;
  const mine = st.unitCost * ci;
  const vsClass = mine / typical - 1;
  const parts = (Object.keys(st.costParts) as CostPart[]).map((k) => ({ k, v: st.costParts[k] * ci })).filter((p) => p.v > 0.5);
  const labour = st.unitCost * ci * labourShare(yf) * 0.8;
  const total = parts.reduce((a, p) => a + p.v, 0) + labour;
  const why = drivers(design, st);
  parts.sort((a, b) => b.v - a.v);
  const top = parts[0];
  const { focus, knowhow } = st.costMults;
  const approx = rough ? '~' : '';
  return (
    <div className="cost-bd">
      <div className="cost-bd-head">
        <b>{t('Maliyet dökümü')}</b>
        <span className="muted small">
          {' '}
          {t('en büyük kalem: {part}', { part: top ? `${lower(t(NAMES[top.k]))} (${pct(top.v / total)})` : '—' })}
        </span>
        <span className={`small cost-bd-class ${vsClass > 0.1 ? 'tone-bad' : vsClass < -0.05 ? 'tone-good' : 'muted'}`}>
          {' '}
          ·{' '}
          {t('sınıfın tipik arabası ~{typical} malzeme, seninki {mine} ({diff})', {
            typical: money(typical),
            mine: `${approx}${money(mine)}`,
            diff: `${vsClass >= 0 ? '+' : '−'}${pct(Math.abs(vsClass))}`,
          })}
        </span>
        <Info>
          <p>{t('Rakiplerin fiyatları kendi maliyetlerine göre konur: malzemesi sınıfın tipik arabasından çok pahalı bir araba, sınıf fiyatında satılırsa az kâr bırakır ya da zarar eder.')}</p>
          <p>{t('Mühendislerin orta tahmini, araç başına ve bugünün fiyatlarıyla. Bir kalemi düşürmek için yanında yazan seçimi değiştir.')}</p>
          <p>{t('Kesin rakamı üretim hazırlığında tedarikçiler verir; ucuz tedarikçi ya da kendi atölyen motor, şanzıman ve elektriği ucuzlatır. İşçiliği hattaki makineler ve üretim zorluğu belirler.')}</p>
        </Info>
      </div>
      <ul className="cost-bd-list">
        {parts.map((p) => (
          <li key={p.k}>
            <span className="cost-bd-name">
              <b>{t(NAMES[p.k])}</b>
              <span className="muted small">{why[p.k]}</span>
            </span>
            <span className="cost-bd-bar" aria-hidden>
              <i style={{ width: `${Math.max(2, (p.v / (top?.v || 1)) * 100)}%` }} />
            </span>
            <span className="cost-bd-num">
              {approx}
              {money(p.v)} <span className="muted small">{pct(p.v / total)}</span>
            </span>
          </li>
        ))}
        <li className="cost-bd-labour">
          <span className="cost-bd-name">
            <b>{t('İşçilik (tahmini)')}</b>
            <span className="muted small">
              {t('üretim zorluğu {v}: karmaşık araba hattı yavaşlatır; modern istasyonlar araç başına işçiliği düşürür', { v: fixed(st.complexity, 2) })}
            </span>
          </span>
          <span className="cost-bd-bar" aria-hidden>
            <i style={{ width: `${Math.max(2, (labour / (top?.v || 1)) * 100)}%` }} />
          </span>
          <span className="cost-bd-num">
            {approx}
            {money(labour)} <span className="muted small">{pct(labour / total)}</span>
          </span>
        </li>
      </ul>
      {(Math.abs(focus - 1) > 0.005 || Math.abs(knowhow - 1) > 0.005) && (
        <p className="muted small cost-bd-mults">
          {t('Kalemlere dahil:')}
          {Math.abs(focus - 1) > 0.005 && ` ${t('geliştirmede maliyet odağı ×{v}', { v: fixed(focus, 2) })}`}
          {Math.abs(focus - 1) > 0.005 && Math.abs(knowhow - 1) > 0.005 && ' ·'}
          {Math.abs(knowhow - 1) > 0.005 && ` ${t('ustalık bilgisi ×{v}', { v: fixed(knowhow, 2) })}`}
        </p>
      )}
    </div>
  );
}
