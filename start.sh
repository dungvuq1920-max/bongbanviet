#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start Python FastAPI server in background (port 8000, internal only)
cd "$SCRIPT_DIR/douyin-downloader"
python -m uvicorn server.app:app --host 0.0.0.0 --port 8000 &

# Start Node Express server in foreground (Railway exposes PORT)
cd "$SCRIPT_DIR"
exec node server.js
