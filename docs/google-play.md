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
- TR: `1900'lerden 1960'a: arabalarını tasarla, fabrikanı kur, markanı büyüt.`
- EN: `From 1900 to 1960: design your cars, build your factory, grow your brand.`

**Uzun açıklama (TR):**

```
1900 yılı. Küçük bir atölye, iki mühendis ve biraz para. Amacın 1960'a kadar dünya çapında bir otomobil markası kurmak.

• Arabanı parça parça tasarla: gövde, şasi, süspansiyon, şanzıman ve silindir silindir motor. Sıkıştırma oranını artır, vuruntuyu dinle, tork eğrisinin nasıl değiştiğini gör.
• Mühendislerini doğru alanlara yönlendir, prototipleri test et, gizli kusurları lansmandan önce bul.
• Lansman günü dergiler arabanı puanlar; alıcıların neyi sevdiğini zamanla öğren.
• Fabrikanı kur: pres, gövde, boya ve montaj istasyonları, darboğazlar, gece vardiyaları, yürüyen bant.
• Dönemin gerçek teknolojilerini araştır: senkromeçli şanzıman, üstten kam, V8, hidrolik fren…
• Savaş yılları, 1929 buhranı, işçi ücretleri kararları ve rakip markalar. Dönem gazeteleri her yeniliği manşetten duyurur.
• Her teknoloji için "neden böyle çalışıyor?" kartları: oynarken gerçek otomobil mühendisliği öğren.

İnternetsiz oynanır, hesap gerekmez.
```

**Uzun açıklama (EN):**

```
It's 1900. A small workshop, two engineers and a little money. Your goal: a world-class car brand by 1960.

• Design your car part by part: body, chassis, suspension, gearbox and an engine you tune cylinder by cylinder. Raise the compression, listen for knock, watch the torque curve change.
• Point your engineers at the right areas, test your prototypes and find hidden flaws before launch.
• On launch day the magazines rate your car; learn over time what buyers really want.
• Build your factory: presses, body, paint and assembly stations, bottlenecks, night shifts, the moving line.
• Research the real technologies of the era: synchromesh, overhead cams, the V8, hydraulic brakes…
• War years, the 1929 crash, decisions on workers' wages and rival brands. Period newspapers announce every breakthrough.
• "Why does it work like this?" cards for every technology: learn real automotive engineering as you play.

Plays offline, no account needed.
```

(İngilizce metin mağazada ayrı dil olarak eklenebilir; oyunun kendisi şimdilik yalnızca Türkçe, bu yüzden İngilizce sayfada bunu belirtmek dürüst olur.)

**Grafikler** (`docs/play/`):
- Uygulama simgesi 512×512: `icon-512.png`
- Öne çıkan görsel 1024×500: `feature-graphic.png`
- Telefon ekran görüntüleri 1080×1920: `screenshots/01-merkez.jpg` … `08-final.jpg` (en az 2, en çok 8)

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
