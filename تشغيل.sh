#!/bin/bash
cd "$(dirname "$0")"
if lsof -i :8080 -sTCP:LISTEN >/dev/null 2>&1; then
    echo "السيرفر شغال قبل كده"
else
    (setsid nohup python3 -m http.server 8080 >/dev/null 2>&1 &)
    sleep 1
fi
xdg-open "http://localhost:8080" 2>/dev/null || echo "افتح المتصفح على الرابط: http://localhost:8080"