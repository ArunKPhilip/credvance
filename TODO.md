# TODO - Fix 404 issue for Vercel deployment

## Step 1: Identify Vercel routing/Express mismatch
- [x] Read `vercel.json` rewrites
- [x] Read `src/backend/app.ts` to see SPA fallback + notFound handling
- [x] Read `src/backend/server.ts` to see Vercel handler and `/health` patch
- [x] Read `src/backend/interfaces/http/middleware/errorHandlerMiddleware.ts` (includes `notFoundMiddleware` export)

## Step 2: Fix Express SPA fallback condition
- [ ] Update `src/backend/app.ts` to avoid relying on `_request.path` (use `originalUrl` / `url`)
- [ ] Ensure `/api/*`, `/health`, `/metrics` are excluded from SPA `index.html` serving

## Step 3: Align Vercel handler rewrite with expected paths
- [ ] Update `server.ts` (Vercel handler) so it sets the canonical url/route consistently with Express expectations
- [ ] Confirm `api/health.ts` is actually used (Vercel route mapping) and ensure it matches Express mount points

## Step 4: Build and run validation
- [ ] Run `npm run build`
- [ ] Run `npm run start` locally and test:
  - [ ] GET `/health`
  - [ ] GET `/metrics`
  - [ ] unknown route returns JSON 404 (not index.html)

## Step 5: Deploy validation
- [ ] Deploy to Vercel and confirm 404 behavior is corrected

