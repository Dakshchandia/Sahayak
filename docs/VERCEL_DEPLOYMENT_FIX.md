# SAHAYAK — Vercel Deployment Fix Guide

## Problem Identified

The deployed application at https://sahayak-llart.io.vercel.app is returning **403 Forbidden** errors on `/api/personnel/checkin` endpoint.

**Root cause:** Missing environment variables in Vercel deployment.

---

## Solution: Configure Environment Variables in Vercel

### Step 1: Access Vercel Project Settings

1. Go to https://vercel.com/dashboard
2. Select the **SAHAYAK** project
3. Click **Settings** tab
4. Click **Environment Variables** in the left sidebar

---

### Step 2: Add Required Environment Variables

Add the following variables for **Production, Preview, and Development** environments:

#### 1. DATABASE_URL (REQUIRED)
```
DATABASE_URL
```
**Value:** Your PostgreSQL connection string

For Vercel Postgres:
```
postgres://default:XXXXXXXXX@ep-XXXX-pooler.us-east-1.postgres.vercel-storage.com/verceldb?sslmode=require
```

Or use a external PostgreSQL provider like:
- **Neon** (recommended): https://neon.tech/
- **Supabase**: https://supabase.com/
- **Railway**: https://railway.app/

**⚠️ CRITICAL:** Without this, all database queries fail with 403/500 errors.

---

#### 2. SESSION_SECRET (REQUIRED)
```
SESSION_SECRET
```
**Value:** A 64-character random hex string

Generate one using Node.js:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output:
```
7a8f3d2e9b1c4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f
```

**⚠️ CRITICAL:** Without this, authentication and session management will fail.

---

#### 3. NEXT_PUBLIC_APP_URL (REQUIRED)
```
NEXT_PUBLIC_APP_URL
```
**Value:**
```
https://sahayak-llart.io.vercel.app
```
(Use your actual Vercel deployment URL)

---

#### 4. NEXTAUTH_URL (REQUIRED)
```
NEXTAUTH_URL
```
**Value:**
```
https://sahayak-llart.io.vercel.app
```
(Same as NEXT_PUBLIC_APP_URL)

---

#### 5. GEMINI_API_KEY (Optional but Recommended)
```
GEMINI_API_KEY
```
**Value:** Your Google Gemini API key from https://makersuite.google.com/app/apikey

**If not set:** AI summaries fall back to template mode (clearly labeled). System remains fully functional.

---

#### 6. NODE_ENV (Auto-set by Vercel)
```
NODE_ENV
```
**Value:**
```
production
```
(Vercel sets this automatically, but verify it's present)

---

#### 7. DEMO_MODE (Optional)
```
DEMO_MODE
```
**Value:**
```
false
```
(Set to `false` in production to hide demo login panel)

---

### Step 3: Database Setup

#### Option A: Use Vercel Postgres (Easiest)

1. In Vercel project → **Storage** tab
2. Click **Create Database** → Select **Postgres**
3. Follow the wizard
4. Vercel auto-adds `DATABASE_URL` to your environment variables
5. Run migrations:

```bash
# In your local terminal
npx drizzle-kit push:pg --config=drizzle.config.ts
```

Or use the Vercel CLI:
```bash
vercel env pull .env.local
npx drizzle-kit push:pg
```

#### Option B: Use Neon (Recommended for Free Tier)

1. Go to https://neon.tech/ → Sign up
2. Create a new project
3. Copy the connection string (starts with `postgres://`)
4. Add to Vercel environment variables as `DATABASE_URL`
5. Run migrations locally:

```bash
# Set DATABASE_URL in your .env.local to the Neon connection string
npx drizzle-kit push:pg
```

---

### Step 4: Run Database Migrations

After setting `DATABASE_URL`, you need to apply migrations:

#### Method 1: Local migration (Recommended)
```bash
# In your project root
npm install
npx drizzle-kit push:pg --config=drizzle.config.ts
```

#### Method 2: Seed demo data (for SIH demo)
```bash
npx tsx scripts/seed.ts
npx tsx scripts/seed-workload.ts
```

This creates:
- 36 demo personnel accounts
- 3 welfare officers
- 2 commanders
- 1 admin
- Workload scenarios A-F

---

### Step 5: Redeploy

After adding all environment variables:

1. Go to **Deployments** tab in Vercel
2. Click the **three dots** on the latest deployment
3. Click **Redeploy**
4. Check **Use existing build cache** is UNCHECKED (force fresh build)
5. Click **Redeploy**

---

### Step 6: Verify Deployment

1. Wait for deployment to complete (~2-3 minutes)
2. Visit https://sahayak-llart.io.vercel.app/
3. Open browser DevTools (F12) → Console tab
4. Check for errors
5. Try logging in with demo credentials:
   - Email: `ravi.kumar@sahayak.local`
   - Password: `Demo@1234`

If you see the Personnel dashboard → **Success!**

---

## Common Issues and Fixes

### Issue 1: 403 Forbidden on API routes
**Cause:** Missing `SESSION_SECRET` or `DATABASE_URL`
**Fix:** Add both environment variables and redeploy

### Issue 2: "Cannot connect to database"
**Cause:** Invalid `DATABASE_URL` or database not accessible from Vercel
**Fix:** 
- Verify connection string is correct
- Ensure database allows connections from `0.0.0.0/0` (Vercel uses dynamic IPs)
- For Neon/Supabase, check if pooling is enabled

### Issue 3: Blank screen / no errors
**Cause:** Build succeeded but database tables don't exist
**Fix:** Run migrations using `npx drizzle-kit push:pg`

### Issue 4: "Invalid session" errors
**Cause:** `SESSION_SECRET` changed between deployments
**Fix:** Once set, never change `SESSION_SECRET` in production (invalidates all sessions)

### Issue 5: AI summaries show "unavailable"
**Cause:** `GEMINI_API_KEY` not set or invalid
**Fix:** 
- Get API key from https://makersuite.google.com/app/apikey
- Add to Vercel environment variables
- Redeploy

### Issue 6: CSRF token mismatch
**Cause:** `NEXT_PUBLIC_APP_URL` doesn't match actual deployment URL
**Fix:** Set `NEXT_PUBLIC_APP_URL=https://sahayak-llart.io.vercel.app` (no trailing slash)

---

## Production Checklist

Before going live with real data:

- [ ] `DATABASE_URL` points to production PostgreSQL (not local)
- [ ] `SESSION_SECRET` is a strong 64-char random hex
- [ ] `DEMO_MODE=false` (hides demo login panel)
- [ ] `GEMINI_API_KEY` is set (if using AI features)
- [ ] `NEXT_PUBLIC_APP_URL` matches your custom domain
- [ ] All migrations applied (`npx drizzle-kit push:pg`)
- [ ] Seed data removed (delete demo accounts): `npx tsx scripts/reset-db.ts`
- [ ] SSL certificate active (Vercel handles this automatically)
- [ ] SMTP configured for real email notifications
- [ ] Rate limiting verified (5 attempts / 15 min)
- [ ] Audit log tested (check `audit_logs` table)
- [ ] Role isolation tested (commander cannot access individual wellness data)

---

## Quick Test After Deployment

1. **Login Test**
   - Visit homepage
   - Login with demo account
   - Verify redirect to correct dashboard

2. **Check-in Test**
   - Submit a check-in
   - Verify score appears
   - Check AI summary is generated or template labeled

3. **Welfare Officer Test**
   - Login as welfare officer
   - Open case queue
   - Verify unit-scoped data (only Alpha unit visible)

4. **Commander Test**
   - Login as commander
   - Verify only aggregates shown
   - Try accessing `/api/welfare/cases` directly → should return 403

5. **Database Test**
   - Check Vercel Logs for any database connection errors
   - Verify no `ECONNREFUSED` errors

---

## Getting Deployment Logs

If issues persist:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Pull logs
vercel logs sahayak-llart.io.vercel.app --follow
```

Or view in Vercel dashboard:
1. Go to project → **Deployments**
2. Click on the latest deployment
3. Click **View Function Logs**
4. Check for database connection errors or missing env vars

---

## Alternative: Deploy from Local

If Vercel dashboard deployment keeps failing:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
cd SAHAYAK
vercel --prod

# CLI will prompt for environment variables
# Paste the values when asked
```

---

## Support

If you're still seeing 403 errors after following this guide:

1. Check Vercel deployment logs for specific error messages
2. Verify all 4 required env vars are set: `DATABASE_URL`, `SESSION_SECRET`, `NEXT_PUBLIC_APP_URL`, `NEXTAUTH_URL`
3. Confirm database tables exist: run `npx drizzle-kit push:pg`
4. Test database connection directly: `psql $DATABASE_URL`

---

*Last updated: 30 Sept 2026*
