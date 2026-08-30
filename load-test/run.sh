#!/usr/bin/env bash
# Run the FindYourBuddy k6 load / stress test.
#
#   ./run.sh                                    # load profile, VUS=200, localhost:8001
#   BASE_URL=https://api.example.com ./run.sh
#   SCENARIO=smoke ./run.sh
#   SCENARIO=stress RATE=600 VUS=400 ./run.sh
#   SCENARIO=breakpoint RATE=1000 ./run.sh
#   ./run.sh --grafana                          # stream results into the stack (dashboard 5)
#
# With no local k6 binary it falls back to the grafana/k6 Docker image.

set -euo pipefail
cd "$(dirname "$0")"

BASE_URL="${BASE_URL:-http://localhost:8001}"
SCENARIO="${SCENARIO:-load}"

# Collect the -e flags that are actually set, into the global K6_ENV array.
build_k6_env() {
  local target_url="$1"
  K6_ENV=(-e "BASE_URL=$target_url" -e "SCENARIO=$SCENARIO")
  local key
  for key in VUS RATE USERS PASSWORD P95_MS P99_MS FAIL_RATE SOAK_DURATION RUN_ID; do
    if [[ -n "${!key:-}" ]]; then
      K6_ENV+=(-e "$key=${!key}")
    fi
  done
}

if [[ "${1:-}" == "--grafana" ]]; then
  echo ">> Streaming into Prometheus/Grafana. Bring the stack up first: bash ../start.sh"
  ( cd .. && docker compose -f docker-compose.yml -f load-test/docker-compose.k6.yml run --rm k6 )
  exit $?
fi

if command -v k6 >/dev/null 2>&1; then
  build_k6_env "$BASE_URL"
  exec k6 run "${K6_ENV[@]}" scenario.js
fi

echo ">> k6 not found on PATH, using the grafana/k6 Docker image."
docker_url="${BASE_URL/localhost/host.docker.internal}"
docker_url="${docker_url/127.0.0.1/host.docker.internal}"
build_k6_env "$docker_url"
exec docker run --rm -i --add-host host.docker.internal:host-gateway \
  "${K6_ENV[@]}" -v "$PWD:/scripts" -w /scripts grafana/k6:0.54.0 run scenario.js
