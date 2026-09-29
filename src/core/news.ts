import { segmentDef, ATTR_NAMES } from '../data/segments';
import { MARKETS } from '../data/markets';
import { TECH_NEWS, WORLD_NEWS, genericStory, type Story } from '../data/technews';
import { customerLetters } from './letters';
import { modelScores, segmentMarket, priceNow } from './market';
import { lineReport } from './factory';
import type { ResearchDef } from './research';
import { yearFloat, yearOf } from './time';
import type { AttrKey, CarModel, GameState, MarketId, NewsIssue, NewsStoryData } from './types';
import { money, pushModal } from './util';
import { pctWith } from './turkish';
import { dec, fmtNumber, fmtPercent } from '../i18n/format';
import { lower, msg, t } from '../i18n';

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

const fmt = (n: number) => fmtNumber(n);

function worldFor(year: number): NewsStoryData | undefined {
  const w = WORLD_NEWS.find((x) => x.year === year);
  return w ? { headline: t(w.headline), body: t(w.body) } : undefined;
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
  const name = t(MARKETS.find((x) => x.id === m)?.name ?? m);
  return {
    headline: t('{market} Pazarı: Geçen Yılın Satışları', { market: name }),
    body:
      mine > 0
        ? t('Geçen yıl {market} pazarında {count} yeni otomobil satıldı. {company} bunun {share} aldı.', {
            market: name,
            count: fmt(total),
            company: s.company.name,
            share: pctWith(mine / total, 'possAcc', 1),
          })
        : t('Geçen yıl {market} pazarında {count} yeni otomobil satıldı. Yeni firmalar pazarda yer açmaya çalışıyor.', { market: name, count: fmt(total) }),
  };
}

/** A technology's story in the player's language. */
function techStory(d: ResearchDef): Story {
  const st = TECH_NEWS[d.id];
  if (st) return { headline: t(st.headline), deck: t(st.deck), body: t(st.body) };
  return genericStory(t(d.name), t(d.desc));
}

/** New technologies of the year on one front page: the biggest one leads. */
export function techIssue(s: GameState, fresh: ResearchDef[], year: number): NewsIssue | null {
  const world = worldFor(year);
  if (!fresh.length && !world) return null;
  const sorted = [...fresh].sort((a, b) => b.cost - a.cost);
  const lead = sorted[0];
  const side: NewsStoryData[] = sorted.slice(1, 4).map((d) => {
    const st = techStory(d);
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
  const st = techStory(lead);
  const tech = t(lead.name);
  return {
    id: `n${s.nextId++}`,
    week: s.week,
    kind: 'tech',
    lead: {
      headline: st.headline,
      deck: st.deck,
      body: st.body,
      art: { kind: 'tech', area: lead.category },
      caption: t('{tech}. Ar-Ge bölümünüz bu yenilik üzerinde çalışabilir.', { tech }),
      paragraphs: [
        lead.passive
          ? t('Mühendislerin görüşüne göre {tech} bir kez öğrenildiğinde bütün yeni otomobillere uygulanabilecek.', { tech: lower(tech) })
          : t('Uzmanlar {tech} için ilk yıllarda yüksek maliyet ve çıraklık sancıları bekliyor; yaygınlaştıkça ucuzlayacağı tahmin ediliyor.', { tech: lower(tech) }),
        lead.effects ? t('Beklenen etkisi: {effects}.', { effects: lead.effects }) : '',
      ].filter(Boolean),
    },
    side,
    world,
  };
}

const SLOGANS: Record<AttrKey, string> = {
  accel: msg('Yokuşların hâkimi!'),
  topSpeed: msg('Yolların en hızlısı!'),
  economy: msg('Az yakar, çok gider!'),
  comfort: msg('Evinizin konforu yolda!'),
  handling: msg('Virajlar onun için yaratıldı!'),
  safety: msg('Aileniz emin ellerde!'),
  reliability: msg('Sizi asla yolda bırakmaz!'),
  prestige: msg('Seçkinlerin tercihi!'),
  practicality: msg('Herkese ve her şeye yer var!'),
};

const BLURB: Record<AttrKey, string> = {
  accel: msg('Çevik ve güçlü motor'),
  topSpeed: msg('Sınıfının en yüksek hızı'),
  economy: msg('Şaşırtıcı yakıt ekonomisi'),
  comfort: msg('Yumuşacık yolculuk'),
  handling: msg('Kusursuz yol tutuş'),
  safety: msg('Sağlam ve güvenli gövde'),
  reliability: msg('Yıllarca sorunsuz hizmet'),
  prestige: msg('Göz alıcı çizgiler'),
  practicality: msg('Geniş iç hacim'),
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
  const marketName = t(MARKETS.find((x) => x.id === st.market)?.name ?? st.market);
  const segment = lower(t(seg.name));
  const company = s.company.name;
  const model = m.name;
  const { scores } = modelScores(s, m);
  const best = (Object.keys(scores) as AttrKey[]).sort((a, b) => scores[b] - scores[a]).slice(0, 3);
  const weekly = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
  const lines = s.lines.filter((l) => l.modelId === m.id);
  const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
  const price = priceNow(m, s.week);
  const headline =
    reason.kind === 'leader'
      ? t('{model}, {segment} sınıfının zirvesinde!', { model, segment })
      : reason.kind === 'company'
        ? t('{company} bininci otomobilini teslim etti', { company })
        : reason.units >= 1_000_000
          ? t('Bir milyonuncu {model} fabrikadan çıktı!', { model })
          : t('{count}. {model} sahibine kavuştu', { count: fmt(reason.units), model });
  const deck =
    reason.kind === 'leader'
      ? t('{company}, {market} pazarında rakiplerini geride bıraktı; bayilerde kuyruk var', { company, market: marketName })
      : t('{company} otomobiline talep durmak bilmiyor: haftada {count} sipariş', { company, count: fmt(weekly) });
  const factory = { n: lines.length, count: fmt(cap) };
  const paragraphs = [
    t(
      '{company} fabrikasından çıkan {model}, {market} pazarındaki {segment} sınıfında {n} otomobil arasında {rank}. sıraya yükseldi ve sınıfın {share} aldı. Şimdiye kadar {sold} adet satıldı.',
      { company, model, market: marketName, segment, n: st.of, rank: st.rank, share: pctWith(st.share, 'possAcc', 1), sold: fmt(m.unitsSold) },
    ),
    t('Bayiler müşterilerin en çok {attrs} konusundaki üstünlüğünü övdüğünü anlatıyor. Otomobil dergilerinin ortalama notu {score}.', {
      attrs: best.map((k) => lower(t(ATTR_NAMES[k]))).join(', '),
      score: dec(m.reviewScore),
    }),
    cap > 0
      ? weekly > cap * 1.1
        ? t('Fabrika {n} hatta haftada {count} otomobil üretebiliyor. Siparişler üretimi aşıyor; alıcılar teslimat için haftalarca bekliyor.', factory)
        : t('Fabrika {n} hatta haftada {count} otomobil üretebiliyor. Şirket yetkilileri talebi karşılayabildiklerini söylüyor.', factory)
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
      caption: yf < 1930 ? t('{company} {model}, fabrika avlusunda.', { company, model }) : t('{company} {model}, bayi vitrininde.', { company, model }),
    },
    stats: [
      { label: t('Toplam satış'), value: fmt(m.unitsSold) },
      { label: t('Haftalık talep'), value: fmt(weekly) },
      { label: t('Sınıf payı'), value: fmtPercent(st.share, 1) },
      { label: t('Fiyatı'), value: money(price) },
    ],
    side: [
      {
        headline: t('Rakipler Telaşta'),
        body: t(
          'Sınıfın köklü üreticileri {model} karşısında fiyat indirimi ve yeni model hazırlıklarından söz ediyor. Sektör gözlemcileri önümüzdeki yıllarda rekabetin sertleşeceğini düşünüyor.',
          { model },
        ),
      },
    ],
    world: worldFor(year),
    ad: {
      modelId: m.id,
      slogan: t(SLOGANS[best[0]]),
      lines: best.map((k) => t(BLURB[k])),
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
