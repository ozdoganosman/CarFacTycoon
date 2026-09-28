import { useEffect, useRef, useState } from 'react';
import * as A from '../../core/actions';
import { FOCUS_HINTS, FOCUS_KEYS, FOCUS_NAMES, devRate, evenFocus } from '../../core/development';
import { costIndex, engineerSalary } from '../../data/economy';
import { yearFloat } from '../../core/time';
import { unknownTech } from '../../core/research';
import { budgetVerdict, launchBudget } from '../../core/budget';
import { money } from '../format';
import { BudgetLine } from '../components/BudgetLine';
import type { FocusKey, Project } from '../../core/types';
import { store, useGameState } from '../store';
import { Button, Progress, Slider } from '../components/ui';

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
  const pct = required > 0 ? Math.round((p.dev.done / required) * 100) : 0;
  const bonus = A.projectedBonus(s, p);
  const polish = bonus.reliability - (s.company.skill - 50) * 0.08;
  const paused = store.speed === 0;
  const missing = developing ? [] : unknownTech(s, p.design);
  const team = others ? `${s.company.engineers} mühendis ${others + 1} projeye bölünüyor (bu projede ~${eng.toFixed(1)})` : `${s.company.engineers} mühendisin hepsi bu projede`;

  return (
    <div className={`dev-bar ${done ? 'is-done' : ''}`}>
      <div className="dev-bar-text">
        {!developing ? (
          <>
            <b>Geliştirme:</b> tahmini <b>~{Math.ceil(remaining / Math.max(0.1, rate))} hafta</b> · {team}
            {missing.length ? (
              <span className="small tone-bad">Tasarımda henüz araştırılmamış teknoloji var: {missing.join(', ')}. Ar-Ge’de araştır ya da tasarımdan çıkar.</span>
            ) : (
              <span className="muted small">Aracı tasarla, mühendislik odağını seç, sonra başlat. Başlayınca tasarım kilitlenir; odak her zaman değişebilir.</span>
            )}
          </>
        ) : done ? (
          <>
            <b>Geliştirme bitti.</b> Zaman akarsa araç cilalanmaya devam eder (güvenilirlik şu an +{Math.max(0, polish).toFixed(1)}, en fazla %160’a kadar).
          </>
        ) : (
          <>
            <b>Geliştirme %{pct}</b> · kalan ~{Math.ceil(remaining / Math.max(0.1, rate))} hafta · {team}
            <span className="muted small">Her hafta odak alanlarına puan birikir.</span>
          </>
        )}
      </div>
      {!done && (
        <div className="dev-bar-hire small">
          <span>
            <b>Ekip: {s.company.engineers} mühendis.</b>{' '}
            {faster && weeksNow >= 8 ? (
              <>
                +{faster.n} mühendisle ~{faster.weeks} hafta ({weeksNow} yerine); maaşları yılda ~{money(faster.n * engineerSalary(yf) * 52)}.
              </>
            ) : (
              <>Daha çok mühendis geliştirmeyi hızlandırır; bir arabada bir düzineden fazlası orantılı hızlandırmaz.</>
            )}
          </span>
          <span className="dev-bar-hire-btns">
            <Button small disabled={s.company.cash < 40 * costIndex(yf)} onClick={() => store.try((st) => A.hireEngineers(st, 1), '1 mühendis işe alındı')}>
              +1 mühendis al
            </Button>
            <Button
              small
              kind={faster && weeksNow >= 8 ? 'primary' : undefined}
              disabled={s.company.cash < (faster?.n ?? 5) * 40 * costIndex(yf)}
              onClick={() => store.try((st) => A.hireEngineers(st, faster?.n ?? 5), `${faster?.n ?? 5} mühendis işe alındı`)}
            >
              +{faster?.n ?? 5}
            </Button>
          </span>
        </div>
      )}
      {!done && <BudgetLine b={launchBudget(s, p)} />}
      {developing && (
        <div className="dev-bar-progress">
          <Progress value={Math.min(p.dev.done, required * 1.6)} max={done ? required * 1.6 : required} tone={done ? 'good' : 'accent'} label={`%${pct}`} />
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
                  title: 'Bu proje kasayı aşıyor',
                  body: `Lansmana kadar ~${money(Math.max(0, b.need))} gerekiyor; kasa ${money(b.cash)} ve banka kredisi ${money(b.creditRoom)} birlikte yetmiyor. Kalıp parası bittiğinde araba satışa çıkamaz. Daha küçük ya da ucuz bir tasarım, kısa bir test planı ya da önce satıştaki arabalardan para kazanmak daha güvenli.`,
                  confirm: 'Yine de başlat',
                  danger: true,
                });
                if (!go) return;
              }
              store.try((st) => A.beginDevelopment(st, p.id), 'Geliştirme başladı');
            }}
          >
            Geliştirmeyi başlat
          </Button>
        ) : done ? (
          <Button kind="primary" onClick={() => store.try((st) => A.finishDevelopment(st, p.id))}>
            Prototipleri yap, teste geç
          </Button>
        ) : paused ? (
          <Button kind="primary" onClick={() => store.setSpeed(store.lastSpeed)}>
            ▶ Zamanı başlat
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
    const t = setTimeout(() => setBubbles((b) => b.filter((x) => !ids.has(x.id))), 1400);
    return () => clearTimeout(t);
  }, [p.dev.points.performance, p.dev.points.efficiency, p.dev.points.comfort, p.dev.points.handling, p.dev.points.safety, p.dev.points.practicality, p.dev.points.cost, p.dev.points.quality]);

  const locked = p.dev.locked ?? [];
  // Keep the total at 100%: the unlocked sliders make room, the locked ones stay put.
  const setFocus = (k: FocusKey, v: number) => store.act((st) => A.setFocus(st, p.id, A.refocus(p.dev.focus, locked, k, v)));
  const effect: Record<FocusKey, string> = {
    performance: `Güç +%${((bonus.powerMult - 1) * 100).toFixed(1)}`,
    efficiency: `Tüketim −%${((1 - bonus.fuelMult) * 100).toFixed(1)}`,
    comfort: `Konfor +${bonus.comfort.toFixed(1)}`,
    handling: `Yol tutuş +${(bonus.handling ?? 0).toFixed(1)}`,
    safety: `Güvenlik +${bonus.safety.toFixed(1)}`,
    practicality: `Pratiklik +${(bonus.practicality ?? 0).toFixed(1)}`,
    cost: `Maliyet −%${((1 - bonus.costMult) * 100).toFixed(1)}`,
    quality: `Gizli kusur −%${((1 - (bonus.defectMult ?? 1)) * 100).toFixed(0)}`,
  };

  return (
    <section className="focus-panel" aria-label="Mühendislik odağı">
      <div className="focus-head">
        <div>
          <h3>Mühendislik odağı</h3>
          <p className="muted small">
            Mühendislerin zamanını alanlara böl (toplam %100). Her kartın altındaki değer, geliştirme bu dağılımla biterse aracın kazanacağı iyileştirme; sağdaki tahmin de
            buna göre. Neye ağırlık vereceğin senin fikrin: bu araba kimin için?
          </p>
        </div>
        <Button
          small
          kind="ghost"
          onClick={() =>
            store.act((st) => {
              A.setFocus(st, p.id, evenFocus());
              for (const k of locked) A.toggleFocusLock(st, p.id, k);
            })
          }
        >
          Eşit dağıt
        </Button>
      </div>
      <div className="focus-bar" aria-hidden>
        {FOCUS_KEYS.map((k) => (
          <span key={k} className={`focus-seg fc-${k}`} style={{ width: `${p.dev.focus[k] * 100}%` }} title={`${FOCUS_NAMES[k]} %${Math.round(p.dev.focus[k] * 100)}`} />
        ))}
      </div>
      <div className="focus-grid">
        {FOCUS_KEYS.map((k) => (
          <div key={k} className={`focus-card fc-${k} ${locked.includes(k) ? 'is-locked' : ''}`}>
            <Slider
              label={
                <>
                  <span className="focus-dot" aria-hidden /> {FOCUS_NAMES[k]}
                  <button
                    type="button"
                    className="focus-lock"
                    aria-pressed={locked.includes(k)}
                    title={locked.includes(k) ? 'Kilidi aç' : 'Bu yüzdeyi kilitle: diğer kaydırıcılar onu değiştirmez'}
                    onClick={() => store.act((st) => A.toggleFocusLock(st, p.id, k))}
                  >
                    {locked.includes(k) ? '🔒' : '🔓'}
                  </button>
                </>
              }
              disabled={locked.includes(k)}
              value={Math.round(p.dev.focus[k] * 100)}
              min={0}
              max={100}
              onChange={(v) => setFocus(k, v / 100)}
              format={(v) => `%${v}`}
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
              <span className="muted small">{FOCUS_HINTS[k]}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
