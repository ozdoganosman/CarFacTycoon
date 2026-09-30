import { useEffect, useRef, useState } from 'react';
import * as A from '../../core/actions';
import { FOCUS_HINTS, FOCUS_KEYS, FOCUS_NAMES, FOCUS_PRESETS, devRate, matchingPreset, presetFocus } from '../../core/development';
import { costIndex, engineerSalary } from '../../data/economy';
import { yearFloat } from '../../core/time';
import { classGap, gapNames, knownKnowhow, unknownTech } from '../../core/research';
import { budgetVerdict, launchBudget } from '../../core/budget';
import { t } from '../../i18n';
import { dec, money, pct } from '../format';
import { tx } from '../i18n';
import { BudgetLine } from '../components/BudgetLine';
import type { FocusKey, Project } from '../../core/types';
import { store, useGameState } from '../store';
import { Button, Progress, Slider } from '../components/ui';
import { Icon } from '../components/Icon';

interface Bubble {
  id: number;
  key: FocusKey;
  text: string;
}

/** Team, time and the one action of the design step, kept above the designer so it never needs scrolling to. */
export function DevBar({ project: p }: { project: Project }) {
  const s = useGameState();
  const developing = p.phase === 'development';
  // Every engineer works: projects in development share the whole team.
  const others = s.projects.filter((x) => x.phase === 'development' && x.id !== p.id).length;
  const eng = s.company.engineers / (others + 1);
  const required = developing ? p.dev.required : A.requiredWork(s, p);
  const rate = devRate(eng, s.company.skill);
  const remaining = Math.max(0, required - p.dev.done);
  // How much sooner the car would be ready with more engineers (they join all projects in development).
  const weeksNow = Math.ceil(remaining / Math.max(0.1, rate));
  const yf = yearFloat(s.week);
  const faster = [3, 6, 12]
    .map((n) => ({ n, weeks: Math.ceil(remaining / Math.max(0.1, devRate((s.company.engineers + n) / (others + 1), s.company.skill))) }))
    .find((o) => o.weeks <= weeksNow * 0.75);
  const done = developing && p.dev.done >= p.dev.required;
  const progress = pct(required > 0 ? p.dev.done / required : 0, 0);
  const bonus = A.projectedBonus(s, p);
  const polish = bonus.reliability - (s.company.skill - 50) * 0.08;
  const paused = store.speed === 0;
  const missing = developing ? [] : unknownTech(s, p.design);
  // Said next to the button that locks the design: what most of the class has and this car would not.
  const behind = developing ? [] : classGap(s, { ...p.design, knowhow: knownKnowhow(s) }, p.segment, yf).items;
  const team = others
    ? t('{n} mühendis {projects} projeye bölünüyor (bu projede ~{share})', { n: s.company.engineers, projects: others + 1, share: dec(eng, 1) })
    : t('{n} mühendisin hepsi bu projede', { n: s.company.engineers });

  return (
    <div className={`dev-bar ${done ? 'is-done' : ''}`}>
      <div className="dev-bar-text">
        {!developing ? (
          <>
            {tx('<b>Geliştirme:</b> tahmini <b>~{n} hafta</b> · {team}', { n: Math.ceil(remaining / Math.max(0.1, rate)), team })}
            {missing.length ? (
              <span className="small tone-bad">
                {t('Tasarımda henüz araştırılmamış teknoloji var: {tech}. Ar-Ge’de araştır ya da tasarımdan çıkar.', { tech: missing.map((x) => t(x)).join(', ') })}
              </span>
            ) : (
              <span className="muted small">{t('Aracı tasarla, mühendislik odağını seç, sonra başlat. Başlayınca tasarım kilitlenir; odak her zaman değişebilir.')}</span>
            )}
            {behind.length > 0 && (
              <span className="small tone-warn">{t('Sınıftaki arabaların çoğunda olan {list} bu tasarımda yok: aşağıdaki listeden ekle ya da araştır.', { list: gapNames(behind) })}</span>
            )}
          </>
        ) : done ? (
          <>
            {tx('<b>Geliştirme bitti.</b> Zaman akarsa araç cilalanmaya devam eder (güvenilirlik şu an +{v}, en fazla %160’a kadar).', {
              v: dec(Math.max(0, polish), 1),
            })}
          </>
        ) : (
          <>
            {tx('<b>Geliştirme {pct}</b> · kalan ~{n} hafta · {team}', { pct: progress, n: Math.ceil(remaining / Math.max(0.1, rate)), team })}
            <span className="muted small">{t('Her hafta odak alanlarına puan birikir.')}</span>
          </>
        )}
      </div>
      {!done && (
        <div className="dev-bar-hire small">
          <span>
            <b>{t('Ekip: {n} mühendis.', { n: s.company.engineers })}</b>{' '}
            {faster && weeksNow >= 8 ? (
              <>
                {t('+{n} mühendisle ~{weeks} hafta ({now} yerine); maaşları yılda ~{salaries}.', {
                  n: faster.n,
                  weeks: faster.weeks,
                  now: weeksNow,
                  salaries: money(faster.n * engineerSalary(yf) * 52),
                })}
              </>
            ) : (
              <>{t('Daha çok mühendis geliştirmeyi hızlandırır; bir arabada bir düzineden fazlası orantılı hızlandırmaz.')}</>
            )}
          </span>
          <span className="dev-bar-hire-btns">
            <Button small disabled={s.company.cash < 40 * costIndex(yf)} onClick={() => store.try((st) => A.hireEngineers(st, 1), t('{n} mühendis işe alındı', { n: 1 }))}>
              {t('+1 mühendis al')}
            </Button>
            <Button
              small
              kind={faster && weeksNow >= 8 ? 'primary' : undefined}
              disabled={s.company.cash < (faster?.n ?? 5) * 40 * costIndex(yf)}
              onClick={() => store.try((st) => A.hireEngineers(st, faster?.n ?? 5), t('{n} mühendis işe alındı', { n: faster?.n ?? 5 }))}
            >
              +{faster?.n ?? 5}
            </Button>
          </span>
        </div>
      )}
      {!done && <BudgetLine b={launchBudget(s, p)} />}
      {developing && (
        <div className="dev-bar-progress">
          <Progress value={Math.min(p.dev.done, required * 1.6)} max={done ? required * 1.6 : required} tone={done ? 'good' : 'accent'} label={progress} />
        </div>
      )}
      <div className="dev-bar-actions">
        {!developing ? (
          <Button
            kind="primary"
            disabled={missing.length > 0}
            onClick={async () => {
              // A project the company cannot see through to launch deserves a second thought.
              const b = launchBudget(s, p);
              if (budgetVerdict(b) === 'short') {
                const go = await store.ask({
                  title: t('Bu proje kasayı aşıyor'),
                  body: t(
                    'Lansmana kadar ~{need} gerekiyor; kasa {cash} ve banka kredisi {credit} birlikte yetmiyor. Kalıp parası bittiğinde araba satışa çıkamaz. Daha küçük ya da ucuz bir tasarım, kısa bir test planı ya da önce satıştaki arabalardan para kazanmak daha güvenli.',
                    { need: money(Math.max(0, b.need)), cash: money(b.cash), credit: money(b.creditRoom) },
                  ),
                  confirm: t('Yine de başlat'),
                  danger: true,
                });
                if (!go) return;
              }
              store.try((st) => A.beginDevelopment(st, p.id), t('Geliştirme başladı'));
            }}
          >
            {t('Geliştirmeyi başlat')}
          </Button>
        ) : done ? (
          <Button kind="primary" onClick={() => store.try((st) => A.finishDevelopment(st, p.id))}>
            {t('Prototipleri yap, teste geç')}
          </Button>
        ) : paused ? (
          <Button kind="primary" onClick={() => store.setSpeed(store.lastSpeed)}>
            <Icon name="play" /> {t('Zamanı başlat')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * How the engineers split their time. While development runs, points pop out
 * of each focus area like in Game Dev Tycoon.
 */
export function FocusPanel({ project: p }: { project: Project }) {
  const s = useGameState();
  const bonus = A.projectedBonus(s, p);

  // Point bubbles: compare with the previous render's points.
  const last = useRef({ ...p.dev.points });
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const nextId = useRef(1);
  useEffect(() => {
    const fresh: Bubble[] = [];
    for (const k of FOCUS_KEYS) {
      const delta = p.dev.points[k] - last.current[k];
      if (delta > 0.05) fresh.push({ id: nextId.current++, key: k, text: `+${Math.max(1, Math.round(delta * 10))}` });
    }
    last.current = { ...p.dev.points };
    if (!fresh.length) return;
    setBubbles((b) => [...b.slice(-20), ...fresh]);
    const ids = new Set(fresh.map((b) => b.id));
    const timer = setTimeout(() => setBubbles((b) => b.filter((x) => !ids.has(x.id))), 1400);
    return () => clearTimeout(timer);
  }, [p.dev.points.performance, p.dev.points.efficiency, p.dev.points.comfort, p.dev.points.handling, p.dev.points.safety, p.dev.points.practicality, p.dev.points.cost, p.dev.points.quality]);

  const locked = p.dev.locked ?? [];
  // Keep the total at 100%: the unlocked sliders make room, the locked ones stay put.
  const setFocus = (k: FocusKey, v: number) => store.act((st) => A.setFocus(st, p.id, A.refocus(p.dev.focus, locked, k, v)));
  const effect: Record<FocusKey, string> = {
    performance: t('Güç +{pct}', { pct: pct(bonus.powerMult - 1, 1) }),
    efficiency: t('Tüketim −{pct}', { pct: pct(1 - bonus.fuelMult, 1) }),
    comfort: t('Konfor +{v}', { v: dec(bonus.comfort, 1) }),
    handling: t('Yol tutuş +{v}', { v: dec(bonus.handling ?? 0, 1) }),
    safety: t('Güvenlik +{v}', { v: dec(bonus.safety, 1) }),
    practicality: t('Pratiklik +{v}', { v: dec(bonus.practicality ?? 0, 1) }),
    cost: t('Maliyet −{pct}', { pct: pct(1 - bonus.costMult, 1) }),
    quality: t('Gizli kusur −{pct}', { pct: pct(1 - (bonus.defectMult ?? 1), 0) }),
  };

  return (
    <section className="focus-panel" aria-label={t('Mühendislik odağı')}>
      <div className="focus-head">
        <div>
          <h3>{t('Mühendislik odağı')}</h3>
          <p className="muted small">
            {t(
              'Mühendislerin zamanını alanlara böl (toplam %100). Her kartın altındaki değer, geliştirme bu dağılımla biterse aracın kazanacağı iyileştirme; sağdaki tahmin de buna göre. Neye ağırlık vereceğin senin fikrin: bu araba kimin için?',
            )}
          </p>
        </div>
      </div>
      <div className="preset-chips" role="group" aria-label={t('Hazır odaklar')}>
        {FOCUS_PRESETS.map((x) => (
          <button
            key={x.id}
            type="button"
            className={`chip ${matchingPreset(p.dev.focus) === x.id ? 'is-on' : ''}`}
            title={t(x.desc)}
            onClick={() =>
              store.act((st) => {
                for (const k of locked) A.toggleFocusLock(st, p.id, k);
                A.setFocus(st, p.id, presetFocus(x.id));
              })
            }
          >
            {t(x.name)}
          </button>
        ))}
      </div>
      <div className="focus-bar" aria-hidden>
        {FOCUS_KEYS.map((k) => (
          <span key={k} className={`focus-seg fc-${k}`} style={{ width: `${p.dev.focus[k] * 100}%` }} title={`${t(FOCUS_NAMES[k])} ${pct(p.dev.focus[k], 0)}`} />
        ))}
      </div>
      <div className="focus-grid">
        {FOCUS_KEYS.map((k) => (
          <div key={k} className={`focus-card fc-${k} ${locked.includes(k) ? 'is-locked' : ''}`}>
            <Slider
              label={
                <>
                  <span className="focus-dot" aria-hidden /> {t(FOCUS_NAMES[k])}
                  <button
                    type="button"
                    className="focus-lock"
                    aria-pressed={locked.includes(k)}
                    title={locked.includes(k) ? t('Kilidi aç') : t('Bu yüzdeyi kilitle: diğer kaydırıcılar onu değiştirmez')}
                    onClick={() => store.act((st) => A.toggleFocusLock(st, p.id, k))}
                  >
                    <Icon name={locked.includes(k) ? 'lock' : 'unlock'} />
                  </button>
                </>
              }
              disabled={locked.includes(k)}
              value={Math.round(p.dev.focus[k] * 100)}
              min={0}
              max={100}
              onChange={(v) => setFocus(k, v / 100)}
              format={(v) => pct(v / 100, 0)}
            />
            <div className="focus-foot">
              <span className="focus-effect">
                {effect[k]}
                <span className="bubbles" aria-hidden>
                  {bubbles
                    .filter((b) => b.key === k)
                    .map((b) => (
                      <span key={b.id} className={`bubble bubble-${k}`}>
                        {b.text}
                      </span>
                    ))}
                </span>
              </span>
              <span className="muted small">{t(FOCUS_HINTS[k])}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
