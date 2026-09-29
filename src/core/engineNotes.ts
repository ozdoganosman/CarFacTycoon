import { GEARBOX_TYPES, SUSPENSIONS, byId } from '../data/tech';
import { referenceDesigns } from './ai';
import { computeEngine, eraRpmCap } from './engine';
import type { CarDesign, CarStats, DevBonus, EngineDesign, EngineStats, SegmentId } from './types';
import { computeCarStats } from './vehicle';
import { t } from '../i18n';
import { dec, fmtPercent } from '../i18n/format';

// Plain-language pros and cons of an engine, measured against the typical
// engine of the same class in the same year (the yardstick the stats panel
// uses too). The curves alone do not say what a design is good or bad at.

export interface EngineNotes {
  /** e.g. "~1.8 L, ~16 bg" */
  typical: string;
  pros: string[];
  cons: string[];
}

interface Typical {
  hp: number;
  torque: number;
  torqueRpm: number;
  redline: number;
  cc: number;
  eff: number;
  mass: number;
  cost: number;
  smooth: number;
  rel: number;
  taxHpEurope: number;
}

const cache = new Map<string, Typical>();

function typical(year: number, segment: SegmentId): Typical {
  const y = Math.floor(year);
  const seg: SegmentId = (segment === 'pickup' && y < 1913) || (segment === 'suv' && y < 1946) ? 'family' : segment;
  const key = `${y}:${seg}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const designs = referenceDesigns(y, seg).map((d) => d.engine);
  const stats = designs.map((e) => computeEngine(e, y));
  const avg = (f: (x: EngineStats) => number) => stats.reduce((a, x) => a + f(x), 0) / stats.length;
  const out: Typical = {
    hp: avg((x) => x.powerHp),
    torque: avg((x) => x.torqueNm),
    torqueRpm: avg((x) => x.peakTorqueRpm),
    redline: avg((x) => x.redline),
    cc: avg((x) => x.displacementCc),
    eff: avg((x) => x.peakEfficiency),
    mass: avg((x) => x.massKg),
    cost: avg((x) => x.cost),
    smooth: avg((x) => x.smoothness),
    rel: avg((x) => x.reliabilityPenalty),
    taxHpEurope: stats[1].taxHp,
  };
  cache.set(key, out);
  return out;
}

const pct = (r: number) => fmtPercent(Math.abs(r - 1), 0);

export function engineNotes(e: EngineDesign, year: number, segment: SegmentId): EngineNotes {
  const typ = typical(year, segment);
  const x = computeEngine(e, year);
  const pros: string[] = [];
  const cons: string[] = [];
  // Only the American market is played: the European horsepower tax does not apply.
  const europeTax = false;

  const hp = x.powerHp / typ.hp;
  if (hp >= 1.15) pros.push(t('Tipik motordan {pct} güçlü: hızlanma ve son hız artar.', { pct: pct(hp) }));
  else if (hp <= 0.85) cons.push(t('Tipik motordan {pct} güçsüz: araç ağır kalkar, yokuşta zorlanır.', { pct: pct(hp) }));

  const tq = x.torqueNm / typ.torque;
  if (tq >= 1.15) pros.push(t('Bol tork ({nm} Nm): yüklüyken ve yokuşta rahat çeker, vites az değişir.', { nm: Math.round(x.torqueNm) }));
  else if (tq <= 0.85) cons.push(t('Tork az ({nm} Nm): yükte ve yokuşta sık vites küçültmek gerekir.', { nm: Math.round(x.torqueNm) }));

  if (x.peakTorqueRpm <= typ.torqueRpm * 0.8)
    pros.push(t('Torkunu düşük devirde veriyor ({rpm} d/d): şehirde esnek ve sessiz.', { rpm: Math.round(x.peakTorqueRpm) }));
  else if (x.peakTorqueRpm >= typ.torqueRpm * 1.25)
    cons.push(t('Torkunu yüksek devirde veriyor ({rpm} d/d): canlı kalmak için bağırtmak gerekir.', { rpm: Math.round(x.peakTorqueRpm) }));
  const capped = !x.diesel && x.redline >= eraRpmCap(e.valvetrain, year) - 1;
  if (capped && e.stroke < e.bore)
    cons.push(
      t('Devri dönemin supap yayları ve yatakları sınırlıyor ({rpm} d/d): stroku daha da kısaltmak gücü artırmaz, yalnızca hacmi küçültür.', {
        rpm: Math.round(x.redline),
      }),
    );
  if (x.redline >= typ.redline * 1.2)
    pros.push(t('Yüksek devre çıkıyor ({rpm} d/d): kısa strok ve iyi supaplar sayesinde güç tepesi geç gelir.', { rpm: Math.round(x.redline) }));

  const cc = x.displacementCc / typ.cc;
  if (cc >= 1.3) cons.push(t('Hacmi büyük ({l} L): daha çok yakar.', { l: dec(x.displacementCc / 1000) }));
  else if (cc <= 0.75) pros.push(t('Hacmi küçük ({l} L): az yakar.', { l: dec(x.displacementCc / 1000) }));

  const eff = x.peakEfficiency / typ.eff;
  if (eff >= 1.06) pros.push(t('Yakıtı iyi değerlendiriyor (verim {pct} yüksek): sıkıştırma ve supap düzeni sayesinde.', { pct: pct(eff) }));
  else if (eff <= 0.94) cons.push(t('Yakıtı boşa yakıyor (verim {pct} düşük): sıkıştırmayı ya da supap düzenini iyileştir.', { pct: pct(eff) }));

  const smooth = x.smoothness - typ.smooth;
  if (smooth >= 4) pros.push(t('Tipik motordan yumuşak ve sessiz çalışıyor: konfor ve prestij artar.'));
  else if (smooth <= -4) cons.push(t('Tipik motordan sarsıntılı çalışıyor: konfor ve prestij düşer.'));

  if (x.knocking) cons.push(t('Vuruntu yapıyor! Bu çapta sıkıştırma en fazla {limit} olmalı: güç ve güvenilirlik düşüyor.', { limit: dec(x.knockLimit) }));
  else if (!x.diesel && x.knockLimit - e.compression > 0.8)
    cons.push(t('Sıkıştırma sınırın çok altında ({cr}, sınır {limit}): güç ve verim masada kalıyor.', { cr: dec(e.compression), limit: dec(x.knockLimit) }));

  const rel = x.reliabilityPenalty - typ.rel;
  if (rel >= 3) cons.push(t('Tipik motordan karmaşık ya da zorlanmış: arıza riski daha yüksek.'));
  else if (rel <= -3) pros.push(t('Tipik motordan basit ve sağlam: daha az arıza çıkarır.'));

  const mass = x.massKg / typ.mass;
  if (mass >= 1.25) cons.push(t('Ağır ({kg} kg): aracı ağırlaştırır; hızlanma ve yol tutuş düşer.', { kg: Math.round(x.massKg) }));
  else if (mass <= 0.8) pros.push(t('Hafif ({kg} kg): aracın geri kalanı da hafifler.', { kg: Math.round(x.massKg) }));

  const cost = x.cost / typ.cost;
  if (cost >= 1.25) cons.push(t('Pahalı: tipik motordan {pct} fazla tutuyor, birim maliyet artar.', { pct: pct(cost) }));
  else if (cost <= 0.8) pros.push(t('Ucuz: tipik motordan {pct} az tutuyor.', { pct: pct(cost) }));

  if (europeTax) {
    const tax = x.taxHp / typ.taxHpEurope;
    if (tax >= 1.25) cons.push(t('Avrupa’da vergi beygiri yüksek ({hp}): alıcı her yıl daha çok vergi öder. Vergi yalnızca çapa bakar.', { hp: dec(x.taxHp) }));
    else if (tax <= 0.8) pros.push(t('Avrupa’da vergi beygiri düşük ({hp}): uzun strok vergide avantaj sağlıyor.', { hp: dec(x.taxHp) }));
  }

  if (x.diesel) {
    pros.push(t('Dizel: çok az yakar ve uzun ömürlüdür.'));
    cons.push(t('Dizel: ağır, gürültülü ve düşük devirli; alıcılar prestijli bulmaz.'));
  }
  // Made here rather than cached with the typical engine, so it follows the language.
  return { typical: t('~{l} L, ~{hp} bg', { l: dec(typ.cc / 1000), hp: Math.round(typ.hp) }), pros, cons };
}

// ---------- Gearbox and suspension ----------

export interface PartNotes {
  pros: string[];
  cons: string[];
}

function refDesigns(year: number, segment: SegmentId): CarDesign[] {
  const y = Math.floor(year);
  const seg: SegmentId = (segment === 'pickup' && y < 1913) || (segment === 'suv' && y < 1946) ? 'family' : segment;
  return referenceDesigns(y, seg);
}

/** The class's usual comfort/grip setting of the suspension (0 soft … 1 stiff). */
export function typicalSuspBalance(year: number, segment: SegmentId): number {
  const refs = refDesigns(year, segment);
  return refs.reduce((a, r) => a + r.suspBalance, 0) / refs.length;
}

/** The same car with each typical design's part swapped in. */
function withTypical(d: CarDesign, refs: CarDesign[], year: number, bonus: DevBonus | undefined, patch: (ref: CarDesign) => Partial<CarDesign>): CarStats[] {
  return refs.map((ref) => computeCarStats({ ...d, ...patch(ref) }, year, bonus));
}
const avgOf = (xs: CarStats[], f: (s: CarStats) => number) => xs.reduce((a, s) => a + f(s), 0) / xs.length;
/** A small difference ("biraz") rather than a clear one ("belirgin biçimde"). */
const slight = (x: number, small: number) => Math.abs(x) < small;

/**
 * What this gearbox does for this car compared with the class's usual gearbox
 * fitted to the same car: acceleration, top speed, fuel, and whether the
 * ratios suit the engine.
 */
export function gearboxNotes(d: CarDesign, year: number, segment: SegmentId, bonus?: DevBonus): PartNotes {
  const pros: string[] = [];
  const cons: string[] = [];
  const refs = refDesigns(year, segment);
  const mine = computeCarStats(d, year, bonus);
  const typ = withTypical(d, refs, year, bonus, (ref) => ({ gearbox: ref.gearbox }));
  const accel = mine.accel50 - avgOf(typ, (s) => s.accel50);
  if (accel <= -0.3) pros.push(t('Tipik şanzımanla aynı arabadan {s} sn daha çabuk hızlanıyor (0-50 km/s).', { s: dec(Math.abs(accel)) }));
  else if (accel >= 0.3) cons.push(t('Tipik şanzımanla aynı arabadan {s} sn daha yavaş hızlanıyor (0-50 km/s).', { s: dec(accel) }));
  const top = mine.topSpeed - avgOf(typ, (s) => s.topSpeed);
  if (top >= 2) pros.push(t('Son hızı {v} km/s daha yüksek.', { v: Math.round(top) }));
  else if (top <= -2) cons.push(t('Son hızı {v} km/s daha düşük.', { v: Math.round(-top) }));
  const fuel = mine.fuel / avgOf(typ, (s) => s.fuel);
  if (fuel <= 0.97) pros.push(t('{pct} daha az yakıyor: uzun vitesler motoru düşük devirde tutuyor.', { pct: fmtPercent(1 - fuel, 0) }));
  else if (fuel >= 1.03) cons.push(t('{pct} daha çok yakıyor: kısa vitesler motoru yüksek devirde döndürüyor.', { pct: fmtPercent(fuel - 1, 0) }));
  // Do the ratios suit the engine? Try them a little longer and shorter.
  const g = d.gearbox;
  const longer = computeCarStats({ ...d, gearbox: { ...g, spread: Math.min(1, g.spread + 0.15) } }, year, bonus).topSpeed;
  const shorter = computeCarStats({ ...d, gearbox: { ...g, spread: Math.max(0, g.spread - 0.15) } }, year, bonus).topSpeed;
  if (g.spread < 1 && longer > mine.topSpeed + 1.5)
    cons.push(t('Son vites kısa: son hızda motor devir sınırına dayanıyor. Oranları uzatırsan hem daha hızlı gider hem az yakar.'));
  else if (g.spread > 0 && shorter > mine.topSpeed + 1.5)
    cons.push(t('Son vites fazla uzun: motor son viteste gücünün tepesine çıkamıyor. Oranları biraz kısaltırsan son hız artar.'));
  const refGears = refs.reduce((a, r) => a + r.gearbox.gears, 0) / refs.length;
  if (g.gears > refGears + 0.5) cons.push(t('Tipikten fazla vites: şanzıman pahalı ve ağır.'));
  else if (g.gears < refGears - 0.5) cons.push(t('Tipikten az vites: vitesler arası boşluk büyük, motor güçlü olduğu devirden sık düşer.'));
  const gb = byId(GEARBOX_TYPES, g.type);
  const refType = byId(GEARBOX_TYPES, refs[0].gearbox.type);
  if (gb.id !== refType.id) {
    const name = t(gb.name);
    if (gb.comfort + gb.practicality > refType.comfort + refType.practicality) pros.push(t('{name}: vites değiştirmek kolay; konfor ve pratiklik artar.', { name }));
    if (gb.cost > refType.cost)
      cons.push(gb.mass > refType.mass ? t('{name} tipik şanzımandan pahalı ve ağır.', { name }) : t('{name} tipik şanzımandan pahalı.', { name }));
    if (gb.efficiency < refType.efficiency) cons.push(t('Aktarmada daha çok güç kaybediyor.'));
    if (gb.year > year - 4) cons.push(t('Yeni bir teknoloji: ilk yıllarında arıza riski yüksek.'));
  }
  return { pros, cons };
}

/** What this suspension does for this car compared with the class's usual set-up on the same car. */
export function suspensionNotes(d: CarDesign, year: number, segment: SegmentId, bonus?: DevBonus): PartNotes {
  const pros: string[] = [];
  const cons: string[] = [];
  const mine = computeCarStats(d, year, bonus);
  const typ = withTypical(d, refDesigns(year, segment), year, bonus, (ref) => ({ suspension: ref.suspension, suspBalance: ref.suspBalance }));
  const comfort = mine.comfort - avgOf(typ, (s) => s.comfort);
  if (comfort >= 1.5) pros.push(slight(comfort, 5) ? t('Tipik süspansiyondan biraz daha konforlu.') : t('Tipik süspansiyondan belirgin biçimde daha konforlu.'));
  else if (comfort <= -1.5)
    cons.push(slight(comfort, 5) ? t('Tipik süspansiyondan biraz daha sert: konfor düşük.') : t('Tipik süspansiyondan belirgin biçimde daha sert: konfor düşük.'));
  const handling = mine.handling - avgOf(typ, (s) => s.handling);
  if (handling >= 1.5) pros.push(slight(handling, 5) ? t('Yol tutuşu biraz daha iyi.') : t('Yol tutuşu belirgin biçimde daha iyi.'));
  else if (handling <= -1.5) cons.push(slight(handling, 5) ? t('Yol tutuşu biraz daha zayıf.') : t('Yol tutuşu belirgin biçimde daha zayıf.'));
  const cost = mine.unitCost / avgOf(typ, (s) => s.unitCost);
  if (cost >= 1.02) cons.push(t('Aracın birim maliyetini {pct} artırıyor.', { pct: fmtPercent(cost - 1, 0) }));
  const rel = mine.reliability - avgOf(typ, (s) => s.reliability);
  if (rel <= -1) cons.push(t('Yeni ya da karmaşık bir sistem: arıza riski daha yüksek.'));
  const susp = byId(SUSPENSIONS, d.suspension);
  if (susp.year > year - 4 && susp.immaturity > 0) cons.push(t('Teknoloji yeni: ilk yıllarında sorun çıkarabilir.'));
  return { pros, cons };
}
