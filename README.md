# New Yogeshwar Electric & Nal Fitting — Worker Booking

Customers scan a QR code at your shop, see all available workers (experience + skills), and tap **Book Now**.
The booking is saved in your Google Sheet and the customer sends the details to the shop on WhatsApp.
You manage workers from a password-protected admin page. Bookings delete themselves after 7 days.

---

## 📁 Folder Structure

```
├── public/               ← Static files (customer + admin pages)
│   ├── index.html        ← Customer page (QR code lands here)
│   ├── admin.html        ← Admin dashboard
│   ├── css/style.css     ← All styles
│   └── js/
│       ├── app.js        ← Customer page logic (workers, booking form)
│       └── admin.js      ← Admin page logic
├── api/                  ← Vercel serverless functions
│   ├── workers.js        ← GET  /api/workers   (active workers)
│   ├── jobs.js           ← GET  /api/jobs      (job categories)
│   ├── booking.js        ← POST /api/booking   (save booking, 10 per IP per hour)
│   ├── cleanup.js        ← GET  /api/cleanup   (daily cron: delete bookings older than 7 days)
│   └── admin.js          ← POST /api/admin     (password-protected)
├── lib/
│   ├── sheets.js         ← Google Sheets helper
│   └── ratelimit.js      ← In-memory rate limiter
├── package.json
├── vercel.json           ← Cache headers + daily cleanup schedule
└── README.md             ← You are here
```

## 🔄 How a booking works

1. Customer taps **Book Now** on a worker → fills name, phone (10 digits), address, job → **Submit**.
2. The server checks everything and adds a row to the **Bookings** tab (status `New`).
3. The customer sees "Booking received!" and taps **Send on WhatsApp**. WhatsApp opens with this message already typed, addressed to the shop (8208104775):
   `New Booking: Anil (9876543210) at 12 Main Road needs Electrician from Ramesh Singh`
4. The customer presses **Send**. That is when the shop gets the WhatsApp message.
   (The booking is in the Google Sheet either way, so nothing is lost if they skip this step.)

> The shop WhatsApp number is set at the top of [api/booking.js](api/booking.js) (`SHOP_WHATSAPP`). Change it there if it ever changes.

---

## 🛠️ Setup Guide (Beginner-Friendly)

### Step 1: Set up your Google Sheet

Create these tabs at the bottom of your Google Sheet. **Spelling must match exactly.**

#### Tab "Workers" — Row 1 headers:

| A | B | C | D | E |
|---|---|---|---|---|
| ID | Name | Experience | JobCategories | Active |

- **ID** — made automatically when you add workers from the admin page. If you type a row in the sheet yourself, put any unique text here (e.g. `W100`).
- **Experience** — a number of years (e.g. `8`)
- **JobCategories** — comma-separated, e.g. `Electrician, AC Technician`
- **Active** — `Yes` or `No`

> ⚠️ **If you used the older version of this app**, the Workers tab had columns `ID | Name | Phone | Job | Active | WhatsApp`. Change the headers to the ones above, put the years of experience in column C, and clear column F — otherwise phone numbers will show up as "experience".

#### Tab "Jobs" — Row 1 header `JobName`, then rows 2–6:

```
Electrician
Plumber
AC Technician
Painter
Carpenter
```

#### Tab "Bookings"
Nothing to do — it is **created automatically** with the right headers on the first booking:
`ID | CustomerName | CustomerPhone | Address | JobCategory | WorkerName | Timestamp | Status`

#### Share the Sheet with the service account
1. Click **Share** (top-right of the sheet)
2. Paste: `worker-app@yogeshwar-worker-app.iam.gserviceaccount.com`
3. Permission: **Editor** → untick "Notify people" → Share

### Step 2: Google Cloud (already done)

- Project: `yogeshwar-worker-app`
- Service account: `worker-app@yogeshwar-worker-app.iam.gserviceaccount.com`
- Google Sheets API enabled

> ⚠️ If you ever shared your private key publicly: [Google Cloud Console → IAM → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts) → your service account → Keys → delete the old key → create a new JSON key.

### Step 3: Choose an admin password

Pick a strong one, e.g. `MyShop@2024!`. You'll set it as `ADMIN_PASSWORD` in Vercel.

### Step 4: Push the code to GitHub

```bash
git add .
git commit -m "Worker booking app"
git push
```

### Step 5: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) → sign in with GitHub → **Add New → Project**
2. Pick your repository, leave settings as default (Framework: Other)
3. Add these **Environment Variables**, then click **Deploy**:

| Variable | Value |
|---|---|
| `GOOGLE_SHEET_ID` | The long ID in your sheet's URL (between `/d/` and `/edit`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `worker-app@yogeshwar-worker-app.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | The `private_key` value from your JSON key file (including the BEGIN/END lines) |
| `ADMIN_PASSWORD` | Your admin password |
| `CRON_SECRET` *(recommended)* | Any long random text. Stops strangers from calling the cleanup URL. |

> 💡 If you get auth errors, paste the private key again with double quotes around it, and redeploy.

> Rate limiting is done in memory (no Redis account needed), and WhatsApp uses a plain link (no Twilio/Make.com), so there are no extra accounts or variables.

### Step 6: Generate a QR code

1. Take your Vercel URL (e.g. `https://your-app.vercel.app`)
2. Go to [qr-code-generator.com](https://www.qr-code-generator.com/) (or any free QR tool) and paste the URL
3. Download it, print it, and put it at your shop counter

### Step 7 (optional): Make an Android APK to share (no Play Store)

The site is an installable app (PWA). To turn it into an `.apk` file you can send on WhatsApp:

1. Deploy to Vercel first (Step 5) and open your URL on a phone once to check it loads.
2. Go to [pwabuilder.com](https://www.pwabuilder.com), paste your Vercel URL, click **Start**.
3. Click **Package for stores → Android**. Fill in:
   - Package ID: `in.yogeshwar.workers` (any `xxx.yyy.zzz` text; keep it the same forever)
   - App name: `New Yogeshwar Electric & Nal Fitting`
   - Signing key: choose **Create new**
4. Download the zip. Inside you'll find:
   - the **`.apk`** file → this is what you share
   - a **signing key file + passwords** → **keep these safe**; you need the same key to make updates
   - `assetlinks.json` (see below)
5. Send the `.apk` to customers (WhatsApp, Drive, etc.). On their phone: open the file → allow **"Install unknown apps"** when asked → Install. Google Play Protect may show a "not scanned" warning; tap **Install anyway**.

**Hide the address bar (recommended):** take the `assetlinks.json` from the zip and save it in this project as `public/.well-known/assetlinks.json`, then push to GitHub so Vercel redeploys. Without it the app still works, but shows a thin browser bar at the top.

**Updates:** the app loads your live website, so changes to workers, text and design appear automatically. You only need a new APK if you change the app name or icon.

---

## ✅ How to Test

### Customer page
1. Open your Vercel URL on a phone. You should see worker cards with experience and skill tags.
2. Tap a job filter, type in the search box, and switch हिं / EN.
3. Tap **Book Now** → try submitting with a 5-digit phone number → you should see an error.
4. Fill it properly → **Submit** → "Booking received!" → tap **Send on WhatsApp** → WhatsApp opens with the message typed.
5. Open the Google Sheet → a **Bookings** tab now exists with your booking (Status `New`).

### Rate limit
Submit 11 bookings quickly from one phone/network. The 11th shows "Too many bookings…". (The counter resets after an hour.)

### Auto-delete (7 days)
1. In the Bookings tab, edit a row's **Timestamp** to an old date, e.g. `2024-01-01T10:00:00.000Z`.
2. Open `https://your-app.vercel.app/api/cleanup` in your browser. (If you set `CRON_SECRET`, the browser will get "Unauthorized". In that case use Vercel dashboard → your project → **Settings → Cron Jobs → Run**.)
3. You should see `{"success":true,"deleted":1}` and the row disappears.

Vercel also runs this by itself every day at 3 AM UTC.

### Admin page
1. Open `/admin.html` and log in.
2. **Add** a worker (name, experience, tick job categories) → **Edit** → **Delete**.
3. **Jobs** tab: add/remove job categories.

### API URLs
- `/api/workers` → list of workers
- `/api/jobs` → list of job categories

---

## 📝 Daily Usage

### Add / edit workers
- **Easiest:** `/admin.html` → fill the form → **Add Worker**. Use **Edit** to change experience or skills, and untick **Active** to hide a worker.
- **Or directly in the sheet:** add a row in the Workers tab (ID: any unique text, Active: `Yes`).
- Changes show up on the customer page within about 60 seconds.

### Add a new job category
Admin → **Jobs** tab → type the name → **Add**. (Or add a row in the Jobs tab.) Then tick it on the workers who do that job.

> Hindi names for the 5 starting jobs are built in. A new job shows in English for Hindi users unless added to the `JOB_HI` list in [public/js/app.js](public/js/app.js).

### Seeing bookings
Open the **Bookings** tab in your Google Sheet. Rows older than 7 days are removed automatically.

---

## 🔒 Security Notes

- ✅ Secrets (Google key, admin password) live only in Vercel environment variables
- ✅ All booking input is cleaned and validated on the server (10-digit phone, all fields required, worker and job must exist)
- ✅ Customer-supplied text is written to the sheet as plain text (never as formulas) and shown with `textContent`
- ✅ Booking is limited to 10 per IP per hour; admin login to 5 failures per 15 minutes
- ℹ️ The in-memory limiter resets when Vercel restarts the function, so it is a soft limit — fine for a local shop

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| "Failed to load workers" | Make sure the sheet is shared with the service account as **Editor** |
| Auth/permission errors | Check `GOOGLE_PRIVATE_KEY` in Vercel, then redeploy |
| Workers show weird experience | Workers tab columns must be `ID, Name, Experience, JobCategories, Active` |
| Worker not showing | Active must be `Yes`, and JobCategories must not be empty |
| "no longer available" on booking | Page is out of date (60s cache) — refresh and try again |
| Admin login fails | `ADMIN_PASSWORD` in Vercel must match what you type |
| Old bookings not deleting | Check Vercel → Settings → Cron Jobs, and that Timestamp values are real dates |
