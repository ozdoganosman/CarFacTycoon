import { msg, t } from '../i18n';

// Newspaper copy for the day a technology appears in the world, written in
// the manner of period front pages. Makers are never named: "a Paris firm",
// "a Detroit engineer". World news items are real events, kept brief.

export interface Story {
  headline: string;
  deck: string;
  body: string;
}

export const TECH_NEWS: Record<string, Story> = {
  'kh:honeycomb': {
    headline: msg('Motor Artık Kaynamıyor'),
    deck: msg('Yüzlerce ince borudan yapılmış “petek” radyatör yokuşların korkusunu bitirdi'),
    body: msg('Bir Alman fabrikasının yarış arabasında ilk kez görülen petek radyatör, soğutma suyunu eskisinin birkaç katı hızla serinletiyor. Uzun yokuşlarda buhar salan, yol kenarında soğumayı bekleyen otomobiller yakında geçmişte kalabilir.'),
  },
  'kh:magneto': {
    headline: msg('Kıvılcım Artık Mıknatıstan'),
    deck: msg('Yüksek gerilim manyetosu kızgın tüplü ateşlemeyi tarihe gömüyor'),
    body: msg('Motorun kendi döndürdüğü bir mıknatıstan kıvılcım üreten yeni düzenek, alevli tüplerle uğraşmayı ve zayıf pilleri gereksiz kılıyor. Mühendisler motorun yağmurda, soğukta ve yüksek devirde bile tekleme yapmadan çalıştığını bildiriyor.'),
  },
  'kh:shaftDrive': {
    headline: msg('Zincir Devri Kapanıyor mu?'),
    deck: msg('Kapalı kardan mili, arka tekerleklere sessizce güç veriyor'),
    body: msg('Fransız bir üreticinin denediği kardan mili tahriki, yağlı ve gürültülü zincirleri kapalı bir boru içine alıyor. Sürücüler pantolonlarına sıçrayan yağdan, yolda kopan zincirden kurtulmanın sevincini yaşıyor.'),
  },
  'kh:frictionDampers': {
    headline: msg('Sallanan Araba Sallanmayacak'),
    deck: msg('Sürtünmeli amortisör, yayların sonsuz sekmesine fren oluyor'),
    body: msg('Birbirine sürtünen disklerden yapılan küçük bir düzenek, otomobilin çukurdan çıktıktan sonra dakikalarca sallanmasını önlüyor. Yolcular deniz tutmasından şikâyet etmeyecek.'),
  },
  'kh:detachableRims': {
    headline: msg('Patlak Lastik Artık Felaket Değil'),
    deck: msg('Jantıyla sökülen lastik yolda dakikalar içinde değişiyor'),
    body: msg('Sürücülerin kabusu olan yol kenarında lastik yamama işi, sökülebilir jantla birkaç dakikalık bir işe dönüşüyor. Otomobil kulüpleri yeniliği “uzun yolculuğun kurtarıcısı” diye selamlıyor.'),
  },
  'kh:detachableHead': {
    headline: msg('Motor Bloğu İkiye Bölündü'),
    deck: msg('Sökülebilir silindir kapağı dökümü ucuzlatıyor, bakımı kolaylaştırıyor'),
    body: msg('Blok ve kapağın ayrı dökülmesi, fabrikalarda hurdaya çıkan döküm sayısını azaltıyor. Tamirciler artık supaplara ulaşmak için motoru baştan sona sökmek zorunda değil.'),
  },
  'kh:pressureLube': {
    headline: msg('Yataklar Artık Erimeyecek'),
    deck: msg('Basınçlı yağlama yüksek devirli motorların önünü açıyor'),
    body: msg('Bir pompa, yağı krank yataklarına basınçla iterek sıçratmaya dayalı eski düzenin yerini alıyor. Mühendisler yeni motorların uzun otoyol yolculuklarında bile yatak sarmadığını söylüyor.'),
  },
  'kh:alloyPistons': {
    headline: msg('Hafif Metal Motoru Uçuruyor'),
    deck: msg('Alüminyum pistonlar dökme demirin üçte biri ağırlığında'),
    body: msg('Uçak motorlarından otomobile geçen alüminyum pistonlar, motorların daha çabuk devir almasını ve daha az titreşmesini sağlıyor. Yarış pilotları farkı ilk turda hissettiklerini söylüyor.'),
  },
  'kh:airFilter': {
    headline: msg('Toz Artık Motora Giremeyecek'),
    deck: msg('Hava filtresi silindirlerin ömrünü uzatıyor'),
    body: msg('Toprak yolların ince tozu yıllardır motorların sessiz düşmanıydı. Karbüratörün ağzına takılan filtre, silindirleri zımpara gibi aşındıran tozu dışarıda tutuyor.'),
  },
  'kh:thermostat': {
    headline: msg('Motora Termometre Kondu'),
    deck: msg('Termostat soğuk sabahlarda motoru çabuk ısıtıyor'),
    body: msg('Motor ısınana kadar suyu radyatöre göndermeyen küçük bir valf, kış aylarında yakıt tüketimini belirgin biçimde azaltıyor. Sürücüler sabah kalkışlarında boğulan motorlardan kurtuluyor.'),
  },
  'kh:oilFilter': {
    headline: msg('Kara Yağa Veda'),
    deck: msg('Yağ filtresi metal tozunu süzüyor, motor yıllarca yaşıyor'),
    body: msg('Motor yağındaki aşınma tozunu tutan filtre, yağ değişimlerini seyrekleştiriyor ve yatakları koruyor. Kamyon filoları ilk sonuçlardan çok memnun.'),
  },
  'kh:balloonTires': {
    headline: msg('Yollar Birden Düzleşti!'),
    deck: msg('Geniş ve düşük basınçlı balon lastikler sarsıntıyı yutuyor'),
    body: msg('Yeni balon lastikler taş yollarda bile yolcuları pamuk üstünde taşıyor. Lastik fabrikaları siparişlere yetişemiyor; eski ince lastikli otomobillerin değeri düşüyor.'),
  },
  'kh:hydraulicDampers': {
    headline: msg('Yağla Çalışan Amortisör'),
    deck: msg('Hidrolik amortisör küçük darbede yumuşak, büyükte sıkı'),
    body: msg('Yağın küçük deliklerden geçmesiyle çalışan amortisör, sürtünmeli eski tipin sertliğini ve gıcırtısını ortadan kaldırıyor. Viraj tutuşu ve konfor aynı anda iyileşiyor.'),
  },
  'kh:hypoid': {
    headline: msg('Otomobil Alçalıyor'),
    deck: msg('Hipoid diferansiyel kardan milini yere yaklaştırıyor'),
    body: msg('Pinyon dişlisinin aksın altından girdiği yeni diferansiyel, kabinin tabanını birkaç parmak alçaltıyor. Tasarımcılar daha basık ve zarif gövdelerin önünün açıldığını söylüyor.'),
  },
  'kh:vacuumAdvance': {
    headline: msg('Avans Kolu Emekliye Ayrıldı'),
    deck: msg('Ateşleme zamanı artık motorun kendisi ayarlıyor'),
    body: msg('Sürücünün direksiyondaki kolla ayarladığı kıvılcım zamanı, vakum ve merkezkaç ağırlıklarıyla kendiliğinden ayarlanıyor. Motorlar daha az yakıyor, yokuşta vuruntu yapmıyor.'),
  },
  'kh:autoChoke': {
    headline: msg('Kışın Bile İlk Seferde'),
    deck: msg('Otomatik jikle soğuk motoru kendiliğinden çalıştırıyor'),
    body: msg('Sıcaklığa duyarlı bir yay, soğuk motorda karışımı zenginleştiriyor ve motor ısındıkça geri çekiliyor. Artık araba çalıştırmak ustalık istemiyor.'),
  },
  'kh:streamlining': {
    headline: msg('Rüzgâr Tünelinden Çıkan Otomobil'),
    deck: msg('Aerodinamik gövde aynı motorla daha hızlı ve daha az yakıyor'),
    body: msg('Uçak mühendislerinin rüzgâr tünelinde denediği yuvarlak burunlu, eğik camlı gövdeler hava direncini belirgin biçimde azaltıyor. Eleştirmenler görünüşü tartışıyor, mühendisler rakamları.'),
  },
  'kh:antiRoll': {
    headline: msg('Virajda Yatmayan Otomobil'),
    deck: msg('Burulmalı denge çubuğu iki tekerleği birbirine bağlıyor'),
    body: msg('Yumuşak yaylı otomobillerin virajda gemi gibi yatması bir çubukla önleniyor. Konforu bozmadan isabetli yol tutuş mümkün hale geliyor.'),
  },
  'kh:overdrive': {
    headline: msg('Dördüncü Vitesin Üstünde Bir Vites Daha'),
    deck: msg('Overdrive otoyolda motoru dinlendiriyor'),
    body: msg('Son vitesin üstüne eklenen kademe, yüksek hızda motor devrini düşürerek hem yakıtı hem motor ömrünü koruyor. Uzun yol sürücüleri sessizliğe hayran.'),
  },
  'kh:rackPinion': {
    headline: msg('Direksiyonda Boşluk Kalmadı'),
    deck: msg('Kremayer dişlisi tekerlekleri doğrudan yönlendiriyor'),
    body: msg('Direksiyon milinin ucundaki dişlinin bir kremayeri ittiği basit düzenek, eski direksiyon kutularının boşluğunu ortadan kaldırıyor. Sürücüler yolu parmak uçlarında hissediyor.'),
  },
  'kh:radialTires': {
    headline: msg('Çelik Kuşaklı Lastik Geldi'),
    deck: msg('Radyal lastik yolu daha sıkı kavrıyor, daha az yakıyor'),
    body: msg('Fransız lastik ustalarının geliştirdiği radyal yapı, lastiğin yola geniş bir yüzeyle basmasını sağlıyor. İlk testlerde fren mesafesi kısalıyor, lastik ömrü uzuyor.'),
  },
  'kh:tubeless': {
    headline: msg('İç Lastiksiz Lastik'),
    deck: msg('Şambrelsiz lastik çivi batınca patlamıyor, yavaşça sönüyor'),
    body: msg('Ani lastik patlamaları yüksek hızlarda ölümcül kazalara yol açıyordu. Yeni lastik, sürücüye güvenle durmak için zaman kazandırıyor.'),
  },
  'kh:crumpleZones': {
    headline: msg('Ezilen Araba Hayat Kurtarıyor'),
    deck: msg('Çarpışma bölgeli gövde darbenin enerjisini yutuyor'),
    body: msg('Mühendisler otomobilin önünü ve arkasını bilerek ezilebilir yaparak kabini koruyor. Çarpışma testlerinde yolcu kukla bebekleri eskisinden çok daha az hasar görüyor.'),
  },
  'cyl:3inline': {
    headline: msg('Üç Silindirli Motor Denendi'),
    deck: msg('İki silindirden yumuşak, dörtten ucuz'),
    body: msg('İngiliz bir firmanın üç silindirli motoru küçük otomobiller için ilgi çekici bir orta yol sunuyor. Titreşimi tamamen bitmese de kullanıcılar sessizliğinden memnun.'),
  },
  'cyl:6inline': {
    headline: msg('Altı Silindir: İpek Gibi Motor'),
    deck: msg('Kendi kendini dengeleyen motor lüks otomobillerin gözdesi olacak'),
    body: msg('Hollandalı bir yarış otomobilinde ilk kez görülen altı silindirli sıra motor, dört silindirlilerin titremesini tamamen ortadan kaldırıyor. Zenginler için yeni bir standart doğuyor.'),
  },
  'cyl:8v': {
    headline: msg('V Harfi Şeklinde Sekiz Silindir'),
    deck: msg('Kısa, güçlü ve yumuşak motor büyük otomobillere geliyor'),
    body: msg('İki sıra halinde dizilen sekiz silindir, uzun bir sıra motorun yerini kısa ve kompakt bir blokla alıyor. Mühendisler büyük hacmin artık kaputa rahatça sığdığını söylüyor.'),
  },
  'cyl:12v': {
    headline: msg('On İki Silindirli Canavar'),
    deck: msg('Lüksün yeni ölçüsü: hiç titremeyen V12'),
    body: msg('Uçak motorlarından esinlenen on iki silindirli otomobil motoru, zenginlerin garajlarında yerini alıyor. Motorun çalıştığını ancak tavandaki bozuk para sallanınca anlıyorsunuz.'),
  },
  'cyl:16v': {
    headline: msg('On Altı Silindir! Gösterişin Zirvesi'),
    deck: msg('Buhranın ortasında dünyanın en pahalı motoru tanıtıldı'),
    body: msg('On altı silindirli dev motor, lüks otomobil yarışında son noktayı koyuyor. Eleştirmenler ekonominin bu halinde kimin böyle bir otomobil alacağını soruyor.'),
  },
  'cyl:8inline': {
    headline: msg('Sekiz Silindir Tek Sırada'),
    deck: msg('Uzun kaputun altında pürüzsüz bir güç'),
    body: msg('Sekiz silindirin tek sıraya dizildiği motor, prestijli otomobillere uzun ve zarif bir kaput kazandırıyor. Mühendisler krank milinin uzunluğunun yarattığı zorlukları aşmaya çalışıyor.'),
  },
  'cyl:6v': {
    headline: msg('V6: Altı Silindir Kısa Blokta'),
    deck: msg('İtalyan mühendisler yeni bir motor düzeni sunuyor'),
    body: msg('Altmış derece açıyla dizilen altı silindir, kısa bir motor bloğunda toplanıyor. Küçük kaputlu otomobiller de artık altı silindirin yumuşaklığına kavuşabilir.'),
  },
  'vt:ioe': {
    headline: msg('Supaplardan Biri Yukarı Çıktı'),
    deck: msg('F-kafa motor daha iyi nefes alıyor'),
    body: msg('Emme supabını silindirin üstüne taşıyan F-kafa tasarım, yan supaplı motorların dar nefesini genişletiyor. Mühendisler bunun daha büyük bir değişimin habercisi olduğunu düşünüyor.'),
  },
  'vt:ohv': {
    headline: msg('Üstten Supaplı Motor Yarışları Süpürüyor'),
    deck: msg('İtici çubuklarla çalışan supaplar silindirin tepesine taşındı'),
    body: msg('Üstten supaplı yeni motorlar aynı hacimden çok daha fazla güç çıkarıyor. Yarış pistlerinde birbiri ardına rekor kıran bu motorların seri üretime ne zaman geçeceği merak ediliyor.'),
  },
  'vt:ohc': {
    headline: msg('Kam Mili Motorun Tepesinde'),
    deck: msg('Üstten kamlı motor yüksek devrin kapısını aralıyor'),
    body: msg('Kam milini silindir kapağına taşıyan yeni düzen, itici çubukları ortadan kaldırarak motorun çok daha yüksek devirlere çıkmasını sağlıyor. Yarış takımları tasarıma büyük ilgi gösteriyor.'),
  },
  'vt:dohc': {
    headline: msg('İki Kam Milli Yarış Motoru Tarih Yazdı'),
    deck: msg('Silindir başına dört supap, rakipsiz güç'),
    body: msg('Bir Fransız yarış takımının çift üstten kamlı motoru büyük bir yarışı açık farkla kazandı. Uzmanlar bu pahalı ve hassas tasarımın uzun süre yarış pistlerinde kalacağını düşünüyor.'),
  },
  'fuel:carb2': {
    headline: msg('Her Silindire Kendi Karbüratörü'),
    deck: msg('Çift karbüratörle karışım eşitleniyor, güç artıyor'),
    body: msg('Tek karbüratörün uzaktaki silindirlere zayıf karışım göndermesi sorunu çift karbüratörle çözülüyor. Spor otomobillerde birkaç beygirlik fark hemen hissediliyor.'),
  },
  'fuel:injection': {
    headline: msg('Karbüratöre Veda: Yakıt Püskürtülüyor'),
    deck: msg('Mekanik enjeksiyon güç ve verimde yeni bir çağ açıyor'),
    body: msg('Uçak motorlarında savaş yıllarında olgunlaşan yakıt enjeksiyonu otomobile geliyor. Yakıt doğrudan ve ölçülü püskürtüldüğü için motor hem güçleniyor hem daha az yakıyor.'),
  },
  'fuel:diesel': {
    headline: msg('Mazotla Çalışan Binek Otomobil'),
    deck: msg('Kamyonların motoru şimdi de ailelerin hizmetinde'),
    body: msg('Yakıtı sıkıştırmanın ısısıyla tutuşturan dizel motor ilk kez bir binek otomobile konuldu. Taksiciler yakıt faturalarının yarıya inmesini sevinçle karşılıyor; gürültüsü ise ayrı bir konu.'),
  },
  'asp:supercharger': {
    headline: msg('Motora Hava Basan Kompresör'),
    deck: msg('Uçak motorlarının sırrı yarış otomobillerinde'),
    body: msg('Krank milinden dönen bir üfleyici silindirlere fazladan hava basarak gücü üçte bir artırıyor. Kompresörlü otomobiller yarışlarda tanıdık bir uğultuyla fark ediliyor.'),
  },
  'gb:synchro': {
    headline: msg('Vites Değiştirmek Çocuk Oyuncağı'),
    deck: msg('Senkromeçli şanzıman dişlilerin hızını kendisi eşitliyor'),
    body: msg('Çift debriyaj yapmadan, gıcırtı olmadan vites değiştirmeyi mümkün kılan senkromeç, otomobil kullanmayı herkes için kolaylaştırıyor. Sürücü okulları ders saatlerini kısaltıyor.'),
  },
  'gb:automatic': {
    headline: msg('Kendi Kendine Vites Değiştiren Otomobil'),
    deck: msg('Hidrolik kavramalı otomatik şanzıman satışta'),
    body: msg('Yağ dolu bir kavrama ve planet dişliler sayesinde otomobil, sürücüye hiç sormadan vites değiştiriyor. Debriyaj pedalına veda eden sürücülerin sayısının hızla artacağı tahmin ediliyor.'),
  },
  'gears:4': {
    headline: msg('Dört İleri Vites'),
    deck: msg('Vitesler arası boşluk kapanıyor, motor güçlü devirde kalıyor'),
    body: msg('Üç vitesin yetmediği yokuşlarda ve otoyollarda dördüncü vites büyük rahatlık sağlıyor. Güçsüz motorlu küçük otomobiller en çok kazananlar.'),
  },
  'gears:5': {
    headline: msg('Beş Vitesli Şanzıman'),
    deck: msg('Uzun son vites otoyolda yakıt ekonomisi getiriyor'),
    body: msg('İtalyan spor otomobillerinde başlayan beş vites modası, uzun yol otomobillerine de yayılıyor. Kısa ilk vitesle çevik kalkış, uzun son vitesle sessiz seyir mümkün.'),
  },
  'chassis:monocoque': {
    headline: msg('Şasisiz Otomobil!'),
    deck: msg('Gövde ve iskelet tek parça: monokok yapı'),
    body: msg('Ayrı bir şasi yerine kaynaklı sac gövdenin kendisini taşıyıcı yapan yeni yöntem, otomobili hem hafifletiyor hem sağlamlaştırıyor. Pres ve kaynak hatlarına büyük yatırım gerekiyor.'),
  },
  'susp:ifs': {
    headline: msg('Tekerlekler Birbirinden Bağımsız'),
    deck: msg('Bağımsız ön süspansiyon direksiyon titremesini bitiriyor'),
    body: msg('Ön tekerleklerin tek bir aksla birbirine bağlı olmadığı yeni süspansiyon, bir tekerleğin çukura girmesinin diğerini sarsmasını önlüyor. Konfor ve direksiyon hassasiyeti birlikte artıyor.'),
  },
  'susp:allind': {
    headline: msg('Dört Tekerlek de Bağımsız'),
    deck: msg('Helezon yaylı tam bağımsız süspansiyon lüks otomobillerde'),
    body: msg('Arka tekerlekleri de bağımsız hale getiren süspansiyon, bozuk yollarda bile otomobili düz tutuyor. Pahalı ama sürücüler farkı ilk virajda hissediyor.'),
  },
  'feat:windshield': {
    headline: msg('Rüzgâra Karşı Cam Kalkan'),
    deck: msg('Ön cam sürücüleri tozdan ve böceklerden koruyor'),
    body: msg('Sürücülerin gözlük, eldiven ve toz paltosuyla yola çıktığı günler sona eriyor. Katlanabilir ön cam artık birçok otomobilde isteğe bağlı olarak sunuluyor.'),
  },
  'feat:speedometer': {
    headline: msg('Kaç Kilometreyle Gidiyorsunuz?'),
    deck: msg('Hız göstergesi sürücüleri cezadan koruyor'),
    body: msg('Belediyelerin hız sınırlarını sıkılaştırdığı şu günlerde, tekerlekten tel ile çalışan hız göstergesi sürücülerin en yakın dostu oluyor.'),
  },
  'feat:spareWheel': {
    headline: msg('Yedek Tekerlek Standart Oluyor'),
    deck: msg('Uzun yolculukta en iyi sigorta'),
    body: msg('Arkada ya da yan basamakta taşınan yedek tekerlek, patlak lastiği yolculuğun sonu olmaktan çıkarıyor. Otomobil kulüpleri üyelerine yedeksiz yola çıkmamalarını öğütlüyor.'),
  },
  'feat:rearMirror': {
    headline: msg('Arkanızı Görmeden Dönmeyin'),
    deck: msg('Dikiz aynası şehir trafiğinde kazaları azaltıyor'),
    body: msg('Bir yarış pilotunun ilk kez kullandığı dikiz aynası artık gündelik otomobillerde. Trafik polisleri kavşak kazalarının azaldığını bildiriyor.'),
  },
  'feat:wipers': {
    headline: msg('Yağmurda Kendi Kendine Silen Cam'),
    deck: msg('Vakumlu silecek sürücünün elini direksiyonda tutuyor'),
    body: msg('Motor vakumuyla çalışan silecek, yağmurlu havalarda sürücünün camı eliyle silmesi zorunluluğunu ortadan kaldırıyor.'),
  },
  'feat:fuelGauge': {
    headline: msg('Depoya Çubuk Sokmaya Son'),
    deck: msg('Gösterge paneline yakıt saati geldi'),
    body: msg('Benzin deposunun ne kadar dolu olduğu artık gösterge panelinden okunuyor. Yolda benzinsiz kalan sürücü sayısının azalması bekleniyor.'),
  },
  'feat:turnSignals': {
    headline: msg('Yanıp Sönen Işıklar Yön Gösteriyor'),
    deck: msg('Sinyal lambaları kol sallamayı gereksiz kılıyor'),
    body: msg('Sürücülerin kolunu camdan çıkararak dönüş yaptığı dönem kapanıyor. Arka ve öndeki yanıp sönen lambalar kavşaklarda güvenliği artırıyor.'),
  },
  'feat:sealedBeam': {
    headline: msg('Gece Yolu İki Kat Aydınlık'),
    deck: msg('Mühürlü farlar kararmıyor, nem almıyor'),
    body: msg('Ampul, yansıtıcı ve camın tek parça yapıldığı yeni farlar yıllar geçse de kararmıyor. Gece kazalarında düşüş bekleniyor.'),
  },
  'feat:electricStart': {
    headline: msg('Kolla Motor Çevirmeye Son!'),
    deck: msg('Elektrikli marş herkesi sürücü yapıyor'),
    body: msg('Düğmeye basınca motoru çalıştıran elektrikli marş, kol çevirirken kırılan bilekler dönemini kapatıyor. Uzmanlar otomobilin artık kadınlar ve yaşlılar için de kolay bir araç olacağını söylüyor.'),
  },
  'feat:electricLights': {
    headline: msg('Asetilen Lambalar Tarihe Karışıyor'),
    deck: msg('Dinamodan beslenen elektrikli farlar geldi'),
    body: msg('Karpitle çalışan, sürekli bakım isteyen asetilen farların yerini düğmeyle yanan elektrikli farlar alıyor. Gece yolculukları daha güvenli.'),
  },
  'feat:heater': {
    headline: msg('Kışın Otomobilde Üşümeyin'),
    deck: msg('Motor ısısı kabine veriliyor'),
    body: msg('Motorun boşa giden ısısını kabine taşıyan kalorifer, kapalı otomobillerde kış yolculuklarını çekilir kılıyor. Battaniye satıcıları dertli.'),
  },
  'feat:radio': {
    headline: msg('Yolda Müzik: Otomobil Radyosu'),
    deck: msg('Lambalı radyo gösterge panelinde'),
    body: msg('Evlerdeki radyonun küçültülmüş hali artık otomobillere takılıyor. Bazı belediyeler sürücülerin dikkatinin dağılacağından endişeli.'),
  },
  'feat:powerSteering': {
    headline: msg('Parmakla Dönen Direksiyon'),
    deck: msg('Hidrolik yardımlı direksiyon ağır otomobilleri hafifletiyor'),
    body: msg('Hidrolik pompanın desteğiyle dönen direksiyon, büyük otomobillerde park etmeyi zahmetsiz hale getiriyor.'),
  },
  'feat:airCon': {
    headline: msg('Otomobilde Serin Yaz'),
    deck: msg('Klima sıcak günlerde kabini serinletiyor'),
    body: msg('Buzdolabı teknolojisini otomobile taşıyan klima, yazın uzun yolculukları konforlu hale getiriyor. Pahalı ama lüks otomobil alıcıları vazgeçemiyor.'),
  },
  'feat:steelBody': {
    headline: msg('Ahşap İskelete Veda'),
    deck: msg('Tamamen çelik gövde kazalarda daha sağlam'),
    body: msg('Ahşap iskelet üzerine sac kaplanan gövdelerin yerini tamamen çelikten preslenmiş gövdeler alıyor. Seri üretim hızlanıyor, kazalarda gövde dağılmıyor.'),
  },
  'feat:fourWheelBrakes': {
    headline: msg('Dört Tekerlek Birden Duruyor'),
    deck: msg('Ön tekerleklere de fren konuldu'),
    body: msg('Yalnızca arka tekerleklerde fren bulunan otomobiller hızlandıkça tehlikeli hale geliyordu. Dört teker fren, duruş mesafesini neredeyse yarıya indiriyor.'),
  },
  'feat:hydraulicBrakes': {
    headline: msg('Pascal Otomobili Durduruyor'),
    deck: msg('Hidrolik fren pedal kuvvetini dört tekere eşit dağıtıyor'),
    body: msg('Çubuk ve tellerle çalışan frenlerin yerini yağ basıncıyla çalışan sistem alıyor. Frenler bir yana çekmiyor, pedal hafifliyor.'),
  },
  'feat:safetyGlass': {
    headline: msg('Kırılınca Dağılmayan Cam'),
    deck: msg('Lamine emniyet camı yolcuları kesiklerden koruyor'),
    body: msg('İki cam arasına yapıştırılan şeffaf bir tabaka, kazalarda camın parçalanıp etrafa saçılmasını önlüyor.'),
  },
  'feat:discBrakes': {
    headline: msg('Uçaktan Gelen Frenler'),
    deck: msg('Disk frenler ısınınca bayılmıyor'),
    body: msg('Yarışlarda kendini kanıtlayan disk frenler, uzun inişlerde bile gücünü kaybetmiyor. Kampana frenlerin günleri sayılı olabilir.'),
  },
  'feat:paddedDash': {
    headline: msg('Yumuşak Gösterge Paneli'),
    deck: msg('Çarpışmada kafa sert metale değil süngere çarpıyor'),
    body: msg('Güvenlik araştırmacılarının önerisiyle gösterge panelleri yastıklı hale getiriliyor.'),
  },
  'feat:seatBelt': {
    headline: msg('Üç Noktalı Kemer Hayat Kurtarıyor'),
    deck: msg('İsveçli bir mühendisin buluşu herkese açık'),
    body: msg('Omuz ve kucaktan geçen üç noktalı emniyet kemeri, çarpışmada yolcuyu koltuğunda tutuyor. Buluşun patentinin herkesin kullanımına bırakıldığı bildiriliyor.'),
  },
};

export interface WorldNews {
  year: number;
  headline: string;
  body: string;
}

/** Real events of the period for the "Dünyadan" column. */
export const WORLD_NEWS: WorldNews[] = [
  { year: 1901, headline: msg('İlk Nobel Ödülleri Verildi'), body: msg('Stockholm’de fizik, kimya, tıp ve edebiyat dallarında ilk Nobel ödülleri sahiplerini buldu.') },
  { year: 1902, headline: msg('Kıtalar Arası Telsiz Mesajı'), body: msg('Atlas Okyanusu’nun iki yakası arasında telsizle ilk resmi mesajlar gönderildi.') },
  { year: 1903, headline: msg('İnsan Uçtu!'), body: msg('İki Amerikalı kardeş, motorlu uçaklarıyla Kuzey Carolina kumullarında ilk kontrollü uçuşu yaptı.') },
  { year: 1904, headline: msg('New York’ta Yeraltı Treni'), body: msg('Şehrin ilk metro hattı yolculara açıldı.') },
  { year: 1905, headline: msg('Genç Bir Fizikçiden Şaşırtan Makaleler'), body: msg('Bern patent ofisinde çalışan bir fizikçi ışık, hareket ve enerji üzerine dört makale yayımladı.') },
  { year: 1906, headline: msg('San Francisco’da Büyük Deprem'), body: msg('Deprem ve ardından çıkan yangınlar şehrin büyük kısmını yıktı.') },
  { year: 1907, headline: msg('Bankalarda Panik'), body: msg('New York’ta başlayan mevduat kaçışı piyasaları sarstı; kredi bulmak güçleşti.') },
  { year: 1908, headline: msg('Pekin’den Paris’e Otomobil Yarışı Sona Erdi'), body: msg('Aylar süren zorlu yarış, otomobilin dayanıklılığını tüm dünyaya gösterdi.') },
  { year: 1909, headline: msg('Manş Denizi Uçakla Geçildi'), body: msg('Bir Fransız havacı Manş’ı uçakla geçen ilk kişi oldu.') },
  { year: 1910, headline: msg('Halley Kuyruklu Yıldızı Göründü'), body: msg('Kuyruklu yıldız gökyüzünde çıplak gözle izlendi; bazı çevrelerde kıyamet söylentileri yayıldı.') },
  { year: 1911, headline: msg('Güney Kutbu’na Ulaşıldı'), body: msg('Norveçli bir kaşif ve ekibi Güney Kutbu’na ilk ulaşan insanlar oldu.') },
  { year: 1912, headline: msg('Dev Transatlantik Buzdağına Çarptı'), body: msg('İlk seferindeki “batmaz” gemi Kuzey Atlantik’te battı; binlerce yolcudan ancak bir kısmı kurtarılabildi.') },
  { year: 1913, headline: msg('Hareketli Montaj Hattı'), body: msg('Detroit’te bir fabrika şasiyi işçilerin önünden yürüten hattı denedi; montaj süresi saatlerden dakikalara indi.') },
  { year: 1914, headline: msg('Avrupa’da Savaş'), body: msg('Saraybosna suikastının ardından büyük devletler birbirine savaş ilan etti.') },
  { year: 1916, headline: msg('Verdun’da Kanlı Aylar'), body: msg('Batı cephesinde süren muharebe iki tarafa da ağır kayıplar verdirdi.') },
  { year: 1918, headline: msg('Mütareke İmzalandı'), body: msg('Dört yılı aşan savaş, bir tren vagonunda imzalanan ateşkesle sona erdi.') },
  { year: 1919, headline: msg('Atlas Okyanusu Aralıksız Uçuldu'), body: msg('İki İngiliz havacı okyanusu durmadan uçarak geçti.') },
  { year: 1920, headline: msg('Radyo Yayınları Başladı'), body: msg('İlk düzenli radyo yayınları evlere haber ve müzik taşımaya başladı.') },
  { year: 1922, headline: msg('Firavunun Mezarı Bulundu'), body: msg('Krallar Vadisi’nde el değmemiş bir firavun mezarı açıldı.') },
  { year: 1923, headline: msg('Almanya’da Dörtnala Enflasyon'), body: msg('Mark değer yitirdikçe bir somun ekmeğin fiyatı milyarlara çıktı.') },
  { year: 1924, headline: msg('Paris Olimpiyatları'), body: msg('Yaz Olimpiyat Oyunları Paris’te düzenlendi.') },
  { year: 1926, headline: msg('Televizyon İlk Kez Gösterildi'), body: msg('İskoç bir mucit, hareketli görüntüyü telle ileten cihazını Londra’da tanıttı.') },
  { year: 1927, headline: msg('Okyanusu Tek Başına Uçtu'), body: msg('Genç bir Amerikalı pilot New York’tan Paris’e durmadan ve tek başına uçtu.') },
  { year: 1928, headline: msg('Penisilin Keşfedildi'), body: msg('Londra’da bir bakteriyolog küf mantarının bakterileri öldürdüğünü fark etti.') },
  { year: 1929, headline: msg('Borsa Çöktü!'), body: msg('New York borsasındaki çöküş servetleri bir günde sildi; ekonomistler zor yıllar bekliyor.') },
  { year: 1931, headline: msg('Dünyanın En Yüksek Binası Açıldı'), body: msg('New York’ta 102 katlı gökdelen hizmete girdi.') },
  { year: 1933, headline: msg('Yeni Düzen Programı'), body: msg('Amerika’da buhrana karşı büyük kamu yatırımları başladı.') },
  { year: 1936, headline: msg('Berlin Olimpiyatları'), body: msg('Yaz Olimpiyatları’nda Amerikalı bir atlet dört altın madalya kazandı.') },
  { year: 1937, headline: msg('Zeplin Faciası'), body: msg('Dev yolcu zeplini New Jersey’de iniş sırasında alev aldı.') },
  { year: 1939, headline: msg('Avrupa Yeniden Savaşta'), body: msg('Polonya’nın işgaliyle Avrupa bir kez daha savaşa sürüklendi.') },
  { year: 1941, headline: msg('Amerika Savaşa Girdi'), body: msg('Pasifik’teki bir deniz üssüne yapılan saldırının ardından Amerika savaşa katıldı.') },
  { year: 1944, headline: msg('Normandiya Çıkarması'), body: msg('Müttefik kuvvetleri Fransa kıyılarına çıktı.') },
  { year: 1945, headline: msg('Savaş Bitti'), body: msg('Avrupa’da ve Pasifik’te silahlar sustu; yeniden yapılanma başlıyor.') },
  { year: 1947, headline: msg('Ses Duvarı Aşıldı'), body: msg('Bir deneme pilotu roket uçağıyla sesten hızlı uçtu.') },
  { year: 1948, headline: msg('Transistör Tanıtıldı'), body: msg('Lambaların yerini alabilecek küçük bir yarı iletken yükselteç duyuruldu.') },
  { year: 1950, headline: msg('Kore’de Savaş'), body: msg('Kore yarımadasında çatışmalar başladı.') },
  { year: 1953, headline: msg('Everest’in Zirvesine Çıkıldı'), body: msg('Bir Yeni Zelandalı dağcı ve Nepalli rehberi dünyanın en yüksek dağının zirvesine ulaştı.') },
  { year: 1954, headline: msg('Bir Milin Dört Dakikanın Altında Koşuldu'), body: msg('İngiliz bir atlet bir mili dört dakikanın altında koşan ilk insan oldu.') },
  { year: 1955, headline: msg('Çocuk Felcine Aşı'), body: msg('Çocuk felcine karşı geliştirilen aşının güvenli ve etkili olduğu açıklandı.') },
  { year: 1957, headline: msg('Uzaya İlk Uydu'), body: msg('Sovyetler Birliği Dünya’nın yörüngesine ilk yapay uyduyu yerleştirdi.') },
  { year: 1958, headline: msg('Jet Yolcu Uçakları Okyanus Aşıyor'), body: msg('Jet motorlu yolcu uçakları Atlas Okyanusu seferlerine başladı.') },
  { year: 1959, headline: msg('Otoyol Ağı Büyüyor'), body: msg('Kıtayı baştan başa kesen otoyollar yeni kasabalar ve alışveriş merkezleri doğuruyor.') },
];

/** A default story for technology without its own copy, already in the player's language. */
export function genericStory(name: string, desc: string): Story {
  return { headline: t('Yeni Buluş: {name}', { name: t(name) }), deck: t('Mühendisler yeniliği yakından izliyor'), body: t(desc) };
}
