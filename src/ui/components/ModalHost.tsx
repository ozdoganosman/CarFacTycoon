import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as A from '../../core/actions';
import { cardDef } from '../../data/cards';
import { eventDef } from '../../data/events';
import { MARKETS } from '../../data/markets';
import { segmentDef } from '../../data/segments';
import { companyAssets } from '../../core/game';
import { AREA_NAMES, SEVERITY_NAMES } from '../../core/testing';
import { allTech } from '../../core/techtree';
import { costIndex } from '../../data/economy';
import { yearFloat } from '../../core/time';
import { isBlockingModal } from '../../core/util';
import type { GameState, ModalItem } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num, pct } from '../format';
import { Button } from './ui';
import { CardAnimation } from './CardAnimation';
import { LaunchReportView, LaunchShow } from './LaunchShow';

function Modal(props: { title: ReactNode; icon?: string; children: ReactNode; actions: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus();
  }, [props.title]);
  return (
    <div className="modal-backdrop">
      <div className={`modal ${props.wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" ref={ref}>
        <h2 id="modal-title">
          {props.icon && <span className="modal-icon" aria-hidden>{props.icon}</span>}
          {props.title}
        </h2>
        <div className="modal-body">{props.children}</div>
        <div className="modal-actions">{props.actions}</div>
      </div>
    </div>
  );
}

const paragraphs = (text: string) => text.split('\n\n').map((p, i) => <p key={i}>{p}</p>);

export function ModalHost() {
  const s = useGameState();
  const blocking = s.modals.filter(isBlockingModal);
  const m = blocking[0];
  if (!m) return null;
  return <ModalFor s={s} m={m} key={JSON.stringify(m) + blocking.length} />;
}

function ModalFor({ s, m }: { s: GameState; m: ModalItem }) {
  const close = () => store.act(A.dismissModal);
  switch (m.kind) {
    case 'event': {
      const ev = eventDef(m.eventId);
      if (!ev) return null;
      return (
        <Modal
          title={ev.title}
          icon={ev.icon}
          actions={
            ev.choices?.length ? (
              ev.choices.map((c) => (
                <button key={c.id} type="button" className="choice-btn" onClick={() => store.act((st) => A.chooseEventOption(st, ev.id, c.id))}>
                  <b>{c.label}</b>
                  {c.desc && <small>{c.desc}</small>}
                </button>
              ))
            ) : (
              <Button kind="primary" onClick={close}>
                Tamam
              </Button>
            )
          }
        >
          {paragraphs(ev.body(s))}
        </Modal>
      );
    }
    case 'card': {
      const c = cardDef(m.cardId);
      if (!c) return null;
      return (
        <Modal title={`Neden böyle çalışıyor? ${c.title}`} icon="💡" wide actions={<Button kind="primary" onClick={close}>Anladım</Button>}>
          <CardAnimation anim={c.anim} />
          <p>{c.body}</p>
          <p className="card-gameplay">
            <b>Oyunda:</b> {c.gameplay}
          </p>
        </Modal>
      );
    }
    case 'recall':
    case 'service': {
      const model = s.models.find((x) => x.id === m.modelId);
      const d = model?.defects.find((x) => x.id === m.defectId);
      if (!model || !d) {
        return <Modal title="Kusur" actions={<Button onClick={close}>Tamam</Button>}>Kayıt bulunamadı.</Modal>;
      }
      const perCar = (d.severity === 'critical' ? 25 : 10) * costIndex(yearFloat(s.week));
      const cost = model.unitsSold * perCar;
      const critical = m.kind === 'recall';
      return (
        <Modal
          title={critical ? `Kritik kusur: ${model.name}` : `Servis şikâyetleri: ${model.name}`}
          icon={critical ? '🚨' : '🔧'}
          actions={
            <>
              <button type="button" className="choice-btn" onClick={() => store.act((st) => A.recallDecision(st, model.id, d.id, 'recall'))}>
                <b>{critical ? 'Geri çağır' : 'Servis kampanyası başlat'}</b>
                <small>
                  {money(cost)} · itibar −{critical ? 3 : 1} · kusur giderilir
                </small>
              </button>
              <button type="button" className="choice-btn choice-btn-danger" onClick={() => store.act((st) => A.recallDecision(st, model.id, d.id, 'ignore'))}>
                <b>{critical ? 'Sessiz kal' : 'Görmezden gel'}</b>
                <small>
                  {critical
                    ? 'Bedava… şimdilik. Ortaya çıkarsa büyük skandal, dava ve itibar kaybı.'
                    : 'Güvenilirlik algısı düşer, arıza masrafı sürer.'}
                </small>
              </button>
            </>
          }
        >
          <p>
            Sahadaki {model.name} araçlarında <b>{AREA_NAMES[d.area].toLowerCase()}</b> kaynaklı {SEVERITY_NAMES[d.severity].toLowerCase()} bir kusur ortaya çıktı.
            Yola çıkmış {num(model.unitsSold)} araç etkileniyor.
          </p>
          <p className="muted">
            Bu kusur testlerde bulunamadı. Test süresini kısa tutmak lansmanı hızlandırır ama bu tür sürprizleri artırır ({model.testWeeks} hafta test yapılmıştı).
          </p>
        </Modal>
      );
    }
    case 'reviews': {
      const model = s.models.find((x) => x.id === m.modelId);
      if (!model) return null;
      return (
        <Modal title={`Dergiler ${model.name} için ne diyor?`} icon="📰" wide actions={<Button kind="primary" onClick={close}>Tamam</Button>}>
          <div className="reviews">
            {model.reviews.map((r) => (
              <article key={r.magazine} className="review">
                <header>
                  <span className="review-mag">{r.magazine}</span>
                  <span className={`review-score ${r.score >= 7 ? 'tone-good' : r.score < 5 ? 'tone-bad' : ''}`}>{r.score.toFixed(1)}</span>
                </header>
                <p>“{r.quote}”</p>
              </article>
            ))}
          </div>
          <p className="muted">
            Ortalama {model.reviewScore.toFixed(1)}/10. Dergiler genelde bu sınıfın alıcılarının önem verdiği özellikleri konuşur. {segmentDef(model.segment).name} bilgi
            tablon güncellendi.
          </p>
        </Modal>
      );
    }
    case 'phase': {
      const p = s.projects.find((x) => x.id === m.projectId);
      if (!p) return null;
      const text =
        m.phase === 'development'
          ? 'Mühendisler temel geliştirmeyi bitirdi. Biraz daha cilalamak güvenilirliği artırır; ya da prototipleri yapıp teste geçebilirsin.'
          : m.phase === 'testing'
            ? 'Test programı tamamlandı. Üretim hazırlığına geçebilirsin: parça tedarikçilerini ve üretim hattını seç.'
            : 'Kalıplar ve parçalar hazır. Fiyatı ve pazarları belirleyip lansmanı yap!';
      return (
        <Modal
          title={p.name}
          icon={m.phase === 'production' ? '🎉' : '📐'}
          actions={
            <>
              <Button
                kind="primary"
                onClick={() => {
                  store.act(A.dismissModal);
                  store.go({ id: 'project', projectId: p.id });
                }}
              >
                Projeye git
              </Button>
              <Button kind="ghost" onClick={close}>
                Sonra
              </Button>
            </>
          }
        >
          <p>{text}</p>
        </Modal>
      );
    }
    case 'launch':
      return <LaunchShow s={s} modelId={m.modelId} venue={m.venue} facelift={m.facelift} />;
    case 'launchReport':
      return <LaunchReportView s={s} modelId={m.modelId} report={m.report} />;
    case 'unlock':
      return (
        <Modal title={m.title} icon="🔓" actions={<Button kind="primary" onClick={close}>Harika</Button>}>
          {paragraphs(m.body)}
        </Modal>
      );
    case 'gameOver':
      return <GameOver s={s} />;
  }
}

function GameOver({ s }: { s: GameState }) {
  const bankrupt = s.gameOver?.reason === 'bankrupt';
  const totalSold = s.models.reduce((a, m) => a + m.unitsSold, 0);
  const value = companyAssets(s) - s.company.loan;
  const table = [
    { name: s.company.name, units: totalSold, me: true },
    ...s.rivals.map((r) => ({ name: r.name, units: r.unitsSold, me: false })),
  ].sort((a, b) => b.units - a.units);
  const rank = table.findIndex((x) => x.me) + 1;
  const title = bankrupt
    ? 'İflas'
    : rank === 1
      ? 'Sanayi devi'
      : rank <= 3
        ? 'Büyük üretici'
        : rank <= 6
          ? 'Saygın marka'
          : 'Butik atölye';
  return (
    <Modal
      title={bankrupt ? 'Şirket iflas etti' : 'Kampanya tamamlandı: 1960'}
      icon={bankrupt ? '💀' : '🏆'}
      wide
      actions={
        <>
          <Button kind="primary" onClick={() => store.quit()}>
            Ana menü
          </Button>
          <Button kind="ghost" onClick={() => store.act(A.dismissModal)}>
            Şirkete son bir kez bak
          </Button>
        </>
      }
    >
      <p>
        {bankrupt
          ? 'Kasa 12 hafta boyunca ekside kaldı ve bankalar kapıyı kapattı. Bir dahaki sefere nakit akışını gözünü dört açarak izle.'
          : `Unvanın: ${title}. Toplam ${num(totalSold)} araç sattın; şirket değeri ${money(value)}.`}
      </p>
      {!bankrupt && (
        <>
          <h4>Tüm zamanların satış sıralaması</h4>
          <ol className="rank">
            {table.slice(0, 8).map((r) => (
              <li key={r.name} className={r.me ? 'is-me' : ''}>
                {r.name} <span className="muted">{num(r.units)}</span>
              </li>
            ))}
          </ol>
          <p className="muted">
            1961’de Türkiye’de “Devrim” projesi başlıyor. Türkiye senaryosu ve sonraki dönemler (petrol krizi, emisyon kuralları, elektrikli araçlar) genişleme olarak
            gelecek.
          </p>
        </>
      )}
    </Modal>
  );
}

/** What the year brought: sales, profit, shares, the best-selling rivals and next year's technology. */
export function YearReportBody({ s, year }: { s: GameState; year: number }) {
  const y = s.years.find((x) => x.year === year);
  if (!y) return null;
  const rivals = s.rivals
    .map((r) => ({ name: r.name, units: r.yearSold[year] ?? 0 }))
    .filter((r) => r.units > 0)
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);
  const fresh = allTech().filter((t) => t.year === year + 1);
  return (
    <>
    <div className="report-grid">
      <div>
        <span>Satış</span>
        <b>{num(y.unitsSold)} araç</b>
      </div>
      <div>
        <span>Ciro</span>
        <b>{money(y.revenue)}</b>
      </div>
      <div>
        <span>Faaliyet kârı</span>
        <b className={y.profit < 0 ? 'tone-bad' : 'tone-good'}>{money(y.profit)}</b>
      </div>
      {MARKETS.map((mk) => (
        <div key={mk.id}>
          <span>
            {mk.flag} {mk.name} payı
          </span>
          <b>{pct(y.shareByMarket[mk.id], 2)}</b>
        </div>
      ))}
    </div>
    {rivals.length > 0 && (
      <>
        <h4>En çok satan rakipler</h4>
        <ol className="rank">
          {rivals.map((r) => (
            <li key={r.name}>
              {r.name} <span className="muted">{num(r.units)}</span>
            </li>
          ))}
        </ol>
      </>
    )}
    {fresh.length > 0 && (
      <>
        <h4>{year + 1} yılında gelen yenilikler</h4>
        <p className="muted">{fresh.map((t) => t.name).join(', ')}</p>
      </>
    )}
    </>
  );
}

/**
 * The year report does not stop the game: it waits in a corner for a while
 * and opens in full on request.
 */
export function YearCard() {
  const s = useGameState();
  const item = s.modals.find((m) => m.kind === 'yearReport');
  const year = item?.kind === 'yearReport' ? item.year : null;
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [year]);
  // Tucked away by itself after a while, unless the player is reading it.
  useEffect(() => {
    if (year === null || open) return;
    const t = setTimeout(() => store.act(A.dismissYearReport), 25000);
    return () => clearTimeout(t);
  }, [year, open]);
  if (year === null) return null;
  const y = s.years.find((x) => x.year === year);
  if (!y) return null;
  const close = () => store.act(A.dismissYearReport);
  if (open) {
    return (
      <Modal title={`${year} yılı raporu`} icon="📊" actions={<Button kind="primary" onClick={close}>Kapat</Button>}>
        <YearReportBody s={s} year={year} />
      </Modal>
    );
  }
  return (
    <aside className="year-card" aria-live="polite">
      <div className="year-card-head">
        <b>📊 {year} yılı kapandı</b>
        <button type="button" className="year-card-x" aria-label="Kapat" onClick={close}>
          ×
        </button>
      </div>
      <div className="year-card-stats">
        <span>
          Satış <b>{num(y.unitsSold)}</b>
        </span>
        <span>
          Kâr <b className={y.profit < 0 ? 'tone-bad' : 'tone-good'}>{money(y.profit)}</b>
        </span>
      </div>
      <Button kind="ghost" onClick={() => setOpen(true)}>
        Raporu aç
      </Button>
    </aside>
  );
}
