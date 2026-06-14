# Deploy to Vercel (domain: credvance.in)

## Architecture Overview

The API runs as a single Vercel **Serverless Function** at `api/[...path].ts`.  
**All** HTTP requests (`/api/*`, `/health`, `/metrics`) are rewritten via `vercel.json` to this catch-all handler, which boots the full Express application and lets Express handle routing internally.

## 1) Prepare environment variables on Vercel
Add these in **Project Settings → Environment Variables**:
- `NODE_ENV` = `production`
- `PORT` = `4000` (or any number supported by your runtime; keep consistent)
- `ADMIN_API_KEY` = (your value, >= 20 chars)
- `PII_HASH_SALT` = (your value, >= 20 chars)
- `API_ALLOWED_ORIGINS` = your deployed frontend origin (set to your Vercel URL and/or domain)

Firebase options (choose one way):
- Prefer `FIREBASE_USE_APPLICATION_DEFAULT=true` (and configure Vercel/Google auth accordingly), OR
- Use service account credentials:
  - `FIREBASE_SERVICE_ACCOUNT_JSON` = JSON string (preferred)
  - OR set split fields: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

Optional:
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_DATABASE_URL`
- `FIREBASE_PROJECT_ID`, `FIREBASE_PROJECT_NUMBER`

## 2) Build & run settings in Vercel
In **Project Settings** set:
- Build Command: `npm run build`
- Output Directory: leave blank (this is a Node/Express app)
- Install Command: `npm ci`

For runtime, ensure Vercel uses `npm run start`.

## 3) Add Vercel builder/runtime entry
Create/confirm a Node start entry that runs:
- `npm run start`

This repo’s API serves the built frontend from `dist/frontend`.
So Vercel must run both build + start.

⚠️  The `api/` directory is only used for Vercel Serverless Functions.  
   The local dev command is **`npm run dev:api`** (uses `tsx` directly).

## 4) Import to Vercel
- Create Vercel project
- Import from GitHub
- During import, set the build command to `npm run build`
- Ensure the start command is `npm run start`

## 5) Point Godaddy domain credvance.in to Vercel
In Vercel:
- Go to **Project → Settings → Domains**
- Add `credvance.in`
- Vercel will provide required DNS records

In GoDaddy DNS:
- Create records as instructed by Vercel (typically an **A** record and/or **CNAME**).

After propagation, Vercel will issue SSL.

