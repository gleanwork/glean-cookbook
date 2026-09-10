# GitHub review requests in Claude Code

Registers Glean Triggers and delivers their events into Claude Code. A local receiver verifies
Standard Webhooks signatures, rejects stale timestamps, deduplicates retries by `webhook-id`, and
appends accepted events to a queue. A plugin monitor streams that queue into an interactive session,
where the skill reviews the real local diff and prepares a draft.

It never submits a GitHub review automatically.

For the API concepts and endpoint contract, see the [Triggers guide](https://developers.glean.com/guides/triggers/overview)
and the [Triggers API reference](https://developers.glean.com/api/platform-api/triggers-overview).

## The bridge is datasource-agnostic

The receiver, queue, and stream do not know what a pull request is. Which datasource to watch and
which presets to register are configuration:

```bash
GLEAN_TRIGGER_DATASOURCE=github
GLEAN_TRIGGER_PRESET_IDS=
```

Leave the ids empty and `npm run setup` prints the presets your deployment serves, then refuses
rather than guessing. Matching by display name is a trap — names are tenant text, and a near-miss
registers the wrong event and shows up only as an event that never arrives.

Point the same code at Gong, Gmail, or calendar presets by changing those two lines. What is
GitHub-specific lives in `skills/review-trigger/SKILL.md`.

## Local verification

```bash
npx -y tiged@2.12.8 gleanwork/glean-cookbook/recipes/github-pr-review-monitor github-pr-review-monitor
cd github-pr-review-monitor
npm run verify:fixture
```

No network, no credentials. Checks signature verification, the replay window, deduplication across a
restart, the stream's one-line-per-event contract, both preset refusals, and that the draft path
carries no submit field.

## Live setup

1. Copy `.env.example` to `.env`.
2. Authenticate with a token that includes `TRIGGERS`. A token limited to
   `SEARCH` and `CHAT` cannot read presets or register triggers and receives
   `403 insufficient_permissions`.
   - OAuth: `npm run login -- --email "you@company.com"`. The login requests
     `TRIGGERS` and stops if the token response explicitly omits it.
   - Token-first tenant: set `GLEAN_SERVER_URL` and a user-scoped
     `GLEAN_API_TOKEN` with `TRIGGERS` in `.env`, and skip login.
3. Install `cloudflared` if you do not already have a public HTTPS endpoint.
   Follow the [Cloudflare package instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/),
   or run `brew install cloudflared` on macOS.
4. `npm start`, then expose `http://127.0.0.1:8787` over HTTPS and put `<public-url>/webhook` in
   `GLEAN_WEBHOOK_URL`. The receiver starts unready and picks up the secrets as soon as setup runs.
5. `npm run setup`. Registration is all-or-none — a partial set looks like it worked and misses the
   events it did not cover.
6. `claude plugin validate . --strict`, then `claude --plugin-dir .` from the repository you review.

The login flow discovers your tenant from the work email and writes the normalized API backend
(`https://<instance>-be.glean.com`) to `.env`; you do not need to find or paste the backend host
manually. Discovery can return a legacy frontend URL such as `*.askscio.com`, which the resolver
converts before making API calls.

Monitors start at session start, so **installing the plugin needs a session restart** —
`/reload-plugins` does not pick them up.

## When nothing arrives

`npm run doctor` walks the whole path and names the broken link: configuration, the local
receiver, the public URL, whether each trigger still points at the current `GLEAN_WEBHOOK_URL`,
whether the token can call the `TRIGGERS` API, and whether the GitHub CLI is signed in. It probes the
Triggers API even before setup. If the API is reachable but this checkout has no trigger IDs, doctor
tells you setup has not run yet; a `403 insufficient_permissions` instead tells you the token needs
the `TRIGGERS` scope. A running `cloudflared` is not a working tunnel — it stays alive retrying after
Cloudflare withdraws its hostname, so check the path, not the process.

```bash
npm run doctor
npm run preview         # what Glean has matched, and what predates its trigger
npm run triggers         # every trigger on the tenant, yours marked
npm run repoint          # after the tunnel rotates: same triggers, same secrets, new URL
```

`preview` answers the question a silent webhook cannot: whether Glean matched nothing, or
matched something that never reached you. Delivery only fires **forward** from a trigger's
creation, so a match older than its trigger is listed and will never arrive.

Quick-tunnel URLs rotate. `npm run repoint` PATCHes the existing triggers instead of recreating
them, which matters because signing secrets are issued once — recreating means new secrets, while
re-pointing keeps the ones already in `.env`.

`npm run triggers -- --delete <trigger_id>` also removes that trigger's aligned local secret. If the
trigger was already deleted elsewhere, rerun the command to clear the stale local state. The running
receiver reloads file-backed secrets automatically. If IDs or secrets are exported in your shell,
unset them before setup; a child process cannot update its parent shell.

## Getting events into the session

`monitors/monitors.json` declares one command, which Claude Code runs in the background and turns
into one transcript message per stdout line. If no event reaches the transcript, run the same script
yourself:

```bash
npm run stream           # exactly what the monitor runs
```

Paste a stream line into the session and the skill treats it as it would a monitor notification.

The fallback exists because the Monitor tool is unavailable on Bedrock, Agent Platform, and Foundry,
when `DISABLE_TELEMETRY` or `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` is set, and outside an
interactive CLI. Plugin monitors are **skipped silently** there — which is why the step is "confirm
an event arrives", not "assume it did". A quiet task panel is not a health check either: the stream
emits a heartbeat when idle, so live-but-quiet and dead look different.

## Human review boundary

The skill writes a local Markdown draft first. Only after you approve moving it to GitHub:

```bash
npm run draft -- --pr https://github.com/OWNER/REPO/pull/123 --body .glean/reviews/OWNER-REPO-123.md
```

That creates or updates your **pending** review. It does not submit, approve, or request changes —
the payload carries a body and nothing else, and the gate asserts that rather than trusting everyone
to remember it.

`.data/` holds the queue, seen-id log, and monitor cursor. They survive restarts by design, which is
what stops a retry from drafting twice.
