#!/usr/bin/env bash

# ==============================================================================
# 🚀 FindYourBuddy - Sunucu Kurulum & Monitoring Başlatma Scripti (deploy.sh)
# ==============================================================================

set -e

# Renkli Çıktılar İçin
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}   🚀 FindYourBuddy - Production Monitoring Stack Initializing...    ${NC}"
echo -e "${BLUE}======================================================================${NC}"

# 1. Gerekli araçların kontrolü (Docker & Docker Compose)
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ HATA: Docker sunucuda kurulu değil. Lütfen önce Docker yükleyin.${NC}"
    exit 1
fi

if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ HATA: Docker Compose sunucuda kurulu değil.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker ve Docker Compose kontrolleri başarılı.${NC}"

# 2. Python bağımlılıkları kontrolü ve yüklenmesi (varsa)
if [ -f "requirements.txt" ]; then
    echo -e "${YELLOW}📦 Python bağımlılıkları kontrol ediliyor...${NC}"
    if command -v pip &> /dev/null; then
        pip install -r requirements.txt --quiet
        echo -e "${GREEN}✅ Python bağımlılıkları yüklendi.${NC}"
    else
        echo -e "${YELLOW}⚠️ Uyarı: pip bulunamadı, varsayılan Python ortamı atlandı.${NC}"
    fi
fi

# 3. İsteğe Bağlı Kafka Seçeneği Kontrolü (--kafka parametresi)
COMPOSE_FILE="docker-compose.yml"
if [[ "$1" == "--kafka" ]]; then
    COMPOSE_FILE="docker-compose.kafka.yml"
    echo -e "${YELLOW}🟣 Kurumsal Apache Kafka tamponlu mimari seçildi (${COMPOSE_FILE})...${NC}"
else
    echo -e "${GREEN}🟢 Varsayılan yüksek performanslı Promtail -> Loki mimarisi seçildi (${COMPOSE_FILE})...${NC}"
fi

# 4. Servisleri Başlatma
echo -e "${BLUE}🐳 Docker konteynerleri başlatılıyor...${NC}"
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

echo -e "${YELLOW}⏳ Servislerin ayağa kalkması bekleniyor (10 saniye)...${NC}"
sleep 10

# 5. Sağlık Kontrolleri (Health Checks)
echo -e "${BLUE}🔍 Konteyner ve API Sağlık Kontrolleri Yapılıyor...${NC}"

# Prometheus Kontrolü
if curl -s http://localhost:9090/-/healthy | grep -q "Healthy"; then
    echo -e "${GREEN}  [✓] Prometheus (Port 9090): SAĞLIKLI${NC}"
else
    echo -e "${RED}  [✗] Prometheus (Port 9090): BAŞARISIZ${NC}"
fi

# Grafana Kontrolü
if curl -s http://localhost:3000/api/health | grep -q "ok"; then
    echo -e "${GREEN}  [✓] Grafana (Port 3000): SAĞLIKLI${NC}"
else
    echo -e "${RED}  [✗] Grafana (Port 3000): BAŞARISIZ${NC}"
fi

# Loki Kontrolü
if curl -s http://localhost:3100/ready | grep -q "ready"; then
    echo -e "${GREEN}  [✓] Grafana Loki (Port 3100): SAĞLIKLI${NC}"
else
    echo -e "${YELLOW}  [!] Loki (Port 3100): Başlatılıyor...${NC}"
fi

echo -e "${BLUE}======================================================================${NC}"
echo -e "${GREEN}🎉 TEBRİKLER! FindYourBuddy Monitoring Stack başarıyla ayağa kaldırıldı!${NC}"
echo -e "${GREEN}📊 Grafana Canlı Panosu: http://localhost:3000 (admin / admin_password_change_me)${NC}"
echo -e "${GREEN}🔥 Prometheus Portu:     http://localhost:9090${NC}"
echo -e "${BLUE}======================================================================${NC}"
