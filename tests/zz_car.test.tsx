import { test } from 'vitest';
import { writeFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { CarSVG } from '../src/ui/viz/CarSVG';

test('draw', () => {
  const cars = [
    ['phaeton', 1905, 0.3, '#7a2a24', undefined],
    ['sedan', 1926, 0.7, '#23344f', undefined],
    ['coupe', 1934, 0.7, '#c99a2e', undefined],
    ['sedan', 1949, 0.5, '#3b5f8f', undefined],
    ['sedan', 1957, 0.7, '#e07a62', '#e3d5b0'],
    ['coupe', 1959, 0.8, '#3aa3a6', '#e3d5b0'],
  ] as const;
  const html = cars.map(([b, y, st, c, r]) => '<div style="display:inline-block;width:420px;background:#16384f;margin:4px">' + renderToStaticMarkup(<CarSVG body={b} size={0.5} year={y} cylinders={6} styling={st} color={c} roof={r} />) + '<div style="color:#fff;font:12px sans-serif">' + b + ' ' + y + '</div></div>').join('');
  writeFileSync('/tmp/claude-0/-home-user-CarFacTycoon/c994d861-c0b2-5ce7-ae18-1b42aa852fb0/scratchpad/cars.html', '<html><head><style>:root{--car-trim:#2b2a27;--car-glass:#b9d3e4;--car-tyre:#1f1e1c;--car-chrome:#c9c6be;--car-wood:#b78a52;--car-top:#3a3833;--car-lamp:#f6e7a6;--car-whitewall:#f2efe6;--car-shadow:rgba(0,0,0,.12);--car-arch:#1f1e1c;--bad:#b3342a}</style></head><body style="margin:0;width:1300px">' + html + '</body></html>');
});
