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

Oyun altı dilde oynanır (Türkçe, English, Deutsch, Español, हिन्दी, العربية); mağaza sayfası da her dilde hazırdır.
Metinlerin tek kaynağı `fastlane/metadata/android/<dil>/` klasörleridir (ad en çok 30, kısa açıklama en çok 80, uzun
açıklama en çok 4000 karakter; hepsi sınırın içinde). Varsayılan dil Türkçe: `tr-TR/title.txt` →
`CarFacTycoon – Araba Fabrikası`.

**Mağaza sayfası dosyaları** (`fastlane/metadata/android/<dil>/`, Play'in ve fastlane'in beklediği düzen):
- `title.txt`, `short_description.txt`, `full_description.txt`: tr-TR, en-US, de-DE, es-419, hi-IN, ar.
- `images/icon.png` (512×512), `images/featureGraphic.png` (1024×500, `promo/capture/feature.mjs`),
  `images/phoneScreenshots/01-harita.jpg … 08-gazete.jpg` (1080×1920, `promo/capture/store.mjs`).
- Tanıtım videosu (YouTube bağlantısı, herkese açık ya da liste dışı): `promo/` içindeki Remotion projesi, Türkçe
  (`npm run render`) ve İngilizce (`npm run render:en`); ayrıntı `promo/README.md`. İngilizce video en-US ve diğer
  dillerin girişine, Türkçe video tr-TR girişine eklenir.

Play Console'da her dil **Mağaza varlığı → Ana mağaza girişi → Çevirileri yönet → Kendi çevirilerini ekle** ile eklenir;
metinler ve görseller o dilin klasöründen yapıştırılır/yüklenir. Paket yüklemeden önce yapılabilir.

Görseller oyunun o anki haliyle, her dilde yeniden üretilebilir:

```sh
PROMO_SAVES=1 PROMO_LANG=en npx vitest run --config vitest.balance.config.ts scripts/promo-saves.balance.ts   # kayıtlar (tr için PROMO_LANG'sız)
npx vite build --mode app && python3 -m http.server 5191 --directory dist-app &                            # uygulama derlemesi
GAME_LANG=en node promo/capture/store.mjs && GAME_LANG=en node promo/capture/feature.mjs                   # ekran görüntüleri, öne çıkan görsel
```

## 5. Uygulama içeriği (Policy → App content)

- **Gizlilik politikası:** `https://ozdoganosman.github.io/CarFacTycoon/privacy.html` (kaynak `public/privacy.html`; yayından önce iletişim e-postası eklenmeli).
- **Reklamlar:** Evet, uygulama reklam içeriyor (AdMob).
- **Reklam kimliği:** Evet, kullanılıyor; amaç *Reklam veya pazarlama* (AdMob). (`AD_ID` izni reklam kütüphanesiyle kendiliğinden gelir.)
- **Uygulama erişimi:** Tüm özellikler özel erişim olmadan kullanılabilir.
- **İçerik derecelendirmesi (IARC anketi):** Kategori *Oyun*. Şiddet, cinsellik, küfür, kumar yok; kullanıcılar birbiriyle iletişim kurmaz; dijital satın alma **var** (reklamları kaldır). Beklenen sonuç: 3+ / Herkes.
- **Hedef kitle:** 13 yaş ve üstü (13–15, 16–17, 18+). "Çocukların ilgisini çekiyor mu?" → Hayır.
- **Haber uygulaması, sağlık, finans özellikleri, devlet uygulaması:** Hayır.

### Veri güvenliği formu

- Veri topluyor mu? **Evet.** Paylaşıyor mu? **Evet**: reklam kütüphanesi (Google AdMob) reklam için veri gönderir. (Supabase ve PostHog bizim adımıza veri işleyen hizmet sağlayıcılardır; Play'in tanımında onlar "paylaşım" sayılmaz.)
- Aktarım sırasında şifreli mi? **Evet.**
- Kullanıcı silme isteyebilir mi? **Evet** (oyun içinde: Geri bildirim → Gönderdiğim verileri sil).
- Toplama isteğe bağlı mı? Oyun verileri için **Evet** (oyuncu "Paylaş" demeden hiçbir şey gitmez); AdMob'un topladıkları için **Hayır** (reklam gösterilirken gider).

| Veri türü | Toplanıyor | Amaç |
|---|---|---|
| Konum → Yaklaşık konum | Evet (PostHog bağlantıdan ülke/şehir çıkarır)* | Analiz |
| Uygulama etkinliği → Uygulama etkileşimleri | Evet (ekranlar, dokunuşlar, kararlar, ekran kaydı) | Analiz |
| Uygulama etkinliği → Kullanıcının oluşturduğu diğer içerik | Evet (şirket adı, notlar, kayıtlı oyun) | Analiz |
| Uygulama bilgileri ve performans → Kilitlenme günlükleri, Tanılama | Evet (oyun hataları) | Analiz |
| Cihaz veya diğer kimlikler | Evet (rastgele oyuncu numarası) | Analiz |
| Cihaz veya diğer kimlikler (reklam kimliği) | Evet, **paylaşılıyor** (AdMob) | Reklam veya pazarlama, Analiz, Dolandırıcılığı önleme |
| Konum → Yaklaşık konum (IP'den) | Evet, **paylaşılıyor** (AdMob) | Reklam veya pazarlama, Analiz, Dolandırıcılığı önleme |
| Uygulama etkinliği → Uygulama etkileşimleri (reklamlarla) | Evet, **paylaşılıyor** (AdMob) | Reklam veya pazarlama, Analiz |
| Uygulama bilgileri ve performans → Kilitlenme günlükleri, Tanılama (reklam kütüphanesi) | Evet, **paylaşılıyor** (AdMob) | Analiz, Dolandırıcılığı önleme |

\* PostHog'da **Data pipeline → GeoIP** dönüştürücüsü kapatılırsa PostHog yaklaşık konum toplamaz; o zaman o satır ve gizlilik politikasındaki cümle kaldırılmalı (AdMob satırı kalır).

AdMob satırları Google'ın kendi rehberine göre: [developers.google.com/admob/android/privacy/play-data-disclosure](https://developers.google.com/admob/android/privacy/play-data-disclosure). Formu doldururken bu sayfanın güncel halini kontrol et.

## 5b. Reklamlar (AdMob) ve "Reklamları kaldır"

Oyunun Android sürümündeki reklamlar (tarayıcı sürümünde reklam yok):

| Reklam | Nerede | Sıklık |
|---|---|---|
| Ödüllü (sponsor parası) | Üst çubukta 📺 düğmesi, kasa eksiye düşünce uyarıda | Oyuncu isterse, oyun içinde çeyrekte bir (yarım haftalık ciro kadar para) |
| Ödüllü geçiş (yıl sonu primi) | Yıl sonu kartında | Yılda bir teklif; arada bir 5 saniye geri sayıp kendisi başlar, oyuncu "Hayır" diyebilir (yılın vergisinin yarısı kadar para) |
| Geçiş | Lansman raporu kapanınca, gazete kapanınca | Oturumun ilk 3 dakikasında hiç, iki reklam arasında en az 4 dakika |
| Yerel (gazete ilanı) | Gazete okurken sayfanın altında, dönem ilanı görünümünde | Her gazetede |

"Reklamları kaldır" satın alınınca geçiş reklamı, kendiliğinden başlayan yıl sonu reklamı ve gazete ilanı kalkar; sponsor parası için reklamı oyuncu isterse yine izleyebilir.

### AdMob kurulumu (bir kez)

1. [admob.google.com](https://admob.google.com) → hesap aç (ödeme ve vergi bilgileri dahil).
2. **Uygulamalar → Uygulama ekle** → Android, "henüz yayında değil". Uygulama kimliğini (`ca-app-pub-…~…`) not al; Play'de yayınlanınca uygulamayı mağaza kaydına bağla.
3. **Reklam birimleri**: dört birim oluştur ve kimliklerini (`ca-app-pub-…/…`) not al:
   - *Ödüllü* → `sponsor`
   - *Ödüllü geçiş* → `yil-sonu`
   - *Geçiş* → `ara`
   - *Yerel gelişmiş* → `gazete`
4. **Gizlilik ve mesajlaşma → GDPR**: Avrupa için onay mesajı oluştur ve yayınla (uygulama bu mesajı kendisi gösterir; yoksa Avrupa'da kişiselleştirilmemiş/sınırlı reklam çıkar).
5. GitHub → repo → **Settings → Secrets and variables → Actions → Variables** sekmesi → **New repository variable** ile beş değişken (gizli değildir):

| Ad | Değer |
|---|---|
| `ADMOB_APP_ID` | uygulama kimliği (`~` işaretli) |
| `ADMOB_REWARDED` | ödüllü birim |
| `ADMOB_REWARDED_INTERSTITIAL` | ödüllü geçiş birimi |
| `ADMOB_INTERSTITIAL` | geçiş birimi |
| `ADMOB_NATIVE` | yerel gelişmiş birim |

Değişkenler yokken uygulama Google'ın **test reklamlarını** gösterir ("Test Ad" yazar, para kazandırmaz); kapalı testte bu işe yarar, üretime çıkmadan önce değişkenler girilmeli. Kendi telefonunda gerçek reklamlara dokunma (AdMob hesabı kapatılabilir); denemeyi test reklamlarıyla yap.

İsteğe bağlı: `app-ads.txt` dosyası geliştirici web sitesinin **kök** alanında durmalı (`https://ozdoganosman.github.io/app-ads.txt`, yani `ozdoganosman.github.io` adlı ayrı bir repo). Yoksa reklamlar yine çıkar, AdMob yalnızca uyarı gösterir.

### "Reklamları kaldır" ürünü

1. Play Console → **Ayarlar → Ödeme profili** (satıcı hesabı) kur; uygulama içi satış için gerekli.
2. Önce faturalandırma kitaplığını içeren bir AAB'yi (bu sürümden itibaren hepsi) herhangi bir teste yükle; Play ürün oluşturmayı ancak ondan sonra açar.
3. **Para kazanma → Ürünler → Uygulama içi ürünler → Ürün oluştur**: kimlik **`remove_ads`** (oyun bu kimliği arar), ad "Reklamları kaldır", açıklama "Geçiş reklamlarını ve gazete ilanını kaldırır", fiyat senin kararın. Etkinleştir.
4. Deneme: **Ayarlar → Lisans testi**'ne kendi Gmail adresini ekle; test satın alması ücret almaz.

Oyunda: **Ayarlar → Reklamlar → Reklamları kaldır (fiyat)** ve **Satın alımı geri yükle** (başka telefona geçince).

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
