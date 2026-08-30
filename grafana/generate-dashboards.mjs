/**
 * Generates the 5 FindYourBuddy Grafana dashboards as full Grafana 10.4 JSON.
 *
 *   node grafana/generate-dashboards.mjs
 *
 * Hand-written panel JSON that omits `id`, `datasource`, `options`,
 * `fieldConfig.defaults.custom`, and `targets[].refId` does not render in
 * Grafana 10.4 (blank panels, /api/annotations 500). This builder emits every
 * required field so `docker compose restart grafana` shows working dashboards.
 * Edit here, re-run, commit the .json files.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "dashboards");
const PROM = { type: "prometheus", uid: "fyb-prometheus" };
const LOKI = { type: "loki", uid: "fyb-loki" };

let nextId = 1;
const id = () => nextId++;

const REF = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"];

function promTargets(exprs) {
  const list = Array.isArray(exprs) ? exprs : [exprs];
  return list.map((e, i) => ({
    refId: REF[i],
    datasource: PROM,
    editorMode: "code",
    expr: typeof e === "string" ? e : e.expr,
    legendFormat: typeof e === "string" ? "__auto" : e.legend ?? "__auto",
    range: true,
    instant: false,
  }));
}

function thresholds(steps) {
  return {
    mode: "absolute",
    steps: steps ?? [{ color: "green", value: null }],
  };
}

const TS_CUSTOM = {
  drawStyle: "line",
  lineInterpolation: "linear",
  lineWidth: 2,
  fillOpacity: 12,
  gradientMode: "none",
  spanNulls: false,
  showPoints: "never",
  pointSize: 5,
  stacking: { mode: "none", group: "A" },
  axisPlacement: "auto",
  axisLabel: "",
  axisColorMode: "text",
  axisBorderShow: false,
  scaleDistribution: { type: "linear" },
  axisCenteredZero: false,
  barAlignment: 0,
  hideFrom: { tooltip: false, viz: false, legend: false },
  thresholdsStyle: { mode: "off" },
  lineStyle: { fill: "solid" },
  insertNulls: false,
};

function stat({ title, gridPos, expr, unit = "short", steps, colorMode = "value", description }) {
  return {
    id: id(),
    type: "stat",
    title,
    description,
    datasource: PROM,
    gridPos,
    pluginVersion: "10.4.0",
    targets: promTargets(expr),
    options: {
      reduceOptions: { values: false, calcs: ["lastNotNull"], fields: "" },
      orientation: "auto",
      textMode: "auto",
      colorMode,
      graphMode: "area",
      justifyMode: "auto",
      showPercentChange: false,
      wideLayout: true,
    },
    fieldConfig: {
      defaults: {
        color: { mode: steps ? "thresholds" : "fixed", fixedColor: "text" },
        mappings: [],
        thresholds: thresholds(steps),
        unit,
      },
      overrides: [],
    },
  };
}

function timeseries({ title, gridPos, targets, unit = "short", stacking = "none", fillOpacity, description }) {
  const custom = { ...TS_CUSTOM, stacking: { mode: stacking, group: "A" } };
  if (fillOpacity != null) custom.fillOpacity = fillOpacity;
  return {
    id: id(),
    type: "timeseries",
    title,
    description,
    datasource: PROM,
    gridPos,
    pluginVersion: "10.4.0",
    targets: promTargets(targets),
    options: {
      legend: { displayMode: "list", placement: "bottom", showLegend: true, calcs: [] },
      tooltip: { mode: "multi", sort: "desc" },
    },
    fieldConfig: {
      defaults: {
        color: { mode: "palette-classic" },
        mappings: [],
        thresholds: thresholds(),
        unit,
        custom,
      },
      overrides: [],
    },
  };
}

function piechart({ title, gridPos, targets, unit = "short", description }) {
  return {
    id: id(),
    type: "piechart",
    title,
    description,
    datasource: PROM,
    gridPos,
    pluginVersion: "10.4.0",
    targets: promTargets(targets).map((t) => ({ ...t, instant: true, range: false })),
    options: {
      reduceOptions: { values: false, calcs: ["lastNotNull"], fields: "" },
      pieType: "pie",
      tooltip: { mode: "single", sort: "none" },
      legend: { displayMode: "list", placement: "right", showLegend: true, values: ["value", "percent"] },
      displayLabels: ["name"],
    },
    fieldConfig: {
      defaults: { color: { mode: "palette-classic" }, mappings: [], unit },
      overrides: [],
    },
  };
}

function logs({ title, gridPos, expr, description }) {
  return {
    id: id(),
    type: "logs",
    title,
    description,
    datasource: LOKI,
    gridPos,
    pluginVersion: "10.4.0",
    targets: [{ refId: "A", datasource: LOKI, editorMode: "code", expr, queryType: "range" }],
    options: {
      showTime: true,
      showLabels: false,
      showCommonLabels: false,
      wrapLogMessage: true,
      prettifyLogMessage: false,
      enableLogDetails: true,
      dedupStrategy: "none",
      sortOrder: "Descending",
    },
    fieldConfig: { defaults: {}, overrides: [] },
  };
}

function text({ title, gridPos, content }) {
  return {
    id: id(),
    type: "text",
    title,
    gridPos,
    pluginVersion: "10.4.0",
    options: { mode: "markdown", content, code: { language: "plaintext", showLineNumbers: false, showMiniMap: false } },
    fieldConfig: { defaults: {}, overrides: [] },
    transparent: false,
  };
}

function row({ title, y }) {
  return {
    id: id(),
    type: "row",
    title,
    collapsed: false,
    gridPos: { h: 1, w: 24, x: 0, y },
    panels: [],
  };
}

function dashboard({ uid, title, tags, panels, refresh = "30s", from = "now-6h" }) {
  return {
    uid,
    title,
    tags,
    editable: true,
    graphTooltip: 1,
    style: "dark",
    schemaVersion: 39,
    timezone: "browser",
    time: { from, to: "now" },
    refresh,
    liveNow: true,
    links: [],
    templating: { list: [] },
    annotations: {
      list: [
        {
          builtIn: 1,
          datasource: { type: "grafana", uid: "-- Grafana --" },
          enable: true,
          hide: true,
          iconColor: "rgba(0, 211, 255, 1)",
          name: "Annotations & Alerts",
          type: "dashboard",
        },
      ],
    },
    panels,
  };
}

// --- grid helpers -----------------------------------------------------------
const statRow = (y, specs) =>
  specs.map((s, i) => stat({ ...s, gridPos: { h: 4, w: 24 / specs.length, x: (i * 24) / specs.length, y } }));
const full = (y, h = 8) => ({ h, w: 24, x: 0, y });
const half = (y, side, h = 8) => ({ h, w: 12, x: side === "l" ? 0 : 12, y });

// ===========================================================================
// 1 — Executive KPIs
// ===========================================================================
function d1() {
  nextId = 1;
  const p = [];
  p.push(...statRow(0, [
    { title: "Anlık Çevrimiçi Kullanıcı", expr: "app_users_active", colorMode: "value", steps: [{ color: "green", value: null }] },
    { title: "Toplam Kayıtlı Kullanıcı", expr: "app_users_total" },
    { title: "Aktif Premium Üye", expr: "app_subscriptions_active_count", steps: [{ color: "purple", value: null }] },
    { title: "Mavi Tikli Profil", expr: "app_users_verified_count", steps: [{ color: "blue", value: null }] },
    { title: "Öğrenci Sayısı", expr: "app_users_students_total" },
    { title: "Aktif Eşleşme (Kanka)", expr: "app_matches_active_count", steps: [{ color: "orange", value: null }] },
  ]));
  p.push(timeseries({
    title: "Swipe Trendi (kümülatif)",
    gridPos: full(4),
    targets: [
      { expr: "app_swipes_likes_total", legend: "Beğeni" },
      { expr: "app_swipes_passes_total", legend: "Pas" },
      { expr: "app_swipes_superlikes_total", legend: "Süper Beğeni" },
    ],
  }));
  p.push(piechart({
    title: "Cinsiyet Dağılımı",
    gridPos: half(12, "l"),
    targets: [
      { expr: "app_users_gender_female_total", legend: "Kadın" },
      { expr: "app_users_gender_male_total", legend: "Erkek" },
      { expr: "app_users_gender_other_total", legend: "Diğer" },
    ],
  }));
  p.push(piechart({
    title: "Etkinlik Kaynağı",
    gridPos: half(12, "r"),
    targets: [
      { expr: "app_events_system_scraped_count", legend: "Sistem (scrape)" },
      { expr: "app_events_user_created_count", legend: "Kullanıcı" },
    ],
  }));
  p.push(timeseries({
    title: "Büyüme: kullanıcı / etkinlik / mesaj",
    gridPos: full(20),
    targets: [
      { expr: "app_users_total", legend: "Kullanıcı" },
      { expr: "app_events_total", legend: "Etkinlik" },
      { expr: "app_messages_total", legend: "Mesaj" },
    ],
  }));
  return dashboard({ uid: "fyb-1-executive-kpis", title: "1. FindYourBuddy - Yönetici KPI", tags: ["findyourbuddy", "kpi"], panels: p });
}

// ===========================================================================
// 2 — External APIs & costs
// ===========================================================================
function d2() {
  nextId = 1;
  const p = [];
  p.push(...statRow(0, [
    { title: "Giphy İstek (toplam)", expr: "external_api_giphy_requests_total" },
    { title: "Üniversite API İstek", expr: "external_api_university_requests_total" },
    { title: "Novita LLM Token", expr: "external_api_novita_llm_tokens_total" },
    { title: "Novita Vision Token", expr: "external_api_novita_vision_tokens_total" },
  ]));
  p.push(...statRow(4, [
    { title: "Iyzico Ciro (₺)", expr: "external_api_iyzico_volume_try_total", unit: "currencyTRY", steps: [{ color: "green", value: null }] },
    { title: "Iyzico İşlem Sayısı", expr: "external_api_iyzico_transactions_total" },
    { title: "Novita Tahmini Maliyet ($)", expr: "external_api_novita_total_cost_usd", unit: "currencyUSD", steps: [{ color: "green", value: null }, { color: "orange", value: 50 }, { color: "red", value: 200 }] },
    { title: "Novita Toplam Token", expr: "external_api_novita_tokens_total" },
  ]));
  p.push(timeseries({
    title: "Dış API İstek Hızı (istek/sn)",
    gridPos: full(8),
    unit: "reqps",
    targets: [
      { expr: "rate(external_api_giphy_requests_total[5m])", legend: "Giphy" },
      { expr: "rate(external_api_university_requests_total[5m])", legend: "Üniversite" },
      { expr: "rate(external_api_iyzico_transactions_total[5m])", legend: "Iyzico" },
    ],
  }));
  p.push(timeseries({
    title: "Novita AI Token Tüketim Hızı (token/sn)",
    gridPos: half(16, "l"),
    targets: [
      { expr: "rate(external_api_novita_llm_tokens_total[5m])", legend: "LLM" },
      { expr: "rate(external_api_novita_vision_tokens_total[5m])", legend: "Vision" },
    ],
  }));
  p.push(piechart({
    title: "Novita Model Ayrımı (LLM vs Vision)",
    gridPos: half(16, "r"),
    targets: [
      { expr: "external_api_novita_llm_tokens_total", legend: "LLM (DeepSeek)" },
      { expr: "external_api_novita_vision_tokens_total", legend: "Vision (Qwen)" },
    ],
  }));
  return dashboard({ uid: "fyb-2-external-apis-costs", title: "2. FindYourBuddy - Dış API & Maliyet", tags: ["findyourbuddy", "cost", "external-api"], panels: p });
}

// ===========================================================================
// 3 — System performance & database
// ===========================================================================
function d3() {
  nextId = 1;
  const p = [];
  p.push(...statRow(0, [
    { title: "Backend Sağlık", expr: "findyourbuddy_up", steps: [{ color: "red", value: null }, { color: "green", value: 1 }] },
    { title: "Supabase DB Sağlık", expr: "supabase_db_status", steps: [{ color: "red", value: null }, { color: "green", value: 1 }] },
    { title: "Supabase Aktif Bağlantı", expr: "supabase_db_active_connections", steps: [{ color: "green", value: null }, { color: "orange", value: 24 }, { color: "red", value: 30 }], colorMode: "background" },
    { title: "Scrape Başarılı mı", expr: 'up{job="backend-api"}', steps: [{ color: "red", value: null }, { color: "green", value: 1 }] },
  ]));
  p.push(timeseries({
    title: "Supabase Aktif Bağlantı (havuz = 30)",
    gridPos: half(4, "l"),
    targets: [{ expr: "supabase_db_active_connections", legend: "aktif bağlantı" }],
  }));
  p.push(timeseries({
    title: "Backend & DB Sağlık (1 = OK)",
    gridPos: half(4, "r"),
    unit: "bool",
    targets: [
      { expr: "findyourbuddy_up", legend: "backend" },
      { expr: "supabase_db_status", legend: "database" },
      { expr: 'up{job="backend-api"}', legend: "scrape" },
    ],
  }));
  p.push(timeseries({
    title: "DB'ye Yazılan Kayıtlar (kümülatif)",
    gridPos: full(12),
    targets: [
      { expr: "app_swipes_total", legend: "swipe" },
      { expr: "app_matches_active_count", legend: "aktif eşleşme" },
      { expr: "app_messages_total", legend: "mesaj" },
      { expr: "app_events_total", legend: "etkinlik" },
    ],
  }));
  p.push(text({
    title: "Neden HTTP gecikme paneli yok?",
    gridPos: full(20, 4),
    content:
      "Backend `/health/metrics` yalnızca domain sayaçları verir; per-request " +
      "`http_requests_total` / latency histogramı **yok**. Uçtan uca gecikme için " +
      "**dashboard 5 (k6)** kullanın ya da backend'e `prometheus-fastapi-instrumentator` ekleyin.",
  }));
  return dashboard({ uid: "fyb-3-system-performance", title: "3. FindYourBuddy - Sistem & Veritabanı", tags: ["findyourbuddy", "performance", "database"], panels: p, refresh: "10s" });
}

// ===========================================================================
// 4 — Safety & live logs
// ===========================================================================
function d4() {
  nextId = 1;
  const p = [];
  p.push(...statRow(0, [
    { title: "Toplam Şikayet", expr: "app_reports_total", steps: [{ color: "green", value: null }, { color: "orange", value: 5 }, { color: "red", value: 20 }] },
    { title: "Engellenen Kullanıcı", expr: "app_blocks_total", steps: [{ color: "green", value: null }, { color: "orange", value: 5 }] },
    { title: "Double Buddy İsteği", expr: "app_double_buddy_requests_total" },
    { title: "Kayıtlı Fotoğraf", expr: "app_user_photos_total" },
  ]));
  p.push(piechart({
    title: "Güvenlik: Şikayet vs Engelleme",
    gridPos: half(4, "l"),
    targets: [
      { expr: "app_reports_total", legend: "Şikayet" },
      { expr: "app_blocks_total", legend: "Engelleme" },
    ],
  }));
  p.push(timeseries({
    title: "Şikayet & Engelleme Trendi",
    gridPos: half(4, "r"),
    targets: [
      { expr: "app_reports_total", legend: "Şikayet" },
      { expr: "app_blocks_total", legend: "Engelleme" },
    ],
  }));
  p.push(logs({
    title: "Canlı Loglar — hata & uyarı (Loki)",
    gridPos: full(12, 10),
    expr: '{container=~"findyourbuddy.*"} |~ "(?i)(error|warning|exception|traceback|critical)"',
  }));
  p.push(logs({
    title: "Canlı Loglar — tümü (Loki)",
    gridPos: full(22, 9),
    expr: '{container=~"findyourbuddy.*"}',
  }));
  return dashboard({ uid: "fyb-4-live-logs-security", title: "4. FindYourBuddy - Güvenlik & Canlı Log", tags: ["findyourbuddy", "safety", "logs"], panels: p, refresh: "10s", from: "now-1h" });
}

// ===========================================================================
// 5 — Load test (k6)
// ===========================================================================
function d5() {
  nextId = 1;
  const p = [];
  const ms = (m) => `${m} * 1000`;
  p.push(...statRow(0, [
    { title: "Aktif VU", expr: "k6_vus", steps: [{ color: "blue", value: null }] },
    { title: "İstek/sn (tepe)", expr: "max_over_time((sum(rate(k6_http_reqs_total[1m])))[$__range:1m])", unit: "reqps", steps: [{ color: "green", value: null }] },
    { title: "Başarısız Oran (tepe)", expr: "max_over_time(k6_http_req_failed_rate[$__range])", unit: "percentunit", steps: [{ color: "green", value: null }, { color: "orange", value: 0.02 }, { color: "red", value: 0.05 }], colorMode: "background" },
    { title: "p95 (tepe, ms)", expr: "max_over_time(k6_http_req_duration_p95[$__range]) * 1000", unit: "ms", steps: [{ color: "green", value: null }, { color: "orange", value: 800 }, { color: "red", value: 2000 }], colorMode: "background" },
    { title: "Oluşan Eşleşme", expr: "max_over_time(sum(k6_matches_formed_total)[$__range:1m])", steps: [{ color: "purple", value: null }] },
    { title: "Oluşan Etkinlik", expr: "max_over_time(sum(k6_events_created_total)[$__range:1m])", steps: [{ color: "blue", value: null }] },
  ]));
  p.push(timeseries({
    title: "Yük Profili: VU & İstek/sn & Oturum/sn",
    gridPos: half(4, "l"),
    targets: [
      { expr: "k6_vus", legend: "VU" },
      { expr: "sum(rate(k6_http_reqs_total[$__rate_interval]))", legend: "İstek/sn" },
      { expr: "sum(rate(k6_iterations_total[$__rate_interval]))", legend: "Oturum/sn" },
    ],
  }));
  p.push(timeseries({
    title: "Genel API Gecikmesi (ms)",
    gridPos: half(4, "r"),
    unit: "ms",
    targets: [
      { expr: ms("k6_http_req_duration_avg"), legend: "ort" },
      { expr: ms("k6_http_req_duration_p95"), legend: "p95" },
      { expr: ms("k6_http_req_duration_p99"), legend: "p99" },
      { expr: ms("k6_http_req_duration_max"), legend: "max" },
    ],
  }));
  p.push(timeseries({
    title: "Adım Bazlı p95 Gecikme — hangi çağrı önce bozuluyor? (ms)",
    gridPos: full(12, 9),
    unit: "ms",
    targets: [
      { expr: ms("k6_step_events_p95"), legend: "GET /events" },
      { expr: ms("k6_step_event_detail_p95"), legend: "GET /events/{id}" },
      { expr: ms("k6_step_candidates_p95"), legend: "GET /swipes/candidates" },
      { expr: ms("k6_step_swipe_p95"), legend: "POST /swipes/" },
      { expr: ms("k6_step_matches_p95"), legend: "GET /matches/" },
      { expr: ms("k6_step_messages_read_p95"), legend: "GET messages" },
      { expr: ms("k6_step_message_send_p95"), legend: "POST message" },
      { expr: ms("k6_step_notifications_p95"), legend: "GET /notifications/" },
      { expr: ms("k6_step_event_create_p95"), legend: "POST /events/" },
      { expr: ms("k6_step_event_attend_p95"), legend: "POST attend" },
    ],
  }));
  p.push(timeseries({
    title: "İstek/sn — Durum Koduna Göre",
    gridPos: half(21, "l"),
    unit: "reqps",
    stacking: "normal",
    targets: [{ expr: "sum by (status) (rate(k6_http_reqs_total[$__rate_interval]))", legend: "{{status}}" }],
  }));
  p.push(timeseries({
    title: "Hatalar & Limitler",
    gridPos: half(21, "r"),
    targets: [
      { expr: "sum(rate(k6_http_reqs_total{status=~\"5..\"}[$__rate_interval]))", legend: "5xx /sn" },
      { expr: "max(k6_rate_limited_429_rate)", legend: "altyapı 429 oranı" },
      { expr: "sum(rate(k6_swipe_quota_reached_total[$__rate_interval]))", legend: "swipe kotası doldu /sn" },
    ],
  }));
  p.push(timeseries({
    title: "Backend: Supabase Aktif Bağlantı (yük altında, havuz = 30)",
    gridPos: half(29, "l"),
    targets: [{ expr: "supabase_db_active_connections", legend: "aktif bağlantı" }],
  }));
  p.push(timeseries({
    title: "Backend: DB'ye Yazılanlar (yük altında birikim)",
    gridPos: half(29, "r"),
    targets: [
      { expr: "app_swipes_total", legend: "swipe" },
      { expr: "app_messages_total", legend: "mesaj" },
      { expr: "app_events_total", legend: "etkinlik" },
    ],
  }));
  return dashboard({ uid: "fyb-5-load-test-k6", title: "5. FindYourBuddy - Yük Testi (k6)", tags: ["findyourbuddy", "load-test", "k6"], panels: p, refresh: "5s", from: "now-30m" });
}

// ---------------------------------------------------------------------------
const files = {
  "1_executive_kpis.json": d1(),
  "2_external_apis_and_costs.json": d2(),
  "3_system_performance_and_database.json": d3(),
  "4_live_logs_and_security.json": d4(),
  "5_load_test_k6.json": d5(),
};

for (const [name, dash] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, name), JSON.stringify(dash, null, 2) + "\n");
  console.log("wrote", name, `(${dash.panels.length} panels)`);
}
