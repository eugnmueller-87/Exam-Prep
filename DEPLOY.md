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

For travel you need a public URL that works without your PC. This repo includes
a **Render Blueprint** (`render.yaml`) that does this for free.

### Steps (one-time, ~5 min — needs your Render login)

1. Go to <https://render.com> and sign up / log in (free, GitHub login works).
2. Click **New → Blueprint**.
3. Connect your GitHub and select the **`eugnmueller-87/Exam-Prep`** repo.
4. Render reads `render.yaml`, shows the service `ab100-exam-prep`, and you
   click **Apply**.
5. Wait for the first build (~2–3 min). You'll get a permanent URL like:

   ```
   https://ab100-exam-prep.onrender.com
   ```

6. Open that on your iPad from anywhere. Optionally **Add to Home Screen** in
   Safari — the included web-app meta tags make it open full-screen like a
   native app.

### Notes

- **Auto-deploy:** every push to `main` redeploys automatically.
- **Quiz history** is stored in SQLite on a 1 GB persistent disk (`DATABASE_PATH`
  points at the mounted disk), so your stats survive restarts and redeploys.
- **Free-tier sleep:** the free service spins down after ~15 min idle and takes
  ~30 s to wake on the next request. Fine for personal study use. Upgrade to a
  paid instance if you want it always-on.

### Alternative hosts

The app is a standard Node web service (`npm run build` → `npm start`, respects
`PORT`), so it also runs on Railway, Fly.io, or any Node host. Set
`DATABASE_PATH` to a writable/persistent location if you want stats to persist.

---

## 3. Quality checks (run before pushing)

```bash
npm run check        # typecheck + lint + format check (same as CI)
npm run lint:fix     # auto-fix lint issues
npm run format       # auto-format with Prettier
```

GitHub Actions runs `typecheck → lint → format:check → build` on every push and
PR to `main` (see `.github/workflows/ci.yml`).
