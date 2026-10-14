# In-app “update apps” button — design note

The launcher already has a refresh button that re-fetches `apps.json`. What it
cannot do is run the GitHub Actions workflow that regenerates `apps.json`.

## Why not a button in the launcher itself

To trigger the workflow from the browser, the launcher would need to call the
GitHub Actions dispatch API:

- `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`
- requires authentication with `repo` scope (or Actions write permission)

That means the launcher page would need a GitHub token with write access to the
repo. Putting that token in `app.js` or any page asset would expose it to
anyone who loads the launcher, which is the opposite of safe.

So a purely client-side “run workflow” button is not a good fit unless there is
a separate, scoped backend involved.

## Safer alternatives

1. **Keep the manual run.**
   - Works now.
   - No new code, no new secrets.
   - The refresh button still helps after the workflow runs.

2. **One small backend endpoint that runs the dispatch.**
   - A tiny service holds the token and exposes `/api/update-apps`.
   - The launcher calls that endpoint; the backend talks to GitHub.
   - Still requires a secret, but it is not embedded in the page.

3. **Let GitHub handle freshness another way.**
   - The workflow already runs on a schedule.
   - For many teams, daily + manual run is enough.

## What the launcher already does

- Refresh button refetches `apps.json` from the live site.
- The scheduled workflow updates `apps.json` for you.
- The launcher ignores its own repo, so it does not list itself.

## Recommendation

Do not add a workflow-dispatch button to the launcher unless you also add a
small protected backend to hold the token. If you want the button, the next
question is where that backend lives and who can call it.
