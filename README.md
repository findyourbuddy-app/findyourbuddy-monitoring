# 🚀 FindYourBuddy - Production Monitoring & Observability Stack

Bu repository, **FindYourBuddy** mobil uygulaması ve backend servislerinin bulut (Cloud) ortamındaki performansını, canlı aktif kullanıcı sayısını, sistem sağlık metriklerini, hata oranlarını ve **aylık bulut maliyet tahminlerini** anlık izlemek için hazırlanmış profesyonel izleme (monitoring) altyapısıdır.

---

## 🛠️ İzleme Altyapısı Teknolojileri

- **Prometheus** (`v2.51.0`): Metrik toplama ve alarm kuralları motoru (Port `9090`).
- **Alertmanager** (`v0.27.0`): Alarmları Slack'e yönlendirir (Port `9093`).
- **Grafana** (`v10.4.0`): Canlı görsel panolar, grafikler ve maliyet tahmin göstergeleri (Port `3000`).
- **Loki** (`v2.9.5`): Merkezi log toplama ve hata analiz sistemi (Port `3100`).
- **Promtail**: Docker konteyner loglarını Loki'ye aktaran dinamik log ajanı.
- **PostgreSQL / Supabase Sağlık Metrikleri**: Veritabanı bağlantı havuzu kullanımı, sorgu gecikmeleri.

## 🔐 Backend metriklerini scrape etme

`GET /health/metrics` staff-only olduğu için Prometheus, backend'in `.env`'indeki
`METRICS_API_KEY` ile kimlik doğrular. Aynı değer
`prometheus/metrics_token` dosyasında durur (repo'da dev varsayılanıyla gelir,
prod'da değiştirin). Bu olmadan `backend-api` hedefi `401` ile DOWN görünür ve
1-4 numaralı panolar boş kalır.

## 📊 Panolar

5 pano `grafana/dashboards/*.json` — `grafana/generate-dashboards.mjs` ile üretilir
(tam Grafana 10.4 panel JSON'u; eksik `id`/`datasource`/`options` alanları 10.4'te
boş panel olarak render oluyordu). Değişiklik için `.mjs`'i düzenleyip
`node grafana/generate-dashboards.mjs` çalıştırın, çıktı JSON'larını commit'leyin.
Datasource'lar sabit uid ile provision edilir: `fyb-prometheus`, `fyb-loki`.

## 🚨 Alarmlar

Kural dosyası `prometheus/alerts.yml` — yalnızca gerçekten var olan metrikleri
kullanır (`findyourbuddy_up`, `supabase_db_status`,
`supabase_db_active_connections`, `up{job="backend-api"}`). Alertmanager bunları
Slack'e yollar: webhook URL'inizi `alertmanager/slack_webhook_url` dosyasına
yazın (`.example`'dan kopyalayın). `severity=critical` ayrı kanala + 1 saatte bir
tekrar gider. Bir değişiklikten sonra alarm yolunun gerçekten çalıştığını test
alarmı göndererek doğrulayın (`amtool` veya Alertmanager UI `:9093`).

---

## 📊 Neler İzleniyor? (Monitörlenen Metrikler)

### 1. 👥 Kullanıcı & Demografik Metrikler
- **Anlık Çevrimiçi Kullanıcı Sayısı** (Active Online Users)
- **Kadın vs Erkek Kullanıcı Oranı (Pie Chart)**
- **Mavi Tikli Doğrulanmış Profil & Aktif Premium Üye Oranı**
- **Üniversite Eğitimi Alan Öğrenci Sayısı**

### 2. ⚡ Dış API & Performans Metrikleri
- **Giphy API**: GIF arama sayısı, medya istek hacmi ve yanıt süreleri.
- **Üniversiteler API**: Profil düzenleme üniversite arama hızı.
- **Novita AI Yapay Zekâ**: **Novita LLM (DeepSeek)** ve **Novita Vision (Qwen Selfie Doğrulama)** model token tüketimleri ve dolar bütçesi ($).
- **Iyzico Ödeme**: Toplam Premium & Boost satış cirosu (TL ₺).

### 3. 🔥 Yük Testi (k6)
- `load-test/scenario.js` gerçek bir mobil oturumu taklit ederek backend'i
  eşzamanlı kullanıcı altında zorlar (Discover → swipe → mesaj → bildirim).
- `./load-test/run.sh --grafana` sonuçları Prometheus'a akıtır; **"5. Yük Testi
  (k6)"** panosunda canlı p95/p99, RPS, 429/5xx oranı ve DB havuzu izlenir.
- Ayrıntı: [`load-test/README.md`](load-test/README.md).

---

## 🚀 Sunucuda Kurulum ve Başlatma (Single Command Deployment)

Sunucunuzda tek bir Bash komutu ile tüm izleme altyapısını başlatabilirsiniz:

```bash
bash start.sh
```

*(Eğer Apache Kafka tamponlu kurumsal mimariyi kullanmak isterseniz: `bash start.sh --kafka`)*

### 📍 Erişilebilir Servisler

- **Grafana Canlı Panoları**: `http://localhost:3000`
  - **Kullanıcı Adı**: `admin`
  - **Şifre**: `admin_password_change_me`
- **Prometheus Metrik Paneli**: `http://localhost:9090`
- **Backend Canlı Metrik Akışı**: `http://localhost:8000/health/metrics`
