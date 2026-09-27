/* Throwaway preview for the "Neden böyle çalışıyor?" animations.
   URL params: ?only=<id>  ?w=<card width px>  ?theme=light|dark */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/ui/styles.css';
import { CARD_ANIMATIONS, FourStroke, type CardAnimationId } from '../src/ui/cards/animations';

const params = new URLSearchParams(location.search);
const only = params.get('only');
const width = Number(params.get('w')) || 0;
const theme = params.get('theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

const TITLES: Record<CardAnimationId, string> = {
  fourStroke: 'Dört zamanlı motor',
  gearbox: 'Şanzıman neden var?',
  movingLine: 'Hareketli montaj hattı',
  electricStarter: 'Elektrikli marş',
  hydraulicBrake: 'Hidrolik fren',
  synchromesh: 'Senkromeç',
  monocoque: 'Monokok gövde',
  independentSuspension: 'Bağımsız süspansiyon',
  duco: 'Hızlı kuruyan boya',
  supercharger: 'Kompresör (süperşarj)',
};

const ids = (Object.keys(CARD_ANIMATIONS) as CardAnimationId[]).filter((id) => !only || id === only);

const pageCss = `
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-ui); }
  .dev-wrap { padding: 16px; max-width: 1900px; margin: 0 auto; }
  .dev-grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, ${width ? width : 560}px), 1fr)); }
  .dev-card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; min-width: 0; ${width ? `width: ${width}px; box-sizing: border-box;` : ''} }
  .dev-card h2 { margin: 0 0 10px; font: 700 15px var(--font-display, serif); }
  .dev-card h2 small { font: 500 11px var(--font-mono); color: var(--muted); margin-left: 6px; }
`;

function App() {
  return (
    <div className="dev-wrap">
      <style>{pageCss}</style>
      <div className="dev-grid">
        {ids.map((id) => {
          const C = CARD_ANIMATIONS[id];
          return (
            <section className="dev-card" key={id} data-id={id}>
              <h2>
                {TITLES[id]}
                <small>{id}</small>
              </h2>
              <C />
            </section>
          );
        })}
        {!only || only === 'fourStrokeProps' ? (
          <>
            <section className="dev-card" data-id="fourStroke-long">
              <h2>
                Oyun motoru: 80×120 uzun strok <small>props, controls=false</small>
              </h2>
              <FourStroke bore={80} stroke={120} rpm={1800} controls={false} />
            </section>
            <section className="dev-card" data-id="fourStroke-short">
              <h2>
                Oyun motoru: 100×75 kısa strok <small>props</small>
              </h2>
              <FourStroke bore={100} stroke={75} rpm={3600} />
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
