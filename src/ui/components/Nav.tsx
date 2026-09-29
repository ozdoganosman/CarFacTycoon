import { msg, t } from '../../i18n';
import { store, useGameState, type Screen } from '../store';
import { SendToClaude } from './SendToClaude';

const ITEMS: { id: Screen['id']; label: string; icon: string }[] = [
  { id: 'hq', label: msg('Merkez'), icon: '🏢' },
  { id: 'projects', label: msg('Projeler'), icon: '📐' },
  { id: 'research', label: msg('Ar-Ge'), icon: '🔬' },
  { id: 'models', label: msg('Modeller'), icon: '🚗' },
  { id: 'factory', label: msg('Fabrika'), icon: '🏭' },
  { id: 'markets', label: msg('Harita'), icon: '🗺️' },
  { id: 'finance', label: msg('Finans'), icon: '💰' },
  { id: 'company', label: msg('Şirket'), icon: '🏁' },
  { id: 'cards', label: msg('Bilgi kartları'), icon: '💡' },
  { id: 'settings', label: msg('Ayarlar'), icon: '⚙️' },
];

export function Nav() {
  const s = useGameState();
  const cur = store.screen.id;
  const active = (id: Screen['id']) => cur === id || (id === 'projects' && cur === 'project') || (id === 'models' && cur === 'model');
  const badges: Partial<Record<Screen['id'], number>> = {
    projects: s.projects.filter((p) => p.phase === 'ready' || p.phase === 'design').length,
  };
  return (
    <nav className="nav" aria-label={t('Ana menü')}>
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`nav-item ${active(it.id) ? 'is-on' : ''}`}
          data-nav={it.id}
          onClick={() => store.go({ id: it.id } as Screen)}
          aria-current={active(it.id) ? 'page' : undefined}
        >
          <span className="nav-icon" aria-hidden>
            {it.icon}
          </span>
          <span className="nav-label">{t(it.label)}</span>
          {!!badges[it.id] && <span className="nav-badge">{badges[it.id]}</span>}
        </button>
      ))}
      <SendToClaude />
    </nav>
  );
}
