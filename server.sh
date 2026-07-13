#!/bin/bash
# server.sh — запуск/остановка сервера профиля пути
# Использование: ./server.sh start | stop | status

DIR="/home/lond/Desktop/railway-track-profile"
PORT=8080
PIDFILE="/tmp/railway-profile-server.pid"

case "${1:-start}" in
  start)
    if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE") 2>/dev/null; then
      echo "⚠ Сервер уже запущен (PID $(cat "$PIDFILE"))"
      exit 1
    fi
    cd "$DIR" && python3 -m http.server "$PORT" &
    echo $! > "$PIDFILE"
    echo "✅ Сервер запущен на http://localhost:$PORT (PID $!)"
    ;;
  stop)
    if [ ! -f "$PIDFILE" ]; then
      echo "⚠ PID-файл не найден"
      # Ищем процесс вручную
      PID=$(lsof -ti :$PORT 2>/dev/null || ss -tlnp | grep ":$PORT" | grep -oP 'pid=\K\d+')
      if [ -n "$PID" ]; then
        kill "$PID" 2>/dev/null && echo "✅ Процесс $PID остановлен" || echo "⚠ Не удалось остановить $PID"
      else
        echo "⚠ Сервер не запущен"
      fi
      exit 0
    fi
    PID=$(cat "$PIDFILE")
    if kill "$PID" 2>/dev/null; then
      echo "✅ Сервер остановлен (PID $PID)"
    else
      echo "⚠ Процесс $PID не найден"
    fi
    rm -f "$PIDFILE"
    ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE") 2>/dev/null; then
      echo "✅ Сервер работает (PID $(cat "$PIDFILE")) — http://localhost:$PORT"
    else
      echo "⚠ Сервер не запущен"
    fi
    ;;
  *)
    echo "Использование: $0 {start|stop|status}"
    exit 1
    ;;
esac