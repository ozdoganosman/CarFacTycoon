import { formatDate } from '../../core/time';
import { segmentDef } from '../../data/segments';
import { store, useGameState } from '../store';
import { dec, money, num } from '../format';
import { Badge, Empty, Panel, Table } from '../components/ui';
import { weeklySold } from './HQ';
import { t } from '../../i18n';

export function Models() {
  const s = useGameState();
  const list = [...s.models].sort((a, b) => (a.status === b.status ? b.launchWeek - a.launchWeek : a.status === 'active' ? -1 : 1));
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Modeller')}</h1>
      </div>
      <Panel>
        {list.length ? (
          <Table
            head={[t('Model'), t('Segment'), t('Çıkış'), t('Durum'), t('Haftalık'), t('Toplam satış'), t('Stok'), t('Fiyat'), t('Dergi')]}
            align={['l', 'l', 'l', 'l', 'r', 'r', 'r', 'r', 'r']}
            rows={list.map((m) => [
              <button key="n" type="button" className="link" onClick={() => store.go({ id: 'model', modelId: m.id })}>
                {m.name}
                {m.generation > 1 ? ` ${t('({gen}. kuşak)', { gen: m.generation })}` : ''}
              </button>,
              `${segmentDef(m.segment).icon} ${t(segmentDef(m.segment).name)}`,
              formatDate(m.launchWeek),
              m.status === 'active' ? <Badge key="b" tone="good">{t('Satışta')}</Badge> : <Badge key="b">{t('Üretimden kalktı')}</Badge>,
              m.status === 'active' ? dec(weeklySold(m), 1) : '—',
              num(m.unitsSold),
              num(m.inventory),
              money(m.price),
              dec(m.reviewScore, 1),
            ])}
          />
        ) : (
          <Empty>{t('Henüz piyasaya çıkmış bir modelin yok. Projeler ekranından ilk aracını tasarla.')}</Empty>
        )}
      </Panel>
    </div>
  );
}
