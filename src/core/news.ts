import { segmentDef, ATTR_NAMES } from '../data/segments';
import { MARKETS } from '../data/markets';
import { TECH_NEWS, WORLD_NEWS, genericStory } from '../data/technews';
import { customerLetters } from './letters';
import { modelScores, segmentMarket, priceNow } from './market';
import { lineReport } from './factory';
import type { ResearchDef } from './research';
import { yearFloat, yearOf } from './time';
import type { AttrKey, CarModel, GameState, MarketId, NewsIssue, NewsStoryData } from './types';
import { money, pushModal } from './util';
import { pctWith } from './turkish';

// Front pages: the day new technology appears in the world, and the day one of
// the player's cars takes off. Issues are kept for the archive and shown as a
// corner card that does not stop the clock.

const MAX_ISSUES = 60;

export function publish(s: GameState, issue: NewsIssue) {
  s.news ??= [];
  s.news.push(issue);
  if (s.news.length > MAX_ISSUES) s.news.splice(0, s.news.length - MAX_ISSUES);
  // Only the newest paper waits in the corner.
  s.modals = s.modals.filter((m) => m.kind !== 'news');
  pushModal(s, { kind: 'news', newsId: issue.id });
}

const fmt = (n: number) => Math.round(n).toLocaleString('tr-TR');

function worldFor(year: number): NewsStoryData | undefined {
  const w = WORLD_NEWS.find((x) => x.year === year);
  return w ? { headline: w.headline, body: w.body } : undefined;
}

/** Last year's sales in a market, for a line of trade news. */
function marketLine(s: GameState, year: number): NewsStoryData | undefined {
  const m: MarketId = s.company.hq;
  let total = 0;
  let mine = 0;
  for (const [k, v] of Object.entries(s.segmentSales)) {
    const [y, mk, , who] = k.split(':');
    if (Number(y) !== year - 1 || mk !== m) continue;
    if (who === 'p') mine += v;
    else total += v;
  }
  if (total <= 0) return undefined;
  const name = MARKETS.find((x) => x.id === m)?.name ?? m;
  return {
    headline: `${name} Pazarı: Geçen Yılın Satışları`,
    body: `Geçen yıl ${name} pazarında ${fmt(total)} yeni otomobil satıldı. ${mine > 0 ? `${s.company.name} bunun ${pctWith(mine / total, 'possAcc', 1)} aldı.` : 'Yeni firmalar pazarda yer açmaya çalışıyor.'}`,
  };
}

/** New technologies of the year on one front page: the biggest one leads. */
export function techIssue(s: GameState, fresh: ResearchDef[], year: number): NewsIssue | null {
  const world = worldFor(year);
  if (!fresh.length && !world) return null;
  const sorted = [...fresh].sort((a, b) => b.cost - a.cost);
  const lead = sorted[0];
  const story = (d: ResearchDef) => TECH_NEWS[d.id] ?? genericStory(d.name, d.desc);
  const side: NewsStoryData[] = sorted.slice(1, 4).map((d) => {
    const st = story(d);
    return { headline: st.headline, deck: st.deck, body: st.body };
  });
  const trade = marketLine(s, year);
  if (trade && side.length < 3) side.push(trade);
  if (!lead) {
    // A quiet year for engineers: the world news leads.
    return {
      id: `n${s.nextId++}`,
      week: s.week,
      kind: 'tech',
      lead: { ...world!, art: { kind: 'tech', area: 'Motor' } },
      side,
    };
  }
  const st = story(lead);
  return {
    id: `n${s.nextId++}`,
    week: s.week,
    kind: 'tech',
    lead: {
      headline: st.headline,
      deck: st.deck,
      body: st.body,
      art: { kind: 'tech', area: lead.category },
      caption: `${lead.name}. Ar-Ge bölümünüz bu yenilik üzerinde çalışabilir.`,
      paragraphs: [
        lead.passive
          ? `Mühendislerin görüşüne göre ${lead.name.toLowerCase()} bir kez öğrenildiğinde bütün yeni otomobillere uygulanabilecek.`
          : `Uzmanlar ${lead.name.toLowerCase()} için ilk yıllarda yüksek maliyet ve çıraklık sancıları bekliyor; yaygınlaştıkça ucuzlayacağı tahmin ediliyor.`,
        lead.effects ? `Beklenen etkisi: ${lead.effects}.` : '',
      ].filter(Boolean),
    },
    side,
    world,
  };
}

const SLOGANS: Record<AttrKey, string> = {
  accel: 'Yokuşların hâkimi!',
  topSpeed: 'Yolların en hızlısı!',
  economy: 'Az yakar, çok gider!',
  comfort: 'Evinizin konforu yolda!',
  handling: 'Virajlar onun için yaratıldı!',
  safety: 'Aileniz emin ellerde!',
  reliability: 'Sizi asla yolda bırakmaz!',
  prestige: 'Seçkinlerin tercihi!',
  practicality: 'Herkese ve her şeye yer var!',
};

const BLURB: Record<AttrKey, string> = {
  accel: 'Çevik ve güçlü motor',
  topSpeed: 'Sınıfının en yüksek hızı',
  economy: 'Şaşırtıcı yakıt ekonomisi',
  comfort: 'Yumuşacık yolculuk',
  handling: 'Kusursuz yol tutuş',
  safety: 'Sağlam ve güvenli gövde',
  reliability: 'Yıllarca sorunsuz hizmet',
  prestige: 'Göz alıcı çizgiler',
  practicality: 'Geniş iç hacim',
};

/** Where the model stands in its class in its main market: rank, share and weekly demand. */
function standing(s: GameState, m: CarModel) {
  const market = m.markets.includes(s.company.hq) ? s.company.hq : m.markets[0];
  const sm = segmentMarket(s, market, m.segment);
  const total = sm.offers.reduce((a, o) => a + o.weight, 0) + sm.othersWeight;
  const ranked = [...sm.offers].sort((a, b) => b.weight - a.weight);
  const rank = ranked.findIndex((o) => o.kind === 'player' && o.id === m.id) + 1;
  const me = ranked[rank - 1];
  return { market, rank, of: ranked.length, share: me ? me.weight / total : 0 };
}

/** A celebratory front page for a car that has taken off. */
export function boomIssue(s: GameState, m: CarModel, reason: { kind: 'units'; units: number } | { kind: 'leader' } | { kind: 'company' }): NewsIssue {
  const yf = yearFloat(s.week);
  const seg = segmentDef(m.segment);
  const st = standing(s, m);
  const marketName = MARKETS.find((x) => x.id === st.market)?.name ?? st.market;
  const { scores } = modelScores(s, m);
  const best = (Object.keys(scores) as AttrKey[]).sort((a, b) => scores[b] - scores[a]).slice(0, 3);
  const weekly = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
  const lines = s.lines.filter((l) => l.modelId === m.id);
  const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
  const price = priceNow(m, s.week);
  const headline =
    reason.kind === 'leader'
      ? `${m.name}, ${seg.name.toLowerCase()} sınıfının zirvesinde!`
      : reason.kind === 'company'
        ? `${s.company.name} bininci otomobilini teslim etti`
        : reason.units >= 1_000_000
          ? `Bir milyonuncu ${m.name} fabrikadan çıktı!`
          : `${fmt(reason.units)}. ${m.name} sahibine kavuştu`;
  const deck =
    reason.kind === 'leader'
      ? `${s.company.name}, ${marketName} pazarında rakiplerini geride bıraktı; bayilerde kuyruk var`
      : `${s.company.name} otomobiline talep durmak bilmiyor: haftada ${fmt(weekly)} sipariş`;
  const paragraphs = [
    `${s.company.name} fabrikasından çıkan ${m.name}, ${marketName} pazarındaki ${seg.name.toLowerCase()} sınıfında ${st.of} otomobil arasında ${st.rank}. sıraya yükseldi ve sınıfın ${pctWith(st.share, 'possAcc', 1)} aldı. Şimdiye kadar ${fmt(m.unitsSold)} adet satıldı.`,
    `Bayiler müşterilerin en çok ${best.map((k) => ATTR_NAMES[k].toLowerCase()).join(', ')} konusundaki üstünlüğünü övdüğünü anlatıyor. Otomobil dergilerinin ortalama notu ${m.reviewScore.toFixed(1)}.`,
    cap > 0
      ? `Fabrika ${lines.length} hatta haftada ${fmt(cap)} otomobil üretebiliyor. ${weekly > cap * 1.1 ? 'Siparişler üretimi aşıyor; alıcılar teslimat için haftalarca bekliyor.' : 'Şirket yetkilileri talebi karşılayabildiklerini söylüyor.'}`
      : '',
  ].filter(Boolean);
  const year = yearOf(s.week);
  return {
    id: `n${s.nextId++}`,
    week: s.week,
    kind: 'boom',
    lead: {
      headline,
      deck,
      body: paragraphs[0],
      paragraphs: paragraphs.slice(1),
      art: { kind: 'car', modelId: m.id },
      caption: `${s.company.name} ${m.name}, ${yf < 1930 ? 'fabrika avlusunda' : 'bayi vitrininde'}.`,
    },
    stats: [
      { label: 'Toplam satış', value: fmt(m.unitsSold) },
      { label: 'Haftalık talep', value: fmt(weekly) },
      { label: 'Sınıf payı', value: `%${(st.share * 100).toFixed(1)}` },
      { label: 'Fiyatı', value: money(price) },
    ],
    side: [
      {
        headline: 'Rakipler Telaşta',
        body: `Sınıfın köklü üreticileri ${m.name} karşısında fiyat indirimi ve yeni model hazırlıklarından söz ediyor. Sektör gözlemcileri önümüzdeki yıllarda rekabetin sertleşeceğini düşünüyor.`,
      },
    ],
    world: worldFor(year),
    ad: {
      modelId: m.id,
      slogan: SLOGANS[best[0]],
      lines: best.map((k) => BLURB[k]),
      price,
    },
    letters: customerLetters(s, m, 2),
  };
}

/** A model's own milestones; the company's first thousand cars get a page of their own. */
const UNIT_MILESTONES = [10_000, 100_000, 1_000_000];

/** Monthly: has any car earned a front page? At most one celebration a quarter. */
export function checkBoom(s: GameState) {
  if ((s.flags.lastBoomWeek ?? -99) > s.week - 13) return;
  const total = s.models.reduce((a, m) => a + m.unitsSold, 0);
  if (!s.flags.firstThousand && total >= 1000) {
    const best = [...s.models].filter((m) => m.status === 'active').sort((a, b) => b.unitsSold - a.unitsSold)[0];
    s.flags.firstThousand = s.week;
    if (best) {
      publish(s, boomIssue(s, best, { kind: 'company' }));
      s.flags.lastBoomWeek = s.week;
      return;
    }
  }
  for (const m of s.models) {
    if (m.status !== 'active') continue;
    const flags = (m.newsFlags ??= []);
    const ms = UNIT_MILESTONES.filter((u) => m.unitsSold >= u && !flags.includes(`u${u}`)).pop();
    if (ms !== undefined) {
      // Older milestones passed without a paper are simply noted.
      for (const u of UNIT_MILESTONES) if (u <= ms && !flags.includes(`u${u}`)) flags.push(`u${u}`);
      publish(s, boomIssue(s, m, { kind: 'units', units: ms }));
      s.flags.lastBoomWeek = s.week;
      return;
    }
    if (!flags.includes('leader') && m.unitsSold > 50 && standing(s, m).rank === 1) {
      flags.push('leader');
      publish(s, boomIssue(s, m, { kind: 'leader' }));
      s.flags.lastBoomWeek = s.week;
      return;
    }
  }
}
