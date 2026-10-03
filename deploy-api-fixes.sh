#!/bin/bash
# Deploy API endpoint fixes to production

echo "🚀 Deploying API endpoint fixes..."

# Commit changes
git add backend/src/dashboard/dashboard.controller.ts
git add backend/src/weather/weather.controller.ts
git add backend/src/info-center/info-center.controller.ts

git commit -m "fix: Add missing API routes - /dashboard, /weather, /info-center/articles

- Add GET /dashboard route (alias for /dashboard/home)
- Add GET /weather route with lat/lon support
- Add GET /info-center/articles route (alias for /feed)

Fixes 404 errors for mobile app compatibility"

# Push to trigger CI/CD
git push origin main

echo "✅ Changes pushed to main branch"
echo "⏳ GitHub Actions will deploy to production automatically"
echo "📱 Wait ~2-3 minutes for deployment to complete"
