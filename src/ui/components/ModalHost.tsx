import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as A from '../../core/actions';
import { cardDef } from '../../data/cards';
import { eventDef } from '../../data/events';
import { MARKETS } from '../../data/markets';
import { segmentDef } from '../../data/segments';
import { SCORE_TIERS, cashReport, companyValue, finalScore, idleEngineers, idleReason, modelMargins, rescueLoan, type CashReport } from '../../core/game';
import { AREA_NAMES, SEVERITY_NAMES, defectText } from '../../core/testing';
import { allTech, techName } from '../../core/techtree';
import { yearOf as yearOfWeek } from '../../core/time';
import { isBlockingModal } from '../../core/util';
import type { GameState, ModalItem } from '../../core/types';
import { isTurkish, lower, t } from '../../i18n';
import { fmtNumber } from '../../i18n/format';
import { store, useGameState } from '../store';
import { useBackClose } from '../back';
import { COST_NAMES, money, num, pct, signedMoney } from '../format';
import { Button } from './ui';
import { CardAnimation } from './CardAnimation';
import { LaunchReportView, LaunchShow } from './LaunchShow';
import { SponsorButton, YearOffer } from './Sponsor';
import { tx } from '../i18n';

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

/** One decimal, as the game always showed it in Turkish ("7.5"). */
const dec1 = (v: number) => (isTurkish() ? v.toFixed(1) : fmtNumber(v, 1));

/** A bold value in a colour picked by the code: tx('… <tone>{x}</tone> …', { x }, toned('tone-bad')). */
const toned = (className: string) => ({
  tone: (c: ReactNode, k: number) => (
    <b key={k} className={className}>
      {c}
    </b>
  ),
});

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
          title={t(ev.title)}
          icon={ev.icon}
          actions={
            ev.choices?.length ? (
              ev.choices.map((c) => {
                const desc = typeof c.desc === 'function' ? c.desc(s) : c.desc ? t(c.desc) : c.desc;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="choice-btn"
                    disabled={c.enabled ? !c.enabled(s) : false}
                    onClick={() => store.act((st) => A.chooseEventOption(st, ev.id, c.id))}
                  >
                    <b>{t(c.label)}</b>
                    {desc && <small>{desc}</small>}
                  </button>
                );
              })
            ) : (
              <Button kind="primary" onClick={close}>
                {t('Tamam')}
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
        <Modal
          title={t('Neden böyle çalışıyor? {title}', { title: t(c.title) })}
          icon="💡"
          wide
          actions={
            <Button kind="primary" onClick={close}>
              {t('Anladım')}
            </Button>
          }
        >
          <CardAnimation anim={c.anim} />
          <p>{t(c.body)}</p>
          <p className="card-gameplay">{tx('<b>Oyunda:</b> {text}', { text: t(c.gameplay) })}</p>
        </Modal>
      );
    }
    case 'recall':
    case 'service': {
      const model = s.models.find((x) => x.id === m.modelId);
      const d = model?.defects.find((x) => x.id === m.defectId);
      if (!model || !d) {
        return (
          <Modal title={t('Kusur')} actions={<Button onClick={close}>{t('Tamam')}</Button>}>
            {t('Kayıt bulunamadı.')}
          </Modal>
        );
      }
      const cost = A.recallCost(s, model.id, d.id);
      const critical = m.kind === 'recall';
      return (
        <Modal
          title={critical ? t('Kritik kusur: {name}', { name: model.name }) : t('Servis şikâyetleri: {name}', { name: model.name })}
          icon={critical ? '🚨' : '🔧'}
          actions={
            <>
              <button type="button" className="choice-btn" onClick={() => store.act((st) => A.recallDecision(st, model.id, d.id, 'recall'))}>
                <b>{critical ? t('Geri çağır') : t('Servis kampanyası başlat')}</b>
                <small>
                  {t('{cost} · itibar −{rep} · kusur giderilir', { cost: money(cost), rep: critical ? 3 : 1 })}
                </small>
              </button>
              <button type="button" className="choice-btn choice-btn-danger" onClick={() => store.act((st) => A.recallDecision(st, model.id, d.id, 'ignore'))}>
                <b>{critical ? t('Sessiz kal') : t('Görmezden gel')}</b>
                <small>
                  {critical
                    ? t('Bedava… şimdilik. Ortaya çıkarsa büyük skandal, dava ve itibar kaybı.')
                    : t('Güvenilirlik algısı düşer, arıza masrafı sürer.')}
                </small>
              </button>
            </>
          }
        >
          <p>
            {tx('Sahadaki {name} araçlarında <b>{area}</b> kaynaklı {severity} bir kusur ortaya çıktı: <b>{defect}</b>. Yola çıkmış {count} araç etkileniyor.', {
              name: model.name,
              area: lower(t(AREA_NAMES[d.area])),
              severity: lower(t(SEVERITY_NAMES[d.severity])),
              defect: lower(defectText(d)),
              count: num(model.unitsSold),
            })}
          </p>
          <p className="muted">
            {t('Bu kusur testlerde bulunamadı. Test süresini kısa tutmak lansmanı hızlandırır ama bu tür sürprizleri artırır ({n} hafta test yapılmıştı).', {
              n: model.testWeeks,
            })}
          </p>
        </Modal>
      );
    }
    case 'reviews': {
      const model = s.models.find((x) => x.id === m.modelId);
      if (!model) return null;
      return (
        <Modal
          title={t('Dergiler {name} için ne diyor?', { name: model.name })}
          icon="📰"
          wide
          actions={
            <Button kind="primary" onClick={close}>
              {t('Tamam')}
            </Button>
          }
        >
          <div className="reviews">
            {model.reviews.map((r) => (
              <article key={r.magazine} className="review">
                <header>
                  <span className="review-mag">{r.magazine}</span>
                  <span className={`review-score ${r.score >= 7 ? 'tone-good' : r.score < 5 ? 'tone-bad' : ''}`}>{dec1(r.score)}</span>
                </header>
                <p>“{r.quote}”</p>
              </article>
            ))}
          </div>
          <p className="muted">
            {t('Ortalama {avg}/10. Dergiler genelde bu sınıfın alıcılarının önem verdiği özellikleri konuşur. {segment} bilgi tablon güncellendi.', {
              avg: dec1(model.reviewScore),
              segment: t(segmentDef(model.segment).name),
            })}
          </p>
        </Modal>
      );
    }
    case 'phase': {
      const p = s.projects.find((x) => x.id === m.projectId);
      if (!p) return null;
      const text =
        m.phase === 'development'
          ? t('Mühendisler temel geliştirmeyi bitirdi. Biraz daha cilalamak güvenilirliği artırır; ya da prototipleri yapıp teste geçebilirsin.')
          : m.phase === 'testing'
            ? t('Test programı tamamlandı. Üretim hazırlığına geçebilirsin: parça tedarikçilerini ve üretim hattını seç.')
            : t('Kalıplar ve parçalar hazır. Fiyatı ve pazarları belirleyip lansmanı yap!');
      return (
        <Modal
          title={p.name}
          icon={m.phase === 'production' ? '🎉' : '📐'}
          actions={
            <>
              {m.phase === 'development' && (
                <Button kind="ghost" onClick={close}>
                  {t('Cilalamaya devam et')}
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
                  {t('Projeye bak')}
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
                {m.phase === 'development' ? t('Prototipleri yap, teste geç') : m.phase === 'testing' ? t('Üretim hazırlığına geç') : t('Lansmana git')}
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
        <Modal
          title={m.title}
          icon="🔓"
          actions={
            <Button kind="primary" onClick={close}>
              {t('Harika')}
            </Button>
          }
        >
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
          {tx(
            'Son 8 haftada kasa haftada ortalama <tone>{net}</tone> değişti.',
            { net: signedMoney(r.weeklyNet) },
            toned(r.weeklyNet < 0 ? 'tone-bad' : 'tone-good'),
          )}
        </li>
        {r.costs.length > 0 && (
          <li>
            {tx('Son 52 haftanın en büyük giderleri (ciro {revenue}): {costs}.', {
              revenue: money(r.revenue),
              costs: r.costs.slice(0, 3).map((c, i) => (
                <span key={c.key}>
                  {i > 0 && ', '}
                  {lower(t(COST_NAMES[c.key]))} <b>{money(c.amount)}</b>
                  {r.revenue > 0 && <span className="muted"> ({pct(c.amount / r.revenue, 0)})</span>}
                </span>
              )),
            })}
          </li>
        )}
        <li>{tx('Bankanın hâlâ verebileceği kredi: <b>{room}</b> (yıllık faiz {rate}).', { room: money(r.room), rate: pct(r.rate, 0) })}</li>
        {modelMargins(s)
          .filter((x) => x.margin < 0)
          .map((x) =>
            x.built > 0.05 ? (
              <li key={x.id} className="tone-bad">
                {tx('<b>{name}</b> araç başına <b>{loss}</b> zarar ediyor: bayiden sonra {net} kalıyor, malzeme {material}, işçilik {labour} (haftada {built} araç).', {
                  name: x.name,
                  loss: money(-x.margin),
                  net: money(x.net),
                  material: money(x.material),
                  labour: money(x.labour),
                  built: dec1(x.built),
                })}
              </li>
            ) : (
              <li key={x.id} className="tone-bad">
                {tx('<b>{name}</b> üretilmiyor ama hattı haftada {cost} işçilik gideri çıkarıyor.', { name: x.name, cost: money(x.labourWeek) })}
              </li>
            ),
          )}
        {r.idle > 0 && (
          <li className="tone-bad">
            {t('{n} mühendis boşta ({reason}), ama haftada {salary} maaş alıyorlar.', { n: r.idle, reason: idleReason(s), salary: money(r.idleWeekly) })}
          </li>
        )}
        {(s.company.idleSalary ?? 0) > 0 && r.idle === 0 && s.gameOver && (
          <li>{t('Şirket boyunca boştaki mühendislere toplam {salary} maaş ödendi.', { salary: money(s.company.idleSalary ?? 0) })}</li>
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
    // Dies left unordered because the till is short: say so, and how much is missing.
    const line = p ? (p.lineId ?? s.lines.find((l) => !s.models.some((m) => m.id === l.modelId && m.status === 'active'))?.id ?? s.lines[0]?.id) : undefined;
    const dies = reason === 'tooling' && p && line ? A.toolingQuote(s, p, line, 'soft').cost : 0;
    const short = dies > s.company.cash;
    const name = p?.name ?? t('Proje');
    const what = {
      tested: {
        title: t('Testler bitti, sıradaki adım bekliyor'),
        body: tx('<b>{name}</b> {n} haftadır testleri bitti ama üretim hazırlığına geçilmedi.', { name, n: weeks }),
        next: t('Projede “Üretim hazırlığına geç”e bas, sonra hattı ve kalıpları seç.'),
      },
      tooling: short
        ? {
            title: t('Kalıplar için para yok'),
            body: tx('<b>{name}</b> {n} haftadır üretim hazırlığında bekliyor: en ucuz kalıplar bile {dies} tutuyor, kasada {cash} var.', {
              name,
              n: weeks,
              dies: money(dies),
              cash: money(s.company.cash),
            }),
            next: t('Bankadan kredi al (Finans), ya da projede kalıpçıya vadeli sipariş ver: bedel %15 fazlasıyla borca eklenir.'),
          }
        : {
            title: t('Kalıplar sipariş edilmedi'),
            body: tx('<b>{name}</b> {n} haftadır üretim hazırlığında bekliyor: hat seçilip kalıplar sipariş edilmedi.', { name, n: weeks }),
            next: t('Projede hattı seç (boşta hat yoksa küçük bir atölye hattı kur) ve kalıpları sipariş et.'),
          },
      launch: {
        title: t('Araba hazır, lansman bekliyor'),
        body: tx('<b>{name}</b> {n} haftadır hazır ama satışa çıkmadı.', { name, n: weeks }),
        next: t('Projede fiyatı ve pazarları seçip lansmanı yap.'),
      },
    }[reason];
    return (
      <Modal
        title={what.title}
        icon="⏳"
        actions={
          <>
            {p && (
              <Button kind="primary" onClick={() => go({ id: 'project', projectId: p.id })}>
                {t('Projeye git')}
              </Button>
            )}
            <Button kind="ghost" onClick={close}>
              {t('Tamam')}
            </Button>
          </>
        }
      >
        <p>
          {what.body} {t('Bu sürede maaşlar ve kira ödeniyor ama araba satılmıyor.')}
        </p>
        <p>{what.next}</p>
      </Modal>
    );
  }
  if (reason === 'polish') {
    const p = s.projects.find((x) => x.id === projectId);
    return (
      <Modal
        title={t('Cilalama sınıra ulaştı')}
        icon="✨"
        actions={
          <>
            {p && (
              <Button kind="primary" onClick={() => go({ id: 'project', projectId: p.id })}>
                {t('Projeye git')}
              </Button>
            )}
            <Button kind="ghost" onClick={close}>
              {t('Tamam')}
            </Button>
          </>
        }
      >
        <p>
          {tx('<b>{name}</b> hedeflenen işin %160’ına ulaştı. Bundan sonrası arabaya bir şey katmaz; mühendisler boşuna çalışıyor ve lansman gecikiyor.', {
            name: p?.name ?? t('Proje'),
          })}
        </p>
        <p>{tx('Projede <b>Prototipleri yap, teste geç</b>’e bas.')}</p>
      </Modal>
    );
  }
  if (reason === 'design') {
    const p = s.projects.find((x) => x.id === projectId);
    const weeks = p ? s.week - p.createdWeek : 0;
    return (
      <Modal
        title={t('Proje tasarım masasında bekliyor')}
        icon="📐"
        actions={
          <>
            {p && (
              <Button kind="primary" onClick={() => go({ id: 'project', projectId: p.id })}>
                {t('Projeye git')}
              </Button>
            )}
            <Button kind="ghost" onClick={close}>
              {t('Tamam')}
            </Button>
          </>
        }
      >
        <p>
          {tx(
            '<b>{name}</b> {n} haftadır tasarım aşamasında. Geliştirme başlamadıkça mühendisler bu arabada çalışmaz: zaman geçiyor ama araba ilerlemiyor.',
            { name: p?.name ?? t('Proje'), n: weeks },
          )}
        </p>
        <p>{tx('Tasarımı bitir ve <b>Geliştirmeyi başlat</b>’a bas. Odak dağılımı geliştirme sırasında da değiştirilebilir.')}</p>
        {newest && age >= 3 && <p className="muted small">{t('Bu arada satıştaki en yeni araban {name} {n} yaşında.', { name: newest.name, n: age })}</p>}
      </Modal>
    );
  }
  return (
    <Modal
      title={t('Yolda yeni bir araba yok')}
      icon="🕰️"
      actions={
        <>
          <Button kind="primary" onClick={() => go({ id: 'projects' })}>
            {t('Yeni proje başlat')}
          </Button>
          {newest && <Button onClick={() => go({ id: 'model', modelId: newest.id })}>{t('{name}: makyaj ya da yeni kuşak', { name: newest.name })}</Button>}
          <Button kind="ghost" onClick={close}>
            {t('Tamam')}
          </Button>
        </>
      }
    >
      {newest ? (
        <p>
          {tx(
            'En yeni araban <b>{name}</b> {n} yaşında ve arkasından gelen bir proje yok. Rakipler her dört-altı yılda yeni kuşak ya da makyaj çıkarır; eski arabanın satışı her yıl biraz daha erir.',
            { name: newest.name, n: age },
          )}
        </p>
      ) : (
        <p>{t('Satışta araban yok ve üzerinde çalışılan bir proje de yok.')}</p>
      )}
      <ul className="cash-facts">
        {lastYear && (
          <li>
            {best > lastYear.unitsSold * 1.3
              ? tx('Geçen yıl <b>{count}</b> araç satıldı; en iyi yılında {best}.', { count: num(lastYear.unitsSold), best: num(best) })
              : tx('Geçen yıl <b>{count}</b> araç satıldı.', { count: num(lastYear.unitsSold) })}
          </li>
        )}
        <li>
          {idleEngineers(s) > 0
            ? tx('Kasada <b>{cash}</b>, <b>{n}</b> mühendis boşta bekliyor.', { cash: money(s.company.cash), n: s.company.engineers })
            : tx('Kasada <b>{cash}</b>, <b>{n}</b> mühendis.', { cash: money(s.company.cash), n: s.company.engineers })}
        </li>
      </ul>
      <p className="muted small">{t('Geliştirme bir iki yıl sürer; daha çok mühendis işi hızlandırır. Oyun sen devam ettirene kadar durur.')}</p>
    </Modal>
  );
}

function Insolvency({ s, stage }: { s: GameState; stage: 'first' | 'last' }) {
  const r = cashReport(s);
  const loan = rescueLoan(s);
  return (
    <Modal
      title={stage === 'first' ? t('Kasa eksiye düştü') : t('Son uyarı: iflasa {n} hafta', { n: r.weeksLeft })}
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
              {t('Açığı kapatacak kadar kredi al ({loan})', { loan: money(loan) })}
            </Button>
          )}
          <SponsorButton />
          <Button
            onClick={() => {
              store.act(A.dismissModal);
              store.go({ id: 'finance' });
            }}
          >
            {t('Finans ekranına git')}
          </Button>
          <Button kind="ghost" onClick={() => store.act(A.dismissModal)}>
            {t('Kendim hallederim')}
          </Button>
        </>
      }
    >
      <p>
        {tx('Kasa <bad>{cash}</bad>. {n} hafta içinde artıya geçmezse bankalar kapıyı kapatır ve şirket iflas eder.', {
          cash: money(s.company.cash),
          n: r.weeksLeft,
        })}
      </p>
      <CashFacts r={r} s={s} />
      <p className="muted small">
        {t('Kredi zaman kazandırır ama zararı durdurmaz: fiyatı, üretim hızını ve boştaki hatları da gözden geçir. Oyun sen devam ettirene kadar durur.')}
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
  const summary = t('CarFacTycoon 1960 · {company}: {count} araç, şirket değeri {value}, itibar {rep}, puan {score}/{max} ({tier}).', {
    company: s.company.name,
    count: num(totalSold),
    value: money(value),
    rep: Math.round(s.company.reputation),
    score: score.total,
    max: score.max,
    tier: t(score.tier),
  });
  const table = [
    { name: s.company.name, units: totalSold, me: true },
    ...s.rivals.map((r) => ({ name: r.name, units: r.unitsSold, me: false })),
  ].sort((a, b) => b.units - a.units);
  return (
    <Modal
      title={bankrupt ? t('Şirket iflas etti') : ousted ? t('Görevden alındın: {year}', { year: yearOfWeek(s.week) }) : t('Kampanya tamamlandı: 1960')}
      icon={bankrupt ? '💀' : ousted ? '🎩' : '🏆'}
      wide
      actions={
        <>
          <Button kind="primary" onClick={() => store.quit()}>
            {t('Ana menü')}
          </Button>
          <Button kind="ghost" onClick={() => store.act(A.dismissModal)}>
            {t('Şirkete son bir kez bak')}
          </Button>
        </>
      }
    >
      <p>
        {bankrupt
          ? t('Kasa 12 hafta boyunca ekside kaldı ve bankalar kapıyı kapattı. Paranın nereye gittiği:')
          : ousted
            ? t(
                'Hissedarların sabrı tükendi: yönetim kurulu seni görevden aldı ve şirketi başka birine verdi. Ayrılırken şirket {count} araç satmıştı, değeri {value}.',
                { count: num(totalSold), value: money(value) },
              )
            : t('Unvanın: {tier}. Toplam {count} araç sattın; şirket değeri {value}.', { tier: t(score.tier), count: num(totalSold), value: money(value) })}
      </p>
      {ousted && board.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>{t('Yıl')}</th>
              <th className="al-r">{t('Ciro büyümesi')}</th>
              <th className="al-r">{t('Temettü')}</th>
              <th className="al-r">{t('Güven')}</th>
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
            {tx('Oyun sonu puanı: {total} / {max} · {tier}', { total: score.total, max: score.max, tier: <span className="tone-good">{t(score.tier)}</span> })}
          </h4>
          <div className="score-scale" aria-hidden>
            {[...SCORE_TIERS].reverse().map((tier, i, arr) => {
              const next = arr[i + 1]?.min ?? score.max;
              return (
                <span key={tier.name} className={score.tier === tier.name ? 'is-on' : ''} style={{ flex: next - tier.min }}>
                  {t(tier.name)}
                  <small>{tier.min}+</small>
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
                  () => store.showToast(t('Sonuç panoya kopyalandı'), 'good'),
                  () => store.showToast(text, 'info'),
                );
              }}
            >
              📋 {t('Sonucu kopyala')}
            </Button>
          </p>
          <h4>{t('Tüm zamanların satış sıralaması')}</h4>
          <ol className="rank">
            {table.slice(0, 8).map((r) => (
              <li key={r.name} className={r.me ? 'is-me' : ''}>
                {r.name} <span className="muted">{num(r.units)}</span>
              </li>
            ))}
          </ol>
          <p className="muted">
            {t(
              '1961’de Türkiye’de “Devrim” projesi başlıyor. Türkiye senaryosu ve sonraki dönemler (petrol krizi, emisyon kuralları, elektrikli araçlar) genişleme olarak gelecek.',
            )}
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
  const fresh = allTech().filter((tech) => tech.year === year + 1);
  const board = s.shares?.history.find((b) => b.year === year);
  return (
    <>
    <div className="report-grid">
      <div>
        <span>{t('Satış')}</span>
        <b>{t('{count} araç', { count: num(y.unitsSold) })}</b>
      </div>
      <div>
        <span>{t('Ciro')}</span>
        <b>{money(y.revenue)}</b>
      </div>
      <div>
        <span>{t('Faaliyet kârı')}</span>
        <b className={y.profit < 0 ? 'tone-bad' : 'tone-good'}>{money(y.profit)}</b>
      </div>
      {MARKETS.filter((mk) => mk.id === 'usa').map((mk) => (
        <div key={mk.id}>
          <span>
            {mk.flag} {t('{market} payı', { market: t(mk.name) })}
          </span>
          <b>{pct(y.shareByMarket[mk.id], 2)}</b>
        </div>
      ))}
    </div>
    {board && (
      <p className={board.met ? 'tone-good' : 'tone-bad'}>
        🎩{' '}
        {t('Yönetim kurulu: ciro {growth} (hedef {targetGrowth}), temettü {dividend} (hedef {targetDividend}).', {
          growth: pct(board.growth, 1),
          targetGrowth: pct(board.targetGrowth, 1),
          dividend: money(board.dividend),
          targetDividend: money(board.targetDividend),
        })}{' '}
        {board.met
          ? t('Hedefler tuttu, güven {v}/100.', { v: Math.round(board.confidence) })
          : t('Hedefler tutmadı, güven {v}/100.', { v: Math.round(board.confidence) })}
      </p>
    )}
    {rivals.length > 0 && (
      <>
        <h4>{t('En çok satan rakipler')}</h4>
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
        <h4>{t('{year} yılında gelen yenilikler', { year: year + 1 })}</h4>
        <p className="muted">{fresh.map((tech) => techName(tech)).join(', ')}</p>
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
    const timer = setTimeout(() => store.act(A.dismissYearReport), 25000);
    return () => clearTimeout(timer);
  }, [year, open]);
  useBackClose(open && year !== null, () => store.act(A.dismissYearReport));
  if (year === null) return null;
  const y = s.years.find((x) => x.year === year);
  if (!y) return null;
  const close = () => store.act(A.dismissYearReport);
  if (open) {
    return (
      <Modal
        title={t('{year} yılı raporu', { year })}
        icon="📊"
        actions={
          <Button kind="primary" onClick={close}>
            {t('Kapat')}
          </Button>
        }
      >
        <YearReportBody s={s} year={year} />
        <YearOffer year={year} />
      </Modal>
    );
  }
  return (
    <aside className="year-card" aria-live="polite">
      <div className="year-card-head">
        <b>📊 {t('{year} yılı kapandı', { year })}</b>
        <button type="button" className="year-card-x" aria-label={t('Kapat')} onClick={close}>
          ×
        </button>
      </div>
      <div className="year-card-stats">
        <span>
          {t('Satış')} <b>{num(y.unitsSold)}</b>
        </span>
        <span>
          {t('Kâr')} <b className={y.profit < 0 ? 'tone-bad' : 'tone-good'}>{money(y.profit)}</b>
        </span>
      </div>
      <YearOffer year={year} />
      <Button kind="ghost" onClick={() => setOpen(true)}>
        {t('Raporu aç')}
      </Button>
    </aside>
  );
}
