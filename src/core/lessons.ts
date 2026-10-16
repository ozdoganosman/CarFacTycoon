import { msg } from '../i18n';
import { stationDef } from '../data/stations';
import { acquisitionTargets } from './acquisitions';
import { seasoned } from './autopilot';
import { blackPaintIsFaster, modernizeQuote } from './factory';
import { canGoPublic } from './shares';
import { yearFloat } from './time';
import type { CarModel, GameState, Project, ProjectPhase } from './types';

// The master's notebook: a lesson for each thing the game lets a player do, offered when it becomes
// there to do (a year, a second car, a war) and done when the player has done it. What has been done
// is read from the game itself (`used`, the kinds of decisions made, and the state), so an older save
// counts what it already did and a lesson never asks for something twice. One lesson is offered at a
// time, on a bar above the screen; it does not stop the clock. The first car's own steps stay with
// the guide (core/guide.ts); the small lessons of each of its steps show on the guide's bar.

/** A screen to go to, as the UI names it (ui/store.ts Screen), with a tab where the screen has them. */
export type LessonPlace =
  | { id: 'hq' | 'projects' | 'research' | 'models' | 'factory' | 'finance' | 'cards' | 'settings' }
  | { id: 'markets' | 'company'; tab?: string }
  | { id: 'project'; projectId: string; tab?: string }
  | { id: 'model'; modelId: string; tab?: string };

export interface LessonAt {
  place: LessonPlace;
  /** The control to point at (data-guide); several separated by '|', the first one on screen wins. */
  target?: string;
}

export interface Lesson {
  id: string;
  chapter: number;
  /** do: the lesson asks for the action itself; meet: it shows the screen and the rules (choices that cannot be undone, or cost a lot). */
  kind: 'do' | 'meet';
  title: string;
  /** What to do and why, in a sentence or two (shown beside the control). */
  text: string;
  where: (s: GameState) => LessonAt | null;
  /** The year it opens (said in the notebook while it is closed). */
  year?: number;
  /** Offered only while this holds: the feature is there and it makes sense now. */
  open?: (s: GameState) => boolean;
  /** Done (read from the game). A meet lesson is also done once read. */
  done: (s: GameState) => boolean;
  /** Never offered on the bar: it comes with a pop-up of its own (a recall, an event); the notebook keeps it. */
  passive?: boolean;
  /** Before it opens, what it waits for, in the notebook ("with the second car"). */
  waits?: string;
}

export const LESSON_CHAPTERS: { id: number; name: string }[] = [
  { id: 1, name: msg('İlk araba') },
  { id: 2, name: msg('Satış başladı') },
  { id: 3, name: msg('İkinci araba') },
  { id: 4, name: msg('Usta üretici') },
  { id: 5, name: msg('Şirket büyüyor') },
  { id: 6, name: msg('Kriz ve savaş') },
  { id: 7, name: msg('Altın çağ') },
  { id: 8, name: msg('Kolaylıklar') },
];

/** Weeks between one lesson ending and the next being offered. */
export const LESSON_GAP = 8;

// ---------------- what the game knows ----------------

/** The player used this kind of thing at some point (a decision's kind or a mark a screen left). */
export const used = (s: GameState, kind: string) => s.used?.[kind] !== undefined;
/** Leave a mark for what a screen showed or the player did there (a tab opened, the engine heard). */
export function noteUse(s: GameState, kind: string) {
  (s.used ??= {})[kind] = s.week;
}
const read = (s: GameState, id: string) => used(s, 'lesson:' + id);
const yf = (s: GameState) => yearFloat(s.week);
const active = (s: GameState) => s.models.filter((m) => m.status === 'active');
const hasCar = (s: GameState) => active(s).length > 0;
const newest = (s: GameState): CarModel | undefined => active(s).sort((a, b) => b.launchWeek - a.launchWeek)[0];
const firstLaunch = (s: GameState) => s.models.reduce((w, m) => Math.min(w, m.launchWeek), Infinity);
const inPhase = (s: GameState, ...phases: ProjectPhase[]): Project | undefined => s.projects.find((p) => phases.includes(p.phase));
const past = (s: GameState, phase: ProjectPhase) => s.models.length > 0 || s.projects.some((p) => ORDER[p.phase] > ORDER[phase]);
const ORDER: Record<ProjectPhase, number> = { design: 1, development: 2, testing: 3, production: 4, ready: 5 };

const toProject = (p: Project | undefined, target: string, tab?: string): LessonAt | null => (p ? { place: { id: 'project', projectId: p.id, tab }, target } : null);
const toModel = (m: CarModel | undefined, target: string, tab?: string): LessonAt | null => (m ? { place: { id: 'model', modelId: m.id, tab }, target } : null);

function linesToRenew(s: GameState): boolean {
  const y = yf(s);
  const black = blackPaintIsFaster(y) && s.lines.some((l) => l.stations.paint.some((id) => stationDef(id).blackOnly));
  return s.lines.some((l) => {
    const q = modernizeQuote(l, s.week, black);
    return q.after > q.before * 1.02;
  });
}

const suvOpen = (s: GameState) => yf(s) >= 1946 || (!!s.flags.jeep && yf(s) >= 1945.6);
const aged = (s: GameState) => active(s).find((m) => (s.week - m.refreshWeek) / 52 >= 3 && !s.projects.some((p) => p.replacesModelId === m.id));

// ---------------- the lessons ----------------

export const LESSONS: Lesson[] = [
  // 1. The first car: the guide's steps, and a small lesson in each.
  {
    id: 'project',
    chapter: 1,
    kind: 'do',
    title: msg('Bir proje aç'),
    text: msg('Arabanın sınıfını seç ve <b>Tasarıma başla</b>’ya bas: mühendisler ilk tasarımı hazırlar.'),
    where: () => ({ place: { id: 'projects' }, target: 'start-project|new-project' }),
    done: (s) => s.projects.length > 0 || s.models.length > 0,
  },
  {
    id: 'sound',
    chapter: 1,
    kind: 'do',
    title: msg('Motoru dinle'),
    text: msg('Motor sekmesinde <b>Kolla çalıştır</b>, sonra gaza bas. Silindirler, strok ve sıkıştırma sesi de gücü de değiştirir.'),
    where: (s) => toProject(inPhase(s, 'design', 'development'), 'engine-sound', 'engine'),
    open: (s) => !!inPhase(s, 'design', 'development'),
    waits: msg('bir projenin tasarımında'),
    done: (s) => used(s, 'sound'),
  },
  {
    id: 'paint',
    chapter: 1,
    kind: 'do',
    title: msg('Boyasını seç'),
    text: msg('Arabanın boyasını seç. Boya yalnızca görünüşü değiştirir; dönemin renkleri yıllarla çoğalır.'),
    where: (s) => toProject(inPhase(s, 'design', 'development'), 'paint'),
    open: (s) => !!inPhase(s, 'design', 'development'),
    waits: msg('bir projenin tasarımında'),
    done: (s) => used(s, 'paint'),
  },
  {
    id: 'priorities',
    chapter: 1,
    kind: 'do',
    title: msg('İki öncelik seç'),
    text: msg('Mühendis tahmininde iki alanı <b>öncelik</b> yap: mühendisler o alanlara daha çok çalışır, araba orada gerçekten daha iyi çıkar.'),
    where: (s) => toProject(inPhase(s, 'design', 'development'), 'priorities'),
    open: (s) => !!inPhase(s, 'design', 'development'),
    waits: msg('bir projenin tasarımında'),
    done: (s) => used(s, 'focus'),
  },
  {
    id: 'develop',
    chapter: 1,
    kind: 'do',
    title: msg('Geliştirmeyi başlat'),
    text: msg('Tasarım hazır olunca <b>Geliştirmeyi başlat</b>’a bas: mühendisler arabayı geliştirir, her hafta maaş ödenir.'),
    where: (s) => toProject(inPhase(s, 'design'), 'start-dev'),
    open: (s) => !!inPhase(s, 'design'),
    waits: msg('bir projenin tasarımında'),
    done: (s) => past(s, 'design'),
  },
  {
    id: 'prototypes',
    chapter: 1,
    kind: 'do',
    title: msg('Prototipleri yap'),
    text: msg('Geliştirme %100’ü geçince prototipleri yap ve teste geç. %110 civarı iyi bir yer; %160’tan sonrası arabaya bir şey katmaz.'),
    where: (s) => toProject(inPhase(s, 'development'), 'to-testing'),
    open: (s) => !!inPhase(s, 'development'),
    waits: msg('bir proje geliştirmedeyken'),
    done: (s) => past(s, 'development'),
  },
  {
    id: 'testplan',
    chapter: 1,
    kind: 'do',
    title: msg('Test planını ayarla'),
    text: msg('Bir testin süresini değiştir. Uzun test daha çok kusur bulur ama lansmanı geciktirir; kusur raporu neyin bulunduğunu söyler.'),
    where: (s) => toProject(inPhase(s, 'testing'), 'test-plan'),
    open: (s) => !!inPhase(s, 'testing'),
    waits: msg('bir proje testteyken'),
    done: (s) => used(s, 'testplan'),
  },
  {
    id: 'tooling',
    chapter: 1,
    kind: 'do',
    title: msg('Kalıpları sipariş et'),
    text: msg('Hattı ve kalıpları seç, kalıpları sipariş et. Yumuşak kalıp ucuz ve çabuk; hassas kalıp pahalı ama araba daha düzgün ve ucuz çıkar.'),
    where: (s) => toProject(inPhase(s, 'testing', 'production'), 'order-tooling|finish-tests'),
    open: (s) => !!inPhase(s, 'testing', 'production'),
    waits: msg('bir proje üretim hazırlığındayken'),
    done: (s) => used(s, 'tooling') || s.models.length > 0,
  },
  {
    id: 'price',
    chapter: 1,
    kind: 'do',
    title: msg('Fiyat rehberine bak'),
    text: msg('Fiyat rehberinde bir fiyata dokun: o fiyatta haftada kaç araba satılacağını ve ne kazanılacağını gösterir.'),
    where: (s) => toProject(inPhase(s, 'ready'), 'price-guide'),
    open: (s) => !!inPhase(s, 'ready'),
    waits: msg('bir araba lansmana hazırken'),
    done: (s) => used(s, 'priceGuide'),
  },
  {
    id: 'launch',
    chapter: 1,
    kind: 'do',
    title: msg('Arabayı piyasaya çıkar'),
    text: msg('Fiyatı seç ve <b>Lansmanı yap</b>. Fuarda tanıtmak para tutar ama arabayı daha çok kişi duyar.'),
    where: (s) => toProject(inPhase(s, 'ready'), 'launch'),
    open: (s) => !!inPhase(s, 'ready'),
    waits: msg('bir araba lansmana hazırken'),
    done: (s) => s.models.length > 0,
  },

  // 2. Sales have started.
  {
    id: 'why',
    chapter: 2,
    kind: 'meet',
    title: msg('Neden satıyor?'),
    text: msg('Araban sınıfındaki rakiplerle her alanda burada karşılaştırılır: alıcıların önem verdiği yerde gerideysen satış oradan kaçar.'),
    where: (s) => toModel(newest(s), 'competition', 'why'),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => read(s, 'why'),
  },
  {
    id: 'price-change',
    chapter: 2,
    kind: 'do',
    title: msg('Fiyatı ayarla'),
    text: msg('Fiyatı değiştir ya da <b>Fiyatı sınıfa endeksle</b>’yi aç. İlk üç yılda %8’den büyük bir zam bir aydan uzun sürerse basında tepki çeker.'),
    where: (s) => toModel(newest(s), 'model-price', 'summary'),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => used(s, 'price') || used(s, 'index'),
  },
  {
    id: 'capacity',
    chapter: 2,
    kind: 'meet',
    title: msg('Fabrika talebe yetişiyor mu?'),
    text: msg('Fabrika her araba için tek satır: talep, üretim, hat sayısı. <b>Otomatik</b> seçiliyse fabrika talebe göre kendisi büyür ve küçülür; <b>Elle</b> seçersen hatları sen kurarsın.'),
    where: () => ({ place: { id: 'factory' }, target: 'capacity' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => read(s, 'capacity') || used(s, 'autocap') || used(s, 'rate'),
  },
  {
    id: 'network',
    chapter: 2,
    kind: 'meet',
    title: msg('Bayi ağı'),
    text: msg('Otomatik bayi araması ve otomatik servis açıkken şirket sattıkça yeni eyaletlere kendisi açılır. Haritada bir eyalete dokunursan oradaki talebi görür, istersen elle bayi aratırsın.'),
    where: () => ({ place: { id: 'markets', tab: 'network' }, target: 'auto-network' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => read(s, 'network'),
  },
  {
    id: 'ads',
    chapter: 2,
    kind: 'do',
    title: msg('Reklamı seç'),
    text: msg('Reklam seviyesini seç: dönemin olağanı iyi bir başlangıç. Reklam bilinirliği artırır; 1915’ten sonra azını veren markanın itibarı yavaş yavaş düşer.'),
    where: () => ({ place: { id: 'markets', tab: 'market' }, target: 'ad-level' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => used(s, 'ads'),
  },
  {
    id: 'research',
    chapter: 2,
    kind: 'do',
    title: msg('Bir konu araştır'),
    text: msg('Bir konuyu araştır ya da sıraya ekle. Rakiplerde olup sende olmayanlar üstte; araştırılan teknoloji tasarımcıda açılır.'),
    where: () => ({ place: { id: 'research' }, target: 'research-list' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => used(s, 'research') || used(s, 'rqueue'),
  },
  {
    id: 'lab',
    chapter: 2,
    kind: 'do',
    title: msg('Laboratuvar payı'),
    text: msg('Mühendislerin bir payını laboratuvara ver: araştırma hızlanır ama o mühendisler araba geliştirmez.'),
    where: () => ({ place: { id: 'research' }, target: 'lab-share' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => used(s, 'lab'),
  },
  {
    id: 'money',
    chapter: 2,
    kind: 'meet',
    title: msg('Para nereye gider?'),
    text: msg('<b>Yatırımlar</b> boştaki paranın gidebileceği yerleri sıralar, en çabuk kendini ödeyen önde. Bir satıra dokununca kararın verildiği ekrana gidersin; kredi de bu ekranda.'),
    where: () => ({ place: { id: 'finance' }, target: 'money-uses|bank' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => read(s, 'money'),
  },
  {
    id: 'second',
    chapter: 2,
    kind: 'do',
    title: msg('İkinci arabayı başlat'),
    text: msg('Yeni bir sınıf ya da ilk arabanın yeni kuşağı: geliştirme bir iki yıl sürer, ilk araba o arada eskir.'),
    where: () => ({ place: { id: 'projects' }, target: 'new-project|start-project' }),
    open: (s) => hasCar(s) && s.projects.length === 0,
    waits: msg('ilk araba satışa çıkınca, çizim masası boşken'),
    done: (s) => s.models.length >= 2 || (s.models.length >= 1 && s.projects.some((p) => p.createdWeek >= firstLaunch(s))),
  },

  // 3. The second car.
  {
    id: 'parts',
    chapter: 3,
    kind: 'do',
    title: msg('Parçaları yap ya da al'),
    text: msg('Motoru, şanzımanı ve elektriği kim yapacak: ucuz tedarikçi, kaliteli tedarikçi ya da kendi atölyen. Kaliteli parça daha az arıza demek, atölye büyük hacimde ucuzlatır.'),
    where: (s) => toProject(inPhase(s, 'production'), 'parts'),
    open: (s) => s.company.modelsLaunched >= 1 && !!inPhase(s, 'production'),
    waits: msg('ikinci arabanın üretim hazırlığında'),
    done: (s) => used(s, 'supplier') || used(s, 'shop'),
  },
  {
    id: 'line',
    chapter: 3,
    kind: 'do',
    title: msg('Bir hat kur'),
    text: msg('Planlayıcıda hattın boyunu seç ve kur. Büyük hat daha çok üretir; kasa yetmezse planlayıcı krediyi önerir.'),
    where: () => ({ place: { id: 'factory' }, target: 'planner' }),
    open: (s) => s.models.length >= 1 && (s.projects.length > 0 || s.models.length >= 2),
    waits: msg('ikinci araba yoldayken'),
    done: (s) => used(s, 'turnkey') || used(s, 'workshop') || used(s, 'buyLine') || s.lines.length >= 2,
  },
  {
    id: 'bottleneck',
    chapter: 3,
    kind: 'do',
    title: msg('Darboğazı aç'),
    text: msg('Hattın hızını en yavaş bölümü belirler. O bölüme istasyon ekle ya da gece vardiyası aç.'),
    where: () => ({ place: { id: 'factory' }, target: 'bottleneck|line-panel|capacity' }),
    open: (s) => s.models.length >= 1 && s.lines.length > 0 && (s.projects.length > 0 || s.models.length >= 2),
    waits: msg('ikinci araba yoldayken'),
    done: (s) => used(s, 'station') || used(s, 'night') || used(s, 'expand'),
  },
  {
    id: 'hire',
    chapter: 3,
    kind: 'do',
    title: msg('Mühendis al'),
    text: msg('Daha çok mühendis projeleri hızlandırır ama her biri maaş ister. Mühendisler boşta kalınca Merkez söyler.'),
    where: () => ({ place: { id: 'hq' }, target: 'hire' }),
    open: (s) => s.models.length >= 1 && s.projects.length > 0,
    waits: msg('ikinci araba yoldayken'),
    done: (s) => used(s, 'staff'),
  },
  {
    id: 'org',
    chapter: 3,
    kind: 'meet',
    title: msg('Mühendislik teşkilatı'),
    text: msg('Ekip büyüdükçe bir teşkilat ister: çizim ofisi, mühendislik binası, deneme pisti… Her kademe bir ekibin daha çok mühendisle verimli çalışmasını sağlar.'),
    where: () => ({ place: { id: 'company', tab: 'general' }, target: 'engineering' }),
    open: (s) => s.models.length >= 1 && s.projects.length > 0,
    waits: msg('ikinci araba yoldayken'),
    done: (s) => read(s, 'org') || used(s, 'engineering'),
  },

  // 4. A seasoned maker.
  {
    id: 'platform',
    chapter: 4,
    kind: 'do',
    title: msg('Platformu paylaş'),
    text: msg('Yeni arabayı eski bir arabanın platformuyla ya da motoruyla yap: geliştirme kısalır, kalıplar ucuzlar; bedeli arabaların birbirine benzemesi.'),
    where: (s) => toProject(inPhase(s, 'design'), 'platform', 'chassis'),
    open: (s) => s.company.modelsLaunched >= 2 && !!inPhase(s, 'design'),
    waits: msg('üçüncü arabanın tasarımında'),
    done: (s) => used(s, 'platform'),
  },
  {
    id: 'auto',
    chapter: 4,
    kind: 'do',
    title: msg('Kendiliğinden ilerlesin'),
    text: msg('Bu seçim açıkken proje lansmana kadar kendi yürür: mühendisler cilalar, testler yapılır, kalıplar sipariş edilir. Seni yalnızca fiyat için çağırır.'),
    where: (s) => toProject(s.projects.find((p) => p.phase !== 'ready' && p.productionReadyWeek === undefined), 'auto'),
    open: (s) => seasoned(s) && s.projects.some((p) => p.phase !== 'ready' && p.productionReadyWeek === undefined),
    waits: msg('üçüncü arabayla'),
    done: (s) => used(s, 'auto'),
  },
  {
    id: 'refresh',
    chapter: 4,
    kind: 'do',
    title: msg('Makyaj ya da yeni kuşak'),
    text: msg('Bu araba eskiyor. <b>Makyaj</b> ucuz ve çabuk; <b>yeni kuşak</b> pahalı ama arabayı yeniden genç yapar.'),
    where: (s) => toModel(aged(s), 'refresh', 'summary'),
    open: (s) => !!aged(s),
    waits: msg('bir araba üç yaşını geçince'),
    done: (s) => s.projects.some((p) => p.kind === 'facelift' || !!p.replacesModelId) || s.models.some((m) => m.generation > 1 || m.faceliftCount > 0),
  },
  {
    id: 'renew',
    chapter: 4,
    kind: 'do',
    title: msg('Eski hatları yenile'),
    text: msg('Yeni makineler çıktı: <b>Hepsini yenile</b> eski hatları bugünün makineleriyle tek seferde yeniden kurar.'),
    where: () => ({ place: { id: 'factory' }, target: 'renew-all' }),
    open: (s) => s.models.length >= 2 && linesToRenew(s),
    waits: msg('yeni makineler çıkınca'),
    done: (s) => used(s, 'modernize'),
  },
  {
    id: 'retire',
    chapter: 4,
    kind: 'do',
    title: msg('Eski modeli kaldır'),
    text: msg('Artık satmayan bir modeli <b>Üretimden kaldır</b>: hatları yeni arabalara kalır, stoktaki arabalar satılmaya devam eder.'),
    where: (s) => toModel(active(s).sort((a, b) => a.refreshWeek - b.refreshWeek)[0], 'retire', 'summary'),
    open: (s) => active(s).length >= 2 && active(s).some((m) => (s.week - m.refreshWeek) / 52 >= 6),
    waits: msg('iki araba satıştayken biri altı yaşını geçince'),
    done: (s) => s.models.some((m) => m.status === 'retired'),
  },
  {
    id: 'poster',
    chapter: 4,
    kind: 'meet',
    title: msg('İlan ve mektuplar'),
    text: msg('Arabanın dönem ilanı ve alıcıların mektupları burada. İlanı resim olarak indirip paylaşabilirsin; mektuplar arabanın neyini sevdiklerini anlatır.'),
    where: (s) => toModel(newest(s), 'poster', 'ad'),
    open: (s) => s.models.length >= 2 && hasCar(s),
    waits: msg('ikinci arabayla'),
    done: (s) => read(s, 'poster'),
  },
  {
    id: 'recall',
    chapter: 4,
    kind: 'meet',
    title: msg('Kusur çıkınca'),
    text: msg('Sahada bir kusur çıkınca karar senin: geri çağırmak pahalıdır ama itibarı korur; sessiz kalmak ucuzdur ama kusur büyüdükçe itibar gider.'),
    where: () => null,
    passive: true,
    waits: msg('ilk kusur çıkınca'),
    done: (s) => used(s, 'recall'),
  },

  // 5. The company grows.
  {
    id: 'racing',
    chapter: 5,
    kind: 'do',
    title: msg('Yarışa gir'),
    text: msg('Bir yarış takımı kur: amatör seviye ucuzdur. Kazanılan yarışlar ün ve bilinirlik getirir; büyük yarışlar pahalıdır.'),
    where: () => ({ place: { id: 'company', tab: 'racing' }, target: 'racing-level' }),
    year: 1906,
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => (s.racing?.level ?? 0) > 0 || used(s, 'racing'),
  },
  {
    id: 'board',
    chapter: 5,
    kind: 'meet',
    title: msg('Borsa ve yönetim kurulu'),
    text: msg('Halka arz şirkete büyük para getirir ama geri dönüşü yoktur: yönetim kurulu her yıl büyüme ve kâr ister, üst üste kaçırırsan seni görevden alabilir.'),
    where: () => ({ place: { id: 'company', tab: 'shares' }, target: 'ipo' }),
    year: 1908,
    open: (s) => !!s.shares || canGoPublic(s).ok,
    waits: msg('şirket borsaya yeterince büyüyünce'),
    done: (s) => read(s, 'board') || !!s.shares,
  },
  {
    id: 'plants',
    chapter: 5,
    kind: 'meet',
    title: msg('Tedarik fabrikaları'),
    text: msg('Kendi gövde, lastik, cam ve çelik fabrikaların malzemeyi ucuzlatır ama yalnızca büyük hacimde kendini öder; ekran her birinin kaç yılda ödediğini söyler.'),
    where: () => ({ place: { id: 'factory' }, target: 'plants' }),
    year: 1910,
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => read(s, 'plants') || used(s, 'plant'),
  },
  {
    id: 'buyers',
    chapter: 5,
    kind: 'do',
    title: msg('Pazar araştırması'),
    text: msg('Bir sınıfın pazar araştırmasını yap: alıcıların o sınıfta neye ne kadar önem verdiği tam olarak görünür.'),
    where: () => ({ place: { id: 'markets', tab: 'buyers' }, target: 'market-research' }),
    open: (s) => hasCar(s) && s.models.length >= 2,
    waits: msg('ikinci arabayla'),
    done: (s) => used(s, 'market'),
  },
  {
    id: 'acquire',
    chapter: 5,
    kind: 'meet',
    title: msg('Rakip satın al'),
    text: msg('Senden az satan bir rakibi satın alabilirsin: bayileri, adı ve müşterileri şirkete katılır. Bedeli yarım yıllık cirosu kadar.'),
    where: () => ({ place: { id: 'company', tab: 'rivals' }, target: 'acquire' }),
    open: (s) => hasCar(s) && acquisitionTargets(s).length > 0,
    waits: msg('senden az satan bir rakip olunca'),
    done: (s) => read(s, 'acquire') || (s.acquired?.length ?? 0) > 0,
  },

  // 6. Crisis and war.
  {
    id: 'wages',
    chapter: 6,
    kind: 'meet',
    title: msg('Beş dolar günü'),
    text: msg('1914’te ücretleri ikiye katlayan üretici işçi devrini bitirdi. Sen de ücretleri artırırsan hatlar hızlanır ama her araba biraz daha pahalıya çıkar.'),
    where: () => null,
    passive: true,
    year: 1914,
    done: (s) => s.firedEvents.includes('five_dollar') && !s.modals.some((m) => m.kind === 'event' && m.eventId === 'five_dollar'),
  },
  {
    id: 'military',
    chapter: 6,
    kind: 'do',
    title: msg('Askeri üretim'),
    text: msg('Savaş sözleşmen var: bir hatta <b>Askeri üretim</b>’i aç. Ordu için çalışan hat sivil araba yapmaz ama devlet her haftasını öder.'),
    where: () => ({ place: { id: 'factory' }, target: 'military|line-panel' }),
    open: (s) => (s.flags.militaryUntil ?? 0) > yf(s) && s.lines.length > 0,
    waits: msg('bir savaş sözleşmesiyle'),
    done: (s) => used(s, 'military'),
  },
  {
    id: 'crash',
    chapter: 6,
    kind: 'meet',
    title: msg('Buhran'),
    text: msg('Banka kredi limitini yarıya indirdi, faiz yükseldi. Kasayı koru: üretimi talebe indir, kendini çabuk ödemeyen yatırımları ertele.'),
    where: () => ({ place: { id: 'finance' }, target: 'bank' }),
    year: 1929.8,
    open: (s) => yf(s) < 1934 && hasCar(s),
    waits: msg('buhran yıllarında'),
    done: (s) => read(s, 'crash'),
  },
  {
    id: 'rivals',
    chapter: 6,
    kind: 'meet',
    title: msg('Rakipler karşılık veriyor'),
    text: msg('Öne geçince rakipler boş durmaz: fiyat savaşı, teknoloji atağı, birleşme. Neler yaptıkları burada.'),
    where: () => ({ place: { id: 'company', tab: 'rivals' }, target: 'rival-moves' }),
    open: (s) => (s.rivalMoves?.history.length ?? 0) > 0,
    waits: msg('bir sınıfta öne geçince'),
    done: (s) => read(s, 'rivals'),
  },

  // 7. The golden age.
  {
    id: 'suv',
    chapter: 7,
    kind: 'meet',
    title: msg('Arazi aracı'),
    text: msg('Savaşın cipinden yeni bir sınıf doğdu: arazi aracı. Yeni bir projede sınıf olarak seçilebilir.'),
    where: () => ({ place: { id: 'projects' }, target: 'new-project|start-project' }),
    year: 1945.6,
    open: suvOpen,
    done: (s) => read(s, 'suv') || s.projects.some((p) => p.segment === 'suv') || s.models.some((m) => m.segment === 'suv'),
  },
  {
    id: 'techcenter',
    chapter: 7,
    kind: 'meet',
    title: msg('Teknik merkez'),
    text: msg('Teşkilatın son kademesi: büyük bir şirketin yüzlerce mühendisi tek bir merkezde verimli çalışır.'),
    where: () => ({ place: { id: 'company', tab: 'general' }, target: 'engineering' }),
    year: 1948,
    open: (s) => (s.engineering ?? 0) >= 2,
    waits: msg('mühendislik binasından sonra'),
    done: (s) => read(s, 'techcenter') || (s.engineering ?? 0) >= 5,
  },
  {
    id: 'twotone',
    chapter: 7,
    kind: 'do',
    title: msg('Çift renk'),
    text: msg('Ellilerin modası: arabanın tavanına ayrı bir renk seç.'),
    where: (s) => toProject(inPhase(s, 'design', 'development'), 'paint'),
    year: 1950,
    open: (s) => !!inPhase(s, 'design', 'development'),
    waits: msg('bir projenin tasarımında'),
    done: (s) => s.projects.some((p) => !!p.design.roof) || s.models.some((m) => !!m.design.roof),
  },

  // 8. Conveniences.
  {
    id: 'speed',
    chapter: 8,
    kind: 'do',
    title: msg('Zamanı hızlandır'),
    text: msg('Üstteki düğmelerle zamanı hızlandır: en hızlısında bir yıl birkaç saniyede geçer. Klavyede boşluk durdurur, 1-2-3 hızı seçer.'),
    where: () => ({ place: { id: 'hq' }, target: 'speed' }),
    open: hasCar,
    waits: msg('ilk araba satışa çıkınca'),
    done: (s) => used(s, 'speed3'),
  },
  {
    id: 'cards',
    chapter: 8,
    kind: 'meet',
    title: msg('Bilgi kartları'),
    text: msg('Dönemin teknolojilerini ve olaylarını anlatan kartlar burada toplanır; yenileri yıllar geçtikçe gelir.'),
    where: () => ({ place: { id: 'cards' } }),
    open: (s) => s.models.length >= 2,
    waits: msg('ikinci arabayla'),
    done: (s) => read(s, 'cards'),
  },
  {
    id: 'save',
    chapter: 8,
    kind: 'meet',
    title: msg('Kayıt kodu'),
    text: msg('Oyun her çeyrekte kendini kaydeder. Kayıt kodunu kopyalayıp başka bir cihazda ya da tarayıcıda oyununu sürdürebilirsin.'),
    where: () => ({ place: { id: 'settings' }, target: 'save-code' }),
    open: (s) => s.models.length >= 2,
    waits: msg('ikinci arabayla'),
    done: (s) => read(s, 'save'),
  },
  {
    id: 'engineer',
    chapter: 8,
    kind: 'meet',
    title: msg('Mühendis modu'),
    text: msg('Mühendis modu motoru silindirinden supabına kadar tasarlatır; kapatırsan hazır motorlardan seçer, yalnızca karakterini ayarlarsın.'),
    where: () => ({ place: { id: 'settings' }, target: 'engineer-mode' }),
    open: (s) => s.models.length >= 2,
    waits: msg('ikinci arabayla'),
    done: (s) => read(s, 'engineer'),
  },
  {
    id: 'feedback',
    chapter: 8,
    kind: 'meet',
    title: msg('Geri bildirim'),
    text: msg('Takıldığın ya da beğenmediğin bir şey olursa buradan yaz: notun oyunun o anki durumuyla birlikte gelir.'),
    where: () => ({ place: { id: 'hq' }, target: 'feedback|nav-more' }),
    open: (s) => s.models.length >= 2,
    waits: msg('ikinci arabayla'),
    done: (s) => read(s, 'feedback'),
  },
];

const BY_ID = new Map(LESSONS.map((l) => [l.id, l]));
export const lessonById = (id: string) => BY_ID.get(id);

// ---------------- the notebook ----------------

export const lessonsOn = (s: GameState) => s.settings.lessons !== false;

export function lessonBook(s: GameState) {
  return (s.lessons ??= { done: {}, skipped: [] });
}

export const lessonDone = (s: GameState, id: string) => s.lessons?.done[id] !== undefined;
const skipped = (s: GameState, id: string) => !!s.lessons?.skipped.includes(id);

/** Whether a lesson can be offered now (its year has come and its feature is there). */
export function lessonOpen(s: GameState, l: Lesson): boolean {
  if (l.passive) return false;
  if (l.year !== undefined && yf(s) < l.year) return false;
  return l.open ? l.open(s) : true;
}

/**
 * Mark the lessons whose work the game shows done. Returns those done just now; the next lesson is
 * offered LESSON_GAP weeks after one is done (the first car's launch included).
 */
export function checkLessons(s: GameState): string[] {
  const book = lessonBook(s);
  const fresh: string[] = [];
  for (const l of LESSONS) {
    if (book.done[l.id] !== undefined || !l.done(s)) continue;
    book.done[l.id] = s.week;
    fresh.push(l.id);
  }
  if (fresh.length) book.lastWeek = s.week;
  if (book.active && book.done[book.active] !== undefined) book.active = undefined;
  return fresh;
}

/** The lesson offered now: the one the player started, else the next open one once a few weeks have passed. */
export function offeredLesson(s: GameState): Lesson | undefined {
  if (!lessonsOn(s) || s.gameOver) return undefined;
  const book = lessonBook(s);
  const started = book.active ? lessonById(book.active) : undefined;
  if (started && !lessonDone(s, started.id) && !skipped(s, started.id) && started.where(s)) return started;
  if (s.week - (book.lastWeek ?? -1e9) < LESSON_GAP) return undefined;
  return LESSONS.find((l) => !lessonDone(s, l.id) && !skipped(s, l.id) && lessonOpen(s, l) && l.where(s));
}

/** The player asked for this lesson (from the bar or the notebook). */
export function startLesson(s: GameState, id: string) {
  if (lessonById(id)) lessonBook(s).active = id;
}

/** The player read a meet lesson (it is done). */
export function readLesson(s: GameState, id: string) {
  noteUse(s, 'lesson:' + id);
  checkLessons(s);
}

export function skipLesson(s: GameState, id: string) {
  const book = lessonBook(s);
  if (!book.skipped.includes(id)) book.skipped.push(id);
  if (book.active === id) book.active = undefined;
  book.lastWeek = s.week;
}

export function setLessonsOn(s: GameState, on: boolean) {
  s.settings.lessons = on;
}

/** Lessons done, of all, and the title they earn. */
export function lessonProgress(s: GameState): { done: number; total: number; tier: string } {
  const done = LESSONS.filter((l) => lessonDone(s, l.id)).length;
  const share = done / LESSONS.length;
  return { done, total: LESSONS.length, tier: share >= 0.75 ? msg('Usta') : share >= 0.4 ? msg('Kalfa') : msg('Çırak') };
}

/** A chapter's lessons, done of all. */
export function chapterProgress(s: GameState, chapter: number) {
  const ls = LESSONS.filter((l) => l.chapter === chapter);
  return { done: ls.filter((l) => lessonDone(s, l.id)).length, total: ls.length };
}

/** The small lessons of the first car's current step, shown on the guide's bar (ids, in order). */
export function guideLessons(s: GameState, step: string): Lesson[] {
  const ids: Record<string, string[]> = {
    design: ['paint', 'sound', 'priorities'],
    development: ['priorities'],
    testing: ['testplan'],
    launch: ['price'],
  };
  return (ids[step] ?? []).map((id) => lessonById(id)!).filter((l) => !skipped(s, l.id) && l.where(s));
}
