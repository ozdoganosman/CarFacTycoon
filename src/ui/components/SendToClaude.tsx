import { useEffect, useState, useSyncExternalStore } from 'react';
import { serialize } from '../../core/save';
import { msg, t } from '../../i18n';
import { allowSharing, disableSharing, forgetMe, onSyncStatus, playtestSink, sendErrorText, sendPlaytest, syncNow, syncStatus, type SinkKind, type SyncStatus } from '../claudeLink';
import { store, useGameState } from '../store';
import { useBackClose } from '../back';
import { Button } from './ui';
import { tx } from '../i18n';
import { Icon } from './Icon';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export const useSyncStatus = (): SyncStatus => useSyncExternalStore(onSyncStatus, syncStatus);

function ago(at?: number): string {
  if (!at) return '';
  const m = Math.round((Date.now() - at) / 60000);
  return m < 1 ? t('az önce') : t('{n} dk önce', { n: m });
}

/** Which way this copy sends playtests (null: nowhere, or not known yet). */
function useSinkKind(): SinkKind | null | undefined {
  const [kind, setKind] = useState<SinkKind | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void playtestSink().then((sink) => live && setKind(sink?.kind ?? null));
    return () => {
      live = false;
    };
  }, []);
  return kind;
}

function statusText(st: SyncStatus, kind: SinkKind | null | undefined): string {
  if (kind === 'developer') {
    switch (st.mode) {
      case 'on':
        return st.lastSent ? t('Oyunun geliştiriciyle paylaşılıyor · son gönderim {ago}', { ago: ago(st.lastSent) }) : t('Oyunun geliştiriciyle paylaşılıyor');
      case 'sending':
        return t('Gönderiliyor…');
      case 'error':
        return st.message ?? t('Gönderilemedi, yeniden denenecek.');
      case 'ask':
        return t('Otomatik paylaşım kapalı: izin verirsen oyunun arada bir geliştiriciye gider.');
      default:
        return t('Otomatik paylaşım kapalı.');
    }
  }
  switch (st.mode) {
    case 'on':
      return st.lastSent ? t('Claude oyununu görüyor · son gönderim {ago}', { ago: ago(st.lastSent) }) : t('Claude oyununu görüyor');
    case 'sending':
      return t('Claude’a gönderiliyor…');
    case 'error':
      return st.message ?? t('Gönderilemedi, yeniden denenecek.');
    case 'ask':
      return t('Claude oyununu henüz göremiyor: izin gerekiyor.');
    case 'denied':
      return t('İzin verilmedi. Sayfanın İzinler menüsünden açabilirsin.');
    case 'disabled':
      return t('Otomatik paylaşım kapalı.');
    default:
      return t('Bu sürüm Claude’a doğrudan gönderemiyor.');
  }
}

/** The privacy policy of the public build and the Android app (public/privacy.html, on GitHub Pages). */
export const PRIVACY_URL = 'https://ozdoganosman.github.io/CarFacTycoon/privacy.html';

/** What is and is not collected, said before the player decides. */
const PRIVACY = msg(
  'Adın ya da e-postan sorulmaz; bu tarayıcıya rastgele bir oyuncu numarası verilir. Şirkete verdiğin ad ve yazdığın notlar oyunla birlikte gider. Veriler AB’deki sunucularda (Supabase, PostHog) durur, reklam için kullanılmaz, kimseyle paylaşılmaz. İstediğin an menüdeki Geri bildirim’den kapatabilirsin.',
);

/** A slim bar asking once whether the game may be shared (with Claude, or with the developer). */
export function ShareBar() {
  const s = useGameState();
  const st = useSyncStatus();
  const kind = useSinkKind();
  const [hidden, setHidden] = useState(false);
  if (st.mode !== 'ask' || hidden || kind === undefined) return null;
  if (kind === 'developer')
    return (
      <div className="claude-share" role="note">
        <span>
          {tx(
            '<b>Oyununu geliştiriciyle paylaşır mısın?</b> Oyunu düzeltmek ve dengelemek için oyunun (tasarımların, kararların, satışların, karşılaştığın hatalar) arada bir kendiliğinden gönderilir; hangi ekranlarda ne yaptığın ve oyun ekranının kaydı da tutulur.',
          )}{' '}
          <span className="muted">{t(PRIVACY)}</span>{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            {t('Gizlilik politikası')}
          </a>
        </span>
        <span className="claude-share-btns">
          <Button kind="ghost" onClick={disableSharing}>
            {t('Hayır, teşekkürler')}
          </Button>
          <Button kind="primary" onClick={() => void allowSharing(s)}>
            {t('Paylaş')}
          </Button>
        </span>
      </div>
    );
  return (
    <div className="claude-share" role="note">
      <span>
        {tx(
          '<b>Claude oyununu görebilsin mi?</b> İzin verirsen oyunun (tasarımlar, kararlar, satışlar, hatalar) Claude’un inceleyebileceği bir kutuya kendiliğinden kaydedilir.',
        )}
      </span>
      <span className="claude-share-btns">
        <Button kind="ghost" onClick={() => setHidden(true)}>
          {t('Şimdi değil')}
        </Button>
        <Button kind="primary" onClick={() => void allowSharing(s)}>
          {t('İzin ver')}
        </Button>
      </span>
    </div>
  );
}

/** Menu item: hand the current game to Claude with a note; shows whether sharing runs. */
export function SendToClaude() {
  const s = useGameState();
  const st = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const kind = useSinkKind();
  const hasDb = kind === undefined ? null : kind !== null;
  const dev = kind === 'developer';

  const [forgot, setForgot] = useState('');
  const close = () => {
    setOpen(false);
    setForgot('');
    if (phase !== 'sending') setPhase('idle');
  };

  const forget = async () => {
    const ok = await store.ask({
      title: t('Gönderdiğin veriler silinsin mi?'),
      body: t(
        'Geliştiriciye giden oyun kayıtların ve notların hemen silinir, paylaşım kapanır. Oynanış istatistiklerin de silinmek üzere işaretlenir. Bu tarayıcı bundan sonra yeni bir oyuncu numarası kullanır.',
      ),
      confirm: t('Verilerimi sil'),
      danger: true,
    });
    if (!ok) return;
    try {
      const { deleted } = await forgetMe();
      setForgot(t('Silindi: {n} oyun kaydı. Paylaşım kapalı; istersen yeniden açabilirsin.', { n: deleted }));
    } catch {
      setForgot(t('Silinemedi: bağlantını kontrol edip yeniden dene.'));
    }
  };
  useBackClose(open, close);

  const send = async () => {
    const sink = await playtestSink();
    if (!sink) return;
    setPhase('sending');
    try {
      await sendPlaytest(sink, s, note);
      setPhase('sent');
      setNote('');
      // On claude.ai the click granted the database: keep the game's own copy fresh from now on.
      // A public player's one-off note is not a yes to automatic sharing.
      if (sink.kind === 'claude') {
        if (syncStatus().mode === 'ask' || syncStatus().mode === 'error') await allowSharing(null);
        void syncNow(s);
      }
    } catch (e) {
      setError(sendErrorText(e));
      setPhase('error');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(serialize(s));
      store.showToast(t('Kayıt kodu kopyalandı: sohbete yapıştırabilirsin'), 'good');
    } catch {
      store.showToast(t('Kopyalanamadı. Ayarlar ekranındaki kutudan elle kopyala.'), 'info');
    }
  };

  const dot = st.mode === 'on' || st.mode === 'sending' ? 'on' : st.mode === 'error' || st.mode === 'denied' ? 'bad' : st.mode === 'ask' ? 'ask' : 'off';

  return (
    <>
      <button type="button" className="nav-item nav-claude" onClick={() => setOpen(true)} title={statusText(st, kind)}>
        <span className="nav-icon" aria-hidden>
          <Icon name="envelope" size={20} />
        </span>
        <span className="nav-label">{dev ? t('Geri bildirim') : t('Claude’a gönder')}</span>
        {dot !== 'off' && <span className={`sync-dot sync-${dot}`} aria-label={statusText(st, kind)} />}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="send-title">
            <h2 id="send-title">
              <span className="modal-icon" aria-hidden>
                <Icon name="envelope" size={26} />
              </span>
              {dev ? t('Oyununu geliştiriciye gönder') : t('Oyununu Claude’a gönder')}
            </h2>
            <div className="modal-body">
              {hasDb !== false && <p className={`sync-line sync-line-${dot}`}>{statusText(st, kind)}</p>}
              {phase === 'sent' ? (
                dev ? (
                  <p>{tx('<b>Gönderildi, teşekkürler!</b> Oyunun ve notun geliştiriciye ulaştı.')}</p>
                ) : (
                  <p>
                    {tx(
                      '<b>Gönderildi.</b> Sohbette Claude’a “gönderdim” demen yeterli: oyununu açıp tasarımlarına, fiyatlarına, fabrikana, kararlarına ve hatalara bakacak.',
                    )}
                  </p>
                )
              ) : hasDb === false ? (
                <p>{t('Bu sürüm Claude’a doğrudan gönderemiyor. Kayıt kodunu kopyalayıp sohbete yapıştırabilirsin (uzun bir metin olacak).')}</p>
              ) : (
                <>
                  {dev ? (
                    <p>
                      {t('Şu anki oyunun ve notun geliştiriciye gönderilir; oyunu düzeltmek ve dengelemek için okunur. Oyun kaldığı yerden sürer.')}{' '}
                      <span className="muted small">{t(PRIVACY)}</span>
                    </p>
                  ) : (
                    <p>{t('Şu anki oyunun ve notun Claude’un okuyabileceği bir kutuya kaydedilir. Oyun kaldığı yerden sürer.')}</p>
                  )}
                  <label className="send-note">
                    <span>{dev ? t('Geliştiriciye notun (isteğe bağlı)') : t('Claude’a notun (isteğe bağlı)')}</span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder={t('Neyi sıkıcı, zor ya da garip buldun? Nerede hata gördün?')} />
                  </label>
                  {phase === 'error' && <p className="tone-bad">{error}</p>}
                  {(st.mode === 'on' || st.mode === 'sending' || st.mode === 'error') && (
                    <button type="button" className="link-btn small" onClick={disableSharing}>
                      {t('Otomatik paylaşımı kapat')}
                    </button>
                  )}
                  {(st.mode === 'disabled' || (dev && st.mode === 'ask')) && (
                    <button type="button" className="link-btn small" onClick={() => void allowSharing(s)}>
                      {t('Otomatik paylaşımı aç')}
                    </button>
                  )}
                  {dev && (
                    <p className="send-privacy small">
                      <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                        {t('Gizlilik politikası')}
                      </a>
                      {' · '}
                      <button type="button" className="link-btn small" onClick={() => void forget()}>
                        {t('Gönderdiğim verileri sil')}
                      </button>
                    </p>
                  )}
                  {forgot && <p className="small">{forgot}</p>}
                </>
              )}
            </div>
            <div className="modal-actions">
              <Button kind="ghost" onClick={close}>
                {phase === 'sent' ? t('Kapat') : t('Vazgeç')}
              </Button>
              {phase !== 'sent' &&
                (hasDb === false ? (
                  <Button kind="primary" onClick={copy}>
                    {t('Kayıt kodunu kopyala')}
                  </Button>
                ) : (
                  <Button kind="primary" disabled={phase === 'sending' || hasDb === null} onClick={send}>
                    {phase === 'sending' ? t('Gönderiliyor…') : t('Gönder')}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
