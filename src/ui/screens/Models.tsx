import { formatDate, yearOf } from '../../core/time';
import { SEGMENTS } from '../../data/segments';
import type { CarModel, GameState } from '../../core/types';
import { store, useGameState } from '../store';
import { cars, dec, money, num } from '../format';
import { Badge, Empty, Panel, SegmentLabel } from '../components/ui';
import { ModelCar } from '../components/ModelCar';
import { weeklySold } from './HQ';
import { t } from '../../i18n';

/** A model as a page of the maker's catalogue: the car, its name and class, and its figures. */
function ModelEntry({ s, m }: { s: GameState; m: CarModel }) {
  const active = m.status === 'active';
  const figures: [string, string][] = [
    [t('Haftalık'), active ? cars(weeklySold(m)) : '—'],
    [t('Toplam satış'), num(m.unitsSold)],
    [t('Fiyat'), money(m.price)],
    [t('Dergi'), dec(m.reviewScore, 1)],
  ];
  return (
    <button type="button" className={`model-entry ${active ? '' : 'is-retired'}`} onClick={() => store.go({ id: 'model', modelId: m.id })}>
      <span className="model-entry-car" aria-hidden>
        <ModelCar s={s} m={m} />
      </span>
      <span className="model-entry-head">
        <span className="model-entry-name">
          {m.name}
          {m.generation > 1 && <small> {t('({gen}. kuşak)', { gen: m.generation })}</small>}
        </span>
        <span className="model-entry-meta">
          <SegmentLabel id={m.segment} /> · {formatDate(m.launchWeek)}
        </span>
      </span>
      <span className="model-entry-stamp">{active ? <Badge tone="good">{t('Satışta')}</Badge> : <Badge>{t('Üretimden kalktı')}</Badge>}</span>
      {active && (
        <span className="model-entry-figures">
          {figures.map(([label, value]) => (
            <span key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

/**
 * The company's cars class by class, generation after generation: a strip of small drawings, the cars
 * on sale at the end (a tap opens the car).
 */
function Lineage({ s }: { s: GameState }) {
  // Each strip opens on its latest generation (the end of the line, either way the text runs).
  const toEnd = (el: HTMLDivElement | null) => {
    if (el && !el.dataset.placed) {
      el.dataset.placed = '1';
      el.scrollLeft = getComputedStyle(el).direction === 'rtl' ? -el.scrollWidth : el.scrollWidth;
    }
  };
  const rows = SEGMENTS.map((seg) => ({ seg, cars: s.models.filter((m) => m.segment === seg.id).sort((a, b) => a.launchWeek - b.launchWeek) })).filter((x) => x.cars.length);
  return (
    <Panel title={t('Kuşaklar')}>
      {rows.map(({ seg, cars: line }) => (
        <div key={seg.id} className="lineage">
          <SegmentLabel id={seg.id} />
          <div className="lineage-strip" ref={toEnd}>
            {line.map((m) => (
              <button key={m.id} type="button" className={`lineage-car ${m.status === 'active' ? 'is-active' : ''}`} onClick={() => store.go({ id: 'model', modelId: m.id })}>
                <ModelCar s={s} m={m} />
                <b>{m.name}</b>
                <small>
                  {yearOf(m.launchWeek)}–{m.retiredWeek !== undefined ? yearOf(m.retiredWeek) : t('bugün')} · {t('{count} araç', { count: num(m.unitsSold) })}
                </small>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}

export function Models() {
  const s = useGameState();
  const active = s.models.filter((m) => m.status === 'active').sort((a, b) => b.launchWeek - a.launchWeek);
  const retired = s.models.filter((m) => m.status !== 'active').sort((a, b) => b.launchWeek - a.launchWeek);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Modeller')}</h1>
      </div>
      {s.models.length ? (
        <>
          <div className="model-list">
            {active.map((m) => (
              <ModelEntry key={m.id} s={s} m={m} />
            ))}
          </div>
          {retired.length > 0 && <Lineage s={s} />}
        </>
      ) : (
        <Empty>{t('Henüz piyasaya çıkmış bir modelin yok. Projeler ekranından ilk aracını tasarla.')}</Empty>
      )}
    </div>
  );
}
