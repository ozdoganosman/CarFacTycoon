import { msg } from '../i18n';

// "Neden böyle çalışıyor?" knowledge cards. Each unlocks with its technology.

export interface CardDef {
  id: string;
  title: string;
  year: number;
  anim:
    | 'fourStroke'
    | 'gearbox'
    | 'movingLine'
    | 'electricStarter'
    | 'hydraulicBrake'
    | 'synchromesh'
    | 'monocoque'
    | 'independentSuspension'
    | 'duco'
    | 'supercharger';
  body: string;
  gameplay: string;
}

export const CARDS: CardDef[] = [
  {
    id: 'fourStroke',
    title: msg('Dört zamanlı motor'),
    year: 1900,
    anim: 'fourStroke',
    body: msg('Piston dört hareketle bir kez iş üretir: emme, sıkıştırma, ateşleme ve egzoz. Silindir çapı ve strok (piston yolu) motorun hacmini belirler. Uzun strok düşük devirde çok tork verir ama piston hızı sınırına çabuk ulaşır, bu yüzden motor yüksek devir çeviremez. Kısa strok daha yüksek devir ve güç demektir.'),
    gameplay: msg('Motor ekranındaki “Karakter” kaydırıcısı bu dengeyi ayarlar. Avrupa’daki vergi beygiri yalnızca silindir çapına baktığı için orada uzun strok vergiyi düşürür.'),
  },
  {
    id: 'gearbox',
    title: msg('Şanzıman neden var?'),
    year: 1900,
    anim: 'gearbox',
    body: msg('Benzinli motor sadece belli bir devir aralığında güçlüdür ve sıfır devirde hiç tork üretmez. Vitesler, araç hızından bağımsız olarak motoru güçlü olduğu aralıkta tutar. Kısa vitesler aracı çevik yapar, uzun vitesler yolda devri düşürüp yakıt tasarrufu sağlar.'),
    gameplay: msg('Vites sayısını artırmak testere dişi eğrisini ideal güç eğrisine yaklaştırır. “Kısa–uzun” kaydırıcısı hızlanma, son hız ve tüketim arasında seçim yaptırır.'),
  },
  {
    id: 'electricStarter',
    title: msg('Elektrikli marş'),
    year: 1912,
    anim: 'electricStarter',
    body: msg('Motoru elle kolla çevirmek güç ister ve tehlikelidir: motor geri teperse kol kolu kırabilir. 1912’de Cadillac’ın Charles Kettering ile geliştirdiği elektrikli marş, aküden beslenen küçük bir motorla volanı çevirir. Artık herkes araba kullanabilir.'),
    gameplay: msg('Elektrikli marş pratiklik ve konforu belirgin biçimde artırır. Kadın sürücüler ve şehirliler için büyük fark yaratır.'),
  },
  {
    id: 'movingLine',
    title: msg('Hareketli montaj hattı'),
    year: 1913,
    anim: 'movingLine',
    body: msg('Eskiden bir ekip tek bir aracın etrafında dolaşıp her şeyi yapardı. Hareketli hatta araç zincirle işçinin önünden geçer ve her işçi tek bir işi tekrar eder. Kimse yürümez, kimse alet aramaz. 1913’te şasi montajı 12,5 saatten 93 dakikaya indi.'),
    gameplay: msg('Montaj istasyonu çok hızlanır ama hat en yavaş istasyon kadar hızlıdır. Montajı hızlandırınca pres, gövde ya da boya darboğaz olur.'),
  },
  {
    id: 'hydraulicBrake',
    title: msg('Hidrolik fren'),
    year: 1921,
    anim: 'hydraulicBrake',
    body: msg('Pascal ilkesi: kapalı bir sıvıya uygulanan basınç her yöne eşit iletilir. Pedal küçük bir pistona basar; oluşan basınç borularla dört tekerdeki daha büyük pistonlara ulaşır. Büyük pistonun alanı kadar kuvvet çoğalır ve dört teker eşit frenlenir. Mekanik halatlarda ise her teker farklı gerilir.'),
    gameplay: msg('Hidrolik fren güvenliği ve yol tutuşu artırır. Önce dört teker fren gerekir.'),
  },
  {
    id: 'supercharger',
    title: msg('Kompresör'),
    year: 1921,
    anim: 'supercharger',
    body: msg('Motorun gücü, silindire ne kadar hava (ve yakıt) sokabildiğine bağlıdır. Krank milinden dönen Roots üfleyicisi havayı silindire basınçla doldurur. Aynı hacimden %30-40 daha fazla güç çıkar; ama üfleyiciyi çevirmek güç yer, motor ısınır ve daha çok yakar.'),
    gameplay: msg('Kompresör spor araçlar için güçlü bir silahtır; güvenilirlik ve yakıt ekonomisinden ödün verirsin.'),
  },
  {
    id: 'duco',
    title: msg('Hızlı kuruyan boya'),
    year: 1924,
    anim: 'duco',
    body: msg('Fırçayla sürülen vernik kat kat uygulanır ve her kat günlerce kurur; fabrikalar boyalı gövdelerle dolup taşar. Model T döneminde siyahın tercih edilmesinin sebebi “Japan” siyahının fırında en hızlı kuruyan boya olmasıydı. 1924’te sprey tabancayla uygulanan Duco lakesi saatler içinde kurudu ve renkler geri geldi.'),
    gameplay: msg('Boya istasyonu çoğu zaman gizli darboğazdır. Duco sprey boya hem kapasiteyi artırır hem de “sadece siyah” cezasını kaldırır.'),
  },
  {
    id: 'synchromesh',
    title: msg('Senkromeçli şanzıman'),
    year: 1928,
    anim: 'synchromesh',
    body: msg('Farklı hızlarda dönen iki dişliyi birbirine geçirmeye çalışırsan dişler çatırdar. Eskiden sürücüler “çift debriyaj” yapıp devri elle eşitlerdi. Senkromeçte önce pirinç bir koni sürtünerek iki parçanın hızını eşitler, sonra dişler sessizce kavrar.'),
    gameplay: msg('Senkromeç konforu ve pratikliği artırır, vites değişimini hızlandırır.'),
  },
  {
    id: 'monocoque',
    title: msg('Monokok gövde'),
    year: 1934,
    anim: 'monocoque',
    body: msg('Merdiven şaside yükü iki kalın kiriş taşır, gövde sadece üstüne oturur. Monokokta gövde kabuğunun kendisi yükü taşır: yumurta kabuğu gibi. Aynı sağlamlık daha az malzemeyle elde edilir; araç hafifler ve burulmaya karşı daha rijit olur.'),
    gameplay: msg('Monokok ağırlığı düşürür, yol tutuşu ve güvenliği artırır ama pres kalıpları pahalıdır (kalıp maliyeti artar).'),
  },
  {
    id: 'independentSuspension',
    title: msg('Bağımsız süspansiyon'),
    year: 1934,
    anim: 'independentSuspension',
    body: msg('Sabit aksta iki tekerlek aynı kirişe bağlıdır: biri tümseğe çıkınca diğeri de eğilir, gövde sallanır. Bağımsız süspansiyonda her tekerlek kendi kolunda hareket eder; tümsek yalnızca o tekerleği etkiler.'),
    gameplay: msg('Bağımsız süspansiyon konforu ve yol tutuşu birlikte artırır; konfor–yol tutuş kaydırıcısındaki bedeli azaltır.'),
  },
];

export function cardDef(id: string): CardDef | undefined {
  return CARDS.find((c) => c.id === id);
}
