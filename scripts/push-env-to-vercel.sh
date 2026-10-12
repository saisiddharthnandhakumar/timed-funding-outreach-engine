#!/usr/bin/env bash
# Copies the variables in .env.local to the linked Vercel project (production) without printing values.
# Prereq: `npx vercel login` and `npx vercel link` in this directory.
set -euo pipefail
KEYS=(NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY GOOGLE_GENERATIVE_AI_API_KEY GEMINI_MODEL CRON_SECRET OUTREACH_SENDER_NAME ACCELERATOR_NAME GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_REFRESH_TOKEN SERPER_API_KEY TAVILY_API_KEY)
for k in "${KEYS[@]}"; do
  v=$(grep -E "^${k}=" .env.local | head -1 | cut -d= -f2- || true)
  if [ -n "$v" ]; then
    printf '%s' "$v" | npx vercel env add "$k" production --force >/dev/null 2>&1 && echo "set  $k" || echo "FAIL $k"
  else
    echo "skip $k (empty)"
  fi
done
echo "Done. Redeploy with: npx vercel --prod"
