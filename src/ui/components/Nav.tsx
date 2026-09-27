import { store, useGameState, type Screen } from '../store';
import { SendToClaude } from './SendToClaude';

const ITEMS: { id: Screen['id']; label: string; icon: string }[] = [
  { id: 'hq', label: 'Merkez', icon: '🏢' },
  { id: 'projects', label: 'Projeler', icon: '📐' },
  { id: 'research', label: 'Ar-Ge', icon: '🔬' },
  { id: 'models', label: 'Modeller', icon: '🚗' },
  { id: 'factory', label: 'Fabrika', icon: '🏭' },
  { id: 'markets', label: 'Pazarlar', icon: '🌍' },
  { id: 'finance', label: 'Finans', icon: '💰' },
  { id: 'cards', label: 'Bilgi kartları', icon: '💡' },
  { id: 'settings', label: 'Ayarlar', icon: '⚙️' },
];

export function Nav() {
  const s = useGameState();
  const cur = store.screen.id;
  const active = (id: Screen['id']) => cur === id || (id === 'projects' && cur === 'project') || (id === 'models' && cur === 'model');
  const badges: Partial<Record<Screen['id'], number>> = {
    projects: s.projects.filter((p) => p.phase === 'ready' || p.phase === 'design').length,
  };
  return (
    <nav className="nav" aria-label="Ana menü">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          className={`nav-item ${active(it.id) ? 'is-on' : ''}`}
          onClick={() => store.go({ id: it.id } as Screen)}
          aria-current={active(it.id) ? 'page' : undefined}
        >
          <span className="nav-icon" aria-hidden>
            {it.icon}
          </span>
          <span className="nav-label">{it.label}</span>
          {!!badges[it.id] && <span className="nav-badge">{badges[it.id]}</span>}
        </button>
      ))}
      <SendToClaude />
    </nav>
  );
}
