# CarFacTycoon tanıtım videosu (YouTube Shorts)

[Remotion](https://www.remotion.dev) ile yapılmış 45 saniyelik dikey tanıtım videosu: 1080 × 1920, 30 fps, H.264 + AAC.
Shorts, Instagram Reels ve TikTok'a doğrudan yüklenebilir.

Sahneler (`src/timeline.json`): kanca (1900 · "otomobil devi kurabilir misin?") → 1900'den 1960'a araba tasarımları →
motor → süspansiyon denemesi → lansman ve dergi puanları → gazete manşeti → fabrika hattı → savaşlar ve krizler →
Ar-Ge → yarış ve satın almalar → unvan merdiveni → kapanış kartı.

Oyun ekranları gerçek oyundan yakalanır; arabalar oyunun kendi `CarSVG` çizimidir. Müzik ve efektler
`audio/make_audio.py` tarafından sıfırdan sentezlenir (örnek ses yok), yani telif sorunu yoktur.

## Üretmek

```bash
cd promo
npm install
pip install numpy                      # ses için

# 1) Oyun ekranlarını yakala (oyun http://localhost:4173'te açık olmalı)
(cd .. && npx vite build && npx vite preview --port 4173) &
npm run capture                        # public/shots ve public/seq

# 2) Ses + video
npm run render                         # out/carfactycoon-short.mp4
```

Chromium'u Remotion kendisi indirir; indiremediği ortamda `--browser-executable=/yol/chrome-headless-shell` ekleyin
(yakalama betiği için `CHROME_PATH`). Fontlar `public/fonts` içindedir (Google Fonts, OFL); yenilemek için `npm run fonts`.

Önizleme ve düzenleme: `npm run studio`. Kapanıştaki çağrı metni bir prop'tur:

```bash
npx remotion render src/index.ts Short out/short.mp4 --props='{"cta":"oyun.link/carfac","audio":true}'
```

`audio: false` sessiz video verir (müziği YouTube'un kendi kitaplığından eklemek için).

## Dosyalar

- `src/Short.tsx`: sahnelerin sırası, `src/scenes.tsx`: sahneler, `src/ui.tsx`: başlık, çekim, film greni gibi parçalar.
- `capture/shots.mjs`: oyunu telefon boyutunda (432 × 768 @2.5x) açıp ekranları çeker. Canvas animasyonları sanal bir
  saatle, CSS animasyonları ileri sarılarak kare kare alınır; bu yüzden 30 fps akıcı oynar.
- `capture/saves/`: yakalamada kullanılan kayıtlar (akıllı bot oyunu, model adları elle verildi).
- `audio/make_audio.py`: ragtime piyano, daktilo, perde, flaş, alkış, damga, patlama, yarış arabası, yazar kasa.
