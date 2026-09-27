import { segmentDef } from '../data/segments';
import { mainMarket } from './feedback';
import { PRICE_REMARK, modelScores, playerOffer } from './market';
import { makeRng, pick, type Rng } from './rng';
import { defectText } from './testing';
import type { AttrKey, CarModel, GameState, MarketId, NewsLetter, SegmentId } from './types';

// Letters from owners: a name, a town, a trade and a few lines about the car.
// What they write comes from the car itself (its strong and weak points
// against the class, the price, any faults that have surfaced, its age), so
// reading them teaches the player what buyers of the class notice.

export type Letter = NewsLetter;

const PRAISE: Record<AttrKey, string[]> = {
  accel: [
    'Kalkışta öyle atılıyor ki komşular hâlâ bu arabanın sırrını soruyor.',
    'Yokuşları sanki düz yolmuş gibi çıkıyor; at arabalarını geride bırakmak ayrı bir keyif.',
  ],
  topSpeed: [
    'Düz yolda öyle bir hızlanıyor ki hız göstergesine bakmaya korkuyorum.',
    'Şehirler arası yolda bütün otomobilleri geçtik, kimse arkamızdan yetişemedi.',
  ],
  economy: [
    'Benzin masrafı beklediğimin yarısı; ay sonunda cebimde para kalıyor.',
    'Bir depo benzinle kasabaya gidip döndük, bir damla daha koymadık.',
  ],
  comfort: [
    'Taş yollarda bile karım uyuyabiliyor, çocuklar arka koltukta şarkı söylüyor.',
    'Uzun yolculuktan sonra belim hiç ağrımadı; salondaki koltuğumuzdan rahat.',
  ],
  handling: [
    'Virajlarda raylı gibi gidiyor, direksiyon tam istediğim yere dönüyor.',
    'Dağ yolundaki keskin dönemeçlerde bir an bile tedirgin olmadım.',
  ],
  safety: [
    'Geçen ay bir kavşakta çarpıştık; araba ezildi ama hepimiz sapasağlam çıktık.',
    'Frenleri öyle güçlü ki yola fırlayan bir çocuğun önünde tam zamanında durdum.',
  ],
  reliability: [
    'İki yıldır tek bir kez bile yolda kalmadım; tamirciyi unuttum.',
    'Kışın en soğuk sabahında bile ilk denemede çalıştı.',
  ],
  prestige: [
    'Kulübün önüne park ettiğimde herkes pencereye koşuyor.',
    'Kasabadaki herkes kimin geldiğini motorun sesinden anlıyor; gururluyum.',
  ],
  practicality: [
    'Bütün aile, köpek ve pazar alışverişi rahatça sığıyor.',
    'Bagajına tarladaki aletlerin hepsini koyup rahatça taşıyorum.',
  ],
};

const COMPLAINT: Record<AttrKey, string[]> = {
  accel: ['Yokuşlarda o kadar ağır tırmanıyor ki arkamızdaki at arabası bile sabırsızlanıyor.', 'Kalkışta öyle nazlı ki kavşakları geçmek bir işkence.'],
  topSpeed: ['Düz yolda bile herkes bizi solluyor; son hızı hayal kırıklığı.', 'Şehirler arası yolda yarım gün kaybettik, bu kadar yavaş bir araba beklemiyordum.'],
  economy: ['Benzinci beni artık adımla çağırıyor; bu araba su gibi benzin içiyor.', 'Ay sonunda benzin faturası kiramdan fazla tuttu.'],
  comfort: ['Her çukurda kafamız tavana çarpıyor; karım bir daha binmem diyor.', 'Yarım saatlik yolculuktan sonra sırtım tutuluyor, koltuklar tahta gibi.'],
  handling: ['Virajlarda öyle yatıyor ki yolcular birbirine yapışıyor.', 'Direksiyon boşluklu; yolda araba istediği yere gidiyor.'],
  safety: ['Frenler zayıf; yokuş aşağı inerken yüreğim ağzıma geliyor.', 'Küçük bir sürtmede bile gövde kağıt gibi buruştu.'],
  reliability: ['Ayda bir yolda kalıyorum; tamirci artık ailemden biri gibi.', 'Soğuk sabahlarda çalıştırmak için yarım saat kol çeviriyorum.'],
  prestige: ['Komşular arabamı görünce kıs kıs gülüyor; pek gösterişli değil.', 'Kulübün önüne park etmeye utanıyorum.'],
  practicality: ['Alışveriş torbaları bile zor sığıyor; çocuklardan biri hep evde kalıyor.', 'Bagajı öyle küçük ki şapka kutusu bile sığmıyor.'],
};

const ROLES: Record<SegmentId, string[]> = {
  city: ['doktor', 'ebe', 'satış temsilcisi', 'avukat', 'öğretmen', 'terzi'],
  family: ['çiftçi', 'öğretmen', 'bakkal', 'memur', 'eczacı', 'demiryolu memuru'],
  sport: ['yarış meraklısı', 'genç bir mimar', 'subay', 'gazeteci', 'tiyatro oyuncusu'],
  luxury: ['bankacı', 'sanayici', 'opera sanatçısı', 'toprak sahibi', 'otel sahibi'],
  pickup: ['çiftçi', 'inşaat ustası', 'nalbur', 'sütçü', 'marangoz'],
  suv: ['ormancı', 'çiftlik sahibi', 'maden mühendisi', 'veteriner', 'avcı'],
};

const NAMES: Record<MarketId, { first: string[]; last: string[]; places: string[] }> = {
  usa: {
    first: ['John', 'Mary', 'William', 'Margaret', 'James', 'Elizabeth', 'George', 'Helen', 'Frank', 'Ruth', 'Walter', 'Dorothy'],
    last: ['Miller', 'Carter', 'Hughes', 'Parker', 'Turner', 'Bennett', 'Foster', 'Hayes', 'Coleman', 'Reed', 'Morgan', 'Price'],
    places: ['Ohio', 'Kansas', 'Pennsylvania', 'Oregon', 'Georgia', 'Iowa', 'Texas', 'Vermont', 'Michigan', 'Nebraska'],
  },
  europe: {
    first: ['Henri', 'Marie', 'Karl', 'Greta', 'Thomas', 'Edith', 'Luigi', 'Anna', 'Arthur', 'Louise', 'Hans', 'Clara'],
    last: ['Dubois', 'Weber', 'Clarke', 'Rossi', 'Moreau', 'Schmidt', 'Hughes', 'Bianchi', 'Lefèvre', 'Wagner', 'Evans', 'Conti'],
    places: ['Lyon', 'Hamburg', 'Manchester', 'Torino', 'Brüksel', 'Viyana', 'Bordeaux', 'Münih', 'Leeds', 'Milano'],
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
  for (let i = 0; i < count; i++) {
    const names = NAMES[pick(rng, m.markets.length ? m.markets : [market])];
    const parts: string[] = [];
    let score = 3;
    const g = good[i % Math.max(1, good.length)];
    const b = bad[i % Math.max(1, bad.length)];
    if (g && (rng() < 0.75 || !b)) {
      parts.push(pick(rng, PRAISE[g.k]));
      score += 1;
    }
    if (b && (rng() < 0.6 || !g)) {
      parts.push(pick(rng, COMPLAINT[b.k]));
      score -= 1;
    }
    if (surfaced.length && rng() < 0.5) {
      const d = pick(rng, surfaced);
      parts.push(`Bir derdim var: ${defectText(d).toLowerCase()}. Bayi “biliyoruz” deyip geçiştirdi.`);
      score -= 1;
    }
    if (offer.priceTerm > PRICE_REMARK && rng() < 0.6) {
      parts.push('Bu paraya bundan iyisi yok; iki maaşımı biriktirip aldım ve hiç pişman değilim.');
      score += 0.5;
    } else if (offer.priceTerm < -PRICE_REMARK && rng() < 0.6) {
      parts.push('Yalnız fiyatı çok tuzlu; bu paraya iki at ve bir araba alınırdı.');
      score -= 0.5;
    }
    if (offer.age <= -8 && rng() < 0.6) {
      parts.push('Artık yollarda daha yeni ve modern arabalar görüyorum; bizimki biraz eskidi.');
      score -= 0.5;
    }
    if (!parts.length) parts.push(pick(rng, ['İşimi görüyor; ne şikâyetim var ne de övecek bir şeyim.', 'Sıradan ama dürüst bir otomobil.']));
    const stars = Math.max(1, Math.min(5, Math.round(score + (rng() - 0.5) * 0.8)));
    letters.push({
      name: `${pick(rng, names.first)} ${pick(rng, names.last)}`,
      place: pick(rng, names.places),
      role: pick(rng, ROLES[m.segment]),
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
