import * as A from '../../core/actions';
import { acquisitionTargets } from '../../core/acquisitions';
import { companyValue } from '../../core/game';
import { RACING_LEVELS, RACING_YEAR, racingBudget, racingPrestige, setRacingLevel } from '../../core/racing';
import { yearFloat } from '../../core/time';
import { MARKETS } from '../../data/markets';
import { store, useGameState } from '../store';
import { money, num } from '../format';
import { Button, Choice, Empty, Info, Panel, Progress, Stat, Table } from '../components/ui';

/** What the money is for: a racing team, buying rivals, and the company's worth. */
export function Company() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.racing ?? { level: 0, fame: 0 };
  const targets = acquisitionTargets(s);
  const value = companyValue(s);
  const racingOpen = yf >= RACING_YEAR;
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Şirket</h1>
          <p className="muted">Kazandığın parayı markayı büyütmek için kullan: yarışlarda ün kazan, küçük rakipleri satın al.</p>
        </div>
      </div>
      <div className="stats-row">
        <Stat
          label={
            <>
              Şirket değeri
              <Info>
                <p>Makineler, stok ve kasa, eksi borç; üstüne markanın kazanç gücü (son bir yılın faaliyet kârının altı katı).</p>
                <p>Oyun sonu puanına girer.</p>
              </Info>
            </>
          }
          value={money(value)}
        />
        <Stat label="İtibar" value={Math.round(s.company.reputation)} sub="/ 100" />
        <Stat label="Yarış ünü" value={r.fame.toFixed(1)} sub={`bütün modellere prestij +${racingPrestige(s).toFixed(1)}`} />
        <Stat label="Yarış zaferi" value={r.wins ?? 0} />
      </div>
      <div className="grid-2">
        <Panel title="Yarış takımı">
          {!racingOpen ? (
            <Empty>Otomobil yarışları {RACING_YEAR}’dan itibaren bir markanın vitrini olur.</Empty>
          ) : (
            <>
              <p className="muted small">
                Her yıl Eylül’de sezonun büyük yarışı koşulur. Sonucu en iyi arabanın hızı, yol tutuşu ve dayanıklılığı, mühendislerin becerisi ve takımın bütçesi belirler.
                Zaferler bütün modellerinin prestijini ve markanın bilinirliğini artırır; ün, yarışmayı bırakınca yavaş yavaş söner.
              </p>
              <Choice
                value={r.level}
                onChange={(v) => store.act((st) => setRacingLevel(st, v))}
                options={RACING_LEVELS.map((l, i) => ({
                  value: i,
                  label: l.name,
                  sub: i ? `${l.desc} Yılda ~${money(racingBudget(s, i))} (cironun %${(l.share * 100).toFixed(1)}’i, en az ${money(l.floor)}).` : l.desc,
                }))}
              />
              <p className="small">Ün</p>
              <Progress value={Math.min(8, r.fame)} max={8} label={`${r.fame.toFixed(1)} / 8`} />
              {r.last && (
                <p className="small">
                  {r.last.year} sezonu, {r.last.race}: <b>{r.last.model}</b>{' '}
                  {r.last.result === 'win' ? '🏆 birinci oldu' : r.last.result === 'podium' ? 'ilk üçe girdi' : 'dereceye giremedi'}.
                </p>
              )}
            </>
          )}
        </Panel>
        <Panel title="Rakip satın al">
          <p className="muted small">
            Senden küçük üreticiler satılık. Satın aldığında modelleri piyasadan çekilir (müşterileri yeni bir marka arar), mühendisleri sana katılır, bayileri senin
            arabalarını satar; başka bir kıtadaysa o pazar açılır.
          </p>
          {targets.length ? (
            <Table
              head={['Şirket', 'Geçen yıl', 'Mühendis', 'Bedel', '']}
              align={['l', 'r', 'r', 'r', 'r']}
              rows={targets.slice(0, 10).map((t) => [
                <span key="n">
                  {MARKETS.find((m) => m.id === t.home)!.flag} {t.name}
                </span>,
                `${num(t.units)} araç`,
                `+${t.engineers}`,
                money(t.price),
                <Button key="b" small disabled={s.company.cash < t.price} onClick={() => store.try((st) => A.acquireRival(st, t.id), `${t.name} satın alındı`)}>
                  Satın al
                </Button>,
              ])}
            />
          ) : (
            <Empty>Şu an satılık rakip yok: senden küçük ve satış yapan bir üretici çıktığında burada görünür.</Empty>
          )}
          {(s.acquired?.length ?? 0) > 0 && <p className="small muted">Şimdiye kadar {s.acquired!.length} şirket satın aldın.</p>}
        </Panel>
      </div>
    </div>
  );
}
