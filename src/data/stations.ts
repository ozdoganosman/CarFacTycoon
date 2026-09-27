import type { StageId } from '../core/types';

export interface StationDef {
  id: string;
  stage: StageId;
  name: string;
  year: number;
  desc: string;
  /** Cars per week at production complexity 1. */
  capacity: number;
  cost: number; // purchase, 1900 dollars
  upkeep: number; // weekly labour & power at full use, 1900 dollars (≈ labour cost per car × capacity)
  /** Only black paint: small prestige penalty for the car. */
  blackOnly?: boolean;
  cardId?: string;
}

export const STAGES: { id: StageId; name: string; short: string; desc: string }[] = [
  { id: 'press', name: 'Pres', short: 'PRS', desc: 'Sac levhalardan kaporta ve şasi parçaları basılır.' },
  { id: 'body', name: 'Gövde / Kaynak', short: 'GVD', desc: 'Parçalar birleştirilip gövde kurulur.' },
  { id: 'paint', name: 'Boya', short: 'BOY', desc: 'Gövde boyanır ve kurutulur.' },
  { id: 'assembly', name: 'Montaj', short: 'MNT', desc: 'Motor, aks, tekerlek ve donanım takılır.' },
];

export const STATIONS: StationDef[] = [
  // Press
  { id: 'press_hand', stage: 'press', name: 'El presi ve kalıpçı', year: 1900, desc: 'Usta kalıpçılar sacı elle döver.', capacity: 3, cost: 600, upkeep: 45 },
  { id: 'press_power', stage: 'press', name: 'Güç presi', year: 1910, desc: 'Buhar/elektrik tahrikli mekanik pres.', capacity: 15, cost: 4000, upkeep: 180 },
  { id: 'press_hydraulic', stage: 'press', name: 'Hidrolik pres', year: 1930, desc: 'Büyük tek parça paneller basar.', capacity: 50, cost: 18000, upkeep: 500 },
  { id: 'press_transfer', stage: 'press', name: 'Transfer pres hattı', year: 1950, desc: 'Parça presten prese otomatik geçer.', capacity: 140, cost: 60000, upkeep: 1120 },
  // Body
  { id: 'body_coach', stage: 'body', name: 'Ahşap karoser tezgâhı', year: 1900, desc: 'Arabacı ustaları ahşap iskelete sac çakar.', capacity: 2, cost: 400, upkeep: 50 },
  { id: 'body_steel', stage: 'body', name: 'Çelik gövde tezgâhı', year: 1914, desc: 'Preslenmiş çelik paneller kaynakla birleşir.', capacity: 12, cost: 5000, upkeep: 192 },
  { id: 'body_spotweld', stage: 'body', name: 'Nokta kaynak hattı', year: 1930, desc: 'Elektrik direnç kaynağıyla hızlı birleştirme.', capacity: 45, cost: 20000, upkeep: 540 },
  { id: 'body_jig', stage: 'body', name: 'Otomatik kaynak fikstürü', year: 1950, desc: 'Gövde fikstürde tek seferde kaynaklanır.', capacity: 120, cost: 65000, upkeep: 1200 },
  // Paint
  { id: 'paint_brush', stage: 'paint', name: 'Fırça boya ve kurutma rafı', year: 1900, desc: 'Kat kat vernik; her kat günlerce kurur.', capacity: 1.5, cost: 300, upkeep: 20 },
  { id: 'paint_japan', stage: 'paint', name: 'Siyah vernik fırını', year: 1913, desc: 'Fırında hızla kuruyan “Japan” siyahı. Başka renk yok!', capacity: 10, cost: 3000, upkeep: 60, blackOnly: true },
  { id: 'paint_spray', stage: 'paint', name: 'Duco sprey boya', year: 1924, desc: 'Nitroselülozik lake saatler içinde kurur, her renk mümkün.', capacity: 30, cost: 9000, upkeep: 240, cardId: 'duco' },
  { id: 'paint_oven', stage: 'paint', name: 'Konveyörlü fırın boya', year: 1936, desc: 'Gövdeler fırından zincirle geçer.', capacity: 70, cost: 30000, upkeep: 490 },
  { id: 'paint_dip', stage: 'paint', name: 'Daldırma astar + fırın', year: 1955, desc: 'Gövde astara daldırılır; pas tutmaz.', capacity: 150, cost: 70000, upkeep: 900 },
  // Assembly
  { id: 'asm_static', stage: 'assembly', name: 'Sabit montaj tezgâhı', year: 1900, desc: 'Bir ekip tek bir aracın etrafında dolaşıp her şeyi yapar.', capacity: 2, cost: 400, upkeep: 50 },
  { id: 'asm_moving', stage: 'assembly', name: 'Hareketli montaj hattı', year: 1913, desc: 'Araç zincirle işçinin önünden geçer; herkes tek iş yapar.', capacity: 30, cost: 12000, upkeep: 420, cardId: 'movingLine' },
  { id: 'asm_conveyor', stage: 'assembly', name: 'Zincir konveyörlü hat', year: 1928, desc: 'Parça besleme de konveyörle yapılır.', capacity: 60, cost: 25000, upkeep: 720 },
  { id: 'asm_high', stage: 'assembly', name: 'Yüksek hızlı montaj hattı', year: 1950, desc: 'Alt montajlar ana hatta tam zamanında gelir.', capacity: 130, cost: 70000, upkeep: 1300 },
];

export function stationDef(id: string): StationDef {
  const s = STATIONS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown station ${id}`);
  return s;
}
