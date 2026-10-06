#!/usr/bin/env bash
#
# Start, stop or check the three local processes that make up the prototype.
#
#   ./scripts/dev.sh start     start mock external API, backend and frontend
#   ./scripts/dev.sh stop      stop whatever is listening on their ports
#   ./scripts/dev.sh status    report what is listening and whether it answers
#   ./scripts/dev.sh restart
#
# Logs are written to .logs/ in the repo root.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.logs"
MOCK_PORT=5002
API_PORT=5001
WEB_PORT=5173

port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1; }

stop_port() {
  local port=$1 name=$2 pid
  pid="$(port_pid "$port")"
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null && echo "stopped $name (pid $pid, port $port)"
    sleep 0.4
  else
    echo "$name not running on port $port"
  fi
}

start() {
  mkdir -p "$LOGS"

  if [ -z "$(port_pid $MOCK_PORT)" ]; then
    (cd "$ROOT/mock-external-service" && nohup node src/server.js > "$LOGS/mock.log" 2>&1 < /dev/null &)
    echo "starting mock external API on $MOCK_PORT"
  else
    echo "port $MOCK_PORT already in use, leaving it alone"
  fi

  if [ -z "$(port_pid $API_PORT)" ]; then
    (cd "$ROOT/backend" && nohup node src/server.js > "$LOGS/backend.log" 2>&1 < /dev/null &)
    echo "starting backend API on $API_PORT"
  else
    echo "port $API_PORT already in use, leaving it alone"
  fi

  if [ -z "$(port_pid $WEB_PORT)" ]; then
    (cd "$ROOT/frontend" && nohup npm run dev > "$LOGS/frontend.log" 2>&1 < /dev/null &)
    echo "starting frontend on $WEB_PORT"
  else
    echo "port $WEB_PORT already in use, leaving it alone"
  fi

  sleep 4
  status
}

stop() {
  stop_port $WEB_PORT "frontend"
  stop_port $API_PORT "backend"
  stop_port $MOCK_PORT "mock external API"
}

status() {
  echo
  printf '%-22s %-7s %-9s %s\n' SERVICE PORT PID HEALTH
  for row in "mock external API:$MOCK_PORT:/external/health" "backend API:$API_PORT:/api/v1/health" "frontend:$WEB_PORT:/"; do
    name="${row%%:*}"; rest="${row#*:}"; port="${rest%%:*}"; path="${rest#*:}"
    pid="$(port_pid "$port")"
    code="$(curl -s -o /dev/null -m 4 -w '%{http_code}' "http://127.0.0.1:$port$path" 2>/dev/null)"
    printf '%-22s %-7s %-9s %s\n' "$name" "$port" "${pid:- -}" "HTTP ${code:-none}"
  done
  echo
}

case "${1:-status}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|restart|status}"; exit 1 ;;
esac
