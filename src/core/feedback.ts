import { ATTRS, ATTR_NAMES, segmentDef } from '../data/segments';
import { modelScores, playerOffer, rivalScores } from './market';
import type { Rng } from './rng';
import { segmentWeights } from './scoring';
import { yearFloat } from './time';
import type { AttrKey, CarModel, GameState, MarketId, Review } from './types';

// Reviews and customer feedback are the player's window into the hidden segment weights.

const POSITIVE: Record<AttrKey, string[]> = {
  accel: ['Hızlanması nefes kesici.', 'Gaza basınca koltuğa yapıştırıyor.'],
  topSpeed: ['Düz yolda rakiplerini toz duman içinde bırakıyor.', 'Son hızı sınıfının çok üstünde.'],
  economy: ['Deposu bitmek bilmiyor.', 'Benzin parası cebinizde kalıyor.'],
  comfort: ['Kötü yolda bile salon gibi.', 'Uzun yolculuklar yorgunluk yapmıyor.'],
  handling: ['Virajlara ray üstündeymiş gibi giriyor.', 'Direksiyonu hassas ve güven verici.'],
  safety: ['Sağlam yapısı içinizi rahatlatıyor.', 'Frenleri sınıfının en iyisi.'],
  reliability: ['Yol kenarında kalmayı unutun.', 'Bozulmuyor; tamirciye yolunuz düşmüyor.'],
  prestige: ['Kapısının önüne park edene itibar kazandırıyor.', 'Çizgileri başları çevirtiyor.'],
  practicality: ['İçine her şey sığıyor.', 'Günlük kullanımda son derece pratik.'],
};

const NEGATIVE: Record<AttrKey, string[]> = {
  accel: ['Yokuşta yayadan hallice.', 'Hızlanması sabır istiyor.'],
  topSpeed: ['Düz yolda bile herkes sizi solluyor.', 'Son hızı hayal kırıklığı.'],
  economy: ['Benzin istasyonlarının en iyi müşterisi.', 'Yakıt faturası can yakıyor.'],
  comfort: ['Her tümseği omurganızda hissediyorsunuz.', 'Uzun yolda işkenceye dönüşüyor.'],
  handling: ['Virajlarda gemi gibi yalpalıyor.', 'Direksiyon tepkisiz ve belirsiz.'],
  safety: ['Kaza anında sizi koruyacağından emin değiliz.', 'Frenleri güven vermiyor.'],
  reliability: ['Arıza lambası yoksa bile tamirci sizi tanıyor.', 'Sık sık yolda bırakıyor.'],
  prestige: ['Sıradan, kimse dönüp bakmıyor.', 'Tasarımı sönük ve ucuz görünüyor.'],
  practicality: ['Bagajına bir şapka kutusu zor sığar.', 'Günlük hayatta pratik değil.'],
};

const MAGAZINES = [
  { name: 'Motor Postası', bias: { handling: 1.3, economy: 1.2 } as Partial<Record<AttrKey, number>> },
  { name: 'Yol & Hız', bias: { accel: 1.4, topSpeed: 1.3 } as Partial<Record<AttrKey, number>> },
  { name: 'Otomobil Gazetesi', bias: { comfort: 1.3, reliability: 1.3, practicality: 1.2 } as Partial<Record<AttrKey, number>> },
];

function mainMarket(state: GameState, model: CarModel): MarketId {
  return model.markets.includes(state.company.hq) ? state.company.hq : model.markets[0];
}

function learn(state: GameState, model: CarModel, attr: AttrKey, amount = 1) {
  const k = state.knowledge[model.segment];
  k[attr] = Math.min(2, (k[attr] ?? 0) + amount);
}

/** Average appeal of active rival cars in the same class and market. */
export function rivalAverageAppeal(state: GameState, model: CarModel, market: MarketId): number {
  const rivals = state.rivalModels.filter((r) => r.active && r.segment === model.segment && r.markets.includes(market));
  if (!rivals.length) return 50;
  return rivals.reduce((s, r) => s + rivalScores(state, r).appeal[market], 0) / rivals.length;
}

export function writeReviews(state: GameState, model: CarModel, rng: Rng): Review[] {
  const yf = yearFloat(state.week);
  const market = mainMarket(state, model);
  const { scores } = modelScores(state, model);
  const offer = playerOffer(state, model, market);
  const rivalAvg = rivalAverageAppeal(state, model, market);
  const weights = segmentWeights(model.segment, market, yf);
  const siblings = state.models.filter((m) => m.status === 'active' && m.platformId === model.platformId).length;
  const reviews: Review[] = [];
  for (const mag of MAGAZINES) {
    let biased = 0;
    let wsum = 0;
    for (const k of ATTRS) {
      const w = weights[k] * (mag.bias[k] ?? 1);
      biased += w * scores[k];
      wsum += w;
    }
    biased /= wsum;
    let score = 5.5 + (biased - rivalAvg) / 5 + offer.priceTerm / 5 + (rng() - 0.5) * 1.4;
    if (siblings > 3) score -= 0.6 * (siblings - 3);
    score = Math.round(Math.min(10, Math.max(1, score)) * 2) / 2;
    // Quote the attribute that matters most to this class and stands out the most.
    const ranked = ATTRS.map((k) => ({ k, v: weights[k] * (mag.bias[k] ?? 1) * (scores[k] - 50) })).sort((a, b) => b.v - a.v);
    const best = ranked[0];
    const worst = ranked[ranked.length - 1];
    const parts: string[] = [];
    if (best.v > 0.5) parts.push(POSITIVE[best.k][Math.floor(rng() * 2)]);
    if (worst.v < -0.5) parts.push((parts.length ? 'Ama: ' : '') + NEGATIVE[worst.k][Math.floor(rng() * 2)].toLowerCase());
    if (siblings > 3) parts.push('Kardeş modellerinden ayırt etmek zor: hepsi aynı araba!');
    if (offer.priceTerm < -4) parts.push('Fiyatı fazla iddialı.');
    else if (offer.priceTerm > 4) parts.push('Bu paraya kaçırılmaz.');
    if (!parts.length) parts.push('Sınıfının ortalamasında, sağlam ama sıradan bir araç.');
    reviews.push({ magazine: mag.name, score, quote: parts.join(' ') });
    if (best.v > 0.5) learn(state, model, best.k);
    if (worst.v < -0.5) learn(state, model, worst.k);
  }
  return reviews;
}

export interface FeedbackLine {
  text: string;
  tone: 'good' | 'bad' | 'info';
}

/** Monthly word-of-mouth. Important attributes are mentioned more often, which teaches the player. */
export function customerFeedback(state: GameState, model: CarModel, rng: Rng): FeedbackLine[] {
  const yf = yearFloat(state.week);
  const market = mainMarket(state, model);
  const { scores } = modelScores(state, model);
  const w = segmentWeights(model.segment, market, yf);
  const buyers = segmentDef(model.segment).buyers;
  const lines: FeedbackLine[] = [];
  const pool = ATTRS.map((k) => ({ k, p: w[k] * (1 + Math.abs(scores[k] - 50) / 20) }));
  const total = pool.reduce((s, x) => s + x.p, 0);
  const chosen = new Set<AttrKey>();
  for (let i = 0; i < 2; i++) {
    let r = rng() * total;
    for (const x of pool) {
      r -= x.p;
      if (r <= 0) {
        chosen.add(x.k);
        break;
      }
    }
  }
  for (const k of chosen) {
    const d = scores[k] - 50;
    const name = ATTR_NAMES[k].toLowerCase();
    if (d > 8) lines.push({ text: `${buyers} ${model.name} modelinin ${name} konusundan çok memnun.`, tone: 'good' });
    else if (d < -8) lines.push({ text: `${buyers} ${model.name} modelinin ${name} konusundan şikâyetçi.`, tone: 'bad' });
    else lines.push({ text: `${buyers} ${model.name} modelinin ${name} konusunu “idare eder” buluyor; bu onlar için önemli.`, tone: 'info' });
    learn(state, model, k);
  }
  const offer = playerOffer(state, model, market);
  if (offer.priceTerm < -5) lines.push({ text: `${buyers} ${model.name} modelini pahalı buluyor.`, tone: 'bad' });
  else if (offer.priceTerm > 5) lines.push({ text: `${buyers} ${model.name} modelinin fiyatını çok uygun buluyor.`, tone: 'good' });
  return lines;
}
