import { useState } from 'react';
import { AREAS, areaOpen, type Area } from '../../core/guide';
import { useBackClose } from '../back';
import { msg, t } from '../../i18n';
import { store, useGameState, type Screen } from '../store';
import { Icon, type IconName } from './Icon';
import { SendToClaude } from './SendToClaude';

const ITEMS: { id: Screen['id']; label: string; icon: IconName }[] = [
  { id: 'hq', label: msg('Merkez'), icon: 'hq' },
  { id: 'projects', label: msg('Projeler'), icon: 'projects' },
  { id: 'research', label: msg('Ar-Ge'), icon: 'research' },
  { id: 'models', label: msg('Modeller'), icon: 'models' },
  { id: 'factory', label: msg('Fabrika'), icon: 'factory' },
  { id: 'markets', label: msg('Harita'), icon: 'markets' },
  { id: 'finance', label: msg('Finans'), icon: 'finance' },
  { id: 'company', label: msg('Şirket'), icon: 'company' },
  { id: 'cards', label: msg('Bilgi kartları'), icon: 'bulb' },
  { id: 'settings', label: msg('Ayarlar'), icon: 'settings' },
];

/** On a phone the bar holds the first five screens and "Diğer", which opens the rest above it. */
const PRIMARY = 5;

export function Nav() {
  const s = useGameState();
  const [more, setMore] = useState(false);
  useBackClose(more, () => setMore(false));
  const cur = store.screen.id;
  const active = (id: Screen['id']) => cur === id || (id === 'projects' && cur === 'project') || (id === 'models' && cur === 'model');
  const badges: Partial<Record<Screen['id'], number>> = {
    projects: s.projects.filter((p) => p.phase === 'ready' || p.phase === 'design').length,
  };
  // On the way to the first car the menu opens screen by screen (core/guide.ts).
  const isArea = (id: Screen['id']): id is Area => (AREAS as string[]).includes(id);
  const items = ITEMS.filter((it) => !isArea(it.id) || areaOpen(s, it.id));
  const fresh = (id: Screen['id']) => isArea(id) && !!s.openedNew?.includes(id);
  const primary = items.slice(0, PRIMARY);
  const rest = items.slice(PRIMARY);
  const item = (it: (typeof ITEMS)[number]) => (
    <button
      key={it.id}
      type="button"
      className={`nav-item ${active(it.id) ? 'is-on' : ''}`}
      data-nav={it.id}
      onClick={() => {
        setMore(false);
        store.go({ id: it.id } as Screen);
      }}
      aria-current={active(it.id) ? 'page' : undefined}
    >
      <span className="nav-icon" aria-hidden>
        <Icon name={it.icon} size={20} />
      </span>
      <span className="nav-label">{t(it.label)}</span>
      {!!badges[it.id] && <span className="nav-badge">{badges[it.id]}</span>}
      {fresh(it.id) && <span className="nav-badge nav-new">{t('yeni')}</span>}
    </button>
  );
  return (
    <nav className={`nav ${more ? 'is-more' : ''}`} aria-label={t('Ana menü')}>
      {primary.map(item)}
      <button
        type="button"
        className={`nav-item nav-more ${rest.some((it) => active(it.id)) ? 'is-on' : ''}`}
        data-guide="nav-more"
        aria-expanded={more}
        onClick={() => setMore(!more)}
      >
        <span className="nav-icon" aria-hidden>
          <Icon name="menu" size={20} />
        </span>
        <span className="nav-label">{t('Diğer')}</span>
        {rest.some((it) => fresh(it.id)) && <span className="nav-badge nav-new">{t('yeni')}</span>}
      </button>
      {more && <div className="nav-scrim" onClick={() => setMore(false)} aria-hidden />}
      <div className="nav-rest">
        {rest.map(item)}
        <SendToClaude />
      </div>
    </nav>
  );
}
