import { useRef, useState } from 'react';
import { modelAdCopy } from '../../core/news';
import { yearOf } from '../../core/time';
import type { CarModel, GameState } from '../../core/types';
import { cityDef } from '../../data/cities';
import { t } from '../../i18n';
import { money } from '../format';
import { modelPaint } from '../paint';
import { store } from '../store';
import { CarSVG } from '../viz/CarSVG';
import { Button } from './ui';

// A model's advertisement as the period printed it, to keep or to share: engraved type and a double
// rule before 1920, Art Deco rays and condensed capitals between the wars, a bright fifties page after.

type Era = 'early' | 'deco' | 'fifties';
const eraOf = (year: number): Era => (year < 1920 ? 'early' : year < 1940 ? 'deco' : 'fifties');

const STYLE: Record<Era, { paper: string; ink: string; accent: string; head: string; body: string }> = {
  early: { paper: '#efe3c4', ink: '#2b2118', accent: '#8b2a1e', head: "Georgia, 'Times New Roman', serif", body: "Georgia, 'Times New Roman', serif" },
  deco: { paper: '#e9dcbc', ink: '#1d1b17', accent: '#a07a32', head: "Oswald, 'Arial Narrow', sans-serif", body: "'Libre Franklin', Arial, sans-serif" },
  fifties: { paper: '#f6ecd9', ink: '#1f2a36', accent: '#d4553f', head: "'Libre Franklin', Arial, sans-serif", body: "'Libre Franklin', Arial, sans-serif" },
};

const PW = 600;
const PH = 800;

export function AdPosterSVG({ s, m, svgRef }: { s: GameState; m: CarModel; svgRef?: React.Ref<SVGSVGElement> }) {
  const year = yearOf(s.week);
  const era = eraOf(year);
  const st = STYLE[era];
  const copy = modelAdCopy(s, m);
  const paint = modelPaint(s, m);
  const name = m.name.toUpperCase();
  const fitName = name.length > 10 ? { textLength: 520, lengthAdjust: 'spacingAndGlyphs' as const } : {};
  return (
    <svg ref={svgRef} viewBox={`0 0 ${PW} ${PH}`} className="ad-poster" role="img" aria-label={t('{company} {model} gazete ilanı', { company: s.company.name, model: m.name })}>
      <rect width={PW} height={PH} fill={st.paper} />
      {era === 'early' && (
        <g fill="none" stroke={st.ink}>
          <rect x={18} y={18} width={PW - 36} height={PH - 36} strokeWidth={3} />
          <rect x={28} y={28} width={PW - 56} height={PH - 56} strokeWidth={1} />
        </g>
      )}
      {era === 'deco' && (
        <g stroke={st.accent} strokeWidth={2} opacity={0.55}>
          {Array.from({ length: 19 }, (_, i) => {
            const a = Math.PI * (1 + i / 18);
            return <line key={i} x1={PW / 2} y1={420} x2={PW / 2 + Math.cos(a) * 420} y2={420 + Math.sin(a) * 420} />;
          })}
          <rect x={14} y={14} width={PW - 28} height={PH - 28} fill="none" stroke={st.ink} strokeWidth={6} opacity={1} />
        </g>
      )}
      {era === 'fifties' && (
        <g>
          <path d={`M0,250 L${PW},170 L${PW},470 L0,520 Z`} fill="#3aa3a6" opacity={0.85} />
          <circle cx={PW - 72} cy={262} r={42} fill={st.accent} />
        </g>
      )}
      <text x={PW / 2} y={78} textAnchor="middle" fill={st.ink} fontFamily={st.body} fontSize={20} letterSpacing={6}>
        {s.company.name.toUpperCase()}
      </text>
      {era === 'fifties' && (
        <text x={PW - 72} y={269} textAnchor="middle" fill="#fff" fontFamily={st.head} fontSize={19} fontWeight={800} transform={`rotate(-12 ${PW - 72} 262)`}>
          {t('YENİ!')}
        </text>
      )}
      <text x={PW / 2} y={160} textAnchor="middle" fill={era === 'deco' ? st.ink : st.accent} fontFamily={st.head} fontSize={78} fontWeight={700} {...fitName}>
        {name}
      </text>
      <text x={PW / 2} y={210} textAnchor="middle" fill={st.ink} fontFamily={st.body} fontSize={28} fontStyle="italic" fontWeight={era === 'fifties' ? 700 : 400}>
        {copy.slogan}
      </text>
      <svg x={40} y={232} width={520} height={213} viewBox="0 0 440 180">
        <CarSVG body={m.design.body} size={m.design.size} year={yearOf(m.refreshWeek)} cylinders={m.design.engine.cylinders} styling={m.design.styling} color={paint.body.color} roof={paint.roof?.color} />
      </svg>
      {copy.lines.map((line, i) => (
        <text key={line} x={PW / 2} y={512 + i * 36} textAnchor="middle" fill={st.ink} fontFamily={st.body} fontSize={24}>
          {`${era === 'early' ? '❧' : '★'} ${line}`}
        </text>
      ))}
      <line x1={120} x2={PW - 120} y1={640} y2={640} stroke={st.ink} strokeWidth={1.5} />
      <text x={PW / 2} y={688} textAnchor="middle" fill={st.accent} fontFamily={st.head} fontSize={36} fontWeight={700}>
        {t('Fiyatı yalnızca {price}', { price: money(copy.price) })}
      </text>
      <text x={PW / 2} y={736} textAnchor="middle" fill={st.ink} fontFamily={st.body} fontSize={18} letterSpacing={2}>
        {t('En yakın bayimizde sizi bekliyor')}
      </text>
      <text x={PW / 2} y={764} textAnchor="middle" fill={st.ink} fontFamily={st.body} fontSize={14} opacity={0.75}>
        {`${cityDef(s.company.city).name} · ${year}`}
      </text>
    </svg>
  );
}

/** The poster as a PNG: theme colours written in (an image knows no stylesheet), drawn at twice the size. */
async function posterBlob(svg: SVGSVGElement): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  let xml = new XMLSerializer().serializeToString(svg);
  xml = xml.replace(/var\((--[\w-]+)\)/g, (_, name: string) => css.getPropertyValue(name).trim() || '#000');
  if (!/^<svg[^>]*xmlns=/.test(xml)) xml = xml.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('poster'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = PW * 2;
    canvas.height = PH * 2;
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('poster'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The model page's advertisement: the poster, and buttons to save or share it as a picture. */
export function AdPoster({ s, m }: { s: GameState; m: CarModel }) {
  const ref = useRef<SVGSVGElement>(null);
  const [busy, setBusy] = useState(false);
  // A plain Latin file name: Turkish letters lose their marks, other scripts fall back to the game's name.
  const plain = (x: string) =>
    x
      .replace(/ı/g, 'i')
      .replace(/İ/g, 'I')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const file = `${plain(`${s.company.name}-${m.name}`) || 'carfactycoon'}-${yearOf(s.week)}.png`;
  const canShare = typeof navigator !== 'undefined' && !!navigator.canShare && navigator.canShare({ files: [new File([''], file, { type: 'image/png' })] });
  const run = async (how: 'save' | 'share') => {
    if (!ref.current || busy) return;
    setBusy(true);
    try {
      const blob = await posterBlob(ref.current);
      if (how === 'share') {
        await navigator.share({ files: [new File([blob], file, { type: 'image/png' })], title: m.name });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = file;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') store.showToast(t('İlan resme çevrilemedi.'), 'bad');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ad-poster-wrap">
      <AdPosterSVG s={s} m={m} svgRef={ref} />
      <div className="ad-poster-actions">
        <Button small onClick={() => run('save')} disabled={busy}>
          {t('Resim olarak indir')}
        </Button>
        {canShare && (
          <Button small onClick={() => run('share')} disabled={busy}>
            {t('Paylaş')}
          </Button>
        )}
      </div>
    </div>
  );
}
