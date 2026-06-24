# Deployment & Usage Guide

This app is an Express + React single-server app. The server serves both the API
and the built frontend on one port, so deployment is simple: build, then start.

---

## 1. Run locally (same Wi-Fi as your iPad)

Use this when your PC and iPad are on the **same network** (e.g. at home).

```bash
npm install
npm run build
npm start            # serves on http://localhost:5000
```

To pick a different port (e.g. if 5000 is taken) and expose it to your iPad:

```bash
# PowerShell
$env:PORT=5173; npm start

# Git Bash / macOS / Linux
PORT=5173 npm start
```

Then on the iPad's browser, open:

```
http://<your-PC-LAN-IP>:5173
```

Find your PC's LAN IP with `ipconfig` (look for "IPv4 Address", e.g.
`192.168.178.51`). The server binds to `0.0.0.0`, so any device on the same
network can reach it.

> **Windows firewall:** the first time you run it, Windows may ask to allow
> Node.js through the firewall — choose **Allow** for private networks so the
> iPad can connect.

---

## 2. Public deploy (use the iPad anywhere — including while travelling)

For travel you need a public URL that works without your PC. This repo is
configured for **Railway** (recommended) and **Render** (alternative).

### Option A — Railway (recommended)

Railway has no forced idle-sleep and supports a persistent volume even on the
trial, so your quiz history survives restarts. Config files: `railway.json`,
`nixpacks.toml`, `.node-version` (all pin Node 24, required by `node:sqlite`).

**Steps (one-time, ~3 min — needs your Railway login):**

1. Go to <https://railway.app> and log in.
2. **New Project → Deploy from GitHub repo → `eugnmueller-87/Exam-Prep`**.
3. Railway reads `railway.json` + `nixpacks.toml` and builds automatically
   (`npm ci` → `npm run build` → `npm start`). No env vars are required —
   `PORT` is injected by Railway and the app reads it.
4. When the deploy is green, open the service → **Settings → Networking →
   Generate Domain**. You'll get a public URL like:

   ```
   https://exam-prep-production.up.railway.app
   ```

5. **(Optional, for permanent quiz history)** Add a volume:
   - Service → **Variables** → add `DATABASE_PATH = /data/data.db`
   - Service → **Settings → Volumes** → **New Volume**, mount path `/data`.
     Now your scores persist across restarts and redeploys.

6. Open the URL on your iPad from anywhere. Optionally **Add to Home Screen** in
   Safari — the web-app meta tags make it open full-screen like a native app.

**Auto-deploy:** every push to `main` redeploys automatically.

> Without the optional volume, the SQLite file is ephemeral: the 227-question
> bank always re-seeds on startup (quiz works fine), but personal score history
> resets when the container restarts.

### Option B — Render (alternative, free)

This repo also includes a **Render Blueprint** (`render.yaml`).

1. Go to <https://render.com> and log in.
2. **New → Blueprint** → connect GitHub → select **`eugnmueller-87/Exam-Prep`**.
3. Render reads `render.yaml`, shows service `ab100-exam-prep` → **Apply**.
4. ~2–3 min later you get a URL like `https://ab100-exam-prep.onrender.com`.

Notes for Render free tier:

- No persistent disk on free (`DATABASE_PATH=/tmp/data.db`) — questions re-seed
  on startup; score history resets on restart. For permanent history, upgrade to
  the **starter** plan and uncomment the `disk:` block in `render.yaml`.
- Free instances sleep after ~15 min idle (~30 s cold start on next request).

### Any other Node host

The app is a standard Node web service (`npm run build` → `npm start`, respects
`PORT`), so it runs on Fly.io or any Node ≥ 22.5 host. Set `DATABASE_PATH` to a
writable/persistent location if you want stats to persist.

---

## 3. Quality checks (run before pushing)

```bash
npm run check        # typecheck + lint + format check (same as CI)
npm run lint:fix     # auto-fix lint issues
npm run format       # auto-format with Prettier
```

GitHub Actions runs `typecheck → lint → format:check → build` on every push and
PR to `main` (see `.github/workflows/ci.yml`).
