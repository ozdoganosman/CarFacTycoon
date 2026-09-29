import { segmentDef } from '../data/segments';
import { stateDef } from '../data/states';
import { STATE_LIST } from './network';
import { mainMarket } from './feedback';
import { PRICE_REMARK, modelScores, playerOffer } from './market';
import { makeRng, pick, type Rng } from './rng';
import { defectText } from './testing';
import type { AttrKey, CarModel, GameState, MarketId, NewsLetter, SegmentId } from './types';
import { msg, t } from '../i18n';

// Letters from owners: a name, a town, a trade and a few lines about the car.
// What they write comes from the car itself (its strong and weak points
// against the class, the price, any faults that have surfaced, its age), so
// reading them teaches the player what buyers of the class notice.

export type Letter = NewsLetter;

const PRAISE: Record<AttrKey, string[]> = {
  accel: [
    msg('Kalkışta öyle atılıyor ki komşular hâlâ bu arabanın sırrını soruyor.'),
    msg('Yokuşları sanki düz yolmuş gibi çıkıyor; at arabalarını geride bırakmak ayrı bir keyif.'),
  ],
  topSpeed: [
    msg('Düz yolda öyle bir hızlanıyor ki hız göstergesine bakmaya korkuyorum.'),
    msg('Şehirler arası yolda bütün otomobilleri geçtik, kimse arkamızdan yetişemedi.'),
  ],
  economy: [
    msg('Benzin masrafı beklediğimin yarısı; ay sonunda cebimde para kalıyor.'),
    msg('Bir depo benzinle kasabaya gidip döndük, bir damla daha koymadık.'),
  ],
  comfort: [
    msg('Taş yollarda bile karım uyuyabiliyor, çocuklar arka koltukta şarkı söylüyor.'),
    msg('Uzun yolculuktan sonra belim hiç ağrımadı; salondaki koltuğumuzdan rahat.'),
  ],
  handling: [
    msg('Virajlarda raylı gibi gidiyor, direksiyon tam istediğim yere dönüyor.'),
    msg('Dağ yolundaki keskin dönemeçlerde bir an bile tedirgin olmadım.'),
  ],
  safety: [
    msg('Geçen ay bir kavşakta çarpıştık; araba ezildi ama hepimiz sapasağlam çıktık.'),
    msg('Frenleri öyle güçlü ki yola fırlayan bir çocuğun önünde tam zamanında durdum.'),
  ],
  reliability: [
    msg('İki yıldır tek bir kez bile yolda kalmadım; tamirciyi unuttum.'),
    msg('Kışın en soğuk sabahında bile ilk denemede çalıştı.'),
  ],
  prestige: [
    msg('Kulübün önüne park ettiğimde herkes pencereye koşuyor.'),
    msg('Kasabadaki herkes kimin geldiğini motorun sesinden anlıyor; gururluyum.'),
  ],
  practicality: [
    msg('Bütün aile, köpek ve pazar alışverişi rahatça sığıyor.'),
    msg('Bagajına tarladaki aletlerin hepsini koyup rahatça taşıyorum.'),
  ],
};

const COMPLAINT: Record<AttrKey, string[]> = {
  accel: [msg('Yokuşlarda o kadar ağır tırmanıyor ki arkamızdaki at arabası bile sabırsızlanıyor.'), msg('Kalkışta öyle nazlı ki kavşakları geçmek bir işkence.')],
  topSpeed: [msg('Düz yolda bile herkes bizi solluyor; son hızı hayal kırıklığı.'), msg('Şehirler arası yolda yarım gün kaybettik, bu kadar yavaş bir araba beklemiyordum.')],
  economy: [msg('Benzinci beni artık adımla çağırıyor; bu araba su gibi benzin içiyor.'), msg('Ay sonunda benzin faturası kiramdan fazla tuttu.')],
  comfort: [msg('Her çukurda kafamız tavana çarpıyor; karım bir daha binmem diyor.'), msg('Yarım saatlik yolculuktan sonra sırtım tutuluyor, koltuklar tahta gibi.')],
  handling: [msg('Virajlarda öyle yatıyor ki yolcular birbirine yapışıyor.'), msg('Direksiyon boşluklu; yolda araba istediği yere gidiyor.')],
  safety: [msg('Frenler zayıf; yokuş aşağı inerken yüreğim ağzıma geliyor.'), msg('Küçük bir sürtmede bile gövde kağıt gibi buruştu.')],
  reliability: [msg('Ayda bir yolda kalıyorum; tamirci artık ailemden biri gibi.'), msg('Soğuk sabahlarda çalıştırmak için yarım saat kol çeviriyorum.')],
  prestige: [msg('Komşular arabamı görünce kıs kıs gülüyor; pek gösterişli değil.'), msg('Kulübün önüne park etmeye utanıyorum.')],
  practicality: [msg('Alışveriş torbaları bile zor sığıyor; çocuklardan biri hep evde kalıyor.'), msg('Bagajı öyle küçük ki şapka kutusu bile sığmıyor.')],
};

/** Nothing to praise, nothing to complain about. */
const PLAIN = [msg('İşimi görüyor; ne şikâyetim var ne de övecek bir şeyim.'), msg('Sıradan ama dürüst bir otomobil.')];

const ROLES: Record<SegmentId, string[]> = {
  city: [msg('doktor'), msg('ebe'), msg('satış temsilcisi'), msg('avukat'), msg('öğretmen'), msg('terzi')],
  family: [msg('çiftçi'), msg('öğretmen'), msg('bakkal'), msg('memur'), msg('eczacı'), msg('demiryolu memuru')],
  sport: [msg('yarış meraklısı'), msg('genç bir mimar'), msg('subay'), msg('gazeteci'), msg('tiyatro oyuncusu')],
  luxury: [msg('bankacı'), msg('sanayici'), msg('opera sanatçısı'), msg('toprak sahibi'), msg('otel sahibi')],
  pickup: [msg('çiftçi'), msg('inşaat ustası'), msg('nalbur'), msg('sütçü'), msg('marangoz')],
  suv: [msg('ormancı'), msg('çiftlik sahibi'), msg('maden mühendisi'), msg('veteriner'), msg('avcı')],
};

// Places are names; the European ones are written the Turkish way (Brüksel, Viyana, Münih), so they are
// marked for the translators too.
const NAMES: Record<MarketId, { first: string[]; last: string[]; places: string[] }> = {
  usa: {
    first: ['John', 'Mary', 'William', 'Margaret', 'James', 'Elizabeth', 'George', 'Helen', 'Frank', 'Ruth', 'Walter', 'Dorothy'],
    last: ['Miller', 'Carter', 'Hughes', 'Parker', 'Turner', 'Bennett', 'Foster', 'Hayes', 'Coleman', 'Reed', 'Morgan', 'Price'],
    places: ['Ohio', 'Kansas', 'Pennsylvania', 'Oregon', 'Georgia', 'Iowa', 'Texas', 'Vermont', 'Michigan', 'Nebraska'],
  },
  europe: {
    first: ['Henri', 'Marie', 'Karl', 'Greta', 'Thomas', 'Edith', 'Luigi', 'Anna', 'Arthur', 'Louise', 'Hans', 'Clara'],
    last: ['Dubois', 'Weber', 'Clarke', 'Rossi', 'Moreau', 'Schmidt', 'Hughes', 'Bianchi', 'Lefèvre', 'Wagner', 'Evans', 'Conti'],
    places: [
      'Lyon',
      'Hamburg',
      'Manchester',
      msg('Torino'),
      msg('Brüksel'),
      msg('Viyana'),
      'Bordeaux',
      msg('Münih'),
      'Leeds',
      msg('Milano'),
    ],
  },
};

/** A few owners' letters for this month; the same model and month always give the same letters. */
export function customerLetters(s: GameState, m: CarModel, count = 3, rng: Rng = makeRng(hash(`${m.id}:${Math.floor(s.week / 4)}`))): Letter[] {
  const market = mainMarket(s, m);
  const { scores } = modelScores(s, m);
  const offer = playerOffer(s, m, market);
  const surfaced = m.defects.filter((d) => d.surfaced && !d.fixed);
  const w = segmentDef(m.segment).weights;
  // Buyers talk about what their class cares about and what stands out.
  const ranked = (Object.keys(scores) as AttrKey[]).map((k) => ({ k, d: scores[k] - 50, weight: w[k] })).sort((a, b) => b.weight * Math.abs(b.d) - a.weight * Math.abs(a.d));
  const good = ranked.filter((x) => x.d > 6);
  const bad = ranked.filter((x) => x.d < -6);
  const letters: Letter[] = [];
  // Several buyers never write the very same sentence (compared in Turkish, written in the player's language).
  const used = new Set<string>();
  const fresh = (list: string[]) => {
    const left = list.filter((x) => !used.has(x));
    const line = pick(rng, left.length ? left : list);
    used.add(line);
    return t(line);
  };
  // Owners write from where our cars are: the states with cars of ours on the road, more from where there are more.
  const owners = STATE_LIST.map((id) => ({ id, n: s.network?.states[id]?.parc ?? 0 })).filter((x) => x.n > 0);
  const ownersTotal = owners.reduce((a, x) => a + x.n, 0);
  const home = (): string | undefined => {
    if (!ownersTotal) return undefined;
    let r = rng() * ownersTotal;
    for (const x of owners) if ((r -= x.n) <= 0) return stateDef(x.id).name;
    return stateDef(owners[owners.length - 1].id).name;
  };
  for (let i = 0; i < count; i++) {
    const names = NAMES[pick(rng, m.markets.length ? m.markets : [market])];
    const parts: string[] = [];
    let score = 3;
    const g = good[i % Math.max(1, good.length)];
    const b = bad[i % Math.max(1, bad.length)];
    if (g && (rng() < 0.75 || !b)) {
      parts.push(fresh(PRAISE[g.k]));
      score += 1;
    }
    if (b && (rng() < 0.6 || !g)) {
      parts.push(fresh(COMPLAINT[b.k]));
      score -= 1;
    }
    if (surfaced.length && rng() < 0.5) {
      const d = pick(rng, surfaced);
      parts.push(t('Bir derdim var: {defect}. Bayi “biliyoruz” deyip geçiştirdi.', { defect: defectText(d).toLowerCase() }));
      score -= 1;
    }
    if (offer.priceTerm > PRICE_REMARK && rng() < 0.6) {
      parts.push(t('Bu paraya bundan iyisi yok; iki maaşımı biriktirip aldım ve hiç pişman değilim.'));
      score += 0.5;
    } else if (offer.priceTerm < -PRICE_REMARK && rng() < 0.6) {
      parts.push(t('Yalnız fiyatı çok tuzlu; bu paraya iki at ve bir araba alınırdı.'));
      score -= 0.5;
    }
    if (offer.age <= -8 && rng() < 0.6) {
      parts.push(t('Artık yollarda daha yeni ve modern arabalar görüyorum; bizimki biraz eskidi.'));
      score -= 0.5;
    }
    if (!parts.length) parts.push(fresh(PLAIN));
    const stars = Math.max(1, Math.min(5, Math.round(score + (rng() - 0.5) * 0.8)));
    letters.push({
      name: `${pick(rng, names.first)} ${pick(rng, names.last)}`,
      place: home() ?? t(pick(rng, names.places)),
      role: t(pick(rng, ROLES[m.segment])),
      stars,
      text: parts.join(' '),
      tone: stars >= 4 ? 'good' : stars <= 2 ? 'bad' : 'mixed',
    });
  }
  return letters;
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
