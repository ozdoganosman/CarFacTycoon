import { useEffect } from 'react';
import { researchDef } from '../../core/research';
import { t } from '../../i18n';
import { store, useGameState } from '../store';
import { Button } from './ui';
import { tx } from '../i18n';
import { Icon } from './Icon';

const dismiss = () => store.act((st) => void (st.modals = st.modals.filter((m) => m.kind !== 'research')));

/** Corner note: research finished, and what the queue started next. Does not stop the clock. */
export function ResearchCard() {
  const s = useGameState();
  const item = s.modals.find((m) => m.kind === 'research');
  const key = item?.kind === 'research' ? [...item.done, '|', ...item.started].join(',') : '';
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(dismiss, 20000);
    return () => clearTimeout(timer);
  }, [key]);
  if (item?.kind !== 'research') return null;
  const done = item.done.map((id) => researchDef(id)).filter((d) => !!d);
  const started = item.started.map((id) => researchDef(id)).filter((d) => !!d);
  const queue = s.research?.queue?.length ?? 0;
  return (
    <aside className="research-card" aria-live="polite">
      <div className="year-card-head">
        <b>
          <Icon name="research" /> {done.length ? t('Ar-Ge tamamlandı') : t('Ar-Ge sırası ilerledi')}</b>
        <button type="button" className="year-card-x" aria-label={t('Kapat')} onClick={dismiss}>
          ×
        </button>
      </div>
      {done.length > 0 && (
        <p className="small">
          <b>{done.map((d) => t(d.name)).join(', ')}</b>
          <span className="muted">
            {' '}
            · {done.every((d) => d.passive) ? t('yeni tasarımlara kendiliğinden girer') : done.some((d) => d.passive) ? t('birikimler kendiliğinden girer, diğerleri tasarımda seçilebilir') : t('artık tasarımda seçilebilir')}
          </span>
        </p>
      )}
      {started.length > 0 && (
        <p className="small">
          {tx('Sıradan başladı: <b>{names}</b>', { names: started.map((d) => t(d.name)).join(', ') })}
          {queue > 0 && <span className="muted"> · {t('sırada {n} konu daha', { n: queue })}</span>}
        </p>
      )}
      {!started.length && queue === 0 && done.length > 0 && <p className="small muted">{t('Ar-Ge sırası boş: mühendisler yeni bir konu bekliyor.')}</p>}
      <Button
        kind="ghost"
        small
        onClick={() => {
          dismiss();
          store.go({ id: 'research' });
        }}
      >
        {t('Ar-Ge’ye git')}
      </Button>
    </aside>
  );
}
