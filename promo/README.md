# CarFacTycoon tanıtım videosu (YouTube Shorts)

[Remotion](https://www.remotion.dev) ile yapılmış 58 saniyelik dikey tanıtım videosu: 1080 × 1920, 30 fps, H.264 + AAC.
Shorts, Instagram Reels ve TikTok'a doğrudan yüklenebilir.

Sahneler (`src/timeline.json`): kanca (1900 · "otomobil devi kurabilir misin?") → 1900'den 1960'a araba tasarımları →
motor → motor sesi (oyunun kendi motor sesiyle, devir saati aynı devirde) → süspansiyon denemesi → lansman ve dergi puanları → eyalet eyalet büyüyen bayi haritası → gazete manşeti →
fabrika hattı → rakibin karşı hamlesi ve yönetim kurulu → savaşlar ve krizler → Ar-Ge → yarış → unvan merdiveni →
kapanış kartı.

Oyun ekranları gerçek oyundan yakalanır; arabalar oyunun kendi `CarSVG` çizimidir. Müzik ve efektler
`audio/make_audio.py` tarafından sıfırdan sentezlenir (örnek ses yok), yani telif sorunu yoktur. Motor sesi sahnesindeki ses
oyunun motor sesi motorundan (`src/ui/audio`) çevrim dışı çalınır (`capture/shots.mjs sound` → `public/audio/engine.wav`).

## Üretmek

```bash
cd promo
npm install
pip install numpy                      # ses için

# 1) Oyun ekranlarını yakala. Uygulama derlemesi fontları kendi içinde taşır, internetsiz ortamda da doğru çıkar.
(cd .. && npx vite build --mode app && python3 -m http.server 5191 --directory dist-app) &
GAME_URL=http://localhost:5191/index.html npm run capture   # public/shots ve public/seq
# Motor sesi bölümü oyunun ses modüllerini içe aktarır: geliştirme sunucusu uygulama kipinde açık olmalı
(cd .. && npx vite --mode app --port 5193) &

# 2) Ses + video
npm run render                         # out/carfactycoon-short.mp4
```

### İngilizce video

Yazılar `src/lang.tsx` içindedir (Türkçe ve İngilizce); oyun ekranları o dilde, o dilde oynanmış kayıtlardan çekilir:

```bash
(cd .. && PROMO_SAVES=1 PROMO_LANG=en npx vitest run --config vitest.balance.config.ts scripts/promo-saves.balance.ts)
GAME_LANG=en npm run capture          # public/en/shots, public/en/seq, src/lang/map.en.json
npm run render:en                      # out/carfactycoon-short-en.mp4
```

Chromium'u Remotion kendisi indirir; indiremediği ortamda `--browser-executable=/yol/chrome-headless-shell` ekleyin
(yakalama betiği için `CHROME_PATH`). Fontlar `public/fonts` içindedir (Google Fonts, OFL); yenilemek için `npm run fonts`.

Önizleme ve düzenleme: `npm run studio` (`Short` Türkçe, `ShortEN` İngilizce). Kapanıştaki çağrı metni bir prop'tur:

```bash
npx remotion render src/index.ts Short out/short.mp4 --props='{"lang":"tr","cta":"oyun.link/carfac","audio":true}'
```

`audio: false` sessiz video verir (müziği YouTube'un kendi kitaplığından eklemek için).

## Dosyalar

- `src/Short.tsx`: sahnelerin sırası, `src/scenes.tsx`: sahneler, `src/ui.tsx`: başlık, çekim, film greni gibi parçalar,
  `src/lang.tsx`: her dilin yazıları ve ekranların yeri.
- `capture/shots.mjs`: oyunu telefon boyutunda (432 × 768 @2.5x) açıp ekranları çeker. Canvas animasyonları sanal bir
  saatle, CSS animasyonları ileri sarılarak kare kare alınır; bu yüzden 30 fps akıcı oynar.
- `capture/saves/`: yakalamada kullanılan kayıtlar. `play-*` kayıtları `scripts/promo-saves.balance.ts` ile güncel
  kurallarla oynanır (akıllı bot, Türkçe model adları): `PROMO_SAVES=1 npx vitest run --config vitest.balance.config.ts scripts/promo-saves.balance.ts`.
  `PROMO_LANG=en` (de, es, hi, ar) oyunu o dilde oynar: `play-*-en.json.gz`.
- `capture/store.mjs`, `capture/feature.mjs`: Google Play ekran görüntüleri ve öne çıkan görsel, dil başına
  (`GAME_LANG=en`, `../fastlane/metadata/android/<yerel>/images/`).
- `audio/make_audio.py`: ragtime piyano, daktilo, perde, flaş, alkış, damga, patlama, yarış arabası, yazar kasa.
