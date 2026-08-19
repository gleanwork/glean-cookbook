# GitHub review requests in Claude Code

Registers Glean Triggers and delivers their events into Claude Code. A local receiver verifies
Standard Webhooks signatures, rejects stale timestamps, deduplicates retries by `webhook-id`, and
appends accepted events to a queue. A plugin monitor streams that queue into an interactive session,
where the skill reviews the real local diff and prepares a draft.

It never submits a GitHub review automatically.

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
npm run verify:fixture
```

No network, no credentials. Checks signature verification, the replay window, deduplication across a
restart, the stream's one-line-per-event contract, both preset refusals, and that the draft path
carries no submit field.

## Live setup

1. Copy `.env.example` to `.env`.
2. `npm run login -- --email "you@company.com"`.
3. `npm start`, then expose `http://127.0.0.1:8787` over HTTPS and put `<public-url>/webhook` in
   `GLEAN_WEBHOOK_URL`. The receiver starts unready and picks up the secrets as soon as setup runs.
4. `npm run setup`. Registration is all-or-none — a partial set looks like it worked and misses the
   events it did not cover.
5. `claude plugin validate . --strict`, then `claude --plugin-dir .` from the repository you review.

Monitors start at session start, so **installing the plugin needs a session restart** —
`/reload-plugins` does not pick them up.

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
