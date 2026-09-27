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
    headline: 'Motor Artık Kaynamıyor',
    deck: 'Yüzlerce ince borudan yapılmış “petek” radyatör yokuşların korkusunu bitirdi',
    body: 'Bir Alman fabrikasının yarış arabasında ilk kez görülen petek radyatör, soğutma suyunu eskisinin birkaç katı hızla serinletiyor. Uzun yokuşlarda buhar salan, yol kenarında soğumayı bekleyen otomobiller yakında geçmişte kalabilir.',
  },
  'kh:magneto': {
    headline: 'Kıvılcım Artık Mıknatıstan',
    deck: 'Yüksek gerilim manyetosu kızgın tüplü ateşlemeyi tarihe gömüyor',
    body: 'Motorun kendi döndürdüğü bir mıknatıstan kıvılcım üreten yeni düzenek, alevli tüplerle uğraşmayı ve zayıf pilleri gereksiz kılıyor. Mühendisler motorun yağmurda, soğukta ve yüksek devirde bile tekleme yapmadan çalıştığını bildiriyor.',
  },
  'kh:shaftDrive': {
    headline: 'Zincir Devri Kapanıyor mu?',
    deck: 'Kapalı kardan mili, arka tekerleklere sessizce güç veriyor',
    body: 'Fransız bir üreticinin denediği kardan mili tahriki, yağlı ve gürültülü zincirleri kapalı bir boru içine alıyor. Sürücüler pantolonlarına sıçrayan yağdan, yolda kopan zincirden kurtulmanın sevincini yaşıyor.',
  },
  'kh:frictionDampers': {
    headline: 'Sallanan Araba Sallanmayacak',
    deck: 'Sürtünmeli amortisör, yayların sonsuz sekmesine fren oluyor',
    body: 'Birbirine sürtünen disklerden yapılan küçük bir düzenek, otomobilin çukurdan çıktıktan sonra dakikalarca sallanmasını önlüyor. Yolcular deniz tutmasından şikâyet etmeyecek.',
  },
  'kh:detachableRims': {
    headline: 'Patlak Lastik Artık Felaket Değil',
    deck: 'Jantıyla sökülen lastik yolda dakikalar içinde değişiyor',
    body: 'Sürücülerin kabusu olan yol kenarında lastik yamama işi, sökülebilir jantla birkaç dakikalık bir işe dönüşüyor. Otomobil kulüpleri yeniliği “uzun yolculuğun kurtarıcısı” diye selamlıyor.',
  },
  'kh:detachableHead': {
    headline: 'Motor Bloğu İkiye Bölündü',
    deck: 'Sökülebilir silindir kapağı dökümü ucuzlatıyor, bakımı kolaylaştırıyor',
    body: 'Blok ve kapağın ayrı dökülmesi, fabrikalarda hurdaya çıkan döküm sayısını azaltıyor. Tamirciler artık supaplara ulaşmak için motoru baştan sona sökmek zorunda değil.',
  },
  'kh:pressureLube': {
    headline: 'Yataklar Artık Erimeyecek',
    deck: 'Basınçlı yağlama yüksek devirli motorların önünü açıyor',
    body: 'Bir pompa, yağı krank yataklarına basınçla iterek sıçratmaya dayalı eski düzenin yerini alıyor. Mühendisler yeni motorların uzun otoyol yolculuklarında bile yatak sarmadığını söylüyor.',
  },
  'kh:alloyPistons': {
    headline: 'Hafif Metal Motoru Uçuruyor',
    deck: 'Alüminyum pistonlar dökme demirin üçte biri ağırlığında',
    body: 'Uçak motorlarından otomobile geçen alüminyum pistonlar, motorların daha çabuk devir almasını ve daha az titreşmesini sağlıyor. Yarış pilotları farkı ilk turda hissettiklerini söylüyor.',
  },
  'kh:airFilter': {
    headline: 'Toz Artık Motora Giremeyecek',
    deck: 'Hava filtresi silindirlerin ömrünü uzatıyor',
    body: 'Toprak yolların ince tozu yıllardır motorların sessiz düşmanıydı. Karbüratörün ağzına takılan filtre, silindirleri zımpara gibi aşındıran tozu dışarıda tutuyor.',
  },
  'kh:thermostat': {
    headline: 'Motora Termometre Kondu',
    deck: 'Termostat soğuk sabahlarda motoru çabuk ısıtıyor',
    body: 'Motor ısınana kadar suyu radyatöre göndermeyen küçük bir valf, kış aylarında yakıt tüketimini belirgin biçimde azaltıyor. Sürücüler sabah kalkışlarında boğulan motorlardan kurtuluyor.',
  },
  'kh:oilFilter': {
    headline: 'Kara Yağa Veda',
    deck: 'Yağ filtresi metal tozunu süzüyor, motor yıllarca yaşıyor',
    body: 'Motor yağındaki aşınma tozunu tutan filtre, yağ değişimlerini seyrekleştiriyor ve yatakları koruyor. Kamyon filoları ilk sonuçlardan çok memnun.',
  },
  'kh:balloonTires': {
    headline: 'Yollar Birden Düzleşti!',
    deck: 'Geniş ve düşük basınçlı balon lastikler sarsıntıyı yutuyor',
    body: 'Yeni balon lastikler taş yollarda bile yolcuları pamuk üstünde taşıyor. Lastik fabrikaları siparişlere yetişemiyor; eski ince lastikli otomobillerin değeri düşüyor.',
  },
  'kh:hydraulicDampers': {
    headline: 'Yağla Çalışan Amortisör',
    deck: 'Hidrolik amortisör küçük darbede yumuşak, büyükte sıkı',
    body: 'Yağın küçük deliklerden geçmesiyle çalışan amortisör, sürtünmeli eski tipin sertliğini ve gıcırtısını ortadan kaldırıyor. Viraj tutuşu ve konfor aynı anda iyileşiyor.',
  },
  'kh:hypoid': {
    headline: 'Otomobil Alçalıyor',
    deck: 'Hipoid diferansiyel kardan milini yere yaklaştırıyor',
    body: 'Pinyon dişlisinin aksın altından girdiği yeni diferansiyel, kabinin tabanını birkaç parmak alçaltıyor. Tasarımcılar daha basık ve zarif gövdelerin önünün açıldığını söylüyor.',
  },
  'kh:vacuumAdvance': {
    headline: 'Avans Kolu Emekliye Ayrıldı',
    deck: 'Ateşleme zamanı artık motorun kendisi ayarlıyor',
    body: 'Sürücünün direksiyondaki kolla ayarladığı kıvılcım zamanı, vakum ve merkezkaç ağırlıklarıyla kendiliğinden ayarlanıyor. Motorlar daha az yakıyor, yokuşta vuruntu yapmıyor.',
  },
  'kh:autoChoke': {
    headline: 'Kışın Bile İlk Seferde',
    deck: 'Otomatik jikle soğuk motoru kendiliğinden çalıştırıyor',
    body: 'Sıcaklığa duyarlı bir yay, soğuk motorda karışımı zenginleştiriyor ve motor ısındıkça geri çekiliyor. Artık araba çalıştırmak ustalık istemiyor.',
  },
  'kh:streamlining': {
    headline: 'Rüzgâr Tünelinden Çıkan Otomobil',
    deck: 'Aerodinamik gövde aynı motorla daha hızlı ve daha az yakıyor',
    body: 'Uçak mühendislerinin rüzgâr tünelinde denediği yuvarlak burunlu, eğik camlı gövdeler hava direncini belirgin biçimde azaltıyor. Eleştirmenler görünüşü tartışıyor, mühendisler rakamları.',
  },
  'kh:antiRoll': {
    headline: 'Virajda Yatmayan Otomobil',
    deck: 'Burulmalı denge çubuğu iki tekerleği birbirine bağlıyor',
    body: 'Yumuşak yaylı otomobillerin virajda gemi gibi yatması bir çubukla önleniyor. Konforu bozmadan isabetli yol tutuş mümkün hale geliyor.',
  },
  'kh:overdrive': {
    headline: 'Dördüncü Vitesin Üstünde Bir Vites Daha',
    deck: 'Overdrive otoyolda motoru dinlendiriyor',
    body: 'Son vitesin üstüne eklenen kademe, yüksek hızda motor devrini düşürerek hem yakıtı hem motor ömrünü koruyor. Uzun yol sürücüleri sessizliğe hayran.',
  },
  'kh:rackPinion': {
    headline: 'Direksiyonda Boşluk Kalmadı',
    deck: 'Kremayer dişlisi tekerlekleri doğrudan yönlendiriyor',
    body: 'Direksiyon milinin ucundaki dişlinin bir kremayeri ittiği basit düzenek, eski direksiyon kutularının boşluğunu ortadan kaldırıyor. Sürücüler yolu parmak uçlarında hissediyor.',
  },
  'kh:radialTires': {
    headline: 'Çelik Kuşaklı Lastik Geldi',
    deck: 'Radyal lastik yolu daha sıkı kavrıyor, daha az yakıyor',
    body: 'Fransız lastik ustalarının geliştirdiği radyal yapı, lastiğin yola geniş bir yüzeyle basmasını sağlıyor. İlk testlerde fren mesafesi kısalıyor, lastik ömrü uzuyor.',
  },
  'kh:tubeless': {
    headline: 'İç Lastiksiz Lastik',
    deck: 'Şambrelsiz lastik çivi batınca patlamıyor, yavaşça sönüyor',
    body: 'Ani lastik patlamaları yüksek hızlarda ölümcül kazalara yol açıyordu. Yeni lastik, sürücüye güvenle durmak için zaman kazandırıyor.',
  },
  'kh:crumpleZones': {
    headline: 'Ezilen Araba Hayat Kurtarıyor',
    deck: 'Çarpışma bölgeli gövde darbenin enerjisini yutuyor',
    body: 'Mühendisler otomobilin önünü ve arkasını bilerek ezilebilir yaparak kabini koruyor. Çarpışma testlerinde yolcu kukla bebekleri eskisinden çok daha az hasar görüyor.',
  },
  'cyl:3inline': {
    headline: 'Üç Silindirli Motor Denendi',
    deck: 'İki silindirden yumuşak, dörtten ucuz',
    body: 'İngiliz bir firmanın üç silindirli motoru küçük otomobiller için ilgi çekici bir orta yol sunuyor. Titreşimi tamamen bitmese de kullanıcılar sessizliğinden memnun.',
  },
  'cyl:6inline': {
    headline: 'Altı Silindir: İpek Gibi Motor',
    deck: 'Kendi kendini dengeleyen motor lüks otomobillerin gözdesi olacak',
    body: 'Hollandalı bir yarış otomobilinde ilk kez görülen altı silindirli sıra motor, dört silindirlilerin titremesini tamamen ortadan kaldırıyor. Zenginler için yeni bir standart doğuyor.',
  },
  'cyl:8v': {
    headline: 'V Harfi Şeklinde Sekiz Silindir',
    deck: 'Kısa, güçlü ve yumuşak motor büyük otomobillere geliyor',
    body: 'İki sıra halinde dizilen sekiz silindir, uzun bir sıra motorun yerini kısa ve kompakt bir blokla alıyor. Mühendisler büyük hacmin artık kaputa rahatça sığdığını söylüyor.',
  },
  'cyl:12v': {
    headline: 'On İki Silindirli Canavar',
    deck: 'Lüksün yeni ölçüsü: hiç titremeyen V12',
    body: 'Uçak motorlarından esinlenen on iki silindirli otomobil motoru, zenginlerin garajlarında yerini alıyor. Motorun çalıştığını ancak tavandaki bozuk para sallanınca anlıyorsunuz.',
  },
  'cyl:16v': {
    headline: 'On Altı Silindir! Gösterişin Zirvesi',
    deck: 'Buhranın ortasında dünyanın en pahalı motoru tanıtıldı',
    body: 'On altı silindirli dev motor, lüks otomobil yarışında son noktayı koyuyor. Eleştirmenler ekonominin bu halinde kimin böyle bir otomobil alacağını soruyor.',
  },
  'cyl:8inline': {
    headline: 'Sekiz Silindir Tek Sırada',
    deck: 'Uzun kaputun altında pürüzsüz bir güç',
    body: 'Sekiz silindirin tek sıraya dizildiği motor, prestijli otomobillere uzun ve zarif bir kaput kazandırıyor. Mühendisler krank milinin uzunluğunun yarattığı zorlukları aşmaya çalışıyor.',
  },
  'cyl:6v': {
    headline: 'V6: Altı Silindir Kısa Blokta',
    deck: 'İtalyan mühendisler yeni bir motor düzeni sunuyor',
    body: 'Altmış derece açıyla dizilen altı silindir, kısa bir motor bloğunda toplanıyor. Küçük kaputlu otomobiller de artık altı silindirin yumuşaklığına kavuşabilir.',
  },
  'vt:ioe': {
    headline: 'Supaplardan Biri Yukarı Çıktı',
    deck: 'F-kafa motor daha iyi nefes alıyor',
    body: 'Emme supabını silindirin üstüne taşıyan F-kafa tasarım, yan supaplı motorların dar nefesini genişletiyor. Mühendisler bunun daha büyük bir değişimin habercisi olduğunu düşünüyor.',
  },
  'vt:ohv': {
    headline: 'Üstten Supaplı Motor Yarışları Süpürüyor',
    deck: 'İtici çubuklarla çalışan supaplar silindirin tepesine taşındı',
    body: 'Üstten supaplı yeni motorlar aynı hacimden çok daha fazla güç çıkarıyor. Yarış pistlerinde birbiri ardına rekor kıran bu motorların seri üretime ne zaman geçeceği merak ediliyor.',
  },
  'vt:ohc': {
    headline: 'Kam Mili Motorun Tepesinde',
    deck: 'Üstten kamlı motor yüksek devrin kapısını aralıyor',
    body: 'Kam milini silindir kapağına taşıyan yeni düzen, itici çubukları ortadan kaldırarak motorun çok daha yüksek devirlere çıkmasını sağlıyor. Yarış takımları tasarıma büyük ilgi gösteriyor.',
  },
  'vt:dohc': {
    headline: 'İki Kam Milli Yarış Motoru Tarih Yazdı',
    deck: 'Silindir başına dört supap, rakipsiz güç',
    body: 'Bir Fransız yarış takımının çift üstten kamlı motoru büyük bir yarışı açık farkla kazandı. Uzmanlar bu pahalı ve hassas tasarımın uzun süre yarış pistlerinde kalacağını düşünüyor.',
  },
  'fuel:carb2': {
    headline: 'Her Silindire Kendi Karbüratörü',
    deck: 'Çift karbüratörle karışım eşitleniyor, güç artıyor',
    body: 'Tek karbüratörün uzaktaki silindirlere zayıf karışım göndermesi sorunu çift karbüratörle çözülüyor. Spor otomobillerde birkaç beygirlik fark hemen hissediliyor.',
  },
  'fuel:injection': {
    headline: 'Karbüratöre Veda: Yakıt Püskürtülüyor',
    deck: 'Mekanik enjeksiyon güç ve verimde yeni bir çağ açıyor',
    body: 'Uçak motorlarında savaş yıllarında olgunlaşan yakıt enjeksiyonu otomobile geliyor. Yakıt doğrudan ve ölçülü püskürtüldüğü için motor hem güçleniyor hem daha az yakıyor.',
  },
  'fuel:diesel': {
    headline: 'Mazotla Çalışan Binek Otomobil',
    deck: 'Kamyonların motoru şimdi de ailelerin hizmetinde',
    body: 'Yakıtı sıkıştırmanın ısısıyla tutuşturan dizel motor ilk kez bir binek otomobile konuldu. Taksiciler yakıt faturalarının yarıya inmesini sevinçle karşılıyor; gürültüsü ise ayrı bir konu.',
  },
  'asp:supercharger': {
    headline: 'Motora Hava Basan Kompresör',
    deck: 'Uçak motorlarının sırrı yarış otomobillerinde',
    body: 'Krank milinden dönen bir üfleyici silindirlere fazladan hava basarak gücü üçte bir artırıyor. Kompresörlü otomobiller yarışlarda tanıdık bir uğultuyla fark ediliyor.',
  },
  'gb:synchro': {
    headline: 'Vites Değiştirmek Çocuk Oyuncağı',
    deck: 'Senkromeçli şanzıman dişlilerin hızını kendisi eşitliyor',
    body: 'Çift debriyaj yapmadan, gıcırtı olmadan vites değiştirmeyi mümkün kılan senkromeç, otomobil kullanmayı herkes için kolaylaştırıyor. Sürücü okulları ders saatlerini kısaltıyor.',
  },
  'gb:automatic': {
    headline: 'Kendi Kendine Vites Değiştiren Otomobil',
    deck: 'Hidrolik kavramalı otomatik şanzıman satışta',
    body: 'Yağ dolu bir kavrama ve planet dişliler sayesinde otomobil, sürücüye hiç sormadan vites değiştiriyor. Debriyaj pedalına veda eden sürücülerin sayısının hızla artacağı tahmin ediliyor.',
  },
  'gears:4': {
    headline: 'Dört İleri Vites',
    deck: 'Vitesler arası boşluk kapanıyor, motor güçlü devirde kalıyor',
    body: 'Üç vitesin yetmediği yokuşlarda ve otoyollarda dördüncü vites büyük rahatlık sağlıyor. Güçsüz motorlu küçük otomobiller en çok kazananlar.',
  },
  'gears:5': {
    headline: 'Beş Vitesli Şanzıman',
    deck: 'Uzun son vites otoyolda yakıt ekonomisi getiriyor',
    body: 'İtalyan spor otomobillerinde başlayan beş vites modası, uzun yol otomobillerine de yayılıyor. Kısa ilk vitesle çevik kalkış, uzun son vitesle sessiz seyir mümkün.',
  },
  'chassis:monocoque': {
    headline: 'Şasisiz Otomobil!',
    deck: 'Gövde ve iskelet tek parça: monokok yapı',
    body: 'Ayrı bir şasi yerine kaynaklı sac gövdenin kendisini taşıyıcı yapan yeni yöntem, otomobili hem hafifletiyor hem sağlamlaştırıyor. Pres ve kaynak hatlarına büyük yatırım gerekiyor.',
  },
  'susp:ifs': {
    headline: 'Tekerlekler Birbirinden Bağımsız',
    deck: 'Bağımsız ön süspansiyon direksiyon titremesini bitiriyor',
    body: 'Ön tekerleklerin tek bir aksla birbirine bağlı olmadığı yeni süspansiyon, bir tekerleğin çukura girmesinin diğerini sarsmasını önlüyor. Konfor ve direksiyon hassasiyeti birlikte artıyor.',
  },
  'susp:allind': {
    headline: 'Dört Tekerlek de Bağımsız',
    deck: 'Helezon yaylı tam bağımsız süspansiyon lüks otomobillerde',
    body: 'Arka tekerlekleri de bağımsız hale getiren süspansiyon, bozuk yollarda bile otomobili düz tutuyor. Pahalı ama sürücüler farkı ilk virajda hissediyor.',
  },
  'feat:windshield': {
    headline: 'Rüzgâra Karşı Cam Kalkan',
    deck: 'Ön cam sürücüleri tozdan ve böceklerden koruyor',
    body: 'Sürücülerin gözlük, eldiven ve toz paltosuyla yola çıktığı günler sona eriyor. Katlanabilir ön cam artık birçok otomobilde isteğe bağlı olarak sunuluyor.',
  },
  'feat:speedometer': {
    headline: 'Kaç Kilometreyle Gidiyorsunuz?',
    deck: 'Hız göstergesi sürücüleri cezadan koruyor',
    body: 'Belediyelerin hız sınırlarını sıkılaştırdığı şu günlerde, tekerlekten tel ile çalışan hız göstergesi sürücülerin en yakın dostu oluyor.',
  },
  'feat:spareWheel': {
    headline: 'Yedek Tekerlek Standart Oluyor',
    deck: 'Uzun yolculukta en iyi sigorta',
    body: 'Arkada ya da yan basamakta taşınan yedek tekerlek, patlak lastiği yolculuğun sonu olmaktan çıkarıyor. Otomobil kulüpleri üyelerine yedeksiz yola çıkmamalarını öğütlüyor.',
  },
  'feat:rearMirror': {
    headline: 'Arkanızı Görmeden Dönmeyin',
    deck: 'Dikiz aynası şehir trafiğinde kazaları azaltıyor',
    body: 'Bir yarış pilotunun ilk kez kullandığı dikiz aynası artık gündelik otomobillerde. Trafik polisleri kavşak kazalarının azaldığını bildiriyor.',
  },
  'feat:wipers': {
    headline: 'Yağmurda Kendi Kendine Silen Cam',
    deck: 'Vakumlu silecek sürücünün elini direksiyonda tutuyor',
    body: 'Motor vakumuyla çalışan silecek, yağmurlu havalarda sürücünün camı eliyle silmesi zorunluluğunu ortadan kaldırıyor.',
  },
  'feat:fuelGauge': {
    headline: 'Depoya Çubuk Sokmaya Son',
    deck: 'Gösterge paneline yakıt saati geldi',
    body: 'Benzin deposunun ne kadar dolu olduğu artık gösterge panelinden okunuyor. Yolda benzinsiz kalan sürücü sayısının azalması bekleniyor.',
  },
  'feat:turnSignals': {
    headline: 'Yanıp Sönen Işıklar Yön Gösteriyor',
    deck: 'Sinyal lambaları kol sallamayı gereksiz kılıyor',
    body: 'Sürücülerin kolunu camdan çıkararak dönüş yaptığı dönem kapanıyor. Arka ve öndeki yanıp sönen lambalar kavşaklarda güvenliği artırıyor.',
  },
  'feat:sealedBeam': {
    headline: 'Gece Yolu İki Kat Aydınlık',
    deck: 'Mühürlü farlar kararmıyor, nem almıyor',
    body: 'Ampul, yansıtıcı ve camın tek parça yapıldığı yeni farlar yıllar geçse de kararmıyor. Gece kazalarında düşüş bekleniyor.',
  },
  'feat:electricStart': {
    headline: 'Kolla Motor Çevirmeye Son!',
    deck: 'Elektrikli marş herkesi sürücü yapıyor',
    body: 'Düğmeye basınca motoru çalıştıran elektrikli marş, kol çevirirken kırılan bilekler dönemini kapatıyor. Uzmanlar otomobilin artık kadınlar ve yaşlılar için de kolay bir araç olacağını söylüyor.',
  },
  'feat:electricLights': {
    headline: 'Asetilen Lambalar Tarihe Karışıyor',
    deck: 'Dinamodan beslenen elektrikli farlar geldi',
    body: 'Karpitle çalışan, sürekli bakım isteyen asetilen farların yerini düğmeyle yanan elektrikli farlar alıyor. Gece yolculukları daha güvenli.',
  },
  'feat:heater': {
    headline: 'Kışın Otomobilde Üşümeyin',
    deck: 'Motor ısısı kabine veriliyor',
    body: 'Motorun boşa giden ısısını kabine taşıyan kalorifer, kapalı otomobillerde kış yolculuklarını çekilir kılıyor. Battaniye satıcıları dertli.',
  },
  'feat:radio': {
    headline: 'Yolda Müzik: Otomobil Radyosu',
    deck: 'Lambalı radyo gösterge panelinde',
    body: 'Evlerdeki radyonun küçültülmüş hali artık otomobillere takılıyor. Bazı belediyeler sürücülerin dikkatinin dağılacağından endişeli.',
  },
  'feat:powerSteering': {
    headline: 'Parmakla Dönen Direksiyon',
    deck: 'Hidrolik yardımlı direksiyon ağır otomobilleri hafifletiyor',
    body: 'Hidrolik pompanın desteğiyle dönen direksiyon, büyük otomobillerde park etmeyi zahmetsiz hale getiriyor.',
  },
  'feat:airCon': {
    headline: 'Otomobilde Serin Yaz',
    deck: 'Klima sıcak günlerde kabini serinletiyor',
    body: 'Buzdolabı teknolojisini otomobile taşıyan klima, yazın uzun yolculukları konforlu hale getiriyor. Pahalı ama lüks otomobil alıcıları vazgeçemiyor.',
  },
  'feat:steelBody': {
    headline: 'Ahşap İskelete Veda',
    deck: 'Tamamen çelik gövde kazalarda daha sağlam',
    body: 'Ahşap iskelet üzerine sac kaplanan gövdelerin yerini tamamen çelikten preslenmiş gövdeler alıyor. Seri üretim hızlanıyor, kazalarda gövde dağılmıyor.',
  },
  'feat:fourWheelBrakes': {
    headline: 'Dört Tekerlek Birden Duruyor',
    deck: 'Ön tekerleklere de fren konuldu',
    body: 'Yalnızca arka tekerleklerde fren bulunan otomobiller hızlandıkça tehlikeli hale geliyordu. Dört teker fren, duruş mesafesini neredeyse yarıya indiriyor.',
  },
  'feat:hydraulicBrakes': {
    headline: 'Pascal Otomobili Durduruyor',
    deck: 'Hidrolik fren pedal kuvvetini dört tekere eşit dağıtıyor',
    body: 'Çubuk ve tellerle çalışan frenlerin yerini yağ basıncıyla çalışan sistem alıyor. Frenler bir yana çekmiyor, pedal hafifliyor.',
  },
  'feat:safetyGlass': {
    headline: 'Kırılınca Dağılmayan Cam',
    deck: 'Lamine emniyet camı yolcuları kesiklerden koruyor',
    body: 'İki cam arasına yapıştırılan şeffaf bir tabaka, kazalarda camın parçalanıp etrafa saçılmasını önlüyor.',
  },
  'feat:discBrakes': {
    headline: 'Uçaktan Gelen Frenler',
    deck: 'Disk frenler ısınınca bayılmıyor',
    body: 'Yarışlarda kendini kanıtlayan disk frenler, uzun inişlerde bile gücünü kaybetmiyor. Kampana frenlerin günleri sayılı olabilir.',
  },
  'feat:paddedDash': {
    headline: 'Yumuşak Gösterge Paneli',
    deck: 'Çarpışmada kafa sert metale değil süngere çarpıyor',
    body: 'Güvenlik araştırmacılarının önerisiyle gösterge panelleri yastıklı hale getiriliyor.',
  },
  'feat:seatBelt': {
    headline: 'Üç Noktalı Kemer Hayat Kurtarıyor',
    deck: 'İsveçli bir mühendisin buluşu herkese açık',
    body: 'Omuz ve kucaktan geçen üç noktalı emniyet kemeri, çarpışmada yolcuyu koltuğunda tutuyor. Buluşun patentinin herkesin kullanımına bırakıldığı bildiriliyor.',
  },
};

export interface WorldNews {
  year: number;
  headline: string;
  body: string;
}

/** Real events of the period for the "Dünyadan" column. */
export const WORLD_NEWS: WorldNews[] = [
  { year: 1901, headline: 'İlk Nobel Ödülleri Verildi', body: 'Stockholm’de fizik, kimya, tıp ve edebiyat dallarında ilk Nobel ödülleri sahiplerini buldu.' },
  { year: 1902, headline: 'Kıtalar Arası Telsiz Mesajı', body: 'Atlas Okyanusu’nun iki yakası arasında telsizle ilk resmi mesajlar gönderildi.' },
  { year: 1903, headline: 'İnsan Uçtu!', body: 'İki Amerikalı kardeş, motorlu uçaklarıyla Kuzey Carolina kumullarında ilk kontrollü uçuşu yaptı.' },
  { year: 1904, headline: 'New York’ta Yeraltı Treni', body: 'Şehrin ilk metro hattı yolculara açıldı.' },
  { year: 1905, headline: 'Genç Bir Fizikçiden Şaşırtan Makaleler', body: 'Bern patent ofisinde çalışan bir fizikçi ışık, hareket ve enerji üzerine dört makale yayımladı.' },
  { year: 1906, headline: 'San Francisco’da Büyük Deprem', body: 'Deprem ve ardından çıkan yangınlar şehrin büyük kısmını yıktı.' },
  { year: 1907, headline: 'Bankalarda Panik', body: 'New York’ta başlayan mevduat kaçışı piyasaları sarstı; kredi bulmak güçleşti.' },
  { year: 1908, headline: 'Pekin’den Paris’e Otomobil Yarışı Sona Erdi', body: 'Aylar süren zorlu yarış, otomobilin dayanıklılığını tüm dünyaya gösterdi.' },
  { year: 1909, headline: 'Manş Denizi Uçakla Geçildi', body: 'Bir Fransız havacı Manş’ı uçakla geçen ilk kişi oldu.' },
  { year: 1910, headline: 'Halley Kuyruklu Yıldızı Göründü', body: 'Kuyruklu yıldız gökyüzünde çıplak gözle izlendi; bazı çevrelerde kıyamet söylentileri yayıldı.' },
  { year: 1911, headline: 'Güney Kutbu’na Ulaşıldı', body: 'Norveçli bir kaşif ve ekibi Güney Kutbu’na ilk ulaşan insanlar oldu.' },
  { year: 1912, headline: 'Dev Transatlantik Buzdağına Çarptı', body: 'İlk seferindeki “batmaz” gemi Kuzey Atlantik’te battı; binlerce yolcudan ancak bir kısmı kurtarılabildi.' },
  { year: 1913, headline: 'Hareketli Montaj Hattı', body: 'Detroit’te bir fabrika şasiyi işçilerin önünden yürüten hattı denedi; montaj süresi saatlerden dakikalara indi.' },
  { year: 1914, headline: 'Avrupa’da Savaş', body: 'Saraybosna suikastının ardından büyük devletler birbirine savaş ilan etti.' },
  { year: 1916, headline: 'Verdun’da Kanlı Aylar', body: 'Batı cephesinde süren muharebe iki tarafa da ağır kayıplar verdirdi.' },
  { year: 1918, headline: 'Mütareke İmzalandı', body: 'Dört yılı aşan savaş, bir tren vagonunda imzalanan ateşkesle sona erdi.' },
  { year: 1919, headline: 'Atlas Okyanusu Aralıksız Uçuldu', body: 'İki İngiliz havacı okyanusu durmadan uçarak geçti.' },
  { year: 1920, headline: 'Radyo Yayınları Başladı', body: 'İlk düzenli radyo yayınları evlere haber ve müzik taşımaya başladı.' },
  { year: 1922, headline: 'Firavunun Mezarı Bulundu', body: 'Krallar Vadisi’nde el değmemiş bir firavun mezarı açıldı.' },
  { year: 1923, headline: 'Almanya’da Dörtnala Enflasyon', body: 'Mark değer yitirdikçe bir somun ekmeğin fiyatı milyarlara çıktı.' },
  { year: 1924, headline: 'Paris Olimpiyatları', body: 'Yaz Olimpiyat Oyunları Paris’te düzenlendi.' },
  { year: 1926, headline: 'Televizyon İlk Kez Gösterildi', body: 'İskoç bir mucit, hareketli görüntüyü telle ileten cihazını Londra’da tanıttı.' },
  { year: 1927, headline: 'Okyanusu Tek Başına Uçtu', body: 'Genç bir Amerikalı pilot New York’tan Paris’e durmadan ve tek başına uçtu.' },
  { year: 1928, headline: 'Penisilin Keşfedildi', body: 'Londra’da bir bakteriyolog küf mantarının bakterileri öldürdüğünü fark etti.' },
  { year: 1929, headline: 'Borsa Çöktü!', body: 'New York borsasındaki çöküş servetleri bir günde sildi; ekonomistler zor yıllar bekliyor.' },
  { year: 1931, headline: 'Dünyanın En Yüksek Binası Açıldı', body: 'New York’ta 102 katlı gökdelen hizmete girdi.' },
  { year: 1933, headline: 'Yeni Düzen Programı', body: 'Amerika’da buhrana karşı büyük kamu yatırımları başladı.' },
  { year: 1936, headline: 'Berlin Olimpiyatları', body: 'Yaz Olimpiyatları’nda Amerikalı bir atlet dört altın madalya kazandı.' },
  { year: 1937, headline: 'Zeplin Faciası', body: 'Dev yolcu zeplini New Jersey’de iniş sırasında alev aldı.' },
  { year: 1939, headline: 'Avrupa Yeniden Savaşta', body: 'Polonya’nın işgaliyle Avrupa bir kez daha savaşa sürüklendi.' },
  { year: 1941, headline: 'Amerika Savaşa Girdi', body: 'Pasifik’teki bir deniz üssüne yapılan saldırının ardından Amerika savaşa katıldı.' },
  { year: 1944, headline: 'Normandiya Çıkarması', body: 'Müttefik kuvvetleri Fransa kıyılarına çıktı.' },
  { year: 1945, headline: 'Savaş Bitti', body: 'Avrupa’da ve Pasifik’te silahlar sustu; yeniden yapılanma başlıyor.' },
  { year: 1947, headline: 'Ses Duvarı Aşıldı', body: 'Bir deneme pilotu roket uçağıyla sesten hızlı uçtu.' },
  { year: 1948, headline: 'Transistör Tanıtıldı', body: 'Lambaların yerini alabilecek küçük bir yarı iletken yükselteç duyuruldu.' },
  { year: 1950, headline: 'Kore’de Savaş', body: 'Kore yarımadasında çatışmalar başladı.' },
  { year: 1953, headline: 'Everest’in Zirvesine Çıkıldı', body: 'Bir Yeni Zelandalı dağcı ve Nepalli rehberi dünyanın en yüksek dağının zirvesine ulaştı.' },
  { year: 1954, headline: 'Bir Milin Dört Dakikanın Altında Koşuldu', body: 'İngiliz bir atlet bir mili dört dakikanın altında koşan ilk insan oldu.' },
  { year: 1955, headline: 'Çocuk Felcine Aşı', body: 'Çocuk felcine karşı geliştirilen aşının güvenli ve etkili olduğu açıklandı.' },
  { year: 1957, headline: 'Uzaya İlk Uydu', body: 'Sovyetler Birliği Dünya’nın yörüngesine ilk yapay uyduyu yerleştirdi.' },
  { year: 1958, headline: 'Jet Yolcu Uçakları Okyanus Aşıyor', body: 'Jet motorlu yolcu uçakları Atlas Okyanusu seferlerine başladı.' },
  { year: 1959, headline: 'Otoyol Ağı Büyüyor', body: 'Kıtayı baştan başa kesen otoyollar yeni kasabalar ve alışveriş merkezleri doğuruyor.' },
];

/** A default story for technology without its own copy. */
export function genericStory(name: string, desc: string): Story {
  return { headline: `Yeni Buluş: ${name}`, deck: 'Mühendisler yeniliği yakından izliyor', body: desc };
}
