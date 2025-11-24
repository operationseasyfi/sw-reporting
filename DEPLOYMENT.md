# Production Deployment Guide

This guide shows you how to deploy your SignalWire reporting dashboard to get a public URL for webhooks.

## Option 1: Railway (Easiest - Recommended)

**Railway** is the simplest option with a free tier and automatic HTTPS.

### Steps:

1. **Sign up at [railway.app](https://railway.app)** (free tier available)

2. **Create a New Project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (if you have a repo) OR "Empty Project"

3. **Add PostgreSQL Database:**
   - Click "New" → "Database" → "Add PostgreSQL"
   - Railway will create a PostgreSQL instance
   - Copy the `DATABASE_URL` from the database service settings

4. **Deploy Your App:**
   - If using GitHub: Connect your repo and Railway will auto-detect Python
   - If using CLI: Install Railway CLI and run `railway init` then `railway up`

5. **Set Environment Variables:**
   - In Railway dashboard, go to your service → "Variables"
   - Add all variables from your `.env` file:
     ```
     SIGNALWIRE_PROJECT_ID=your_id
     SIGNALWIRE_AUTH_TOKEN=your_token
     SIGNALWIRE_SPACE_URL=your_space.signalwire.com
     DATABASE_URL=postgresql://... (from Railway's PostgreSQL service)
     CELERY_BROKER_URL=redis://... (optional, if using Celery)
     CELERY_RESULT_BACKEND=redis://... (optional)
     ```

6. **Get Your URL:**
   - Railway automatically gives you a URL like: `https://your-app.up.railway.app`
   - This is your production webhook URL: `https://your-app.up.railway.app/webhooks/signalwire`

7. **Initialize Database:**
   - Railway provides a web terminal, or use your local machine:
     ```bash
     railway run python -c "from models import init_db; init_db(); print('Done!')"
     ```

---

## Option 2: Render (Free Tier Available)

**Render** offers a free tier with automatic SSL.

### Steps:

1. **Sign up at [render.com](https://render.com)**

2. **Create a New Web Service:**
   - Click "New" → "Web Service"
   - Connect your GitHub repo OR upload your code

3. **Configure:**
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 2 app:app`
   - **Environment:** Python 3

4. **Add PostgreSQL Database:**
   - Click "New" → "PostgreSQL"
   - Copy the `Internal Database URL` to your environment variables

5. **Set Environment Variables:**
   - In your service settings → "Environment"
   - Add all your `.env` variables

6. **Get Your URL:**
   - Render gives you: `https://your-app.onrender.com`
   - Webhook URL: `https://your-app.onrender.com/webhooks/signalwire`

**Note:** Free tier on Render spins down after 15 minutes of inactivity. Upgrade to paid for 24/7 uptime.

---

## Option 3: Fly.io (Good for Docker)

**Fly.io** is great if you want to use Docker.

### Steps:

1. **Install Fly CLI:**
   ```bash
   # Windows (PowerShell)
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Initialize:**
   ```bash
   fly launch
   ```
   - Follow prompts (use existing Dockerfile)
   - Don't create a Postgres database (you're using Supabase)

4. **Set Secrets:**
   ```bash
   fly secrets set SIGNALWIRE_PROJECT_ID=your_id
   fly secrets set SIGNALWIRE_AUTH_TOKEN=your_token
   fly secrets set SIGNALWIRE_SPACE_URL=your_space.signalwire.com
   fly secrets set DATABASE_URL=your_supabase_url
   ```

5. **Deploy:**
   ```bash
   fly deploy
   ```

6. **Get Your URL:**
   - Fly gives you: `https://your-app.fly.dev`
   - Webhook URL: `https://your-app.fly.dev/webhooks/signalwire`

---

## Option 4: DigitalOcean App Platform

**DigitalOcean** offers a simple platform with good performance.

### Steps:

1. **Sign up at [digitalocean.com](https://digitalocean.com)**

2. **Create App:**
   - Go to "Apps" → "Create App"
   - Connect GitHub repo or upload code

3. **Configure:**
   - **Build Command:** `pip install -r requirements.txt`
   - **Run Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 2 app:app`
   - **Environment Variables:** Add all from `.env`

4. **Add Database:**
   - You can use Supabase (external) or add a DigitalOcean managed database

5. **Get Your URL:**
   - DigitalOcean gives you: `https://your-app.ondigitalocean.app`
   - Webhook URL: `https://your-app.ondigitalocean.app/webhooks/signalwire`

---

## Quick Comparison

| Platform | Free Tier | Ease of Use | Best For |
|----------|-----------|-------------|----------|
| **Railway** | ✅ Yes | ⭐⭐⭐⭐⭐ | Quickest setup |
| **Render** | ✅ Yes (sleeps) | ⭐⭐⭐⭐ | Simple deployments |
| **Fly.io** | ✅ Yes | ⭐⭐⭐ | Docker users |
| **DigitalOcean** | ❌ No ($5/mo) | ⭐⭐⭐⭐ | Production apps |

---

## After Deployment

Once you have your production URL:

1. **Test the webhook endpoint:**
   ```bash
   curl https://your-app-url.com/webhooks/signalwire -X POST -d "MessageSid=test123&MessageStatus=delivered"
   ```

2. **Configure UltraSMSScript:**
   - Go to UltraSMSScript settings
   - Enable "DLR Webhook URL Notification"
   - Enter: `https://your-app-url.com/webhooks/signalwire`
   - Save

3. **Monitor:**
   - Check your Railway/Render/Fly dashboard for logs
   - Watch your Supabase database for incoming webhook data

---

## Troubleshooting

**Webhook not receiving data?**
- Check that your URL is publicly accessible (not localhost)
- Verify HTTPS is enabled (required by SignalWire)
- Check application logs for errors
- Ensure Celery worker is running (if using background tasks)

**Database connection issues?**
- Verify `DATABASE_URL` is set correctly
- For Supabase, use the **Transaction Pooler** URL (port 6543)
- Check Supabase dashboard for connection limits

**High volume concerns?**
- Upgrade to a paid plan for better performance
- Consider using a dedicated Redis instance for Celery
- Monitor your database connection pool usage

