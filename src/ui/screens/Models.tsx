import { formatDate, yearFloat } from '../../core/time';
import type { CarModel } from '../../core/types';
import { store, useGameState } from '../store';
import { dec, money, num } from '../format';
import { Badge, Empty, SegmentLabel } from '../components/ui';
import { CarSVG } from '../viz/CarSVG';
import { weeklySold } from './HQ';
import { t } from '../../i18n';

/** A model as a page of the maker's catalogue: the car, its name and class, and its figures. */
function ModelEntry({ m }: { m: CarModel }) {
  const active = m.status === 'active';
  const figures: [string, string][] = [
    [t('Haftalık'), active ? dec(weeklySold(m), 1) : '—'],
    [t('Toplam satış'), num(m.unitsSold)],
    [t('Fiyat'), money(m.price)],
    [t('Dergi'), dec(m.reviewScore, 1)],
  ];
  return (
    <button type="button" className={`model-entry ${active ? '' : 'is-retired'}`} onClick={() => store.go({ id: 'model', modelId: m.id })}>
      <span className="model-entry-car" aria-hidden>
        <CarSVG body={m.design.body} size={m.design.size} year={yearFloat(m.refreshWeek)} cylinders={m.design.engine.cylinders} styling={m.design.styling} />
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
              <ModelEntry key={m.id} m={m} />
            ))}
          </div>
          {retired.length > 0 && (
            <>
              <h4 className="model-list-title">{t('Üretimden kalktı')}</h4>
              <div className="model-list is-retired">
                {retired.map((m) => (
                  <ModelEntry key={m.id} m={m} />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <Empty>{t('Henüz piyasaya çıkmış bir modelin yok. Projeler ekranından ilk aracını tasarla.')}</Empty>
      )}
    </div>
  );
}
