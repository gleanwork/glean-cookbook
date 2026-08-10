# customer-360

Customer 360 — one account workspace built from whatever your instance already
knows about that customer. It keeps a grounded assistant above the fold beside
compact evidence sections and deterministic source-coverage counts. Built two ways:

- **[`platform-search-chat/`](platform-search-chat/)** — parallel Platform Search tiles plus
  Client Chat synthesis.
- **[`platform-agents/`](platform-agents/)** — same page UX; journey / saved prompts /
  follow-ups via `glean.agents.createRun`.

Point both paths at an account with `GLEAN_ACCOUNT_NAME` and a backend with
`GLEAN_SERVER_URL`. Displayed facts come from cited synthesis or deterministic
Search result counts. Auth is the caller's own credential; there is no act-as.

See the full recipe at
[developers.glean.com/cookbook/customer-360](https://developers.glean.com/cookbook/customer-360)
(flag-gated pre-launch) or `docs/cookbook/customer-360.mdx` in
[glean-developer-site](https://github.com/gleanwork/glean-developer-site).

Spec lock: [`SPEC-LOCK.md`](SPEC-LOCK.md). Acceptance map: [`ACCEPTANCE-MAP.md`](ACCEPTANCE-MAP.md).
