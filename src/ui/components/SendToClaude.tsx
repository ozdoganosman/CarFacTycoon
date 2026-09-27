import { useEffect, useState } from 'react';
import { serialize } from '../../core/save';
import { claudeDb, sendErrorText, sendToClaude } from '../claudeLink';
import { store, useGameState } from '../store';
import { Button } from './ui';

type Phase = 'idle' | 'sending' | 'sent' | 'error';

/** Lets the player hand the current game to Claude, with a note on what felt wrong. */
export function SendToClaude() {
  const s = useGameState();
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

  return (
    <>
      <button type="button" className="nav-item nav-claude" onClick={() => setOpen(true)}>
        <span className="nav-icon" aria-hidden>
          📨
        </span>
        <span className="nav-label">Claude’a gönder</span>
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
              {phase === 'sent' ? (
                <p>
                  <b>Gönderildi.</b> Sohbette Claude’a “gönderdim” demen yeterli: oyununu açıp tasarımlarına, fiyatlarına, fabrikana ve kararlarına bakacak.
                </p>
              ) : hasDb === false ? (
                <p>
                  Bu sürüm Claude’a doğrudan gönderemiyor. Kayıt kodunu kopyalayıp sohbete yapıştırabilirsin (uzun bir metin olacak).
                </p>
              ) : (
                <>
                  <p>
                    Oyunun şu anki hâli (tasarımlar, fiyatlar, fabrika, satışlar, haberler) Claude’un okuyabileceği bir kutuya kaydedilir. Oyun kaldığı yerden sürer.
                  </p>
                  <label className="send-note">
                    <span>Claude’a notun (isteğe bağlı)</span>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={4}
                      placeholder="Neyi sıkıcı, zor ya da garip buldun? Neyi merak ediyorsun?"
                    />
                  </label>
                  {phase === 'error' && <p className="tone-bad">{error}</p>}
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
