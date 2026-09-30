import { LANGS, lang, type Lang } from '../../i18n';
import { saveLang } from '../../i18n/load';
import { store } from '../store';
import { Icon } from './Icon';

/** The game's language; changing it saves the game and reloads the page in the new language. */
export function LanguagePicker({ compact }: { compact?: boolean }) {
  return (
    <label className={`lang-picker ${compact ? 'is-compact' : ''}`}>
      <Icon name="globe" size={18} />
      <select
        value={lang()}
        aria-label="Dil / Language"
        onChange={(e) => {
          saveLang(e.target.value as Lang);
          store.save();
          location.reload();
        }}
      >
        {LANGS.filter((l) => !l.hidden || l.id === lang()).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
    </label>
  );
}
