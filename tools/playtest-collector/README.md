# Oyuncu verisi toplayıcı (Google Apps Script)

Oyunun herkese açık sürümü (GitHub Pages, itch.io ya da paylaşılan HTML dosyası), paylaşmayı kabul eden oyuncuların oyunlarını buraya gönderir. Veriler senin Google Drive'ında durur:

- **Drive → "CarFacTycoon oyunları" klasörü:** her oyun bir `.json` dosyası. Aynı oyunun yeni gönderimi eskisinin üstüne yazılır.
- **E-Tablo → "Oyunlar" sayfası:** her oyun bir satır. Satırda oyuncu numarası, son gönderim, şirket, oyun tarihi, kasa, itibar, modeller, hatalar, oyuncunun notu ve dosyanın linki bulunur.

Oyun, oyuncu "Paylaş" demeden hiçbir şey göndermez. Adı, e-postayı, IP adresini ya da konumu toplamaz; her tarayıcıya rastgele bir oyuncu numarası verir.

## Kurulum (bir kez, ~5 dakika)

1. Yeni bir E-Tablo aç ([sheets.new](https://sheets.new)); adı "CarFacTycoon oyunları" olabilir.
2. Menüden **Uzantılar → Apps Script**.
3. Editördeki `Code.gs` içeriğini sil, bu klasördeki [`Code.gs`](Code.gs) dosyasının tamamını yapıştır ve kaydet (💾).
4. Sağ üstte **Dağıt → Yeni dağıtım**. Tür olarak ⚙ simgesinden **Web uygulaması**'nı seç ve şunları ayarla:
   - Şu kullanıcı olarak çalıştır: **Ben**
   - Erişimi olanlar: **Herkes**
5. **Dağıt**'a bas ve Google hesabınla izin ver.
   - "Google bu uygulamayı doğrulamadı" uyarısı çıkarsa: **Gelişmiş → … sayfasına git (güvenli değil) → İzin ver**. Kendi betiğin olduğu için güvenli; sadece senin Drive'ına yazar.
6. Çıkan **Web uygulaması URL'sini** kopyala (`https://script.google.com/macros/s/…/exec`).
   - Tarayıcıda açınca "CarFacTycoon collector is running." yazmalı.
7. URL'yi oyuna ver. Claude'a söylemen yeterli; ya da GitHub'da **Settings → Secrets and variables → Actions → Variables → New repository variable**: `PLAYTEST_URL`.

`Code.gs` değişirse: **Dağıt → Dağıtımları yönet → ✏️ → Sürüm: Yeni sürüm → Dağıt**. URL aynı kalır.

## Verileri okumak

E-Tablo'yu açıp bakabilirsin. Claude'a "oyuncuların oyunlarını incele" dersen Google Drive bağlantın üzerinden klasördeki dosyaları okuyup yorumlar.
