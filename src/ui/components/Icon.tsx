import type { SVGProps } from 'react';

// The game's pictograms: flat, solid shapes in the manner of the 1920s picture statistics (Isotype)
// and period enamel signs, drawn on a 24-unit grid in the current text colour. Cut-outs use the
// even-odd rule, so every icon is one colour and reads at 16px.

type Shape = { d: string; rule?: 'evenodd' };

const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}z`;
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const ellipse = (cx: number, cy: number, rx: number, ry: number) => `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`;
const poly = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join('L')}z`;

/** A bar from (x1, y1) to (x2, y2), `w` wide. */
function bar(x1: number, y1: number, x2: number, y2: number, w: number): string {
  const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const dx = (Math.cos(a) * w) / 2;
  const dy = (Math.sin(a) * w) / 2;
  return poly([
    [x1 + dx, y1 + dy],
    [x2 + dx, y2 + dy],
    [x2 - dx, y2 - dy],
    [x1 - dx, y1 - dy],
  ]);
}

/** A toothed wheel with a hole in the middle. */
function gear(cx: number, cy: number, r: number, teeth: number, depth: number, hole: number, turn = 0): string {
  const pts: [number, number][] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = turn + i * step;
    for (const [f, rr] of [
      [-0.3, r - depth],
      [-0.18, r],
      [0.18, r],
      [0.3, r - depth],
    ] as const)
      pts.push([cx + Math.cos(a + f * step * 1.6) * rr, cy + Math.sin(a + f * step * 1.6) * rr]);
  }
  return poly(pts) + circle(cx, cy, hole);
}

function star(cx: number, cy: number, r: number, inner: number, points = 5, turn = -Math.PI / 2): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? inner : r;
    const a = turn + (i * Math.PI) / points;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return poly(pts);
}

/** A car seen from the side: the body's outline (from the front bumper round the roof) and its wheels. */
function car(body: [number, number][], glass: [number, number][][], wheels: [number, number][], r = 2.3): Shape[] {
  return [
    { d: poly(body) + glass.map(poly).join(''), rule: 'evenodd' },
    ...wheels.map(([x, y]) => ({ d: circle(x, y, r) + circle(x, y, r * 0.38), rule: 'evenodd' as const })),
  ];
}

const ICONS = {
  // ---- the menu ----
  hq: [
    { d: rect(3, 8, 18, 1.6) },
    {
      d:
        rect(4, 9.6, 16, 12.4) +
        [6.2, 10.75, 15.3].flatMap((x) => [11.6, 15].map((y) => rect(x, y, 2.5, 2.2))).join('') +
        rect(10.3, 18.2, 3.4, 3.8),
      rule: 'evenodd',
    },
    { d: rect(11.3, 1.8, 1.3, 6.2) },
    { d: 'M12.6 2h5.4l-1.6 1.7 1.6 1.7h-5.4z' },
  ],
  projects: [
    { d: poly([[3, 21], [3, 4], [20, 21]]) + poly([[6, 18], [6, 11.3], [12.7, 18]]), rule: 'evenodd' },
    { d: bar(13.5, 3.2, 21, 10.7, 2.4) },
    { d: poly([[20.3, 11.4], [21.9, 13.2], [22.2, 11.1]]) },
  ],
  research: [
    { d: rect(8.3, 2, 7.4, 1.8) },
    {
      d: 'M9.6 3.8h4.8v5.3l5.9 9.9c.8 1.4-.2 3-1.8 3H5.5c-1.6 0-2.6-1.6-1.8-3l5.9-9.9z' + circle(10, 16.5, 1.1) + circle(13.6, 18.3, 0.8) + rect(6.9, 13.2, 10.2, 1),
      rule: 'evenodd',
    },
  ],
  models: car(
    [[1.6, 15.2], [2.3, 13.2], [6.8, 12.3], [9.3, 8.4], [16.2, 8.4], [18.6, 12.2], [21.6, 13], [22.4, 15.2], [22.4, 17], [1.6, 17]],
    [
      [[10.2, 9.8], [13, 9.8], [13, 12.2], [8.6, 12.2]],
      [[14.2, 9.8], [15.6, 9.8], [17.1, 12.2], [14.2, 12.2]],
    ],
    [[6.6, 17.2], [17.4, 17.2]],
  ),
  factory: [
    { d: rect(18.2, 2.5, 2.6, 8) },
    {
      d: poly([[2, 21.5], [2, 11], [7, 7.5], [7, 11], [12, 7.5], [12, 11], [17, 7.5], [17, 10.5], [22, 10.5], [22, 21.5]]) + [4, 8.2, 12.4, 16.6].map((x) => rect(x, 14, 2.6, 3)).join(''),
      rule: 'evenodd',
    },
  ],
  markets: [
    { d: poly([[2.5, 5.6], [8, 3.8], [8, 18.6], [2.5, 20.4]]) },
    { d: poly([[9, 3.8], [15, 5.8], [15, 20.6], [9, 18.6]]) },
    { d: poly([[16, 5.8], [21.5, 4], [21.5, 18.8], [16, 20.6]]) },
  ],
  finance: [
    { d: ellipse(12, 6.2, 7.5, 2.4) },
    { d: 'M4.5 7.6c1.4 1.3 4.3 2.1 7.5 2.1s6.1-.8 7.5-2.1v2.6c0 1.4-3.4 2.5-7.5 2.5s-7.5-1.1-7.5-2.5z' },
    { d: 'M4.5 11.8c1.4 1.3 4.3 2.1 7.5 2.1s6.1-.8 7.5-2.1v2.6c0 1.4-3.4 2.5-7.5 2.5s-7.5-1.1-7.5-2.5z' },
    { d: 'M4.5 16c1.4 1.3 4.3 2.1 7.5 2.1s6.1-.8 7.5-2.1v2.6c0 1.4-3.4 2.5-7.5 2.5s-7.5-1.1-7.5-2.5z' },
  ],
  company: [
    { d: rect(3.6, 2.4, 1.6, 19.4) },
    {
      d: rect(5.2, 3.4, 15.4, 10) + rect(5.2, 3.4, 3.85, 5) + rect(12.9, 3.4, 3.85, 5) + rect(9.05, 8.4, 3.85, 5) + rect(16.75, 8.4, 3.85, 5),
      rule: 'evenodd',
    },
  ],
  cards: [
    { d: 'M1.8 5.4c3.4-.9 6.6-.5 9.4 1.2v14.2c-2.8-1.5-6-1.9-9.4-1.1z' },
    { d: 'M22.2 5.4c-3.4-.9-6.6-.5-9.4 1.2v14.2c2.8-1.5 6-1.9 9.4-1.1z' },
  ],
  settings: [{ d: gear(12, 12, 9.2, 8, 2.4, 3, Math.PI / 8), rule: 'evenodd' }],
  // ---- things ----
  globe: [{ d: circle(12, 12, 9.5) + ellipse(12, 12, 4.8, 9.5) + ellipse(12, 12, 3.3, 9.1) + rect(2, 11.2, 20, 1.6), rule: 'evenodd' }],
  bulb: [
    { d: 'M12 2.2a6.6 6.6 0 0 1 4 11.8c-.8.6-1.2 1.4-1.2 2.4H9.2c0-1-.4-1.8-1.2-2.4A6.6 6.6 0 0 1 12 2.2z' },
    { d: rect(9.2, 17.2, 5.6, 1.5) + rect(9.6, 19.3, 4.8, 1.5) + rect(10.6, 21.3, 2.8, 1) },
  ],
  wrench: [
    {
      d:
        'M15.6 2.4a5.2 5.2 0 0 0-4.9 6.9l-8 8a2 2 0 1 0 2.9 2.9l8-8a5.2 5.2 0 0 0 6.9-4.9l-3 3-2.8-.9-.9-2.8z',
    },
  ],
  alert: [{ d: poly([[12, 2.2], [22.8, 21], [1.2, 21]]) + rect(11, 8.4, 2, 6.8) + circle(12, 17.8, 1.2), rule: 'evenodd' }],
  lock: [
    { d: 'M6.8 10.8V8a5.2 5.2 0 0 1 10.4 0v2.8h-2.4V8a2.8 2.8 0 0 0-5.6 0v2.8z' },
    { d: rect(4.5, 10.8, 15, 11) + circle(12, 15, 1.6) + rect(11.3, 15.6, 1.4, 3.4), rule: 'evenodd' },
  ],
  unlock: [
    { d: 'M13.2 10.8V6a5.2 5.2 0 0 1 10.4 0v1.6h-2.4V6a2.8 2.8 0 0 0-5.6 0v4.8z' },
    { d: rect(2.5, 10.8, 15, 11) + circle(10, 15, 1.6) + rect(9.3, 15.6, 1.4, 3.4), rule: 'evenodd' },
  ],
  clock: [{ d: circle(12, 12, 9.8) + rect(11.1, 5.6, 1.8, 7.2) + rect(11.1, 11, 5.8, 1.8) + circle(12, 12, 7.7) + circle(12, 12, 7.7), rule: 'evenodd' }],
  trophy: [
    { d: 'M6.2 2.6h11.6v5.8c0 3.5-2.6 6.3-5.8 6.3s-5.8-2.8-5.8-6.3z' },
    { d: 'M6.3 4.4H2.8v1.8c0 2.6 1.8 4.6 4.2 5.1l-.4-1.9c-1.2-.5-2-1.7-2-3.2h1.7z' },
    { d: 'M17.7 4.4h3.5v1.8c0 2.6-1.8 4.6-4.2 5.1l.4-1.9c1.2-.5 2-1.7 2-3.2h-1.7z' },
    { d: rect(11, 14.4, 2, 3.6) + rect(7.5, 18, 9, 1.4) + rect(6.5, 19.8, 11, 1.8) },
  ],
  pin: [{ d: 'M12 1.8a6.8 6.8 0 0 1 6.8 6.8c0 5-6.8 13.6-6.8 13.6S5.2 13.6 5.2 8.6A6.8 6.8 0 0 1 12 1.8z' + circle(12, 8.6, 2.5), rule: 'evenodd' }],
  check: [{ d: poly([[3.4, 12.6], [6, 10], [9.9, 13.9], [18, 5.8], [20.6, 8.4], [9.9, 19.1]]) }],
  cross: [{ d: bar(5, 5, 19, 19, 3.4) }, { d: bar(19, 5, 5, 19, 3.4) }],
  star: [{ d: star(12, 12.6, 10.2, 4.2) }],
  sparkle: [{ d: star(10, 12, 9, 2.2, 4, 0) }, { d: star(19.2, 4.8, 3.6, 0.9, 4, 0) }],
  // Research areas.
  engine: [
    { d: rect(6.5, 2.2, 11, 8.8) + rect(6.5, 4.4, 11, 0.9) + rect(6.5, 6.4, 11, 0.9), rule: 'evenodd' },
    { d: poly([[10, 11], [14, 11], [13.4, 16], [10.6, 16]]) },
    { d: circle(12, 18.2, 3.8) + circle(12, 18.2, 1.4), rule: 'evenodd' },
  ],
  gears: [
    { d: gear(9, 9.5, 7, 9, 1.9, 2.2), rule: 'evenodd' },
    { d: gear(17.6, 17.4, 4.6, 7, 1.5, 1.4, 0.35), rule: 'evenodd' },
  ],
  wheel: [
    {
      d:
        circle(12, 12, 10) +
        circle(12, 12, 7.4) +
        circle(12, 12, 2.4) +
        Array.from({ length: 8 }, (_, i) => {
          const a = (i * Math.PI) / 4;
          return bar(12 + Math.cos(a) * 2.2, 12 + Math.sin(a) * 2.2, 12 + Math.cos(a) * 7.6, 12 + Math.sin(a) * 7.6, 1.3);
        }).join(''),
      rule: 'evenodd',
    },
  ],
  shield: [{ d: 'M12 1.8l8.4 3.2v6.2c0 5.2-3.5 9.2-8.4 11-4.9-1.8-8.4-5.8-8.4-11V5z' + rect(10.9, 6, 2.2, 11) + rect(7, 9.9, 10, 2.2), rule: 'evenodd' }],
  // Messages and events.
  newspaper: [
    { d: rect(19, 7, 2.8, 13.5) },
    {
      d: rect(2.4, 3.8, 16, 16.7) + rect(4.4, 5.8, 12, 2.4) + rect(4.4, 10, 5.2, 5) + rect(11, 10, 5.4, 1) + rect(11, 12, 5.4, 1) + rect(11, 14, 5.4, 1) + rect(4.4, 16.6, 12, 1) + rect(4.4, 18.2, 8, 0.8),
      rule: 'evenodd',
    },
  ],
  rosette: [
    { d: poly([[8.2, 14], [5.4, 22], [8.4, 20.4], [10.6, 22.6], [12.4, 15]]) },
    { d: poly([[15.8, 14], [18.6, 22], [15.6, 20.4], [13.4, 22.6], [11.6, 15]]) },
    { d: star(12, 9, 7.6, 6.2, 12) + circle(12, 9, 3.6), rule: 'evenodd' },
  ],
  tophat: [
    { d: 'M2 18.6c0-.9 4.5-1.6 10-1.6s10 .7 10 1.6-4.5 1.8-10 1.8-10-.9-10-1.8z' },
    { d: poly([[6.2, 3.4], [17.8, 3.4], [16.9, 17.4], [7.1, 17.4]]) + rect(6.4, 13.2, 11.2, 1.8), rule: 'evenodd' },
  ],
  grave: [
    { d: 'M5.5 21.2V9.4a6.5 6.5 0 0 1 13 0v11.8z' + rect(11, 6.4, 2, 9) + rect(8.4, 8.8, 7.2, 2), rule: 'evenodd' },
    { d: rect(2.5, 20.4, 19, 1.8) },
  ],
  clipboard: [
    { d: rect(8, 1.8, 8, 4) },
    { d: rect(4, 3.6, 16, 18.6) + rect(6.4, 7.4, 11.2, 1.2) + rect(6.4, 10.6, 11.2, 1.2) + rect(6.4, 13.8, 11.2, 1.2) + rect(6.4, 17, 7, 1.2), rule: 'evenodd' },
  ],
  chart: [{ d: rect(2.5, 20, 19, 1.6) }, { d: rect(4, 12, 4, 7.2) }, { d: rect(10, 6.5, 4, 12.7) }, { d: rect(16, 9.5, 4, 9.7) }],
  chartUp: [{ d: rect(2.5, 20, 19, 1.6) }, { d: rect(4, 14.5, 4, 4.7) }, { d: rect(10, 10.5, 4, 8.7) }, { d: rect(16, 5.5, 4, 13.7) }, { d: poly([[15, 5.4], [18, 1.8], [21, 5.4]]) }],
  chartDown: [{ d: rect(2.5, 20, 19, 1.6) }, { d: rect(4, 5.5, 4, 13.7) }, { d: rect(10, 10.5, 4, 8.7) }, { d: rect(16, 14.5, 4, 4.7) }, { d: poly([[15, 10.4], [21, 10.4], [18, 14]]) }],
  envelope: [{ d: rect(2.2, 5, 19.6, 14) + poly([[3.4, 6.4], [12, 13], [20.6, 6.4], [20.6, 8.4], [12, 15], [3.4, 8.4]]), rule: 'evenodd' }],
  screen: [
    { d: bar(8, 2.2, 12, 6, 1.2) + bar(16, 2.2, 12, 6, 1.2) },
    { d: rect(2.2, 6, 19.6, 14.4) + rect(4.4, 8.2, 11.6, 10) + circle(18.8, 10.6, 1.2) + circle(18.8, 14.6, 1.2), rule: 'evenodd' },
  ],
  gift: [
    { d: rect(3.4, 8, 17.2, 3.4) + rect(11, 8, 2, 3.4), rule: 'evenodd' },
    { d: rect(4.6, 12, 14.8, 10) + rect(11, 12, 2, 10), rule: 'evenodd' },
    { d: 'M12 7.8C10.4 4.2 6.6 3.4 6.6 5.6c0 1.6 2.8 2.2 5.4 2.2zm0 0c1.6-3.6 5.4-4.4 5.4-2.2 0 1.6-2.8 2.2-5.4 2.2z' },
  ],
  banknote: [{ d: rect(1.8, 6, 20.4, 12) + circle(12, 12, 3.2) + rect(3.6, 7.8, 16.8, 8.4) + rect(4.6, 8.8, 14.8, 6.4), rule: 'evenodd' }],
  swords: [
    { d: bar(4, 3.2, 17.6, 16.8, 1.9) },
    { d: bar(20, 3.2, 6.4, 16.8, 1.9) },
    { d: bar(14.8, 19.8, 20.2, 14.4, 1.8) + bar(3.8, 14.4, 9.2, 19.8, 1.8) },
    { d: circle(20.4, 20.6, 1.6) + circle(3.6, 20.6, 1.6) },
  ],
  truce: [
    { d: rect(4.2, 2.4, 1.6, 19.4) },
    { d: 'M5.8 3.6c2.8-1.2 4.8.8 7.4.2 2.4-.6 4.4-1.2 7 .2v9c-2.6-1.4-4.6-.8-7-.2-2.6.6-4.6-1.4-7.4-.2z' },
  ],
  pump: [
    { d: rect(3.2, 3, 10.8, 17.6) + rect(5.4, 5.4, 6.4, 5), rule: 'evenodd' },
    { d: rect(2.2, 20.2, 12.8, 1.8) },
    { d: 'M14 7.2h3.2c.9 0 1.6.7 1.6 1.6V16h-1.6V8.8H14z' },
    { d: rect(16.4, 15.4, 4.6, 3.6) },
  ],
  bank: [
    { d: poly([[1.8, 9], [12, 2.6], [22.2, 9]]) },
    { d: rect(3, 9.6, 18, 1.8) },
    { d: [4.2, 8.6, 13, 17.4].map((x) => rect(x, 12, 2.4, 6.6)).join('') },
    { d: rect(2.2, 19.2, 19.6, 2.4) },
  ],
  scroll: [
    { d: rect(5.4, 3.2, 13.2, 17.6) + rect(7.8, 7, 8.4, 1.1) + rect(7.8, 9.8, 8.4, 1.1) + rect(7.8, 12.6, 8.4, 1.1) + rect(7.8, 15.4, 5.4, 1.1), rule: 'evenodd' },
    { d: circle(5.4, 4.6, 2) + circle(18.6, 19.4, 2) },
  ],
  drum: [{ d: 'M6 3.6c0-.9 2.7-1.4 6-1.4s6 .5 6 1.4v16.8c0 .9-2.7 1.4-6 1.4s-6-.5-6-1.4z' + rect(6, 8, 12, 1.4) + rect(6, 14.6, 12, 1.4) + circle(14.6, 4.6, 0.8), rule: 'evenodd' }],
  tag: [{ d: 'M2.6 12.4V3.6c0-.6.4-1 1-1h8.8L21.6 12 12 21.6z' + circle(7.4, 7.4, 1.8), rule: 'evenodd' }],
  contract: [
    { d: rect(3.6, 2.4, 13.6, 18) + rect(6, 5.8, 8.8, 1.1) + rect(6, 8.6, 8.8, 1.1) + rect(6, 11.4, 6, 1.1), rule: 'evenodd' },
    { d: star(17.4, 16.4, 4.8, 3.9, 10) },
    { d: poly([[15.6, 19.8], [14.6, 23], [16.4, 22.2], [17.4, 23.4], [17.8, 20.6]]) },
  ],
  briefcase: [
    { d: 'M8.4 6.8V5a1.6 1.6 0 0 1 1.6-1.6h4a1.6 1.6 0 0 1 1.6 1.6v1.8H14V5.2h-4v1.6z' },
    { d: rect(2.2, 6.8, 19.6, 13.8) + rect(2.2, 12, 19.6, 1.4) + rect(10.6, 11.2, 2.8, 3), rule: 'evenodd' },
  ],
  fin: [
    { d: 'M4.6 17.2C9 15.6 12 10 13.4 2.6c1.8 5.8 3.8 11.2 7 14.6z' },
    { d: 'M1.6 19.4c1.8 0 1.8 1.2 3.6 1.2s1.8-1.2 3.6-1.2 1.8 1.2 3.6 1.2 1.8-1.2 3.6-1.2 1.8 1.2 3.6 1.2 1.8-1.2 3.2-1.2v1.8c-1.4 0-1.4 1.2-3.2 1.2s-1.8-1.2-3.6-1.2-1.8 1.2-3.6 1.2-1.8-1.2-3.6-1.2-1.8 1.2-3.6 1.2-1.8-1.2-3.6-1.2z' },
  ],
  // The clock.
  pause: [{ d: rect(5.5, 4, 4.4, 16) + rect(14.1, 4, 4.4, 16) }],
  play: [{ d: poly([[6, 3.6], [20, 12], [6, 20.4]]) }],
  fast: [{ d: poly([[2, 4.4], [12, 12], [2, 19.6]]) + poly([[12, 4.4], [22, 12], [12, 19.6]]) }],
  fastest: [{ d: poly([[0.6, 5.4], [8.2, 12], [0.6, 18.6]]) + poly([[8.2, 5.4], [15.8, 12], [8.2, 18.6]]) + poly([[15.8, 5.4], [23.4, 12], [15.8, 18.6]]) }],
  // The classes of car, side on.
  segCity: car(
    [[3.2, 15.8], [3.8, 13.6], [7, 12.8], [9, 8.6], [15, 8.6], [16.4, 12.6], [20.2, 13.2], [20.8, 15.8], [20.8, 17], [3.2, 17]],
    [[[10, 9.9], [14.2, 9.9], [15, 12.4], [9, 12.4]]],
    [[7.2, 17.2], [16.8, 17.2]],
    2.4,
  ),
  segFamily: car(
    [[1.6, 15.2], [2.3, 13.2], [6.8, 12.3], [9.3, 8.4], [16.2, 8.4], [18.6, 12.2], [21.6, 13], [22.4, 15.2], [22.4, 17], [1.6, 17]],
    [
      [[10.2, 9.8], [13, 9.8], [13, 12.2], [8.6, 12.2]],
      [[14.2, 9.8], [15.6, 9.8], [17.1, 12.2], [14.2, 12.2]],
    ],
    [[6.6, 17.2], [17.4, 17.2]],
  ),
  segSport: car(
    [[1.2, 15.8], [2, 13.6], [9, 12.4], [11.6, 10.6], [14, 10.6], [15.2, 12.2], [21.8, 13.4], [22.8, 15.8], [22.8, 17.2], [1.2, 17.2]],
    [[[12, 11.4], [13.6, 11.4], [14.2, 12.4], [11.2, 12.4]]],
    [[6, 17.4], [18, 17.4]],
    2.4,
  ),
  segLuxury: car(
    [[0.8, 15.2], [1.4, 13.2], [8, 12.2], [10, 8.2], [18.6, 8.2], [20, 12.2], [22.6, 12.8], [23.2, 15.2], [23.2, 17], [0.8, 17]],
    [
      [[10.8, 9.5], [13.8, 9.5], [13.8, 12], [9.8, 12]],
      [[15, 9.5], [18, 9.5], [18.8, 12], [15, 12]],
    ],
    [[5.2, 17.2], [19, 17.2]],
  ),
  segPickup: car(
    [[1.4, 15.4], [2, 13], [5.8, 12.2], [7.6, 7.8], [12.4, 7.8], [12.4, 11.6], [22.6, 11.6], [22.6, 17], [1.4, 17]],
    [[[8.6, 9], [11.2, 9], [11.2, 11.6], [7.6, 11.6]]],
    [[6, 17.2], [18, 17.2]],
  ),
  segSuv: car(
    [[1.6, 15], [2, 11.6], [5.4, 10.8], [7.2, 6.6], [21.4, 6.6], [22.4, 10.8], [22.4, 17], [1.6, 17]],
    [
      [[8.2, 7.9], [12, 7.9], [12, 10.8], [6.8, 10.8]],
      [[13.2, 7.9], [16.8, 7.9], [16.8, 10.8], [13.2, 10.8]],
      [[18, 7.9], [20.6, 7.9], [21.2, 10.8], [18, 10.8]],
    ],
    [[6.4, 17.2], [17.6, 17.2]],
    2.6,
  ),
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

/** One of the game's pictograms, sized with the text around it unless a size is given. */
export function Icon({ name, size, title, ...rest }: { name: IconName; size?: number | string; title?: string } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  const s = size ?? '1.15em';
  return (
    <svg
      viewBox="0 0 24 24"
      width={s}
      height={s}
      fill="currentColor"
      className={`icon icon-${name} ${rest.className ?? ''}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {(ICONS[name] as Shape[]).map((p, i) => (
        <path key={i} d={p.d} fillRule={p.rule} />
      ))}
    </svg>
  );
}
