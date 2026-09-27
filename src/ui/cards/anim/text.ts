import { font, type Ctx } from './draw';

/** Greedy word wrap for canvas text. */
export function wrap(ctx: Ctx, s: string, maxWidth: number, size: number, weight = 500): string[] {
  ctx.font = font(size, weight);
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws wrapped text; returns the y just below the last line. */
export function paragraph(
  ctx: Ctx,
  s: string,
  x: number,
  y: number,
  maxWidth: number,
  o: { size: number; color: string; weight?: number; lineHeight?: number; align?: CanvasTextAlign; maxLines?: number },
): number {
  const lines = wrap(ctx, s, maxWidth, o.size, o.weight ?? 500).slice(0, o.maxLines ?? 99);
  const lh = o.lineHeight ?? o.size * 1.3;
  ctx.font = font(o.size, o.weight ?? 500);
  ctx.fillStyle = o.color;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  return y + lines.length * lh;
}
