// How hard the start is. "Tarihi" is the game as tuned; the others change only
// the company's starting position and what the bank will lend, not the world.

export type DifficultyId = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  desc: string;
  cash: number;
  engineers: number;
  reputation: number;
  /** Multiplies the bank's credit limit. */
  credit: number;
}

export const DIFFICULTIES: DifficultyDef[] = [
  { id: 'easy', name: 'Rahat başlangıç', desc: '$80 bin kasa, 3 mühendis, bankalar daha cömert. Oyunu öğrenmek için.', cash: 80000, engineers: 3, reputation: 35, credit: 1.5 },
  { id: 'normal', name: 'Tarihi', desc: '$40 bin kasa, 2 mühendis. Dönemin küçük bir atölyesi gibi.', cash: 40000, engineers: 2, reputation: 30, credit: 1 },
  { id: 'hard', name: 'Zorlu', desc: '$25 bin kasa, 2 mühendis, bankalar temkinli. Her karar sayılır.', cash: 25000, engineers: 2, reputation: 25, credit: 0.6 },
];

export const difficultyDef = (id: DifficultyId | undefined) => DIFFICULTIES.find((d) => d.id === (id ?? 'normal'))!;
