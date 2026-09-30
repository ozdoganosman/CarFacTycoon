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
            <Icon name={it.icon} size={20} />
          </span>
          <span className="nav-label">{t(it.label)}</span>
          {!!badges[it.id] && <span className="nav-badge">{badges[it.id]}</span>}
        </button>
      ))}
      <SendToClaude />
    </nav>
  );
}
