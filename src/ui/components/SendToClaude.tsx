import { useEffect, useState, useSyncExternalStore } from 'react';
import { serialize } from '../../core/save';
import { allowSharing, claudeDb, disableSharing, onSyncStatus, sendErrorText, sendToClaude, syncNow, syncStatus, type SyncStatus } from '../claudeLink';
import { store, useGameState } from '../store';
import { Button } from './ui';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

export const useSyncStatus = (): SyncStatus => useSyncExternalStore(onSyncStatus, syncStatus);

function ago(t?: number): string {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'az önce' : `${m} dk önce`;
}

function statusText(st: SyncStatus): string {
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

/** A slim bar asking once whether Claude may watch this game. */
export function ShareBar() {
  const s = useGameState();
  const st = useSyncStatus();
  const [hidden, setHidden] = useState(false);
  if (st.mode !== 'ask' || hidden) return null;
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
  const [hasDb, setHasDb] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    void claudeDb().then((db) => live && setHasDb(!!db));
    return () => {
      live = false;
    };
  }, []);

  const close = () => {
    setOpen(false);
    if (phase !== 'sending') setPhase('idle');
  };

  const send = async () => {
    const db = await claudeDb();
    if (!db) return;
    setPhase('sending');
    try {
      await sendToClaude(db, s, note);
      setPhase('sent');
      setNote('');
      // The click granted the database: keep the game's own copy fresh from now on.
      if (syncStatus().mode === 'ask' || syncStatus().mode === 'error') await allowSharing(null);
      void syncNow(s);
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
      <button type="button" className="nav-item nav-claude" onClick={() => setOpen(true)} title={statusText(st)}>
        <span className="nav-icon" aria-hidden>
          📨
        </span>
        <span className="nav-label">Claude’a gönder</span>
        {dot !== 'off' && <span className={`sync-dot sync-${dot}`} aria-label={statusText(st)} />}
      </button>
      {open && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && close()}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="send-title">
            <h2 id="send-title">
              <span className="modal-icon" aria-hidden>
                📨
              </span>
              Oyununu Claude’a gönder
            </h2>
            <div className="modal-body">
              {hasDb !== false && <p className={`sync-line sync-line-${dot}`}>{statusText(st)}</p>}
              {phase === 'sent' ? (
                <p>
                  <b>Gönderildi.</b> Sohbette Claude’a “gönderdim” demen yeterli: oyununu açıp tasarımlarına, fiyatlarına, fabrikana, kararlarına ve hatalara bakacak.
                </p>
              ) : hasDb === false ? (
                <p>Bu sürüm Claude’a doğrudan gönderemiyor. Kayıt kodunu kopyalayıp sohbete yapıştırabilirsin (uzun bir metin olacak).</p>
              ) : (
                <>
                  <p>Şu anki oyunun ve notun Claude’un okuyabileceği bir kutuya kaydedilir. Oyun kaldığı yerden sürer.</p>
                  <label className="send-note">
                    <span>Claude’a notun (isteğe bağlı)</span>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="Neyi sıkıcı, zor ya da garip buldun? Nerede hata gördün?" />
                  </label>
                  {phase === 'error' && <p className="tone-bad">{error}</p>}
                  {(st.mode === 'on' || st.mode === 'sending' || st.mode === 'error') && (
                    <button type="button" className="link-btn small" onClick={disableSharing}>
                      Otomatik paylaşımı kapat
                    </button>
                  )}
                  {st.mode === 'disabled' && (
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
