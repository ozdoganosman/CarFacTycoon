import { useEffect, useRef, useState } from 'react';
import * as A from '../../core/actions';
import { FOCUS_HINTS, FOCUS_KEYS, FOCUS_NAMES, productivity } from '../../core/development';
import { engineersBusy } from '../../core/game';
import type { FocusKey, Project } from '../../core/types';
import { store, useGameState } from '../store';
import { Button, Panel, Progress, Slider } from '../components/ui';

interface Bubble {
  id: number;
  key: FocusKey;
  text: string;
}

/**
 * Engineering team, focus split and progress for the combined
 * "design and development" step. While development runs, points pop out of
 * each focus area like in Game Dev Tycoon.
 */
export function DevPanel({ project: p }: { project: Project }) {
  const s = useGameState();
  const developing = p.phase === 'development';
  const busyElsewhere = engineersBusy(s) - (developing ? p.engineers : 0);
  const free = Math.max(0, s.company.engineers - busyElsewhere);
  const eng = Math.max(1, Math.min(p.engineers, Math.max(1, free)));
  const required = developing ? p.dev.required : A.requiredWork(s, p);
  const rate = eng * productivity(s.company.skill);
  const remaining = Math.max(0, required - p.dev.done);
  const done = developing && p.dev.done >= p.dev.required;
  const pct = required > 0 ? Math.round((p.dev.done / required) * 100) : 0;
  const bonus = A.projectedBonus(s, p);
  const polish = bonus.reliability - (s.company.skill - 50) * 0.08;
  const paused = store.speed === 0;

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
  }, [p.dev.points.performance, p.dev.points.efficiency, p.dev.points.comfort, p.dev.points.safety, p.dev.points.cost]);

  const setFocus = (k: FocusKey, v: number) => {
    const others = FOCUS_KEYS.filter((x) => x !== k);
    const rest = others.reduce((a, x) => a + p.dev.focus[x], 0);
    const next = { ...p.dev.focus, [k]: v };
    // Keep the total at 100%: scale the other sliders.
    for (const x of others) next[x] = rest > 0 ? (p.dev.focus[x] / rest) * (1 - v) : (1 - v) / others.length;
    store.act((st) => A.setFocus(st, p.id, next));
  };
  const effect: Record<FocusKey, string> = {
    performance: `Güç +%${((bonus.powerMult - 1) * 100).toFixed(1)}`,
    efficiency: `Tüketim −%${((1 - bonus.fuelMult) * 100).toFixed(1)}`,
    comfort: `Konfor +${bonus.comfort.toFixed(1)}`,
    safety: `Güvenlik +${bonus.safety.toFixed(1)}`,
    cost: `Maliyet −%${((1 - bonus.costMult) * 100).toFixed(1)}`,
  };

  return (
    <Panel title={developing ? 'Geliştirme sürüyor' : 'Mühendislik ekibi ve odak'} className="dev-panel">
      <div className="howto">
        {!developing ? (
          <p>
            <b>Ne yapmalıyım?</b> Yukarıda aracı tasarla, burada mühendislerin zamanını alanlara böl ve geliştirmeyi başlat. Başladıktan sonra tasarım kilitlenir; odağı
            ise istediğin zaman değiştirebilirsin.
          </p>
        ) : done ? (
          <p>
            <b>Geliştirme bitti.</b> Teste geçebilirsin. Zamanı biraz daha akıtırsan araç cilalanır ve güvenilirliği artar (şu an +{Math.max(0, polish).toFixed(1)}, en fazla
            %160’a kadar).
          </p>
        ) : (
          <p>
            <b>Mühendisler çalışıyor.</b> Her hafta odak alanlarına puan birikir. Çubuk %100 olunca teste geçebilirsin.
          </p>
        )}
        {developing && paused && (
          <Button kind="primary" onClick={() => store.setSpeed(store.lastSpeed)}>
            ▶ Zamanı başlat
          </Button>
        )}
      </div>

      {developing && <Progress value={Math.min(p.dev.done, required * 1.6)} max={required * 1.6} label={`%${pct}`} />}

      <div className="dev-top">
        <Slider
          label="Mühendis sayısı"
          value={eng}
          min={1}
          max={Math.max(1, free)}
          onChange={(v) => store.act((st) => A.setProjectEngineers(st, p.id, v))}
          format={(v) => `${v} / ${s.company.engineers}`}
          disabled={free < 1}
          hint="Daha çok mühendis daha hızlı bitirir. Finans ekranından işe alabilirsin."
        />
        <div className="footer-info">
          <span className="muted small">{developing ? 'Kalan süre' : 'Tahmini geliştirme süresi'}</span>
          <b>{free < 1 && !developing ? 'Boşta mühendis yok' : done ? 'Bitti' : `~${Math.ceil(remaining / Math.max(0.1, rate))} hafta`}</b>
          <span className="muted small">İş yükü: {Math.round(required)} mühendis-hafta</span>
        </div>
      </div>

      <h4>Mühendislik odağı</h4>
      <p className="muted small">
        Toplam her zaman %100. Sağdaki değerler, geliştirme bu dağılımla biterse aracın kazanacağı iyileştirmeler. Neye ağırlık vereceğin senin fikrin: bu araba kimin için?
      </p>
      {FOCUS_KEYS.map((k) => (
        <div key={k} className="focus-row">
          <Slider
            label={
              <>
                {FOCUS_NAMES[k]} <span className="muted small">({FOCUS_HINTS[k]})</span>
              </>
            }
            value={Math.round(p.dev.focus[k] * 100)}
            min={0}
            max={100}
            onChange={(v) => setFocus(k, v / 100)}
            format={(v) => `%${v}`}
          />
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
        </div>
      ))}

      <div className="row-end">
        {!developing ? (
          <Button kind="primary" disabled={free < 1} onClick={() => store.try((st) => A.beginDevelopment(st, p.id), 'Geliştirme başladı')}>
            Geliştirmeyi başlat
          </Button>
        ) : (
          <Button kind="primary" disabled={!done} onClick={() => store.try((st) => A.finishDevelopment(st, p.id))}>
            {done ? 'Prototipleri yap, teste geç' : `Geliştirme sürüyor (%${pct})`}
          </Button>
        )}
      </div>
    </Panel>
  );
}
