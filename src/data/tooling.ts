import type { AttrKey } from '../core/types';

// Body dies and assembly fixtures. Cheap soft tools get a car to market fast
// but every panel needs hand fitting; hardened precision tools cost a fortune
// and take months, but the cars come out tight and with little scrap.

export type ToolingTier = 'soft' | 'standard' | 'precision';

export interface ToolingDef {
  id: ToolingTier;
  name: string;
  desc: string;
  costMult: number;
  weeksMult: number;
  /** Scrap and hand fitting per car. */
  materialMult: number;
  /** Fit and finish as buyers and magazines notice it (score points). */
  scores: Partial<Record<AttrKey, number>>;
}

export const TOOLING: ToolingDef[] = [
  {
    id: 'soft',
    name: 'Yumuşak kalıplar',
    desc: 'Ahşap ve dökme demir kalıplar; paneller elle düzeltilir. Ucuz ve çabuk hazır, ama kapılar tam oturmaz, gövde tıkırdar ve fire çoktur.',
    costMult: 0.5,
    weeksMult: 0.6,
    materialMult: 1.06,
    scores: { prestige: -3, comfort: -2, reliability: -2 },
  },
  {
    id: 'standard',
    name: 'Çelik kalıplar',
    desc: 'Dönemin olağan çelik pres kalıpları ve montaj fikstürleri.',
    costMult: 1,
    weeksMult: 1,
    materialMult: 1,
    scores: {},
  },
  {
    id: 'precision',
    name: 'Hassas kalıplar',
    desc: 'Sertleştirilmiş çelik kalıplar ve hassas fikstürler. Pahalı ve geç hazırlanır; paneller milimetrik oturur, fire azdır.',
    costMult: 1.8,
    weeksMult: 1.35,
    materialMult: 0.96,
    scores: { prestige: 2, comfort: 1, reliability: 2 },
  },
];

export const toolingDef = (id: ToolingTier | undefined): ToolingDef => TOOLING.find((t) => t.id === (id ?? 'standard'))!;
