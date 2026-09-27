import type { BodyId } from '../../core/types';

// Procedural side view of a car. Proportions follow the design (size, engine
// length, body type) and the era (upright 1900s coachwork → 1950s pontoon).

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function CarSVG(props: {
  body: BodyId;
  size: number;
  year: number;
  cylinders: number;
  styling: number;
  color?: string;
  width?: number;
  className?: string;
}) {
  const { body, size, year, cylinders, styling } = props;
  const s = clamp01((year - 1918) / 38); // streamlining 0 (upright) .. 1 (pontoon)
  const W = 440;
  const H = 180;
  const ground = 158;
  const wheelR = lerp(31, 22, clamp01((year - 1900) / 50)) * (0.94 + 0.12 * size) * (body === 'suv' ? 1.15 : 1);
  const wb = 168 + 96 * size;
  const cx = W / 2 - 6;
  const rearX = cx - wb / 2;
  const frontX = cx + wb / 2;
  const clearance = body === 'suv' ? 0.95 : lerp(0.95, 0.55, s);
  const sill = ground - wheelR - wheelR * clearance * 0.45;
  const hoodH = lerp(34, 30, s) + size * 4;
  const hoodTop = sill - hoodH;
  const hoodLen = 52 + cylinders * 4.5 + size * 18;
  const frontOverhang = lerp(8, 34, s);
  const rearOverhang = lerp(12, 44, s) + (body === 'sedan' || body === 'coupe' ? lerp(0, 10, s) : 0);
  const frontEnd = frontX + wheelR + frontOverhang;
  const rearEnd = rearX - wheelR - rearOverhang;
  const cowl = frontEnd - hoodLen - lerp(10, 6, s);
  const closed = body !== 'phaeton' && body !== 'roadster';
  const cabinH = body === 'suv' ? 50 : lerp(46, 38, s) + size * 4;
  const roof = hoodTop - cabinH;
  const rake = lerp(2, 22, s); // windscreen rake
  const round = lerp(3, 16, s);
  const paint = props.color ?? 'var(--car-body)';
  const trim = 'var(--car-trim)';
  const glass = 'var(--car-glass)';
  const tyre = 'var(--car-tyre)';
  const chrome = 'var(--car-chrome)';

  // ---- body shell ----
  let cabinRear = rearEnd + 10;
  if (body === 'coupe') cabinRear = lerp(rearX + 10, rearX + 20, s);
  if (body === 'sedan') cabinRear = lerp(rearEnd + 8, rearX - 4, s);
  if (body === 'pickup') cabinRear = cowl - 58;
  if (body === 'station' || body === 'suv') cabinRear = rearEnd + 6;
  if (body === 'roadster') cabinRear = cowl - 56;
  if (body === 'phaeton') cabinRear = rearEnd + 10;

  const beltY = hoodTop + lerp(0, 4, s);
  const tailTop = body === 'pickup' ? hoodTop + 6 : lerp(hoodTop + 2, hoodTop + 8, s);

  // Lower body (hood + tub/trunk), with rounded front and rear.
  const lower = [
    `M${rearEnd},${sill}`,
    `L${rearEnd},${tailTop + round}`,
    `Q${rearEnd},${tailTop} ${rearEnd + round},${tailTop}`,
    `L${cowl},${beltY}`,
    `L${frontEnd - round * 1.4},${hoodTop + lerp(0, 5, s)}`,
    `Q${frontEnd},${hoodTop + lerp(0, 8, s)} ${frontEnd},${hoodTop + round + lerp(4, 12, s)}`,
    `L${frontEnd},${sill}`,
    'Z',
  ].join(' ');

  // Cabin: closed roof or open windscreen.
  let cabin = '';
  let windows: string[] = [];
  if (closed) {
    const wsBase = cowl;
    const wsTop = cowl - rake;
    const roofEnd = body === 'station' || body === 'suv' ? cabinRear + 4 : cabinRear + lerp(4, 28, s);
    cabin = [
      `M${wsBase},${beltY}`,
      `L${wsTop},${roof + round * 0.6}`,
      `Q${wsTop - round * 0.3},${roof} ${wsTop - round},${roof}`,
      `L${roofEnd + round},${roof}`,
      `Q${roofEnd},${roof} ${roofEnd - lerp(0, 4, s)},${roof + round}`,
      `L${cabinRear},${body === 'pickup' ? beltY : tailTop}`,
      `L${cabinRear},${beltY}`,
      'Z',
    ].join(' ');
    // Windows: split into panes between windscreen and rear.
    const top = roof + 5;
    const bot = beltY - 4;
    const left = cabinRear + 6 + lerp(0, 8, s);
    const right = wsTop - 5;
    const panes = body === 'coupe' || body === 'pickup' ? 1 : body === 'station' || body === 'suv' ? 3 : 2;
    const pw = (right - left) / panes;
    windows = Array.from({ length: panes }, (_, i) => {
      const x0 = left + i * pw + 3;
      const x1 = left + (i + 1) * pw - 3;
      const slantR = i === panes - 1 ? rake * 0.8 : 0;
      const slantL = i === 0 && body !== 'station' && body !== 'suv' ? lerp(0, 12, s) : 0;
      return `M${x0 + slantL},${top} L${x1 - slantR * 0.2},${top} L${x1 + slantR * 0.6},${bot} L${x0},${bot} Z`;
    });
  }

  // Early separate fenders & running board; later integrated pontoon sides.
  const fenderOpacity = 1 - clamp01((s - 0.7) / 0.3);
  const fender = (x: number, front: boolean) => {
    const r = wheelR + 6;
    const y = ground - wheelR;
    const ext = front ? lerp(10, 20, s) : lerp(8, 16, s);
    return `M${x - r - (front ? 2 : ext)},${y + 4} Q${x - r},${y - r - 2} ${x},${y - r - 3} Q${x + r},${y - r - 2} ${x + r + (front ? ext : 2)},${y + 4 + (front ? 6 : 0)}`;
  };

  const wheel = (x: number) => {
    const y = ground - wheelR;
    const spokes = year < 1930 ? 12 : 0;
    return (
      <g key={x}>
        <circle cx={x} cy={y} r={wheelR} fill={tyre} />
        {year >= 1948 && <circle cx={x} cy={y} r={wheelR * 0.78} fill="var(--car-whitewall)" />}
        <circle cx={x} cy={y} r={wheelR * (year < 1930 ? 0.82 : 0.62)} fill={year < 1930 ? 'var(--car-wood)' : paint} />
        {Array.from({ length: spokes }, (_, i) => {
          const a = (i / spokes) * Math.PI * 2;
          return <line key={i} x1={x} y1={y} x2={x + Math.cos(a) * wheelR * 0.8} y2={y + Math.sin(a) * wheelR * 0.8} stroke={tyre} strokeWidth={1.4} />;
        })}
        <circle cx={x} cy={y} r={wheelR * 0.24} fill={chrome} />
      </g>
    );
  };

  const grilleX = frontEnd - 3;
  const lampY = hoodTop + lerp(-4, 10, s);
  const lampX = frontEnd - lerp(4, 8, s);

  return (
    <svg className={props.className} viewBox={`0 0 ${W} ${H}`} width={props.width} role="img" aria-label={`${body} gövdeli araç çizimi`}>
      <ellipse cx={cx} cy={ground + 5} rx={wb / 2 + wheelR + 40} ry={5} fill="var(--car-shadow)" />
      {/* running board */}
      {fenderOpacity > 0 && (
        <rect x={rearX + wheelR} y={sill - 2} width={frontX - rearX - wheelR * 2} height={5} rx={2} fill={trim} opacity={fenderOpacity} />
      )}
      {closed && <path d={cabin} fill={paint} stroke={trim} strokeWidth={1.5} strokeLinejoin="round" />}
      {windows.map((d, i) => (
        <path key={i} d={d} fill={glass} />
      ))}
      {!closed && (
        <g>
          {/* windscreen frame */}
          <line x1={cowl} y1={beltY} x2={cowl - rake} y2={beltY - 30} stroke={chrome} strokeWidth={2.5} />
          <line x1={cowl - rake * 0.5} y1={beltY - 14} x2={cowl - rake - 4} y2={beltY - 30} stroke={glass} strokeWidth={6} opacity={0.8} />
          {/* seat backs */}
          <path d={`M${cowl - 40},${beltY} q-6,-18 -18,-18 l-6,0 q6,4 6,18 z`} fill={trim} />
          {body === 'phaeton' && <path d={`M${cowl - 100},${beltY} q-6,-18 -18,-18 l-6,0 q6,4 6,18 z`} fill={trim} />}
          {/* folded top */}
          <path d={`M${cabinRear + 4},${beltY - 2} q8,-14 26,-12 l0,6 q-14,0 -18,8 z`} fill="var(--car-top)" />
        </g>
      )}
      <path d={lower} fill={paint} stroke={trim} strokeWidth={1.5} strokeLinejoin="round" />
      {/* hood louvres / side trim */}
      {s < 0.6 ? (
        Array.from({ length: 4 }, (_, i) => (
          <line key={i} x1={cowl + 14 + i * 7} y1={hoodTop + 8} x2={cowl + 14 + i * 7} y2={sill - 10} stroke={trim} strokeWidth={1.2} opacity={0.6} />
        ))
      ) : (
        <line x1={rearEnd + 10} y1={(beltY + sill) / 2 + 4} x2={frontEnd - 10} y2={(beltY + sill) / 2 + 2} stroke={chrome} strokeWidth={1.6} opacity={0.8 * (0.4 + styling)} />
      )}
      {/* pickup bed */}
      {body === 'pickup' && <rect x={rearEnd + 2} y={tailTop} width={cabinRear - rearEnd - 6} height={6} fill={trim} opacity={0.5} />}
      {/* door line */}
      {closed && <line x1={cowl - 12} y1={beltY + 2} x2={cowl - 12} y2={sill - 4} stroke={trim} strokeWidth={1} opacity={0.5} />}
      {/* grille */}
      <rect x={grilleX - lerp(4, 2, s)} y={hoodTop + lerp(2, 10, s)} width={lerp(5, 4, s)} height={sill - hoodTop - lerp(4, 16, s)} rx={2} fill={chrome} />
      {/* fenders */}
      {fenderOpacity > 0 && (
        <g opacity={fenderOpacity}>
          <path d={fender(rearX, false)} fill="none" stroke={paint} strokeWidth={7} strokeLinecap="round" />
          <path d={fender(frontX, true)} fill="none" stroke={paint} strokeWidth={7} strokeLinecap="round" />
        </g>
      )}
      {/* wheel arches for pontoon bodies */}
      {fenderOpacity < 1 && (
        <g opacity={1 - fenderOpacity}>
          <circle cx={rearX} cy={ground - wheelR} r={wheelR + 4} fill="var(--car-arch)" />
          <circle cx={frontX} cy={ground - wheelR} r={wheelR + 4} fill="var(--car-arch)" />
        </g>
      )}
      {wheel(rearX)}
      {wheel(frontX)}
      {/* lamps */}
      <circle cx={lampX} cy={lampY} r={lerp(6, 5, s)} fill="var(--car-lamp)" stroke={chrome} strokeWidth={1.5} />
      <rect x={rearEnd - 2} y={tailTop + 6} width={4} height={6} rx={1} fill="var(--bad)" />
      {/* bumpers (from the 1920s) */}
      {year >= 1922 && (
        <g>
          <rect x={frontEnd - 2} y={sill - 8} width={lerp(6, 10, s)} height={5} rx={2} fill={chrome} />
          <rect x={rearEnd - lerp(4, 8, s)} y={sill - 8} width={lerp(6, 10, s)} height={5} rx={2} fill={chrome} />
        </g>
      )}
    </svg>
  );
}
