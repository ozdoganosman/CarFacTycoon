// A simple scripted player used to sanity-check game balance headlessly.
import * as A from '../src/core/actions';
import { STATIONS } from '../src/data/stations';
import { availableSegments, credit, dealerUpgradeCost, materialUnitCost, tick } from '../src/core/game';
import { newLineCost } from '../src/data/economy';
import { lineReport, stationPrice } from '../src/core/factory';
import { referencePrice } from '../src/core/market';
import { eventDef } from '../src/data/events';
import { yearFloat } from '../src/core/time';
import type { GameState, SegmentId } from '../src/core/types';

export interface BotOptions {
  testWeeks?: number; // multiplier on default test plan
  priceFactor?: number;
  segments?: SegmentId[];
  aggressive?: boolean;
}

export function botStep(s: GameState, o: BotOptions = {}) {
  while (s.modals.length) {
    const m = s.modals[0];
    if (m.kind === 'event') {
      const ev = eventDef(m.eventId);
      if (ev?.choices?.length) A.chooseEventOption(s, m.eventId, ev.choices[0].id);
      else A.dismissModal(s);
    } else if (m.kind === 'recall' || m.kind === 'service') A.recallDecision(s, m.modelId, m.defectId, 'recall');
    else if (m.kind === 'gameOver') return;
    else A.dismissModal(s);
  }
  const yf = yearFloat(s.week);
  for (const p of [...s.projects]) {
    if (p.phase === 'design') {
      A.setProjectEngineers(s, p.id, s.company.engineers);
      A.beginDevelopment(s, p.id);
    } else if (p.phase === 'development' && p.dev.done >= p.dev.required * 1.1) A.finishDevelopment(s, p.id);
    else if (p.phase === 'testing' && o.testWeeks !== undefined && o.testWeeks === 0) A.finishTesting(s, p.id);
    else if (p.phase === 'testing' && Object.values(p.tests).every((t) => t.done >= t.planned)) A.finishTesting(s, p.id);
    else if (p.phase === 'production' && p.productionReadyWeek === undefined) {
      let line = s.lines.find((l) => !s.models.some((m) => m.id === l.modelId && m.status === 'active'));
      if (p.replacesModelId) line = s.lines.find((l) => l.modelId === p.replacesModelId) ?? line;
      if (!line) {
        if (A.buyLine(s).ok) line = s.lines[s.lines.length - 1];
        for (const stage of ['press', 'body', 'paint', 'assembly'] as const) {
          const best = STATIONS.filter((x) => x.stage === stage && x.year <= yf).sort((a, b) => b.capacity - a.capacity)[0];
          if (line) A.buyStation(s, line.id, stage, best.id);
        }
      }
      if (line) A.startTooling(s, p.id, line.id);
    } else if (p.phase === 'ready') {
      const unit = materialUnitCost(s, { stats: require_stats(s, p), suppliers: p.suppliers, unitsBuilt: 0 });
      const ref = referencePrice(s.company.hq, p.segment, yf);
      const price = Math.max(unit * 1.35, ref * (o.priceFactor ?? 0.95));
      A.launchModel(s, p.id, { price, markets: ['usa', 'europe'], autoShow: s.company.cash > 20000 });
    }
  }
  // Start new projects: keep a model per chosen segment, refresh every ~6 years.
  const segs = (o.segments ?? ['family']).filter((x) => availableSegments(s).includes(x));
  if (s.projects.length === 0 && s.company.cash > 5000) {
    for (const seg of segs) {
      const current = s.models.filter((m) => m.status === 'active' && m.segment === seg);
      const newest = current.sort((a, b) => b.launchWeek - a.launchWeek)[0];
      if (!newest || (s.week - newest.launchWeek) / 52 > 6) {
        A.startProject(s, { name: `${seg}-${Math.floor(yf)}`, segment: seg, targetPrice: 0, replacesModelId: newest?.id });
        break;
      }
    }
  }
  // Capacity: add lines for models whose demand outruns production.
  for (const m of s.models.filter((x) => x.status === 'active')) {
    const lines = s.lines.filter((l) => l.modelId === m.id);
    const cap = lines.reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
    // Full = the bottleneck stage has no free slot and no better station to swap in.
    const full = lines.every((l) => {
      const b = lineReport(s, l, m.stats.complexity).bottleneck;
      const best = STATIONS.filter((x) => x.stage === b && x.year <= yf).sort((a, c) => c.capacity - a.capacity)[0];
      return l.slots >= 8 && l.stations[b].length >= l.slots && l.stations[b].every((id) => STATIONS.find((x) => x.id === id)!.capacity >= best.capacity);
    });
    if (demand > cap * 1.3 && full && s.company.cash > 4 * newLineCost(yf) + 20000 && s.lines.length < 12) {
      if (A.buyLine(s).ok) {
        const nl = s.lines[s.lines.length - 1];
        for (const stage of ['press', 'body', 'paint', 'assembly'] as const) {
          const best = STATIONS.filter((x) => x.stage === stage && x.year <= yf).sort((a, b) => b.capacity - a.capacity)[0];
          A.buyStation(s, nl.id, stage, best.id);
        }
        A.assignLine(s, nl.id, m.id);
      }
    }
    // Reprice: follow the class reference price.
    const ref = referencePrice(s.company.hq, m.segment, yf);
    const unit = materialUnitCost(s, m);
    m.price = Math.max(unit * 1.2, ref * (o.priceFactor ?? 0.95));
    m.priceWeek = s.week;
  }
  // Factory: relieve bottlenecks.
  for (const line of s.lines) {
    const m = s.models.find((x) => x.id === line.modelId && x.status === 'active');
    if (!m) continue;
    const r = lineReport(s, line, m.stats.complexity);
    const allCap = s.lines.filter((l) => l.modelId === m.id).reduce((a, l) => a + lineReport(s, l, m.stats.complexity).throughput, 0);
    const demand = Object.values(m.lastDemand ?? {}).reduce((a, b) => a + b, 0);
    if (demand < allCap * 0.9 && m.inventory > allCap * 3) { m.productionRate = Math.max(0.3, demand / allCap); continue; }
    m.productionRate = 1;
    const stage = r.bottleneck;
    const best = STATIONS.filter((x) => x.stage === stage && x.year <= yf).sort((a, b) => b.capacity - a.capacity)[0];
    const cost = stationPrice(best.id, s.week);
    if (s.company.cash > cost * 2.5) {
      if (line.stations[stage].length >= line.slots) {
        const worst = line.stations[stage].map((id, i) => ({ id, i, cap: STATIONS.find((x) => x.id === id)!.capacity })).sort((a, b) => a.cap - b.cap)[0];
        if (worst && worst.cap < best.capacity) {
          A.sellStation(s, line.id, stage, worst.i);
          A.buyStation(s, line.id, stage, best.id);
        } else A.expandLine(s, line.id);
      } else A.buyStation(s, line.id, stage, best.id);
    }
  }
  // Dealers.
  for (const mk of ['usa', 'europe'] as const) {
    if (!s.markets[mk].unlocked) continue;
    const c = dealerUpgradeCost(s, mk);
    const selling = s.models.some((m) => m.status === 'active' && m.markets.includes(mk));
    if (selling && s.company.cash > c * (mk === s.company.hq ? 8 : 15) && s.markets[mk].dealerLevel < 10) A.upgradeDealers(s, mk);
  }
  // Engineers: grow with the company.
  const wantEng = Math.min(60, 2 + Math.floor(s.company.cash / 40000));
  if (s.company.engineers < wantEng && s.company.cash > 10000) A.hireEngineers(s, 1);
  // Credit when broke.
  if (s.company.cash < 0) {
    const room = credit(s).limit - s.company.loan;
    if (room > 1000) A.takeLoan(s, Math.min(room, -s.company.cash + 5000));
  } else if (s.company.loan > 0 && s.company.cash > s.company.loan * 3) A.repayLoan(s, s.company.loan);
}

import { computeCarStats } from '../src/core/vehicle';
function require_stats(s: GameState, p: GameState['projects'][number]) {
  return computeCarStats(p.design, yearFloat(s.week), p.bonus);
}

export function runBot(s: GameState, weeks: number, o: BotOptions = {}) {
  for (let i = 0; i < weeks && !s.gameOver; i++) {
    botStep(s, o);
    tick(s);
  }
}
