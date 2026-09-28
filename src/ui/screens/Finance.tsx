import { useState } from 'react';
import * as A from '../../core/actions';
import { credit, engineersBusy, COST_KEYS } from '../../core/game';
import { yearFloat } from '../../core/time';
import { costIndex, engineerSalary } from '../../data/economy';
import { store, useGameState } from '../store';
import { COST_NAMES, money, signedMoney } from '../format';
import { Button, NumberInput, Panel, Stat, Table } from '../components/ui';
import { BarChart } from '../viz/LineChart';


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
  const busy = engineersBusy(s);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Finans</h1>
      </div>
      <div className="stats-row">
        <Stat label="Kasa" value={money(s.company.cash)} tone={s.company.cash < 0 ? 'bad' : undefined} />
        <Stat label="Kredi borcu" value={money(s.company.loan)} sub={`faiz %${(c.rate * 100).toFixed(0)}/yıl`} />
        <Stat label="Kredi limiti" value={money(Math.max(0, c.limit))} sub="varlık ve itibara bağlı" />
        <Stat label="Son 52 hafta faaliyet kârı" value={signedMoney(operating)} tone={operating < 0 ? 'bad' : 'good'} />
      </div>
      <div className="grid-2">
        <Panel title="Banka">
          <div className="price-row">
            <NumberInput label="Tutar" prefix="$" value={loan} min={0} step={1000} onChange={setLoan} />
            <Button kind="primary" onClick={() => store.try((st) => A.takeLoan(st, loan), 'Kredi alındı')}>
              Kredi al
            </Button>
            <Button onClick={() => store.try((st) => A.repayLoan(st, loan), 'Borç ödendi')} disabled={s.company.loan <= 0}>
              Borç öde
            </Button>
          </div>
          <p className="muted small">Kasa 12 hafta üst üste ekside kalırsa şirket iflas eder. Buhran yıllarında (1930-33) bankalar limiti yarıya indirir ve faizi artırır.</p>
        </Panel>
        <Panel title="Personel">
          <p>
            <b>{s.company.engineers}</b> mühendis ({busy} projede) · maaş {money(engineerSalary(yf))}/hafta · beceri <b>{Math.round(s.company.skill)}</b>
          </p>
          <div className="row">
            <Button onClick={() => store.try((st) => A.hireEngineers(st, 1))}>+1 işe al ({money(40 * costIndex(yf))})</Button>
            <Button onClick={() => store.try((st) => A.hireEngineers(st, 5))}>+5 işe al</Button>
            <Button kind="ghost" onClick={() => store.try((st) => A.fireEngineers(st, 1))}>
              −1 çıkar
            </Button>
          </div>
          <p className="muted small">Beceri her lansmanla artar. Çok hızlı büyümek yeni gelenler yüzünden ortalama tecrübeyi biraz düşürür.</p>
        </Panel>
      </div>
      <Panel title="Yıllık faaliyet kârı">
        <BarChart
          bars={s.years.slice(-30).map((y) => ({ label: String(y.year), value: y.profit }))}
          yFormat={(v) => money(v)}
          ariaLabel="Yıllara göre faaliyet kârı"
        />
      </Panel>
      <Panel title="Son 52 hafta gelir-gider">
        <Table
          head={['Kalem', 'Tutar', 'Ciroya oranı']}
          align={['l', 'r', 'r']}
          rows={[
            ['Ciro', money(revenue), ''],
            ...COST_KEYS.map((k) => [COST_NAMES[k], money(-sums[k]), revenue > 0 ? `%${((sums[k] / revenue) * 100).toFixed(1)}` : '—']),
            ...(auto !== 0
              ? [[<span key="a" className="muted">  └ bunun “talebi otomatik karşıla” payı (satılan makineler düşülmüş)</span>, money(-auto), revenue > 0 ? `%${((auto / revenue) * 100).toFixed(1)}` : '—']]
              : []),
            [<b key="p">Faaliyet kârı (yatırım hariç)</b>, <b key="v">{money(operating)}</b>, revenue > 0 ? `%${((operating / revenue) * 100).toFixed(1)}` : '—'],
          ]}
        />
      </Panel>
    </div>
  );
}
