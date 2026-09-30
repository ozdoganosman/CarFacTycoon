import type { IconName } from '../ui/components/Icon';
import { cityDef } from './cities';
import { segmentDef } from './segments';
import { stateDef } from './states';
import { log, money } from '../core/util';
import { FIRSTS, acceptBid, canDilute, greenmailCost, lastMove, matchPriceWar, refuseBid, rivalMoves } from '../core/rivalMoves';
import { ULTIMATUM_AT, VETO_AT, dilute, grantSeat, greenmail, marketCap } from '../core/shares';
import { rivalDef } from '../core/rivals';
import type { GameState } from '../core/types';
import { isTurkish, lower, msg, t } from '../i18n';
import { fmtPercent } from '../i18n/format';

// Historical events. Market sizes already follow history (see markets.ts);
// events explain what is happening and offer the player decisions.

export interface EventChoice {
  id: string;
  label: string;
  desc?: string | ((s: GameState) => string);
  /** A choice the company cannot afford is shown greyed out. */
  enabled?: (s: GameState) => boolean;
  apply?: (s: GameState) => void;
}

export interface GameEventDef {
  id: string;
  year: number;
  month: number; // 0-11
  title: string;
  icon: IconName;
  body: (s: GameState) => string;
  choices?: EventChoice[];
  apply?: (s: GameState) => void;
  condition?: (s: GameState) => boolean;
}

function startContract(s: GameState, until: number, label: string) {
  s.flags.militaryUntil = until;
  s.flags.hadContract = 1;
  for (const line of s.lines) line.military = true;
  log(s, t('{label}: tüm hatlar askeri üretime geçti. Fabrika ekranından hat bazında geri alabilirsin.', { label: t(label) }), 'info');
}

function endContract(s: GameState) {
  if (!s.flags.militaryUntil) return;
  s.flags.militaryUntil = 0;
  for (const line of s.lines) line.military = false;
  log(s, t('Askeri sözleşmeler sona erdi; hatlar sivil üretime döndü.'), 'good');
}

export const EVENTS: GameEventDef[] = [
  {
    id: 'start',
    year: 1900,
    month: 0,
    title: msg('Atölyen açıldı'),
    icon: 'wrench',
    body: (s) =>
      t(
        '1900 yılı. {city}’da küçük bir atölyen, {n} mühendisin ve biraz paran var. Amacın 1960’a kadar Amerika’nın büyük otomobil markalarından biri olmak.\n\nİlk adım: Projeler ekranında yeni bir araç projesi başlat. Segmentini seç, aracı modüllerden tasarla, geliştir, test et, üret ve sat.\n\nArabaların önce yalnızca {state} eyaletinde satılır. Harita ekranından komşu eyaletlerde bayi arayarak büyürsün; eyalet dışına giden her araba için nakliye ödersin.\n\nİpucu: Hangi alıcının neye önem verdiği gizli. Satış raporları ve dergi yorumları zamanla bunu sana öğretecek.',
        { city: cityDef(s.company.city).name, n: s.company.engineers, state: stateDef(cityDef(s.company.city).state).name },
      ),
  },
  {
    id: 'model_h',
    year: 1908,
    month: 9,
    title: msg('Herkes için bir otomobil'),
    icon: 'newspaper',
    body: () =>
      t(
        'Hartwell Motor Co. “Model H”yi tanıttı: basit, dayanıklı, tamiri kolay ve ucuz. Çiftçiler bile alabiliyor.\n\nAile arabası pazarında fiyat rekabeti sertleşecek. Maliyetini düşürmenin yollarını düşün: basit tasarım, verimli fabrika, maliyet odaklı geliştirme.',
      ),
  },
  {
    id: 'moving_line',
    year: 1913,
    month: 9,
    title: msg('Hareketli montaj hattı'),
    icon: 'settings',
    body: () =>
      t(
        'Hartwell, Highland Park fabrikasında şasiyi zincirle işçilerin önünden geçirmeye başladı. Bir şasinin montajı 12,5 saatten 93 dakikaya indi.\n\nFabrika ekranında artık “Hareketli montaj hattı” istasyonu var. Ama dikkat: montaj hızlanınca darboğaz başka istasyona kayar. En yavaş istasyon bütün hattın hızını belirler.',
      ),
  },
  {
    id: 'five_dollar',
    year: 1914,
    month: 0,
    title: msg('Günde beş dolar'),
    icon: 'banknote',
    body: () =>
      t(
        'Monoton hat işi yüzünden işçiler birkaç ayda bir işi bırakıyor; sürekli yeni işçi eğitiyorsun. Hartwell yevmiyeyi iki katına, günde 5 dolara çıkardı ve kapısında kuyruk var.\n\nSen ne yapacaksın?',
      ),
    choices: [
      {
        id: 'raise',
        label: msg('Ücretleri artır'),
        desc: msg('Hat işçiliği +%40, ama işçi kaçmadığı için verim +%30: araç başına işçilik ~%8 artar, hatlar daha çok üretir. İtibar +3.'),
        apply: (s) => {
          s.company.highWages = true;
          s.company.reputation = Math.min(100, s.company.reputation + 3);
        },
      },
      { id: 'keep', label: msg('Ücretleri koru'), desc: msg('Maliyetler aynı kalır.') },
    ],
  },
  {
    id: 'ww1',
    year: 1914,
    month: 7,
    title: msg('Avrupa’da savaş'),
    icon: 'swords',
    body: (s) =>
      t('Büyük Savaş başladı. Avrupa’da sivil otomobil satışları çöktü, çelik fiyatları yükseliyor (malzeme maliyeti +%25).') +
      '\n\n' +
      (s.company.hq === 'europe'
        ? t('Ordu kamyon ve ambulans siparişi teklif ediyor. Kabul edersen hatların askeri üretime geçer: garantili ama sınırlı kâr.')
        : t('Müttefik ordular Amerikan fabrikalarından kamyon ve ambulans sipariş ediyor. Kabul edersen hatların askeri üretime geçer.')),
    apply: (s) => {
      s.flags.materialsUntil = 1919;
    },
    choices: [
      {
        id: 'accept',
        label: msg('Siparişi kabul et'),
        desc: msg('Savaş bitene kadar hatlar askeri araç üretir (hat bazında geri alınabilir).'),
        apply: (s) => startContract(s, 1918.9, msg('Askeri sözleşme')),
      },
      { id: 'decline', label: msg('Sivil üretimde kal') },
    ],
  },
  {
    id: 'ww1_end',
    year: 1918,
    month: 10,
    title: msg('Ateşkes'),
    icon: 'truce',
    body: () => t('Savaş bitti. Avrupa pazarı yavaş yavaş toparlanacak; ABD’de ise talep patlaması bekleniyor.'),
    apply: endContract,
  },
  {
    id: 'recession_1920',
    year: 1920,
    month: 6,
    title: msg('Savaş sonrası durgunluk'),
    icon: 'chartDown',
    body: () => t('Savaş sonrası enflasyon ve ardından gelen durgunluk satışları vuruyor. Stoklarını şişirme, fiyatlarını gözden geçir.'),
  },
  {
    id: 'leaded_fuel',
    year: 1923,
    month: 1,
    title: msg('Kurşunlu benzin'),
    icon: 'pump',
    body: () =>
      t(
        'Yeni bir katkı maddesi (tetraetil kurşun) benzinin vuruntuya direncini artırdı. Motorlar artık daha yüksek sıkıştırma oranıyla çalışabilir: daha fazla güç, daha az yakıt.\n\nYıllar sonra bunun ciddi bir sağlık bedeli olduğu anlaşılacak.',
      ),
  },
  {
    id: 'crash_1929',
    year: 1929,
    month: 9,
    title: msg('Kara Perşembe'),
    icon: 'bank',
    body: () =>
      t(
        'New York borsası çöktü. Önümüzdeki yıllarda satışlar dörtte birine inebilir. Lüks araç alıcıları ortadan kayboluyor, ucuz araçlar ayakta kalıyor. Bankalar krediyi kısıyor.\n\nMaliyetleri nasıl yöneteceksin?',
      ),
    choices: [
      {
        id: 'layoffs',
        label: msg('İşçi çıkar'),
        desc: msg('Hat maliyeti −%25, üretim kapasitesi −%15, itibar −4 (1934’e kadar).'),
        apply: (s) => {
          s.flags.layoffs = 1;
          s.company.reputation = Math.max(0, s.company.reputation - 4);
        },
      },
      {
        id: 'keep',
        label: msg('Kimseyi çıkarma'),
        desc: msg('Maliyetler aynı kalır, itibar +4.'),
        apply: (s) => {
          s.company.reputation = Math.min(100, s.company.reputation + 4);
        },
      },
    ],
  },
  {
    id: 'recovery_1934',
    year: 1934,
    month: 0,
    title: msg('Toparlanma'),
    icon: 'chartUp',
    body: () =>
      t('Ekonomi yavaşça toparlanıyor. Bu yıl iki büyük yenilik var: monokok gövde ve bağımsız ön süspansiyon. Mühendisler ayrıca ilk çarpışma testlerini yapmaya başladı.'),
    apply: (s) => {
      s.flags.layoffs = 0;
    },
  },
  {
    id: 'ww2_europe',
    year: 1939,
    month: 8,
    title: msg('İkinci Dünya Savaşı'),
    icon: 'swords',
    body: (s) =>
      t('Avrupa yeniden savaşta. Avrupa’da sivil araç satışı neredeyse duracak.') +
      '\n\n' +
      (s.company.hq === 'europe' ? t('Hükümet fabrikanı askeri üretime çağırıyor.') : t('ABD şimdilik tarafsız; ama bu uzun sürmeyebilir.')),
    choices: [
      {
        id: 'accept',
        label: msg('Askeri üretime geç'),
        desc: msg('Savaş bitene kadar hatlar askeri araç üretir.'),
        apply: (s) => startContract(s, 1945.6, msg('Savaş üretimi')),
      },
      { id: 'decline', label: msg('Şimdilik sivil üretimde kal') },
    ],
  },
  {
    id: 'ww2_usa',
    year: 1942,
    month: 1,
    title: msg('Sivil üretim durdu'),
    icon: 'factory',
    body: () =>
      t(
        'ABD savaşa girdi ve sivil otomobil üretimi yasaklandı. Fabrikalar tank, uçak motoru ve cip üretiyor.\n\nAskeri sözleşmeyi kabul edersen hatların savaş boyunca garantili kâr getirir ve mühendislerin arazi aracı tecrübesi kazanır.',
      ),
    choices: [
      {
        id: 'accept',
        label: msg('Savaş üretimine katıl'),
        desc: msg('Hatlar askeri üretime geçer; savaş sonunda mühendislik becerisi +5.'),
        apply: (s) => {
          startContract(s, 1945.6, msg('Savaş üretimi'));
          s.flags.jeep = 1;
        },
      },
      { id: 'decline', label: msg('Reddet'), desc: msg('Hatlar boş bekler; bakım masrafları sürer.') },
    ],
  },
  {
    id: 'ww2_end',
    year: 1945,
    month: 7,
    title: msg('Barış'),
    icon: 'truce',
    body: (s) =>
      t('Savaş bitti. Yıllardır araba alamayan insanlar bayilerin kapısında. Önümüzdeki yıllarda satabildiğin her şeyi satarsın.') +
      (s.flags.jeep
        ? '\n\n' + t('Savaşta cip üreten mühendislerin artık arazi araçlarını çok iyi tanıyor (beceri +5). 1946’da Arazi aracı segmenti açılıyor.')
        : ''),
    apply: (s) => {
      endContract(s);
      if (s.flags.jeep) s.company.skill = Math.min(100, s.company.skill + 5);
      if (s.flags.hadContract) s.company.reputation = Math.min(100, s.company.reputation + 3);
    },
  },
  {
    id: 'rac_end',
    year: 1948,
    month: 0,
    title: msg('Vergi beygiri kalktı'),
    icon: 'scroll',
    body: () =>
      t(
        'İngiltere silindir çapına göre alınan “vergi beygiri”ni kaldırıp motor hacmine göre vergiye geçti. Artık kısa stroklu, geniş çaplı motorlar Avrupa’da cezalandırılmıyor; ama büyük hacim hâlâ pahalı.',
      ),
  },
  {
    id: 'hp_race',
    year: 1950,
    month: 0,
    title: msg('Beygir gücü yarışı'),
    icon: 'company',
    body: () =>
      t(
        'ABD’de ekonomi patlıyor, benzin ucuz. Alıcılar artık kaputun altındaki V8’i ve 0-100 süresini soruyor. Amerikan pazarında hızlanma, son hız ve prestijin önemi arttı.',
      ),
  },
  {
    id: 'imports_usa',
    year: 1955,
    month: 3,
    title: msg('Küçük ithal arabalar'),
    icon: 'segSuv',
    body: () =>
      t('Volkswerk’in küçük, dayanıklı ve ucuz arabası Amerika’da beklenmedik bir başarı yakaladı. ABD’de şehir arabası pazarı büyüyor.'),
  },
  {
    id: 'suez',
    year: 1956,
    month: 10,
    title: msg('Süveyş krizi'),
    icon: 'drum',
    body: () =>
      t('Süveyş Kanalı kapandı; Avrupa’da benzin karneye bağlandı. Önümüzdeki aylarda Avrupalı alıcılar için yakıt ekonomisi her zamankinden önemli.'),
  },
];

const moveName = (s: GameState) => {
  const m = lastMove(s);
  return m ? rivalDef(m.company).name : t('Bir rakip');
};
const moveClass = (s: GameState) => {
  const seg = lastMove(s)?.segment;
  return seg ? lower(t(segmentDef(seg).name)) : '';
};
const pctTxt = (v: number) => `${v >= 0 ? '+' : '−'}${isTurkish() ? `%${Math.abs(Math.round(v * 1000) / 10)}` : fmtPercent(Math.abs(Math.round(v * 1000) / 1000), Math.abs(v * 1000) % 10 ? 1 : 0)}`;
const targetsText = (s: GameState) => {
  const target = s.shares?.target;
  return target
    ? t('{year} hedefleri: ciro ya da kâr {growth}, dış hissedarlara en az {dividend} temettü.', {
        year: target.year,
        growth: pctTxt(target.growth),
        dividend: money(target.dividend),
      })
    : '';
};

/**
 * Pop-ups the game raises itself when something happens (a rival's counter-move, the board's
 * warnings): never fired by date, their text reads the moment from the save.
 */
export const DYNAMIC_EVENTS: GameEventDef[] = [
  {
    id: 'rival-priceWar',
    year: 9999,
    month: 0,
    title: msg('Fiyat savaşı'),
    icon: 'tag',
    body: (s) =>
      t(
        '{name}, {segment} sınıfında önümüze geçmemize dayanamadı: fiyatlarını %15 indirdi ve bu fiyatları bir buçuk yıl koruyacağını ilan etti.\n\nGazeteler "otomobil fiyatları düşüyor" diye yazıyor. Alıcıların bir kısmı ucuz arabaya kayacak.',
        { name: moveName(s), segment: moveClass(s) },
      ),
    choices: [
      {
        id: 'hold',
        label: msg('Fiyatlarımızı koruyoruz'),
        desc: msg('Bir miktar alıcı kaybederiz ama araba başına kâr aynı kalır. Kaliteli ve tanınmış bir araba fiyat savaşını daha rahat atlatır.'),
      },
      {
        id: 'match',
        label: msg('Biz de %10 indiriyoruz'),
        desc: (s) => {
          const seg = lastMove(s)?.segment;
          const n = s.models.filter((m) => m.status === 'active' && m.segment === seg).length;
          return t('Bu sınıftaki {n} modelimizin fiyatı %10 düşer: alıcılar kalır, kâr marjı daralır. Savaş bitince eski fiyata dönmek zam sayılmaz.', { n });
        },
        apply: (s) => {
          const seg = lastMove(s)?.segment;
          if (seg) matchPriceWar(s, seg);
          log(s, t('Fiyat savaşına karşılık verdik: fiyatlarımız %10 indi.'), 'info');
        },
      },
    ],
  },
  {
    id: 'rival-techLeap',
    year: 9999,
    month: 0,
    title: msg('Rakipten teknoloji atağı'),
    icon: 'settings',
    body: (s) => {
      const first = lastMove(s)?.first;
      const params = { name: moveName(s), segment: moveClass(s), model: lastMove(s)?.model ?? t('yeni modeli') };
      return (
        (first
          ? t(
              '{name}, {segment} sınıfındaki üstünlüğümüze karşı en iyi mühendislerini tek bir arabaya verdi: {model} bugün tanıtıldı. Sınıfının ilk {first} arabası: gazeteler ondan söz ediyor, alıcılar bizim arabamızda da aynısını soracak.',
              { ...params, first: t(FIRSTS[first].name) },
            )
          : t('{name}, {segment} sınıfındaki üstünlüğümüze karşı en iyi mühendislerini tek bir arabaya verdi: {model} bugün tanıtıldı. Kâğıt üzerinde bizim arabamızdan daha modern.', params)) +
        '\n\n' +
        t('Yerimizi korumak için yeni bir model ya da makyaj gerekecek. Mühendislerini ve Ar-Ge kuyruğunu gözden geçir.')
      );
    },
  },
  {
    id: 'rival-merger',
    year: 9999,
    month: 0,
    title: msg('Büyük birleşme'),
    icon: 'contract',
    body: (s) => {
      const m = lastMove(s);
      const a = m ? rivalDef(m.company).name : t('İki rakip');
      const b = m?.partner ? rivalDef(m.partner).name : '';
      return t(
        '{buyer}, {target} şirketini satın aldı. Tek başına bize yetişemeyen iki üretici güçlerini birleştirdi: {target} fabrikası kapanıyor, bayileri artık {buyer} arabalarını satıyor.\n\n{buyer} bundan sonra ülkenin daha fazla köşesinde. {target} alıcıları yeni bir marka arayacak: bayimiz olan eyaletlerde onlara ulaşmak için iyi bir fırsat.',
        { buyer: a, target: b },
      );
    },
  },
  {
    id: 'rival-bid',
    year: 9999,
    month: 0,
    title: msg('Hisse teklifi'),
    icon: 'briefcase',
    body: (s) => {
      const b = rivalMoves(s).bid;
      const name = b ? rivalDef(b.company).name : t('Bir rakip');
      return t(
        '{name} bankacıları kapıda: şirketin %{stake}’i için {price} öneriyorlar, bugünkü değerinin epey üstünde.\n\nSatarsan kasaya büyük bir para girer ama şirket borsaya açılır ve {name} yönetim kurulunda oturur: her yıl büyüme ve temettü hedefleri gelir, rakibin koltuğu yüzünden daha sıkı. Reddedersen savaş açık demektir.',
        { name, stake: Math.round((b?.stake ?? 0.25) * 100), price: money(b?.price ?? 0) },
      );
    },
    choices: [
      {
        id: 'accept',
        label: msg('Hisseyi sat'),
        desc: (s) =>
          t('Kasaya {price} girer. Yönetim kurulu kurulur; hedefler tutmazsa baskı artar, en sonunda görevden alınabilirsin.', {
            price: money(rivalMoves(s).bid?.price ?? 0),
          }),
        apply: acceptBid,
      },
      {
        id: 'refuse',
        label: msg('Reddet'),
        desc: msg('Şirket tamamen senin kalır. Rakip, en büyük sınıfında fiyatlarını indirerek karşılık verir.'),
        apply: refuseBid,
      },
    ],
  },
  {
    id: 'rival-raid',
    year: 9999,
    month: 0,
    title: msg('Hisse baskını'),
    icon: 'fin',
    body: (s) => {
      const r = s.shares?.raider;
      const name = r ? rivalDef(r.company).name : t('Bir rakip');
      return t(
        '{name}, borsadan sessizce hisse topladı: artık şirketin %{stake}’i onun. Yönetim kurulunda koltuk istiyor.\n\nBloğu primle geri alabilir, koltuğu verebilir ya da dost bankalara yeni hisse satarak payını sulandırabilirsin.',
        { name, stake: Math.round((r?.stake ?? 0) * 100) },
      );
    },
    choices: [
      {
        id: 'greenmail',
        label: msg('Hisseleri primle geri al'),
        desc: (s) => t('{cost} (piyasa fiyatının %35 fazlası). Rakip yönetimden uzak kalır, dışarıdaki payın küçülür.', { cost: money(greenmailCost(s)) }),
        enabled: (s) => s.company.cash >= greenmailCost(s),
        apply: (s) => {
          const cost = greenmailCost(s);
          greenmail(s);
          log(s, t('Rakibin hisseleri {cost} karşılığında geri alındı.', { cost: money(cost) }), 'info');
        },
      },
      {
        id: 'seat',
        label: msg('Koltuğu ver'),
        desc: msg('Para harcanmaz, borsa istikrarı sever (güven +4). Ama rakip yönetimde oturdukça hedefler daha sıkı olur.'),
        apply: (s) => {
          grantSeat(s);
          log(s, t('Rakip yönetim kuruluna girdi: hedefler sıkılaştı.'), 'warn');
        },
      },
      {
        id: 'dilute',
        label: msg('Yeni hisse çıkar, payını sulandır'),
        desc: (s) =>
          t('Dost bankalara %10 yeni hisse satılır (kasaya ~{cash}). Rakip çekilir ama hissedarlar sulanmadan hoşlanmaz (güven −8).', {
            cash: money(marketCap(s) * 0.1 * 0.92),
          }),
        enabled: canDilute,
        apply: (s) => {
          dilute(s);
          log(s, t('Yeni hisseler dost bankalara satıldı; baskıncı rakip çekildi.'), 'info');
        },
      },
    ],
  },
  {
    id: 'board-warning',
    year: 9999,
    month: 0,
    title: msg('Yönetim kurulu huzursuz'),
    icon: 'tophat',
    // First a warning; the veto only after another bad year.
    body: (s) => {
      const p = { confidence: Math.round(s.shares?.confidence ?? 0), targets: targetsText(s), veto: VETO_AT, last: ULTIMATUM_AT };
      return (s.shares?.confidence ?? 0) < VETO_AT
        ? t(
            'Yönetim kurulunun sana güveni {confidence}/100’e düştü. Hissedarlar büyüme ve temettü bekliyor; toplantıda sesler yükseldi.\n\n{targets}\n\nKurul artık yarış bütçesini, rakip satın almayı ve yeni hat kurmayı veto ediyor; güven {veto}’in üstüne çıkınca kalkar. Temettü oranını Şirket ekranından ayarlayabilirsin. Güven {last}’in altına inerse son uyarı gelir, sonra görevden alınırsın.',
            p,
          )
        : t(
            'Yönetim kurulunun sana güveni {confidence}/100’e düştü. Hissedarlar büyüme ve temettü bekliyor; toplantıda sesler yükseldi.\n\n{targets}\n\nBu bir uyarı: güven {veto}’in altına inerse kurul yarış bütçesini, rakip satın almayı ve yeni hat kurmayı veto eder. Temettü oranını Şirket ekranından ayarlayabilirsin. Güven {last}’in altına inerse son uyarı gelir, sonra görevden alınırsın.',
            p,
          );
    },
  },
  {
    id: 'board-ultimatum',
    year: 9999,
    month: 0,
    title: msg('Yönetim kurulundan son uyarı'),
    icon: 'alert',
    body: (s) =>
      t(
        'Güven {confidence}/100. Yönetim kurulu açık konuştu: bu yılın hedefleri de tutmazsa seni görevden alacak ve şirketi başka birine verecek.\n\n{targets}\n\nÇıkış yolları: hedefleri tutturmak ya da dışarıdaki bütün hisseleri geri alıp yönetim kurulundan kurtulmak (Şirket ekranı).',
        { confidence: Math.round(s.shares?.confidence ?? 0), targets: targetsText(s) },
      ),
  },
];

export function eventDef(id: string): GameEventDef | undefined {
  return EVENTS.find((e) => e.id === id) ?? DYNAMIC_EVENTS.find((e) => e.id === id);
}
