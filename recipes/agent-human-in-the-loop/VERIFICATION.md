# Verification record

This file separates local evidence from publication and live verification. No
agent, connected account, Slack message, or remote run is created by local tests.
Do not set `lastVerified` from these tests or from the illustrative preview.

## Local gates

Run `npm run check` for TypeScript, unit/HTTP tests, and the browser build. Run
`npm run test:browser` after installing Chromium with the documented Playwright
command. The raw-curl test executes the README's commands without command rewriting,
against a local synthetic HTTP endpoint. Only documented input values are filled.
This does not replace a cold run against Glean.

Record the exact tested source revision, commands, results, and limitations in the
review handoff. For uncommitted work, record the base revision and reviewed diff.

## Local implementation evidence — 2026-09-17

Source: base `363c49dd858e215c8673041549f347133c00286f` plus the uncommitted
HITL recipe, registry entry, and verification tests in this working tree. This is
local review evidence, not a deployed or released revision.

| Local gate                                                     | Result                                                                                                                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fresh-directory `npm ci` and `npm run check`                   | PASS: 16 unit/HTTP/raw-curl tests, TypeScript, and browser compilation                                                                                                 |
| `npm run test:browser` with fixture screenshot capture enabled | PASS: 12 checks, including creation consent, two pauses, retry, 409 refresh, reconnect, cancellation, polling budget, run identity, inert tool text, and mobile layout |
| Repository `pnpm test` through mise                            | PASS: repository tests, standalone package checks, artifact freshness, and execution contracts                                                                         |
| Registry, command, snippet, and MDX checks                     | PASS: 23 recipe records; authored shell commands retained                                                                                                              |
| Full `pnpm build` in a scratch copy                            | PASS: registry, artifacts, and plugin generation; no generated plugin changes retained here                                                                            |
| Internal preview skill inspection                              | PASS: all nine command blocks match source; code walkthrough matches the HTTP client                                                                                   |
| Visual inspection                                              | PASS: inspected the labeled local fixture preview; actual Agent Builder screenshots remain blocked below                                                               |

## Required live reader pass — BLOCKED until authorized

Use the actual deployed preview page from a fresh directory. Follow its printed
commands sequentially. Capture the cookbook revision, site snapshot/deployment,
and generated skill revision. Never repair a command invisibly while testing it.

| Gate                         | Evidence required                                                                                                                                          | Current status                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Agent setup                  | Actual Agent Builder configuration: autonomous chat trigger, connected posting tool, confirmation enabled, reviewed publication, agent ID                  | BLOCKED: no authorized agent/tool setup performed         |
| Curl start and pause         | Raw creation and GET responses, HTTP status, stable run ID, pending arguments matching the intended destination and unique marker; no post before approval | BLOCKED: no authorized live run                           |
| Approve and retry            | Complete reviewed batch, same-run continuation, final output, exactly one matching test post after the tested identical retry                              | BLOCKED: no authorization to post                         |
| Reject                       | Reviewed rejected invocation, resulting run output/state, and destination inspection showing no rejected post or alternate route                           | BLOCKED: requires separate live run                       |
| Reconnect                    | Close/reopen the client; GET retrieves the same run without a new creation POST                                                                            | BLOCKED: requires live run                                |
| Paused cancellation          | Explicit POST cancellation, final CANCELLED snapshot, no execution of the pending invocation                                                               | BLOCKED: requires authorization to cancel a test run      |
| Active cancellation          | Cancellation request and subsequent observed outcome; distinguish completion races and any external work still active                                      | BLOCKED: requires suitable authorized running test        |
| Second pause                 | Same run ID after acceptance, new interactions at a later pause, old decisions rejected with 409, new review and continuation                              | BLOCKED: configure and verify the two-post agent behavior |
| Complete batch and conflicts | Multiple pending interactions where available; incomplete, duplicate/conflicting, and stale decisions are rejected without unintended execution            | BLOCKED: requires controlled live scenarios               |
| Failure and access           | Actual HTTP failure distinct from run failure; authorized second identity or mismatched agent/run test returns 404                                         | BLOCKED: requires controlled test resources               |
| Generated surfaces           | Deployed preview and source-backed skill preserve commands, source code, and visuals                                                                       | BLOCKED: not merged or deployed                           |
| Setup screenshots            | Redacted screenshots of the actual supported Agent Builder path; schematic is not a substitute for live evidence                                           | BLOCKED: no live UI capture                               |

A terminal `SUCCEEDED` snapshot alone does not prove that a post happened. A terminal
snapshot also cannot prove that the run paused earlier. Record the observations at
the time they occur and inspect the actual external destination. Do not force a
tool error and assume the agent must become FAILED; the agent may handle the error.

## Repository live preflight

The repository module deliberately retrieves an **existing** paused run and does
not mutate it:

```bash
mise exec -- pnpm verify:recipe agent-human-in-the-loop --read-only
```

It requires `GLEAN_SERVER_URL`, `GLEAN_API_TOKEN`, `GLEAN_AGENT_ID`, and
`GLEAN_HITL_RUN_ID`. It checks live identity and pending-interaction structure. The
remaining scenarios report **BLOCKED** and exit nonzero, rather than treating a
read-only snapshot as proof of human review or external effects. Complete the
reader-pass table manually with authorized tools; this module is a preflight, not
an automated end-to-end certifier.

## Visual asset provenance

- `agent-setup.svg`, `api-sequence.svg`, and `lifecycle.svg` are authored schematics.
- `lifecycle-explorer.webp` is a screenshot of the real local UI with a synthetic
  response injected by the browser test. Its visible badge and metadata caption
  say it is illustrative, not a live run.
- An optional `HITL_PREVIEW_PNG` path enables the browser test's screenshot capture.
  Capturing this asset must never connect the tests to live credentials.

## Release and cleanup

Keep `visibility: preview` and omit `lastVerified` until the deployed-page and
live checks succeed. Merge and publication need explicit authorization. Use the
existing developer-site sync; do not hand-write a companion site page or PR.
After testing, explicitly cancel unwanted paused runs and remove identified test
posts only when authorized. Stopping the local app does neither.
