import { engineersBusy, idleEngineers } from '../../core/game';
import { engineerSalary } from '../../data/economy';
import { lineReport } from '../../core/factory';
import { formatDate, formatShort, yearFloat, yearOf } from '../../core/time';
import { researchDefs, rivalAdoption, techState } from '../../core/research';
import { segmentDef } from '../../data/segments';
import type { CarModel, GameState } from '../../core/types';
import { store, useGameState } from '../store';
import { money, num, recentProfit, signedMoney } from '../format';
import { Badge, Button, Empty, Panel, Progress, Stat, Table } from '../components/ui';
import { LineChart } from '../viz/LineChart';
import { NewsArchive } from '../components/Newspaper';
import { PHASE_LABEL, projectProgress } from './Projects';

export function weeklySold(m: CarModel, weeks = 4) {
  const h = m.history.slice(-weeks);
  return h.length ? h.reduce((a, x) => a + x.sold, 0) / h.length : 0;
}

function nextSteps(s: GameState): { text: string; go?: () => void }[] {
  const out: { text: string; go?: () => void }[] = [];
  if (!s.projects.length && !s.models.some((m) => m.status === 'active')) {
    out.push({ text: 'İlk aracını tasarla: yeni bir proje başlat.', go: () => store.go({ id: 'projects' }) });
  }
  for (const p of s.projects) {
    if (p.phase === 'design') out.push({ text: `${p.name}: tasarımı bitir ve geliştirmeyi başlat.`, go: () => store.go({ id: 'project', projectId: p.id }) });
    if (p.phase === 'development' && p.dev.done >= p.dev.required) out.push({ text: `${p.name}: geliştirme bitti, teste geç.`, go: () => store.go({ id: 'project', projectId: p.id }) });
    if (p.phase === 'production' && p.productionReadyWeek === undefined) out.push({ text: `${p.name}: tedarikçileri ve üretim hattını seç.`, go: () => store.go({ id: 'project', projectId: p.id }) });
    if (p.phase === 'ready') out.push({ text: `${p.name}: lansman zamanı!`, go: () => store.go({ id: 'project', projectId: p.id }) });
  }
  for (const m of s.models.filter((x) => x.status === 'active')) {
    const lines = s.lines.filter((l) => l.modelId === m.id);
    // With no line and nothing left in stock the model only occupies the list: offer to retire it.
    if (!lines.length && m.inventory < 1)
      out.push({ text: `${m.name} artık üretilmiyor ve stoku bitti. Üretimden kaldır ya da bir hatta ata.`, go: () => store.go({ id: 'model', modelId: m.id }) });
    else if (!lines.length) out.push({ text: `${m.name} hiçbir hatta üretilmiyor; stoktan satılıyor.`, go: () => store.go({ id: 'factory' }) });
    const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
    const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0) * m.productionRate;
    if (lines.length && demand > cap * 1.25 && m.inventory < cap) out.push({ text: `${m.name} için talep üretimi aşıyor. Darboğazı çöz ya da hat ekle.`, go: () => store.go({ id: 'factory' }) });
    if (m.inventory > Math.max(8, demand * 12)) out.push({ text: `${m.name} stokları birikiyor. Fiyatı ya da üretim hızını düşür.`, go: () => store.go({ id: 'model', modelId: m.id }) });
    if ((s.week - m.refreshWeek) / 52 > 3) out.push({ text: `${m.name} ${Math.floor((s.week - m.refreshWeek) / 52)} yaşında ve her yıl eskiyor; makyaj ya da yeni kuşak düşün.`, go: () => store.go({ id: 'model', modelId: m.id }) });
  }
  // Research standing idle while rivals already build with technology the company has not learned.
  const r = s.research;
  if (r && r.active.length === 0 && s.models.length) {
    const yf = yearFloat(s.week);
    const adoption = rivalAdoption(s);
    const behind = researchDefs().filter((d) => techState(s, d.id, yf) === 'available' && (adoption[d.id] ?? 0) >= 0.25);
    if (behind.length)
      out.push({
        text: `Ar-Ge boşta. Rakiplerin çoğu kullanıyor, sen bilmiyorsun: ${behind
          .slice(0, 3)
          .map((d) => d.name)
          .join(', ')}.`,
        go: () => store.go({ id: 'research' }),
      });
  }
  // Engineers on salary with nothing to do.
  const idle = idleEngineers(s);
  if (idle > 0 && s.models.length)
    out.push({
      text: `${idle} mühendis boşta ama haftada ${money(idle * engineerSalary(yearFloat(s.week)))} maaş alıyor: yeni bir proje ya da Ar-Ge başlat, gerekirse bir kısmını çıkar.`,
      go: () => store.go({ id: 'research' }),
    });
  if (s.company.cash < 0) out.unshift({ text: 'Kasa ekside! Kredi al ya da masrafları kıs.', go: () => store.go({ id: 'finance' }) });
  return out.slice(0, 6);
}

export function HQ() {
  const s = useGameState();
  const year = yearOf(s.week);
  const thisYear = s.models.reduce((a, m) => a + m.history.filter((h) => yearOf(h.week) === year).reduce((b, h) => b + h.sold, 0), 0);
  const weekly = recentProfit(s, 4);
  const active = s.models.filter((m) => m.status === 'active');
  const steps = nextSteps(s);
  const weeks = Math.min(104, s.week);
  const series = active.slice(0, 4).map((m, i) => {
    const pts = m.history.slice(-weeks).map((h) => ({ x: h.week, y: h.sold }));
    return { id: m.id, name: m.name, color: `var(--series-${i + 1})`, points: pts };
  });

  return (
    <div className="screen">
      <div className="screen-head">
        <h1>Merkez</h1>
        <p className="muted">{formatDate(s.week)} · {s.company.hq === 'usa' ? 'Detroit' : 'Coventry'}</p>
      </div>
      <div className="stats-row">
        <Stat label="Kasa" value={money(s.company.cash)} tone={s.company.cash < 0 ? 'bad' : undefined} sub={s.company.loan > 0 ? `Kredi: ${money(s.company.loan)}` : undefined} />
        <Stat label="Haftalık kâr" value={signedMoney(weekly)} tone={weekly < 0 ? 'bad' : 'good'} sub="son 4 hafta ort." />
        <Stat label={`${year} satışı`} value={num(thisYear)} sub="araç" />
        <Stat label="İtibar" value={Math.round(s.company.reputation)} sub="/ 100" />
        <Stat
          label="Mühendis"
          value={`${engineersBusy(s)}/${s.company.engineers}`}
          tone={idleEngineers(s) > 0 && s.models.length ? 'bad' : undefined}
          sub={idleEngineers(s) > 0 ? `${idleEngineers(s)} kişi boşta` : `projede · beceri ${Math.round(s.company.skill)}`}
        />
      </div>

      <div className="grid-2">
        <Panel title="Yapılacaklar">
          {steps.length ? (
            <ul className="todo">
              {steps.map((t, i) => (
                <li key={i}>
                  <span>{t.text}</span>
                  {t.go && (
                    <Button small onClick={t.go}>
                      Git
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Her şey yolunda. Zamanı ilerlet (boşluk tuşu) ya da yeni bir proje düşün.</Empty>
          )}
        </Panel>

        <Panel title="Projeler" actions={<Button small onClick={() => store.go({ id: 'projects' })}>Tümü</Button>}>
          {s.projects.length ? (
            <div className="mini-list">
              {s.projects.map((p) => (
                <button key={p.id} type="button" className="mini-item" onClick={() => store.go({ id: 'project', projectId: p.id })}>
                  <div className="mini-top">
                    <b>{p.name}</b>
                    <Badge tone="info">{PHASE_LABEL[p.phase]}</Badge>
                  </div>
                  <Progress value={projectProgress(s, p)} />
                </button>
              ))}
            </div>
          ) : (
            <Empty>
              Aktif proje yok.{' '}
              <Button small kind="primary" onClick={() => store.go({ id: 'projects' })}>
                Yeni proje
              </Button>
            </Empty>
          )}
        </Panel>
      </div>

      <Panel title="Satıştaki modeller" actions={<Button small onClick={() => store.go({ id: 'models' })}>Ayrıntılar</Button>}>
        {active.length ? (
          <>
            <Table
              head={['Model', 'Segment', 'Haftalık satış', 'Stok', 'Fiyat', 'Dergi']}
              align={['l', 'l', 'r', 'r', 'r', 'r']}
              rows={active.map((m) => [
                <button key="n" type="button" className="link" onClick={() => store.go({ id: 'model', modelId: m.id })}>
                  {m.name}
                </button>,
                segmentDef(m.segment).name,
                weeklySold(m).toFixed(1),
                num(m.inventory),
                money(m.price),
                m.reviewScore.toFixed(1),
              ])}
            />
            <LineChart
              series={series}
              height={180}
              xFormat={(w) => formatShort(Math.round(w))}
              yFormat={(v) => v.toFixed(v < 10 ? 1 : 0)}
              yLabel="Haftalık satış (araç)"
              ariaLabel="Modellerin haftalık satış grafiği"
            />
          </>
        ) : (
          <Empty>Henüz satışta bir modelin yok.</Empty>
        )}
      </Panel>

      <Panel title="Gazete arşivi">
        <NewsArchive />
      </Panel>
      <Panel title="Haberler ve raporlar">
        <ul className="news">
          {[...s.log].reverse().slice(0, 14).map((l, i) => (
            <li key={i} className={`news-${l.tone}`}>
              <span className="news-date">{formatDate(l.week)}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
