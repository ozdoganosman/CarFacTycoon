import { useEffect, useState, useSyncExternalStore } from 'react';
import { serialize } from '../../core/save';
import { allowSharing, disableSharing, onSyncStatus, playtestSink, sendErrorText, sendPlaytest, syncNow, syncStatus, type SinkKind, type SyncStatus } from '../claudeLink';
import { store, useGameState } from '../store';
import { Button } from './ui';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export const useSyncStatus = (): SyncStatus => useSyncExternalStore(onSyncStatus, syncStatus);

function ago(t?: number): string {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'az önce' : `${m} dk önce`;
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
        return st.lastSent ? `Oyunun geliştiriciyle paylaşılıyor · son gönderim ${ago(st.lastSent)}` : 'Oyunun geliştiriciyle paylaşılıyor';
      case 'sending':
        return 'Gönderiliyor…';
      case 'error':
        return st.message ?? 'Gönderilemedi, yeniden denenecek.';
      case 'ask':
        return 'Otomatik paylaşım kapalı: izin verirsen oyunun arada bir geliştiriciye gider.';
      default:
        return 'Otomatik paylaşım kapalı.';
    }
  }
  switch (st.mode) {
    case 'on':
      return st.lastSent ? `Claude oyununu görüyor · son gönderim ${ago(st.lastSent)}` : 'Claude oyununu görüyor';
    case 'sending':
      return 'Claude’a gönderiliyor…';
    case 'error':
      return st.message ?? 'Gönderilemedi, yeniden denenecek.';
    case 'ask':
      return 'Claude oyununu henüz göremiyor: izin gerekiyor.';
    case 'denied':
      return 'İzin verilmedi. Sayfanın İzinler menüsünden açabilirsin.';
    case 'disabled':
      return 'Otomatik paylaşım kapalı.';
    default:
      return 'Bu sürüm Claude’a doğrudan gönderemiyor.';
  }
}

/** What is and is not collected, said before the player decides. */
const PRIVACY =
  'Adın ya da e-postan sorulmaz; bu tarayıcıya rastgele bir oyuncu numarası verilir. Şirkete verdiğin ad ve yazdığın notlar oyunla birlikte gider. Veriler AB’deki sunucularda (Supabase, PostHog) durur, reklam için kullanılmaz, kimseyle paylaşılmaz. İstediğin an menüdeki Geri bildirim’den kapatabilirsin.';

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
          <b>Oyununu geliştiriciyle paylaşır mısın?</b> Oyunu düzeltmek ve dengelemek için oyunun (tasarımların, kararların, satışların, karşılaştığın hatalar) arada bir
          kendiliğinden gönderilir; hangi ekranlarda ne yaptığın ve oyun ekranının kaydı da tutulur. <span className="muted">{PRIVACY}</span>
        </span>
        <span className="claude-share-btns">
          <Button kind="ghost" onClick={disableSharing}>
            Hayır, teşekkürler
          </Button>
          <Button kind="primary" onClick={() => void allowSharing(s)}>
            Paylaş
          </Button>
        </span>
      </div>
    );
  return (
    <div className="claude-share" role="note">
      <span>
        <b>Claude oyununu görebilsin mi?</b> İzin verirsen oyunun (tasarımlar, kararlar, satışlar, hatalar) Claude’un inceleyebileceği bir kutuya kendiliğinden
        kaydedilir.
      </span>
      <span className="claude-share-btns">
        <Button kind="ghost" onClick={() => setHidden(true)}>
          Şimdi değil
        </Button>
        <Button kind="primary" onClick={() => void allowSharing(s)}>
          İzin ver
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

  const close = () => {
    setOpen(false);
    if (phase !== 'sending') setPhase('idle');
  };

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
      store.showToast('Kayıt kodu kopyalandı: sohbete yapıştırabilirsin', 'good');
    } catch {
      store.showToast('Kopyalanamadı. Ayarlar ekranındaki kutudan elle kopyala.', 'info');
    }
  };

  const dot = st.mode === 'on' || st.mode === 'sending' ? 'on' : st.mode === 'error' || st.mode === 'denied' ? 'bad' : st.mode === 'ask' ? 'ask' : 'off';

  return (
    <>
      <button type="button" className="nav-item nav-claude" onClick={() => setOpen(true)} title={statusText(st, kind)}>
        <span className="nav-icon" aria-hidden>
          📨
        </span>
        <span className="nav-label">{dev ? 'Geri bildirim' : 'Claude’a gönder'}</span>
        {dot !== 'off' && <span className={`sync-dot sync-${dot}`} aria-label={statusText(st, kind)} />}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="send-title">
            <h2 id="send-title">
              <span className="modal-icon" aria-hidden>
                📨
              </span>
              {dev ? 'Oyununu geliştiriciye gönder' : 'Oyununu Claude’a gönder'}
            </h2>
            <div className="modal-body">
              {hasDb !== false && <p className={`sync-line sync-line-${dot}`}>{statusText(st, kind)}</p>}
              {phase === 'sent' ? (
                dev ? (
                  <p>
                    <b>Gönderildi, teşekkürler!</b> Oyunun ve notun geliştiriciye ulaştı.
                  </p>
                ) : (
                  <p>
                    <b>Gönderildi.</b> Sohbette Claude’a “gönderdim” demen yeterli: oyununu açıp tasarımlarına, fiyatlarına, fabrikana, kararlarına ve hatalara bakacak.
                  </p>
                )
              ) : hasDb === false ? (
                <p>Bu sürüm Claude’a doğrudan gönderemiyor. Kayıt kodunu kopyalayıp sohbete yapıştırabilirsin (uzun bir metin olacak).</p>
              ) : (
                <>
                  {dev ? (
                    <p>
                      Şu anki oyunun ve notun geliştiriciye gönderilir; oyunu düzeltmek ve dengelemek için okunur. Oyun kaldığı yerden sürer.{' '}
                      <span className="muted small">{PRIVACY}</span>
                    </p>
                  ) : (
                    <p>Şu anki oyunun ve notun Claude’un okuyabileceği bir kutuya kaydedilir. Oyun kaldığı yerden sürer.</p>
                  )}
                  <label className="send-note">
                    <span>{dev ? 'Geliştiriciye notun (isteğe bağlı)' : 'Claude’a notun (isteğe bağlı)'}</span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Neyi sıkıcı, zor ya da garip buldun? Nerede hata gördün?" />
                  </label>
                  {phase === 'error' && <p className="tone-bad">{error}</p>}
                  {(st.mode === 'on' || st.mode === 'sending' || st.mode === 'error') && (
                    <button type="button" className="link-btn small" onClick={disableSharing}>
                      Otomatik paylaşımı kapat
                    </button>
                  )}
                  {(st.mode === 'disabled' || (dev && st.mode === 'ask')) && (
                    <button type="button" className="link-btn small" onClick={() => void allowSharing(s)}>
                      Otomatik paylaşımı aç
                    </button>
                  )}
                </>
              )}
            </div>
            <div className="modal-actions">
              <Button kind="ghost" onClick={close}>
                {phase === 'sent' ? 'Kapat' : 'Vazgeç'}
              </Button>
              {phase !== 'sent' &&
                (hasDb === false ? (
                  <Button kind="primary" onClick={copy}>
                    Kayıt kodunu kopyala
                  </Button>
                ) : (
                  <Button kind="primary" disabled={phase === 'sending' || hasDb === null} onClick={send}>
                    {phase === 'sending' ? 'Gönderiliyor…' : 'Gönder'}
                  </Button>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
