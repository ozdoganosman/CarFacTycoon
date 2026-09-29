import { budgetVerdict, type LaunchBudget } from '../../core/budget';
import { t } from '../../i18n';
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
          {b.need > 0
            ? t('Lansmana kadar ~{n} hafta · ihtiyaç ~{need}', { n: b.weeks, need: money(b.need) })
            : t('Lansmana kadar ~{n} hafta · proje ~{cost}, satışlar karşılıyor', { n: b.weeks, cost: money(b.protos + b.tests + b.tooling + b.line) })}
        </b>
        <span className="muted small">
          {' '}
          · {t('kasa {cash} + kredi {credit}', { cash: money(b.cash), credit: money(b.creditRoom) })}
        </span>
        <Info>
          <p>{t('Projenin satışa çıkana kadar daha ne kadar para yakacağı:')}</p>
          <ul>
            {b.protos > 0 && <li>{t('Prototipler: {cost}', { cost: money(b.protos) })}</li>}
            {b.tests > 0 && <li>{t('Test programı: {cost}', { cost: money(b.tests) })}</li>}
            {b.tooling > 0 && <li>{t('Kalıplar (seçili kalıp türüyle): {cost}', { cost: money(b.tooling) })}</li>}
            {b.line > 0 && <li>{t('Yeni hat: boşta hat yok, en ucuzu küçük bir atölye hattı ({cost})', { cost: money(b.line) })}</li>}
            <li>
              {running >= 0
                ? t('Bu {n} haftada şirketin kendi gideri ya da geliri: {amount} gider (son iki ayın gidişatıyla: maaşlar, genel gider, satıştaki arabalar)', {
                    n: b.weeks,
                    amount: money(running),
                  })
                : t('Bu {n} haftada şirketin kendi gideri ya da geliri: {amount} gelir (son iki ayın gidişatıyla: maaşlar, genel gider, satıştaki arabalar)', {
                    n: b.weeks,
                    amount: money(-running),
                  })}
            </li>
          </ul>
          <p>{t('Tahmin geliştirme süresine, test planına ve bugünkü satışlara göre; hepsi değişirse o da değişir.')}</p>
        </Info>
      </span>
      {!compact && (
        <span className="small">
          {v === 'ok'
            ? t('Kasa yetiyor.')
            : v === 'credit'
              ? t('Kasa yetmiyor, kredi gerekecek: faiziyle birlikte hesapla.')
              : t('Kasa ve kredi birlikte bile yetmiyor: projeyi küçült, testleri kısalt, ucuz kalıp seç ya da satıştaki arabalarla önce para kazan.')}
        </span>
      )}
    </div>
  );
}
