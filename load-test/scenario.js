/**
 * FindYourBuddy backend load & stress test (k6).
 *
 * One virtual user runs a weighted-random persona each iteration, so the mix of
 * traffic looks like a real app: mostly people browsing, some swiping, some
 * chatting, a few attending or creating events.
 *
 *   lurker    35%  events list + detail + attendees, notifications, bookmark
 *   swiper    30%  quota, candidates, 3-8 swipes, likes-received, matches
 *   chatter   20%  matches, read a thread, send a message, mark read
 *   socialite 10%  attend an event, view attendees + a couple of profiles
 *   creator    5%  creation quota, create an event, edit own profile
 *
 * Every VU sends a UNIQUE X-Forwarded-For header. The backend's
 * get_real_client_ip() trusts that first, so each VU lands in its own
 * rate-limit bucket -- like distinct clients behind a load balancer. Without it
 * the shared "100/minute" limit would 429 the whole run.
 *
 *   SCENARIO=load   k6 run -e BASE_URL=https://api.example.com scenario.js   (default)
 *   SCENARIO=stress  -e RATE=600 ...        open model, climb past capacity
 *   SCENARIO=spike   -e RATE=800 ...        sudden burst
 *   SCENARIO=breakpoint -e RATE=1000 ...    linear climb, aborts when it breaks
 *   SCENARIO=soak    -e SOAK_DURATION=2h ...
 *   SCENARIO=smoke   ...                    30s sanity pass
 *
 * See README.md for every knob and how to read the result.
 */

import http from "k6/http";
import { group, sleep, fail } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// ---------------------------------------------------------------------------
// config (all overridable with -e KEY=VALUE)
// ---------------------------------------------------------------------------
const BASE_URL = (__ENV.BASE_URL || "http://localhost:8001").replace(/\/$/, "");
const SCENARIO = __ENV.SCENARIO || "load";
const VUS = int(__ENV.VUS || __ENV.PEAK_VUS, 200); // closed-model peak / open-model maxVUs
const RATE = int(__ENV.RATE || __ENV.STRESS_RATE, 400); // open-model peak requests/s
const USERS = int(__ENV.USERS, SCENARIO === "smoke" ? 10 : Math.max(VUS, 50)); // pool size
const PASSWORD = __ENV.PASSWORD || "LoadTest123";
const RUN_ID = __ENV.RUN_ID || "";
// Pass/fail limits -- defaults assume a prod-like deploy close to its DB.
// Laptop -> remote Supabase adds ~50-150ms RTT per call: -e P95_MS=2500 -e FAIL_RATE=0.05
const P95_MS = int(__ENV.P95_MS, 800);
const P99_MS = int(__ENV.P99_MS, 2000);
const FAIL_RATE = float(__ENV.FAIL_RATE, 0.02);
// Kadikoy-ish center; users scatter a few km around it so the distance filter
// and the recommendation scorer do real work.
const CENTER = { lat: 40.99, lng: 29.03 };
const INTERESTS = ["coffee", "running", "concert", "boardgames", "hiking", "art", "yoga", "party"];
const CATEGORIES = ["sports", "music", "social", "outdoor", "arts", "food"];

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}
function float(value, fallback) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? fallback : n;
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pctVus(f) {
  return Math.max(1, Math.ceil(VUS * f));
}

// ---------------------------------------------------------------------------
// metrics -- one Trend per logical call so the dashboard shows what degrades first
// ---------------------------------------------------------------------------
const T = {
  events: new Trend("step_events", true),
  event_detail: new Trend("step_event_detail", true),
  attendees: new Trend("step_attendees", true),
  candidates: new Trend("step_candidates", true),
  quota: new Trend("step_quota", true),
  swipe: new Trend("step_swipe", true),
  likes_received: new Trend("step_likes_received", true),
  matches: new Trend("step_matches", true),
  messages_read: new Trend("step_messages_read", true),
  message_send: new Trend("step_message_send", true),
  notifications: new Trend("step_notifications", true),
  profile_view: new Trend("step_profile_view", true),
  profile_edit: new Trend("step_profile_edit", true),
  event_create: new Trend("step_event_create", true),
  event_attend: new Trend("step_event_attend", true),
  bookmark: new Trend("step_bookmark", true),
};
const rateBusinessError = new Rate("business_errors"); // 5xx only
const rateRateLimited = new Rate("rate_limited_429"); // infra throttling only
const cQuotaReached = new Counter("swipe_quota_reached"); // daily-limit 429, expected
const cMatchesFormed = new Counter("matches_formed");
const cEventsCreated = new Counter("events_created");

// ---------------------------------------------------------------------------
// options / scenarios
// ---------------------------------------------------------------------------
const abortOnFail = SCENARIO === "breakpoint";

function scenarios() {
  const base = { exec: "session", gracefulStop: "30s" };
  const preAllocatedVUs = Math.max(20, Math.ceil(VUS * 0.5));
  switch (SCENARIO) {
    case "smoke":
      return { smoke: { ...base, executor: "constant-vus", vus: 5, duration: "40s" } };
    case "soak":
      return {
        soak: { ...base, executor: "constant-vus", vus: VUS, duration: __ENV.SOAK_DURATION || "1h" },
      };
    case "spike":
      return {
        spike: {
          ...base,
          executor: "ramping-arrival-rate",
          startRate: 10,
          timeUnit: "1s",
          preAllocatedVUs,
          maxVUs: VUS,
          stages: [
            { duration: "1m", target: 20 },
            { duration: "10s", target: RATE }, // sudden burst
            { duration: "1m", target: RATE },
            { duration: "10s", target: 20 },
            { duration: "1m", target: 20 },
          ],
        },
      };
    case "breakpoint":
      return {
        breakpoint: {
          ...base,
          executor: "ramping-arrival-rate",
          startRate: 10,
          timeUnit: "1s",
          preAllocatedVUs,
          maxVUs: VUS,
          stages: [{ duration: __ENV.BREAKPOINT_DURATION || "20m", target: RATE }], // linear climb
        },
      };
    case "stress":
      return {
        stress: {
          ...base,
          executor: "ramping-arrival-rate",
          startRate: 10,
          timeUnit: "1s",
          preAllocatedVUs,
          maxVUs: VUS,
          stages: [
            { duration: "2m", target: Math.ceil(RATE * 0.25) },
            { duration: "3m", target: Math.ceil(RATE * 0.5) },
            { duration: "3m", target: Math.ceil(RATE * 0.75) },
            { duration: "3m", target: RATE },
            { duration: "2m", target: RATE },
            { duration: "1m", target: 0 },
          ],
        },
      };
    default: // "load" -- realistic closed-model ramp
      return {
        load: {
          ...base,
          executor: "ramping-vus",
          startVUs: 0,
          stages: [
            { duration: "2m", target: pctVus(0.3) },
            { duration: "3m", target: pctVus(0.6) },
            { duration: "3m", target: VUS },
            { duration: "5m", target: VUS },
            { duration: "2m", target: 0 },
          ],
        },
      };
  }
}

export const options = {
  scenarios: scenarios(),
  setupTimeout: "20m",
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
  thresholds: {
    http_req_failed: [{ threshold: `rate<${FAIL_RATE}`, abortOnFail }],
    rate_limited_429: [{ threshold: "rate<0.02", abortOnFail }],
    business_errors: [{ threshold: "rate<0.01", abortOnFail }],
    http_req_duration: [
      { threshold: `p(95)<${P95_MS}`, abortOnFail },
      { threshold: `p(99)<${P99_MS}`, abortOnFail },
    ],
    step_candidates: [`p(95)<${Math.round(P95_MS * 1.5)}`],
    step_events: [`p(95)<${P95_MS}`],
    step_matches: [`p(95)<${P95_MS}`],
  },
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function ipFor(n) {
  const a = (1 + Math.floor(n / 65536)) % 254;
  const b = Math.floor(n / 256) % 256;
  const c = n % 256;
  return `10.${a}.${b}.${c}`;
}
function jitterCoords() {
  return {
    latitude: CENTER.lat + (Math.random() - 0.5) * 0.07,
    longitude: CENTER.lng + (Math.random() - 0.5) * 0.09,
  };
}
function birthDateFor(i) {
  const year = 1991 + (i % 15);
  const month = (i % 12) + 1;
  const day = (i % 27) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function headers(token, xff) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Forwarded-For": xff };
}

// 2xx, 409 (duplicate swipe) and 429 are handled explicitly; only genuinely
// unexpected codes should inflate http_req_failed.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409, 429));

// record latency + classify the response for the custom metrics
function record(res, trend) {
  if (trend) trend.add(res.timings.duration);
  rateBusinessError.add(res.status >= 500 ? 1 : 0);
  if (res.status !== 429) {
    rateRateLimited.add(false);
    return res;
  }
  // slowapi throttle -> {"error":"Rate limit exceeded: ..."}
  // daily swipe/super-like cap -> {"detail":"Daily ... limit reached"}
  const infra = String(res.body || "").includes("Rate limit exceeded");
  rateRateLimited.add(infra);
  if (!infra) cQuotaReached.add(1);
  return res;
}
function ok(res) {
  return res.status >= 200 && res.status < 300;
}
function jsonArray(res) {
  if (!ok(res)) return [];
  try {
    const b = res.json();
    return Array.isArray(b) ? b : [];
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// setup: register + profile the pool in parallel batches, hand tokens to the VUs
// ---------------------------------------------------------------------------
const CHUNK = 25;

export function setup() {
  const stamp = `${Date.now().toString(36)}${RUN_ID}`;
  const pool = [];
  let lastError = "none";
  console.log(`Provisioning ${USERS} test users against ${BASE_URL} (scenario: ${SCENARIO}) ...`);

  for (let start = 0; start < USERS; start += CHUNK) {
    const end = Math.min(start + CHUNK, USERS);
    const idx = [];
    for (let i = start; i < end; i++) idx.push(i);

    const regReqs = idx.map((i) => [
      "POST",
      `${BASE_URL}/auth/register`,
      JSON.stringify({
        email: `loadtest+${stamp}_${i}@findyourbuddy.test`,
        password: PASSWORD,
        display_name: `LoadTest ${i}`,
        accepted_terms: true,
      }),
      { headers: { "Content-Type": "application/json", "X-Forwarded-For": ipFor(i) } },
    ]);
    const regRes = http.batch(regReqs);

    const loginReqs = [];
    const loginIdx = [];
    regRes.forEach((r, k) => {
      if (r.status !== 201) {
        lastError = `register ${r.status}: ${String(r.body).slice(0, 120)}`;
        return;
      }
      const i = idx[k];
      loginIdx.push(i);
      loginReqs.push([
        "POST",
        `${BASE_URL}/auth/login`,
        JSON.stringify({ email: `loadtest+${stamp}_${i}@findyourbuddy.test`, password: PASSWORD }),
        { headers: { "Content-Type": "application/json", "X-Forwarded-For": ipFor(i) } },
      ]);
    });
    const loginRes = http.batch(loginReqs);

    const patchReqs = [];
    loginRes.forEach((r, k) => {
      if (r.status !== 200) {
        lastError = `login ${r.status}: ${String(r.body).slice(0, 120)}`;
        return;
      }
      const i = loginIdx[k];
      const token = r.json("access_token");
      pool.push({ token, xff: ipFor(i) });
      patchReqs.push([
        "PATCH",
        `${BASE_URL}/users/me`,
        JSON.stringify({
          ...jitterCoords(),
          date_of_birth: birthDateFor(i),
          gender: i % 2 === 0 ? "female" : "male",
          looking_for: "Aktivite arkadasi",
          interests: [INTERESTS[i % INTERESTS.length], INTERESTS[(i + 3) % INTERESTS.length]],
        }),
        { headers: headers(token, ipFor(i)) },
      ]);
    });
    http.batch(patchReqs);

    console.log(`  ...${pool.length}/${USERS} ready`);
  }

  if (pool.length === 0) fail(`could not provision any test users -- last error: ${lastError}`);
  console.log(`Provisioned ${pool.length}/${USERS} users.`);
  return { pool };
}

// ---------------------------------------------------------------------------
// personas
// ---------------------------------------------------------------------------
function lurker(H) {
  const events = jsonArray(record(http.get(`${BASE_URL}/events/?upcoming_only=true&limit=20`, { headers: H, tags: { step: "events" } }), T.events));
  think();
  for (const ev of pickSome(events, 1, 3)) {
    record(http.get(`${BASE_URL}/events/${ev.id}`, { headers: H, tags: { step: "event_detail" } }), T.event_detail);
    record(http.get(`${BASE_URL}/events/${ev.id}/attendees`, { headers: H, tags: { step: "attendees" } }), T.attendees);
    think();
  }
  record(http.get(`${BASE_URL}/notifications/`, { headers: H, tags: { step: "notifications" } }), T.notifications);
  if (events.length && Math.random() < 0.3) {
    const ev = pick(events);
    const added = record(http.post(`${BASE_URL}/bookmarks/${ev.id}`, null, { headers: H, tags: { step: "bookmark" } }), T.bookmark);
    record(http.get(`${BASE_URL}/bookmarks/`, { headers: H, tags: { step: "bookmark" } }), T.bookmark);
    if (added.status === 201) record(http.del(`${BASE_URL}/bookmarks/${ev.id}`, null, { headers: H, tags: { step: "bookmark" } }), T.bookmark);
  }
}

function swiper(H) {
  record(http.get(`${BASE_URL}/swipes/quota`, { headers: H, tags: { step: "quota" } }), T.quota);
  const cands = jsonArray(record(http.get(`${BASE_URL}/swipes/candidates`, { headers: H, tags: { step: "candidates" } }), T.candidates))
    .map((u) => u.id)
    .slice(0, 10);
  const n = Math.min(cands.length, randInt(3, 8));
  for (let i = 0; i < n; i++) {
    think(0.5, 1.5);
    const roll = Math.random();
    const direction = roll < 0.1 ? "super_like" : roll < 0.55 ? "like" : "pass";
    const r = record(
      http.post(`${BASE_URL}/swipes/`, JSON.stringify({ target_id: cands[i], direction }), { headers: H, tags: { step: "swipe" } }),
      T.swipe,
    );
    if (r.status === 201 && r.json("match_id") !== null) cMatchesFormed.add(1);
  }
  record(http.get(`${BASE_URL}/swipes/likes-received`, { headers: H, tags: { step: "likes_received" } }), T.likes_received);
  record(http.get(`${BASE_URL}/matches/?limit=20`, { headers: H, tags: { step: "matches" } }), T.matches);
}

function chatter(H) {
  const matches = jsonArray(record(http.get(`${BASE_URL}/matches/?limit=20`, { headers: H, tags: { step: "matches" } }), T.matches));
  if (matches.length === 0) return lurker(H); // nothing to chat about yet
  for (const m of pickSome(matches, 1, 3)) {
    record(http.get(`${BASE_URL}/matches/${m.id}/messages/?limit=30`, { headers: H, tags: { step: "messages_read" } }), T.messages_read);
    think();
    if (Math.random() < 0.5) {
      record(
        http.post(`${BASE_URL}/matches/${m.id}/messages/`, JSON.stringify({ content: `yuk testi ${Date.now()}`, message_type: "text" }), { headers: H, tags: { step: "message_send" } }),
        T.message_send,
      );
    }
    record(http.patch(`${BASE_URL}/matches/${m.id}/messages/read`, null, { headers: H, tags: { step: "messages_read" } }), T.messages_read);
  }
  record(http.get(`${BASE_URL}/notifications/`, { headers: H, tags: { step: "notifications" } }), T.notifications);
  record(http.patch(`${BASE_URL}/notifications/read`, null, { headers: H, tags: { step: "notifications" } }), T.notifications);
}

function socialite(H) {
  const events = jsonArray(record(http.get(`${BASE_URL}/events/?upcoming_only=true&limit=20`, { headers: H, tags: { step: "events" } }), T.events));
  think();
  if (events.length) {
    const ev = pick(events);
    record(http.post(`${BASE_URL}/events/${ev.id}/attend`, null, { headers: H, tags: { step: "event_attend" } }), T.event_attend);
    record(http.get(`${BASE_URL}/events/${ev.id}/attendees`, { headers: H, tags: { step: "attendees" } }), T.attendees);
    for (const other of pickSome(events, 1, 2)) {
      record(http.get(`${BASE_URL}/users/${randInt(2, USERS)}`, { headers: H, tags: { step: "profile_view" } }), T.profile_view);
    }
  }
  record(http.get(`${BASE_URL}/events/me/attending`, { headers: H, tags: { step: "events" } }), T.events);
}

function creator(H) {
  record(http.get(`${BASE_URL}/events/me/creation-quota`, { headers: H, tags: { step: "event_create" } }), T.event_create);
  think();
  const startsAt = new Date(Date.now() + randInt(2, 20) * 86400000).toISOString();
  const r = record(
    http.post(
      `${BASE_URL}/events/`,
      JSON.stringify({
        title: `Yuk testi etkinligi ${Date.now()}`,
        category: pick(CATEGORIES),
        location_name: "Kadikoy Moda",
        ...jitterCoords(),
        starts_at: startsAt,
        is_group_event: true,
        max_attendees: randInt(5, 30),
      }),
      { headers: H, tags: { step: "event_create" } },
    ),
    T.event_create,
  );
  if (r.status === 201) cEventsCreated.add(1);
  record(http.get(`${BASE_URL}/events/me/created`, { headers: H, tags: { step: "events" } }), T.events);
  record(
    http.patch(`${BASE_URL}/users/me`, JSON.stringify({ bio: `yuk testi bio ${Date.now()}` }), { headers: H, tags: { step: "profile_edit" } }),
    T.profile_edit,
  );
}

const PERSONAS = [
  { fn: lurker, weight: 35 },
  { fn: swiper, weight: 30 },
  { fn: chatter, weight: 20 },
  { fn: socialite, weight: 10 },
  { fn: creator, weight: 5 },
];
const WEIGHT_TOTAL = PERSONAS.reduce((s, p) => s + p.weight, 0);

function choosePersona() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const p of PERSONAS) {
    if (r < p.weight) return p.fn;
    r -= p.weight;
  }
  return lurker;
}

function pickSome(arr, min, max) {
  if (arr.length === 0) return [];
  const count = Math.min(arr.length, randInt(min, max));
  const copy = arr.slice();
  const out = [];
  for (let i = 0; i < count; i++) out.push(copy.splice(randInt(0, copy.length - 1), 1)[0]);
  return out;
}

function think(min = 1, max = 3) {
  sleep(randInt(min, max));
}

// ---------------------------------------------------------------------------
// the iteration one VU runs
// ---------------------------------------------------------------------------
export function session(data) {
  const pool = data.pool;
  const me = pool[(__VU - 1) % pool.length];
  const H = headers(me.token, me.xff);

  group("app_open", () => {
    record(http.get(`${BASE_URL}/users/me`, { headers: H, tags: { step: "profile_view" } }), T.profile_view);
  });

  const persona = choosePersona();
  group(persona.name, () => persona(H));

  think(3, 8); // read / think before the next loop
}
