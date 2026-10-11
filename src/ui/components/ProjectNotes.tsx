import { useEffect, useState, type ReactNode } from 'react';
import * as A from '../../core/actions';
import { suggestedLine } from '../../core/factory';
import type { GameState, ModalItem, Project } from '../../core/types';
import { toolingDef } from '../../data/tooling';
import { lower, t } from '../../i18n';
import { tx } from '../i18n';
import { money, num, pct } from '../format';
import { store, useGameState } from '../store';
import { LaunchReportView } from './LaunchShow';
import { Button } from './ui';
import { Icon } from './Icon';

// Corner notes for the steps of a project once the company has brought out two cars (autopilot.ts):
// a finished step, with the next one a tap away, and the first month's report of a new car. They do
// not stop the clock; a note on what a project did by itself tucks itself away after a while.

type PhaseNote = Extract<ModalItem, { kind: 'phase' }>;
type ReportNote = Extract<ModalItem, { kind: 'launchReport' }>;

const sameNote = (a: ModalItem, b: ModalItem) =>
  a.kind === b.kind && ((a.kind === 'phase' && b.kind === 'phase' && a.projectId === b.projectId && a.phase === b.phase) || (a.kind === 'launchReport' && b.kind === 'launchReport' && a.modelId === b.modelId));

const drop = (m: ModalItem) => store.act((st) => void (st.modals = st.modals.filter((x) => !sameNote(x, m))));

export function ProjectNotes() {
  const s = useGameState();
  const notes = s.modals.filter((m): m is PhaseNote | ReportNote => (m.kind === 'phase' || m.kind === 'launchReport') && !!m.quiet);
  return (
    <>
      {notes.map((m) =>
        m.kind === 'phase' ? <StepNote key={`p${m.projectId}${m.phase}`} s={s} m={m} /> : <ReportCard key={`r${m.modelId}`} s={s} m={m} />,
      )}
    </>
  );
}

function useTuckAway(m: ModalItem, ms: number, on: boolean) {
  useEffect(() => {
    if (!on) return;
    const timer = setTimeout(() => drop(m), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
}

function NoteShell({ icon, title, onClose, children }: { icon: 'projects' | 'factory' | 'chart'; title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <aside className="research-card step-note" aria-live="polite">
      <div className="year-card-head">
        <b>
          <Icon name={icon} /> {title}
        </b>
        <button type="button" className="year-card-x" aria-label={t('Kapat')} onClick={onClose}>
          ×
        </button>
      </div>
      {children}
    </aside>
  );
}

const look = (p: Project, m: ModalItem) => () => {
  drop(m);
  store.go({ id: 'project', projectId: p.id });
};

function StepNote({ s, m }: { s: GameState; m: PhaseNote }) {
  const p = s.projects.find((x) => x.id === m.projectId);
  useTuckAway(m, 20000, !!m.auto);
  if (!p) return null;
  if (m.auto) {
    const line = s.lines.find((l) => l.id === p.lineId);
    const left = Math.max(0, (p.productionReadyWeek ?? s.week) - s.week);
    return (
      <NoteShell icon={m.phase === 'development' ? 'projects' : 'factory'} title={m.phase === 'development' ? t('{name} teste geçti', { name: p.name }) : t('{name}: kalıplar sipariş edildi', { name: p.name })} onClose={() => drop(m)}>
        <p className="small">
          {m.phase === 'development'
            ? t('Prototipler yapıldı; testler planlandığı gibi sürüyor.')
            : p.kind === 'facelift'
              ? t('Makyaj kalıpları hazırlanıyor; {n} hafta sonra lansmana hazır.', { n: left })
              : tx('{line} · {tooling} · <b>{n} hafta</b> sonra lansmana hazır.', { line: line?.name ?? '', tooling: t(toolingDef(p.tooling).name), n: left })}
        </p>
        <Button kind="ghost" small onClick={look(p, m)}>
          {t('Projeye bak')}
        </Button>
      </NoteShell>
    );
  }
  if (m.phase === 'development') {
    return (
      <NoteShell icon="projects" title={t('{name}: geliştirme bitti', { name: p.name })} onClose={() => drop(m)}>
        <p className="small muted">{t('Mühendisler sen teste geçene kadar cilalamayı sürdürüyor.')}</p>
        <div className="step-note-actions">
          <Button kind="primary" small onClick={() => store.try((st) => A.finishDevelopment(st, p.id))}>
            {t('Teste geç')}
          </Button>
          <Button kind="ghost" small onClick={look(p, m)}>
            {t('Projeye bak')}
          </Button>
        </div>
      </NoteShell>
    );
  }
  // Tests done: order the dies for the natural line in one tap, when there is one and the money.
  const line = p.kind === 'facelift' ? undefined : suggestedLine(s, p);
  const tier = p.tooling ?? 'standard';
  const quote = line ? A.toolingQuote(s, p, line.id, tier) : undefined;
  const oneTap = p.kind === 'facelift' || (line && quote && s.company.cash >= quote.cost);
  return (
    <NoteShell icon="factory" title={t('{name}: test programı bitti', { name: p.name })} onClose={() => drop(m)}>
      <p className="small muted">
        {p.kind === 'facelift'
          ? t('Makyaj kalıpları arabanın hatlarında yenilenir.')
          : line && quote
            ? t('Sırada kalıplar var: {line}, {tooling}, {cost}.', { line: line.name, tooling: lower(t(toolingDef(tier).name)), cost: money(quote.cost) })
            : t('Sırada tedarikçiler ve üretim hattı var.')}
      </p>
      <div className="step-note-actions">
        {oneTap ? (
          <Button
            kind="primary"
            small
            onClick={() =>
              store.try((st) => {
                const r = A.finishTesting(st, p.id);
                return r.ok && line ? A.startTooling(st, p.id, line.id, tier) : r;
              })
            }
          >
            {p.kind === 'facelift' ? t('Makyajı üretime al') : t('Kalıpları sipariş et')}
          </Button>
        ) : (
          <Button
            kind="primary"
            small
            onClick={() => {
              store.keepPaused();
              drop(m);
              store.try((st) => A.finishTesting(st, p.id));
              store.go({ id: 'project', projectId: p.id });
            }}
          >
            {t('Üretim hazırlığına geç')}
          </Button>
        )}
        <Button kind="ghost" small onClick={look(p, m)}>
          {t('Projeye bak')}
        </Button>
      </div>
    </NoteShell>
  );
}

function ReportCard({ s, m }: { s: GameState; m: ReportNote }) {
  const [open, setOpen] = useState(false);
  useTuckAway(m, 25000, !open);
  const model = s.models.find((x) => x.id === m.modelId);
  if (!model) return null;
  const r = m.report;
  if (open) return <LaunchReportView s={s} modelId={m.modelId} report={r} onClose={() => drop(m)} />;
  return (
    <NoteShell icon="chart" title={t('İlk ay raporu: {name}', { name: model.name })} onClose={() => drop(m)}>
      <p className="small">
        {tx('{n} haftada <b>{count} araç</b> · segmentte {rank} · payı {share}', {
          n: r.weeks,
          count: num(r.sold),
          rank: r.rank > 0 ? t('{rank}.', { rank: r.rank }) : '—',
          share: pct(r.share),
        })}
      </p>
      <Button kind="ghost" small onClick={() => setOpen(true)}>
        {t('Raporu aç')}
      </Button>
    </NoteShell>
  );
}
