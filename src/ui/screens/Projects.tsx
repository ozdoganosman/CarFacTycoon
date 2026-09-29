import { useMemo, useState } from 'react';
import { newProjectBudget } from '../../core/budget';
import { BudgetLine } from '../components/BudgetLine';
import { MARKETS } from '../../data/markets';
import * as A from '../../core/actions';
import { FOCUS_PRESETS, presetFocus } from '../../core/development';
import { availableSegments, gates } from '../../core/game';
import { referencePrice, weeklySegmentDemand } from '../../core/market';
import { yearFloat } from '../../core/time';
import { SEGMENTS, segmentDef } from '../../data/segments';
import type { GameState, Project, ProjectPhase, SegmentId } from '../../core/types';
import { msg, t } from '../../i18n';
import { store, useGameState } from '../store';
import { money, num } from '../format';
import { inYear } from '../format';
import { tx } from '../i18n';
import { Badge, Button, Choice, Empty, Panel, Progress } from '../components/ui';

/** Marked with msg(): show with t(PHASE_LABEL[phase]). */
export const PHASE_LABEL: Record<ProjectPhase, string> = {
  design: msg('Tasarım'),
  development: msg('Geliştirme'),
  testing: msg('Test'),
  production: msg('Üretim hazırlığı'),
  ready: msg('Lansmana hazır'),
};

export function projectProgress(s: GameState, p: Project): number {
  switch (p.phase) {
    case 'design':
      return 0.05;
    case 'development':
      return 0.1 + 0.4 * Math.min(1, p.dev.done / Math.max(1, p.dev.required));
    case 'testing': {
      const planned = Object.values(p.tests).reduce((a, t) => a + t.planned, 0);
      const done = Object.values(p.tests).reduce((a, t) => a + t.done, 0);
      return 0.5 + 0.25 * (planned ? done / planned : 1);
    }
    case 'production':
      if (p.productionReadyWeek === undefined) return 0.75;
      return 0.75 + 0.25 * Math.min(1, 1 - (p.productionReadyWeek - s.week) / 12);
    case 'ready':
      return 1;
  }
}

function NewProject({ onDone }: { onDone: () => void }) {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const segs = availableSegments(s);
  const [segment, setSegment] = useState<SegmentId>(segs.includes('family') ? 'family' : segs[0]);
  const [name, setName] = useState(`Model ${String.fromCharCode(65 + (s.company.modelsLaunched % 26))}`);
  const [platformId, setPlatformId] = useState('');
  const [engineId, setEngineId] = useState('');
  const [replaces, setReplaces] = useState('');
  // A sensible starting point for the class; the player decides.
  const PRESET_FOR: Record<SegmentId, string> = { city: 'people', family: 'family', sport: 'driver', luxury: 'luxury', pickup: 'work', suv: 'family' };
  const [preset, setPreset] = useState(PRESET_FOR[segs.includes('family') ? 'family' : segs[0]]);
  const presetDef = FOCUS_PRESETS.find((x) => x.id === preset);
  const g = gates(s);
  const sameSeg = s.models.filter((m) => m.status === 'active' && m.segment === segment);
  // What such a project would cost before launch, worked out on a copy of the game.
  const budget = useMemo(() => newProjectBudget(s, segment, replaces || undefined), [segment, replaces, s.week]); // eslint-disable-line react-hooks/exhaustive-deps

  const pickSegment = (id: SegmentId) => {
    setSegment(id);
    setReplaces('');
    setPreset(PRESET_FOR[id]);
  };

  return (
    <Panel title={t('Yeni proje')}>
      <div className="form-grid">
        <label className="field">
          <span>{t('Model adı')}</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>{t('Segment')}</span>
        <Choice
          value={segment}
          onChange={pickSegment}
          options={SEGMENTS.map((seg) => {
            const open = segs.includes(seg.id);
            const demand = open ? weeklySegmentDemand(s.company.hq, seg.id, yf) * 52 : 0;
            return {
              value: seg.id,
              disabled: !open,
              label: (
                <>
                  {seg.icon} {t(seg.name)}
                </>
              ),
              sub: open ? (
                <>
                  {t(seg.desc)}
                  <br />
                  <span className="muted">
                    {t('Segment ({market}): {count} araç/yıl · tipik fiyat {price}', {
                      market: t(MARKETS.find((x) => x.id === s.company.hq)!.name),
                      count: num(demand),
                      price: money(referencePrice(s.company.hq, seg.id, yf)),
                    })}
                  </span>
                </>
              ) : (
                t('{year} açılır', { year: inYear(seg.year) })
              ),
            };
          })}
        />
      </div>
      {g.platforms ? (
        <div className="form-grid">
          <label className="field">
            <span>{t('Platform (şasi + boyut + süspansiyon)')}</span>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              <option value="">{t('Yeni platform tasarla')}</option>
              {s.platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {t('{name} ({n} aktif model)', { name: p.name, n: s.models.filter((m) => m.status === 'active' && m.platformId === p.id).length })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('Motor')}</span>
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              <option value="">{t('Yeni motor tasarla')}</option>
              {s.engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="muted small">{t('Platform ve motor paylaşımı üçüncü modelinle açılacak.')}</p>
      )}
      {sameSeg.length > 0 && (
        <label className="field">
          <span>{t('Bu proje bir modelin yeni kuşağı mı?')}</span>
          <select value={replaces} onChange={(e) => setReplaces(e.target.value)}>
            <option value="">{t('Hayır, yeni bir model')}</option>
            {sameSeg.map((m) => (
              <option key={m.id} value={m.id}>
                {t('{name} yerine geçsin (hatlarını devralır)', { name: m.name })}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="field">
        <span>
          {t('Mühendislik odağı: mühendisler zamanlarını neye harcasın?')}{' '}
          <span className="muted small">{t('(tasarımda ve geliştirmede kaydırıcılarla ince ayar yapılır)')}</span>
        </span>
        <div className="preset-chips" role="radiogroup" aria-label={t('Mühendislik odağı')}>
          {FOCUS_PRESETS.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={preset === x.id} className={`chip ${preset === x.id ? 'is-on' : ''}`} title={t(x.desc)} onClick={() => setPreset(x.id)}>
              {t(x.name)}
            </button>
          ))}
        </div>
        <span className="muted small">{presetDef && t(presetDef.desc)}</span>
      </div>
      {budget && (
        <>
          <p className="muted small">{t('Şirketin son arabasına benzer bir tasarımla ve varsayılan test planıyla bu proje:')}</p>
          <BudgetLine b={budget} />
        </>
      )}
      <div className="row-end">
        <Button kind="ghost" onClick={onDone}>
          {t('Vazgeç')}
        </Button>
        <Button
          kind="primary"
          onClick={() => {
            const r = store.act((st) =>
              A.startProject(st, { name, segment, targetPrice: Math.round(referencePrice(s.company.hq, segment, yf)), platformId: platformId || undefined, engineRefId: engineId || undefined, replacesModelId: replaces || undefined, focus: presetFocus(preset) }),
            );
            if (r && r.ok) {
              onDone();
              store.go({ id: 'project', projectId: r.id });
            } else if (r) store.showToast(r.error, 'bad');
          }}
        >
          {t('Tasarıma başla')}
        </Button>
      </div>
    </Panel>
  );
}

export function Projects() {
  const s = useGameState();
  const [creating, setCreating] = useState(s.projects.length === 0 && s.models.length === 0);
  return (
    <div className="screen">
      <div className="screen-head">
        <h1>{t('Projeler')}</h1>
        {!creating && (
          <Button kind="primary" onClick={() => setCreating(true)}>
            + {t('Yeni proje')}
          </Button>
        )}
      </div>
      {creating && <NewProject onDone={() => setCreating(false)} />}
      <Panel title={t('Devam eden projeler')}>
        {s.projects.length ? (
          <div className="card-list">
            {s.projects.map((p) => (
              <button key={p.id} type="button" className="card-item" onClick={() => store.go({ id: 'project', projectId: p.id })}>
                <div className="mini-top">
                  <b>{p.name}</b>
                  <Badge tone={p.phase === 'ready' ? 'good' : 'info'}>{t(PHASE_LABEL[p.phase])}</Badge>
                </div>
                <div className="muted small">
                  {segmentDef(p.segment).icon} {t(segmentDef(p.segment).name)}
                  {p.kind === 'facelift' ? ` · ${t('makyaj')}` : p.replacesModelId ? ` · ${t('yeni kuşak')}` : ''}
                </div>
                <Progress value={projectProgress(s, p)} />
              </button>
            ))}
          </div>
        ) : (
          <Empty>{t('Devam eden proje yok.')}</Empty>
        )}
      </Panel>
      <Panel title={t('Nasıl çalışır?')}>
        <ol className="steps">
          <li>
            {tx(
              '<b>Tasarım ve geliştirme:</b> Aracı kimin için yaptığına sen karar ver: modülleri seç, mühendislerini ata, odağı dağıt (performans, verim, konfor, güvenlik, maliyet, kalite). Odak aracı gerçekten değiştirir.',
            )}
          </li>
          <li>
            {tx('<b>Test:</b> Dinamometre, yol, dayanıklılık ve (1934’ten sonra) çarpışma testleri kusurları bulur ve aracı ayarlar. Kısa kesersen kusurlar sahada patlar.')}
          </li>
          <li>{tx('<b>Üretim:</b> Tedarikçileri ve hattı seç, kalıplar hazırlanır.')}</li>
          <li>{tx('<b>Lansman:</b> Fiyatı ve pazarları belirle. Dergiler puan verir, alıcılar yorum yapar.')}</li>
        </ol>
      </Panel>
    </div>
  );
}
