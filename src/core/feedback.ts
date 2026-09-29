import { openStates, underServed } from './network';
import { stateDef } from '../data/states';
import { ATTRS, ATTR_NAMES, segmentDef } from '../data/segments';
import { PRICE_REMARK, modelScores, playerOffer, rivalScores, segmentMarket } from './market';
import { lineReport } from './factory';
import type { Rng } from './rng';
import { segmentWeights } from './scoring';
import { yearFloat } from './time';
import type { AttrKey, CarModel, GameState, LaunchReport, MarketId, Review } from './types';
import { isTurkish, list, lower, msg, t } from '../i18n';

// Reviews and customer feedback are the player's window into the hidden segment weights.

const POSITIVE: Record<AttrKey, string[]> = {
  accel: [msg('Hızlanması nefes kesici.'), msg('Gaza basınca koltuğa yapıştırıyor.'), msg('Kavşakta ilk kalkan hep o.'), msg('Motoru istekli; aracı çekmekte hiç zorlanmıyor.')],
  topSpeed: [msg('Düz yolda rakiplerini toz duman içinde bırakıyor.'), msg('Son hızı sınıfının çok üstünde.'), msg('Açık yolda ibre durmak bilmiyor.'), msg('Uzun düzlüklerde tam bir rekor avcısı.')],
  economy: [msg('Deposu bitmek bilmiyor.'), msg('Benzin parası cebinizde kalıyor.'), msg('Tüketimi şaşırtıcı derecede düşük.'), msg('Az yakıtla çok yol gidiyor.')],
  comfort: [msg('Kötü yolda bile salon gibi.'), msg('Uzun yolculuklar yorgunluk yapmıyor.'), msg('Koltukları ve süspansiyonu yolu yumuşatıyor.'), msg('Kabin sessiz ve rahat.')],
  handling: [msg('Virajlara ray üstündeymiş gibi giriyor.'), msg('Direksiyonu hassas ve güven verici.'), msg('Dönemecin ortasında bile dengesini bozmuyor.'), msg('Kullanması keyif veriyor.')],
  safety: [msg('Sağlam yapısı içinizi rahatlatıyor.'), msg('Frenleri sınıfının en iyisi.'), msg('Ailenizi gönül rahatlığıyla bindirebilirsiniz.'), msg('Kaza anında sizi koruyacak bir gövde.')],
  reliability: [msg('Yol kenarında kalmayı unutun.'), msg('Bozulmuyor; tamirciye yolunuz düşmüyor.'), msg('Test boyunca tek bir arıza vermedi.'), msg('Saat gibi çalışıyor.')],
  prestige: [msg('Kapısının önüne park edene itibar kazandırıyor.'), msg('Çizgileri başları çevirtiyor.'), msg('Kulüp önünde en çok konuşulan araç.'), msg('İşçiliği ve detayları göz dolduruyor.')],
  practicality: [msg('İçine her şey sığıyor.'), msg('Günlük kullanımda son derece pratik.'), msg('Bagajı ve kabini geniş.'), msg('Her işe koşturulabilecek bir araç.')],
};

const NEGATIVE: Record<AttrKey, string[]> = {
  accel: [msg('Yokuşta yayadan hallice.'), msg('Hızlanması sabır istiyor.'), msg('Motoru aracı taşımakta zorlanıyor.'), msg('Kalkışta at arabasına bile yetişemiyor.')],
  topSpeed: [msg('Düz yolda bile herkes sizi solluyor.'), msg('Son hızı hayal kırıklığı.'), msg('Yolda en yavaş araç o.'), msg('Açık yolda nefesi çabuk kesiliyor.')],
  economy: [msg('Benzin istasyonlarının en iyi müşterisi.'), msg('Yakıt faturası can yakıyor.'), msg('Deposu göz açıp kapayıncaya kadar boşalıyor.'), msg('Tüketimi sınıfı için fazla.')],
  comfort: [msg('Her tümseği omurganızda hissediyorsunuz.'), msg('Uzun yolda işkenceye dönüşüyor.'), msg('Kabin gürültülü ve sarsıntılı.'), msg('Koltukları tahta sıra gibi.')],
  handling: [msg('Virajlarda gemi gibi yalpalıyor.'), msg('Direksiyon tepkisiz ve belirsiz.'), msg('Dönemeçlerde ürkütücü.'), msg('Frene basınca bir yana çekiyor.')],
  safety: [msg('Kaza anında sizi koruyacağından emin değiliz.'), msg('Frenleri güven vermiyor.'), msg('Gövdesi fazla narin.'), msg('Güvenlik konusunda sınıfının gerisinde.')],
  reliability: [msg('Arıza lambası yoksa bile tamirci sizi tanıyor.'), msg('Sık sık yolda bırakıyor.'), msg('Test aracımız iki kez çekiciyle döndü.'), msg('Parçaları dayanıksız.')],
  prestige: [msg('Sıradan, kimse dönüp bakmıyor.'), msg('Tasarımı sönük ve ucuz görünüyor.'), msg('İşçiliği fiyatını hak etmiyor.'), msg('Kalabalıkta kaybolup gidiyor.')],
  practicality: [msg('Bagajına bir şapka kutusu zor sığar.'), msg('Günlük hayatta pratik değil.'), msg('Kabin dar, binip inmek zor.'), msg('Ailece kullanmak neredeyse imkânsız.')],
};

// Each magazine has its own readers and hobbyhorses, so they notice different things.
const MAGAZINES = [
  { name: msg('Motor Postası'), bias: { handling: 2, economy: 1.6, reliability: 1.3 } as Partial<Record<AttrKey, number>> },
  { name: msg('Yol & Hız'), bias: { accel: 2.2, topSpeed: 2, prestige: 1.3 } as Partial<Record<AttrKey, number>> },
  { name: msg('Otomobil Gazetesi'), bias: { comfort: 1.8, practicality: 1.8, safety: 1.5, reliability: 1.4 } as Partial<Record<AttrKey, number>> },
];

export function mainMarket(state: GameState, model: CarModel): MarketId {
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
  const used = new Set<AttrKey>();
  const usedPhrases = new Set<string>();
  let magIndex = 0;
  for (const mag of MAGAZINES) {
    let biased = 0;
    let wsum = 0;
    for (const k of ATTRS) {
      const w = weights[k] * (mag.bias[k] ?? 1);
      biased += w * scores[k];
      wsum += w;
    }
    biased /= wsum;
    // Price counts, but a car a little dearer than its class is not a scandal.
    let score = 6 + (biased - rivalAvg) / 5 + offer.priceTerm / 9 + (rng() - 0.5) * 1.4;
    if (siblings > 3) score -= 0.6 * (siblings - 3);
    score = Math.round(Math.min(10, Math.max(1, score)) * 2) / 2;
    // Quote what this magazine's readers care about, avoiding what the others already said.
    const ranked = ATTRS.map((k) => ({ k, v: weights[k] * (mag.bias[k] ?? 1) ** 2 * (scores[k] - 50) }));
    const pickBest = [...ranked].sort((a, b) => b.v - a.v).filter((x) => x.v > 0.5);
    const pickWorst = [...ranked].sort((a, b) => a.v - b.v).filter((x) => x.v < -0.5);
    const best = pickBest.find((x) => !used.has(x.k)) ?? pickBest[0];
    const worst = pickWorst.find((x) => !used.has(x.k)) ?? pickWorst[0];
    const parts: string[] = [];
    // Never print the same sentence twice at one launch, even when every magazine picks the same flaw.
    const phrase = (list: string[]) => {
      const start = magIndex + Math.floor(rng() * list.length);
      for (let i = 0; i < list.length; i++) {
        const text = list[(start + i) % list.length];
        if (!usedPhrases.has(text)) {
          usedPhrases.add(text);
          return text;
        }
      }
      return list[start % list.length];
    };
    if (best) {
      parts.push(t(phrase(POSITIVE[best.k])));
      used.add(best.k);
    }
    if (worst) {
      const neg = t(phrase(NEGATIVE[worst.k]));
      const first = isTurkish() ? neg.charAt(0).toLocaleLowerCase('tr') : lower(neg.charAt(0));
      parts.push(parts.length ? t('Ama {text}', { text: `${first}${neg.slice(1)}` }) : neg);
      used.add(worst.k);
    }
    if (siblings > 3) parts.push(t('Kardeş modellerinden ayırt etmek zor: hepsi aynı araba!'));
    if (offer.priceTerm < -PRICE_REMARK) parts.push(t('Fiyatı fazla iddialı.'));
    else if (offer.priceTerm > PRICE_REMARK) parts.push(t('Bu paraya kaçırılmaz.'));
    if (!parts.length) parts.push(t('Sınıfının ortalamasında, sağlam ama sıradan bir araç.'));
    reviews.push({ magazine: t(mag.name), score, quote: parts.join(' ') });
    if (best) learn(state, model, best.k);
    if (worst) learn(state, model, worst.k);
    magIndex++;
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
  const buyers = t(segmentDef(model.segment).buyers);
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
    const name = lower(t(ATTR_NAMES[k]));
    const about = { buyers, model: model.name, attr: name };
    if (d > 8) lines.push({ text: t('{buyers} {model} modelinin {attr} konusundan çok memnun.', about), tone: 'good' });
    else if (d < -8) lines.push({ text: t('{buyers} {model} modelinin {attr} konusundan şikâyetçi.', about), tone: 'bad' });
    else lines.push({ text: t('{buyers} {model} modelinin {attr} konusunu “idare eder” buluyor; bu onlar için önemli.', about), tone: 'info' });
    learn(state, model, k);
  }
  const offer = playerOffer(state, model, market);
  const who = { buyers, model: model.name };
  if (offer.priceTerm < -PRICE_REMARK) lines.push({ text: t('{buyers} {model} modelini pahalı buluyor.', who), tone: 'bad' });
  else if (offer.priceTerm > PRICE_REMARK) lines.push({ text: t('{buyers} {model} modelinin fiyatını çok uygun buluyor.', who), tone: 'good' });
  if (offer.age <= -12) lines.push({ text: t('{buyers} {model} modelini artık eski moda buluyor; yeni modellere yöneliyorlar.', who), tone: 'bad' });
  else if (offer.age <= -4) lines.push({ text: t('{model} yaşlanıyor: rakiplerin yeni modelleri alıcıların ilgisini çekiyor.', { model: model.name }), tone: 'bad' });
  return lines;
}

/**
 * The first-month verdict: how the car actually did against its rivals, what buyers
 * liked and disliked. Also teaches the player about the segment's priorities.
 */
export function buildLaunchReport(state: GameState, model: CarModel): LaunchReport {
  const market = mainMarket(state, model);
  const yf = yearFloat(state.week);
  const since = model.history.filter((h) => h.week > model.launchWeek);
  const sold = since.reduce((a, h) => a + h.sold, 0);
  const built = since.reduce((a, h) => a + h.built, 0);
  const demand = Object.values(model.lastDemand ?? {}).reduce((a, b) => a + b, 0);
  const capacity =
    state.lines.filter((l) => l.modelId === model.id).reduce((a, l) => a + lineReport(state, l, model.stats.complexity).throughput, 0) *
    model.productionRate;
  const sm = segmentMarket(state, market, model.segment);
  const ranked = [...sm.offers].sort((a, b) => b.weight - a.weight);
  const mine = ranked.findIndex((o) => o.id === model.id);
  const offer = ranked[mine];
  const { scores } = modelScores(state, model);
  const w = segmentWeights(model.segment, market, yf);
  const contrib = ATTRS.map((k) => ({ k, v: w[k] * (scores[k] - 50) })).sort((a, b) => b.v - a.v);
  const praise = contrib.filter((c) => c.v > 0.6).slice(0, 2).map((c) => c.k);
  const complaints = contrib.filter((c) => c.v < -0.6).slice(-2).reverse().map((c) => c.k);
  for (const k of [...praise, ...complaints]) learn(state, model, k);
  const price: LaunchReport['price'] = !offer ? 'fair' : offer.priceTerm < -PRICE_REMARK ? 'high' : offer.priceTerm > PRICE_REMARK ? 'low' : 'fair';
  const advice: string[] = [];
  if (capacity < 0.05)
    advice.push(t('Araba şu an üretilmiyor: hattı yok, hat başka işte ya da üretim hızı sıfır. Fabrika ekranından bir hat ata; aksi halde bayilere araba gitmez.'));
  else if (demand > capacity * 1.3) advice.push(t('Talep üretimi aşıyor: bayilerde kuyruk var. Fiyatı artırabilir ya da fabrikaya hat ekleyebilirsin.'));
  if (model.inventory > Math.max(6, demand * 6)) advice.push(t('Stok birikiyor: fiyatı düşür ya da üretim hızını kıs.'));
  if (price === 'high') advice.push(t('Alıcılar aracı pahalı buluyor.'));
  if (price === 'low' && demand > capacity) advice.push(t('Fiyatın rakiplerin çok altında: daha pahalıya da satabilirsin.'));
  if (complaints.length)
    advice.push(t('Bir sonraki makyajda ya da yeni kuşakta {attrs} konusuna eğil.', { attrs: list(complaints.map((k) => lower(t(ATTR_NAMES[k])))) }));
  const open = openStates(state).length;
  if (open < 6) advice.push(t('Arabaların yalnızca {n} eyalette satılıyor: alıcıların çoğu onu hiç görmüyor. Harita ekranından komşu eyaletlerde bayi ara.', { n: open }));
  const poor = underServed(state).slice(0, 3);
  if (poor.length)
    advice.push(t('Servis yetersiz: {states} eyaletlerinde sahipler tamir için bekliyor. Haritadan servis aç.', { states: poor.map((id) => stateDef(id).name).join(', ') }));
  return {
    weeks: since.length,
    sold,
    built,
    demand,
    capacity,
    market,
    rank: mine + 1,
    offers: ranked.length,
    share: offer ? offer.weight / sm.totalWeight : 0,
    praise,
    complaints,
    price,
    advice,
  };
}
