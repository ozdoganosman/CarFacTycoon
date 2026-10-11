import { moneyUses, spareMoney, type MoneyUseKind } from '../../core/moneyUses';
import { paybackMonths } from '../../core/factory';
import { t } from '../../i18n';
import { tx } from '../i18n';
import { dec, money } from '../format';
import { store, useGameState, type Screen } from '../store';
import { Icon, type IconName } from './Icon';
import { Panel } from './ui';

// Finance: where spare money can go, in one list with prices and payback (core/moneyUses.ts). Each
// line leads to the screen where the choice is made.

const GO: Record<MoneyUseKind, { screen: Screen; icon: IconName }> = {
  line: { screen: { id: 'factory' }, icon: 'factory' },
  class: { screen: { id: 'projects' }, icon: 'projects' },
  dealers: { screen: { id: 'markets', tab: 'network' }, icon: 'markets' },
  plant: { screen: { id: 'factory' }, icon: 'factory' },
  engineering: { screen: { id: 'company', tab: 'general' }, icon: 'research' },
  ads: { screen: { id: 'markets', tab: 'market' }, icon: 'newspaper' },
  rival: { screen: { id: 'company', tab: 'rivals' }, icon: 'briefcase' },
};

const paysIn = (years: number) => (years < 1 ? t('~{n} ayda öder', { n: paybackMonths(years) }) : t('~{n} yılda öder', { n: dec(years, years < 10 ? 1 : 0) }));

export function MoneyUses() {
  const s = useGameState();
  if (!s.models.some((m) => m.status === 'active')) return null;
  const spare = spareMoney(s);
  const uses = moneyUses(s);
  return (
    <Panel title={t('Yatırımlar')} className="money-uses">
      <p className="small">
        {spare > 0
          ? tx('Kasada <b>{cash}</b> boşta duruyor (yedek ve bir yıllık sabit gider dışında). Nereye gidebileceği:', { cash: money(spare) })
          : t('Boşta para yok: kasa, yedekle bir yıllık sabit giderin altında. Yine de seçenekler:')}
      </p>
      <ul className="uses">
        {uses.map((u) => (
          <li key={u.kind}>
            <button type="button" className="use" onClick={() => store.go(GO[u.kind].screen)}>
              <Icon name={GO[u.kind].icon} />
              <span className="use-body">
                <b>{u.title}</b>
                <small className="muted">{u.gain}</small>
              </span>
              <span className="use-cost">
                {u.cost > 0 && <b>{money(u.cost)}</b>}
                {u.yearly !== undefined && <small>{t('yılda {cost}', { cost: money(u.yearly) })}</small>}
                {u.payback !== undefined && Number.isFinite(u.payback) && <small className="tone-good">{paysIn(u.payback)}</small>}
              </span>
            </button>
          </li>
        ))}
        {!uses.length && <li className="muted small">{t('Şu an açık bir yatırım yok.')}</li>}
      </ul>
    </Panel>
  );
}
