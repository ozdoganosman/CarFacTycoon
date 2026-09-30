import * as A from '../../core/actions';
import { acquisitionTargets } from '../../core/acquisitions';
import { acquiredDealerStates, isOpen } from '../../core/network';
import { stateDef } from '../../data/states';
import { companyValue } from '../../core/game';
import { RACING_LEVELS, RACING_YEAR, racingBudget, racingOutlook, racingPaused, racingPrestige, setRacingLevel } from '../../core/racing';
import { yearFloat } from '../../core/time';
import { store, useGameState } from '../store';
import { dec, money, num, pct as fmtPct, pctOf } from '../format';
import { Button, Choice, Empty, Info, Panel, Progress, Stat, Table } from '../components/ui';
import { list, t } from '../../i18n';
import { tx } from '../i18n';

/** What the money is for: a racing team, buying rivals, and the company's worth. */
import { TeamPanel } from '../components/TeamPanel';
import { RivalMovesPanel, SharesPanel } from '../components/BoardPanel';
import { founderShare } from '../../core/shares';

export function Company() {
  const s = useGameState();
  const yf = yearFloat(s.week);
  const r = s.racing ?? { level: 0, fame: 0 };
  const targets = acquisitionTargets(s);
  const value = companyValue(s);
  const racingOpen = yf >= RACING_YEAR;
  const paused = racingPaused(s.company.hq, yf);
  const outlook = racingOutlook(s, Math.max(1, r.level));
  const pct = (v: number) => fmtPct(v, 0);
  return (
    <div className="screen">
      <div className="screen-head">
        <div>
          <h1>{t('Şirket')}</h1>
          <p className="muted">{t('Mühendis al, kazandığın parayı markayı büyütmek için kullan: yarışlarda ün kazan, küçük rakipleri satın al, borsaya açıl.')}</p>
        </div>
      </div>
      <div className="stats-row">
        <Stat
          label={
            <>
              {t('Şirket değeri')}
              <Info>
                <p>{t('Makineler, stok ve kasa, eksi borç; üstüne markanın kazanç gücü (son bir yılın faaliyet kârının altı katı).')}</p>
                <p>
                  {s.shares
                    ? t('Oyun sonu puanına girer: yalnızca senin payın ({share}).', { share: pct(founderShare(s)) })
                    : t('Oyun sonu puanına girer.')}
                </p>
              </Info>
            </>
          }
          value={money(value)}
        />
        <Stat label={t('İtibar')} value={Math.round(s.company.reputation)} sub="/ 100" />
        <Stat label={t('Yarış ünü')} value={dec(r.fame, 1)} sub={t('bütün modellere prestij +{v}', { v: dec(racingPrestige(s), 1) })} />
        <Stat label={t('Yarış zaferi')} value={r.wins ?? 0} />
      </div>
      <TeamPanel />
      <div className="grid-2">
        <SharesPanel s={s} />
        <RivalMovesPanel s={s} />
      </div>
      <div className="grid-2">
        <Panel title={t('Yarış takımı')} className="racing-panel">
          {!racingOpen ? (
            <Empty>{t('Otomobil yarışları {year}’dan itibaren bir markanın vitrini olur.', { year: RACING_YEAR })}</Empty>
          ) : (
            <>
              <p className="muted small">
                {t(
                  'Her yıl Eylül’de sezonun büyük yarışı koşulur. Sonucu en iyi arabanın hızı, yol tutuşu ve dayanıklılığı, mühendislerin becerisi ve takımın bütçesi belirler. Zaferler bütün modellerinin prestijini ve markanın bilinirliğini artırır; ün, yarışmayı bırakınca yavaş yavaş söner.',
                )}
              </p>
              {paused && <p className="note">{t('Savaş sürüyor: yarışlar yapılmıyor. Takım bekler, bütçe harcanmaz.')}</p>}
              {outlook ? (
                <p className={`small ${outlook.podium < 0.2 ? 'tone-bad' : ''}`}>
                  {r.level
                    ? tx('Takımın arabası: <b>{model}</b> ({n} yaşında). Bu bütçeyle kazanma şansı <b>{win}</b>, ilk üç <b>{podium}</b>.', {
                        model: outlook.model,
                        n: Math.floor(outlook.age),
                        win: pct(outlook.win),
                        podium: pct(outlook.podium),
                      })
                    : tx('Takımın arabası: <b>{model}</b> ({n} yaşında). Amatör bütçeyle kazanma şansı <b>{win}</b>, ilk üç <b>{podium}</b>.', {
                        model: outlook.model,
                        n: Math.floor(outlook.age),
                        win: pct(outlook.win),
                        podium: pct(outlook.podium),
                      })}
                  {outlook.podium < 0.2 && ` ${t('Bu arabayla yarışmak para yakmak olur: daha hızlı, yeni bir araba ya da daha büyük bir bütçe gerekiyor.')}`}
                </p>
              ) : (
                <p className="small muted">{t('Satışta araban yok: yarışacak bir araba gerekiyor.')}</p>
              )}
              <Choice
                value={r.level}
                onChange={(v) => store.try((st) => setRacingLevel(st, v))}
                options={RACING_LEVELS.map((l, i) => {
                  const o = racingOutlook(s, i);
                  const cost = { budget: money(racingBudget(s, i)), share: pctOf(l.share, l.share * 100 % 1 ? 1 : 0), floor: money(l.floor) };
                  return {
                    value: i,
                    label: t(l.name),
                    sub: i
                      ? `${t(l.desc)} ${
                          o
                            ? t('Yılda ~{budget} (cironun {share}, en az {floor}). Kazanma şansı {win}, ilk üç {podium}.', { ...cost, win: pct(o.win), podium: pct(o.podium) })
                            : t('Yılda ~{budget} (cironun {share}, en az {floor}).', cost)
                        }`
                      : t(l.desc),
                  };
                })}
              />
              <p className="small">{t('Ün')}</p>
              <Progress
                value={Math.min(8, r.fame)}
                max={8}
                label={r.fame > 8 ? t('{v} / 8 (dolu)', { v: dec(Math.min(8, r.fame), 1) }) : `${dec(Math.min(8, r.fame), 1)} / 8`}
              />
              {r.last && (
                <p className="small">
                  {r.last.result === 'win'
                    ? tx('{year} sezonu, {race}: <b>{model}</b> birinci oldu.', { year: r.last.year, race: r.last.race, model: r.last.model })
                    : r.last.result === 'podium'
                      ? tx('{year} sezonu, {race}: <b>{model}</b> ilk üçe girdi.', { year: r.last.year, race: r.last.race, model: r.last.model })
                      : tx('{year} sezonu, {race}: <b>{model}</b> dereceye giremedi.', { year: r.last.year, race: r.last.race, model: r.last.model })}
                </p>
              )}
            </>
          )}
        </Panel>
        <Panel title={t('Rakip satın al')}>
          <p className="muted small">
            {t(
              'Senden küçük üreticiler satılık. Satın aldığında modelleri piyasadan çekilir (müşterileri yeni bir marka arar), mühendisleri sana katılır, bayileri senin arabalarını satar: onun güçlü olduğu eyaletlerde, henüz satış yapmadıkların dahil, yeni bayilerin olur.',
            )}
          </p>
          {targets.length ? (
            <Table
              head={[t('Şirket'), t('Geçen yıl'), t('Mühendis'), t('Bayi'), t('Bedel'), '']}
              align={['l', 'r', 'r', 'r', 'r', 'r']}
              rows={targets.slice(0, 10).map((tg) => [
                <span key="n">
                  {tg.name}
                </span>,
                t('{count} araç', { count: num(tg.units) }),
                `+${tg.engineers}`,
                `+${tg.dealers}`,
                money(tg.price),
                <Button
                  key="b"
                  small
                  disabled={s.company.cash < tg.price}
                  onClick={() => {
                    // Where its dealers would sell our cars, and which of those states are new.
                    const states = acquiredDealerStates(s, tg.dealers, tg.id);
                    const fresh = states.filter((id) => !isOpen(s, id));
                    const p = {
                      price: money(tg.price),
                      cash: money(s.company.cash),
                      n: tg.engineers,
                      company: tg.name,
                      states: list(states.map((id) => stateDef(id).name)),
                      fresh: list(fresh.map((id) => stateDef(id).name)),
                    };
                    store
                      .ask({
                        title: t('{company} satın alınsın mı?', { company: tg.name }),
                        body: fresh.length
                          ? t(
                              'Bedel {price} (kasan {cash}). {n} mühendis katılır (maaşları da gelir), {company} modelleri piyasadan çekilir. Bayileri senin arabalarını satar: {states} (ilk kez satış yapacağın eyaletler: {fresh}). Bu işlem geri alınamaz.',
                              p,
                            )
                          : t('Bedel {price} (kasan {cash}). {n} mühendis katılır (maaşları da gelir), {company} modelleri piyasadan çekilir. Bayileri senin arabalarını satar: {states}. Bu işlem geri alınamaz.', p),
                        confirm: t('{price} öde, satın al', { price: money(tg.price) }),
                        danger: true,
                      })
                      .then((yes) => yes && store.try((st) => A.acquireRival(st, tg.id), t('{company} satın alındı', { company: tg.name })));
                  }}
                >
                  {t('Satın al')}
                </Button>,
              ])}
            />
          ) : (
            <Empty>{t('Şu an satılık rakip yok: senden küçük ve satış yapan bir üretici çıktığında burada görünür.')}</Empty>
          )}
          {(s.acquired?.length ?? 0) > 0 && <p className="small muted">{t('Şimdiye kadar {n} şirket satın aldın.', { n: s.acquired!.length })}</p>}
        </Panel>
      </div>
    </div>
  );
}
