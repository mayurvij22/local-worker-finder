# Yogeshwar Electric Shop — Worker Directory

Customers scan a QR code at your shop, pick a job category, and tap to call or WhatsApp a worker.  
You manage everything from a password-protected admin page.

---

## 📁 Folder Structure

```
yogeshwar/
├── public/               ← Static files (customer + admin pages)
│   ├── index.html        ← Customer page (QR code lands here)
│   ├── admin.html        ← Admin dashboard
│   ├── css/app.css       ← Built Tailwind CSS (generated — do not edit)
│   └── js/               ← ES modules, no bundler
│       ├── shared/dom.js ← DOM helpers, icons, toast, modals
│       ├── customer/     ← main.js (customer page) + i18n.js (EN/HI text)
│       └── admin/main.js ← Admin page logic
├── api/                  ← Vercel serverless functions
│   ├── workers.js        ← GET  /api/workers (public, no phones)
│   ├── number.js         ← GET  /api/number?id=X (rate-limited)
│   ├── jobs.js           ← GET  /api/jobs
│   └── admin.js          ← POST /api/admin (password-protected)
├── lib/
│   ├── sheets.js         ← Google Sheets API helper
│   └── ratelimit.js      ← In-memory rate limiter
├── src/styles/tailwind.css ← Tailwind source (components: .btn, .field, .card, .modal…)
├── tailwind.config.js    ← Brand colours, fonts, breakpoints
├── package.json
├── vercel.json
└── README.md             ← You are here
```

### 🎨 Styling (Tailwind CSS)

The pages use Tailwind utility classes. After changing classes in any HTML/JS file, rebuild the CSS
and commit `public/css/app.css` (Vercel serves it as-is, no build step):

```bash
npm install
npm run build:css     # one-off, minified
npm run watch:css     # rebuild on every save while developing
```

---

## 🛠️ Complete Setup Guide (Beginner-Friendly)

### Step 1: Set Up Your Google Sheet

Open your Google Sheet and create **two tabs** (the tabs at the bottom of the sheet):

#### Tab 1: "Workers"
Rename the first tab to exactly **Workers** and add these headers in Row 1:

| A (ID) | B (Name) | C (Phone) | D (Job) | E (Active) | F (WhatsApp) | G (Experience) | H (Photo) |
|--------|----------|-----------|---------|------------|--------------|----------------|-----------|
| ID     | Name     | Phone     | Job     | Active     | WhatsApp     | Experience     | Photo     |

- **ID** — Will be auto-generated when you add workers from admin
- **Phone** — 10 digits only, no +91 (e.g., `9876543210`)
- **Active** — `Yes` or `No`
- **WhatsApp** — `Yes` or `No`
- **Experience** — years, shown as "5+ years". Empty means 5. To fill 5 for every existing worker: `node --env-file=.env scripts/set-default-experience.js`
- **Photo** — optional Google Drive link to the worker's photo. Empty means the coloured initials are shown.
  1. Upload the photo to Google Drive
  2. Right-click it → **Share** → General access: **Anyone with the link** (Viewer)
  3. **Copy link** and paste it into the "Photo link" box in admin (Add or Edit worker)

#### Tab 2: "Jobs"
Create a second tab named exactly **Jobs** and add this header in Row 1:

| A (JobName) |
|-------------|
| JobName     |

Then add your starting jobs in rows 2–6:
```
Electrician
Plumber
AC Technician
Painter
Carpenter
```

#### Tab 3: "Events" (created automatically)
The app creates this tab the first time a customer visits. It logs visits, category taps,
"Show number", Call and WhatsApp taps for the admin **Analytics** tab. You don't need to touch it.

#### Share the Sheet with the Service Account
1. Click the **Share** button (top-right of the sheet)
2. Paste this email: `worker-app@yogeshwar-worker-app.iam.gserviceaccount.com`
3. Set permission to **Editor**
4. Uncheck "Notify people" and click Share

---

### Step 2: Google Cloud Project (Already Done)

You already have:
- Project: `yogeshwar-worker-app`
- Service Account: `worker-app@yogeshwar-worker-app.iam.gserviceaccount.com`
- Sheets API enabled

> ⚠️ **IMPORTANT**: If you shared your private key publicly, go to  
> [Google Cloud Console → IAM → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts)  
> → Click your service account → Keys tab → **Delete the old key** → **Create a new key** (JSON)

---

### Step 3: Choose an Admin Password

Pick a strong password for the admin page. Example: `MyShop@2024!`  
You'll set this as the `ADMIN_PASSWORD` environment variable in Vercel.

---

### Step 4: Push Code to GitHub

Open a terminal in the `yogeshwar` folder and run:

```bash
git add .
git commit -m "Initial commit - worker directory app"
git branch -M main
git push -u origin main
```

If you haven't set up the remote yet:
```bash
git remote add origin https://github.com/mayurvij22/local-worker-finder.git
git push -u origin main
```

---

### Step 5: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New" → Project**
3. Select the **local-worker-finder** repository
4. Leave all settings as default (Framework: Other)
5. Before clicking Deploy, add **Environment Variables**:

| Variable Name | Value |
|---|---|
| `GOOGLE_SHEET_ID` | `16mu-7q9hQK1JxuhOlap7MgSAE82ZnrWIu3oEeKyKAV8` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `worker-app@yogeshwar-worker-app.iam.gserviceaccount.com` |
| `GOOGLE_PRIVATE_KEY` | *(see below)* |
| `ADMIN_PASSWORD` | Your chosen password (e.g., `MyShop@2024!`) |

#### How to paste the Private Key in Vercel:
1. Open your downloaded JSON key file
2. Copy the entire `private_key` value (including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`)
3. In Vercel's environment variable input, paste it directly
4. Vercel handles the `\n` characters automatically

> 💡 **Tip**: If you get auth errors after deploying, try wrapping the key in double quotes when pasting, or replace all `\n` with actual line breaks.

6. Click **Deploy**

---

### Step 6: Generate a QR Code

After deployment, Vercel gives you a URL like `https://your-app.vercel.app`.

1. Go to [qr-code-generator.com](https://www.qr-code-generator.com/) or any QR tool
2. Enter your Vercel URL (e.g., `https://local-worker-finder.vercel.app`)
3. Download and print the QR code
4. Place it at your shop counter!

---

## ✅ How to Test After Deployment

### Test the Customer Page
1. Open `https://your-app.vercel.app` on your phone
2. You should see the shop name and job filter buttons
3. Toggle Hindi/English with the language button
4. If you've added workers, tap "Show Number" to see the phone number
5. Tap "Call" or "WhatsApp" to verify links work

### Test the Admin Page
1. Open `https://your-app.vercel.app/admin.html`
2. Log in with your admin password
3. **Add a worker**: Fill in name, phone (10 digits), select job, check WhatsApp if applicable
4. **Edit a worker**: Click ✏️ Edit, modify details, save
5. **Delete a worker**: Click 🗑️, confirm deletion
6. Switch to the **Jobs** tab to add/remove job categories
7. Go back to the customer page to verify your changes appear

### Test Rate Limiting
1. On the customer page, rapidly click "Show Number" on different workers
2. After ~10 clicks in a minute, you should see a "Too many requests" message

### Test the API Directly
Open these URLs in your browser:
- `https://your-app.vercel.app/api/workers` → Should show workers (no phone numbers)
- `https://your-app.vercel.app/api/jobs` → Should show job categories
- `https://your-app.vercel.app/api/number?id=INVALID` → Should show "Worker not found"

---

## 🔒 Security Notes

- ✅ Phone numbers are **never** sent in bulk — only one at a time via `/api/number`
- ✅ `/api/number` is rate-limited (10/minute, 30/day per IP)
- ✅ Admin password is checked **server-side** on every request
- ✅ All user data is rendered with `textContent` (no XSS risk)
- ✅ Service account key is only in Vercel env variables, never in code
- ✅ Worker list in browser cache contains **no phone numbers**

---

## 📝 Daily Usage

### Adding a new worker
1. Open `/admin.html` → Login
2. Fill in name, phone, job → Click "Add Worker"
3. The worker appears on the customer page within ~60 seconds (cache refresh)

### Hiding a worker temporarily
1. Admin → Edit the worker → Uncheck "Active" → Save
2. They won't show up on the customer page, but their data is preserved

### Adding a new job category
1. Admin → Jobs tab → Type the name → Click "Add"
2. Now it appears in the job dropdown and customer page filters
3. Customers can search for it by its name. To also find it by everyday words (e.g. "leak", "पंखा") or its Hindi/Marathi name, add them in `JOB_KEYWORDS` / `JOB_HI` / `JOB_MR` in `public/js/customer/i18n.js`

### Customer search
The search box matches the worker's name **and** the kind of work, in English, Hindi and Marathi ("plumber", "नळ", "wiring", "पंखा", "AC"). Small typos are fine ("plumbr"), and filler words like "repair" or "near me" are ignored. Category tiles show how many workers match the current search. The chosen category and search are kept in the page link (`?job=Plumber&q=leak`), so a filtered list can be shared.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| "Failed to load workers" | Check that the sheet is shared with the service account email as **Editor** |
| Auth/permission errors | Verify `GOOGLE_PRIVATE_KEY` is correct in Vercel env vars. Redeploy after changes. |
| Workers don't appear | Make sure the Workers tab has the header row: `ID, Name, Phone, Job, Active, WhatsApp, Experience, Photo` |
| Photo not showing (initials instead) | The Drive file must be shared as **Anyone with the link**. Open the link in a private window to check. |
| Admin login fails | Check `ADMIN_PASSWORD` env variable in Vercel matches what you're typing |
| Changes not showing | The cache refreshes every 60 seconds. Wait or open in incognito. |
| "Too many requests" | Rate limit hit. Wait 1 minute (or 24 hours for daily limit). |
