# SignalWire SMS Reporting Dashboard

This dashboard provides analytics for your SignalWire SMS traffic, including delivery rates, error codes, and logs.

## Setup Instructions

### 1. Install Dependencies
Ensure you have Python installed. Run the following command to install the required libraries:

```bash
pip install -r requirements.txt
```

### 2. Configure Credentials
1. Create a file named `.env` in this directory.
2. Copy the contents from `env_template.txt` into `.env`.
3. Log in to your [SignalWire Portal](https://signalwire.com/signin).
4. Go to **API** -> **New** to generate an Auth Token.
5. Fill in your `Project ID`, `Auth Token`, and `Space URL` (e.g., `example.signalwire.com`) in the `.env` file.

### 3. Database Setup (Supabase)
1. Create a Supabase project at https://supabase.com
2. Get your connection string from Project Settings -> Database -> Connection String
3. Use the **Transaction Pooler** (port 6543) for IPv4 compatibility
4. Add `DATABASE_URL` to your `.env` file:
   ```
   DATABASE_URL=postgresql://postgres.xxxx:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
5. Initialize the database:
   ```bash
   python -c "from models import init_db; init_db(); print('Database initialized successfully!')"
   ```

### 4. Populate Data (Historical Import)
To fetch recent message logs from SignalWire, run the sync script:

```bash
python sync_logs.py
```
*Note: The script is configured to sync only the last 10 minutes to avoid pulling millions of messages. You can adjust `MINUTES_TO_SYNC` in `sync_logs.py` if needed. Press Ctrl+C to stop gracefully.*

### 5. Start the Dashboard
Run the dashboard application:

```bash
python app.py
```
Open your browser to `http://localhost:5000` to view the reports.

---

## Real-Time Data with DLR Webhooks (REQUIRED for Production)

**You MUST set up the DLR (Delivery Receipt) webhook** to get real-time status updates. Without it, you only know messages were *sent*, not if they were *delivered*.

### How to Setup DLR Webhook in UltraSMSScript

1. **Expose your webhook endpoint:**
   - For local development, use **ngrok**: `ngrok http 5000`
   - For production, deploy your app to a public server
   - Your webhook URL will be: `https://your-domain.com/webhooks/signalwire`

2. **Configure in UltraSMSScript:**
   - Go to UltraSMSScript settings
   - Find **"DLR Webhook URL Notification"**
   - Toggle it **ON**
   - Paste your webhook URL: `https://your-domain.com/webhooks/signalwire`
   - Click **Save**

3. **How it works:**
   - When you send a message via UltraSMSScript → SignalWire
   - SignalWire sends the message to the carrier
   - The carrier sends back a delivery receipt (DLR)
   - SignalWire forwards the DLR to your webhook endpoint
   - Your app updates the database in real-time

### Why You Need Both:
- **DLR Webhook**: Real-time updates for NEW messages (going forward)
- **sync_logs.py**: Backfill for recent messages (last 10 minutes) if webhook was down

### System Architecture:
- **High Volume Ready**: Uses PostgreSQL with connection pooling, batch inserts, and rate limiting
- **Scalable**: Handles millions of messages with proper indexing and pagination
- **Real-time**: Webhooks update database instantly via Celery background tasks

