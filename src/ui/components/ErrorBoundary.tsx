import { Component, type ReactNode } from 'react';
import { recordError } from '../../core/util';
import { t } from '../../i18n';
import { store } from '../store';

/** A screen that fails to draw should not blank the whole game: record it and offer a way back. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (store.state) recordError(store.state, `render:${store.screen.id}`, error);
    store.setSpeed(0);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash">
        <h2>{t('Bu ekranda bir hata oluştu')}</h2>
        <p>{t('Oyunun kaydı yerinde. Hata kaydedildi ve Claude’a gönderilecek.')}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            store.go({ id: 'hq' });
            this.setState({ failed: false });
          }}
        >
          {t('Merkeze dön')}
        </button>
      </div>
    );
  }
}
