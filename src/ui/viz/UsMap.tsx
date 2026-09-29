import { memo, useMemo, type ReactElement } from 'react';
import type { StateId } from '../../data/states';
import { CITY_XY, MAP_H, MAP_W, NATION_D, STATE_SHAPES } from '../../data/usmap';
import { t } from '../../i18n';

// The United States as a turn-of-the-century atlas plate: laid paper, engraved water
// lines along the coasts, pastel state tints with a darker border wash, period
// abbreviations ("Mich.", "Penna."), a cartouche and a compass rose. The game draws its
// dealers, service shops and figures on top.

export type MapTone = { fill: string; hatch?: boolean; dim?: boolean };

export interface MapMarker {
  dealers: number;
  service: number;
  searching?: boolean;
  frontier?: boolean;
}

export interface UsMapProps {
  /** Fill of each state (by default the atlas tint). */
  tone?: Partial<Record<StateId, MapTone>>;
  markers?: Partial<Record<StateId, MapMarker>>;
  selected?: StateId | null;
  onSelect?: (id: StateId) => void;
  /** The factory's town. */
  home?: string;
  title: string;
  subtitle: string;
  company: string;
  year: number;
  legend?: { title: string; stops: { color: string; label: string }[] };
}

/** Atlas tints (neighbours never share one) and the darker wash along each border. */
export const TINTS = ['#ecd2c1', '#eedfae', '#d3dfbb', '#dccde0', '#cddde0'];
const WASH = ['#c98f75', '#c7a55a', '#8fa56d', '#a58bb0', '#86a8b0'];

const ABBR: Record<StateId, string> = {
  AL: 'Ala.', AZ: 'Ariz.', AR: 'Ark.', CA: 'Cal.', CO: 'Colo.', CT: 'Conn.', DE: 'Del.', FL: 'Fla.', GA: 'Ga.', ID: 'Ida.',
  IL: 'Ill.', IN: 'Ind.', IA: 'Iowa', KS: 'Kans.', KY: 'Ky.', LA: 'La.', ME: 'Me.', MD: 'Md.', MA: 'Mass.', MI: 'Mich.',
  MN: 'Minn.', MS: 'Miss.', MO: 'Mo.', MT: 'Mont.', NE: 'Nebr.', NV: 'Nev.', NH: 'N.H.', NJ: 'N.J.', NM: 'N.Mex.', NY: 'N.Y.',
  NC: 'N.C.', ND: 'N.Dak.', OH: 'Ohio', OK: 'Okla.', OR: 'Oreg.', PA: 'Penna.', RI: 'R.I.', SC: 'S.C.', SD: 'S.Dak.',
  TN: 'Tenn.', TX: 'Tex.', UT: 'Utah', VT: 'Vt.', VA: 'Va.', WA: 'Wash.', WV: 'W.Va.', WI: 'Wis.', WY: 'Wyo.',
};
const FULL: Partial<Record<StateId, string>> = {
  TX: 'TEXAS', CA: 'CALIFORNIA', MT: 'MONTANA', NV: 'NEVADA', AZ: 'ARIZONA', NM: 'NEW MEXICO', CO: 'COLORADO', WY: 'WYOMING',
  OR: 'OREGON', ID: 'IDAHO', UT: 'UTAH', KS: 'KANSAS', NE: 'NEBRASKA', SD: 'SOUTH DAKOTA', ND: 'NORTH DAKOTA', OK: 'OKLAHOMA',
  MN: 'MINNESOTA', WA: 'WASHINGTON', MO: 'MISSOURI', IA: 'IOWA', GA: 'GEORGIA',
};
/** Where a label sits, when the middle of the state is a poor place (Michigan's thumb, Florida's panhandle…). */
const LABEL_AT: Partial<Record<StateId, [number, number]>> = {
  MI: [684, 166], FL: [800, 512], LA: [566, 470], KY: [690, 318], VA: [800, 290], WV: [760, 280], MD: [823, 257], TN: [676, 350],
  NY: [838, 175], VT: [866, 146], ID: [205, 150], OK: [470, 385], MN: [520, 120], TX: [410, 460], CA: [80, 280], ME: [912, 102],
};
/** The small eastern states are named out in the Atlantic, with a leader line. */
const OFFSHORE: Partial<Record<StateId, [number, number]>> = {
  NH: [944, 128], MA: [958, 160], RI: [958, 186], CT: [950, 210], NJ: [936, 240], DE: [930, 262], MD: [926, 284],
};

const CITIES_SHOWN: [string, string][] = [
  ['newyork', 'New York'], ['chicago', 'Chicago'], ['philadelphia', 'Philadelphia'], ['boston', 'Boston'], ['stlouis', 'St. Louis'],
  ['sanfrancisco', 'San Francisco'], ['losangeles', 'Los Angeles'], ['neworleans', 'New Orleans'], ['detroit', 'Detroit'],
  ['cleveland', 'Cleveland'], ['pittsburgh', 'Pittsburgh'], ['minneapolis', 'Minneapolis'], ['kansascity', 'Kansas City'],
  ['denver', 'Denver'], ['seattle', 'Seattle'], ['atlanta', 'Atlanta'], ['dallas', 'Dallas'], ['saltlake', 'Salt Lake City'],
];

const INK = '#4e3f2e';
const SEA = '#d7e0da';
const PAPER = '#f1e8d2';

/** One run of the pen: laid paper noise, drawn once per page. */
let noiseUrl: string | null = null;
function paperNoise(): string {
  if (noiseUrl !== null) return noiseUrl;
  noiseUrl = '';
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const g = c.getContext('2d');
    if (!g) return noiseUrl;
    const img = g.createImageData(160, 160);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < img.data.length; i += 4) {
      const y = Math.floor(i / 4 / 160);
      // Fibres, and the faint lines of laid paper every few rows.
      const v = 200 + rnd() * 55 - (y % 7 === 0 ? 14 : 0);
      img.data[i] = v;
      img.data[i + 1] = v * 0.96;
      img.data[i + 2] = v * 0.88;
      img.data[i + 3] = 60;
    }
    g.putImageData(img, 0, 0);
    noiseUrl = c.toDataURL();
  } catch {
    /* no canvas (tests): plain paper */
  }
  return noiseUrl;
}

const roman = (n: number) =>
  [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ].reduce<[string, number]>(([out, left], [v, r]) => {
    while (left >= (v as number)) {
      out += r;
      left -= v as number;
    }
    return [out, left];
  }, ['', n])[0];

/** Sea, engraved coast lines, frame and ornaments: nothing here changes as the game runs. */
const Plate = memo(function Plate() {
  const lines = [30, 22, 15, 9.5, 5];
  return (
    <g aria-hidden>
      <rect x={-24} y={-24} width={MAP_W + 48} height={MAP_H + 48} fill={SEA} />
      <rect x={-24} y={-24} width={MAP_W + 48} height={MAP_H + 48} fill="url(#usmap-sea)" />
      {/* Water lines: rings of ink at growing distance from the shore. */}
      {lines.map((d, i) => (
        <g key={d}>
          <path d={NATION_D} fill="none" stroke="#8ea6a6" strokeOpacity={0.35 + i * 0.1} strokeWidth={d * 2} strokeLinejoin="round" />
          <path d={NATION_D} fill="none" stroke={SEA} strokeWidth={d * 2 - 1.1} strokeLinejoin="round" />
        </g>
      ))}
      <path d={NATION_D} fill={PAPER} />
      <text className="usmap-water" x={40} y={300} transform="rotate(-90 40 300)">
        {t('PASİFİK OKYANUSU')}
      </text>
      <text className="usmap-water" x={948} y={360} transform="rotate(-90 948 360)">
        {t('ATLANTİK OKYANUSU')}
      </text>
      <text className="usmap-water" x={640} y={574}>
        {t('MEKSİKA KÖRFEZİ')}
      </text>
      <text className="usmap-land" x={440} y={14}>
        {t('K A N A D A')}
      </text>

    </g>
  );
});

/** A compass rose of the period: eight points, alternate halves inked. */
const Compass = memo(function Compass({ x, y, r }: { x: number; y: number; r: number }) {
  const pts = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <g transform={`translate(${x} ${y})`} aria-hidden>
      <circle r={r * 1.08} fill="none" stroke={INK} strokeWidth={0.6} />
      <circle r={r * 0.98} fill="none" stroke={INK} strokeWidth={0.3} strokeDasharray="1 2" />
      {pts.map((a, i) => {
        const long = i % 2 === 0;
        const L = long ? r : r * 0.6;
        const w = long ? r * 0.16 : r * 0.12;
        return (
          <g key={a} transform={`rotate(${a})`}>
            <path d={`M0,${-L} L${w},0 L0,0 Z`} fill={INK} />
            <path d={`M0,${-L} L${-w},0 L0,0 Z`} fill={PAPER} stroke={INK} strokeWidth={0.4} />
          </g>
        );
      })}
      <circle r={r * 0.08} fill={PAPER} stroke={INK} strokeWidth={0.5} />
      <text y={-r * 1.2} className="usmap-compass">
        {/* Kuzey (north) */}
        {t('K')}
      </text>
    </g>
  );
});

/** The black-and-white ruled border of an atlas plate. */
const Frame = memo(function Frame() {
  const x0 = -18;
  const y0 = -18;
  const w = MAP_W + 36;
  const h = MAP_H + 36;
  const seg = 30;
  const ticks: ReactElement[] = [];
  for (let i = 0; i * seg < w; i++) {
    if (i % 2) continue;
    const len = Math.min(seg, w - i * seg);
    ticks.push(<rect key={`t${i}`} x={x0 + i * seg} y={y0} width={len} height={4} fill={INK} />);
    ticks.push(<rect key={`b${i}`} x={x0 + i * seg} y={y0 + h - 4} width={len} height={4} fill={INK} />);
  }
  for (let i = 0; i * seg < h; i++) {
    if (i % 2) continue;
    const len = Math.min(seg, h - i * seg);
    ticks.push(<rect key={`l${i}`} x={x0} y={y0 + i * seg} width={4} height={len} fill={INK} />);
    ticks.push(<rect key={`r${i}`} x={x0 + w - 4} y={y0 + i * seg} width={4} height={len} fill={INK} />);
  }
  return (
    <g aria-hidden>
      <rect x={x0} y={y0} width={w} height={h} fill="none" stroke={INK} strokeWidth={1} />
      {ticks}
      <rect x={x0 + 4} y={y0 + 4} width={w - 8} height={h - 8} fill="none" stroke={INK} strokeWidth={0.5} />
      <rect x={x0 - 5} y={y0 - 5} width={w + 10} height={h + 10} fill="none" stroke={INK} strokeWidth={1.6} />
    </g>
  );
});

function Cartouche({ title, subtitle, company, year }: { title: string; subtitle: string; company: string; year: number }) {
  const x = 6;
  const y = 470;
  const w = 250;
  const h = 128;
  const px100 = 100 / (3.05 * 1.0);
  return (
    <g aria-hidden className="usmap-cartouche">
      <rect x={x} y={y} width={w} height={h} rx={10} fill={PAPER} stroke={INK} strokeWidth={1.4} />
      <rect x={x + 4} y={y + 4} width={w - 8} height={h - 8} rx={7} fill="none" stroke={INK} strokeWidth={0.5} />
      {/* Corner flourishes */}
      {[
        [x + 10, y + 10, 1, 1],
        [x + w - 10, y + 10, -1, 1],
        [x + 10, y + h - 10, 1, -1],
        [x + w - 10, y + h - 10, -1, -1],
      ].map(([cx, cy, sx, sy], i) => (
        <path key={i} d={`M${cx},${cy + sy * 14} q0,${-sy * 14} ${sx * 14},${-sy * 14} M${cx + sx * 3},${cy + sy * 3} m-1.5,0 a1.5,1.5 0 1,0 3,0 a1.5,1.5 0 1,0 -3,0`} fill="none" stroke={INK} strokeWidth={0.7} />
      ))}
      <text x={x + w / 2} y={y + 26} className="usmap-title">
        {title}
      </text>
      <path d={`M${x + 40},${y + 33} h${w - 80}`} stroke={INK} strokeWidth={0.5} />
      <text x={x + w / 2} y={y + 47} className="usmap-sub">
        {subtitle}
      </text>
      <text x={x + w / 2} y={y + 74} className="usmap-company">
        {company}
      </text>
      <text x={x + w / 2} y={y + 90} className="usmap-year">
        {roman(year)} · {year}
      </text>
      {/* Scale of miles */}
      <g transform={`translate(${x + w / 2 - 2 * px100} ${y + 104})`}>
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={i * px100} y={0} width={px100} height={3.5} fill={i % 2 ? PAPER : INK} stroke={INK} strokeWidth={0.4} />
        ))}
        {[0, 100, 200, 300, 400].map((m, i) => (
          <text key={m} x={i * px100} y={12} className="usmap-scale">
            {m}
          </text>
        ))}
        <text x={4 * px100 + 6} y={4} className="usmap-scale" textAnchor="start">
          {t('mil')}
        </text>
      </g>
    </g>
  );
}

export function UsMap(p: UsMapProps) {
  const noise = useMemo(() => paperNoise(), []);
  const ids = Object.keys(STATE_SHAPES) as StateId[];
  const labelOf = (id: StateId): [number, number] => OFFSHORE[id] ?? LABEL_AT[id] ?? STATE_SHAPES[id].label;
  const home = p.home ? CITY_XY[p.home] : undefined;
  return (
    <svg className="usmap" viewBox={`-26 -26 ${MAP_W + 52} ${MAP_H + 52}`} role="img" aria-label={`${p.title}: ${p.subtitle}`}>
      <defs>
        <pattern id="usmap-sea" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,3 h6" stroke="#9db1ae" strokeWidth={0.35} />
        </pattern>
        <pattern id="usmap-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0,0 v5" stroke="#8b7a62" strokeWidth={0.5} strokeOpacity={0.45} />
        </pattern>
        {noise && (
          <pattern id="usmap-paper" width="160" height="160" patternUnits="userSpaceOnUse">
            <image href={noise} width="160" height="160" />
          </pattern>
        )}
        <radialGradient id="usmap-vignette" cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="#6b4a22" stopOpacity={0} />
          <stop offset="100%" stopColor="#6b4a22" stopOpacity={0.22} />
        </radialGradient>
        {ids.map((id) => (
          <clipPath key={id} id={`usmap-clip-${id}`}>
            <path d={STATE_SHAPES[id].d} />
          </clipPath>
        ))}
      </defs>
      <Plate />
      {/* The states: tint, the border wash inside, hatching where the make is unknown. */}
      {ids.map((id) => {
        const sh = STATE_SHAPES[id];
        const t = p.tone?.[id];
        const fill = t?.fill ?? TINTS[sh.tint];
        return (
          <g
            key={id}
            className={`usmap-state ${p.onSelect ? 'is-clickable' : ''} ${p.selected === id ? 'is-selected' : ''}`}
            onClick={p.onSelect ? () => p.onSelect!(id) : undefined}
          >
            <path d={sh.d} fill={fill} opacity={t?.dim ? 0.55 : 1} />
            <path d={sh.d} fill="none" stroke={WASH[sh.tint]} strokeWidth={7} strokeOpacity={t?.dim ? 0.25 : 0.55} clipPath={`url(#usmap-clip-${id})`} />
            {t?.hatch && <path d={sh.d} fill="url(#usmap-hatch)" />}
            <path d={sh.d} fill="none" stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />
          </g>
        );
      })}
      {/* Borders you can cross next: a dashed red line. */}
      {ids
        .filter((id) => p.markers?.[id]?.frontier)
        .map((id) => (
          <path key={`f-${id}`} d={STATE_SHAPES[id].d} fill="none" stroke="#b3402a" strokeWidth={1.3} strokeDasharray="4 2.5" pointerEvents="none" />
        ))}
      {p.selected && <path d={STATE_SHAPES[p.selected].d} fill="none" stroke="#1f2f45" strokeWidth={2.6} pointerEvents="none" />}
      {/* Towns */}
      <g aria-hidden pointerEvents="none">
        {CITIES_SHOWN.filter(([id]) => id !== p.home).map(([id, name]) => {
          const [x, y] = CITY_XY[id];
          return (
            <g key={id}>
              <circle cx={x} cy={y} r={1.8} fill={PAPER} stroke={INK} strokeWidth={0.6} />
              <circle cx={x} cy={y} r={0.6} fill={INK} />
              <text x={x + 3.5} y={y - 2.5} className="usmap-city">
                {name}
              </text>
            </g>
          );
        })}
      </g>
      {/* State names (and Mexico, whose name would hide under Texas on the plate) */}
      <g pointerEvents="none">
        <text className="usmap-land" x={306} y={542} aria-hidden>
          {t('M E K S İ K A')}
        </text>
        {ids.map((id) => {
          const [x, y] = labelOf(id);
          const off = OFFSHORE[id];
          const [lx, ly] = LABEL_AT[id] ?? STATE_SHAPES[id].label;
          const full = FULL[id];
          return (
            <g key={id}>
              {off && <path d={`M${lx},${ly} L${x - 12},${y - 3}`} stroke={INK} strokeWidth={0.4} />}
              <text x={x} y={y} className={full ? 'usmap-name' : 'usmap-abbr'} textAnchor={off ? 'start' : 'middle'} dx={off ? -10 : 0}>
                {full ?? ABBR[id]}
              </text>
            </g>
          );
        })}
      </g>
      {/* The company's marks: dealers (red), service (green), searches under way. */}
      <g pointerEvents="none">
        {ids.map((id) => {
          const m = p.markers?.[id];
          if (!m || (!m.dealers && !m.service && !m.searching)) return null;
          const [x, y] = labelOf(id);
          const off = !!OFFSHORE[id];
          const bx = off ? x + 26 : x;
          const by = off ? y - 3 : y + 9;
          return (
            <g key={id}>
              {m.searching && <circle cx={bx - 8} cy={by} r={5.5} className="usmap-search" />}
              {m.dealers > 0 && (
                <g transform={`translate(${bx - (m.service ? 6 : 0)} ${by})`}>
                  <circle r={5.2} fill="#b3402a" stroke={PAPER} strokeWidth={0.9} />
                  <text className="usmap-count" y={2.1}>
                    {m.dealers}
                  </text>
                </g>
              )}
              {m.service > 0 && (
                <g transform={`translate(${bx + (m.dealers ? 6 : 0)} ${by})`}>
                  <rect x={-5} y={-5} width={10} height={10} rx={2} fill="#3f7f6f" stroke={PAPER} strokeWidth={0.9} />
                  <text className="usmap-count" y={2.1}>
                    {m.service}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
      {/* The factory */}
      {home && (
        <g transform={`translate(${home[0]} ${home[1]})`} aria-hidden pointerEvents="none">
          <path d="M-7,3 v-6 l3,-2 v2 l3,-2 v2 l3,-2 v8 z M2,-5 v-5 h2 v6" fill="#1f2f45" stroke={PAPER} strokeWidth={0.6} />
          <circle cx={3} cy={-12} r={1.6} fill="#8a8173" opacity={0.6} />
          <circle cx={5} cy={-15} r={2.2} fill="#8a8173" opacity={0.4} />
        </g>
      )}
      <Compass x={918} y={470} r={30} />
      <Cartouche title={p.title} subtitle={p.subtitle} company={p.company} year={p.year} />
      {p.legend && (
        <g transform="translate(832 520)" className="usmap-legend">
          <rect x={0} y={0} width={132} height={16 + p.legend.stops.length * 11} rx={4} fill={PAPER} stroke={INK} strokeWidth={0.6} />
          <text x={66} y={11} className="usmap-legend-title">
            {p.legend.title}
          </text>
          {p.legend.stops.map((st, i) => (
            <g key={i} transform={`translate(8 ${17 + i * 11})`}>
              <rect width={14} height={8} fill={st.color} stroke={INK} strokeWidth={0.4} />
              <text x={19} y={7} className="usmap-legend-label">
                {st.label}
              </text>
            </g>
          ))}
        </g>
      )}
      <Frame />
      {noise && <rect x={-26} y={-26} width={MAP_W + 52} height={MAP_H + 52} fill="url(#usmap-paper)" style={{ mixBlendMode: 'multiply' }} pointerEvents="none" />}
      <rect x={-26} y={-26} width={MAP_W + 52} height={MAP_H + 52} fill="url(#usmap-vignette)" pointerEvents="none" />
    </svg>
  );
}
