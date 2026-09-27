import { GEARBOX_TYPES, SUSPENSIONS, byId } from '../data/tech';
import { referenceDesigns } from './ai';
import { computeEngine, eraRpmCap } from './engine';
import type { CarDesign, CarStats, DevBonus, EngineDesign, EngineStats, SegmentId } from './types';
import { computeCarStats } from './vehicle';

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
  label: string;
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
  const t: Typical = {
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
    label: `~${(avg((x) => x.displacementCc) / 1000).toFixed(1)} L, ~${Math.round(avg((x) => x.powerHp))} bg`,
  };
  cache.set(key, t);
  return t;
}

const pct = (r: number) => `%${Math.round(Math.abs(r - 1) * 100)}`;

export function engineNotes(e: EngineDesign, year: number, segment: SegmentId): EngineNotes {
  const t = typical(year, segment);
  const x = computeEngine(e, year);
  const pros: string[] = [];
  const cons: string[] = [];
  const europeTax = year >= 1910 && year <= 1947;

  const hp = x.powerHp / t.hp;
  if (hp >= 1.15) pros.push(`Tipik motordan ${pct(hp)} güçlü: hızlanma ve son hız artar.`);
  else if (hp <= 0.85) cons.push(`Tipik motordan ${pct(hp)} güçsüz: araç ağır kalkar, yokuşta zorlanır.`);

  const tq = x.torqueNm / t.torque;
  if (tq >= 1.15) pros.push(`Bol tork (${Math.round(x.torqueNm)} Nm): yüklüyken ve yokuşta rahat çeker, vites az değişir.`);
  else if (tq <= 0.85) cons.push(`Tork az (${Math.round(x.torqueNm)} Nm): yükte ve yokuşta sık vites küçültmek gerekir.`);

  if (x.peakTorqueRpm <= t.torqueRpm * 0.8) pros.push(`Torkunu düşük devirde veriyor (${Math.round(x.peakTorqueRpm)} d/d): şehirde esnek ve sessiz.`);
  else if (x.peakTorqueRpm >= t.torqueRpm * 1.25) cons.push(`Torkunu yüksek devirde veriyor (${Math.round(x.peakTorqueRpm)} d/d): canlı kalmak için bağırtmak gerekir.`);
  const capped = !x.diesel && x.redline >= eraRpmCap(e.valvetrain, year) - 1;
  if (capped && e.stroke < e.bore)
    cons.push(`Devri dönemin supap yayları ve yatakları sınırlıyor (${Math.round(x.redline)} d/d): stroku daha da kısaltmak gücü artırmaz, yalnızca hacmi küçültür.`);
  if (x.redline >= t.redline * 1.2) pros.push(`Yüksek devre çıkıyor (${Math.round(x.redline)} d/d): kısa strok ve iyi supaplar sayesinde güç tepesi geç gelir.`);

  const cc = x.displacementCc / t.cc;
  if (cc >= 1.3) cons.push(`Hacmi büyük (${(x.displacementCc / 1000).toFixed(1)} L): daha çok yakar.`);
  else if (cc <= 0.75) pros.push(`Hacmi küçük (${(x.displacementCc / 1000).toFixed(1)} L): az yakar.`);

  const eff = x.peakEfficiency / t.eff;
  if (eff >= 1.06) pros.push(`Yakıtı iyi değerlendiriyor (verim ${pct(eff)} yüksek): sıkıştırma ve supap düzeni sayesinde.`);
  else if (eff <= 0.94) cons.push(`Yakıtı boşa yakıyor (verim ${pct(eff)} düşük): sıkıştırmayı ya da supap düzenini iyileştir.`);

  const smooth = x.smoothness - t.smooth;
  if (smooth >= 4) pros.push('Tipik motordan yumuşak ve sessiz çalışıyor: konfor ve prestij artar.');
  else if (smooth <= -4) cons.push('Tipik motordan sarsıntılı çalışıyor: konfor ve prestij düşer.');

  if (x.knocking) cons.push(`Vuruntu yapıyor! Bu çapta sıkıştırma en fazla ${x.knockLimit.toFixed(1)} olmalı: güç ve güvenilirlik düşüyor.`);
  else if (!x.diesel && x.knockLimit - e.compression > 0.8) cons.push(`Sıkıştırma sınırın çok altında (${e.compression.toFixed(1)}, sınır ${x.knockLimit.toFixed(1)}): güç ve verim masada kalıyor.`);

  const rel = x.reliabilityPenalty - t.rel;
  if (rel >= 3) cons.push('Tipik motordan karmaşık ya da zorlanmış: arıza riski daha yüksek.');
  else if (rel <= -3) pros.push('Tipik motordan basit ve sağlam: daha az arıza çıkarır.');

  const mass = x.massKg / t.mass;
  if (mass >= 1.25) cons.push(`Ağır (${Math.round(x.massKg)} kg): aracı ağırlaştırır; hızlanma ve yol tutuş düşer.`);
  else if (mass <= 0.8) pros.push(`Hafif (${Math.round(x.massKg)} kg): aracın geri kalanı da hafifler.`);

  const cost = x.cost / t.cost;
  if (cost >= 1.25) cons.push(`Pahalı: tipik motordan ${pct(cost)} fazla tutuyor, birim maliyet artar.`);
  else if (cost <= 0.8) pros.push(`Ucuz: tipik motordan ${pct(cost)} az tutuyor.`);

  if (europeTax) {
    const tax = x.taxHp / t.taxHpEurope;
    if (tax >= 1.25) cons.push(`Avrupa’da vergi beygiri yüksek (${x.taxHp.toFixed(1)}): alıcı her yıl daha çok vergi öder. Vergi yalnızca çapa bakar.`);
    else if (tax <= 0.8) pros.push(`Avrupa’da vergi beygiri düşük (${x.taxHp.toFixed(1)}): uzun strok vergide avantaj sağlıyor.`);
  }

  if (x.diesel) {
    pros.push('Dizel: çok az yakar ve uzun ömürlüdür.');
    cons.push('Dizel: ağır, gürültülü ve düşük devirli; alıcılar prestijli bulmaz.');
  }
  return { typical: t.label, pros, cons };
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
const amount = (x: number, small: number) => (Math.abs(x) < small ? 'biraz' : 'belirgin biçimde');

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
  if (accel <= -0.3) pros.push(`Tipik şanzımanla aynı arabadan ${Math.abs(accel).toFixed(1)} sn daha çabuk hızlanıyor (0-50 km/s).`);
  else if (accel >= 0.3) cons.push(`Tipik şanzımanla aynı arabadan ${accel.toFixed(1)} sn daha yavaş hızlanıyor (0-50 km/s).`);
  const top = mine.topSpeed - avgOf(typ, (s) => s.topSpeed);
  if (top >= 2) pros.push(`Son hızı ${Math.round(top)} km/s daha yüksek.`);
  else if (top <= -2) cons.push(`Son hızı ${Math.round(-top)} km/s daha düşük.`);
  const fuel = mine.fuel / avgOf(typ, (s) => s.fuel);
  if (fuel <= 0.97) pros.push(`%${Math.round((1 - fuel) * 100)} daha az yakıyor: uzun vitesler motoru düşük devirde tutuyor.`);
  else if (fuel >= 1.03) cons.push(`%${Math.round((fuel - 1) * 100)} daha çok yakıyor: kısa vitesler motoru yüksek devirde döndürüyor.`);
  // Do the ratios suit the engine? Try them a little longer and shorter.
  const g = d.gearbox;
  const longer = computeCarStats({ ...d, gearbox: { ...g, spread: Math.min(1, g.spread + 0.15) } }, year, bonus).topSpeed;
  const shorter = computeCarStats({ ...d, gearbox: { ...g, spread: Math.max(0, g.spread - 0.15) } }, year, bonus).topSpeed;
  if (g.spread < 1 && longer > mine.topSpeed + 1.5) cons.push('Son vites kısa: son hızda motor devir sınırına dayanıyor. Oranları uzatırsan hem daha hızlı gider hem az yakar.');
  else if (g.spread > 0 && shorter > mine.topSpeed + 1.5) cons.push('Son vites fazla uzun: motor son viteste gücünün tepesine çıkamıyor. Oranları biraz kısaltırsan son hız artar.');
  const refGears = refs.reduce((a, r) => a + r.gearbox.gears, 0) / refs.length;
  if (g.gears > refGears + 0.5) cons.push('Tipikten fazla vites: şanzıman pahalı ve ağır.');
  else if (g.gears < refGears - 0.5) cons.push('Tipikten az vites: vitesler arası boşluk büyük, motor güçlü olduğu devirden sık düşer.');
  const gb = byId(GEARBOX_TYPES, g.type);
  const refType = byId(GEARBOX_TYPES, refs[0].gearbox.type);
  if (gb.id !== refType.id) {
    if (gb.comfort + gb.practicality > refType.comfort + refType.practicality) pros.push(`${gb.name}: vites değiştirmek kolay; konfor ve pratiklik artar.`);
    if (gb.cost > refType.cost) cons.push(`${gb.name} tipik şanzımandan pahalı${gb.mass > refType.mass ? ' ve ağır' : ''}.`);
    if (gb.efficiency < refType.efficiency) cons.push('Aktarmada daha çok güç kaybediyor.');
    if (gb.year > year - 4) cons.push('Yeni bir teknoloji: ilk yıllarında arıza riski yüksek.');
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
  if (comfort >= 1.5) pros.push(`Tipik süspansiyondan ${amount(comfort, 5)} daha konforlu.`);
  else if (comfort <= -1.5) cons.push(`Tipik süspansiyondan ${amount(comfort, 5)} daha sert: konfor düşük.`);
  const handling = mine.handling - avgOf(typ, (s) => s.handling);
  if (handling >= 1.5) pros.push(`Yol tutuşu ${amount(handling, 5)} daha iyi.`);
  else if (handling <= -1.5) cons.push(`Yol tutuşu ${amount(handling, 5)} daha zayıf.`);
  const cost = mine.unitCost / avgOf(typ, (s) => s.unitCost);
  if (cost >= 1.02) cons.push(`Aracın birim maliyetini %${Math.round((cost - 1) * 100)} artırıyor.`);
  const rel = mine.reliability - avgOf(typ, (s) => s.reliability);
  if (rel <= -1) cons.push('Yeni ya da karmaşık bir sistem: arıza riski daha yüksek.');
  const susp = byId(SUSPENSIONS, d.suspension);
  if (susp.year > year - 4 && susp.immaturity > 0) cons.push('Teknoloji yeni: ilk yıllarında sorun çıkarabilir.');
  return { pros, cons };
}
