import { msg, t } from '../i18n';
import { fmtPercent } from '../i18n/format';

// Engineering know-how: improvements a company learns once and then builds
// into every new design (magneto ignition, shock absorbers, balloon tyres…).
// They are not options in the designer; research them and the next car has
// them. Rivals pick them up a few years after they appear.

export type KnowhowArea = 'Motor' | 'Şanzıman' | 'Şasi ve süspansiyon' | 'Güvenlik' | 'Donanım';

export interface KnowhowEffects {
  comfort?: number;
  handling?: number;
  safety?: number;
  reliability?: number;
  practicality?: number;
  prestige?: number;
  /** Multipliers. */
  power?: number;
  fuel?: number;
  cd?: number;
  cost?: number;
  mass?: number;
}

export interface KnowhowDef {
  id: string;
  name: string;
  area: KnowhowArea;
  year: number;
  desc: string;
  effects: KnowhowEffects;
  /** Mature research price (1900 dollars) and duration (weeks). */
  cost: number;
  weeks: number;
  requires?: string[];
}

export const KNOWHOW: KnowhowDef[] = [
  {
    id: 'kh:honeycomb',
    name: msg('Petek radyatör'),
    area: msg('Motor'),
    year: 1901,
    desc: msg('Yüzlerce ince borudan oluşan radyatör suyu çok daha iyi soğutur: motor uzun yokuşlarda kaynamaz.'),
    effects: { reliability: 2, power: 1.02 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:magneto',
    name: msg('Yüksek gerilim manyetosu'),
    area: msg('Motor'),
    year: 1902,
    desc: msg('Kıvılcımı aküden değil, motorun çevirdiği mıknatıstan alan ateşleme. Kızgın tüplü ateşlemeye veda: motor her havada çalışır.'),
    effects: { reliability: 3, power: 1.03 },
    cost: 3000,
    weeks: 10,
  },
  {
    id: 'kh:shaftDrive',
    name: msg('Kardan mili tahriki'),
    area: msg('Şanzıman'),
    year: 1902,
    desc: msg('Arka tekerlekleri zincir yerine kapalı bir milden döndürmek: yağ ve çamur sıçramaz, zincir kopmaz, araba sessizleşir.'),
    effects: { reliability: 2, comfort: 2, practicality: 1 },
    cost: 3000,
    weeks: 10,
  },
  {
    id: 'kh:frictionDampers',
    name: msg('Sürtünmeli amortisör'),
    area: msg('Şasi ve süspansiyon'),
    year: 1905,
    desc: msg('Yayların sonsuz sekmesini birbirine sürtünen disklerle frenler. Araba çukurdan çıkınca sallanıp durmaz.'),
    effects: { comfort: 3, handling: 2 },
    cost: 2500,
    weeks: 8,
  },
  {
    id: 'kh:detachableRims',
    name: msg('Sökülebilir jant'),
    area: msg('Donanım'),
    year: 1906,
    desc: msg('Patlayan lastik yolda saatlerce yamanmaz; jantıyla sökülüp yedeği takılır.'),
    effects: { practicality: 3, reliability: 1 },
    cost: 1500,
    weeks: 6,
  },
  {
    id: 'kh:detachableHead',
    name: msg('Sökülebilir silindir kapağı'),
    area: msg('Motor'),
    year: 1908,
    desc: msg('Blok ve kapak ayrı dökülür: döküm ucuzlar, supap ve piston bakımı kolaylaşır.'),
    effects: { cost: 0.98, reliability: 1 },
    cost: 2500,
    weeks: 8,
  },
  {
    id: 'kh:pressureLube',
    name: msg('Basınçlı yağlama'),
    area: msg('Motor'),
    year: 1912,
    desc: msg('Pompa yağı yataklara basınçla iter; yalnızca sıçratmaya güvenilmez. Yataklar yüksek devirde erimez.'),
    effects: { reliability: 3, power: 1.02 },
    cost: 3500,
    weeks: 10,
  },
  {
    id: 'kh:alloyPistons',
    name: msg('Alüminyum piston'),
    area: msg('Motor'),
    year: 1915,
    desc: msg('Dökme demirin üçte biri ağırlığında pistonlar: motor daha çabuk devir alır, yatakları daha az zorlar.'),
    effects: { power: 1.04, fuel: 0.98 },
    cost: 4000,
    weeks: 12,
    requires: ['kh:pressureLube'],
  },
  {
    id: 'kh:airFilter',
    name: msg('Hava filtresi'),
    area: msg('Motor'),
    year: 1918,
    desc: msg('Toprak yolların tozu karbüratöre girmeden tutulur; silindirler yıllarca aşınmaz.'),
    effects: { reliability: 2 },
    cost: 2000,
    weeks: 5,
  },
  {
    id: 'kh:thermostat',
    name: msg('Termostat'),
    area: msg('Motor'),
    year: 1922,
    desc: msg('Motor ısınana kadar suyu radyatöre göndermez. Soğuk sabahlarda çabuk ısınır, az yakar.'),
    effects: { fuel: 0.97, reliability: 1, comfort: 1 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:oilFilter',
    name: msg('Yağ filtresi'),
    area: msg('Motor'),
    year: 1923,
    desc: msg('Yağdaki metal tozunu süzer: yataklar ve silindirler çok daha uzun ömürlü olur.'),
    effects: { reliability: 3 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:balloonTires',
    name: msg('Balon lastik'),
    area: msg('Şasi ve süspansiyon'),
    year: 1923,
    desc: msg('Geniş, düşük basınçlı lastikler yolun sarsıntısını yutar. Konfor büyük ölçüde artar.'),
    effects: { comfort: 4, handling: 1 },
    cost: 3500,
    weeks: 8,
  },
  {
    id: 'kh:hydraulicDampers',
    name: msg('Hidrolik amortisör'),
    area: msg('Şasi ve süspansiyon'),
    year: 1925,
    desc: msg('Yağın küçük deliklerden geçmesiyle çalışan amortisör: küçük darbelerde yumuşak, büyüklerde sıkı.'),
    effects: { comfort: 4, handling: 3 },
    cost: 5000,
    weeks: 12,
    requires: ['kh:frictionDampers'],
  },
  {
    id: 'kh:hypoid',
    name: msg('Hipoid diferansiyel'),
    area: msg('Şanzıman'),
    year: 1927,
    desc: msg('Pinyon dişlisi aksın altından girer: kardan mili alçalır, kabin tabanı düşer, araba basık ve zarif görünür.'),
    effects: { prestige: 2, practicality: 1, comfort: 1 },
    cost: 4000,
    weeks: 10,
  },
  {
    id: 'kh:vacuumAdvance',
    name: msg('Otomatik ateşleme avansı'),
    area: msg('Motor'),
    year: 1930,
    desc: msg('Kıvılcım zamanı yüke ve devre göre kendiliğinden ayarlanır. Sürücü artık direksiyondaki kolla avans vermez.'),
    effects: { fuel: 0.96, power: 1.02, practicality: 1 },
    cost: 3500,
    weeks: 8,
  },
  {
    id: 'kh:autoChoke',
    name: msg('Otomatik jikle'),
    area: msg('Motor'),
    year: 1932,
    desc: msg('Soğuk motorda karışımı kendiliğinden zenginleştirir: herkes ilk denemede çalıştırır.'),
    effects: { practicality: 2, comfort: 1 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:streamlining',
    name: msg('Rüzgâr tünelinde gövde'),
    area: msg('Şasi ve süspansiyon'),
    year: 1934,
    desc: msg('Gövde maketi rüzgâr tünelinde denenir: yuvarlak burun, eğik cam, gizli farlar. Hava direnci belirgin düşer.'),
    effects: { cd: 0.9, prestige: 2 },
    cost: 9000,
    weeks: 16,
  },
  {
    id: 'kh:antiRoll',
    name: msg('Viraj denge çubuğu'),
    area: msg('Şasi ve süspansiyon'),
    year: 1934,
    desc: msg('İki tekerleği burulmalı bir çubukla bağlar: araba virajda yatmaz, yumuşak yayla bile isabetli döner.'),
    effects: { handling: 4 },
    cost: 3500,
    weeks: 8,
  },
  {
    id: 'kh:overdrive',
    name: msg('Overdrive'),
    area: msg('Şanzıman'),
    year: 1934,
    desc: msg('Son vitesin üstünde bir kademe daha: otoyolda motor yavaş döner, az yakar ve sessizleşir.'),
    effects: { fuel: 0.94, comfort: 1 },
    cost: 5000,
    weeks: 12,
  },
  {
    id: 'kh:rackPinion',
    name: msg('Kremayer direksiyon'),
    area: msg('Şasi ve süspansiyon'),
    year: 1936,
    desc: msg('Direksiyon dişlisi doğrudan bir kremayeri iter: boşluk azalır, yol hissi artar.'),
    effects: { handling: 3, safety: 1 },
    cost: 4000,
    weeks: 10,
  },
  {
    id: 'kh:radialTires',
    name: msg('Radyal lastik'),
    area: msg('Şasi ve süspansiyon'),
    year: 1949,
    desc: msg('Çelik kuşaklı, dik kordlu lastik. Yolu daha geniş bir yüzeyle kavrar, az ısınır, az yakar.'),
    effects: { handling: 4, fuel: 0.97, safety: 1 },
    cost: 6000,
    weeks: 14,
    requires: ['kh:balloonTires'],
  },
  {
    id: 'kh:tubeless',
    name: msg('Şambrelsiz lastik'),
    area: msg('Güvenlik'),
    year: 1954,
    desc: msg('İç lastiği olmayan lastik çivi batınca patlamaz, yavaşça söner. Yolda can güvenliği artar.'),
    effects: { safety: 2, reliability: 1 },
    cost: 3500,
    weeks: 8,
    requires: ['kh:balloonTires'],
  },
  {
    id: 'kh:crumpleZones',
    name: msg('Çarpışma bölgeleri'),
    area: msg('Güvenlik'),
    year: 1959,
    desc: msg('Önü ve arkası çarpışmada ezilerek enerjiyi yutar, kabin sağlam kalır. Güvenlikte yeni bir çağ.'),
    effects: { safety: 8, mass: 1.02 },
    cost: 15000,
    weeks: 22,
  },
];

export const knowhowDef = (id: string) => KNOWHOW.find((k) => k.id === id);

type PointKey = 'comfort' | 'handling' | 'safety' | 'reliability' | 'practicality' | 'prestige';

export const EFFECT_NAMES: Record<PointKey, string> = {
  comfort: msg('konfor'),
  handling: msg('yol tutuş'),
  safety: msg('güvenlik'),
  reliability: msg('güvenilirlik'),
  prestige: msg('prestij'),
  practicality: msg('pratiklik'),
};

/** A whole percentage: 0.03 → "%3". */
const wholePct = (share: number) => fmtPercent(Math.round(share * 100) / 100, 0);

/** "konfor +4, güç +%3" */
export function effectsText(e: KnowhowEffects): string {
  const out: string[] = [];
  for (const k of ['comfort', 'handling', 'safety', 'reliability', 'practicality', 'prestige'] as const) {
    const v = e[k];
    if (v) out.push(`${t(EFFECT_NAMES[k])} ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  }
  if (e.power) out.push(t('güç +{pct}', { pct: wholePct(e.power - 1) }));
  if (e.fuel) out.push(t('tüketim −{pct}', { pct: wholePct(1 - e.fuel) }));
  if (e.cd) out.push(t('hava direnci −{pct}', { pct: wholePct(1 - e.cd) }));
  if (e.cost) out.push(t('maliyet −{pct}', { pct: wholePct(1 - e.cost) }));
  if (e.mass) out.push(t('ağırlık +{pct}', { pct: wholePct(e.mass - 1) }));
  return out.join(', ');
}

/** Combined effect of the know-how built into a design. */
export function knowhowEffects(ids: string[] | undefined): Required<KnowhowEffects> {
  const out: Required<KnowhowEffects> = { comfort: 0, handling: 0, safety: 0, reliability: 0, practicality: 0, prestige: 0, power: 1, fuel: 1, cd: 1, cost: 1, mass: 1 };
  for (const id of ids ?? []) {
    const e = knowhowDef(id)?.effects;
    if (!e) continue;
    for (const k of ['comfort', 'handling', 'safety', 'reliability', 'practicality', 'prestige'] as const) out[k] += e[k] ?? 0;
    for (const k of ['power', 'fuel', 'cd', 'cost', 'mass'] as const) out[k] *= e[k] ?? 1;
  }
  return out;
}
