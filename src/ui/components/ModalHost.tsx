import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as A from '../../core/actions';
import { cardDef } from '../../data/cards';
import { eventDef } from '../../data/events';
import { MARKETS } from '../../data/markets';
import { segmentDef } from '../../data/segments';
import { SCORE_TIERS, cashReport, companyValue, finalScore, idleEngineers, idleReason, modelMargins, rescueLoan, type CashReport } from '../../core/game';
import { AREA_NAMES, SEVERITY_NAMES, defectText } from '../../core/testing';
import { allTech } from '../../core/techtree';
import { yearOf as yearOfWeek } from '../../core/time';
import { isBlockingModal } from '../../core/util';
import type { GameState, ModalItem } from '../../core/types';
import { store, useGameState } from '../store';
import { useBackClose } from '../back';
import { COST_NAMES, money, num, pct, signedMoney } from '../format';
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
              ev.choices.map((c) => {
                const desc = typeof c.desc === 'function' ? c.desc(s) : c.desc;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="choice-btn"
                    disabled={c.enabled ? !c.enabled(s) : false}
                    onClick={() => store.act((st) => A.chooseEventOption(st, ev.id, c.id))}
                  >
                    <b>{c.label}</b>
                    {desc && <small>{desc}</small>}
                  </button>
                );
              })
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
      const cost = A.recallCost(s, model.id, d.id);
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
            Sahadaki {model.name} araçlarında <b>{AREA_NAMES[d.area].toLowerCase()}</b> kaynaklı {SEVERITY_NAMES[d.severity].toLowerCase()} bir kusur ortaya çıktı:{' '}
            <b>{defectText(d).toLowerCase()}</b>. Yola çıkmış {num(model.unitsSold)} araç etkileniyor.
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
              {m.phase === 'development' && (
                <Button kind="ghost" onClick={close}>
                  Cilalamaya devam et
                </Button>
              )}
              {m.phase !== 'production' && (
                <Button
                  kind="ghost"
                  onClick={() => {
                    store.keepPaused();
                    store.act(A.dismissModal);
                    store.go({ id: 'project', projectId: p.id });
                  }}
                >
                  Projeye bak
                </Button>
              )}
              <Button
                kind="primary"
                onClick={() => {
                  // The next step is work on the project screen: the clock stays stopped.
                  store.keepPaused();
                  store.act(A.dismissModal);
                  if (m.phase === 'development') store.try((st) => A.finishDevelopment(st, p.id));
                  else if (m.phase === 'testing') store.try((st) => A.finishTesting(st, p.id));
                  store.go({ id: 'project', projectId: p.id });
                }}
              >
                {m.phase === 'development' ? 'Prototipleri yap, teste geç' : m.phase === 'testing' ? 'Üretim hazırlığına geç' : 'Lansmana git'}
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
    case 'insolvency':
      return <Insolvency s={s} stage={m.stage} />;
    case 'stall':
      return <Stall s={s} reason={m.reason} projectId={m.projectId} />;
    case 'gameOver':
      return <GameOver s={s} />;
  }
}

/** Where the money went: the year's three biggest costs, the weekly cash flow, spare credit, idle engineers. */
function CashFacts({ r, s }: { r: CashReport; s: GameState }) {
  return (
    <>
      <ul className="cash-facts">
        <li>
          Son 8 haftada kasa haftada ortalama <b className={r.weeklyNet < 0 ? 'tone-bad' : 'tone-good'}>{signedMoney(r.weeklyNet)}</b> değişti.
        </li>
        {r.costs.length > 0 && (
          <li>
            Son 52 haftanın en büyük giderleri (ciro {money(r.revenue)}):{' '}
            {r.costs.slice(0, 3).map((c, i) => (
              <span key={c.key}>
                {i > 0 && ', '}
                {COST_NAMES[c.key].toLowerCase()} <b>{money(c.amount)}</b>
                {r.revenue > 0 && <span className="muted"> ({pct(c.amount / r.revenue, 0)})</span>}
              </span>
            ))}
            .
          </li>
        )}
        <li>
          Bankanın hâlâ verebileceği kredi: <b>{money(r.room)}</b> (yıllık faiz %{(r.rate * 100).toFixed(0)}).
        </li>
        {modelMargins(s)
          .filter((x) => x.margin < 0)
          .map((x) =>
            x.built > 0.05 ? (
              <li key={x.id} className="tone-bad">
                <b>{x.name}</b> araç başına <b>{money(-x.margin)}</b> zarar ediyor: bayiden sonra {money(x.net)} kalıyor, malzeme {money(x.material)}, işçilik {money(x.labour)} (haftada{' '}
                {x.built.toFixed(1)} araç).
              </li>
            ) : (
              <li key={x.id} className="tone-bad">
                <b>{x.name}</b> üretilmiyor ama hattı haftada {money(x.labourWeek)} işçilik gideri çıkarıyor.
              </li>
            ),
          )}
        {r.idle > 0 && (
          <li className="tone-bad">
            {r.idle} mühendis boşta ({idleReason(s)}), ama haftada {money(r.idleWeekly)} maaş alıyorlar.
          </li>
        )}
        {(s.company.idleSalary ?? 0) > 0 && r.idle === 0 && s.gameOver && (
          <li>Şirket boyunca boştaki mühendislere toplam {money(s.company.idleSalary ?? 0)} maaş ödendi.</li>
        )}
      </ul>
    </>
  );
}

/** The company stands still: a design waiting on the desk, or no successor while the cars age. */
function Stall({ s, reason, projectId }: { s: GameState; reason: 'design' | 'idle' | 'polish' | 'tested' | 'tooling' | 'launch'; projectId?: string }) {
  const close = () => store.act(A.dismissModal);
  const go = (to: Parameters<typeof store.go>[0]) => {
    store.keepPaused();
    store.act(A.dismissModal);
    store.go(to);
  };
  const active = s.models.filter((m) => m.status === 'active').sort((a, b) => b.refreshWeek - a.refreshWeek);
  const newest = active[0];
  const age = newest ? Math.floor((s.week - newest.refreshWeek) / 52) : 0;
  const lastYear = s.years[s.years.length - 1];
  const best = s.years.reduce((a, y) => Math.max(a, y.unitsSold), 0);
  if (reason === 'tested' || reason === 'tooling' || reason === 'launch') {
    const p = s.projects.find((x) => x.id === projectId);
    const weeks = p?.waitSince !== undefined ? s.week - p.waitSince : 0;
    const what = {
      tested: { title: 'Testler bitti, sıradaki adım bekliyor', body: 'testleri bitti ama üretim hazırlığına geçilmedi', next: 'Projede “Üretim hazırlığına geç”e bas, sonra hattı ve kalıpları seç.' },
      tooling: { title: 'Kalıplar sipariş edilmedi', body: 'üretim hazırlığında bekliyor: hat seçilip kalıplar sipariş edilmedi', next: 'Projede hattı seç (boşta hat yoksa küçük bir atölye hattı kur) ve kalıpları sipariş et.' },
      launch: { title: 'Araba hazır, lansman bekliyor', body: 'hazır ama satışa çıkmadı', next: 'Projede fiyatı ve pazarları seçip lansmanı yap.' },
    }[reason];
    return (
      <Modal
        title={what.title}
        icon="⏳"
        actions={
          <>
            {p && (
              <Button kind="primary" onClick={() => go({ id: 'project', projectId: p.id })}>
                Projeye git
              </Button>
            )}
            <Button kind="ghost" onClick={close}>
              Tamam
            </Button>
          </>
        }
      >
        <p>
          <b>{p?.name ?? 'Proje'}</b> {weeks} haftadır {what.body}. Bu sürede maaşlar ve kira ödeniyor ama araba satılmıyor.
        </p>
        <p>{what.next}</p>
      </Modal>
    );
  }
  if (reason === 'polish') {
    const p = s.projects.find((x) => x.id === projectId);
    return (
      <Modal
        title="Cilalama sınıra ulaştı"
        icon="✨"
        actions={
          <>
            {p && (
              <Button kind="primary" onClick={() => go({ id: 'project', projectId: p.id })}>
                Projeye git
              </Button>
            )}
            <Button kind="ghost" onClick={close}>
              Tamam
            </Button>
          </>
        }
      >
        <p>
          <b>{p?.name ?? 'Proje'}</b> hedeflenen işin %160’ına ulaştı. Bundan sonrası arabaya bir şey katmaz; mühendisler boşuna çalışıyor ve lansman gecikiyor.
        </p>
        <p>
          Projede <b>Prototipleri yap, teste geç</b>’e bas.
        </p>
      </Modal>
    );
  }
  if (reason === 'design') {
    const p = s.projects.find((x) => x.id === projectId);
    const weeks = p ? s.week - p.createdWeek : 0;
    return (
      <Modal
        title="Proje tasarım masasında bekliyor"
        icon="📐"
        actions={
          <>
            {p && (
              <Button kind="primary" onClick={() => go({ id: 'project', projectId: p.id })}>
                Projeye git
              </Button>
            )}
            <Button kind="ghost" onClick={close}>
              Tamam
            </Button>
          </>
        }
      >
        <p>
          <b>{p?.name ?? 'Proje'}</b> {weeks} haftadır tasarım aşamasında. Geliştirme başlamadıkça mühendisler bu arabada çalışmaz: zaman geçiyor ama araba
          ilerlemiyor.
        </p>
        <p>
          Tasarımı bitir ve <b>Geliştirmeyi başlat</b>’a bas. Odak dağılımı geliştirme sırasında da değiştirilebilir.
        </p>
        {newest && age >= 3 && (
          <p className="muted small">
            Bu arada satıştaki en yeni araban {newest.name} {age} yaşında.
          </p>
        )}
      </Modal>
    );
  }
  return (
    <Modal
      title="Yolda yeni bir araba yok"
      icon="🕰️"
      actions={
        <>
          <Button kind="primary" onClick={() => go({ id: 'projects' })}>
            Yeni proje başlat
          </Button>
          {newest && <Button onClick={() => go({ id: 'model', modelId: newest.id })}>{newest.name}: makyaj ya da yeni kuşak</Button>}
          <Button kind="ghost" onClick={close}>
            Tamam
          </Button>
        </>
      }
    >
      {newest ? (
        <p>
          En yeni araban <b>{newest.name}</b> {age} yaşında ve arkasından gelen bir proje yok. Rakipler her dört-altı yılda yeni kuşak ya da makyaj çıkarır; eski
          arabanın satışı her yıl biraz daha erir.
        </p>
      ) : (
        <p>Satışta araban yok ve üzerinde çalışılan bir proje de yok.</p>
      )}
      <ul className="cash-facts">
        {lastYear && (
          <li>
            Geçen yıl <b>{num(lastYear.unitsSold)}</b> araç satıldı{best > lastYear.unitsSold * 1.3 ? `; en iyi yılında ${num(best)}` : ''}.
          </li>
        )}
        <li>
          Kasada <b>{money(s.company.cash)}</b>, <b>{s.company.engineers}</b> mühendis{idleEngineers(s) > 0 ? ' boşta bekliyor' : ''}.
        </li>
      </ul>
      <p className="muted small">Geliştirme bir iki yıl sürer; daha çok mühendis işi hızlandırır. Oyun sen devam ettirene kadar durur.</p>
    </Modal>
  );
}

function Insolvency({ s, stage }: { s: GameState; stage: 'first' | 'last' }) {
  const r = cashReport(s);
  const loan = rescueLoan(s);
  return (
    <Modal
      title={stage === 'first' ? 'Kasa eksiye düştü' : `Son uyarı: iflasa ${r.weeksLeft} hafta`}
      icon={stage === 'first' ? '⚠️' : '🚨'}
      actions={
        <>
          {loan > 0 && (
            <Button
              kind="primary"
              onClick={() =>
                store.act((st) => {
                  A.borrowToCover(st);
                  A.dismissModal(st);
                })
              }
            >
              Açığı kapatacak kadar kredi al ({money(loan)})
            </Button>
          )}
          <Button
            onClick={() => {
              store.act(A.dismissModal);
              store.go({ id: 'finance' });
            }}
          >
            Finans ekranına git
          </Button>
          <Button kind="ghost" onClick={() => store.act(A.dismissModal)}>
            Kendim hallederim
          </Button>
        </>
      }
    >
      <p>
        Kasa <b className="tone-bad">{money(s.company.cash)}</b>. {r.weeksLeft} hafta içinde artıya geçmezse bankalar kapıyı kapatır ve şirket iflas eder.
      </p>
      <CashFacts r={r} s={s} />
      <p className="muted small">
        Kredi zaman kazandırır ama zararı durdurmaz: fiyatı, üretim hızını ve boştaki hatları da gözden geçir. Oyun sen devam ettirene kadar durur.
      </p>
    </Modal>
  );
}

function GameOver({ s }: { s: GameState }) {
  const bankrupt = s.gameOver?.reason === 'bankrupt';
  const ousted = s.gameOver?.reason === 'ousted';
  const board = s.shares?.history.slice(-3) ?? [];
  const totalSold = s.models.reduce((a, m) => a + m.unitsSold, 0);
  const value = companyValue(s);
  const score = finalScore(s);
  const summary = `CarFacTycoon 1960 · ${s.company.name}: ${num(totalSold)} araç, şirket değeri ${money(value)}, itibar ${Math.round(s.company.reputation)}, puan ${score.total}/${score.max} (${score.tier}).`;
  const table = [
    { name: s.company.name, units: totalSold, me: true },
    ...s.rivals.map((r) => ({ name: r.name, units: r.unitsSold, me: false })),
  ].sort((a, b) => b.units - a.units);
  return (
    <Modal
      title={bankrupt ? 'Şirket iflas etti' : ousted ? `Görevden alındın: ${yearOfWeek(s.week)}` : 'Kampanya tamamlandı: 1960'}
      icon={bankrupt ? '💀' : ousted ? '🎩' : '🏆'}
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
          ? 'Kasa 12 hafta boyunca ekside kaldı ve bankalar kapıyı kapattı. Paranın nereye gittiği:'
          : ousted
            ? `Hissedarların sabrı tükendi: yönetim kurulu seni görevden aldı ve şirketi başka birine verdi. Ayrılırken şirket ${num(totalSold)} araç satmıştı, değeri ${money(value)}.`
            : `Unvanın: ${score.tier}. Toplam ${num(totalSold)} araç sattın; şirket değeri ${money(value)}.`}
      </p>
      {ousted && board.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>Yıl</th>
              <th className="al-r">Ciro büyümesi</th>
              <th className="al-r">Temettü</th>
              <th className="al-r">Güven</th>
            </tr>
          </thead>
          <tbody>
            {board.map((b) => (
              <tr key={b.year}>
                <td>{b.year}</td>
                <td className="al-r">
                  {pct(b.growth, 1)} <span className="muted small">/ {pct(b.targetGrowth, 1)}</span>
                </td>
                <td className="al-r">
                  {money(b.dividend)} <span className="muted small">/ {money(b.targetDividend)}</span>
                </td>
                <td className="al-r">{Math.round(b.confidence)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {bankrupt && <CashFacts r={cashReport(s)} s={s} />}
      {!bankrupt && (
        <>
          <h4>
            Oyun sonu puanı: {score.total} / {score.max} · <span className="tone-good">{score.tier}</span>
          </h4>
          <div className="score-scale" aria-hidden>
            {[...SCORE_TIERS].reverse().map((t, i, arr) => {
              const next = arr[i + 1]?.min ?? score.max;
              return (
                <span key={t.name} className={score.tier === t.name ? 'is-on' : ''} style={{ flex: next - t.min }}>
                  {t.name}
                  <small>{t.min}+</small>
                </span>
              );
            })}
            <i style={{ left: `${Math.min(100, (score.total / score.max) * 100)}%` }} />
          </div>
          <table className="table compact">
            <tbody>
              {score.parts.map((p) => (
                <tr key={p.label}>
                  <td>{p.label}</td>
                  <td className="al-r">{p.value}</td>
                  <td className="al-r">
                    <b>+{p.points}</b> <span className="muted small">/ {p.max}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <Button
              small
              onClick={() => {
                const text = summary;
                void navigator.clipboard?.writeText(text).then(
                  () => store.showToast('Sonuç panoya kopyalandı', 'good'),
                  () => store.showToast(text, 'info'),
                );
              }}
            >
              📋 Sonucu kopyala
            </Button>
          </p>
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
  const board = s.shares?.history.find((b) => b.year === year);
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
      {MARKETS.filter((mk) => mk.id === 'usa').map((mk) => (
        <div key={mk.id}>
          <span>
            {mk.flag} {mk.name} payı
          </span>
          <b>{pct(y.shareByMarket[mk.id], 2)}</b>
        </div>
      ))}
    </div>
    {board && (
      <p className={board.met ? 'tone-good' : 'tone-bad'}>
        🎩 Yönetim kurulu: ciro {pct(board.growth, 1)} (hedef {pct(board.targetGrowth, 1)}), temettü {money(board.dividend)} (hedef {money(board.targetDividend)}).{' '}
        {board.met ? 'Hedefler tuttu' : 'Hedefler tutmadı'}, güven {Math.round(board.confidence)}/100.
      </p>
    )}
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
  useBackClose(open && year !== null, () => store.act(A.dismissYearReport));
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
