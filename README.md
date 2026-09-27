# CarFacTycoon

1900’lerin başında küçük bir atölyede başlıyorsun. Amacın 1960’a kadar dünya çapında bir otomobil markası kurmak. Her model bir proje: tasarlıyorsun, geliştiriyorsun, test ediyorsun, üretiyorsun, satıyorsun. Başarırsan marka büyüyor; hata yaparsan geri çağırmalar ve iflas var.

Tarayıcıda çalışan bir tycoon oyunu (TypeScript + React + Vite). Arayüz Türkçe.

## Oynamak

```bash
npm install
npm run dev          # http://localhost:5173
```

Tek dosyalık sürüm (sunucu gerekmez, dosyayı tarayıcıda açman yeterli):

```bash
npm run build:single # dist-single/index.html
```

Yeni oyunda üç başlangıç seçilir: **Rahat başlangıç** ($80 bin, 3 mühendis, cömert banka), **Tarihi** ($40 bin, 2 mühendis) ve **Zorlu** ($25 bin, temkinli banka).

Kısayollar: **boşluk** duraklat/devam, **1-2-3** hız. Karar isteyen olaylar zamanı durdurur, karar verilince oyun kaldığı hızda sürer. Proje aşaması bittiğinde (geliştirme, test, üretim hazırlığı) ve lansmanda oyun durur ve sen devam ettirene kadar bekler; açılan penceredeki düğme doğrudan sonraki adıma geçer (prototipler, üretim hazırlığı, lansman). Yıl raporu zamanı durdurmaz, köşede bekler. Oyun her çeyrekte tarayıcıya otomatik kaydedilir. Ayarlar ekranından kayıt kodunu kopyalayıp yükleyebilirsin.

claude.ai içinde oyuncu izin verirse oyun kendi kaydını sayfanın veritabanındaki `playtests/g<seed>` belgesine kendiliğinden yazar (üç oyun ayında bir, en fazla dakikada bir; hata olunca hemen). Menüdeki **Claude’a gönder** düğmesi notlu ayrı bir kopya ekler. Kayıtta oyuncunun önemli kararlarının zaman çizelgesi (`decisions`) ve yakalanan hatalar (`errors`) da vardır. `node scripts/playtest.mjs <klasör> <id>` indirilen parçaları yeniden kayda çevirir.

## Ana döngü

1. **Proje:** Segmenti seç. Yeni proje penceresi, tasarım, test ve üretim hazırlığı ekranları projenin lansmana kadar daha ne kadar para yakacağını (prototip, test, kalıp, bu sürede şirketin gideri ya da geliri) kasa ve kredi limitiyle karşılaştırır; kasa ve kredi birlikte yetmiyorsa geliştirmeyi başlatmadan önce sorar (şehir arabası, aile, spor, pikap, lüks, 1946’dan sonra arazi aracı).
2. **Ar-Ge:** Yeni teknolojiler (supap düzenleri, silindir düzenleri, senkromeç, bağımsız süspansiyon, elektrikli marş, hidrolik fren…) yılı gelince dünyada ortaya çıkar, ama şirket onları araştırmadan tasarımda kullanamaz. Yeni çıkmış bir teknolojiyi ilk öğrenen iki kat pahalıya ve daha yavaş öğrenir; beş on yıl içinde ucuzlar. Sanayi büyüdükçe araştırma da büyük bir yatırıma dönüşür: 1906’ya kadar tablo fiyatı geçerlidir, 1918’e kadar bedeller on katına çıkar. Mühendis sayısı araştırmayı hızlandırır ve her 15 mühendis bir araştırma yeri daha açar. Konular bir **Ar-Ge sırasına** dizilebilir: eksik önkoşullar kendiliğinden öne eklenir, bir araştırma bitip yer açılınca sıradaki başlar ve bedeli o an ödenir (kasa yetmezse sıra bekler). Biten ve sıradan başlayan her araştırma için köşede zamanı durdurmayan bir not çıkar. Ar-Ge ekranı her teknolojiyi rakip araçların yüzde kaçının kullandığıyla birlikte gösterir. Ağaçta 66 teknoloji var ve 21’inin önkoşulu var (OHC için önce OHV, hidrolik amortisör için önce sürtünmeli amortisör, radyal lastik için önce balon lastik). Bunların 23’ü **birikim**dir: petek radyatör, manyeto, basınçlı yağlama, balon lastik, hidrolik amortisör, viraj denge çubuğu, kremayer direksiyon gibi. Birikim bir kez öğrenilince bütün yeni tasarımlara kendiliğinden uygulanır; rakipler de bunları sınıflarına göre birkaç yıl gecikmeyle alır. Her yıl yeni teknolojiler ortaya çıkınca dönemin gazetesi bir **ön sayfa** basar: manşette yılın en büyük yeniliği, yanında diğerleri, pazarın geçen yılki satışları ve dünyadan bir haber. Gazete köşede küçük bir sekme olarak bekler ve zamanı durdurmaz; okumak için açınca oyun durur, kapatınca aynı hızla sürer. Hepsi Merkez’deki arşivde kalır.
3. **Tasarım ve geliştirme:** Şasi, gövde, motor (1 ile 16 arası silindir; 3 silindir 1904’ten, V6 1950’den, dizel 1936’dan sonra), şanzıman, süspansiyon, güvenlik ve iç mekân modülleri (her modül dönemine göre açılır). Yeni kuşak, yerine geçtiği arabanın (makyajlarla güncellenmiş) tasarımından başlar. Bütün mühendisler projede çalışır (aynı anda birden fazla proje geliştiriliyorsa aralarında eşit bölünür); daha hızlı bitirmek için işe alım yap. Geliştirme süresi ve başlat düğmesi sayfanın en üstündedir; aracın hemen altındaki **mühendislik odağı** kartlarıyla mühendislerin zamanını performans, verim, konfor, güvenlik, maliyet ve kalite arasında dağıt. Bir odak alanı kilitlenebilir: diğer kaydırıcılar onu değiştirmez. Odak aracı belirgin biçimde değiştirir (tek alana yüklenmek gücü %25’e kadar artırabilir). Lansmana kadar yalnızca mühendis tahminleri (aralıklar) görünür: puanlar gibi güç, ağırlık, maliyet ve üretim zorluğu da. Tecrübesiz ya da küçük bir ekibin tahminleri çok daha geniştir; her model, beceri ve kalabalık bir ekip aralıkları daraltır, testler de. Motor, şanzıman ve süspansiyonun her ayarının yanındaki (i) balonu artırınca ve azaltınca ne olduğunu anlatır; her parçanın altında, sınıfın tipik parçasına göre artıları ve eksileri listelenir. Motor sekmesinde **motor bloğu** bütün silindirleri gerçek ateşleme sırasıyla çalıştırır (sıra motorlar yan yana, V motorlar krank muylusunu paylaşan çiftler halinde); altında krank milinin iki turda hissettiği tork, üstünde motorun dengesi (tek silindir zıplar, üç silindir yalpalar, dört silindir yüksek devirde vızıldar, altı silindir pürüzsüzdür) ve krankın uçtan görünüşü vardır. Süspansiyon sekmesinde araba bir **deneme yolunda** gider: parke taş, sol tekerin altında çukur, kasis, uzun dalgalar ve viraj. Yay sertliği ayardan, amortisör şirketin bildiği amortisörden, aks kütlesi süspansiyon tipinden, lastik dönemin lastiğinden gelir; yolcunun sarsıntısı, lastiğin yola basma kuvveti ve virajda yatma canlı ölçülür.
4. **Test:** Dinamometre, yol, dayanıklılık ve 1934’ten sonra çarpışma testi. Testler adıyla anılan kusurları bulur (“Frenler: balatalar çok erken bitiyor”) ve aracı ayarlar (güç, tüketim, konfor, yol tutuş, güvenlik, güvenilirlik). İlk arabalarında bir firma çok daha fazla kusur yapar; testi kısa kesersen kusurlar sahada patlar. Test haftası prototip yıprattığı için pahalıdır (arabanın birim maliyetinin önemli bir kısmı), ve bazı kusurlar yalnızca müşterinin elinde, yıllar içinde ortaya çıkar: en uzun program bile hepsini yakalayamaz. Test ekranı planın bedelini (kalan hafta, test gideri, mühendis maaşları) ve testleri kısaltmanın kaç kusuru sahaya bırakacağını, ne kadar erken satış ve tasarruf getireceğini gösterir.
5. **Üretim hazırlığı:** Kalıplara para yetmiyorsa ekran nedenini ve çıkış yollarını söyler: kasaya yeten daha ucuz kalıp, eksiği krediyle karşılamak ya da kalıpçıya %15 fazlasıyla vadeli sipariş (borca eklenir). Üç karar: parçaları kim yapacak (ikinci modelden itibaren yap ya da al), arabayı hangi hat üretecek (darboğaz kapasiteyi belirler) ve hangi kalıplar. Yumuşak kalıplar ucuz ve çabuktur ama işçilik kötüdür, fire çoktur; hassas kalıplar pahalı ve yavaştır ama araba daha düzgün ve ucuz çıkar. **Talebi otomatik karşıla** açıksa fabrika her ay en ucuz ek kapasiteyi alır (darboğaza istasyon, hattı genişletme, yeni makine, yeni hat), marjı sağlıksızsa büyümez, talep düşerse fazla hatları satar. **Kapasite planlayıcı** tek tıkla dengeli hatlar kurar ve eski hatları yeniler; darboğaz bölümüne gece vardiyası eklenebilir.
6. **Lansman:** Fiyat, pazarlar, otomobil fuarı. **Fiyat rehberi** rakiplerin fiyatlarını, bu fiyatta tahmini talep aralığını (tahminler ne kadar belirsizse o kadar geniş) ve birkaç fiyat seçeneğinin talebini ve haftalık brüt kârını gösterir. Dergiler fiyatı sınıfa göre tartar. Ucuz başlayıp zam yapmak işe yaramaz: lansmandan sonraki üç yılda %8’den büyük bir zam (enflasyon hariç) dergilerin yeniden yazmasına, lansman heyecanının sönmesine ve itibar kaybına yol açar. Lansman özeti beklenen satışta (orta tahmin) aracın haftalık katkısını, şirketin sabit giderlerini (maaş, genel gider, bayi) ve haftalık neti gösterir; zarar ediyorsa kırmızı uyarır. Otomobil fuarı kendiliğinden seçili gelmez, bedelinin kasanın yüzde kaçı olduğu yazar. Perde açılır, üç dergi puan verir, araç segmentteki bütün rakiplerle karşılaştırılır; bir ay sonra ilk ay raporu gelir.
**Şirket:** 1906’dan itibaren bir **yarış takımı** kurulabilir (amatör, fabrika, Grand Prix; bütçe cironun bir payı). Her Eylül sezonun büyük yarışı koşulur (savaş yıllarında yarış yapılmaz, takım bekler ve bütçe harcanmaz); ekran takımın arabasıyla kazanma ve ilk üç şansını gösterir, yaşlı ya da zayıf bir arabayla yarışılıyorsa uyarır; sonucu en iyi arabanın hızı, yol tutuşu ve dayanıklılığı, mühendislerin becerisi ve bütçe belirler. Zaferler gazete manşeti olur, bütün modellerin prestijini ve markanın bilinirliğini artırır; ün yarışmayı bırakınca söner. Senden küçük **rakipler satın alınabilir**: modelleri piyasadan çekilir, mühendisleri katılır, bayileri senin arabalarını satar, başka kıtadaysa o pazar açılır. Şirket değeri (makineler, stok, kasa, borç ve markanın kazanç gücü) oyun sonu puanına girer; 1960’ta satış sırası, şirket değeri, itibar, en iyi dergi puanı ve yarış zaferlerinden en fazla 1700 puan hesaplanır; puan ölçekte gösterilir (Butik atölye, Saygın marka 650+, Büyük üretici 900+, Sanayi devi 1150+, Efsane 1400+) ve kopyalanabilir. Rakip satın alma onay ister.

**Nakit:** Kasa eksiye düştüğünde ve iflasa beş hafta kala oyun durur: kalan hafta, son 52 haftanın en büyük giderleri, bankanın hâlâ verebileceği kredi ve boştaki mühendisler listelenir; tek tıkla açığı kapatacak kadar kredi alınır. İflas penceresi de paranın nereye gittiğini gösterir. Merkez’deki yapılacaklar listesi boşta maaş alan mühendisleri ve artık üretilmeyen modelleri söyler. Haber akışı “Şirketim / Rakipler / Teknoloji” başlıklarına ayrılır, şirketin son iki ayın kötü haberleri üstte sabit durur. “Talebi otomatik karşıla”nın harcaması Finans’ta ayrı satırda ve modelin ekranında görünür. Kapasite planlayıcı erken yıllarda ucuz bir **atölye hattı** da önerir.

7. **Satış sonrası:** Müşteri yorumları ve **müşteri mektupları** (sahibin adı, kasabası, mesleği ve arabanın sınıfa göre güçlü ve zayıf yanları, fiyatı, ortaya çıkmış arızaları, yaşı hakkında yazdıkları), arızalar, geri çağırma ya da sessiz kalma kararı, makyaj ve yeni kuşak. Bir araba patlama yapınca (şirketin bininci arabası, bir modelin 10 bininci, 100 bininci, milyonuncu satışı, sınıf liderliği) gazete manşet atar: satış rakamları, bayi kuyrukları, dönemin üslubunda bir ilan ve okur mektupları.

Oyun her tasarımdan 0-100 (erken dönemde 0-50), son hız, tüketim, konfor, yol tutuş, güvenlik, güvenilirlik, prestij, pratiklik ve maliyeti hesaplar. Her segmentin bu özelliklere verdiği önem gizlidir. Oyuncu bunu satış raporlarından ve dergi yorumlarından öğrenir ve **Pazarlar → Segment bilgisi** tablosu zamanla dolar.

## Bu sürümün kapsamı ve tasarım kararları

| Tasarım belgesindeki endişe | Bu sürümdeki çözüm |
|---|---|
| Kapsam çok büyük | Yalnız 1900-1960, yalnız ABD ve Avrupa. Fabrika serbest harita değil: pres, gövde, boya ve montajdan oluşan dört istasyonlu hatlar; darboğaz kırmızı yanar. |
| Motor fiziği istismar edilmemeli | Devir sınırı hem piston hızına hem dönemin malzemesine bağlıdır: 1900’de olgun sınırın yarısı, 1960’ta tamamı. Çok kısa stroklu bir motor erken yıllarda hızlı değil yalnızca küçük olur. |
| Motor simülatörü yeni oyuncu için ağır | **Mühendis modu** varsayılan olarak açık: silindir düzeni, çap, strok, sıkıştırma, supap, yakıt sistemi ve kompresörün her birinin altında artırınca ve azaltınca ne olduğu yazar. Güç ve tork eğrilerinin altında motorun sınıfın tipik motoruna göre artıları ve eksileri listelenir. Karışık gelirse Ayarlar’dan basit moda (hazır motorlar ve tek bir “karakter” kaydırıcısı) geçilir. |
| Gizli ağırlıklar rastgele hissettirebilir | Aylık müşteri yorumları (“Pikap alıcıları güvenilirlikten şikâyetçi”), dergi alıntıları, doldurulan segment bilgisi tablosu, ücretli pazar araştırması ve model ekranında “Neden bu kadar satıyor?” dökümü (çekicilik, fiyat, marka, lansman heyecanı, yaş, erişim, rakipler). |
| Tasarım hayal gücüne yer bırakmalı | Yeni proje sınıfın tipik aracıyla değil, şirketin son aracıyla (ilk projede sade bir atölye arabasıyla) başlar. Tasarım ve test sırasında önem noktaları gösterilmez; segment metinleri alıcının ne istediğini değil kim olduğunu anlatır. |
| Puanlar döneme göre olmalı | Her puan o yılın aynı sınıftaki ortalama aracına göre hesaplanır (50 = ortalama). Eski modeller kendiliğinden eskir; üstüne alıcılar iki yaşından büyük bir tasarımı her yıl biraz daha az çekici bulur (en fazla −20 puan), makyaj bu yaşın çoğunu sıfırlar. Rakipler 1946’ya kadar beş, sonra dört yılda bir yenilenir. Pazar büyüse bile yenilenmeyen bir modelin payı erir. |
| Rakipler gerekli | Rakipler önde başlar: köklü firmaların büyük mühendislik kadroları arabalarına daha çok emek koyar, önde gelenler yeni teknolojiyi bir iki yıl erken kullanır, 1900’de satan firmaların bayileri zaten vardır. İyi bir ilk araba sınıfın ortalarına, sıradan bir ilk araba sonlarına yerleşir; tanınmayan bir markanın lansmanı da daha az ses getirir. 17 büyük ve yaklaşık 220 küçük kurgusal üretici; 1930’a kadar her açık sınıfta 10-15, sonra 6-10 isimli araç. Küçükler kurulur, kapanır, yerlerine yenileri gelir. Yeni bir firmanın ilk arabaları işçilik yüzünden daha az güvenilir, konforlu ve prestijlidir. 1900’den itibaren her pazarda her segmentte isimli rakip var (testle korunur). Bir segmentte payın büyürse rakipler yeni modellerini erken ve daha iyi çıkarır. Araçları oyuncunun kullandığı hesaplayıcıyla bir yapay tasarımcı üretir. |
| Sistemler kademeli açılmalı | İhracat ve yap-ya-da-al ikinci modelle, platform ve motor paylaşımı üçüncü modelle açılır. |

### Tarihten mekaniğe

- **İngiliz vergi beygiri (1910-1947):** Avrupa’da araç vergisi yalnızca silindir çapına ve silindir sayısına bakar. Uzun stroklu motor vergide avantajlıdır.
- **Hareketli montaj hattı (1913), günde 5 dolar (1914), Duco boya (1924):** Fabrikadaki darboğaz yer değiştirir. Beş dolar işçiliği %40 artırır ama işçi kaçmadığı için verim %30 yükselir.
- **Büyük Savaş (1914-1918):** Çelik pahalanır (malzeme +%25); bütün üreticilerin fiyatları da yükselir, bu yüzden savaş fiyatına uymak zam sayılmaz.
- **Büyük Buhran (1929):** Lüks talep çöker, bankalar krediyi kısar, “işçi çıkar ya da çıkarma” kararı gelir.
- **Savaşlar:** Sivil pazar kapanır, askeri sözleşmeler gelir. Cip tecrübesi savaştan sonra arazi aracı segmentini besler.
- **“Neden böyle çalışıyor?” kartları:** Dört zamanlı motor, şanzıman, elektrikli marş, hareketli hat, hidrolik fren (Pascal), kompresör, Duco boya, senkromeç, monokok ve bağımsız süspansiyon için animasyonlu açıklamalar.

## Proje yapısı

```
src/core/   simülasyon (arayüzden bağımsız, saf TypeScript)
  engine.ts      motor: çap/strok → devir sınırı, BMEP, tork eğrisi, vergi beygiri
  vehicle.ts     araç: kütle, aerodinamik, vites oranları, 0-50/0-100 simülasyonu, son hız, tüketim
  scoring.ts     dönem/sınıf referansına göre puanlar, segment ağırlıkları
  ai.ts          rakiplerin ve referans aracın yapay tasarımcısı, hazır motorlar
  market.ts      logit talep modeli, fiyat, gümrük, vergi, bayi erişimi
  testing.ts     gizli kusurlar, testler, sahada arıza, tedarikçi kalitesi
  research.ts    Ar-Ge: önkoşullar, maliyet, süre, birikimler
  news.ts        gazete ön sayfaları; letters.ts müşteri mektupları
  factory.ts     hat kapasitesi ve darboğaz
  game.ts        haftalık döngü; actions.ts oyuncu eylemleri
src/data/   içerik: teknolojiler, segmentler, pazarlar (tarihî satış rakamları), rakipler, olaylar, kartlar
src/ui/     React arayüzü, grafikler, araç çizimi, fabrika animasyonu, kart animasyonları,
           motor bloğu ve süspansiyon simülasyonları, gazete
scripts/    denge botu ve uzun simülasyonlar
tests/      birim ve uçtan uca simülasyon testleri
```

```bash
npm test          # birim testleri + botla tam kampanya
npm run balance   # uzun denge simülasyonları (yıllık kâr, marj, pazar payı dökümü)
npm run typecheck
```

## Yol haritası (genişlemeler)

- 1961-2030 dönemleri: petrol krizi (1973), emisyon kuralları (1975), çarpışma testi yıldızları, emisyon hilesi kararı (2015), elektrikli araçlar.
- **Türkiye senaryosu:** 1961 Devrim, lisans ikilemi, ÖTV’nin motor hacmi kademeleri, gümrük birliği, yerli elektrikli araç.
- Japonya ve Türkiye pazarları, serbest yerleşimli fabrika haritası.
