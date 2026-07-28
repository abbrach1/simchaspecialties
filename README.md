# Camp Simcha — Specialty Coverage Planner

A single-page tool for the Specialty Division. Pick a time slot and instantly
see which staff are **free** to cover a special activity — it cross-references
the day's schedule against your specialty roster, so anyone already assigned to
a workshop that's running in that slot is marked **busy** and left out.

The app itself is one static file (`index.html`) that runs in the browser and
saves your rosters and schedules locally — and, when Firebase is turned on,
syncs them to a shared cloud copy so every device sees the same data in real
time. There is one optional serverless function (`api/parse-schedule.js`) that
lets you **read a photo of the schedule** and have it filled in automatically.

## What's inside

- **Coverage Finder** — pick a time slot → see Free / Standing-crew / Busy staff,
  plus the special activities that need covering.
- **Day Schedule** — a fully editable grid: name the day, add/remove periods,
  add/rename/remove group columns, and type activities into each cell with
  autocomplete from the roster. Or **📷 Upload photo** to have the schedule read
  from a picture (see below).
- **Roster** — per-session staff lists. Add or remove people on the fly, add new
  workshops, and keep separate **sessions** (create / rename / duplicate / delete)
  so each camp session or year has its own roster.
- **Attendance & follow-ups** — in the Finder's Busy list, mark each assigned
  person **✓ Came / ✗ No-show** and add a **✎ note**. Anyone flagged no-show or
  noted collects on the **Follow-ups** tab (grouped by day, with a live count
  badge) so you can follow up and **Resolve** each one.

## Deploy to Vercel

This is a static site, so it deploys with zero configuration.

### Option A — connect the repo (recommended)

1. Go to [vercel.com/new](https://vercel.com/new) and sign in with GitHub.
2. **Import** the `abbrach1/simchaspecialties` repository.
3. Leave every setting at its default:
   - **Framework Preset:** Other
   - **Build Command:** _(empty)_
   - **Output Directory:** _(empty / root)_
4. Click **Deploy**. You'll get a live URL like `simchaspecialties.vercel.app`.

Every push to the branch redeploys automatically. To serve from `main`, merge
this branch first, or set the branch as the Production Branch in the Vercel
project's **Settings → Git**.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel          # first run links/creates the project (preview deploy)
vercel --prod   # promote to the production URL
```

## Reading the schedule from a photo (optional)

The **📷 Upload photo** button on the Schedule tab sends the picture to a
serverless function that uses Claude's vision to fill in the grid. It then drops
you into edit mode so you can eyeball it and fix any misread cell before using it.

To turn it on, add one environment variable to the Vercel project:

1. Vercel project → **Settings → Environment Variables**.
2. Add **`ANTHROPIC_API_KEY`** = your key from
   [console.anthropic.com](https://console.anthropic.com) (Production scope).
3. **Redeploy** (Deployments → latest → ⋯ → Redeploy).

Optional: set **`PARSE_MODEL`** to change the model (defaults to `claude-sonnet-4-6`).

Notes:
- Each photo read costs a fraction of a cent against your Anthropic account.
- The key lives only on the server (the function), never in the browser.
- This feature only works on the deployed site — opening `index.html` as a local
  file has no server to call. Manual entry works everywhere.

## Shared data across devices (Firebase)

By default the app stores data in each browser's local storage. With Firebase
turned on, the roster and schedule live in one shared cloud document, so every
device that opens the site sees the same thing and edits sync in real time. A
small dot in the top bar shows the status: **Synced**, **Saving…**, **Local
only**, or a rules/permission warning.

The Firebase config is already embedded in `index.html` (it's a public project
identifier, safe to ship — not a secret). You just need to switch on the
database and set access rules:

1. [Firebase console](https://console.firebase.google.com) → project
   **specialties-1a716** → **Build → Firestore Database → Create database**.
2. Choose a location and create it.
3. Open the **Rules** tab, paste the rules below, and **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /appState/{docId} {
         allow read, write: if true;
       }
     }
   }
   ```

4. Reload the site — the dot should turn green (**Synced**).

**Access note:** these rules let anyone who has the site URL read and write the
shared data (there's no login). For an internal tool on an unlisted URL that's
usually fine. If you want it locked down (a shared passcode, or real logins),
that's a straightforward follow-up — ask and it can be added.

## Local preview

Just open `index.html` in any browser — or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Notes

- Data lives in `localStorage`, which is **per browser / per device**. To move a
  day between devices, use **Schedule → ⋯ Backup, share, or reset → Copy current
  day as code**, then paste the code and **Load day** on the other device.
- No analytics, no fonts or assets loaded from a CDN. The only network request
  the page ever makes is when you press **📷 Upload photo** (to your own
  serverless function). Everything else is local.
