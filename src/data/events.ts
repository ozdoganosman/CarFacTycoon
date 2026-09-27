import { log } from '../core/util';
import type { GameState } from '../core/types';

// Historical events. Market sizes already follow history (see markets.ts);
// events explain what is happening and offer the player decisions.

export interface EventChoice {
  id: string;
  label: string;
  desc?: string;
  apply?: (s: GameState) => void;
}

export interface GameEventDef {
  id: string;
  year: number;
  month: number; // 0-11
  title: string;
  icon: string;
  body: (s: GameState) => string;
  choices?: EventChoice[];
  apply?: (s: GameState) => void;
  condition?: (s: GameState) => boolean;
}

function startContract(s: GameState, until: number, label: string) {
  s.flags.militaryUntil = until;
  s.flags.hadContract = 1;
  for (const line of s.lines) line.military = true;
  log(s, `${label}: tüm hatlar askeri üretime geçti. Fabrika ekranından hat bazında geri alabilirsin.`, 'info');
}

function endContract(s: GameState) {
  if (!s.flags.militaryUntil) return;
  s.flags.militaryUntil = 0;
  for (const line of s.lines) line.military = false;
  log(s, 'Askeri sözleşmeler sona erdi; hatlar sivil üretime döndü.', 'good');
}

export const EVENTS: GameEventDef[] = [
  {
    id: 'start',
    year: 1900,
    month: 0,
    title: 'Atölyen açıldı',
    icon: '🔧',
    body: (s) =>
      `1900 yılı. ${s.company.hq === 'usa' ? 'Detroit' : 'Coventry'}’de küçük bir atölyen, iki mühendisin ve biraz paran var. ` +
      'Amacın 1960’a kadar dünya çapında bir otomobil markası kurmak.\n\n' +
      'İlk adım: Projeler ekranında yeni bir araç projesi başlat. Segmentini seç, aracı modüllerden tasarla, geliştir, test et, üret ve sat.\n\n' +
      'İpucu: Hangi alıcının neye önem verdiği gizli. Satış raporları ve dergi yorumları zamanla bunu sana öğretecek.',
  },
  {
    id: 'model_h',
    year: 1908,
    month: 9,
    title: 'Herkes için bir otomobil',
    icon: '📰',
    body: () =>
      'Hartwell Motor Co. “Model H”yi tanıttı: basit, dayanıklı, tamiri kolay ve ucuz. Çiftçiler bile alabiliyor.\n\n' +
      'Aile arabası pazarında fiyat rekabeti sertleşecek. Maliyetini düşürmenin yollarını düşün: basit tasarım, verimli fabrika, maliyet odaklı geliştirme.',
  },
  {
    id: 'moving_line',
    year: 1913,
    month: 9,
    title: 'Hareketli montaj hattı',
    icon: '⚙️',
    body: () =>
      'Hartwell, Highland Park fabrikasında şasiyi zincirle işçilerin önünden geçirmeye başladı. Bir şasinin montajı 12,5 saatten 93 dakikaya indi.\n\n' +
      'Fabrika ekranında artık “Hareketli montaj hattı” istasyonu var. Ama dikkat: montaj hızlanınca darboğaz başka istasyona kayar. En yavaş istasyon bütün hattın hızını belirler.',
  },
  {
    id: 'five_dollar',
    year: 1914,
    month: 0,
    title: 'Günde beş dolar',
    icon: '💵',
    body: () =>
      'Monoton hat işi yüzünden işçiler birkaç ayda bir işi bırakıyor; sürekli yeni işçi eğitiyorsun. Hartwell yevmiyeyi iki katına, günde 5 dolara çıkardı ve kapısında kuyruk var.\n\nSen ne yapacaksın?',
    choices: [
      {
        id: 'raise',
        label: 'Ücretleri artır',
        desc: 'Hat işçilik maliyeti +%40, verimlilik +%15, itibar +3.',
        apply: (s) => {
          s.company.highWages = true;
          s.company.reputation = Math.min(100, s.company.reputation + 3);
        },
      },
      { id: 'keep', label: 'Ücretleri koru', desc: 'Maliyetler aynı kalır.' },
    ],
  },
  {
    id: 'ww1',
    year: 1914,
    month: 7,
    title: 'Avrupa’da savaş',
    icon: '⚔️',
    body: (s) =>
      'Büyük Savaş başladı. Avrupa’da sivil otomobil satışları çöktü, çelik fiyatları yükseliyor (malzeme maliyeti +%25).\n\n' +
      (s.company.hq === 'europe'
        ? 'Ordu kamyon ve ambulans siparişi teklif ediyor. Kabul edersen hatların askeri üretime geçer: garantili ama sınırlı kâr.'
        : 'Müttefik ordular Amerikan fabrikalarından kamyon ve ambulans sipariş ediyor. Kabul edersen hatların askeri üretime geçer.'),
    apply: (s) => {
      s.flags.materialsUntil = 1919;
    },
    choices: [
      {
        id: 'accept',
        label: 'Siparişi kabul et',
        desc: 'Savaş bitene kadar hatlar askeri araç üretir (hat bazında geri alınabilir).',
        apply: (s) => startContract(s, 1918.9, 'Askeri sözleşme'),
      },
      { id: 'decline', label: 'Sivil üretimde kal' },
    ],
  },
  {
    id: 'ww1_end',
    year: 1918,
    month: 10,
    title: 'Ateşkes',
    icon: '🕊️',
    body: () => 'Savaş bitti. Avrupa pazarı yavaş yavaş toparlanacak; ABD’de ise talep patlaması bekleniyor.',
    apply: endContract,
  },
  {
    id: 'recession_1920',
    year: 1920,
    month: 6,
    title: 'Savaş sonrası durgunluk',
    icon: '📉',
    body: () => 'Savaş sonrası enflasyon ve ardından gelen durgunluk satışları vuruyor. Stoklarını şişirme, fiyatlarını gözden geçir.',
  },
  {
    id: 'leaded_fuel',
    year: 1923,
    month: 1,
    title: 'Kurşunlu benzin',
    icon: '⛽',
    body: () =>
      'Yeni bir katkı maddesi (tetraetil kurşun) benzinin vuruntuya direncini artırdı. Motorlar artık daha yüksek sıkıştırma oranıyla çalışabilir: daha fazla güç, daha az yakıt.\n\n' +
      'Yıllar sonra bunun ciddi bir sağlık bedeli olduğu anlaşılacak.',
  },
  {
    id: 'crash_1929',
    year: 1929,
    month: 9,
    title: 'Kara Perşembe',
    icon: '🏦',
    body: () =>
      'New York borsası çöktü. Önümüzdeki yıllarda satışlar dörtte birine inebilir. Lüks araç alıcıları ortadan kayboluyor, ucuz araçlar ayakta kalıyor. Bankalar krediyi kısıyor.\n\n' +
      'Maliyetleri nasıl yöneteceksin?',
    choices: [
      {
        id: 'layoffs',
        label: 'İşçi çıkar',
        desc: 'Hat maliyeti −%25, üretim kapasitesi −%15, itibar −4 (1934’e kadar).',
        apply: (s) => {
          s.flags.layoffs = 1;
          s.company.reputation = Math.max(0, s.company.reputation - 4);
        },
      },
      {
        id: 'keep',
        label: 'Kimseyi çıkarma',
        desc: 'Maliyetler aynı kalır, itibar +4.',
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
    title: 'Toparlanma',
    icon: '📈',
    body: () =>
      'Ekonomi yavaşça toparlanıyor. Bu yıl iki büyük yenilik var: monokok gövde ve bağımsız ön süspansiyon. Mühendisler ayrıca ilk çarpışma testlerini yapmaya başladı.',
    apply: (s) => {
      s.flags.layoffs = 0;
    },
  },
  {
    id: 'ww2_europe',
    year: 1939,
    month: 8,
    title: 'İkinci Dünya Savaşı',
    icon: '⚔️',
    body: (s) =>
      'Avrupa yeniden savaşta. Avrupa’da sivil araç satışı neredeyse duracak.' +
      (s.company.hq === 'europe' ? '\n\nHükümet fabrikanı askeri üretime çağırıyor.' : '\n\nABD şimdilik tarafsız; ama bu uzun sürmeyebilir.'),
    choices: [
      {
        id: 'accept',
        label: 'Askeri üretime geç',
        desc: 'Savaş bitene kadar hatlar askeri araç üretir.',
        apply: (s) => startContract(s, 1945.6, 'Savaş üretimi'),
      },
      { id: 'decline', label: 'Şimdilik sivil üretimde kal' },
    ],
  },
  {
    id: 'ww2_usa',
    year: 1942,
    month: 1,
    title: 'Sivil üretim durdu',
    icon: '🏭',
    body: () =>
      'ABD savaşa girdi ve sivil otomobil üretimi yasaklandı. Fabrikalar tank, uçak motoru ve cip üretiyor.\n\n' +
      'Askeri sözleşmeyi kabul edersen hatların savaş boyunca garantili kâr getirir ve mühendislerin arazi aracı tecrübesi kazanır.',
    choices: [
      {
        id: 'accept',
        label: 'Savaş üretimine katıl',
        desc: 'Hatlar askeri üretime geçer; savaş sonunda mühendislik becerisi +5.',
        apply: (s) => {
          startContract(s, 1945.6, 'Savaş üretimi');
          s.flags.jeep = 1;
        },
      },
      { id: 'decline', label: 'Reddet', desc: 'Hatlar boş bekler; bakım masrafları sürer.' },
    ],
  },
  {
    id: 'ww2_end',
    year: 1945,
    month: 7,
    title: 'Barış',
    icon: '🕊️',
    body: (s) =>
      'Savaş bitti. Yıllardır araba alamayan insanlar bayilerin kapısında. Önümüzdeki yıllarda satabildiğin her şeyi satarsın.' +
      (s.flags.jeep ? '\n\nSavaşta cip üreten mühendislerin artık arazi araçlarını çok iyi tanıyor (beceri +5). 1946’da Arazi aracı segmenti açılıyor.' : ''),
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
    title: 'Vergi beygiri kalktı',
    icon: '📜',
    body: () =>
      'İngiltere silindir çapına göre alınan “vergi beygiri”ni kaldırıp motor hacmine göre vergiye geçti. Artık kısa stroklu, geniş çaplı motorlar Avrupa’da cezalandırılmıyor; ama büyük hacim hâlâ pahalı.',
  },
  {
    id: 'hp_race',
    year: 1950,
    month: 0,
    title: 'Beygir gücü yarışı',
    icon: '🏁',
    body: () =>
      'ABD’de ekonomi patlıyor, benzin ucuz. Alıcılar artık kaputun altındaki V8’i ve 0-100 süresini soruyor. Amerikan pazarında hızlanma, son hız ve prestijin önemi arttı.',
  },
  {
    id: 'imports_usa',
    year: 1955,
    month: 3,
    title: 'Küçük ithal arabalar',
    icon: '🚙',
    body: () =>
      'Volkswerk’in küçük, dayanıklı ve ucuz arabası Amerika’da beklenmedik bir başarı yakaladı. ABD’de şehir arabası pazarı büyüyor.',
  },
  {
    id: 'suez',
    year: 1956,
    month: 10,
    title: 'Süveyş krizi',
    icon: '🛢️',
    body: () =>
      'Süveyş Kanalı kapandı; Avrupa’da benzin karneye bağlandı. Önümüzdeki aylarda Avrupalı alıcılar için yakıt ekonomisi her zamankinden önemli.',
  },
];

export function eventDef(id: string): GameEventDef | undefined {
  return EVENTS.find((e) => e.id === id);
}
