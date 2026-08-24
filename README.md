# 🚀 FindYourBuddy - Production Monitoring & Observability Stack

Bu repository, **FindYourBuddy** mobil uygulaması ve backend servislerinin bulut (Cloud) ortamındaki performansını, canlı aktif kullanıcı sayısını, sistem sağlık metriklerini, hata oranlarını ve **aylık bulut maliyet tahminlerini** anlık izlemek için hazırlanmış profesyonel izleme (monitoring) altyapısıdır.

---

## 🛠️ İzleme Altyapısı Teknolojileri

- **Prometheus** (`v2.51.0`): Metrik toplama ve alarm kuralları motoru (Port `9090`).
- **Grafana** (`v10.4.0`): Canlı görsel panolar, grafikler ve maliyet tahmin göstergeleri (Port `3000`).
- **Loki** (`v2.9.5`): Merkezi log toplama ve hata analiz sistemi (Port `3100`).
- **Promtail**: Docker konteyner loglarını Loki'ye aktaran dinamik log ajanı.
- **PostgreSQL / Supabase Sağlık Metrikleri**: Veritabanı bağlantı havuzu kullanımı, sorgu gecikmeleri.

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
