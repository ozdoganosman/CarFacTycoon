import { useState } from 'react';
import { CARDS } from '../../data/cards';
import { useGameState } from '../store';
import { Panel } from '../components/ui';
import { CardAnimation } from '../components/CardAnimation';

export function Cards() {
  const s = useGameState();
  const unlocked = CARDS.filter((c) => s.cardsSeen.includes(c.id));
  const [open, setOpen] = useState(unlocked[unlocked.length - 1]?.id ?? '');
  const card = CARDS.find((c) => c.id === open && s.cardsSeen.includes(c.id));
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>Bilgi kartları</h1>
          <p className="muted">Her yeni teknoloji bir kart açar: “Neden böyle çalışıyor?” ({unlocked.length}/{CARDS.length})</p>
        </div>
      </div>
      <div className="cards-grid">
        {CARDS.map((c) => {
          const has = s.cardsSeen.includes(c.id);
          return (
            <button key={c.id} type="button" className={`kcard ${has ? '' : 'is-locked'} ${open === c.id ? 'is-on' : ''}`} disabled={!has} onClick={() => setOpen(c.id)}>
              <span className="kcard-year">{c.year}</span>
              <span className="kcard-title">{has ? c.title : '???'}</span>
            </button>
          );
        })}
      </div>
      {card && (
        <Panel title={card.title}>
          <CardAnimation anim={card.anim} />
          <p>{card.body}</p>
          <p className="card-gameplay">
            <b>Oyunda:</b> {card.gameplay}
          </p>
        </Panel>
      )}
    </div>
  );
}
