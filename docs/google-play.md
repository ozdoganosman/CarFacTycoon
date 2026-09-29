# Google Play'e yayın

Oyunun Android uygulaması `android/` klasöründe (Capacitor). GitHub Actions'taki **Android** iş akışı her push'ta iki dosya üretir (Actions → çalıştırma → *Artifacts*):

- `app-debug.apk`: telefona doğrudan kurulur, denemek için.
- `app-release.aab`: Google Play'e yüklenen paket. Yükleme anahtarı gizli ayarlarda yoksa imzasızdır; Play imzasız paketi kabul etmez.

Uygulama kimliği `io.github.ozdoganosman.carfactycoon`. **İlk yüklemeden sonra değiştirilemez**; değişecekse ilk yüklemeden önce `capacitor.config.ts` ve `android/app/build.gradle` içinde değiştirilmeli.

## 1. Geliştirici hesabı

1. [play.google.com/console](https://play.google.com/console) → kişisel hesap, bir kerelik 25 $. Kimlik doğrulaması birkaç gün sürebilir.
2. Kişisel hesaplarda uygulamayı herkese açmadan önce **kapalı test** şartı var: en az 12 test kullanıcısı, 14 gün kesintisiz. Başvururken güncel kuralı Play Console gösterir.

## 2. Yükleme anahtarı (bir kez)

Play, uygulamayı kendi anahtarıyla imzalar (Play App Signing); bizim anahtarımız yalnızca "bu paketi ben yükledim" demek için. Kaybolursa Play destekten sıfırlanabilir, yine de güvenli bir yerde saklanmalı ve **asla repoya konmamalı** (`android/.gitignore` `*.jks` dosyalarını dışarıda tutar).

Java yüklü bir bilgisayarda (Android Studio ile gelir):

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Sonra GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret** ile dört gizli ayar:

| Ad | Değer |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `upload.jks` dosyasının base64 hali: macOS `base64 -i upload.jks`, Linux `base64 -w0 upload.jks`, Windows PowerShell `[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks"))` |
| `ANDROID_KEYSTORE_PASSWORD` | anahtar deposunun şifresi |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | anahtarın şifresi (keytool aynı şifreyi önerir) |

Bundan sonraki her çalıştırmada `app-release.aab` imzalı çıkar. Sürüm kodu Actions çalıştırma numarasıdır, her yüklemede kendiliğinden büyür.

## 3. Uygulamayı oluşturma

Play Console → **Uygulama oluştur**: ad `CarFacTycoon`, varsayılan dil Türkçe, tür **Oyun**, **Ücretsiz**.

## 4. Mağaza sayfası

**Uygulama adı** (en çok 30): `CarFacTycoon – Araba Fabrikası`

**Kısa açıklama** (en çok 80):
- TR: `1900 Amerika'sı: arabanı tasarla, fabrikanı kur, eyalet eyalet büyü.`
- EN: `America, 1900: design your cars, build the factory, grow state by state.`

**Uzun açıklama (TR):**

```
1900 yılı, Amerika. Küçük bir atölye, bir avuç mühendis ve biraz para. Amacın 1960'a kadar ülkenin büyük otomobil markalarından biri olmak.

• Nereden başlayacağını seç: ucuz parçalı Detroit, dev pazarlı New York, boş topraklı Los Angeles ya da dört şehir daha.
• Arabanı parça parça tasarla: gövde, şasi, süspansiyon, şanzıman ve silindir silindir motor. Sıkıştırmayı artır, vuruntuyu dinle, tork eğrisinin değiştiğini gör.
• Prototipleri test et, gizli kusurları lansmandan önce bul. Lansman günü dergiler arabanı puanlar, alıcılar mektup yazar.
• Eyalet eyalet büyü: dönem haritasında bayi ara, servis atölyesi aç, yollardaki arabalarını ve hurdaya çıkanları gör. Ağ büyüdükçe gideri de büyür.
• Fabrikanı kur: pres, gövde, boya ve montaj, darboğazlar, gece vardiyası, yürüyen bant.
• Öne geçersen büyük rakipler karşılık verir: fiyat savaşları, sana karşı yapılmış yeni modeller, birleşmeler, hisse baskınları.
• Borsaya açıl: sermaye gelir, ama yönetim kurulu her yıl büyüme ve temettü ister. Hedefleri tutturamazsan görevden alınırsın.
• Dönemin gerçek teknolojilerini araştır, savaş yıllarını ve 1929 buhranını atlat. Gazeteler her yeniliği manşetten duyurur; "neden böyle çalışıyor?" kartlarıyla gerçek otomobil mühendisliğini öğren.

İnternetsiz oynanır, hesap gerekmez, reklam yok.
```

**Uzun açıklama (EN):**

```
America, 1900. A small workshop, a handful of engineers and a little money. Your goal: one of the country's great car makers by 1960.

• Pick your town: Detroit's cheap parts, New York's huge market, Los Angeles' open country, or four more.
• Design your car part by part: body, chassis, suspension, gearbox and an engine you tune cylinder by cylinder. Raise the compression, listen for knock, watch the torque curve change.
• Test your prototypes and find hidden flaws before launch. On launch day the magazines rate your car and owners write letters.
• Grow state by state: look for dealers on a period map, open service shops, see how many of your cars are on the road and how many go to the scrapyard. The bigger the network, the dearer it gets.
• Build your factory: presses, body, paint and assembly, bottlenecks, night shifts, the moving line.
• Get ahead and the big makers fight back: price wars, cars built to beat yours, mergers, raids on your shares.
• Go public: the capital comes in, but the board wants growth and dividends every year. Miss the targets and you are voted out.
• Research the real technologies of the era and live through the war years and the 1929 crash. Period newspapers announce every breakthrough; "why does it work like this?" cards teach real automotive engineering as you play.

Plays offline, no account needed, no ads. The game is in Turkish.
```

(İngilizce metin mağazada ayrı dil olarak eklenebilir; oyunun kendisi şimdilik yalnızca Türkçe, İngilizce metnin son cümlesi bunu söylüyor.)

**Grafikler** (`docs/play/`):
- Uygulama simgesi 512×512: `icon-512.png`
- Öne çıkan görsel 1024×500: `feature-graphic.png` (`promo/capture/feature.mjs`)
- Telefon ekran görüntüleri 1080×1920: `screenshots/01-harita.jpg` … `08-gazete.jpg` (en az 2, en çok 8; `promo/capture/store.mjs`)
- Tanıtım videosu (YouTube bağlantısı, herkese açık ya da liste dışı): `promo/` içindeki Remotion projesi, `promo/README.md`

Görseller oyunun o anki haliyle yeniden üretilebilir: kayıtlar `PROMO_SAVES=1 npx vitest run --config vitest.balance.config.ts scripts/promo-saves.balance.ts`, sonra uygulama derlemesi (`npx vite build --mode app`, `dist-app` klasörünü 5191 portunda sun) ve betikler.

## 5. Uygulama içeriği (Policy → App content)

- **Gizlilik politikası:** `https://ozdoganosman.github.io/CarFacTycoon/privacy.html` (kaynak `public/privacy.html`; yayından önce iletişim e-postası eklenmeli).
- **Reklamlar:** Hayır, reklam yok. (AdMob eklenince "Evet" olacak ve gizlilik politikası ondan önce güncellenecek.)
- **Uygulama erişimi:** Tüm özellikler özel erişim olmadan kullanılabilir.
- **İçerik derecelendirmesi (IARC anketi):** Kategori *Oyun*. Şiddet, cinsellik, küfür, kumar yok; kullanıcılar birbiriyle iletişim kurmaz; dijital satın alma yok. Beklenen sonuç: 3+ / Herkes.
- **Hedef kitle:** 13 yaş ve üstü (13–15, 16–17, 18+). "Çocukların ilgisini çekiyor mu?" → Hayır.
- **Haber uygulaması, sağlık, finans özellikleri, devlet uygulaması:** Hayır.

### Veri güvenliği formu

- Veri topluyor mu? **Evet.** Paylaşıyor mu? **Hayır** (Supabase ve PostHog bizim adımıza veri işleyen hizmet sağlayıcılardır; Play'in tanımında bu "paylaşım" sayılmaz).
- Aktarım sırasında şifreli mi? **Evet.**
- Kullanıcı silme isteyebilir mi? **Evet** (oyun içinde: Geri bildirim → Gönderdiğim verileri sil).
- Toplama isteğe bağlı mı? **Evet**, hepsi için (oyuncu "Paylaş" demeden hiçbir şey gitmez).

| Veri türü | Toplanıyor | Amaç |
|---|---|---|
| Konum → Yaklaşık konum | Evet (PostHog bağlantıdan ülke/şehir çıkarır)* | Analiz |
| Uygulama etkinliği → Uygulama etkileşimleri | Evet (ekranlar, dokunuşlar, kararlar, ekran kaydı) | Analiz |
| Uygulama etkinliği → Kullanıcının oluşturduğu diğer içerik | Evet (şirket adı, notlar, kayıtlı oyun) | Analiz |
| Uygulama bilgileri ve performans → Kilitlenme günlükleri, Tanılama | Evet (oyun hataları) | Analiz |
| Cihaz veya diğer kimlikler | Evet (rastgele oyuncu numarası) | Analiz |

\* PostHog'da **Data pipeline → GeoIP** dönüştürücüsü kapatılırsa yaklaşık konum toplanmaz; o zaman hem bu satır hem gizlilik politikasındaki cümle kaldırılmalı.

## 6. Kapalı test ve yayın

1. **Test → Kapalı test → Yeni sürüm**: Actions'tan indirilen imzalı `app-release.aab` dosyasını yükle.
2. Test kullanıcılarının Gmail adreslerini bir listeye ekle, katılım linkini onlara gönder.
3. 14 gün sonra **Üretim** için erişim başvurusu; onaydan sonra aynı paket üretime alınır.

Güncellemeler: kodu gönder → Actions yeni `app-release.aab` üretir → Play Console'da yeni sürüm olarak yükle.

## 7. Silme istekleri (her ay)

Oyuncu "Gönderdiğim verileri sil" dediğinde oyun kayıtları Supabase'den hemen silinir ve oyuncu numarası `deletion_requests` tablosuna düşer. Gizlilik politikası oynanış verilerinin de 30 gün içinde silineceğini söylüyor:

1. Supabase → Table Editor → `deletion_requests`: `analytics_deleted_at` boş olan satırlar.
2. PostHog → **People** → oyuncu numarasını ara → **Delete person** (olaylarıyla ve kayıtlarıyla birlikte).
3. Satırda `analytics_deleted_at` alanına tarihi yaz.

(Bu adım Claude'a da yaptırılabilir; PostHog bağlandığında otomatikleştirilebilir.)

## 8. PostHog ayarları

- **Settings → Project → IP data capture → Discard client IP data**: açık.
- **Session replay → Record user sessions**: açık (yoksa ekran kaydı tutulmaz).
- Saklama süresi gizlilik politikasındaki 24 ayı aşmamalı (ücretsiz planda zaten daha kısa).
