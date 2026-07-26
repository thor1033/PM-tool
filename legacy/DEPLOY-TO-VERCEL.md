# Atlas — real two-way team sync with a Vercel server + database

This replaces the flaky npoint setup with a proper backend running on **your own Vercel
project**. It gives you real read+write sync for a small team, with no third-party limits
and no CORS headaches.

You'll do three things:
1. Add a free Redis database to your Vercel project (Upstash, 1-click).
2. Redeploy Atlas (the API route is already in the project, in `api/workspace.js`).
3. In Atlas, click **"Use this site's server"** once. Done.

Total time: ~10 minutes.

---

## Step 1 — Add the database (Upstash via Vercel Marketplace)

1. Go to https://vercel.com and open your **atlas** project.
2. Click the **Storage** tab.
3. Click **Create Database** (or **Connect Store**).
4. Choose **Upstash → Redis** (it's free; the "KV" option also works — both are Redis).
5. Give it any name (e.g. `atlas-db`), pick a region near you, click **Create**.
6. When asked, **connect it to the `atlas` project** and **all environments**
   (Production, Preview, Development).

That connection automatically adds two environment variables to your project:
`KV_REST_API_URL` and `KV_REST_API_TOKEN`. The API route reads those.

> If your integration names them differently (e.g. `UPSTASH_REDIS_REST_URL` /
> `UPSTASH_REDIS_REST_TOKEN`), go to **Settings → Environment Variables** and add two
> more variables named exactly `KV_REST_API_URL` and `KV_REST_API_TOKEN` with the same
> values. The code looks for the `KV_REST_API_*` names.

---

## Step 2 — Redeploy Atlas with the API route

The project now contains `api/workspace.js` — Vercel automatically turns any file in an
`api/` folder into a serverless function. You just need to push the latest files.

From the folder where you deploy (e.g. `C:\Atlas`), make sure these are present:
`index.html`, `styles.css`, `components.css`, `print.css`, `vercel.json`,
`src/bundle.jsx`, and the **`api/workspace.js`** file.

Then redeploy:

```
cd C:\Atlas
vercel --prod
```

After it finishes, test the API in a browser:

```
https://atlas-wheat-mu.vercel.app/api/workspace
```

- You should see `{}` (empty workspace) or your JSON. ✅ The server + database work.
- If you see `{"error":"Storage not configured..."}` → the env vars aren't set; recheck Step 1.
- If you see a 404 → the `api/workspace.js` file wasn't included in the deploy.

---

## Step 3 — Connect Atlas to its own server

1. Open `https://atlas-wheat-mu.vercel.app`
2. **Backup & sync → Team sync**
3. If you previously set an npoint URL, click **Disconnect** first.
4. Click **"Use this site's server"**.
   - It connects to `/api/workspace` on this same site, pushes your current workspace,
     and shows a success note.
5. Turn on **"Keep this computer in sync"**.

That's it — you now have real two-way sync.

---

## Step 4 — Add your teammate

1. Send them the site URL: `https://atlas-wheat-mu.vercel.app`
2. They open it, go to **Backup & sync → Team sync**, click **"Use this site's server"**,
   and turn on **"Keep this computer in sync"**.
3. Done. You both read/write the same workspace.

Changes push within ~1-2 seconds and the other side pulls every ~10 seconds (a toast
confirms updates). It's near-real-time and uses last-write-wins (a conflict toast warns
you if two people edit at the exact same moment).

---

## Separate workspaces on one deployment (optional)

The API supports a `?room=NAME` parameter, so one Vercel deployment can host several
independent workspaces. If you ever want that, the URL in the sync field can be:

```
https://atlas-wheat-mu.vercel.app/api/workspace?room=teamA
```

Everyone using `room=teamA` shares one workspace; `room=teamB` is a separate one.

---

## What syncs and what doesn't

- **Syncs:** every project's data — tasks, members, business case, scope, risks, org
  chart, glossary, comms/change plans, milestones, KPIs.
- **Does NOT sync:** uploaded files (PDFs/images) — they live in each browser's local
  storage. Keep shared files on your shared drive (SharePoint/OneDrive/Drive) and paste
  the link in the **Product catalogue** (links DO sync).

## Updating Atlas later

Whenever the app files change, redeploy:

```
cd C:\Atlas
vercel --prod
```

Your URL and database stay the same; everyone gets the new version on next page load.
