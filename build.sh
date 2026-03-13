#!/bin/bash
# Build script for Cloudflare Pages deployment
# Injects Supabase config directly into index.html (avoids .gitignore issues with config.js)

if [ -n "$SUPABASE_URL" ] && [ -n "$ANON_KEY" ]; then
  # Replace the external config.js script tag with an inline script
  sed -i "s|<script src=\"config.js\"></script>|<script>const CONFIG={SUPABASE_URL:\"${SUPABASE_URL}\",SUPABASE_ANON_KEY:\"${ANON_KEY}\"};</script>|" vibe-planner/index.html
  echo "✓ Supabase config injected into index.html"
else
  echo "⚠ SUPABASE_URL or ANON_KEY not set — app will run in Local Mode"
fi
