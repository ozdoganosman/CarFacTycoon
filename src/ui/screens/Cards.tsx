import { useState } from 'react';
import { CARDS } from '../../data/cards';
import { useGameState } from '../store';
import { Panel } from '../components/ui';
import { CardAnimation } from '../components/CardAnimation';
import { t } from '../../i18n';
import { tx } from '../i18n';

export function Cards() {
  const s = useGameState();
  const unlocked = CARDS.filter((c) => s.cardsSeen.includes(c.id));
  const [open, setOpen] = useState(unlocked[unlocked.length - 1]?.id ?? '');
  const card = CARDS.find((c) => c.id === open && s.cardsSeen.includes(c.id));
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>{t('Bilgi kartları')}</h1>
          <p className="muted">{t('Her yeni teknoloji bir kart açar: “Neden böyle çalışıyor?” ({seen}/{total})', { seen: unlocked.length, total: CARDS.length })}</p>
        </div>
      </div>
      <div className="cards-grid">
        {CARDS.map((c) => {
          const has = s.cardsSeen.includes(c.id);
          return (
            <button key={c.id} type="button" className={`kcard ${has ? '' : 'is-locked'} ${open === c.id ? 'is-on' : ''}`} disabled={!has} onClick={() => setOpen(c.id)}>
              <span className="kcard-year">{c.year}</span>
              <span className="kcard-title">{has ? t(c.title) : '???'}</span>
            </button>
          );
        })}
      </div>
      {card && (
        <Panel title={t(card.title)}>
          <CardAnimation anim={card.anim} />
          <p>{t(card.body)}</p>
          <p className="card-gameplay">{tx('<b>Oyunda:</b> {text}', { text: t(card.gameplay) })}</p>
        </Panel>
      )}
    </div>
  );
}
