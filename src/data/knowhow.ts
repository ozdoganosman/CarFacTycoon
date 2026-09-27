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
    name: 'Petek radyatör',
    area: 'Motor',
    year: 1901,
    desc: 'Yüzlerce ince borudan oluşan radyatör suyu çok daha iyi soğutur: motor uzun yokuşlarda kaynamaz.',
    effects: { reliability: 2, power: 1.02 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:magneto',
    name: 'Yüksek gerilim manyetosu',
    area: 'Motor',
    year: 1902,
    desc: 'Kıvılcımı aküden değil, motorun çevirdiği mıknatıstan alan ateşleme. Kızgın tüplü ateşlemeye veda: motor her havada çalışır.',
    effects: { reliability: 3, power: 1.03 },
    cost: 3000,
    weeks: 10,
  },
  {
    id: 'kh:shaftDrive',
    name: 'Kardan mili tahriki',
    area: 'Şanzıman',
    year: 1902,
    desc: 'Arka tekerlekleri zincir yerine kapalı bir milden döndürmek: yağ ve çamur sıçramaz, zincir kopmaz, araba sessizleşir.',
    effects: { reliability: 2, comfort: 2, practicality: 1 },
    cost: 3000,
    weeks: 10,
  },
  {
    id: 'kh:frictionDampers',
    name: 'Sürtünmeli amortisör',
    area: 'Şasi ve süspansiyon',
    year: 1905,
    desc: 'Yayların sonsuz sekmesini birbirine sürtünen disklerle frenler. Araba çukurdan çıkınca sallanıp durmaz.',
    effects: { comfort: 3, handling: 2 },
    cost: 2500,
    weeks: 8,
  },
  {
    id: 'kh:detachableRims',
    name: 'Sökülebilir jant',
    area: 'Donanım',
    year: 1906,
    desc: 'Patlayan lastik yolda saatlerce yamanmaz; jantıyla sökülüp yedeği takılır.',
    effects: { practicality: 3, reliability: 1 },
    cost: 1500,
    weeks: 6,
  },
  {
    id: 'kh:detachableHead',
    name: 'Sökülebilir silindir kapağı',
    area: 'Motor',
    year: 1908,
    desc: 'Blok ve kapak ayrı dökülür: döküm ucuzlar, supap ve piston bakımı kolaylaşır.',
    effects: { cost: 0.98, reliability: 1 },
    cost: 2500,
    weeks: 8,
  },
  {
    id: 'kh:pressureLube',
    name: 'Basınçlı yağlama',
    area: 'Motor',
    year: 1912,
    desc: 'Pompa yağı yataklara basınçla iter; yalnızca sıçratmaya güvenilmez. Yataklar yüksek devirde erimez.',
    effects: { reliability: 3, power: 1.02 },
    cost: 3500,
    weeks: 10,
  },
  {
    id: 'kh:alloyPistons',
    name: 'Alüminyum piston',
    area: 'Motor',
    year: 1915,
    desc: 'Dökme demirin üçte biri ağırlığında pistonlar: motor daha çabuk devir alır, yatakları daha az zorlar.',
    effects: { power: 1.04, fuel: 0.98 },
    cost: 4000,
    weeks: 12,
    requires: ['kh:pressureLube'],
  },
  {
    id: 'kh:airFilter',
    name: 'Hava filtresi',
    area: 'Motor',
    year: 1918,
    desc: 'Toprak yolların tozu karbüratöre girmeden tutulur; silindirler yıllarca aşınmaz.',
    effects: { reliability: 2 },
    cost: 2000,
    weeks: 5,
  },
  {
    id: 'kh:thermostat',
    name: 'Termostat',
    area: 'Motor',
    year: 1922,
    desc: 'Motor ısınana kadar suyu radyatöre göndermez. Soğuk sabahlarda çabuk ısınır, az yakar.',
    effects: { fuel: 0.97, reliability: 1, comfort: 1 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:oilFilter',
    name: 'Yağ filtresi',
    area: 'Motor',
    year: 1923,
    desc: 'Yağdaki metal tozunu süzer: yataklar ve silindirler çok daha uzun ömürlü olur.',
    effects: { reliability: 3 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:balloonTires',
    name: 'Balon lastik',
    area: 'Şasi ve süspansiyon',
    year: 1923,
    desc: 'Geniş, düşük basınçlı lastikler yolun sarsıntısını yutar. Konfor büyük ölçüde artar.',
    effects: { comfort: 4, handling: 1 },
    cost: 3500,
    weeks: 8,
  },
  {
    id: 'kh:hydraulicDampers',
    name: 'Hidrolik amortisör',
    area: 'Şasi ve süspansiyon',
    year: 1925,
    desc: 'Yağın küçük deliklerden geçmesiyle çalışan amortisör: küçük darbelerde yumuşak, büyüklerde sıkı.',
    effects: { comfort: 4, handling: 3 },
    cost: 5000,
    weeks: 12,
    requires: ['kh:frictionDampers'],
  },
  {
    id: 'kh:hypoid',
    name: 'Hipoid diferansiyel',
    area: 'Şanzıman',
    year: 1927,
    desc: 'Pinyon dişlisi aksın altından girer: kardan mili alçalır, kabin tabanı düşer, araba basık ve zarif görünür.',
    effects: { prestige: 2, practicality: 1, comfort: 1 },
    cost: 4000,
    weeks: 10,
  },
  {
    id: 'kh:vacuumAdvance',
    name: 'Otomatik ateşleme avansı',
    area: 'Motor',
    year: 1930,
    desc: 'Kıvılcım zamanı yüke ve devre göre kendiliğinden ayarlanır. Sürücü artık direksiyondaki kolla avans vermez.',
    effects: { fuel: 0.96, power: 1.02, practicality: 1 },
    cost: 3500,
    weeks: 8,
  },
  {
    id: 'kh:autoChoke',
    name: 'Otomatik jikle',
    area: 'Motor',
    year: 1932,
    desc: 'Soğuk motorda karışımı kendiliğinden zenginleştirir: herkes ilk denemede çalıştırır.',
    effects: { practicality: 2, comfort: 1 },
    cost: 2000,
    weeks: 6,
  },
  {
    id: 'kh:streamlining',
    name: 'Rüzgâr tünelinde gövde',
    area: 'Şasi ve süspansiyon',
    year: 1934,
    desc: 'Gövde maketi rüzgâr tünelinde denenir: yuvarlak burun, eğik cam, gizli farlar. Hava direnci belirgin düşer.',
    effects: { cd: 0.9, prestige: 2 },
    cost: 9000,
    weeks: 16,
  },
  {
    id: 'kh:antiRoll',
    name: 'Viraj denge çubuğu',
    area: 'Şasi ve süspansiyon',
    year: 1934,
    desc: 'İki tekerleği burulmalı bir çubukla bağlar: araba virajda yatmaz, yumuşak yayla bile isabetli döner.',
    effects: { handling: 4 },
    cost: 3500,
    weeks: 8,
  },
  {
    id: 'kh:overdrive',
    name: 'Overdrive',
    area: 'Şanzıman',
    year: 1934,
    desc: 'Son vitesin üstünde bir kademe daha: otoyolda motor yavaş döner, az yakar ve sessizleşir.',
    effects: { fuel: 0.94, comfort: 1 },
    cost: 5000,
    weeks: 12,
  },
  {
    id: 'kh:rackPinion',
    name: 'Kremayer direksiyon',
    area: 'Şasi ve süspansiyon',
    year: 1936,
    desc: 'Direksiyon dişlisi doğrudan bir kremayeri iter: boşluk azalır, yol hissi artar.',
    effects: { handling: 3, safety: 1 },
    cost: 4000,
    weeks: 10,
  },
  {
    id: 'kh:radialTires',
    name: 'Radyal lastik',
    area: 'Şasi ve süspansiyon',
    year: 1949,
    desc: 'Çelik kuşaklı, dik kordlu lastik. Yolu daha geniş bir yüzeyle kavrar, az ısınır, az yakar.',
    effects: { handling: 4, fuel: 0.97, safety: 1 },
    cost: 6000,
    weeks: 14,
    requires: ['kh:balloonTires'],
  },
  {
    id: 'kh:tubeless',
    name: 'Şambrelsiz lastik',
    area: 'Güvenlik',
    year: 1954,
    desc: 'İç lastiği olmayan lastik çivi batınca patlamaz, yavaşça söner. Yolda can güvenliği artar.',
    effects: { safety: 2, reliability: 1 },
    cost: 3500,
    weeks: 8,
    requires: ['kh:balloonTires'],
  },
  {
    id: 'kh:crumpleZones',
    name: 'Çarpışma bölgeleri',
    area: 'Güvenlik',
    year: 1959,
    desc: 'Önü ve arkası çarpışmada ezilerek enerjiyi yutar, kabin sağlam kalır. Güvenlikte yeni bir çağ.',
    effects: { safety: 8, mass: 1.02 },
    cost: 15000,
    weeks: 22,
  },
];

export const knowhowDef = (id: string) => KNOWHOW.find((k) => k.id === id);

type PointKey = 'comfort' | 'handling' | 'safety' | 'reliability' | 'practicality' | 'prestige';

export const EFFECT_NAMES: Record<PointKey, string> = {
  comfort: 'konfor',
  handling: 'yol tutuş',
  safety: 'güvenlik',
  reliability: 'güvenilirlik',
  prestige: 'prestij',
  practicality: 'pratiklik',
};

/** "konfor +4, güç +%3" */
export function effectsText(e: KnowhowEffects): string {
  const out: string[] = [];
  for (const k of ['comfort', 'handling', 'safety', 'reliability', 'practicality', 'prestige'] as const) {
    const v = e[k];
    if (v) out.push(`${EFFECT_NAMES[k]} ${v > 0 ? '+' : '−'}${Math.abs(v)}`);
  }
  if (e.power) out.push(`güç +%${Math.round((e.power - 1) * 100)}`);
  if (e.fuel) out.push(`tüketim −%${Math.round((1 - e.fuel) * 100)}`);
  if (e.cd) out.push(`hava direnci −%${Math.round((1 - e.cd) * 100)}`);
  if (e.cost) out.push(`maliyet −%${Math.round((1 - e.cost) * 100)}`);
  if (e.mass) out.push(`ağırlık +%${Math.round((e.mass - 1) * 100)}`);
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
