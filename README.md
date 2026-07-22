# Camp Simcha — Specialty Coverage Planner

A single-page tool for the Specialty Division. Pick a time slot and instantly
see which staff are **free** to cover a special activity — it cross-references
the day's schedule against your specialty roster, so anyone already assigned to
a workshop that's running in that slot is marked **busy** and left out.

Everything runs in the browser. There is no backend and no build step — the
whole app is `index.html`, and it saves your rosters and schedules to the
browser's local storage on each device.

## What's inside

- **Coverage Finder** — pick a time slot → see Free / Standing-crew / Busy staff,
  plus the special activities that need covering.
- **Day Schedule** — a fully editable grid: name the day, add/remove periods,
  add/rename/remove group columns, and type activities into each cell with
  autocomplete from the roster.
- **Roster** — per-session staff lists. Add or remove people on the fly, add new
  workshops, and keep separate **sessions** (create / rename / duplicate / delete)
  so each camp session or year has its own roster.

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
- No analytics, no external requests, no fonts or assets loaded from a CDN.
