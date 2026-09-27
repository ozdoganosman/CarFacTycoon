import { formatDate } from '../../core/time';
import { segmentDef } from '../../data/segments';
import { store, useGameState } from '../store';
import { money, num } from '../format';
import { Badge, Empty, Panel, Table } from '../components/ui';
import { weeklySold } from './HQ';

export function Models() {
  const s = useGameState();
  const list = [...s.models].sort((a, b) => (a.status === b.status ? b.launchWeek - a.launchWeek : a.status === 'active' ? -1 : 1));
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Modeller</h1>
      </div>
      <Panel>
        {list.length ? (
          <Table
            head={['Model', 'Segment', 'Çıkış', 'Durum', 'Haftalık', 'Toplam satış', 'Stok', 'Fiyat', 'Dergi']}
            align={['l', 'l', 'l', 'l', 'r', 'r', 'r', 'r', 'r']}
            rows={list.map((m) => [
              <button key="n" type="button" className="link" onClick={() => store.go({ id: 'model', modelId: m.id })}>
                {m.name}
                {m.generation > 1 ? ` (${m.generation}. kuşak)` : ''}
              </button>,
              `${segmentDef(m.segment).icon} ${segmentDef(m.segment).name}`,
              formatDate(m.launchWeek),
              m.status === 'active' ? <Badge key="b" tone="good">Satışta</Badge> : <Badge key="b">Üretimden kalktı</Badge>,
              m.status === 'active' ? weeklySold(m).toFixed(1) : '—',
              num(m.unitsSold),
              num(m.inventory),
              money(m.price),
              m.reviewScore.toFixed(1),
            ])}
          />
        ) : (
          <Empty>Henüz piyasaya çıkmış bir modelin yok. Projeler ekranından ilk aracını tasarla.</Empty>
        )}
      </Panel>
    </div>
  );
}
