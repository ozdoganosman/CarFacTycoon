# Oyuncu hunisi: ilk arabaya kadar

Yeni bir oyuncunun nerede takıldığını iki yerden ölçeriz. İkisi de yalnızca oyuncu "Paylaş" dediyse
veri alır (README, "Herkese açık link ve oyuncu verisi").

## Basamaklar

| Basamak | PostHog olayı | Ne zaman |
|---|---|---|
| Oyun başladı | `game_started` | yeni oyunun ilk haftası |
| İlk proje | `first_project` | şirketin ilk projesi açıldı |
| İlk geliştirme | `first_development` | ilk projenin geliştirmesi başladı |
| İlk test | `first_test` | ilk proje teste geçti |
| İlk lansman | `first_launch` | ilk araba piyasaya çıktı |
| 1910'a ulaştı | `year_end` (`year` = 1909) | oyunun on birinci yıl sonu |

`first_*` olayları oyun başına bir kez gönderilir (`src/ui/analytics.ts`). Arada atlanan bir basamak
(ör. oyun kapalıyken geçilen geliştirme) sonraki gözlemde yine gönderilir; daha ileri bir basamakta
yüklenen eski bir kayıt geçtiği basamakları yeniden göndermez.

## PostHog

**Product analytics → New insight → Funnel**, adımlar yukarıdaki sırayla: `game_started`,
`first_project`, `first_development`, `first_test`, `first_launch`, sonra `year_end` (filtre:
`year` = 1909). "Conversion window" en az 7 gün olsun: oyuncular birkaç oturumda oynar. Aynı ekranda
**Breakdown** olarak `difficulty` ve `hq` hangi başlangıcın zorlandığını gösterir.

## Supabase (`playtests` tablosu)

Her paylaşılan oyunun son durumu `summary` sütunundadır (`src/ui/claudeLink.ts`, `summary()`):

```sql
select
  count(*)                                                             as oyun,
  count(*) filter (where jsonb_array_length(summary->'projects') > 0
                      or jsonb_array_length(summary->'models') > 0)    as ilk_proje,
  count(*) filter (where jsonb_array_length(summary->'models') > 0)    as ilk_lansman,
  count(*) filter (where (summary->>'week')::int >= 520)               as yil_1910,
  count(*) filter (where summary->'gameOver'->>'reason' = 'bankrupt')  as iflas,
  count(*) filter (where summary::text like '%structuredClone%')       as eski_tarayici_hatasi
from public.playtests
where received_at >= '2026-10-09';  -- bu sürümden sonrası
```

## İlk arabadan sonra: on yıllar ve hedefler

Her on yıl bir bölümdür ve üç hedefi vardır (`src/core/goals.ts`); Merkez puanı ve unvanı canlı
gösterir. İlk arabadan sonrasını üç olay ölçer:

| Ne | PostHog olayı | Ne zaman |
|---|---|---|
| Yıl sonu | `year_end` (`score`, `tier`, `goals_met` ile) | her yılın sonunda |
| Hedef | `goal_met` (`goal`, `decade`) | bir on yıl hedefi tuttuğunda |
| Kendiliğinden ilerleyen proje | `decision` (`kind` = `auto`) | oyuncu seçimi açıp kapattığında |

**Funnel** devamı: `first_launch` → `year_end` (`year` = 1909) → `year_end` (`year` = 1919) → … →
`game_over` (`reason` = `end`). Hangi bölümde bırakıldığını ve o ana kadar kaç hedef tuttuğunu
`year_end`'in `goals_met`'i, bölümlerin zorluğunu `goal_met`'in `goal` dağılımı gösterir. Botla
oynanan bir kampanya on sekiz hedefin aşağı yukarı üçte ikisini tutturur (yarışmaz, rakip satın
almaz, 1934'ten önce hiçbir sınıfın lideri olmaz): gerçek oyuncuların bundan çok aşağıda kaldığı bir
hedef ya çok zor ya da ekranda yeterince görünmüyor demektir.

## Durum: 11 Ekim 2026

7 kayıt, 6 oyuncu (30 Eylül - 10 Ekim): hâlâ **hiçbirinde piyasaya çıkmış araba yok**. Eski
tarayıcı düzeltmesi, rehberli ilk araba ve kademeli menü Pages'e 11 Ekim 02:41'de (UTC) çıktı; o
saatten sonra gelmiş kayıt yok. Sıradaki adım: oyunu 10-20 kişiye oynatmak ve yukarıdaki sorguyu
`received_at >= '2026-10-11 03:00'` ile çalıştırmak.

## Başlangıç noktası (bu değişiklikten önce)

5 oyuncudan paylaşılan 6 oyun (30 Eylül - 5 Ekim 2026): **hiçbirinde proje ya da piyasaya çıkmış
araba yok**; en uzun oyun Nisan 1903'te iflasla bitti. 6 oyunun 5'inde
`render:projects: structuredClone is not defined` hatası var: "Yeni proje" penceresi, bu işlevi
olmayan tarayıcılarda (Chrome 98, Safari 15.4 öncesi, eski Android WebView) çöküyordu. Hata bu sürümde
giderildi (`tests/oldBrowsers.test.ts`). İlk ölçüm: yeni oyunların ne kadarı `first_launch`'a ulaşıyor.
