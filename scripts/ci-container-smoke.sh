#!/usr/bin/env bash
set -euo pipefail
cleanup() {
  docker logs steos-smoke-web 2>&1 || true
  docker rm -f steos-smoke-web steos-smoke-db >/dev/null 2>&1 || true
  docker network rm steos-smoke >/dev/null 2>&1 || true
}
trap cleanup EXIT
docker network create steos-smoke
docker run -d --name steos-smoke-db --network steos-smoke -e POSTGRES_PASSWORD=smoke_only postgres:16
for i in $(seq 1 60); do
  if docker exec steos-smoke-db pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec steos-smoke-db pg_isready -U postgres
docker run -d --name steos-smoke-web --network steos-smoke -p 127.0.0.1:3000:3000 \
  -e DATABASE_URL=postgres://postgres:smoke_only@steos-smoke-db:5432/postgres \
  -e APP_URL=http://localhost:3000 \
  -e ORDER_TOKEN_SECRET=smoke-only-not-a-production-secret-123 \
  -e CRON_SECRET=smoke-only-not-a-production-secret-456 \
  -e PAYMENTS_PROVIDER=stripe steos:ci
wait_status() {
  local path="$1" expected="$2" actual
  for i in $(seq 1 30); do
    actual=$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:3000/api/$path" || true)
    if [[ "$actual" == "$expected" ]]; then return 0; fi
    sleep 1
  done
  echo "Expected $path=$expected, got $actual" >&2
  return 1
}
wait_status live 200
test "$(docker exec steos-smoke-web id -u)" != 0
wait_status ready 200
docker stop steos-smoke-db
wait_status ready 503
wait_status live 200
for i in $(seq 1 8); do
  (test "$(curl --max-time 5 -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/ready)" = 503) &
  pids[$i]=$!
done
for pid in "${pids[@]}"; do wait "$pid"; done
docker start steos-smoke-db
wait_status ready 200
wait_status live 200
docker stop --time 10 steos-smoke-web
test "$(docker inspect -f '{{.State.OOMKilled}}' steos-smoke-web)" = false
echo "Container startup, non-root, outage and recovery smoke checks passed"
