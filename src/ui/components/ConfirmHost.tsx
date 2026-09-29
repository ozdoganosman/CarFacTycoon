import { useEffect, useRef } from 'react';
import { t } from '../../i18n';
import { store } from '../store';
import { Button } from './ui';

export function ConfirmHost() {
  const q = store.question;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, [q]);
  if (!q) return null;
  return (
    <div className="modal-backdrop" onKeyDown={(e) => e.key === 'Escape' && q.resolve(false)}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" ref={ref}>
        <h2 id="confirm-title">{q.title}</h2>
        <div className="modal-body">
          <p>{q.body}</p>
        </div>
        <div className="modal-actions">
          <Button kind="ghost" onClick={() => q.resolve(false)}>
            {t('Vazgeç')}
          </Button>
          <Button kind={q.danger ? 'danger' : 'primary'} onClick={() => q.resolve(true)}>
            {q.confirm}
          </Button>
        </div>
      </div>
    </div>
  );
}
