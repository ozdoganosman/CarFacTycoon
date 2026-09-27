import { useState } from 'react';
import { MARKETS } from '../../data/markets';
import * as A from '../../core/actions';
import { availableSegments, gates } from '../../core/game';
import { referencePrice, weeklySegmentDemand } from '../../core/market';
import { yearFloat } from '../../core/time';
import { SEGMENTS, segmentDef } from '../../data/segments';
import type { GameState, Project, ProjectPhase, SegmentId } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num } from '../format';
import { inYear } from '../format';
import { Badge, Button, Choice, Empty, Panel, Progress } from '../components/ui';

export const PHASE_LABEL: Record<ProjectPhase, string> = {
  design: 'Tasarım',
  development: 'Geliştirme',
  testing: 'Test',
  production: 'Üretim hazırlığı',
  ready: 'Lansmana hazır',
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
  const g = gates(s);
  const sameSeg = s.models.filter((m) => m.status === 'active' && m.segment === segment);

  const pickSegment = (id: SegmentId) => {
    setSegment(id);
    setReplaces('');
  };

  return (
    <Panel title="Yeni proje">
      <div className="form-grid">
        <label className="field">
          <span>Model adı</span>
          <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <div className="field">
        <span>Segment</span>
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
                  {seg.icon} {seg.name}
                </>
              ),
              sub: open ? (
                <>
                  {seg.desc}
                  <br />
                  <span className="muted">
                    Segment ({MARKETS.find((x) => x.id === s.company.hq)!.name}): {num(demand)} araç/yıl · tipik fiyat {money(referencePrice(s.company.hq, seg.id, yf))}
                  </span>
                </>
              ) : (
                `${inYear(seg.year)} açılır`
              ),
            };
          })}
        />
      </div>
      {g.platforms ? (
        <div className="form-grid">
          <label className="field">
            <span>Platform (şasi + boyut + süspansiyon)</span>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              <option value="">Yeni platform tasarla</option>
              {s.platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({s.models.filter((m) => m.status === 'active' && m.platformId === p.id).length} aktif model)
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Motor</span>
            <select value={engineId} onChange={(e) => setEngineId(e.target.value)}>
              <option value="">Yeni motor tasarla</option>
              {s.engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <p className="muted small">Platform ve motor paylaşımı üçüncü modelinle açılacak.</p>
      )}
      {sameSeg.length > 0 && (
        <label className="field">
          <span>Bu proje bir modelin yeni kuşağı mı?</span>
          <select value={replaces} onChange={(e) => setReplaces(e.target.value)}>
            <option value="">Hayır, yeni bir model</option>
            {sameSeg.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} yerine geçsin (hatlarını devralır)
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="row-end">
        <Button kind="ghost" onClick={onDone}>
          Vazgeç
        </Button>
        <Button
          kind="primary"
          onClick={() => {
            const r = store.act((st) =>
              A.startProject(st, { name, segment, targetPrice: Math.round(referencePrice(s.company.hq, segment, yf)), platformId: platformId || undefined, engineRefId: engineId || undefined, replacesModelId: replaces || undefined }),
            );
            if (r && r.ok) {
              onDone();
              store.go({ id: 'project', projectId: r.id });
            } else if (r) store.showToast(r.error, 'bad');
          }}
        >
          Tasarıma başla
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
        <h1>Projeler</h1>
        {!creating && (
          <Button kind="primary" onClick={() => setCreating(true)}>
            + Yeni proje
          </Button>
        )}
      </div>
      {creating && <NewProject onDone={() => setCreating(false)} />}
      <Panel title="Devam eden projeler">
        {s.projects.length ? (
          <div className="card-list">
            {s.projects.map((p) => (
              <button key={p.id} type="button" className="card-item" onClick={() => store.go({ id: 'project', projectId: p.id })}>
                <div className="mini-top">
                  <b>{p.name}</b>
                  <Badge tone={p.phase === 'ready' ? 'good' : 'info'}>{PHASE_LABEL[p.phase]}</Badge>
                </div>
                <div className="muted small">
                  {segmentDef(p.segment).icon} {segmentDef(p.segment).name}
                  {p.kind === 'facelift' ? ' · makyaj' : p.replacesModelId ? ' · yeni kuşak' : ''}
                </div>
                <Progress value={projectProgress(s, p)} />
              </button>
            ))}
          </div>
        ) : (
          <Empty>Devam eden proje yok.</Empty>
        )}
      </Panel>
      <Panel title="Nasıl çalışır?">
        <ol className="steps">
          <li>
            <b>Tasarım ve geliştirme:</b> Aracı kimin için yaptığına sen karar ver: modülleri seç, mühendislerini ata, odağı dağıt (performans, verim, konfor,
            güvenlik, maliyet, kalite). Odak aracı gerçekten değiştirir.
          </li>
          <li>
            <b>Test:</b> Dinamometre, yol, dayanıklılık ve (1934’ten sonra) çarpışma testleri kusurları bulur ve aracı ayarlar. Kısa kesersen kusurlar sahada patlar.
          </li>
          <li>
            <b>Üretim:</b> Tedarikçileri ve hattı seç, kalıplar hazırlanır.
          </li>
          <li>
            <b>Lansman:</b> Fiyatı ve pazarları belirle. Dergiler puan verir, alıcılar yorum yapar.
          </li>
        </ol>
      </Panel>
    </div>
  );
}
