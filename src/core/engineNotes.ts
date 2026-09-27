import { referenceDesigns } from './ai';
import { computeEngine } from './engine';
import type { EngineDesign, EngineStats, SegmentId } from './types';

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
