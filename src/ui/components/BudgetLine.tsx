import { budgetVerdict, type LaunchBudget } from '../../core/budget';
import { money } from '../format';
import { Info } from './ui';

/** "Can I finish this?": what the project still costs before launch against cash and credit. */
export function BudgetLine({ b, compact }: { b: LaunchBudget; compact?: boolean }) {
  const v = budgetVerdict(b);
  const tone = v === 'ok' ? 'good' : v === 'credit' ? 'warn' : 'bad';
  const running = -b.weeklyNet * b.weeks;
  return (
    <div className={`budget-line tone-${tone}-soft`}>
      <span>
        <b>
          Lansmana kadar ~{b.weeks} hafta ·{' '}
          {b.need > 0 ? `ihtiyaç ~${money(b.need)}` : `proje ~${money(b.protos + b.tests + b.tooling + b.line)}, satışlar karşılıyor`}
        </b>
        <span className="muted small">
          {' '}
          · kasa {money(b.cash)} + kredi {money(b.creditRoom)}
        </span>
        <Info>
          <p>Projenin satışa çıkana kadar daha ne kadar para yakacağı:</p>
          <ul>
            {b.protos > 0 && <li>Prototipler: {money(b.protos)}</li>}
            {b.tests > 0 && <li>Test programı: {money(b.tests)}</li>}
            {b.tooling > 0 && <li>Kalıplar (seçili kalıp türüyle): {money(b.tooling)}</li>}
            {b.line > 0 && <li>Yeni hat: boşta hat yok, en ucuzu küçük bir atölye hattı ({money(b.line)})</li>}
            <li>
              Bu {b.weeks} haftada şirketin kendi gideri ya da geliri: {running >= 0 ? `${money(running)} gider` : `${money(-running)} gelir`} (son iki ayın gidişatıyla: maaşlar, genel gider,
              satıştaki arabalar)
            </li>
          </ul>
          <p>Tahmin geliştirme süresine, test planına ve bugünkü satışlara göre; hepsi değişirse o da değişir.</p>
        </Info>
      </span>
      {!compact && (
        <span className="small">
          {v === 'ok'
            ? 'Kasa yetiyor.'
            : v === 'credit'
              ? 'Kasa yetmiyor, kredi gerekecek: faiziyle birlikte hesapla.'
              : 'Kasa ve kredi birlikte bile yetmiyor: projeyi küçült, testleri kısalt, ucuz kalıp seç ya da satıştaki arabalarla önce para kazan.'}
        </span>
      )}
    </div>
  );
}
