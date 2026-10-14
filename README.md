# App Launcher

A **self-updating dashboard** of every GitHub Pages app on your account.
No manual lists, no README edits: a scheduled GitHub Action discovers your
deployed apps by itself, and the dashboard renders them as cards.

## How it works

- A workflow (`.github/workflows/update-apps.yml`) runs **daily** (and on
  demand). It lists your public non-fork repos, probes each
  `https://<you>.github.io/<repo>/` URL, and for live sites scrapes the
  app's real `<title>`, description, and PWA icon.
- Results are written to `apps.json` and committed. The dashboard page
  renders cards from that file — with search (press `/`) and app icons.
- **Adding an app = deploying it, as usual.** It appears here automatically
  within a day — or immediately via *Actions → Update app list → Run
  workflow*. You never edit anything by hand.

## Setup (one time)

1. Create a new GitHub repository (e.g. `app-launcher`) and push this
   folder's contents to it — including `tools/`, `icons/`,
   `.github/workflows/`, and `manifest.webmanifest`.
2. **Settings → Pages → Source: Deploy from a branch** → `main` + `/ (root)`.
3. **Settings → Actions → General → Workflow permissions** → select
   **Read and write permissions** (lets the action commit `apps.json`).
4. Open the **Actions** tab → **Update app list** → **Run workflow**. This
   generates `apps.json` immediately (the first daily run would too, but
   why wait).
5. Visit `https://<username>.github.io/app-launcher/` — done. Install it to
   your home screen just like the PDF merger; set it as your browser start
   page and your apps are one click away.

## Run locally (on your laptop)

The dashboard is a plain static site, but it **must be served over HTTP** —
opening `index.html` directly (`file://`) blocks the `fetch("apps.json")` and
the service worker, so you'd just see an empty page.

From this folder, in any terminal (PowerShell, Git Bash, or cmd):

```bash
git pull                                  # 1. get the latest apps.json from the workflow
python -m http.server 8000                # 2. serve this folder  (or: npx --yes serve -l 8000)
# 3. open http://localhost:8000 in your browser
```

No Python? `npx --yes serve -l 8000` does the same job. Stop the server with
`Ctrl+C`.

Want to regenerate the app list locally instead of waiting for the daily
action (needs Node 18+):

```bash
node tools/update-apps.js ezshap-rgb      # rebuilds apps.json from your live Pages sites
```

Then serve and open it as above. Remember not to commit that local
`apps.json` — on GitHub the workflow owns and commits that file.

## Notes

- Discovers **public** repos. Forks are skipped (set `INCLUDE_FORKS=1` in
  the workflow's discover step to include them). Private-repo Pages sites
  would need a PAT stored as a repo secret — a later upgrade if needed.
- The launcher ignores its own repo, so it never lists itself.
- Display name, description and icon come from each app itself: its
  `<title>`, `og:description`/`<meta name=description>` (falling back to the
  repo description), and its `apple-touch-icon` / manifest icon. Apps
  without an icon get a colored letter tile.
- To give an app a specific icon, drop an image named after its repo into
  [`icons/apps/`](icons/apps/) (see the README there). A file in that folder
  overrides whatever the app's own page advertises, and works for apps that
  ship no icon at all. No code change needed — the next run picks it up.
- Change the schedule by editing the `cron:` line in the workflow.
- `apps.json` is fetched network-first by the service worker, so the
  dashboard refreshes whenever you open it online.
