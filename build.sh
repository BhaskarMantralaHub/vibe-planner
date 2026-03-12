#!/bin/bash
# Build script for Cloudflare Pages deployment
# Generates config.js from environment variables set in Cloudflare dashboard

if [ -n "$SUPABASE_URL" ] && [ -n "$ANON_KEY" ]; then
  cat > vibe-planner/config.js <<JSEOF
const CONFIG = {
  SUPABASE_URL: "${SUPABASE_URL}",
  SUPABASE_ANON_KEY: "${ANON_KEY}"
};
JSEOF
  echo "✓ config.js generated from environment variables"
else
  echo "⚠ SUPABASE_URL or ANON_KEY not set — app will run in Local Mode"
fi
