#!/bin/sh
# Usage: preview/shot.sh <scene> <out.png>   (needs the server on :8765)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=${SCALE:-1} --window-size=1060,800 --virtual-time-budget=6000 \
  --screenshot="$2" "http://127.0.0.1:8765/preview/index.html?scene=$1" 2>/dev/null
