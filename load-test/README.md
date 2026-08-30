# Yük & Stres Testi (k6)

`scenario.js`, her sanal kullanıcıya (VU) her iterasyonda ağırlıklı-rastgele bir
**persona** oynatır; trafik karışımı gerçek uygulamaya benzer:

| Persona | % | Yaptığı |
|---|---|---|
| lurker | 35 | etkinlik listesi + detay + katılımcılar, bildirimler, bookmark |
| swiper | 30 | kota, adaylar, 3-8 swipe, gelen beğeniler, eşleşmeler |
| chatter | 20 | eşleşmeler, thread aç, mesaj gönder, okundu işaretle |
| socialite | 10 | etkinliğe katıl, katılımcıları + birkaç profili gör |
| creator | 5 | oluşturma kotası, etkinlik oluştur, profil düzenle |

~20 endpoint kapsanır. Amaç: **"kaç eşzamanlı kullanıcıda ne bozuluyor"** ve
**tıkanma/kırılma noktası** sorularını somut sayılarla yanıtlamak.

## Senaryo modları (`SCENARIO=`)

| Mod | Model | Süre | Ne öğrenir |
|---|---|---|---|
| `smoke` | 5 VU sabit | 40 sn | Script + hedef ayakta mı (CI) |
| `load` *(varsayılan)* | kapalı, VU rampası 0→`VUS` | ~15 dk | Gerçekçi trafikte p95/hata |
| `stress` | açık, istek hızı 0→`RATE` | ~14 dk | Kapasiteyi aşarken latency ne zaman patlıyor |
| `spike` | açık, 10 sn'de düşük→`RATE` | ~4 dk | Ani trafik dalgası |
| `breakpoint` | açık, doğrusal 0→`RATE` | 20 dk | Eşik aşılınca **otomatik durur** — tam sayısal limit |
| `soak` | `VUS` sabit | `SOAK_DURATION` (1h) | Bellek/bağlantı sızıntısı |

## Çalıştırma

k6 kuruluysa doğrudan; değilse script `grafana/k6` Docker imajına düşer.

```bash
./run.sh                                             # load, VUS=200, localhost:8001
BASE_URL=https://api.findyourbuddy.app ./run.sh
SCENARIO=smoke ./run.sh
SCENARIO=stress RATE=600 VUS=400 ./run.sh
SCENARIO=breakpoint RATE=1000 ./run.sh
```

```powershell
$env:SCENARIO="stress"; $env:RATE="600"; .\run.ps1
```

### Ayarlar (`-e KEY=VALUE`)

| Anahtar | Varsayılan | Açıklama |
|---|---|---|
| `BASE_URL` | `http://localhost:8001` | Hedef backend kökü |
| `SCENARIO` | `load` | Yukarıdaki modlar |
| `VUS` | `200` | Kapalı model tepe VU / açık model `maxVUs` |
| `RATE` | `400` | Açık model tepe istek/sn |
| `USERS` | `max(VUS, 50)` (smoke: 10) | Önceden oluşturulan test kullanıcı havuzu |
| `P95_MS` / `P99_MS` | `800` / `2000` | Gecikme eşikleri (ms) |
| `FAIL_RATE` | `0.02` | `http_req_failed` üst sınırı |
| `SOAK_DURATION` | `1h` | Yalnız `soak` |

> Varsayılan eşikler DB'sine yakın duran prod benzeri bir dağıtımı varsayar.
> Laptop'tan uzak Supabase'e vururken her istekte ~50-150 ms RTT eklenir;
> `-e P95_MS=3000 -e FAIL_RATE=0.1` ile gevşetin. `breakpoint` modunda eşik
> aşılınca koşu iptal olur (`abortOnFail`).

Swipe/etkinlik yazma yolunu uzun süre yüklemek için hedef backend'de kotaları
yükseltin: `DAILY_SWIPE_LIMIT=100000 DAILY_SUPER_LIKE_LIMIT=100000
WEEKLY_EVENT_CREATION_LIMIT=100000`. Aksi halde kota dolunca istekler ucuz 429'a
döner (`swipe_quota_reached` sayacı — hata sayılmaz).

## Ne ölçülüyor

| Metrik | Anlamı |
|---|---|
| `http_req_duration` p95/p99 | Uçtan uca gecikme |
| `step_*` (events, candidates, swipe, matches, messages_read, message_send, notifications, event_detail, event_create, event_attend, ...) | Adım bazlı gecikme — hangi çağrı önce çöküyor |
| `http_req_failed` | Beklenmeyen yanıt oranı (2xx / 409 / 429 dışı) |
| `rate_limited_429` | Yalnızca **altyapı** rate limit'i (`slowapi`) — asıl ölçek sinyali |
| `swipe_quota_reached` | Günlük kota 429'u — beklenen, hata değil |
| `business_errors` | Yalnızca 5xx oranı |
| `matches_formed` / `events_created` | Test sırasında oluşan kayıtlar |

## Grafana'ya canlı akış (dashboard 5)

```bash
bash ../start.sh                            # stack ayakta olmalı
SCENARIO=stress RATE=300 ./run.sh --grafana # veya:  .\run.ps1 -Grafana
```

Prometheus'un `--web.enable-remote-write-receiver` flag'i (compose'da ayarlı)
ile k6 örnekleri `k6_` önekiyle gelir. Trend metrikleri
`K6_PROMETHEUS_RW_TREND_STATS` ile `_p95` / `_p99` / `_avg` / `_max` / `_med`
gauge serileri olarak yazılır (`k6_http_req_duration_p95`,
`k6_step_candidates_p95`, ...). Değerler **saniye** cinsindendir.

## Önemli notlar

- **X-Forwarded-For:** Her VU benzersiz bir `X-Forwarded-For` gönderir → her VU
  kendi rate-limit kovasına düşer (LB arkası ayrı istemci gibi). Prod'da bu
  header'a yalnızca güvenilen proxy arkasında güvenilmeli.
- **Test verisi kalıcıdır.** `setup()` gerçek kullanıcı kaydeder
  (`loadtest+<stamp>_<n>@findyourbuddy.test`), swipe/mesaj/etkinlik üretir.
  **Staging DB'de** koşun; prod'da çalıştırmayın.
- **Gözlem:** koşu sırasında Grafana'da `supabase_db_active_connections`
  (havuz 30), 5xx oranı, adım bazlı p95.
- **Bilinen tavanlar** (bkz. `../../findyourbuddy-backend/docs/production-runbook.md`
  §5): tek uvicorn process, senkron endpoint'ler ~40 thread havuzunda,
  DB `statement_timeout` yok. `stress`/`breakpoint` bu tavanı kolayca gösterir —
  yük düşse bile kendine gelmeyen bir çöküş görürseniz sebep budur.
