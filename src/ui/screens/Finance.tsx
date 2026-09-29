import { useState } from 'react';
import * as A from '../../core/actions';
import { credit, COST_KEYS } from '../../core/game';
import { yearFloat } from '../../core/time';
import { costIndex } from '../../data/economy';
import { store, useGameState } from '../store';
import { COST_NAMES, money, pct, signedMoney } from '../format';
import { TeamPanel } from '../components/TeamPanel';
import { Button, NumberInput, Panel, Stat, Table } from '../components/ui';
import { BarChart } from '../viz/LineChart';
import { t } from '../../i18n';


export function Finance() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const c = credit(s);
  const [loan, setLoan] = useState(Math.round(Math.max(0, Math.min(c.limit - s.company.loan, 10000 * costIndex(yf)))));
  const last = s.finance.slice(-52);
  const sums = Object.fromEntries(COST_KEYS.map((k) => [k, last.reduce((a, f) => a + (f[k] ?? 0), 0)])) as Record<(typeof COST_KEYS)[number], number>;
  const revenue = last.reduce((a, f) => a + f.revenue, 0);
  const auto = last.reduce((a, f) => a + (f.auto ?? 0), 0);
  const operating = revenue - COST_KEYS.filter((k) => k !== 'investment').reduce((a, k) => a + sums[k], 0);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Finans')}</h1>
      </div>
      <div className="stats-row">
        <Stat label={t('Kasa')} value={money(s.company.cash)} tone={s.company.cash < 0 ? 'bad' : undefined} />
        <Stat label={t('Kredi borcu')} value={money(s.company.loan)} sub={t('faiz {rate}/yıl', { rate: pct(c.rate, 0) })} />
        <Stat label={t('Kredi limiti')} value={money(Math.max(0, c.limit))} sub={t('varlık ve itibara bağlı')} />
        <Stat label={t('Son 52 hafta faaliyet kârı')} value={signedMoney(operating)} tone={operating < 0 ? 'bad' : 'good'} />
      </div>
      <div className="grid-2">
        <Panel title={t('Banka')}>
          <div className="price-row">
            <NumberInput label={t('Tutar')} prefix="$" value={loan} min={0} step={1000} onChange={setLoan} />
            <Button kind="primary" onClick={() => store.try((st) => A.takeLoan(st, loan), t('Kredi alındı'))}>
              {t('Kredi al')}
            </Button>
            <Button onClick={() => store.try((st) => A.repayLoan(st, loan), t('Borç ödendi'))} disabled={s.company.loan <= 0}>
              {t('Borç öde')}
            </Button>
          </div>
          <p className="muted small">{t('Kasa 12 hafta üst üste ekside kalırsa şirket iflas eder. Buhran yıllarında (1930-33) bankalar limiti yarıya indirir ve faizi artırır.')}</p>
        </Panel>
        <TeamPanel compact />
      </div>
      <Panel title={t('Yıllık faaliyet kârı')}>
        <BarChart
          bars={s.years.slice(-30).map((y) => ({ label: String(y.year), value: y.profit }))}
          yFormat={(v) => money(v)}
          ariaLabel={t('Yıllara göre faaliyet kârı')}
        />
      </Panel>
      <Panel title={t('Son 52 hafta gelir-gider')}>
        <Table
          head={[t('Kalem'), t('Tutar'), t('Ciroya oranı')]}
          align={['l', 'r', 'r']}
          rows={[
            [t('Ciro'), money(revenue), ''],
            ...COST_KEYS.map((k) => [t(COST_NAMES[k]), money(-sums[k]), revenue > 0 ? pct(sums[k] / revenue, 1) : '—']),
            ...(auto !== 0
              ? [[<span key="a" className="muted">  └ {t('bunun “talebi otomatik karşıla” payı (satılan makineler düşülmüş)')}</span>, money(-auto), revenue > 0 ? pct(auto / revenue, 1) : '—']]
              : []),
            [<b key="p">{t('Faaliyet kârı (yatırım hariç)')}</b>, <b key="v">{money(operating)}</b>, revenue > 0 ? pct(operating / revenue, 1) : '—'],
          ]}
        />
      </Panel>
    </div>
  );
}
