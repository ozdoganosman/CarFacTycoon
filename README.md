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

Kısayollar: **boşluk** duraklat/devam, **1-2-3** hız. Oyun her çeyrekte tarayıcıya otomatik kaydedilir. Ayarlar ekranından kayıt dosyası indirip yükleyebilirsin.

## Ana döngü

1. **Proje:** Segmenti (şehir arabası, aile, spor, pikap, lüks, 1946’dan sonra arazi aracı) ve hedef fiyatı seç.
2. **Tasarım:** Şasi, gövde, motor, şanzıman, süspansiyon, güvenlik ve iç mekân modülleri. Her modül dönemine göre açılır.
3. **Geliştirme:** Mühendisleri ata; odağı performans, verim, konfor, güvenlik ve maliyet arasında dağıt.
4. **Test:** Dinamometre, yol, dayanıklılık ve 1934’ten sonra çarpışma testi. Testi kısa kesersen erken çıkarsın ama gizli kusurlar sahada patlar.
5. **Üretim:** Yap ya da satın al (motor, şanzıman, elektrik), hat seçimi, kalıplar.
6. **Lansman:** Fiyat, pazarlar, otomobil fuarı. Üç dergi puan verir.
7. **Satış sonrası:** Müşteri yorumları, arızalar, geri çağırma ya da sessiz kalma kararı, makyaj ve yeni kuşak.

Oyun her tasarımdan 0-100 (erken dönemde 0-50), son hız, tüketim, konfor, yol tutuş, güvenlik, güvenilirlik, prestij, pratiklik ve maliyeti hesaplar. Her segmentin bu özelliklere verdiği önem gizlidir. Oyuncu bunu satış raporlarından ve dergi yorumlarından öğrenir ve **Pazarlar → Segment bilgisi** tablosu zamanla dolar.

## Bu sürümün kapsamı ve tasarım kararları

| Tasarım belgesindeki endişe | Bu sürümdeki çözüm |
|---|---|
| Kapsam çok büyük | Yalnız 1900-1960, yalnız ABD ve Avrupa. Fabrika serbest harita değil: pres, gövde, boya ve montajdan oluşan dört istasyonlu hatlar; darboğaz kırmızı yanar. |
| Motor simülatörü yeni oyuncu için ağır | Varsayılan olarak hazır motorlar ve tek bir “karakter (strok/çap)” kaydırıcısı. Silindir, çap, strok, sıkıştırma, supap, yakıt sistemi ve kompresör **Mühendis modu**nda. |
| Gizli ağırlıklar rastgele hissettirebilir | Aylık müşteri yorumları (“Pikap alıcıları güvenilirlikten şikâyetçi”), dergi alıntıları, doldurulan segment bilgisi tablosu, ücretli pazar araştırması ve model ekranında “Neden bu kadar satıyor?” dökümü (çekicilik, fiyat, marka, yenilik, erişim, rakipler). |
| Puanlar döneme göre olmalı | Her puan o yılın aynı sınıftaki ortalama aracına göre hesaplanır (50 = ortalama). Eski modeller kendiliğinden eskir. |
| Rakipler gerekli | 13 kurgusal üretici. Araçları oyuncunun kullandığı hesaplayıcıyla bir yapay tasarımcı üretir. |
| Sistemler kademeli açılmalı | İhracat ve yap-ya-da-al ikinci modelle, platform ve motor paylaşımı üçüncü modelle açılır. |

### Tarihten mekaniğe

- **İngiliz vergi beygiri (1910-1947):** Avrupa’da araç vergisi yalnızca silindir çapına ve silindir sayısına bakar. Uzun stroklu motor vergide avantajlıdır.
- **Hareketli montaj hattı (1913), günde 5 dolar (1914), Duco boya (1924):** Fabrikadaki darboğaz yer değiştirir.
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
  factory.ts     hat kapasitesi ve darboğaz
  game.ts        haftalık döngü; actions.ts oyuncu eylemleri
src/data/   içerik: teknolojiler, segmentler, pazarlar (tarihî satış rakamları), rakipler, olaylar, kartlar
src/ui/     React arayüzü, grafikler, araç çizimi, fabrika animasyonu, kart animasyonları
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
