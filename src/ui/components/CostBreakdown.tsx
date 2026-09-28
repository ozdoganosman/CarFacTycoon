import { labourShare } from '../../data/economy';
import { BODIES, CHASSIS, FEATURES, GEARBOX_TYPES, SUSPENSIONS, VALVETRAINS, byId } from '../../data/tech';
import type { CarDesign, CarStats, CostPart, MarketId, SegmentId } from '../../core/types';
import { eraReference } from '../../core/scoring';
import { money } from '../format';
import { Info } from './ui';

const NAMES: Record<CostPart, string> = {
  engine: 'Motor',
  gearbox: 'Şanzıman',
  chassis: 'Şasi',
  body: 'Gövde',
  suspension: 'Süspansiyon',
  running: 'Tekerlek, fren, direksiyon',
  interior: 'İç mekân',
  styling: 'Stil ve kaporta işçiliği',
  electrics: 'Elektrik',
  features: 'Diğer donanım',
};

const pct = (v: number) => `%${Math.round(v * 100)}`;
const sizeWord = (x: number) => (x < 0.34 ? 'küçük' : x < 0.67 ? 'orta' : 'büyük');

/** What drives each part, in the designer's own choices. */
function drivers(design: CarDesign, st: CarStats): Record<CostPart, string> {
  const e = design.engine;
  const feats = design.features.map((f) => byId(FEATURES, f));
  const elec = feats.filter((f) => f.electric).map((f) => f.name.toLowerCase());
  const other = feats.filter((f) => !f.electric).map((f) => f.name.toLowerCase());
  const size = `${sizeWord(design.size)} boy`;
  return {
    engine: `${e.cylinders} silindir, ${(st.engine.displacementCc / 1000).toFixed(1)} L, ${byId(VALVETRAINS, e.valvetrain).name}${st.engine.diesel ? ', dizel' : ''}: silindir sayısı ve hacim pahalıdır`,
    gearbox: `${design.gearbox.gears} vites, ${byId(GEARBOX_TYPES, design.gearbox.type).name.toLowerCase()}: her vites bir dişli takımı daha`,
    chassis: `${byId(CHASSIS, design.chassis).name}, ${size}`,
    body: `${byId(BODIES, design.body).name}${design.features.includes('steelBody') ? ', çelik (+%20)' : ''}, ${size}${byId(BODIES, design.body).closed ? ': kapalı gövde açığından pahalıdır' : ''}`,
    suspension: `${byId(SUSPENSIONS, design.suspension).name}, ${size}`,
    running: `${size}: araba büyüdükçe büyür`,
    interior: `iç donanım ${pct(design.interior)}: karesiyle pahalanır, yarıya indirmek bu kalemi çeyreğe düşürür`,
    styling: `stil ${pct(design.styling)}`,
    electrics: elec.length ? `dinamo ve kablolama, ${elec.join(', ')}` : 'dinamo ve kablolama',
    features: other.length ? other.join(', ') : 'yok',
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
        <b>Maliyet dökümü</b>
        <span className="muted small">
          {' '}
          en büyük kalem: {top ? `${NAMES[top.k].toLowerCase()} (${pct(top.v / total)})` : '—'}
        </span>
        <span className={`small cost-bd-class ${vsClass > 0.1 ? 'tone-bad' : vsClass < -0.05 ? 'tone-good' : 'muted'}`}>
          {' '}
          · sınıfın tipik arabası ~{money(typical)} malzeme, seninki {approx}
          {money(mine)} ({vsClass >= 0 ? '+' : '−'}%{Math.round(Math.abs(vsClass) * 100)})
        </span>
        <Info>
          <p>Rakiplerin fiyatları kendi maliyetlerine göre konur: malzemesi sınıfın tipik arabasından çok pahalı bir araba, sınıf fiyatında satılırsa az kâr bırakır ya da zarar eder.</p>
          <p>Mühendislerin orta tahmini, araç başına ve bugünün fiyatlarıyla. Bir kalemi düşürmek için yanında yazan seçimi değiştir.</p>
          <p>Kesin rakamı üretim hazırlığında tedarikçiler verir; ucuz tedarikçi ya da kendi atölyen motor, şanzıman ve elektriği ucuzlatır. İşçiliği hattaki makineler ve üretim zorluğu belirler.</p>
        </Info>
      </div>
      <ul className="cost-bd-list">
        {parts.map((p) => (
          <li key={p.k}>
            <span className="cost-bd-name">
              <b>{NAMES[p.k]}</b>
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
            <b>İşçilik (tahmini)</b>
            <span className="muted small">üretim zorluğu {st.complexity.toFixed(2)}: karmaşık araba hattı yavaşlatır; modern istasyonlar araç başına işçiliği düşürür</span>
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
          Kalemlere dahil:
          {Math.abs(focus - 1) > 0.005 && ` geliştirmede maliyet odağı ×${focus.toFixed(2)}`}
          {Math.abs(focus - 1) > 0.005 && Math.abs(knowhow - 1) > 0.005 && ' ·'}
          {Math.abs(knowhow - 1) > 0.005 && ` ustalık bilgisi ×${knowhow.toFixed(2)}`}
        </p>
      )}
    </div>
  );
}
