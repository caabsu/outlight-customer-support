# Deploy Backend API to Railway

The backend API (`apps/api`) needs to be deployed separately from the frontend. This guide walks you through deploying to Railway.

## Prerequisites

- Railway account (sign up at https://railway.app)
- GitHub repository connected
- All environment variables ready (see `.env.example`)

## Step 1: Create New Project on Railway

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose `caabsu/outlight-customer-support`
5. Railway will detect your repository

## Step 2: Configure the Service

**Root Directory:**
- Leave blank (deploy from repository root)

**Build Command:**
```bash
npm install && npm run build
```

**Start Command:**
```bash
npm start
```

Railway will automatically use the scripts from `package.json`:
- `build`: Compiles TypeScript + generates Prisma client
- `start`: Runs database migrations + starts Express server

## Step 3: Add Environment Variables

In Railway project settings → Variables, add ALL of these:

### Required Variables

```bash
# Database (Supabase)
DATABASE_URL=postgresql://postgres.[YOUR-PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
DIRECT_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres

# OpenAI
OPENAI_API_KEY=sk-proj-...

# Google OAuth (Gmail)
GOOGLE_CLIENT_ID=123456789-abc123.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abc123...
GOOGLE_REDIRECT_URI=https://your-api.railway.app/oauth/google/callback
GMAIL_ACCOUNT_EMAIL=your-support-email@gmail.com

# Shopify
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=shpat_abc123...
SHOPIFY_API_VERSION=2024-01

# 17track
SEVENTEENTRACK_API_KEY=your-17track-api-key

# Server (Railway sets PORT automatically)
PORT=${{PORT}}
```

**IMPORTANT:** Update `GOOGLE_REDIRECT_URI` to match your Railway deployment URL once deployed.

## Step 4: Deploy

1. Click "Deploy"
2. Railway will build and deploy your API
3. Once deployed, copy your Railway URL (e.g., `https://outlight-api-production.up.railway.app`)

## Step 5: Update Google OAuth Redirect URI

1. Go to Google Cloud Console → Credentials
2. Edit your OAuth 2.0 Client ID
3. Add redirect URI: `https://your-api.railway.app/oauth/google/callback`
4. Save
5. Go back to Railway → Variables and update `GOOGLE_REDIRECT_URI`

## Step 6: Connect Frontend to Backend

In **Vercel** (where your frontend is deployed):

1. Go to Project Settings → Environment Variables
2. Add new variable:
   - **Name:** `NEXT_PUBLIC_API_URL`
   - **Value:** `https://your-api.railway.app` (your Railway URL)
3. Save
4. Redeploy your Vercel project

## Step 7: Test the Connection

1. Visit your Vercel site
2. Try accessing analytics → should fetch data from Railway API
3. Try email features → should connect to Gmail via Railway API

## Verify API is Running

Visit your Railway URL directly:
```
https://your-api.railway.app/
```

You should see:
```json
{
  "name": "Outlight Customer Support API",
  "version": "1.0.0",
  "endpoints": { ... }
}
```

## Troubleshooting

### Build fails with "Cannot find module"
- Check that all dependencies are in `dependencies`, not `devDependencies`
- Prisma should be in `dependencies` (already fixed)

### Database connection fails
- Verify `DATABASE_URL` and `DIRECT_URL` are correct
- Check Supabase allows connections from Railway IPs
- Check Prisma schema is compatible

### OAuth redirect fails
- Make sure `GOOGLE_REDIRECT_URI` matches exactly: `https://your-api.railway.app/oauth/google/callback`
- Verify the redirect URI is added in Google Cloud Console

### Frontend can't connect to API
- Verify `NEXT_PUBLIC_API_URL` is set in Vercel
- Check Railway service is running
- Test API endpoint directly in browser

## Alternative Deployment Options

If Railway doesn't work, you can also deploy to:

- **Render:** https://render.com (similar setup)
- **Fly.io:** https://fly.io (needs Dockerfile)
- **Heroku:** https://heroku.com (needs Procfile)

The key is that any platform you choose must:
1. Support Node.js
2. Allow long-running processes (not serverless)
3. Provide a public URL
4. Support environment variables
